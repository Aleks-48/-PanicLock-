"""Integration tests against an actual SQLite ledger, with a controllable clock."""

from concurrent.futures import ThreadPoolExecutor
from tempfile import TemporaryDirectory
import unittest
from uuid import uuid4

from banking import Bank, Rejected


class Transfers(unittest.TestCase):
    def setUp(self) -> None:
        folder = TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.now = 1700000000
        self.bank = Bank(folder.name + "/ledger", lambda: self.now)
        self.token = self.bank.start()

    def send(self, pin: str, amount: int = 500000, key: str = "") -> dict:
        return self.bank.transfer(
            self.token, key or str(uuid4()), "77015550142", amount, pin
        )

    def test_public_receipts_and_account_are_equivalent(self) -> None:
        normal = self.send("1111")
        normal_view = self.bank.snapshot(self.token)
        self.token = self.bank.start()
        panic = self.send("9999")
        panic_view = self.bank.snapshot(self.token)
        for ticket in (normal, panic):
            self.assertEqual(set(ticket), {"id", "recipient", "amount", "created"})
        normal.pop("id")
        panic.pop("id")
        self.assertEqual(normal, panic)
        self.assertEqual(normal_view["balance"], panic_view["balance"])
        self.assertEqual(panic_view["balance"], 750000)
        soc = self.bank.monitor()
        self.assertEqual((soc["held"], soc["credited"]), (500000, 500000))
        self.assertEqual(
            [e["kind"] for e in soc["events"]],
            ["MOCK_SMS", "MOCK_PUSH", "HOLD_DURESS", "SETTLED"],
        )

    def test_hold_survives_restart_and_returns_once_at_deadline(self) -> None:
        key = str(uuid4())
        r = self.send("9999", key=key)
        self.bank = Bank(self.bank.path, lambda: self.now)
        self.now += 3599
        self.assertEqual(self.bank.monitor()["held"], 500000)
        with self.assertRaises(Rejected):
            self.send("1111", 750001)
        self.now += 1
        self.assertEqual(self.bank.snapshot(self.token)["balance"], 1250000)
        self.assertEqual(self.send("9999", key=key), r)
        self.bank.sweep()
        soc = self.bank.monitor()
        self.assertEqual((soc["credited"], soc["held"]), (0, 0))
        self.assertEqual(sum(e["kind"] == "RESERVE_RETURNED" for e in soc["events"]), 1)

    def test_retry_and_concurrency(self) -> None:
        key = str(uuid4())
        with ThreadPoolExecutor(2) as pool:
            a, b = pool.map(lambda _: self.send("9999", key=key), range(2))
        self.assertEqual(a, b)
        self.assertEqual(len(self.bank.monitor()["events"]), 3)
        with self.assertRaises(Rejected):
            self.send("9999", 5, key)

        def spend(_: int) -> int:
            try:
                self.send("1111", 750000)
                return 200
            except Rejected as exc:
                return exc.status

        with ThreadPoolExecutor(2) as pool:
            self.assertEqual(sorted(pool.map(spend, range(2))), [200, 409])
        self.assertEqual(self.bank.snapshot(self.token)["balance"], 0)

    def test_pin_throttling(self) -> None:
        for _ in range(5):
            with self.assertRaises(Rejected) as rejected:
                self.send("1234")
            self.assertEqual(rejected.exception.status, 401)
        with self.assertRaises(Rejected) as locked:
            self.send("1111")
        self.assertEqual(locked.exception.status, 429)
        self.now += 300
        self.send("1111")
        self.assertEqual(self.bank.monitor()["credited"], 500000)


if __name__ == "__main__":
    unittest.main()


class IncidentResolution(unittest.TestCase):
    def test_owner_audit_and_exactly_once_refund(self) -> None:
        with TemporaryDirectory() as folder:
            now = [1700000000]
            bank = Bank(folder + "/ledger", lambda: now[0])
            device = bank.start()
            ref = bank.transfer(device, str(uuid4()), "77015550142", 500000, "9999")[
                "id"
            ]
            with self.assertRaises(Rejected):
                bank.handle_incident(ref, "cancel", "alice", "Amina")
            bank.handle_incident(ref, "claim", "alice", "Amina")
            with self.assertRaises(Rejected):
                bank.handle_incident(ref, "cancel", "bob", "Amina")
            now[0] += 30
            with ThreadPoolExecutor(2) as pool:
                list(
                    pool.map(
                        lambda _: bank.handle_incident(
                            ref, "cancel", "alice", "Edited name"
                        ),
                        range(2),
                    )
                )
            now[0] += 3600
            self.assertEqual(bank.snapshot(device)["balance"], 1250000)
            snapshot = bank.monitor()
            self.assertEqual(
                (snapshot["held"], snapshot["credited"], snapshot["incidents"]),
                (0, 0, []),
            )
            actions = [
                (e["kind"], e["actor"], e["created"]) for e in snapshot["events"][:2]
            ]
            self.assertEqual(
                actions,
                [
                    ("CANCELLED_REFUNDED", "Amina · alice", 1700000030),
                    ("INCIDENT_CLAIMED", "Amina · alice", 1700000000),
                ],
            )
