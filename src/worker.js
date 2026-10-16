// Trip Split — Cloudflare Worker
// Serves the app from /public and a small JSON API under /api/.
// Sign-in is a group password plus picking your name (see "sign-in" below);
// the organizer has a separate password.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      return await handleApi(request, env, url);
    } catch (e) {
      if (e instanceof HttpError) return err(e.message, e.status);
      console.error(e);
      return err("Something went wrong on the server. Try again.", 500);
    }
  },
};

/* ------------------------------------------------------------------ helpers */

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}
const err = (message, status = 400, headers = {}) => json({ error: message }, status, headers);

async function readBody(request) {
  const text = await request.text();
  if (text.length > 20000) fail(413, "That's too much data in one go.");
  if (!text) return {};
  try { const b = JSON.parse(text); return b && typeof b === "object" ? b : {}; }
  catch { fail(400, "The app sent something the server couldn't read. Reload and try again."); }
}

function str(v, max, label, { required = true } = {}) {
  const s = typeof v === "string" ? v.trim() : "";
  if (required && !s) fail(400, `${label} can't be empty.`);
  if (s.length > max) fail(400, `${label} is too long (max ${max} characters).`);
  return s;
}
const isDate = (s) => s === "" || /^\d{4}-\d{2}-\d{2}$/.test(s);
const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 20);
const parseArr = (s) => { try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch { return []; } };

const bump = (env) => env.DB.prepare("UPDATE meta SET v = v + 1 WHERE k = 'version'");
async function run(env, ...statements) { await env.DB.batch([...statements, bump(env)]); }

/* ----------------------------------------------------------------- sign-in */

// Friends sign in with the group password and pick their name; the organizer
// uses the organizer password. The session is a signed cookie. Each signature
// covers the password it was issued with, so changing a password signs
// everyone who used it out.

const COOKIE = "ts_session";
const YEAR = 365 * 24 * 3600;

