import type { Audit, Ticket } from "../app/client";
type Sql = {
  bind(...values: (string | number)[]): Sql;
  first<T>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
};
type Env = { DB: { prepare(sql: string): Sql } };
type Payment = Ticket & {
  owner?: { hash: string; actor: string };
  cancelled?: boolean;
  key: string;
  target: string;
  status: Audit["status"];
  expires: number | null;
};
type Log = { ref: string; kind: string; destination: string; created: number };
type Ledger = {
  balance: number;
  credits: Record<string, number>;
  payments: Payment[];
  log: Log[];
  failures: number;
  locked: number;
};
type Row = {
  revision: number;
  salt: string;
  normal: string;
  duress: string;
  ledger: string;
};
type Result = { value: unknown; status?: number };
type Mutation = (l: Ledger, now: number) => Result;
declare const assets: Record<string, [string, string]>;
const encoder = new TextEncoder();
const hex = (b: ArrayBuffer) =>
  Array.from(new Uint8Array(b), (v) => v.toString(16).padStart(2, "0")).join(
    "",
  );
const hash = async (s: string) =>
  hex(await crypto.subtle.digest("SHA-256", encoder.encode(s)));
async function secret(salt: string, pin: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return hex(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        iterations: 100000,
        salt: encoder.encode(salt),
      },
      key,
      256,
    ),
  );
}
function reply(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
const denied = (message: string, status: number) =>
  reply({ detail: message }, status);
const ticket = (p: Payment): Ticket => ({
  id: p.id,
  recipient: p.recipient,
  amount: p.amount,
  created: p.created,
});
function log(
  l: Ledger,
  p: Payment,
  kind: string,
  destination: string,
  created: number,
) {
  l.log.push({ ref: p.id, kind, destination, created });
}
function expire(l: Ledger, now: number) {
  for (const p of l.payments) {
    if (p.status === "HELD" && p.expires !== null && p.expires <= now) {
      p.status = "RETURNED";
      l.balance += p.amount;
      log(l, p, "RESERVE_RETURNED", "sender", p.expires);
    }
  }
}
function monitor(l: Ledger, operator: string) {
  const byId = new Map(l.payments.map((p) => [p.id, p]));
  return {
    held: l.payments.reduce(
      (a, p) => a + (p.status === "HELD" ? p.amount : 0),
      0,
    ),
    incidents: l.payments
      .filter((p) => p.status === "HELD")
      .slice()
      .reverse()
      .map((p) => ({
        id: p.id,
        amount: p.amount,
        actor: p.owner?.actor || null,
        mine: p.owner?.hash === operator,
      })),
    credited: Object.values(l.credits).reduce((a, b) => a + b, 0),
    events: l.log
      .map((e, i) => {
        const p = byId.get(e.ref)!;
        return {
          seq: i + 1,
          id: p.id,
          created: e.created,
          amount: p.amount,
          kind: e.kind,
          destination: e.destination,
          actor: ["INCIDENT_CLAIMED", "CANCELLED_REFUNDED"].includes(e.kind)
            ? p.owner?.actor
            : "System",
          status: p.status,
          expires: p.expires,
        };
      })
      .slice(-80)
      .reverse(),
  };
}
async function update(env: Env, id: string, initial: Row, fn: Mutation) {
  let row = initial;
  for (let retry = 0; retry < 12; retry++) {
    const l: Ledger = JSON.parse(row.ledger);
    const now = Math.floor(Date.now() / 1000);
    expire(l, now);
    const result = fn(l, now),
      next = JSON.stringify(l);
    if (next === row.ledger) return reply(result.value, result.status);
    const write = await env.DB.prepare(
      "UPDATE demos SET ledger=?,revision=revision+1 WHERE id=? AND revision=?",
    )
      .bind(next, id, row.revision)
      .run();
    if (write.meta.changes === 1) return reply(result.value, result.status);
    const latest = await env.DB.prepare("SELECT * FROM demos WHERE id=?")
      .bind(id)
      .first<Row>();
    if (!latest) break;
    row = latest;
  }
  return denied("Please retry this request.", 409);
}
async function api(req: Request, env: Env, path: string) {
  if (req.method === "POST" && req.headers.get("x-paniclock-client") !== "demo")
    return denied("Invalid client", 403);
  if (path === "/api/session" && req.method === "POST") {
    const token = hex(crypto.getRandomValues(new Uint8Array(32)).buffer),
      salt = crypto.randomUUID();
    const [id, normal, duress] = await Promise.all([
      hash(token),
      secret(salt, "1111"),
      secret(salt, "9999"),
    ]);
    const l: Ledger = {
      balance: 1250000,
      credits: {},
      payments: [],
      log: [],
      failures: 0,
      locked: 0,
    };
    await env.DB.prepare(
      "INSERT INTO demos(id,salt,normal,duress,ledger) VALUES(?,?,?,?,?)",
    )
      .bind(id, salt, normal, duress, JSON.stringify(l))
      .run();
    return reply({ token, balance: l.balance, receipts: [] });
  }
  const token = req.headers.get("x-demo-session") || "";
  if (!/^[a-f0-9]{64}$/.test(token))
    return denied("Start a demo on the banking screen.", 401);
  const id = await hash(token),
    row = await env.DB.prepare("SELECT * FROM demos WHERE id=?")
      .bind(id)
      .first<Row>();
  if (!row) return denied("Start a demo on the banking screen.", 401);
  if (path === "/api/soc" || path.startsWith("/api/soc/incidents/")) {
    const key = req.headers.get("x-operator") || "";
    const operator = await hash(key);
    if (req.method === "GET" && path === "/api/soc")
      return update(env, id, row, (l) => ({ value: monitor(l, operator) }));
    const ref = path.match(/^\/api\/soc\/incidents\/(PL-[A-F0-9]{32})$/)?.[1];
    if (req.method !== "POST" || !ref) return denied("Unknown route", 404);
    const input = (await req.json().catch(() => null)) as {
      name: string;
      action: string;
    } | null;
    if (
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(key) ||
      !input ||
      !["claim", "cancel"].includes(input.action) ||
      typeof input.name !== "string" ||
      !input.name.trim() ||
      input.name.length > 48 ||
      /[\x00-\x1f\x7f]/.test(input.name)
    )
      return denied("Enter your operator name", 422);
    return update(env, id, row, (l, now) => {
      const p = l.payments.find((p) => p.id === ref);
      const conflict = (detail: string) => ({ status: 409, value: { detail } });
      if (!p) return { status: 404, value: { detail: "Unknown incident" } };
      if (p.owner && p.owner.hash !== operator)
        return conflict("Another operator owns this incident");
      if (p.status !== "HELD") {
        if (
          input.action === "cancel" &&
          p.cancelled &&
          p.owner?.hash === operator
        )
          return { value: { ok: true } };
        return conflict("This transfer is no longer held");
      }
      if (input.action === "claim") {
        if (!p.owner) {
          p.owner = {
            hash: operator,
            actor: input.name.trim() + " · " + operator.slice(0, 6),
          };
          log(l, p, "INCIDENT_CLAIMED", "SOC", now);
        }
      } else {
        if (!p.owner) return conflict("Claim this incident first");
        p.cancelled = true;
        p.status = "RETURNED";
        l.balance += p.amount;
        log(l, p, "CANCELLED_REFUNDED", "Sender account", now);
      }
      return { value: { ok: true } };
    });
  }
  if (req.method === "GET" && path === "/api/account")
    return update(env, id, row, (l) => ({
      value: {
        balance: l.balance,
        receipts: l.payments.slice(-100).reverse().map(ticket),
      },
    }));
  if (req.method !== "POST" || path !== "/api/transfers")
    return denied("Unknown route", 404);
  const body = (await req.json().catch(() => null)) as {
    amount: number;
    pin: string;
    recipient: string;
  } | null;
  const key = req.headers.get("idempotency-key") || "";
  if (
    !body ||
    typeof body.recipient !== "string" ||
    body.recipient.length > 32 ||
    !Number.isSafeInteger(body.amount) ||
    body.amount < 1 ||
    body.amount > 1250000 ||
    typeof body.pin !== "string" ||
    !/^\d{4}$/.test(body.pin) ||
    !/^\w{8}-[\da-f-]{27}$/i.test(key)
  )
    return denied("Invalid payment details", 422);
  const digits = body.recipient.replace(/[+ ()-]/g, "");
  if (!/^(?:\d{10,11}|\d{16})$/.test(digits))
    return denied("Invalid recipient", 422);
  const check = await secret(row.salt, body.pin),
    target = await hash(id + digits);
  return update(env, id, row, (l, now) => {
    if (l.locked > now)
      return { status: 429, value: { detail: "Try again in five minutes" } };
    if (l.locked) {
      l.locked = 0;
      l.failures = 0;
    }
    if (check !== row.normal && check !== row.duress) {
      if (++l.failures >= 5) l.locked = now + 300;
      return { status: 401, value: { detail: "Incorrect PIN. Try again." } };
    }
    l.failures = 0;
    const old = l.payments.find((p) => p.key === key);
    if (old)
      return old.amount === body.amount && old.target === target
        ? { value: ticket(old) }
        : { status: 409, value: { detail: "Request already used" } };
    if (l.balance < body.amount)
      return { status: 409, value: { detail: "Insufficient funds" } };
    if (l.payments.length >= 500)
      return {
        status: 409,
        value: { detail: "Start a new demo to continue." },
      };
    const held = check === row.duress;
    const p: Payment = {
      key,
      target,
      id: "PL-" + crypto.randomUUID().replaceAll("-", "").toUpperCase(),
      recipient: "•••• " + digits.slice(-4),
      amount: body.amount,
      created: now,
      status: held ? "HELD" : "SETTLED",
      expires: held ? now + 3600 : null,
    };
    l.payments.push(p);
    l.balance -= p.amount;
    if (held) {
      log(l, p, "HOLD_DURESS", "SOC", now);
      log(l, p, "MOCK_PUSH", "SOC inbox", now);
      log(l, p, "MOCK_SMS", "Trusted contact (demo)", now);
    } else {
      l.credits[target] = (l.credits[target] || 0) + p.amount;
      log(l, p, "SETTLED", "Mock processor", now);
    }
    return { value: ticket(p) };
  });
}
export default {
  async fetch(req: Request, env: Env) {
    const path = new URL(req.url).pathname.replace(/\/$/, "") || "/";
    if (path.startsWith("/api/")) {
      try {
        return await api(req, env, path);
      } catch {
        return denied("Bank unavailable. Please retry.", 503);
      }
    }
    const asset = Object.hasOwn(assets, path) ? assets[path] : undefined;
    if (!asset) return new Response("Not found", { status: 404 });
    return new Response(asset[1], {
      headers: {
        "Content-Type": asset[0],
        "Cache-Control": path.startsWith("/_next/static/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      },
    });
  },
};
