import { useState } from "react";
import { useApp } from "../App.jsx";
import { api } from "../api.js";
import { FormSheet, MemberChips } from "./SheetHost.jsx";

// New trip (arg = null) or edit trip (arg = the trip).
export default function TripSheet({ arg: t }) {
  const { data, h, toast, write, setTrip, setTab, closeSheet } = useApp();
  const [name, setName] = useState(t ? t.name : "");
  const [start, setStart] = useState((t && t.start) || "");
  const [end, setEnd] = useState((t && t.end) || "");
  const [going, setGoing] = useState(() => (t ? h.tripMemberIds(t) : data.members.map((m) => m.id)));
  const [armed, setArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save() {
    const n = name.trim();
    if (!n) { toast("Give the trip a name."); return false; }
    if (!going.length) { toast("Pick at least one person who's going."); return false; }
    if (start && end && end < start) { toast("The end date is before the start date."); return false; }
    const body = { name: n, start, end, members: going };
    if (t) return write(() => api("PUT", "/api/trips/" + t.id, body), "Trip saved");
    let newId = null;
    const ok = await write(async () => { newId = (await api("POST", "/api/trips", body)).id; }, n + " created");
    if (ok && newId) { setTrip(newId); setTab("money"); }
    return ok;
  }

  async function remove() {
    if (h.expOf(t.id).length) return toast("Delete this trip's expenses first, then delete the trip.");
    if (!armed) return setArmed(true);
    setDeleting(true);
    const ok = await write(() => api("DELETE", "/api/trips/" + t.id), "Trip deleted");
    if (ok) closeSheet(); else setDeleting(false);
  }

  return (
    <FormSheet
      title={t ? "Edit trip" : "New trip"}
      submitLabel={t ? "Save trip" : "Create trip"}
      onSubmit={save}
      footer={t && (
        <button className="btn link danger" type="button" style={{ alignSelf: "center" }} disabled={deleting} onClick={remove}>
          {armed ? "Tap again to delete this trip" : "Delete trip"}
        </button>
      )}
    >
      <div className="field">
        <label className="label" htmlFor="tr-name">Trip name</label>
        <input type="text" id="tr-name" placeholder="Goa, December" maxLength={50} required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="inline">
        <div className="field"><label className="label" htmlFor="tr-start">Starts</label><input type="date" id="tr-start" value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div className="field"><label className="label" htmlFor="tr-end">Ends</label><input type="date" id="tr-end" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
      </div>
      <div className="field">
        <span className="label">Who's going</span>
        <MemberChips members={data.members} selected={going} onChange={setGoing} />
      </div>
    </FormSheet>
  );
}