function bytesToB64url(bytes) {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function requireSecrets(env) {
  if (!env.GROUP_PASSWORD || !env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    fail(500, "Sign-in isn't set up yet. Set GROUP_PASSWORD, ADMIN_PASSWORD and SESSION_SECRET with `npx wrangler secret put`.");
  }
}

async function sign(env, memberId, kind) {
  const pw = kind === "a" ? env.ADMIN_PASSWORD : env.GROUP_PASSWORD;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${memberId}.${kind}.${pw}`));
  return bytesToB64url(mac);
}

// Constant-time comparison, so response timing doesn't leak how much of a guess was right.
function same(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function readCookie(request, name) {
  const c = request.headers.get("cookie") || "";
  const m = c.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? m[1] : null;
}

async function sessionCookie(env, memberId, kind) {
  const value = `${memberId}.${kind}.${await sign(env, memberId, kind)}`;
  return `${COOKIE}=${value}; Path=/; Max-Age=${YEAR}; HttpOnly; Secure; SameSite=Lax`;
}
const clearCookie = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

// Returns { memberId, kind } for a valid session cookie, or null.
async function readSession(request, env) {
  const raw = readCookie(request, COOKIE);
  if (!raw) return null;
  const [memberId, kind, sig] = raw.split(".");
  if (!memberId || (kind !== "a" && kind !== "m") || !sig) return null;
  if (!same(sig, await sign(env, memberId, kind))) return null;
  return { memberId, kind };
}

const adminEmail = (env) => String(env.ADMIN_EMAIL || "organizer").trim().toLowerCase();

async function handleLogin(request, env) {
  const b = await readBody(request);
  const password = typeof b.password === "string" ? b.password : "";
  // Slow down password guessing a little.
  await new Promise((r) => setTimeout(r, 400));

  if (same(password, env.ADMIN_PASSWORD)) {
    let row = await env.DB.prepare("SELECT * FROM members WHERE email = ?").bind(adminEmail(env)).first();
    if (!row) {
      if (!b.name) return json({ needName: true });
      const name = str(b.name, 40, "Your name");
      const id = newId();
      await run(env, env.DB.prepare("INSERT INTO members (id, name, email, created_at) VALUES (?, ?, ?, ?)").bind(id, name, adminEmail(env), Date.now()));
      row = { id };
    }
    return json({ ok: true }, 200, { "set-cookie": await sessionCookie(env, row.id, "a") });
  }

  if (same(password, env.GROUP_PASSWORD)) {
    const friends = (await env.DB.prepare("SELECT id, name FROM members WHERE email != ? ORDER BY name").bind(adminEmail(env)).all()).results;
    if (!b.memberId) return json({ pickName: true, members: friends });
    if (!friends.some((f) => f.id === b.memberId)) fail(400, "Pick your name from the list.");
    return json({ ok: true }, 200, { "set-cookie": await sessionCookie(env, b.memberId, "m") });
  }

  fail(401, "That password isn't right.");
}

/* --------------------------------------------------------------- data maps */

const mapMember = (r) => ({ id: r.id, name: r.name, email: r.email, createdAt: r.created_at });
const mapTrip = (r) => ({ id: r.id, name: r.name, start: r.start_date, end: r.end_date, members: parseArr(r.members), createdAt: r.created_at, createdBy: r.created_by });
const mapExpense = (r) => ({ id: r.id, tripId: r.trip_id, desc: r.descr, paise: r.paise, paidBy: r.paid_by, split: parseArr(r.split), date: r.date, createdAt: r.created_at, addedBy: r.added_by });
const mapDispute = (r) => ({ id: r.id, expenseId: r.expense_id, tripId: r.trip_id, memberId: r.member_id, reason: r.reason, status: r.status, at: r.at, resolvedAt: r.resolved_at, resolvedBy: r.resolved_by });
const mapPoll = (r) => ({ id: r.id, tripId: r.trip_id, question: r.question, options: parseArr(r.options), closed: !!r.closed, createdAt: r.created_at, createdBy: r.created_by });
const mapVote = (r) => ({ id: r.poll_id + "__" + r.member_id, pollId: r.poll_id, memberId: r.member_id, option: r.option });
const mapMessage = (r) => ({ id: r.id, tripId: r.trip_id, memberId: r.member_id, text: r.text, at: r.at });

async function getTrip(env, id) {
  const r = await env.DB.prepare("SELECT * FROM trips WHERE id = ?").bind(id).first();
  if (!r) fail(404, "That trip doesn't exist any more.");
  return mapTrip(r);
}
async function tripMemberIds(env, trip) {
  const all = (await env.DB.prepare("SELECT id FROM members").all()).results.map((r) => r.id);
  return trip.members.length ? trip.members.filter((id) => all.includes(id)) : all;
}
async function requireOnTrip(env, trip, me) {
  const ids = await tripMemberIds(env, trip);
  if (!ids.includes(me.id)) fail(403, "You're not on this trip. Ask someone to add you with “Edit trip”.");
  return ids;
}

/* --------------------------------------------------------------------- API */

async function handleApi(request, env, url) {
  requireSecrets(env);
  const path = url.pathname.replace(/\/+$/, "");
  const method = request.method;
  let m;

  if (path === "/api/login" && method === "POST") return handleLogin(request, env);
  if (path === "/api/logout" && method === "POST") return json({ ok: true }, 200, { "set-cookie": clearCookie });

  const session = await readSession(request, env);
  const meRow = session && await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(session.memberId).first();
  if (!meRow) return err("You're not signed in.", 401, { "set-cookie": clearCookie });
  const me = mapMember(meRow);
  const admin = session.kind === "a" && meRow.email === adminEmail(env);

  if (path === "/api/me" && method === "GET") return json({ admin, member: me });

  // --- reads -------------------------------------------------------------
  if (path === "/api/version" && method === "GET") {
    const r = await env.DB.prepare("SELECT v FROM meta WHERE k = 'version'").first();
    return json({ version: r ? r.v : 0 });
  }
  if (path === "/api/state" && method === "GET") {
    const q = (sql) => env.DB.prepare(sql);
    const [members, trips, expenses, disputes, polls, votes, ver] = await env.DB.batch([
      q("SELECT * FROM members ORDER BY created_at"),
      q("SELECT * FROM trips ORDER BY start_date DESC, created_at DESC"),
      q("SELECT * FROM expenses ORDER BY date DESC, created_at DESC"),
      q("SELECT * FROM disputes ORDER BY at"),
      q("SELECT * FROM polls ORDER BY closed, created_at DESC"),
      q("SELECT * FROM votes"),
      q("SELECT v FROM meta WHERE k = 'version'"),
    ]);
    return json({
      me: me.id,
      admin,
      version: ver.results[0] ? ver.results[0].v : 0,
      members: members.results.map(mapMember),
      trips: trips.results.map(mapTrip),
      expenses: expenses.results.map(mapExpense),
      disputes: disputes.results.map(mapDispute),
      polls: polls.results.map(mapPoll),
      votes: votes.results.map(mapVote),
    });
  }
  if (path === "/api/messages" && method === "GET") {
    const tripId = url.searchParams.get("trip") || "";
    const rows = (await env.DB.prepare("SELECT * FROM messages WHERE trip_id = ? ORDER BY at DESC LIMIT 300").bind(tripId).all()).results;
    return json({ messages: rows.reverse().map(mapMessage) });
  }

  // --- members -----------------------------------------------------------
  if (path === "/api/members" && method === "POST") {
    const b = await readBody(request);
    const name = str(b.name, 40, "Name");
    if (await env.DB.prepare("SELECT 1 FROM members WHERE lower(name) = lower(?)").bind(name).first()) fail(409, `${name} is already in the group. Use a different name, like adding an initial.`);
    // Emails aren't used for sign-in any more; the column is unique, so store a placeholder.
    const id = newId();
    await run(env, env.DB.prepare("INSERT INTO members (id, name, email, created_at) VALUES (?, ?, ?, ?)").bind(id, name, `${id}@member`, Date.now()));
    return json({ ok: true });
  }
  if ((m = path.match(/^\/api\/members\/([\w-]+)$/)) && method === "DELETE") {
    const id = m[1];
    if (id === me.id) fail(400, "You can't remove yourself.");
    const like = `%"${id}"%`;
    const used = await env.DB.prepare("SELECT 1 FROM expenses WHERE paid_by = ? OR added_by = ? OR split LIKE ? LIMIT 1").bind(id, id, like).first();
    if (used) fail(409, "This friend is part of an expense, so they can't be removed.");
    await run(env,
      env.DB.prepare("DELETE FROM members WHERE id = ?").bind(id),
      env.DB.prepare("DELETE FROM votes WHERE member_id = ?").bind(id),
      env.DB.prepare("DELETE FROM disputes WHERE member_id = ?").bind(id),
    );
    return json({ ok: true });
  }

  // --- trips -------------------------------------------------------------
  async function tripFields(b) {
    const name = str(b.name, 50, "Trip name");
    const start = typeof b.start === "string" ? b.start : "";
    const end = typeof b.end === "string" ? b.end : "";
    if (!isDate(start) || !isDate(end)) fail(400, "Dates must be real dates.");
    if (start && end && end < start) fail(400, "The end date is before the start date.");
    const all = (await env.DB.prepare("SELECT id FROM members").all()).results.map((r) => r.id);
    const members = Array.isArray(b.members) ? [...new Set(b.members.filter((x) => all.includes(x)))] : [];
    if (!members.length) fail(400, "Pick at least one person who's going.");
    return { name, start, end, members };
  }
  if (path === "/api/trips" && method === "POST") {
    const f = await tripFields(await readBody(request));
    const id = newId();
    await run(env, env.DB.prepare("INSERT INTO trips (id, name, start_date, end_date, members, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, f.name, f.start, f.end, JSON.stringify(f.members), Date.now(), me.id));
    return json({ ok: true, id });
  }
  if ((m = path.match(/^\/api\/trips\/([\w-]+)$/)) && method === "PUT") {
    const trip = await getTrip(env, m[1]);
    const f = await tripFields(await readBody(request));
    const used = new Set();
    (await env.DB.prepare("SELECT paid_by, split FROM expenses WHERE trip_id = ?").bind(trip.id).all()).results
      .forEach((r) => { used.add(r.paid_by); parseArr(r.split).forEach((x) => used.add(x)); });
    const stuck = [...used].filter((id) => !f.members.includes(id));
    if (stuck.length) {
      const names = (await env.DB.prepare(`SELECT name FROM members WHERE id IN (${stuck.map(() => "?").join(",")})`).bind(...stuck).all()).results.map((r) => r.name);
      if (names.length) fail(409, `${names.join(", ")} already ${names.length > 1 ? "have" : "has"} expenses on this trip, so they stay on it.`);
    }
    await run(env, env.DB.prepare("UPDATE trips SET name = ?, start_date = ?, end_date = ?, members = ? WHERE id = ?")
      .bind(f.name, f.start, f.end, JSON.stringify(f.members), trip.id));
    return json({ ok: true });
  }
  if ((m = path.match(/^\/api\/trips\/([\w-]+)$/)) && method === "DELETE") {
    const trip = await getTrip(env, m[1]);
    if (await env.DB.prepare("SELECT 1 FROM expenses WHERE trip_id = ? LIMIT 1").bind(trip.id).first()) {
      fail(409, "Delete this trip's expenses first, then delete the trip.");
    }
    await run(env,
      env.DB.prepare("DELETE FROM votes WHERE poll_id IN (SELECT id FROM polls WHERE trip_id = ?)").bind(trip.id),
      env.DB.prepare("DELETE FROM polls WHERE trip_id = ?").bind(trip.id),
      env.DB.prepare("DELETE FROM messages WHERE trip_id = ?").bind(trip.id),
      env.DB.prepare("DELETE FROM disputes WHERE trip_id = ?").bind(trip.id),
      env.DB.prepare("DELETE FROM trips WHERE id = ?").bind(trip.id),
    );
    return json({ ok: true });
  }
  if ((m = path.match(/^\/api\/trips\/([\w-]+)\/export\.csv$/)) && method === "GET") {
    return exportCsv(env, await getTrip(env, m[1]));
  }

  // --- expenses ----------------------------------------------------------
  if (path === "/api/expenses" && method === "POST") {
    const b = await readBody(request);
    const trip = await getTrip(env, String(b.tripId || ""));
    const ids = await requireOnTrip(env, trip, me);
    const desc = str(b.desc, 60, "What for");
    const paise = Number(b.paise);
    if (!Number.isInteger(paise) || paise <= 0 || paise > 1e11) fail(400, "Enter an amount above ₹0.");
    const paidBy = String(b.paidBy || "");
    if (!ids.includes(paidBy)) fail(400, "The person who paid must be on this trip.");
    const split = Array.isArray(b.split) ? [...new Set(b.split.filter((x) => ids.includes(x)))] : [];
    if (!split.length) fail(400, "Pick at least one person to split with.");
    const date = typeof b.date === "string" && b.date ? b.date : new Date().toISOString().slice(0, 10);
    if (!isDate(date)) fail(400, "That date isn't valid.");
    await run(env, env.DB.prepare("INSERT INTO expenses (id, trip_id, descr, paise, paid_by, split, date, created_at, added_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(newId(), trip.id, desc, paise, paidBy, JSON.stringify(split), date, Date.now(), me.id));
    return json({ ok: true });
  }
  if ((m = path.match(/^\/api\/expenses\/([\w-]+)$/)) && method === "DELETE") {
    const e = await env.DB.prepare("SELECT * FROM expenses WHERE id = ?").bind(m[1]).first();
    if (!e) fail(404, "That expense was already deleted.");
    if (e.added_by !== me.id) fail(403, "Only the person who added this expense can delete it. You can raise a dispute instead.");
    await run(env,
      env.DB.prepare("DELETE FROM disputes WHERE expense_id = ?").bind(e.id),
      env.DB.prepare("DELETE FROM expenses WHERE id = ?").bind(e.id),
    );
    return json({ ok: true });
  }

  // --- disputes ----------------------------------------------------------
  if ((m = path.match(/^\/api\/expenses\/([\w-]+)\/dispute$/)) && (method === "PUT" || method === "DELETE")) {
    const e = await env.DB.prepare("SELECT * FROM expenses WHERE id = ?").bind(m[1]).first();
    if (!e) fail(404, "That expense was deleted.");
    const id = e.id + "__" + me.id;
    if (method === "DELETE") {
      await run(env, env.DB.prepare("DELETE FROM disputes WHERE id = ?").bind(id));
      return json({ ok: true });
    }
    if (e.added_by === me.id) fail(400, "You added this expense, so you can delete it instead of disputing it.");
    await requireOnTrip(env, await getTrip(env, e.trip_id), me);
    const reason = str((await readBody(request)).reason, 200, "The reason");
    await run(env, env.DB.prepare(
      "INSERT INTO disputes (id, expense_id, trip_id, member_id, reason, status, at) VALUES (?, ?, ?, ?, ?, 'open', ?) " +
      "ON CONFLICT(id) DO UPDATE SET reason = excluded.reason, status = 'open', at = excluded.at, resolved_at = NULL, resolved_by = NULL",
    ).bind(id, e.id, e.trip_id, me.id, reason, Date.now()));
    return json({ ok: true });
  }
  if ((m = path.match(/^\/api\/disputes\/([\w-]+)\/resolve$/)) && method === "POST") {
    const d = await env.DB.prepare("SELECT * FROM disputes WHERE id = ?").bind(m[1]).first();
    if (!d) fail(404, "That dispute was withdrawn.");
    const e = await env.DB.prepare("SELECT added_by FROM expenses WHERE id = ?").bind(d.expense_id).first();
    if (!e || e.added_by !== me.id) fail(403, "Only the person who added the expense can mark a dispute resolved.");
    await run(env, env.DB.prepare("UPDATE disputes SET status = 'resolved', resolved_at = ?, resolved_by = ? WHERE id = ?").bind(Date.now(), me.id, d.id));
    return json({ ok: true });
  }

  // --- polls -------------------------------------------------------------
  if (path === "/api/polls" && method === "POST") {
    const b = await readBody(request);
    const trip = await getTrip(env, String(b.tripId || ""));
    await requireOnTrip(env, trip, me);
    const question = str(b.question, 100, "The question");
    const options = (Array.isArray(b.options) ? b.options : []).map((o) => str(o, 60, "An option", { required: false })).filter(Boolean).slice(0, 8);
    if (options.length < 2) fail(400, "Add at least two options.");
    await run(env, env.DB.prepare("INSERT INTO polls (id, trip_id, question, options, closed, created_at, created_by) VALUES (?, ?, ?, ?, 0, ?, ?)")
      .bind(newId(), trip.id, question, JSON.stringify(options), Date.now(), me.id));
    return json({ ok: true });
  }
  if ((m = path.match(/^\/api\/polls\/([\w-]+)\/(close|reopen)$/)) && method === "POST") {
    const p = await env.DB.prepare("SELECT id FROM polls WHERE id = ?").bind(m[1]).first();
    if (!p) fail(404, "That poll was deleted.");
    await run(env, env.DB.prepare("UPDATE polls SET closed = ? WHERE id = ?").bind(m[2] === "close" ? 1 : 0, p.id));
    return json({ ok: true });
  }
  if ((m = path.match(/^\/api\/polls\/([\w-]+)$/)) && method === "DELETE") {
    await run(env,
      env.DB.prepare("DELETE FROM votes WHERE poll_id = ?").bind(m[1]),
      env.DB.prepare("DELETE FROM polls WHERE id = ?").bind(m[1]),
    );
    return json({ ok: true });
  }
  if ((m = path.match(/^\/api\/polls\/([\w-]+)\/vote$/)) && (method === "PUT" || method === "DELETE")) {
    const pr = await env.DB.prepare("SELECT * FROM polls WHERE id = ?").bind(m[1]).first();
    if (!pr) fail(404, "That poll was deleted.");
    const poll = mapPoll(pr);
    if (poll.closed) fail(409, "This poll is closed.");
    await requireOnTrip(env, await getTrip(env, poll.tripId), me);
    if (method === "DELETE") {
      await run(env, env.DB.prepare("DELETE FROM votes WHERE poll_id = ? AND member_id = ?").bind(poll.id, me.id));
      return json({ ok: true });
    }
    const option = Number((await readBody(request)).option);
    if (!Number.isInteger(option) || option < 0 || option >= poll.options.length) fail(400, "That option doesn't exist.");
    await run(env, env.DB.prepare(
      "INSERT INTO votes (poll_id, member_id, option, at) VALUES (?, ?, ?, ?) ON CONFLICT(poll_id, member_id) DO UPDATE SET option = excluded.option, at = excluded.at",
    ).bind(poll.id, me.id, option, Date.now()));
    return json({ ok: true });
  }

  // --- chat --------------------------------------------------------------
  if (path === "/api/messages" && method === "POST") {
    const b = await readBody(request);
    const trip = await getTrip(env, String(b.tripId || ""));
    await requireOnTrip(env, trip, me);
    const text = str(b.text, 500, "Message");
    await run(env, env.DB.prepare("INSERT INTO messages (id, trip_id, member_id, text, at) VALUES (?, ?, ?, ?, ?)")
      .bind(newId(), trip.id, me.id, text, Date.now()));
    return json({ ok: true });
  }

  return err("Not found.", 404);
}

/* ------------------------------------------------------------- CSV export */

function shares(paise, split) {
  const ids = [...split].sort(), n = ids.length, out = {};
  if (!n) return out;
  const base = Math.floor(paise / n);
  let rem = paise - base * n;
  ids.forEach((id) => { out[id] = base + (rem > 0 ? 1 : 0); if (rem > 0) rem--; });
  return out;
}

async function exportCsv(env, trip) {
  const members = (await env.DB.prepare("SELECT * FROM members").all()).results;
  const name = (id) => (members.find((m) => m.id === id) || {}).name || "Former member";
  const expenses = (await env.DB.prepare("SELECT * FROM expenses WHERE trip_id = ? ORDER BY date, created_at").bind(trip.id).all()).results;
  const disputed = new Set((await env.DB.prepare("SELECT expense_id FROM disputes WHERE trip_id = ? AND status = 'open'").bind(trip.id).all()).results.map((r) => r.expense_id));
  const cell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rupees = (p) => (p / 100).toFixed(2);

  const rows = [["Date", "What for", "Amount (INR)", "Paid by", "Split between", "Added by", "Disputed"]];
  const paid = {}, spent = {};
  for (const e of expenses) {
    const split = parseArr(e.split);
    rows.push([e.date, e.descr, rupees(e.paise), name(e.paid_by), split.map(name).join(" + "), name(e.added_by), disputed.has(e.id) ? "Yes" : ""]);
    paid[e.paid_by] = (paid[e.paid_by] || 0) + e.paise;
    const sh = shares(e.paise, split);
    for (const k in sh) spent[k] = (spent[k] || 0) + sh[k];
  }
  rows.push([], ["Person", "Spent (share)", "Paid", "Balance (+ gets back, - owes)"]);
  const ids = new Set([...Object.keys(paid), ...Object.keys(spent)]);
  for (const id of ids) rows.push([name(id), rupees(spent[id] || 0), rupees(paid[id] || 0), rupees((paid[id] || 0) - (spent[id] || 0))]);

  const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
  const file = (trip.name.replace(/[^\w\- ]+/g, "").trim() || "trip").replace(/\s+/g, "-") + "-expenses.csv";
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${file}"`,
      "cache-control": "no-store",
    },
  });
}
