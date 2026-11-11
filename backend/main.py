import asyncio
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator, Awaitable, Callable
import os
from pathlib import Path
import re
import secrets
from uuid import UUID

from fastapi import Cookie, FastAPI, Header, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, SecretStr

from banking import Bank, Rejected, digest
from typing import Literal

root = Path(os.getenv("PANICLOCK_DATA", "data"))
root.mkdir(parents=True, exist_ok=True)
bank = Bank(str(root / "bank.sqlite3"))
key_path = root / "judge.key"
if not key_path.exists():
    with os.fdopen(
        os.open(key_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), "w"
    ) as file:
        file.write(secrets.token_urlsafe(32))
operator = key_path.read_text().strip()


async def maintain() -> None:
    while True:
        await asyncio.to_thread(bank.sweep)
        await asyncio.sleep(5)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    task = asyncio.create_task(maintain())
    try:
        yield
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)


app = FastAPI(
    title="PanicLock sandbox", lifespan=lifespan, docs_url=None, redoc_url=None
)


class Payment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    recipient: str = Field(min_length=10, max_length=32)
    amount: int = Field(strict=True, ge=1, le=1250000)
    pin: SecretStr


@app.middleware("http")
async def no_cache(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    if request.method == "POST" and request.headers.get("x-paniclock-client") != "demo":
        return JSONResponse({"detail": "Invalid client"}, status_code=403)
    result = await call_next(request)
    result.headers["Cache-Control"] = "no-store"
    return result


@app.exception_handler(Rejected)
async def rejected(request: Request, exc: Rejected) -> JSONResponse:
    return JSONResponse({"detail": exc.detail}, status_code=exc.status)


@app.exception_handler(RequestValidationError)
async def invalid(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse({"detail": "Invalid payment details"}, status_code=422)


@app.post("/api/session")
def start(response: Response) -> dict:
    token = bank.start()
    response.set_cookie(
        "device",
        token,
        httponly=True,
        samesite="strict",
        path="/api",
        secure=os.getenv("PANICLOCK_HTTPS") == "1",
    )
    return bank.snapshot(token)


@app.get("/api/account")
def account(device: str = Cookie(default="")) -> dict:
    return bank.snapshot(device)


@app.post("/api/transfers")
def transfer(
    body: Payment, idempotency_key: UUID = Header(), device: str = Cookie(default="")
) -> dict:
    digits = re.sub(r"[+() -]", "", body.recipient)
    if not re.fullmatch(r"(?:[0-9]{10,11}|[0-9]{16})", digits) or not re.fullmatch(
        r"[0-9]{4}", body.pin.get_secret_value()
    ):
        raise HTTPException(422, "Invalid payment details")
    return bank.transfer(
        device, str(idempotency_key), digits, body.amount, body.pin.get_secret_value()
    )


def require_soc(authorization: str) -> None:
    if not secrets.compare_digest(
        authorization.encode(), ("Bearer " + operator).encode()
    ):
        raise HTTPException(403, "Operator key required")


class IncidentAction(BaseModel):
    action: Literal["claim", "cancel"]
    name: str = Field(min_length=1, max_length=48, pattern=r"^[^\x00-\x1f\x7f]+$")


@app.get("/api/soc")
def soc(
    authorization: str = Header(default=""), x_operator: str = Header(default="")
) -> dict:
    require_soc(authorization)
    return bank.monitor(digest(x_operator))


@app.post("/api/soc/incidents/{ref}")
def handle_incident(
    ref: str,
    body: IncidentAction,
    x_operator: UUID = Header(),
    authorization: str = Header(default=""),
) -> dict:
    require_soc(authorization)
    if not body.name.strip():
        raise HTTPException(422, "Enter your operator name")
    bank.handle_incident(ref, body.action, digest(str(x_operator)), body.name.strip())
    return {"ok": True}


@app.get("/api/health")
def health() -> dict[str, str]:
    bank.sweep()
    return {"status": "ready"}
