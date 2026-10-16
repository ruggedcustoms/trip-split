import { useApp } from "../App.jsx";
import { fmtRange, inr, plural } from "../money.js";
import { Avatar, MyPill, You } from "./bits.jsx";

export default function Home() {
  const { data, h, meId, tripId, setTab, openSheet, openTrip } = useApp();

  const all = { paid: 0, share: 0, bal: 0, total: 0 }, per = {}, ts = {};
  data.trips.forEach((t) => {
    const s = h.stats(t.id);
    ts[t.id] = s;
    all.total += s.total;
    for (const k in s.paid) { per[k] = per[k] || { paid: 0, share: 0 }; per[k].paid += s.paid[k]; }
    for (const k in s.share) { per[k] = per[k] || { paid: 0, share: 0 }; per[k].share += s.share[k]; }
    all.paid += s.paid[meId] || 0;
    all.share += s.share[meId] || 0;
    all.bal += s.bal[meId] || 0;
  });

  const rows = data.members
    .map((m) => ({ m, share: (per[m.id] || {}).share || 0, paid: (per[m.id] || {}).paid || 0 }))
    .sort((a, b) => b.share - a.share);
  const max = Math.max(1, ...rows.map((r) => r.share));

  return (
    <>
      <section className="card hero stack" style={{ gap: 10 }}>
        <span className="label">You've spent across {plural(data.trips.length, "trip")}</span>
        <div className="big num">{inr(all.share)}</div>
        <div className="stats">
          <div><span className="label">You paid</span><b className="num">{inr(all.paid)}</b></div>
          <div><span className="label">{all.bal > 0 ? "Owed to you" : all.bal < 0 ? "You owe" : "Balance"}</span><b className="num">{all.bal === 0 ? "Settled" : inr(all.bal)}</b></div>
          <div><span className="label">Group total</span><b className="num">{inr(all.total)}</b></div>
        </div>
      </section>

      {data.members.length < 2 && (
        <div className="card empty"><b>Add your friends</b>Add each friend's name, then share the link and group password.
          <div style={{ marginTop: 14 }}><button className="btn" type="button" onClick={() => setTab("group")}>Add friends</button></div>
        </div>
      )}

      <section className="stack" style={{ gap: 10 }}>
        <div className="row"><h2>Trips</h2><button className="btn small" type="button" onClick={() => openSheet("trip")}>+ New trip</button></div>
        {!data.trips.length && <div className="card empty"><b>No trips yet</b>Create a trip, pick who's going, then add expenses, polls and chat to it.</div>}
        {data.trips.map((t) => {
          const s = ts[t.id], going = h.tripMemberIds(t), range = fmtRange(t), meIn = going.includes(meId), nd = h.disputedIn(t.id);
          const current = t.id === tripId;
          return (
            <div key={t.id} className={"card tripcard" + (current ? " current" : "")}>
              <button className="tripopen" type="button" onClick={() => openTrip(t.id)}>
                <div className="row" style={{ alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="tripname">{t.name}</div>
                    <div className="s">{range && range + " · "}{going.length} going · {plural(s.count, "expense")}</div>
                    {nd > 0 && <span className="pill bad" style={{ display: "inline-block", marginTop: 4 }}>{nd} disputed</span>}
                  </div>
                  <div style={{ textAlign: "right" }}><div className="amt num">{inr(s.total)}</div><div className="s">total</div></div>
                </div>
                {meIn && (
                  <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
                    <span className="s num">You spent {inr(s.share[meId] || 0)} · paid {inr(s.paid[meId] || 0)}</span>
                    <MyPill v={s.bal[meId] || 0} />
                  </div>
                )}
              </button>
              <div className="foot">
                <span className="hint">{current ? "Current trip" : "Tap to open"}</span>
                <button className="btn link" type="button" onClick={() => openSheet("trip", t)}>Edit trip</button>
              </div>
            </div>
          );
        })}
      </section>

      {data.trips.length > 0 && all.total > 0 && (
        <section className="card stack" style={{ gap: 12 }}>
          <div className="row"><h2>Who spent what</h2><span className="hint">all trips</span></div>
          <div className="list">
            {rows.map((r) => (
              <div key={r.m.id} className="item" style={{ alignItems: "center" }}>
                <Avatar member={r.m} />
                <div className="main">
                  <div className="row"><span className="t">{r.m.name}<You id={r.m.id} /></span><span className="amt num">{inr(r.share)}</span></div>
                  <div className="track"><i style={{ width: Math.round((r.share / max) * 100) + "%" }}></i></div>
                  <div className="s num" style={{ marginTop: 4 }}>Paid {inr(r.paid)}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="hint">“Spent” is each person's share of the bills. “Paid” is what they paid upfront.</div>
        </section>
      )}
    </>
  );
}
