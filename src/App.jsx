import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, ls } from "./api.js";
import { helpers } from "./money.js";
import Login from "./Login.jsx";
import Home from "./views/Home.jsx";
import Money from "./views/Money.jsx";
import Polls from "./views/Polls.jsx";
import Chat, { Composer } from "./views/Chat.jsx";
import Group from "./views/Group.jsx";
import SheetHost from "./sheets/SheetHost.jsx";

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

const TABS = ["home", "money", "polls", "chat", "group"];
const EMPTY = { members: [], trips: [], expenses: [], disputes: [], polls: [], votes: [] };

function initialTab() {
  const h = location.hash.slice(1);
  if (TABS.includes(h)) return h;
  const t = ls.get("ts-tab");
  return TABS.includes(t) ? t : "home";
}

export default function App() {
  const [auth, setAuth] = useState("checking"); // checking | login | in | error
  const [authError, setAuthError] = useState("");
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [data, setData] = useState(EMPTY);
  const [meId, setMeId] = useState(null);
  const [tab, setTabState] = useState(initialTab);
  const [tripId, setTripId] = useState(() => ls.get("ts-trip"));
  const [messages, setMessages] = useState([]);
  const [sheet, setSheet] = useState(null); // { kind, arg }
  const [toastMsg, setToastMsg] = useState(null);
  const [offline, setOffline] = useState(false);

  const version = useRef(-1);
  const tripRef = useRef(tripId);
  const toastTimer = useRef();

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3200);
  }, []);

  const loadMessages = useCallback(async (id) => {
    if (!id) return;
    try {
      const d = await api("GET", "/api/messages?trip=" + encodeURIComponent(id));
      if (tripRef.current === id) setMessages(d.messages);
    } catch { /* the next poll retries */ }
  }, []);

  const selectTrip = useCallback((id) => {
    tripRef.current = id;
    setTripId(id);
    if (id) ls.set("ts-trip", id);
    setMessages([]);
  }, []);

  const refresh = useCallback(async () => {
    const d = await api("GET", "/api/state");
    version.current = d.version;
    setMeId(d.me);
    setData({ members: d.members, trips: d.trips, expenses: d.expenses, disputes: d.disputes, polls: d.polls, votes: d.votes });
    if (!d.trips.some((t) => t.id === tripRef.current)) selectTrip(d.trips[0] ? d.trips[0].id : null);
    setStatus("ready");
    await loadMessages(tripRef.current);
  }, [loadMessages, selectTrip]);

  // Runs a change on the server, then reloads. Returns whether it worked.
  const write = useCallback(async (fn, okMsg) => {
    try {
      await fn();
      if (okMsg) toast(okMsg);
      await refresh();
      return true;
    } catch (e) {
      toast(e.message);
      if (e.status === 401) setTimeout(() => location.reload(), 2500);
      return false;
    }
  }, [toast, refresh]);

  const setTrip = useCallback((id) => {
    if (tripRef.current === id) return;
    selectTrip(id);
    loadMessages(id);
  }, [selectTrip, loadMessages]);

  const setTab = useCallback((t) => {
    setTabState(t);
    ls.set("ts-tab", t);
    if (t !== "chat") window.scrollTo(0, 0);
  }, []);

  const openSheet = useCallback((kind, arg = null) => setSheet({ kind, arg }), []);
  const closeSheet = useCallback(() => setSheet(null), []);

  // First load: are we signed in?
  useEffect(() => {
    api("GET", "/api/me")
      .then(() => {
        setAuth("in");
        refresh().catch((e) => { setStatus("error"); toast(e.message); });
      })
      .catch((e) => {
        if (e.status === 401) setAuth("login");
        else { setAuthError(e.message); setAuth("error"); }
      });
  }, [refresh, toast]);

  // Poll for changes made by friends.
  useEffect(() => {
    if (auth !== "in") return;
    let busy = false;
    const poll = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const d = await api("GET", "/api/version");
        setOffline(false);
        if (d.version !== version.current) await refresh();
      } catch (e) {
        if (e.status === 0) setOffline(true);
        else if (e.status === 401) location.reload();
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(poll, 4000);
    document.addEventListener("visibilitychange", poll);
    window.addEventListener("online", poll);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
      window.removeEventListener("online", poll);
    };
  }, [auth, refresh]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") closeSheet(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeSheet]);

  const h = useMemo(() => helpers(data), [data]);
  const trip = data.trips.find((t) => t.id === tripId) || null;

  const openTrip = useCallback((id) => {
    closeSheet();
    setTrip(id);
    if (tab === "home") setTab("money");
  }, [closeSheet, setTrip, setTab, tab]);

  const ctx = {
    data, h, meId, trip, tripId, messages, tab,
    setTab, setTrip, openTrip, openSheet, closeSheet, toast, write,
  };

  const ready = status === "ready";
  const hasMe = !!meId && data.members.some((m) => m.id === meId);
  const scoped = tab === "money" || tab === "polls" || tab === "chat";

  let body;
  if (auth === "login") body = <div className="gate"><Login toast={toast} /></div>;
  else if (auth === "error") {
    body = (
      <div className="gate"><div className="card">
        <h2>Can't reach Trip Split</h2>
        <div className="hint">{authError}</div>
        <button className="btn" type="button" onClick={() => location.reload()}>Try again</button>
      </div></div>
    );
  } else {
    const View = { home: Home, money: Money, polls: Polls, chat: Chat, group: Group }[tab];
    body = (
      <div className="stack">
        {status === "loading" && <div className="banner">Loading your trips…</div>}
        {status === "error" && <div className="banner">Couldn't load your trips. Check your internet; the app will keep trying.</div>}
        {ready && scoped && trip && <TripBar />}
        {ready && <View />}
      </div>
    );
  }

  const signedIn = auth === "in";
  const showFab = signedIn && ready && trip && (tab === "money" || tab === "polls");
  const onFab = () => {
    if (tab === "polls") return openSheet("poll");
    if (!h.tripMemberIds(trip).includes(meId)) return toast("You're not on this trip. Add yourself with “Edit trip” first.");
    openSheet("expense");
  };

  return (
    <AppContext.Provider value={ctx}>
      <div className="app">
        <header>
          <div className="brand"><i></i>Trip Split</div>
          {signedIn && hasMe && <button className="me" type="button" onClick={() => openSheet("me")}>{h.nameOf(meId)}</button>}
        </header>
        <main>{body}</main>
      </div>
      {showFab && <button className="btn accent fab" type="button" onClick={onFab}>{tab === "money" ? "+ Add expense" : "+ New poll"}</button>}
      {signedIn && tab === "chat" && ready && trip && <Composer />}
      {signedIn && <TabBar />}
      {sheet && <SheetHost sheet={sheet} />}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
      {offline && <div className="offline">Offline</div>}
    </AppContext.Provider>
  );
}

