import { useMemo, useRef, useState } from "react";
import { useApp } from "../App.jsx";
import { api } from "../api.js";
import { today } from "../money.js";
import { FormSheet, MemberChips } from "./SheetHost.jsx";

const WHAT_FOR = ["Breakfast", "Lunch", "Dinner", "Snacks", "Tea & coffee", "Drinks", "Cig", "Hotel", "Homestay", "Fuel", "Cab", "Auto", "Train", "Bus", "Flight", "Tolls & parking", "Bike rental", "Car rental", "Entry tickets", "Activities", "Groceries", "Water", "Shopping", "Medicines", "Tips"];

export default function ExpenseSheet() {
  const { data, h, meId, trip: t, toast, write } = useApp();
  const mem = h.membersOf(t);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [paidBy, setPaidBy] = useState(meId);
  const [split, setSplit] = useState(() => mem.map((m) => m.id));
  const amountRef = useRef();

  // Suggestions: the usual list first, then anything the group has typed before.
  const pool = useMemo(() => {
    const past = [...new Set(data.expenses.map((e) => String(e.desc || "").trim()).filter(Boolean))]
      .filter((d) => !WHAT_FOR.some((w) => w.toLowerCase() === d.toLowerCase()));
    return WHAT_FOR.concat(past);
  }, [data.expenses]);

  async function save() {
    const d = desc.trim(), paise = Math.round(parseFloat(amount) * 100);
    if (!d || !(paise > 0)) { toast("Enter what it was for and an amount above ₹0."); return false; }
    if (!split.length) { toast("Pick at least one person to split with."); return false; }
    return write(() => api("POST", "/api/expenses", { tripId: t.id, desc: d, paise, paidBy, split, date: date || today() }), "Expense added");
  }

  return (
    <FormSheet title="Add expense" submitLabel="Save expense" onSubmit={save}>
      <div className="hint">For {t.name}</div>
      <div className="field">
        <label className="label" htmlFor="e-desc">What for</label>
        <WhatFor value={desc} onChange={setDesc} pool={pool} onPick={() => amountRef.current.focus()} />
      </div>
      <div className="inline">
        <div className="field">
          <label className="label" htmlFor="e-amt">Amount (₹)</label>
          <input ref={amountRef} type="number" id="e-amt" inputMode="decimal" min="0.01" step="0.01" placeholder="2400" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field"><label className="label" htmlFor="e-date">Date</label><input type="date" id="e-date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
      <div className="field">
        <label className="label" htmlFor="e-paid">Paid by</label>
        <select id="e-paid" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
          {mem.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      <div className="field">
        <div className="row">
          <span className="label">Split equally between</span>
          <button className="btn link" type="button" onClick={() => setSplit(split.length ? [] : mem.map((m) => m.id))}>{split.length ? "None" : "All"}</button>
        </div>
        <MemberChips members={mem} selected={split} onChange={setSplit} />
      </div>
    </FormSheet>
  );
}

function matches(value, pool) {
  const q = value.trim().toLowerCase();
  if (!q) return [];
  const starts = pool.filter((p) => p.toLowerCase().startsWith(q));
  const has = pool.filter((p) => !p.toLowerCase().startsWith(q) && p.toLowerCase().includes(q));
  const items = starts.concat(has).slice(0, 8).map((v) => ({ v }));
  if (!pool.some((p) => p.toLowerCase() === q)) items.push({ v: value.trim(), custom: true });
  return items;
}

// Text box with a suggestion list (arrow keys + Enter, or tap).
function WhatFor({ value, onChange, pool, onPick }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const items = useMemo(() => matches(value, pool), [value, pool]);

  function type(v) {
    onChange(v);
    const its = matches(v, pool);
    setHi(its.length && !its[0].custom ? 0 : its.length - 1);
    setOpen(its.length > 0);
  }
  function pick(v) { onChange(v); setOpen(false); onPick(); }
  function onKeyDown(e) {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHi(Math.min(items.length - 1, hi + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi(Math.max(0, hi - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (items[hi]) pick(items[hi].v); }
    else if (e.key === "Escape") { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setOpen(false); }
  }

  return (
    <div className="ac">
      <input type="text" id="e-desc" placeholder="Start typing, e.g. Din…" maxLength={60} required autoComplete="off" autoFocus
        role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls="acList"
        value={value} onChange={(e) => type(e.target.value)} onKeyDown={onKeyDown} onBlur={() => setTimeout(() => setOpen(false), 120)} />
      {open && (
        <div className="ac-list" id="acList" role="listbox" onPointerDown={(e) => e.preventDefault()}>
          {items.map((it, i) => (
            <button key={i} type="button" role="option" aria-selected={i === hi} className={(i === hi ? "hi " : "") + (it.custom ? "custom" : "")} onClick={() => pick(it.v)}>
              {it.custom ? <>Use “<b>{it.v}</b>”</> : it.v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
