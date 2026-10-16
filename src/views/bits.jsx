// Small pieces shared by several screens.
import { useApp } from "../App.jsx";
import { inr, initials } from "../money.js";

export function Avatar({ member }) {
  const { meId } = useApp();
  return <div className={"avatar" + (member.id === meId ? " me-av" : "")}>{initials(member.name)}</div>;
}

// " (you)" after your own name.
export function You({ id }) {
  const { meId } = useApp();
  return id === meId ? <> <span className="hint">(you)</span></> : null;
}

export function MyPill({ v }) {
  if (v > 0) return <span className="pill good num">You get back {inr(v)}</span>;
  if (v < 0) return <span className="pill bad num">You owe {inr(v)}</span>;
  return <span className="pill">Settled</span>;
}

export function NoTrip() {
  const { openSheet } = useApp();
  return (
    <div className="card empty"><b>Create a trip first</b>Expenses, polls and chat each belong to a trip.
      <div style={{ marginTop: 14 }}><button className="btn" type="button" onClick={() => openSheet("trip")}>+ New trip</button></div>
    </div>
  );
}
