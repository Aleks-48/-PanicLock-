import hashlib
import secrets
import sqlite3
import time
from typing import Callable
from uuid import uuid4

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from store import initialize, transaction

hasher = PasswordHasher()
HOUR = 3600


class Rejected(Exception):
    def __init__(self, status: int, detail: str):
        self.status, self.detail = status, detail


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def matches(encoded: str, pin: str) -> bool:
    try:
        return hasher.verify(encoded, pin)
    except VerifyMismatchError:
        return False


def receipt(row: sqlite3.Row) -> dict:
    return {key: row[key] for key in ("id", "recipient", "amount", "created")}


def event(
    db: sqlite3.Connection, ref: str, kind: str, destination: str, now: int
) -> None:
    db.execute(
        "INSERT INTO events(payment,kind,destination,created) VALUES(?,?,?,?)",
        (ref, kind, destination, now),
    )


class Bank:
    def __init__(self, path: str, clock: Callable[[], float] = time.time):
        initialize(path)
        self.path, self.clock = path, clock

    def start(self) -> str:
        token = secrets.token_urlsafe(32)
        hashes = [hasher.hash(pin) for pin in ("1111", "9999")]
        with transaction(self.path, write=True) as db:
            db.execute(
                "INSERT INTO accounts(id,balance,normal_hash,duress_hash) VALUES(?,1250000,?,?)",
                (digest(token), *hashes),
            )
        return token

    def expire(self, db: sqlite3.Connection, now: int) -> None:
        for row in db.execute(
            "SELECT * FROM payments WHERE status='HELD' AND expires<=?", (now,)
        ).fetchall():
            db.execute("UPDATE payments SET status='RETURNED' WHERE id=?", (row["id"],))
            db.execute(
                "UPDATE accounts SET balance=balance+? WHERE id=?",
                (row["amount"], row["account"]),
            )
            event(db, row["id"], "RESERVE_RETURNED", "sender", now)

    def sweep(self) -> None:
        with transaction(self.path, write=True) as db:
            self.expire(db, int(self.clock()))

    def snapshot(self, token: str) -> dict:
        with transaction(self.path, write=True) as db:
            self.expire(db, int(self.clock()))
            account = digest(token)
            row = db.execute(
                "SELECT balance FROM accounts WHERE id=?", (account,)
            ).fetchone()
            if not row:
                raise Rejected(401, "Start a demo session")
            rows = db.execute(
                "SELECT * FROM payments WHERE account=? ORDER BY rowid DESC LIMIT 100",
                (account,),
            )
            return {"balance": row["balance"], "receipts": [receipt(r) for r in rows]}

    def transfer(
        self, token: str, key: str, digits: str, amount: int, pin: str
    ) -> dict:
        account = digest(token)
        target = digest(account + ":" + digits)
        with transaction(self.path, write=True) as db:
            now = int(self.clock())
            self.expire(db, now)
            user = db.execute(
                "SELECT * FROM accounts WHERE id=?", (account,)
            ).fetchone()
            if not user:
                raise Rejected(401, "Start a demo session")
            if user["retry_at"] > now:
                raise Rejected(429, "Try again in five minutes")
            normal = matches(user["normal_hash"], pin)
            panic = matches(user["duress_hash"], pin)
            if not (normal or panic):
                failures = (user["failures"] if not user["retry_at"] else 0) + 1
                db.execute(
                    "UPDATE accounts SET failures=?,retry_at=? WHERE id=?",
                    (failures, now + 300 if failures >= 5 else 0, account),
                )
            else:
                db.execute(
                    "UPDATE accounts SET failures=0,retry_at=0 WHERE id=?", (account,)
                )
                old = db.execute(
                    "SELECT * FROM payments WHERE account=? AND request_key=?",
                    (account, key),
                ).fetchone()
                if old:
                    if old["amount"] != amount or old["recipient_hash"] != target:
                        raise Rejected(409, "Request already used")
                    return receipt(old)
                if amount > user["balance"]:
                    raise Rejected(409, "Insufficient available funds")
                ref = "PL-" + uuid4().hex.upper()
                db.execute(
                    "UPDATE accounts SET balance=balance-? WHERE id=?",
                    (amount, account),
                )
                db.execute(
                    "INSERT INTO payments VALUES(?,?,?,?,?,?,?,?,?)",
                    (
                        ref,
                        account,
                        key,
                        target,
                        "•••• " + digits[-4:],
                        amount,
                        now,
                        "HELD" if panic else "SETTLED",
                        now + HOUR if panic else None,
                    ),
                )
                if panic:
                    event(db, ref, "HOLD_DURESS", "SOC", now)
                    event(db, ref, "MOCK_PUSH", "SOC inbox", now)
                    event(db, ref, "MOCK_SMS", "Trusted contact (demo)", now)
                else:
                    db.execute(
                        """INSERT INTO beneficiaries VALUES(?,?,?) ON CONFLICT(account,recipient_hash)
                                  DO UPDATE SET balance=balance+excluded.balance""",
                        (account, target, amount),
                    )
                    event(db, ref, "SETTLED", "Mock processor", now)
                return receipt(
                    db.execute("SELECT * FROM payments WHERE id=?", (ref,)).fetchone()
                )
        raise Rejected(401, "Incorrect PIN. Try again.")

    def handle_incident(
        self, ref: str, action: str, operator_hash: str, name: str
    ) -> None:
        with transaction(self.path, write=True) as db:
            now = int(self.clock())
            self.expire(db, now)
            payment = db.execute("SELECT * FROM payments WHERE id=?", (ref,)).fetchone()
            if not payment:
                raise Rejected(404, "Unknown incident")
            owner = db.execute(
                "SELECT * FROM assignments WHERE payment=?", (ref,)
            ).fetchone()
            if owner and owner["operator_hash"] != operator_hash:
                raise Rejected(409, "Another operator owns this incident")
            if payment["status"] != "HELD":
                if (
                    action == "cancel"
                    and owner
                    and db.execute(
                        "SELECT 1 FROM events WHERE payment=? AND kind='CANCELLED_REFUNDED'",
                        (ref,),
                    ).fetchone()
                ):
                    return
                raise Rejected(409, "This transfer is no longer held")
            if action == "claim":
                if not owner:
                    actor = f"{name} · {operator_hash[:6]}"
                    db.execute(
                        "INSERT INTO assignments VALUES(?,?,?)",
                        (ref, operator_hash, actor),
                    )
                    event(db, ref, "INCIDENT_CLAIMED", "SOC", now)
                return
            if not owner:
                raise Rejected(409, "Claim this incident first")
            db.execute("UPDATE payments SET status='RETURNED' WHERE id=?", (ref,))
            db.execute(
                "UPDATE accounts SET balance=balance+? WHERE id=?",
                (payment["amount"], payment["account"]),
            )
            event(db, ref, "CANCELLED_REFUNDED", "Sender account", now)

    def monitor(self, operator_hash: str = "") -> dict:
        with transaction(self.path, write=True) as db:
            self.expire(db, int(self.clock()))
            totals = db.execute(
                """SELECT coalesce(sum(CASE WHEN status='HELD' THEN amount END),0) held
                                   FROM payments"""
            ).fetchone()
            credited = db.execute(
                "SELECT coalesce(sum(balance),0) FROM beneficiaries"
            ).fetchone()[0]
            rows = db.execute(
                """SELECT e.seq,e.created,e.kind,e.destination,p.id,p.amount,p.expires,p.status,
                           CASE WHEN e.kind IN ('INCIDENT_CLAIMED','CANCELLED_REFUNDED') THEN a.actor
                                ELSE 'System' END actor
                                 FROM events e JOIN payments p ON p.id=e.payment LEFT JOIN assignments a ON a.payment=p.id ORDER BY e.seq DESC LIMIT 80"""
            )
            return {
                "held": totals["held"],
                "credited": credited,
                "incidents": [
                    dict(r)
                    for r in db.execute(
                        """SELECT p.id,p.amount,a.actor,a.operator_hash=? AS mine
                         FROM payments p LEFT JOIN assignments a ON a.payment=p.id
                         WHERE p.status='HELD' ORDER BY p.rowid DESC""",
                        (operator_hash,),
                    )
                ],
                "events": [dict(r) for r in rows],
            }
