import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { workerFixture } from "./worker.mjs";

const target = process.env.TARGET;
const base = process.env.BASE || "http://fixture.invalid";
const start = 1700000000,
  amount = 500000,
  opening = 1250000;
let fixture;
const originalNow = Date.now;
before(async () => {
  assert.ok(["worker", "docker", "live"].includes(target));
  if (target === "worker")
    fixture = await workerFixture(process.env.HOSTED_DIR);
});
after(() => {
  Date.now = originalNow;
  fixture?.close();
});

function clock(second) {
  if (target === "worker") Date.now = () => second * 1000;
  if (target === "docker") {
    execFileSync("docker", [
      "exec",
      process.env.TEST_CONTAINER,
      "python",
      "-c",
      "from pathlib import Path; import sys; p=Path('/tmp/contract-clock.next'); p.write_text(sys.argv[1]); p.replace('/tmp/contract-clock')",
      String(second),
    ]);
  }
}
async function session() {
  clock(start);
  const headers = {
    "Content-Type": "application/json",
    "X-PanicLock-Client": "demo",
    "X-Operator": randomUUID(),
  };
  if (target === "docker")
    headers.Authorization = "Bearer " + process.env.OPERATOR_KEY;
  async function request(path, data, expected = 200, extra = {}) {
    const req = new Request(base + "/api/" + path, {
      method: data === undefined ? "GET" : "POST",
      headers: { ...headers, ...extra },
      body: JSON.stringify(data),
    });
    const res = fixture
      ? await fixture.request(req)
      : await fetch(req, { signal: AbortSignal.timeout(20000) });
    assert.equal(res.status, expected, target + " " + req.method + " " + path);
    return { body: await res.json(), headers: res.headers };
  }
  const init = await request("session", {});
  if (target === "docker")
    headers.Cookie = init.headers.get("set-cookie").split(";")[0];
  else headers["X-Demo-Session"] = init.body.token;
  assert.equal(init.body.balance, opening);
  const get = async (path) => (await request(path)).body;
  const baseline = await get("soc");
  return {
    send: async (pin) =>
      (
        await request(
          "transfers",
          { amount, pin, recipient: "+7 701 555 0142" },
          200,
          { "Idempotency-Key": randomUUID() },
        )
      ).body,
    act: (ref, action, status = 200) =>
      request("soc/incidents/" + ref, { name: "Contract QA", action }, status),
    async state(ref, balance, held, credited, expectedKinds) {
      const account = await get("account"),
        soc = await get("soc");
      assert.equal(account.balance, balance);
      assert.equal(soc.held - baseline.held, held);
      assert.equal(soc.credited - baseline.credited, credited);
      const events = soc.events.filter((e) => e.id === ref).reverse();
      assert.deepEqual(
        events.map((e) => e.kind),
        expectedKinds,
      );
      assert.equal(
        soc.incidents.some((i) => i.id === ref),
        held > 0,
      );
      return events;
    },
  };
}
const hold = ["HOLD_DURESS", "MOCK_PUSH", "MOCK_SMS"];
const claimed = [...hold, "INCIDENT_CLAIMED"];

test("both PINs return equivalent receipts and route funds differently", async () => {
  const normal = await session(),
    a = await normal.send("1111");
  await normal.state(a.id, opening - amount, 0, amount, ["SETTLED"]);
  const panic = await session(),
    b = await panic.send("9999");
  const events = await panic.state(b.id, opening - amount, amount, 0, hold);
  assert.equal(events[0].expires - b.created, 3600);
  for (const receipt of [a, b]) {
    assert.deepEqual(Object.keys(receipt).sort(), [
      "amount",
      "created",
      "id",
      "recipient",
    ]);
    assert.equal(receipt.amount, amount);
    assert.match(receipt.id, /^PL-[0-9A-F]{32}$/);
    assert.equal(receipt.recipient, "•••• 0142");
    assert.ok(Number.isInteger(receipt.created));
  }
  await panic.act(b.id, "claim");
  await panic.act(b.id, "cancel");
});
test("two refund requests plus a retry return the reserve once", async () => {
  const bank = await session(),
    p = await bank.send("9999");
  await bank.act(p.id, "claim");
  await Promise.all([bank.act(p.id, "cancel"), bank.act(p.id, "cancel")]);
  await bank.act(p.id, "cancel");
  const events = await bank.state(p.id, opening, 0, 0, [
    ...claimed,
    "CANCELLED_REFUNDED",
  ]);
  assert.equal(events.at(-1).actor, events.at(-2).actor);
});
for (const elapsed of [3599, 3600, 3601]) {
  test(
    "cancellation at T+" + elapsed + " seconds",
    { skip: target === "live" && "The public server uses real time" },
    async () => {
      const bank = await session(),
        p = await bank.send("9999");
      assert.equal(p.created, start);
      await bank.act(p.id, "claim");
      clock(start + elapsed);
      const beforeExpiry = elapsed < 3600;
      await bank.act(p.id, "cancel", beforeExpiry ? 200 : 409);
      const kinds = [
        ...claimed,
        beforeExpiry ? "CANCELLED_REFUNDED" : "RESERVE_RETURNED",
      ];
      const events = await bank.state(p.id, opening, 0, 0, kinds);
      assert.equal(events[0].expires, start + 3600);
      assert.ok(
        events.at(-1).created >= start + (beforeExpiry ? elapsed : 3600),
      );
      clock(start + 3602);
      await bank.act(p.id, "cancel", beforeExpiry ? 200 : 409);
      await bank.state(p.id, opening, 0, 0, kinds);
    },
  );
}
