"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  BatteryFull,
  Check,
  Coffee,
  Delete,
  Eye,
  EyeOff,
  LockKeyhole,
  Monitor,
  RotateCcw,
  Shield,
  ShieldCheck,
  ShoppingBag,
  Signal,
  Smartphone,
  Wifi,
  X,
  Zap,
} from "lucide-react";

import Observer from "./observer";
import { api, ApiError, type Account, type Ticket } from "./client";
type Screen =
  "Home" | "Transfer" | "Activity" | "Security" | "Payments" | "Receipt";
type Go = (screen: Screen) => void;
const format = (n: number) => new Intl.NumberFormat("en-US").format(n);
const history = [
  {
    name: "Magnum Supermarket",
    detail: "Groceries · Today",
    amount: -18450,
    Icon: ShoppingBag,
    color: "lilac",
  },
  {
    name: "Salary deposit",
    detail: "Income · Yesterday",
    amount: 450000,
    Icon: ArrowDownLeft,
    color: "mint",
  },
  {
    name: "Coffee Boom",
    detail: "Café · Yesterday",
    amount: -2800,
    Icon: Coffee,
    color: "peach",
  },
];
function Brand() {
  return (
    <div className="brand">
      <span className="emblem">
        <Shield size={25} />
        <i />
      </span>
      Panic<span>Lock</span>
    </div>
  );
}
function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div className="phone">
      <i className="sidekey" />
      <div className="glass">
        <div className="status">
          <b>9:41</b>
          <span className="island" />
          <div>
            <Signal />
            <Wifi />
            <BatteryFull />
          </div>
        </div>
        {children}
        <div className="homebar" />
      </div>
    </div>
  );
}
function AppBar({ title, back }: { title: string; back: () => void }) {
  return (
    <div className="appbar">
      <button aria-label="Go back" onClick={back}>
        <ArrowLeft size={19} />
      </button>
      <strong>{title}</strong>
      <span />
    </div>
  );
}
function Transactions({
  receipts,
  all = false,
}: {
  receipts: Ticket[];
  all?: boolean;
}) {
  const rows = [
    ...receipts.map((r) => ({
      name: r.recipient,
      detail: "Card transfer · Today",
      amount: -r.amount,
      Icon: ArrowUpRight,
      color: "mint",
    })),
    ...history,
  ];
  return (
    <div>
      {(all ? rows : rows.slice(0, 3)).map(
        ({ name, detail, amount, Icon, color }, i) => (
          <div className="transaction" key={i}>
            <span className={"txicon " + color}>
              <Icon size={17} />
            </span>
            <div>
              <b>{name}</b>
              <small>{detail}</small>
            </div>
            <strong className={amount > 0 ? "positive" : ""}>
              {amount > 0 ? "+" : "−"}
              {format(Math.abs(amount))} ₸
            </strong>
          </div>
        ),
      )}
    </div>
  );
}
function Home({
  state,
  go,
  hidden,
  setHidden,
}: {
  state: Account;
  go: Go;
  hidden: boolean;
  setHidden: (v: boolean) => void;
}) {
  return (
    <div className="home view">
      <div className="greeting">
        <span className="avatar">AM</span>
        <div>
          <small>Welcome back,</small>
          <h3>Amina M.</h3>
        </div>
        <ShieldCheck className="safe" />
      </div>
      <section className="bankcard">
        <div className="rings" />
        <div className="cardtop">
          <span>Available balance</span>
          <button
            onClick={() => setHidden(!hidden)}
            aria-label={hidden ? "Show balance" : "Hide balance"}
          >
            {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <h2>
          {hidden ? "••••••" : format(state.balance)} <small>₸</small>
        </h2>
        <div className="cardbottom">
          <span>•••• &nbsp; 4829</span>
          <em>VISA</em>
        </div>
      </section>
      <h4>Quick actions</h4>
      <div className="actions">
        {(
          [
            [ArrowUpRight, "Transfer"],
            [Zap, "Payments"],
            [ShieldCheck, "Security"],
          ] as const
        ).map(([Icon, label]) => (
          <button onClick={() => go(label)} key={label}>
            <span>
              <Icon size={20} />
            </span>
            {label}
          </button>
        ))}
      </div>
      <div className="rowhead">
        <h4>Recent activity</h4>
        <button onClick={() => go("Activity")}>See all</button>
      </div>
      <Transactions receipts={state.receipts} />
    </div>
  );
}
function Transfer({
  balance,
  recipient,
  setRecipient,
  amount,
  setAmount,
  confirm,
  back,
}: {
  balance: number;
  recipient: string;
  setRecipient: (v: string) => void;
  amount: string;
  setAmount: (v: string) => void;
  confirm: () => void;
  back: () => void;
}) {
  const [error, setError] = useState("");
  return (
    <div className="view inner">
      <AppBar title="Transfer money" back={back} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const digits = recipient.replace(/\D/g, "");
          if (
            !/^[+\d\s()-]+$/.test(recipient) ||
            ![10, 11, 16].includes(digits.length)
          )
            return setError(
              "Enter a 10–11 digit phone or 16-digit card number.",
            );
          if (
            !Number.isSafeInteger(+amount) ||
            +amount < 1 ||
            +amount > balance
          )
            return setError(
              "Enter a whole amount within your available balance.",
            );
          setError("");
          confirm();
        }}
      >
        <label>
          Recipient
          <input
            type="tel"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="Card or phone number"
            required
          />
        </label>
        <label>
          Amount, KZT
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>
        <div className="percents">
          {[10, 25, 50, 100].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setAmount(String(Math.floor((balance * p) / 100)))}
            >
              {p}%
            </button>
          ))}
        </div>
        <p className="hint">Available · {format(balance)} ₸</p>
        {error && <p role="alert">{error}</p>}
        <button className="primary">
          Continue <ArrowRight size={16} />
        </button>
      </form>
    </div>
  );
}
function Pin({
  close,
  submit,
}: {
  close: () => void;
  submit: (pin: string) => Promise<void>;
}) {
  const [pin, setPin] = useState(""),
    [err, setErr] = useState("");
  const panel = useRef<HTMLElement>(null);
  const busy = useRef(false);
  useEffect(() => {
    panel.current?.focus();
  }, []);
  async function key(k: string) {
    if (busy.current) return;
    if (k === "Backspace") {
      setPin(pin.slice(0, -1));
      return;
    }
    if (!/^\d$/.test(k)) return;
    let v = pin + k;
    setErr("");
    if (v.length < 4) setPin(v);
    else {
      busy.current = true;
      setPin(v);
      try {
        await submit(v);
      } catch (e) {
        setPin("");
        setErr(e instanceof Error ? e.message : "Try again");
      } finally {
        busy.current = false;
      }
    }
  }
  return (
    <div className="shade">
      <section
        className="pin"
        role="dialog"
        aria-modal="true"
        aria-label="Confirm transfer"
        tabIndex={-1}
        ref={panel}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy.current) close();
          else if (e.key === "Tab") {
            const buttons = [...panel.current!.querySelectorAll("button")];
            if (
              e.shiftKey &&
              (document.activeElement === panel.current ||
                document.activeElement === buttons[0])
            ) {
              e.preventDefault();
              buttons.at(-1)?.focus();
            } else if (
              !e.shiftKey &&
              document.activeElement === buttons.at(-1)
            ) {
              e.preventDefault();
              buttons[0].focus();
            }
          } else if (/^\d$/.test(e.key) || e.key === "Backspace") {
            e.preventDefault();
            key(e.key);
          }
        }}
      >
        <button
          className="dismiss"
          onClick={() => {
            if (!busy.current) close();
          }}
          aria-label="Close keypad"
        >
          <X size={19} />
        </button>
        <LockKeyhole className="pinlock" />
        <h3>Enter your PIN</h3>
        <p>Confirm your transfer</p>
        <div className="dots">
          {[0, 1, 2, 3].map((i) => (
            <i key={i} className={i < pin.length ? "filled" : ""} />
          ))}
        </div>
        <small role="alert">{err}</small>
        <div className="keys">
          {[
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "",
            "0",
            "Backspace",
          ].map((k) =>
            k ? (
              <button key={k} aria-label={k} onClick={() => key(k)}>
                {k === "Backspace" ? <Delete size={20} /> : k}
              </button>
            ) : (
              <span key="blank" />
            ),
          )}
        </div>
      </section>
    </div>
  );
}
function Receipt({
  receipt,
  balance,
  home,
}: {
  receipt: Ticket;
  balance: number;
  home: () => void;
}) {
  return (
    <div className="view inner receipt">
      <span className="success">
        <Check size={35} />
      </span>
      <h3>Transfer Completed</h3>
      <h2>{format(receipt.amount)} ₸</h2>
      <dl>
        {[
          ["Recipient", receipt.recipient],
          ["Reference", receipt.id],
          ["Available balance", format(balance) + " ₸"],
        ].map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <button className="primary" onClick={home}>
        Back to home
      </button>
    </div>
  );
}
export default function Page() {
  const [state, setState] = useState<Account | null>(null),
    [screen, go] = useState<Screen>("Home"),
    [open, setOpen] = useState(false),
    [pin, setPin] = useState(false),
    [hidden, setHidden] = useState(false),
    [amount, setAmount] = useState("500000"),
    [recipient, setRecipient] = useState("+7 701 555 0142");
  const [notice, setNotice] = useState("");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const working = useRef(false);
  async function load(fresh = false) {
    if (working.current) return;
    working.current = true;
    try {
      let result: Account;
      if (fresh) result = await api<Account>("session", { method: "POST" });
      else
        try {
          result = await api<Account>("account");
        } catch (e) {
          if (!(e instanceof ApiError) || e.status !== 401) throw e;
          result = await api<Account>("session", { method: "POST" });
        }
      setState(result);
      setNotice("");
      if (fresh) {
        go("Home");
        setPin(false);
        setHidden(false);
        setTicket(null);
        attempt.current = null;
        setAmount("500000");
        setRecipient("+7 701 555 0142");
      }
    } catch {
      setNotice("Bank unavailable. Retry connection.");
    } finally {
      working.current = false;
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function submit(pinValue: string) {
    if (working.current) throw new Error("Please wait.");
    working.current = true;
    try {
      const payload = JSON.stringify([recipient, amount]);
      if (attempt.current?.payload !== payload)
        attempt.current = { payload, key: crypto.randomUUID() };
      const result = await api<Ticket>("transfers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": attempt.current.key,
        },
        body: JSON.stringify({
          recipient,
          amount: Number(amount),
          pin: pinValue,
        }),
      });
      const updated = await api<Account>("account");
      setState(updated);
      setTicket(result);
      setPin(false);
      go("Receipt");
      attempt.current = null;
    } finally {
      working.current = false;
    }
  }
  const home = () => {
    go("Home");
    void load();
  };
  return (
    <>
      <header>
        <div className="headerin">
          <Brand />
          <div className="headeractions">
            <span className="sandbox">
              <i /> Sandbox online
            </span>
            <button
              className={"socbtn " + (open ? "on" : "")}
              aria-pressed={open}
              onClick={() => setOpen(!open)}
            >
              <Monitor size={15} /> SOC view <span className="switch" />
            </button>
          </div>
        </div>
      </header>
      <main>
        <div className="intro">
          <div className="eyebrow">
            <span /> INTERACTIVE SANDBOX
          </div>
          <h1>
            Banking simulator<span>.</span>
          </h1>
          <p>
            Explore the mobile banking experience and its silent duress
            protection.
          </p>
        </div>
        {notice && state && <p role="alert">{notice}</p>}
        <div className="workspace">
          <section className="devicepane">
            <div className="devicehead">
              <span>
                <Smartphone size={15} /> Customer device
              </span>
              <button onClick={() => void load(true)} disabled={pin}>
                <RotateCcw size={13} /> Reset demo
              </button>
            </div>
            <div className="stage">
              <Phone>
                <div inert={pin ? true : undefined} className="screenarea">
                  {!state ? (
                    <div className="inner">
                      <p>{notice || "Connecting to the bank…"}</p>
                      {notice && (
                        <button onClick={() => void load()}>Retry</button>
                      )}
                    </div>
                  ) : screen === "Home" ? (
                    <Home {...{ state, go, hidden, setHidden }} />
                  ) : screen === "Transfer" ? (
                    <Transfer
                      balance={state.balance}
                      {...{ recipient, setRecipient, amount, setAmount }}
                      confirm={() => setPin(true)}
                      back={home}
                    />
                  ) : screen === "Receipt" && ticket ? (
                    <Receipt
                      receipt={ticket}
                      balance={state.balance}
                      home={home}
                    />
                  ) : (
                    <div className="inner view">
                      <AppBar title={screen} back={home} />
                      {screen === "Activity" ? (
                        <Transactions receipts={state.receipts} all />
                      ) : screen === "Security" ? (
                        <>
                          <ShieldCheck className="pinlock" />
                          <h3>Account protection</h3>
                          <p className="hint">
                            PIN confirmation is active for transfers.
                          </p>
                        </>
                      ) : (
                        <>
                          <Banknote className="pinlock" />
                          <h3>Payments</h3>
                          <p className="hint">
                            Send a payment to a card or phone number.
                          </p>
                          <button
                            className="primary"
                            onClick={() => go("Transfer")}
                          >
                            New transfer <ArrowRight size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {pin && <Pin close={() => setPin(false)} submit={submit} />}
              </Phone>
            </div>
          </section>
          <Observer open={open} toggle={() => setOpen(!open)} />
        </div>
        <footer>
          <LockKeyhole size={12} /> Isolated demo environment{" "}
          <span>Simulated funds & notifications</span>
        </footer>
      </main>
    </>
  );
}
