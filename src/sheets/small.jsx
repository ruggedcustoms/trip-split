import { useRef, useState } from "react";
import { useApp } from "../App.jsx";
import { api } from "../api.js";
import { fmtRange, inr } from "../money.js";
import { FormSheet, PlainSheet } from "./SheetHost.jsx";

export function PickTripSheet() {
  const { data, h, tripId, openTrip, openSheet } = useApp();
  return (
    <PlainSheet title="Switch trip">
      <div className="list">
        {data.trips.map((t) => {
          const r = fmtRange(t), current = t.id === tripId;
          return (
            <div key={t.id} className="item" style={{ alignItems: "center" }}>
              <div className="main"><div className="t">{t.name}</div><div className="s num">{r && r + " · "}{inr(h.stats(t.id).total)}</div></div>
              <button className={"btn small " + (current ? "accent" : "ghost")} type="button" onClick={() => openTrip(t.id)}>{current ? "Open now" : "Open"}</button>
            </div>
          );
        })}
      </div>
      <button className="btn" type="button" onClick={() => openSheet("trip")}>+ New trip</button>
    </PlainSheet>
  );
}

export function PollSheet() {
  const { trip: t, toast, write } = useApp();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", "", ""]);
  const list = useRef();

  function addOption() {
    if (options.length >= 8) return toast("Polls can have up to 8 options.");
    setOptions([...options, ""]);
    setTimeout(() => list.current.lastElementChild.focus());
  }

  async function save() {
    const q = question.trim(), opts = options.map((o) => o.trim()).filter(Boolean);
    if (!q) { toast("Type a question."); return false; }
    if (opts.length < 2) { toast("Add at least two options."); return false; }
    return write(() => api("POST", "/api/polls", { tripId: t.id, question: q, options: opts }), "Poll created");
  }

  return (
    <FormSheet title="New poll" submitLabel="Create poll" onSubmit={save}>
      <div className="hint">For {t.name}</div>
      <div className="field">
        <label className="label" htmlFor="p-q">Question</label>
        <input type="text" id="p-q" placeholder="Which beach on day 2?" maxLength={100} required autoFocus value={question} onChange={(e) => setQuestion(e.target.value)} />
      </div>
      <div className="field">
        <span className="label">Options</span>
        <div className="stack" ref={list} style={{ gap: 8 }}>
          {options.map((o, i) => (
            <input key={i} type="text" placeholder={"Option " + (i + 1)} maxLength={60} aria-label={"Option " + (i + 1)} value={o}
              onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />
          ))}
        </div>
        <button className="btn link" type="button" style={{ alignSelf: "flex-start" }} onClick={addOption}>+ Add option</button>
      </div>
    </FormSheet>
  );
}

export function MeSheet() {
  const { h, meId } = useApp();
  async function signOut() {
    try { await api("POST", "/api/logout"); } catch { /* reload anyway */ }
    location.reload();
  }
  return (
    <PlainSheet title={h.nameOf(meId)}>
      <div className="hint" style={{ fontSize: ".9rem" }}>Only you can delete the expenses you add.</div>
      <button className="btn ghost" type="button" onClick={signOut}>Sign out</button>
    </PlainSheet>
  );
}

const QUICK = ["Wrong amount", "I wasn't part of this", "Wrong person paid", "Duplicate entry"];

export function DisputeSheet({ arg: e }) {
  const { h, toast, write } = useApp();
  const [reason, setReason] = useState("");
  const box = useRef();

  async function save() {
    const r = reason.trim();
    if (!r) { toast("Say what's wrong with this expense."); return false; }
    return write(() => api("PUT", "/api/expenses/" + e.id + "/dispute", { reason: r }), "Dispute raised");
  }

  return (
    <FormSheet title="Raise a dispute" submitLabel="Raise dispute" onSubmit={save}>
      <div className="summary">
        <div className="row"><span className="t">{e.desc}</span><span className="amt num">{inr(e.paise)}</span></div>
        <div className="s">{h.nameOf(e.paidBy)} paid · split {(e.split || []).length} ways · added by {h.nameOf(e.addedBy)}</div>
      </div>
      <div className="field">
        <label className="label" htmlFor="d-reason">What's wrong?</label>
        <div className="quick">
          {QUICK.map((q) => (
            <button key={q} type="button" onClick={() => { setReason(q + (reason ? ". " + reason : "")); box.current.focus(); }}>{q}</button>
          ))}
        </div>
        <textarea ref={box} id="d-reason" maxLength={200} placeholder="e.g. The bill was ₹1,800, not ₹2,400" required autoFocus value={reason} onChange={(ev) => setReason(ev.target.value)} />
      </div>
      <div className="hint">Everyone on the trip will see this. Only {h.nameOf(e.addedBy)} can fix or delete the expense.</div>
    </FormSheet>
  );
}
