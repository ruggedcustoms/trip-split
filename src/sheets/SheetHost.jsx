// Bottom sheets: forms and pickers that slide up over the app.
import { useState } from "react";
import { useApp } from "../App.jsx";
import TripSheet from "./TripSheet.jsx";
import ExpenseSheet from "./ExpenseSheet.jsx";
import { DisputeSheet, MeSheet, PickTripSheet, PollSheet } from "./small.jsx";

const SHEETS = { trip: TripSheet, pickTrip: PickTripSheet, expense: ExpenseSheet, poll: PollSheet, me: MeSheet, dispute: DisputeSheet };

export default function SheetHost({ sheet }) {
  const Sheet = SHEETS[sheet.kind];
  return <Sheet arg={sheet.arg} />;
}

function Scrim({ children }) {
  const { closeSheet } = useApp();
  return <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) closeSheet(); }}>{children}</div>;
}

export function PlainSheet({ title, children }) {
  const { closeSheet } = useApp();
  return (
    <Scrim>
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="row"><h2>{title}</h2><button className="btn link" type="button" onClick={closeSheet}>Close</button></div>
        {children}
      </div>
    </Scrim>
  );
}

// onSubmit returns true when the sheet should close.
export function FormSheet({ title, submitLabel, onSubmit, children, footer }) {
  const { closeSheet } = useApp();
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const ok = await onSubmit();
    setBusy(false);
    if (ok) closeSheet();
  }
  return (
    <Scrim>
      <form className="sheet" role="dialog" aria-modal="true" onSubmit={submit}>
        <div className="row"><h2>{title}</h2><button className="btn link" type="button" onClick={closeSheet}>Cancel</button></div>
        {children}
        <button className="btn" type="submit" disabled={busy}>{submitLabel}</button>
        {footer}
      </form>
    </Scrim>
  );
}

export function MemberChips({ members, selected, onChange }) {
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="chips">
      {members.map((m) => (
        <label key={m.id} className="chip">
          <input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggle(m.id)} />{m.name}
        </label>
      ))}
    </div>
  );
}
