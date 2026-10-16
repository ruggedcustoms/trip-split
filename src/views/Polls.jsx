import { useApp, useArm } from "../App.jsx";
import { api } from "../api.js";
import { NoTrip } from "./bits.jsx";

export default function Polls() {
  const { data, h, meId, trip: t, write } = useApp();
  const [pendingDel, arm] = useArm();
  if (!t) return <NoTrip />;

  const mem = h.membersOf(t), polls = data.polls.filter((p) => p.tripId === t.id);
  if (!polls.length) return <div className="card empty"><b>No polls for this trip yet</b>Ask the group something: where to stay, which day to leave, where to eat.</div>;

  const who = (id, you = "You") => (id === meId ? you : h.nameOf(id));
  const canVote = mem.some((m) => m.id === meId);

  return polls.map((p) => {
    const votes = data.votes.filter((v) => v.pollId === p.id && mem.some((m) => m.id === v.memberId));
    const counts = (p.options || []).map((_, i) => votes.filter((v) => v.option === i));
    const max = Math.max(0, ...counts.map((c) => c.length));
    const myVote = votes.find((v) => v.memberId === meId);
    const pending = mem.filter((m) => !votes.some((v) => v.memberId === m.id));

    const vote = (i) => write(() => (myVote && myVote.option === i
      ? api("DELETE", "/api/polls/" + p.id + "/vote")
      : api("PUT", "/api/polls/" + p.id + "/vote", { option: i })));

    return (
      <section key={p.id} className="card">
        <div className="row" style={{ alignItems: "flex-start" }}>
          <h2>{p.question}</h2>
          <span className={"pill " + (p.closed ? "" : "open")}>{p.closed ? "Closed" : "Open"}</span>
        </div>
        <div className="hint" style={{ marginTop: 4 }}>{votes.length} of {mem.length} voted{p.createdBy && " · asked by " + who(p.createdBy, "you")}</div>
        <div className="opts">
          {(p.options || []).map((o, i) => {
            const c = counts[i].length, pct = votes.length ? Math.round((c / votes.length) * 100) : 0;
            return (
              <button key={i} type="button" disabled={p.closed || !canVote} onClick={() => vote(i)}
                className={"opt" + (myVote && myVote.option === i ? " mine" : "") + (c && c === max ? " win" : "")}>
                <span className="fill" style={{ width: pct + "%" }}></span>
                <span>
                  <span className="tx">{o}</span>
                  {c > 0 && <div className="voters">{counts[i].map((v) => who(v.memberId)).join(", ")}</div>}
                </span>
                <span className="num" style={{ fontWeight: 700 }}>{c}</span>
              </button>
            );
          })}
        </div>
        <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
          <div className="stack" style={{ gap: 2 }}>
            {!canVote ? <span className="hint">You're not on this trip, so you can't vote.</span>
              : !p.closed && <span className="hint">{myVote ? "Tap your choice again to remove your vote." : "Tap an option to vote."}</span>}
            {!p.closed && pending.length > 0 && pending.length < mem.length && <span className="hint">Waiting on {pending.map((m) => m.name).join(", ")}</span>}
          </div>
          <div className="inline" style={{ flex: "none" }}>
            {p.closed
              ? <button className="btn link" type="button" onClick={() => write(() => api("POST", "/api/polls/" + p.id + "/reopen"), "Poll reopened")}>Reopen</button>
              : <button className="btn small ghost" type="button" onClick={() => write(() => api("POST", "/api/polls/" + p.id + "/close"), "Poll closed")}>Close poll</button>}
            <button className="btn link danger" type="button" onClick={() => { if (arm(p.id)) write(() => api("DELETE", "/api/polls/" + p.id), "Poll deleted"); }}>
              {pendingDel === p.id ? "Tap again" : "Delete"}
            </button>
          </div>
        </div>
      </section>
    );
  });
}
