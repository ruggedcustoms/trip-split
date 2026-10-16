import { useEffect, useRef, useState } from "react";
import { useApp } from "../App.jsx";
import { api } from "../api.js";
import { NoTrip } from "./bits.jsx";

export default function Chat() {
  const { h, meId, trip, messages } = useApp();

  // Keep the newest message in view.
  useEffect(() => { window.scrollTo(0, document.body.scrollHeight); }, [messages.length]);

  if (!trip) return <NoTrip />;
  if (!messages.length) return <div className="card empty"><b>No messages yet</b>Say hi to everyone on this trip.</div>;

  const out = [];
  let lastDay = "", lastWho = "";
  messages.forEach((m) => {
    const d = new Date(m.at || 0), day = d.toDateString();
    if (day !== lastDay) {
      out.push(<span key={"d" + m.id} className="pill day">{d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</span>);
      lastDay = day;
      lastWho = "";
    }
    const mine = m.memberId === meId;
    out.push(
      <div key={m.id} className={"msg" + (mine ? " out" : "")}>
        {!mine && m.memberId !== lastWho && <span className="who">{h.nameOf(m.memberId)}</span>}
        <div className="bubble">{m.text}</div>
        <span className="time">{d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</span>
      </div>,
    );
    lastWho = m.memberId;
  });
  return <div className="chat">{out}</div>;
}

export function Composer() {
  const { tripId, write } = useApp();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef();

  async function send(e) {
    e.preventDefault();
    const t = text.trim();
    if (!t || !tripId) return;
    setBusy(true);
    const ok = await write(() => api("POST", "/api/messages", { tripId, text: t }));
    setBusy(false);
    if (ok) { setText(""); input.current.focus(); }
  }

  return (
    <form className="composer" onSubmit={send}>
      <input ref={input} type="text" placeholder="Message the trip" maxLength={500} autoComplete="off" aria-label="Message" value={text} onChange={(e) => setText(e.target.value)} />
      <button className="btn" type="submit" disabled={busy}>Send</button>
    </form>
  );
}
