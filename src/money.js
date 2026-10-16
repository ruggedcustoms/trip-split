// Formatting and trip maths. All amounts are in paise.

export const inr = (p) => "₹" + (Math.abs(p) / 100).toLocaleString("en-IN", { minimumFractionDigits: Math.abs(p) % 100 ? 2 : 0, maximumFractionDigits: 2 });
export const initials = (n) => String(n).trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";
export const fmtDate = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }); } catch { return d; } };
export const fmtRange = (t) => (t.start && t.end ? fmtDate(t.start) + " – " + fmtDate(t.end) : t.start ? "From " + fmtDate(t.start) : "");
export const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
export const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");

// Splits an expense equally; leftover paise go one each to the first ids in sorted order.
export function shares(e) {
  const ids = (e.split || []).slice().sort(), n = ids.length;
  if (!n) return {};
  const base = Math.floor(e.paise / n);
  let rem = e.paise - base * n;
  const out = {};
  ids.forEach((id) => { out[id] = base + (rem > 0 ? 1 : 0); if (rem > 0) rem--; });
  return out;
}

// Fewest payments that settle the balances (positive = gets money back).
export function settlements(bal) {
  const cr = [], dr = [];
  for (const id in bal) { if (bal[id] > 0) cr.push({ id, v: bal[id] }); else if (bal[id] < 0) dr.push({ id, v: -bal[id] }); }
  cr.sort((a, b) => b.v - a.v); dr.sort((a, b) => b.v - a.v);
  const out = [];
  let i = 0, j = 0;
  while (i < dr.length && j < cr.length) {
    const x = Math.min(dr[i].v, cr[j].v);
    if (x > 0) out.push({ from: dr[i].id, to: cr[j].id, v: x });
    dr[i].v -= x; cr[j].v -= x;
    if (dr[i].v <= 0) i++;
    if (cr[j].v <= 0) j++;
  }
  return out;
}

// Lookups over the loaded data.
export function helpers(S) {
  const nameOf = (id) => { const m = S.members.find((m) => m.id === id); return m ? m.name : "Former member"; };
  const tripMemberIds = (t) => (t && t.members && t.members.length ? t.members.filter((id) => S.members.some((m) => m.id === id)) : S.members.map((m) => m.id));
  const membersOf = (t) => { const ids = tripMemberIds(t); return S.members.filter((m) => ids.includes(m.id)); };
  const expOf = (id) => S.expenses.filter((e) => e.tripId === id);
  const openDisp = (e) => S.disputes.filter((d) => d.expenseId === e.id && d.status !== "resolved");
  const disputedIn = (id) => expOf(id).filter((e) => openDisp(e).length).length;
  function stats(id) {
    const paid = {}, share = {}, bal = {};
    let total = 0;
    const list = expOf(id);
    list.forEach((e) => {
      if (!e.paise || !e.paidBy) return;
      total += e.paise;
      paid[e.paidBy] = (paid[e.paidBy] || 0) + e.paise;
      bal[e.paidBy] = (bal[e.paidBy] || 0) + e.paise;
      const sh = shares(e);
      for (const k in sh) { share[k] = (share[k] || 0) + sh[k]; bal[k] = (bal[k] || 0) - sh[k]; }
    });
    return { total, paid, share, bal, count: list.length };
  }
  return { nameOf, tripMemberIds, membersOf, expOf, openDisp, disputedIn, stats };
}
