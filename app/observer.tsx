"use client";
import { useEffect, useState } from "react";
import { Activity, ArrowRight, Monitor, ShieldCheck } from "lucide-react";
import { api, ApiError, type MonitorState } from "./client";

export default function Observer({
  open,
  toggle,
  standalone = false,
}: {
  open: boolean;
  toggle: () => void;
  standalone?: boolean;
}) {
  const [key, setKey] = useState(""),
    [draft, setDraft] = useState(""),
    [data, setData] = useState<MonitorState | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!open || !key) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const snapshot = await api<MonitorState>("soc", {
          headers: { Authorization: "Bearer " + key },
        });
        if (active) {
          setData(snapshot);
          setError("");
        }
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : "Monitor disconnected");
          if (e instanceof ApiError && e.status === 403) {
            setKey("");
            setData(null);
            return;
          }
        }
      }
      if (active) timer = setTimeout(refresh, 1000);
    }
    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key, open]);
  const last = data?.events[0];
  const money = (n: number) => n.toLocaleString("en-US") + " ₸";
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
          <span>
            {open && data && !error ? "LIVE MONITOR" : "OPERATOR CONSOLE"}
          </span>
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
            : !data
              ? "Operator access"
              : last?.status === "HELD"
                ? "Duress PIN detected"
                : last?.status === "RETURNED"
                  ? "Reserve returned"
                  : last
                    ? "Transfer authorized"
                    : "Monitoring active"}
        </h3>
        {open && !data ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setKey(draft.trim());
              setDraft("");
              setError("");
            }}
          >
            <label>
              Operator key
              <input
                type="password"
                required
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoComplete="off"
              />
            </label>
            <button>Connect</button>
          </form>
        ) : (
          <p>
            {!open
              ? "Open the SOC view to inspect bank-side events."
              : last?.status === "HELD"
                ? money(last.amount) +
                  " held for 60 minutes. Mock alerts recorded for SOC and the trusted contact."
                : last?.status === "RETURNED"
                  ? "The hold expired. Funds returned to the sender."
                  : last
                    ? "Funds credited to the demo recipient."
                    : "Waiting for a transfer from the device."}
          </p>
        )}
        {open && error && <p role="alert">{error}</p>}
        {!standalone && (
          <button onClick={toggle}>
            <Monitor size={15} />
            {open ? "Close SOC view" : "Open SOC view"}
            <ArrowRight size={15} />
          </button>
        )}
      </div>
      {open && data && (
        <>
          <div className="telemetry">
            <span>Held in quarantine</span>
            <b>{money(data.held)}</b>
          </div>
          <div className="telemetry">
            <span>Credited to recipients</span>
            <b>{money(data.credited)}</b>
          </div>
          <section className="guide">
            <h3>Bank event log</h3>
            <ol className="eventlog">
              {data.events.map((e) => (
                <li key={e.seq}>
                  <b>{e.kind}</b> · {money(e.amount)}
                  <small>
                    {e.destination} ·{" "}
                    {new Date(e.created * 1000).toLocaleTimeString()} ·{" "}
                    {e.id.slice(-8)}
                  </small>
                  {e.kind === "HOLD_DURESS" && e.expires && (
                    <small>
                      Quarantine until{" "}
                      {new Date(e.expires * 1000).toLocaleTimeString()}
                    </small>
                  )}
                </li>
              ))}
            </ol>
          </section>
          <button
            onClick={() => {
              setKey("");
              setData(null);
            }}
          >
            Disconnect
          </button>
        </>
      )}
      {!standalone && (
        <div className="guide">
          <a href="/soc" target="_blank" rel="noreferrer">
            Open operator window ↗
          </a>
        </div>
      )}
    </aside>
  );
}
