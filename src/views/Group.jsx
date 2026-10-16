import { useRef, useState } from "react";
import { useApp, useArm } from "../App.jsx";
import { api } from "../api.js";
import { Avatar, You } from "./bits.jsx";

export default function Group() {
  const { data, h, meId, toast, write } = useApp();
  const [pendingDel, arm] = useArm();
  const [name, setName] = useState("");
  const urlRef = useRef();

  async function add(e) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return toast("Enter your friend's name.");
    if (await write(() => api("POST", "/api/members", { name: n }), n + " added")) setName("");
  }

  function remove(id) {
    if (data.expenses.some((x) => x.paidBy === id || x.addedBy === id || (x.split || []).includes(id))) {
      return toast(h.nameOf(id) + " is part of an expense, so they can't be removed.");
    }
    if (arm(id)) write(() => api("DELETE", "/api/members/" + id), "Removed");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(location.origin);
      toast("Link copied");
    } catch {
      const r = document.createRange();
      r.selectNodeContents(urlRef.current);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      toast("Link selected. Copy it from here.");
    }
  }

  return (
    <>
      <section className="card stack" style={{ gap: 12 }}>
        <h2>Your friends</h2>
        <form className="stack" style={{ gap: 8 }} onSubmit={add}>
          <input type="text" placeholder="Friend's name" maxLength={40} autoComplete="off" aria-label="Friend's name" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn" type="submit">Add</button>
        </form>
        <div className="list">
          {data.members.map((m) => (
            <div key={m.id} className="item" style={{ alignItems: "center" }}>
              <Avatar member={m} />
              <div className="main"><div className="t">{m.name}<You id={m.id} /></div></div>
              {m.id !== meId && (
                <button className="btn link danger" type="button" onClick={() => remove(m.id)}>{pendingDel === m.id ? "Tap again" : "Remove"}</button>
              )}
            </div>
          ))}
        </div>
        <div className="hint">New friends aren't added to existing trips automatically. Use “Edit trip” on the Dashboard to add them.</div>
      </section>
      <section className="card stack" style={{ gap: 8 }}>
        <h2>Inviting friends</h2>
        <div className="hint" style={{ fontSize: ".9rem" }}>Add a friend's name here, then send them this app's link and the group password. They type the password and tap their name. Only the people on this list can sign in. Only the person who adds an expense can delete it; everyone else can raise a dispute.</div>
        <div className="row">
          <span className="s" ref={urlRef} style={{ overflowWrap: "anywhere" }}>{location.origin}</span>
          <button className="btn small ghost" type="button" onClick={copyLink}>Copy link</button>
        </div>
      </section>
    </>
  );
}
