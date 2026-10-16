import { useApp, useArm } from "../App.jsx";
import { api } from "../api.js";
import { fmtDate, inr, settlements, shares } from "../money.js";
import { Avatar, NoTrip, You } from "./bits.jsx";

export default function Money() {
  const { data, h, meId, trip: t, openSheet, write } = useApp();
  const [pendingDel, arm] = useArm();
  if (!t) return <NoTrip />;

  const s = h.stats(t.id), st = settlements(s.bal), mem = h.membersOf(t), meIn = h.tripMemberIds(t).includes(meId);
  const b = s.bal[meId] || 0;
  const nd = h.disputedIn(t.id);
  const list = h.expOf(t.id);
  const who = (id, you = "You") => (id === meId ? you : h.nameOf(id));

  return (
    <>
      <section className="card hero stack" style={{ gap: 10 }}>
        <span className="label">Trip total</span>
        <div className="big num">{inr(s.total)}</div>
        {meIn ? (
          <div className="stats">
            <div><span className="label">You spent</span><b className="num">{inr(s.share[meId] || 0)}</b></div>
            <div><span className="label">You paid</span><b className="num">{inr(s.paid[meId] || 0)}</b></div>
            <div><span className="label">{b > 0 ? "Owed to you" : b < 0 ? "You owe" : "Balance"}</span><b className="num">{b === 0 ? "Settled" : inr(b)}</b></div>
          </div>
        ) : (
          <div className="stats">
            <div><span className="label">Expenses</span><b className="num">{s.count}</b></div>
            <div><span className="label">People</span><b className="num">{mem.length}</b></div>
            <div><span className="label">Per person</span><b className="num">{inr(mem.length ? Math.round(s.total / mem.length) : 0)}</b></div>
          </div>
        )}
      </section>

      <section className="card stack" style={{ gap: 12 }}>
        <div className="row"><h2>Settle up</h2><span className="hint">fewest payments</span></div>
        {nd > 0 && (
          <div className="dispute">
            <span className="who">{nd} expense{nd > 1 ? "s are" : " is"} disputed</span>
            <span>These amounts may change. Sort out the dispute{nd > 1 ? "s" : ""} before anyone pays.</span>
          </div>
        )}
        {!st.length ? <div className="hint">Everyone is even. Nothing to pay.</div> : (
          <>
            <div className="list">
              {st.map((x) => (
                <div key={x.from + x.to} className="item">
                  <div className="main settle"><b>{who(x.from)}</b><span className="arrow">pays</span><b>{who(x.to, "you")}</b></div>
                  <div className={"amt num " + (x.from === meId ? "neg" : x.to === meId ? "pos" : "")}>{inr(x.v)}</div>
                </div>
              ))}
            </div>
            <div className="hint">After paying someone back, add it as an expense: paid by the payer, split with only the person they paid.</div>
          </>
        )}
      </section>

      <section className="card stack" style={{ gap: 12 }}>
        <div className="row"><h2>Who spent what</h2><span className="hint">this trip</span></div>
        <div className="list">
          {mem.slice().sort((a, c) => (s.share[c.id] || 0) - (s.share[a.id] || 0)).map((m) => {
            const v = s.bal[m.id] || 0;
            return (
              <div key={m.id} className="item" style={{ alignItems: "center" }}>
                <Avatar member={m} />
                <div className="main"><div className="t">{m.name}<You id={m.id} /></div><div className="s num">Spent {inr(s.share[m.id] || 0)} · Paid {inr(s.paid[m.id] || 0)}</div></div>
                <div className={"amt num " + (v > 0 ? "pos" : v < 0 ? "neg" : "")}>{v > 0 ? "+" : v < 0 ? "−" : ""}{inr(v)}</div>
              </div>
            );
          })}
        </div>
        <div className="hint">Green gets money back, red owes money.</div>
      </section>

      <section className="card stack" style={{ gap: 12 }}>
        <div className="row">
          <h2>Expenses</h2>
          {list.length > 0 && <a className="btn small ghost" href={"/api/trips/" + encodeURIComponent(t.id) + "/export.csv"} download>Download CSV</a>}
        </div>
        {!list.length ? <div className="empty"><b>No expenses yet</b>Tap “Add expense” to log the first bill for this trip.</div> : (
          <div className="list">
            {list.map((e) => {
              const my = shares(e)[meId] || 0, mine = e.addedBy === meId, ds = h.openDisp(e);
              const myD = ds.find((d) => d.memberId === meId);
              return (
                <div key={e.id} className="item">
                  <div className="main">
                    <div className="t">{e.desc}</div>
                    <div className="s">{who(e.paidBy)} paid · split {(e.split || []).length} ways · {fmtDate(e.date)}{my ? " · your share " + inr(my) : ""}</div>
                    <div className="s">Added by {who(e.addedBy, "you")}</div>
                    {ds.map((d) => (
                      <div key={d.id} className="dispute">
                        <span className="who">{who(d.memberId)} disputed this</span>
                        <span>{d.reason}</span>
                        {mine && <button className="btn link" type="button" onClick={() => write(() => api("POST", "/api/disputes/" + d.id + "/resolve"), "Marked resolved")}>Mark resolved</button>}
                      </div>
                    ))}
                    <div className="acts">
                      {mine ? (
                        <button className="btn link danger" type="button" onClick={() => { if (arm(e.id)) write(() => api("DELETE", "/api/expenses/" + e.id), "Expense deleted"); }}>
                          {pendingDel === e.id ? "Tap again to delete" : "Delete"}
                        </button>
                      ) : myD ? (
                        <button className="btn link" type="button" onClick={() => write(() => api("DELETE", "/api/expenses/" + e.id + "/dispute"), "Dispute withdrawn")}>Withdraw my dispute</button>
                      ) : (
                        <button className="btn link danger" type="button" onClick={() => openSheet("dispute", e)}>Raise dispute</button>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="amt num">{inr(e.paise)}</div>
                    {ds.length > 0 && <span className="pill bad" style={{ display: "inline-block", marginTop: 4 }}>Disputed</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
