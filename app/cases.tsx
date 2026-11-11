"use client";
import { useState } from "react";
import { api, type MonitorState } from "./client";

export function operatorHeaders() {
  let key = localStorage.getItem("paniclock-operator-device");
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem("paniclock-operator-device", key);
  }
  return { "X-Operator": key };
}

export default function Cases({
  incidents,
  authorization,
}: {
  incidents: MonitorState["incidents"];
  authorization?: string;
}) {
  const [name, setName] = useState(
    () => localStorage.getItem("paniclock-operator-name") || "",
  );
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  async function act(id: string, action: "claim" | "cancel") {
    setPending(true);
    setMessage("");
    try {
      await api("soc/incidents/" + id, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...operatorHeaders(),
          ...(authorization ? { Authorization: authorization } : {}),
        },
        body: JSON.stringify({ action, name: name.trim() || "Demo operator" }),
      });
      if (action === "claim")
        localStorage.setItem("paniclock-operator-name", name.trim());
      else {
        localStorage.setItem("paniclock-last-refund", crypto.randomUUID());
        window.dispatchEvent(new Event("soc-refund"));
      }
      setMessage(
        action === "claim"
          ? "Incident assigned to you."
          : "Transfer cancelled. Funds returned to the sender.",
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Please retry");
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="guide casequeue">
      <h3>Incident queue</h3>
      {incidents.some((i) => !i.actor) && (
        <label>
          Your demo operator name
          <input
            value={name}
            maxLength={48}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name or callsign"
          />
        </label>
      )}
      {!incidents.length && <p>No active holds.</p>}
      {incidents.map((i) => (
        <article key={i.id}>
          <strong>{i.amount.toLocaleString("en-US")} ₸</strong>
          <small>
            Transfer {i.id.slice(-8)} ·{" "}
            {i.actor ? "Assigned to " + i.actor : "Unassigned"}
          </small>
          {!i.actor ? (
            <button
              disabled={pending || !name.trim()}
              onClick={() => act(i.id, "claim")}
            >
              Claim incident
            </button>
          ) : (
            Boolean(i.mine) && (
              <button disabled={pending} onClick={() => act(i.id, "cancel")}>
                Cancel transfer &amp; refund
              </button>
            )
          )}
        </article>
      ))}
      <p role="status">{message}</p>
    </section>
  );
}