function TripBar() {
  const { trip, openSheet } = useApp();
  return (
    <button className="tripbar" type="button" onClick={() => openSheet("pickTrip")}>
      <span className="main"><span className="label">Trip</span><span className="tn">{trip.name}</span></span>
      <span className="sw">Switch ▾</span>
    </button>
  );
}

const ICONS = {
  home: <><rect x="4" y="4" width="7" height="9" rx="1.5" /><rect x="13" y="4" width="7" height="5" rx="1.5" /><rect x="13" y="11" width="7" height="9" rx="1.5" /><rect x="4" y="15" width="7" height="5" rx="1.5" /></>,
  money: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h3" /></>,
  polls: <path d="M5 20V10M12 20V4M19 20v-7" />,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  group: <><circle cx="9" cy="8" r="3.2" /><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14.2c2.6 0 4.4 1.6 5 4.3" /></>,
};
const LABELS = { home: "Dashboard", money: "Expenses", polls: "Polls", chat: "Chat", group: "Friends" };

function TabBar() {
  const { tab, setTab } = useApp();
  return (
    <nav className="tabbar" role="tablist">
      {TABS.map((t) => (
        <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)}>
          <svg viewBox="0 0 24 24">{ICONS[t]}</svg>{LABELS[t]}
        </button>
      ))}
    </nav>
  );
}

// Two-tap delete: the first tap arms an id for 3 seconds, the second confirms.
export function useArm() {
  const [pending, setPending] = useState(null);
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  const arm = (id) => {
    clearTimeout(timer.current);
    if (pending === id) { setPending(null); return true; }
    setPending(id);
    timer.current = setTimeout(() => setPending(null), 3000);
    return false;
  };
  return [pending, arm];
}
