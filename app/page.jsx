"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  BatteryFull,
  Check,
  CheckCheck,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Coffee,
  Delete,
  Eye,
  EyeOff,
  Fingerprint,
  Headphones,
  KeyRound,
  Layers,
  LockKeyhole,
  Monitor,
  Radio,
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

const format = (n) => new Intl.NumberFormat("en-US").format(n);
const initial = { balance: 1250000, receipts: [], held: 0 };
function ledger(state, action) {
  if (action.type === "reset") return initial;
  if (
    action.type !== "transfer" ||
    action.amount > state.balance ||
    state.receipts.some((r) => r.id === action.id)
  )
    return state;
  return {
    balance: state.balance - action.amount,
    held: state.held + (action.panic ? action.amount : 0),
    receipts: [action, ...state.receipts],
  };
}
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
function Phone({ children }) {
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
function AppBar({ title, back }) {
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
function Transactions({ receipts, all = false }) {
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
function Home({ state, go, hidden, setHidden }) {
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
        {[
          [ArrowUpRight, "Transfer"],
          [Zap, "Payments"],
          [ShieldCheck, "Security"],
        ].map(([Icon, label]) => (
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
function Pin({ close, submit }) {
  const [pin, setPin] = useState(""),
    [err, setErr] = useState("");
  const panel = useRef(null);
  useEffect(() => {
    panel.current.focus();
  }, []);
  function key(k) {
    if (k === "Backspace") {
      setPin(pin.slice(0, -1));
      return;
    }
    if (!/^\d$/.test(k)) return;
    let v = pin + k;
    setErr("");
    if (v.length < 4) setPin(v);
    else if (v === "1111" || v === "9999") submit(v);
    else {
      setPin("");
      setErr("Incorrect PIN. Try again.");
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
          if (e.key === "Escape") close();
          else if (e.key === "Tab") {
            const buttons = [...panel.current.querySelectorAll("button")];
            if (
              e.shiftKey &&
              [panel.current, buttons[0]].includes(document.activeElement)
            ) {
              e.preventDefault();
              buttons.at(-1).focus();
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
        <button className="dismiss" onClick={close} aria-label="Close keypad">
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
function Receipt({ receipt, balance, home }) {
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
function Observer({ open, toggle, state }) {
  const last = state.receipts[0];
  return (
    <aside>
      <div className="panelheading">
        <span className="sectionicon">
          <Activity size={19} />
        </span>
        <h2>Security operations</h2>
        <span className="tag">SOC</span>
      </div>
      <div className="monitorbox">
        <div className="monitorhead">
          <span className="led" />
          <span>LIVE MONITOR</span>
          <Activity size={16} />
        </div>
        <div className="radar">
          <div className="cross" />
          <div className="sweep" />
          <i className="blip" />
          <i className="blip second" />
          <span>
            <ShieldCheck size={29} />
          </span>
        </div>
        <h3>
          {!open
            ? "Observer standby"
            : last?.panic
              ? "Duress PIN detected"
              : last
                ? "Transfer authorized"
                : "Monitoring active"}
        </h3>
        <p aria-live="polite">
          {!open
            ? "Open the SOC view to inspect bank-side events."
            : last?.panic
              ? "🚨 DURESS PIN DETECTED: " +
                format(last.amount) +
                " KZT held in quarantine. Funds safe. Police/SOC notified. Attacker deceived."
              : last
                ? "Standard PIN verified. Transfer released."
                : "Waiting for a transfer from the device."}
        </p>
        <button onClick={toggle}>
          <Monitor size={15} />
          {open ? "Close SOC view" : "Open SOC view"}
          <ArrowRight size={15} />
        </button>
      </div>
      {open && (
        <div className="telemetry">
          <span>Simulated quarantine</span>
          <b>{format(state.held)} ₸</b>
        </div>
      )}
      <div className="guide">
        <div className="panelheading">
          <KeyRound size={17} />
          <h3>Demo credentials</h3>
        </div>
        {[
          ["Standard PIN", "1111", KeyRound],
          ["Duress PIN", "9999", Fingerprint],
        ].map(([label, num, Icon]) => (
          <div className="cred" key={num}>
            <Icon size={16} />
            <span>{label}</span>
            <code>{num}</code>
          </div>
        ))}
      </div>
    </aside>
  );
}
export default function Page() {
  const [state, dispatch] = useReducer(ledger, initial),
    [screen, go] = useState("Home"),
    [open, setOpen] = useState(false),
    [pin, setPin] = useState(false),
    [hidden, setHidden] = useState(false),
    [amount, setAmount] = useState("500000"),
    [recipient, setRecipient] = useState("+7 701 555 0142");
  function reset() {
    dispatch({ type: "reset" });
    go("Home");
    setOpen(false);
    setPin(false);
    setHidden(false);
    setAmount("500000");
    setRecipient("+7 701 555 0142");
  }
  const home = () => go("Home");
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
        <div className="workspace">
          <section className="devicepane">
            <div className="devicehead">
              <span>
                <Smartphone size={15} /> Customer device
              </span>
              <button onClick={reset}>
                <RotateCcw size={13} /> Reset demo
              </button>
            </div>
            <div className="stage">
              <Phone>
                <div inert={pin ? true : undefined} className="screenarea">
                  {screen === "Home" ? (
                    <Home {...{ state, go, hidden, setHidden }} />
                  ) : screen === "Transfer" ? (
                    <Transfer
                      balance={state.balance}
                      {...{ recipient, setRecipient, amount, setAmount }}
                      confirm={() => setPin(true)}
                      back={home}
                    />
                  ) : screen === "Receipt" ? (
                    <Receipt
                      receipt={state.receipts[0]}
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
                {pin && (
                  <Pin
                    close={() => setPin(false)}
                    submit={(v) => {
                      dispatch({
                        type: "transfer",
                        amount: +amount,
                        recipient,
                        id:
                          "PL-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
                        panic: v === "9999",
                      });
                      setPin(false);
                      go("Receipt");
                    }}
                  />
                )}
              </Phone>
            </div>
          </section>
          <Observer open={open} toggle={() => setOpen(!open)} state={state} />
        </div>
        <footer>
          <LockKeyhole size={12} /> Isolated demo environment{" "}
          <span>Simulated funds & notifications</span>
        </footer>
      </main>
    </>
  );
}
