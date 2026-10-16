import { useState } from "react";
import { api } from "./api.js";

// Group password → pick your name. The organizer password signs in directly
// (or asks for a name the very first time).
export default function Login({ toast }) {
  const [step, setStep] = useState("password"); // password | name | pick | empty
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [members, setMembers] = useState([]);
  const [busy, setBusy] = useState(false);

  async function login(extra, onReply) {
    setBusy(true);
    try {
      const d = await api("POST", "/api/login", { password, ...extra });
      if (d.ok) return location.reload();
      onReply && onReply(d);
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (step === "name") {
    return (
      <form className="card" onSubmit={(e) => { e.preventDefault(); if (name.trim()) login({ name: name.trim() }); }}>
        <h2>Welcome to Trip Split</h2>
        <div className="hint">You're the organizer. What should your friends call you?</div>
        <input type="text" placeholder="Your name" maxLength={40} required autoComplete="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn" type="submit" disabled={busy}>Get started</button>
      </form>
    );
  }
  if (step === "empty") {
    return (
      <div className="card">
        <h2>No friends added yet</h2>
        <div className="hint">Ask the organizer to add your name on the Friends tab, then try again.</div>
        <button className="btn" type="button" onClick={() => location.reload()}>Try again</button>
      </div>
    );
  }
  if (step === "pick") {
    return (
      <div className="card">
        <h2>Who are you?</h2>
        <div className="hint">Tap your name.</div>
        {members.map((m) => (
          <button key={m.id} className="btn ghost" type="button" disabled={busy} onClick={() => login({ memberId: m.id })}>{m.name}</button>
        ))}
        <div className="hint">Not on the list? Ask the organizer to add you.</div>
      </div>
    );
  }
  return (
    <form className="card" onSubmit={(e) => {
      e.preventDefault();
      if (!password) return;
      login({}, (d) => {
        if (d.needName) setStep("name");
        else if (!d.members.length) setStep("empty");
        else { setMembers(d.members); setStep("pick"); }
      });
    }}>
      <h2>Trip Split</h2>
      <div className="hint">Enter the group password your organizer shared.</div>
      <input type="password" placeholder="Password" required autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
      <button className="btn" type="submit" disabled={busy}>Continue</button>
    </form>
  );
}
