"""One SQLite transaction covers each ledger mutation and its audit records."""

from contextlib import closing, contextmanager
import sqlite3
from typing import Iterator

SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts(
 id TEXT PRIMARY KEY, balance INTEGER NOT NULL CHECK(balance>=0),
 normal_hash TEXT NOT NULL, duress_hash TEXT NOT NULL,
 failures INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS payments(
 id TEXT PRIMARY KEY, account TEXT NOT NULL REFERENCES accounts(id),
 request_key TEXT NOT NULL, recipient_hash TEXT NOT NULL, recipient TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK(amount>0), created INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('SETTLED','HELD','RETURNED')), expires INTEGER,
 UNIQUE(account,request_key));
CREATE INDEX IF NOT EXISTS due ON payments(status,expires);
CREATE TABLE IF NOT EXISTS beneficiaries(
 account TEXT NOT NULL REFERENCES accounts(id), recipient_hash TEXT NOT NULL,
 balance INTEGER NOT NULL CHECK(balance>=0), PRIMARY KEY(account,recipient_hash));
CREATE TABLE IF NOT EXISTS events(
 seq INTEGER PRIMARY KEY, payment TEXT NOT NULL REFERENCES payments(id),
 kind TEXT NOT NULL, destination TEXT NOT NULL, created INTEGER NOT NULL);
"""


@contextmanager
def transaction(path: str, *, write: bool = False) -> Iterator[sqlite3.Connection]:
    with closing(sqlite3.connect(path, timeout=10)) as db:
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        with db:
            db.execute("BEGIN IMMEDIATE" if write else "BEGIN")
            yield db


def initialize(path: str) -> None:
    with closing(sqlite3.connect(path)) as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript(SCHEMA)
