"""Run the production ASGI entry point against a disposable demo database."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4


class HttpContract(unittest.TestCase):
    def test_two_devices_and_private_monitor(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            import socket

            # Pass a bound socket to uvicorn so the OS reserves the ephemeral port.
            with socket.socket() as listener:
                listener.bind(("127.0.0.1", 0))
                base = f"http://127.0.0.1:{listener.getsockname()[1]}/api/"
                p = subprocess.Popen(
                    [
                        sys.executable,
                        "-m",
                        "uvicorn",
                        "main:app",
                        "--fd",
                        str(listener.fileno()),
                        "--no-access-log",
                    ],
                    pass_fds=(listener.fileno(),),
                    env={**os.environ, "PANICLOCK_DATA": directory},
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                try:
                    for _ in range(100):
                        try:
                            with urlopen(base + "health", timeout=0.2):
                                break
                        except (URLError, TimeoutError):
                            time.sleep(0.05)
                    else:
                        self.fail("API did not start")

                    def call(path: str, payload: dict | None = None, **headers: str):
                        req = Request(
                            base + path,
                            headers={
                                "X-PanicLock-Client": "demo",
                                "Content-Type": "application/json",
                                **headers,
                            },
                            data=(
                                None
                                if payload is None
                                else json.dumps(payload).encode()
                            ),
                        )
                        with urlopen(req, timeout=5) as r:
                            return r.headers, json.load(r)

                    with self.assertRaises(HTTPError) as denied:
                        call("soc")
                    self.assertEqual(denied.exception.code, 403)
                    receipts = []
                    for pin in ("1111", "9999"):
                        h, initial = call("session", {})
                        cookie = h["Set-Cookie"].split(";")[0]
                        self.assertEqual(initial["balance"], 1250000)
                        headers = {"Cookie": cookie, "Idempotency-Key": str(uuid4())}
                        payload = {
                            "pin": pin,
                            "amount": 500000,
                            "recipient": "+7 701 555 0142",
                        }
                        _, ticket = call("transfers", payload, **headers)
                        self.assertEqual(
                            call("transfers", payload, **headers)[1], ticket
                        )
                        self.assertEqual(
                            call("account", Cookie=cookie)[1],
                            {"balance": 750000, "receipts": [ticket]},
                        )
                        receipts.append(
                            {
                                k: v
                                for k, v in ticket.items()
                                if k not in ("created", "id")
                            }
                        )
                    self.assertEqual(receipts[0], receipts[1])
                    key = (Path(directory) / "judge.key").read_text()
                    _, monitor = call("soc", Authorization="Bearer " + key)
                    self.assertEqual(
                        (monitor["held"], monitor["credited"]), (500000, 500000)
                    )
                finally:
                    p.terminate()
                    p.wait(timeout=10)
