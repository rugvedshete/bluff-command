"use client";
import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

const URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";
const pid = () => { let v = localStorage.getItem("pid"); if (!v) { v = crypto.randomUUID(); localStorage.setItem("pid", v); } return v; };
const ABIL: [string, string, number, string][] = [["SHIELD", "🛡 Shield", 50, "Blocks the next sabotage"], ["RECON", "📡 Recon", 40, "See everyone's energy"], ["SABOTAGE", "💥 Sabotage", 75, "Steal 50 points"], ["EMP", "⚡ EMP", 100, "Jam everyone else's abilities"]];

export default function App() {
  const sock = useRef<Socket | null>(null);
  const [s, setS] = useState<any>(null);
  const [name, setName] = useState(""); const [code, setCode] = useState("");
  const [err, setErr] = useState(""); const [text, setText] = useState(""); const [target, setTarget] = useState("");
  const [end, setEnd] = useState(0); const [left, setLeft] = useState(0);

  useEffect(() => {
    const so = io(URL); sock.current = so;
    so.on("connect", () => { const c = localStorage.getItem("code"); if (c) so.emit("resume", { code: c, pid: pid() }, (r: any) => { if (r?.error) localStorage.removeItem("code"); }); });
    so.on("state", (v: any) => { setS(v); setEnd(Date.now() + v.msLeft); });
    return () => { so.disconnect(); };
  }, []);
  useEffect(() => { const t = setInterval(() => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000))), 250); return () => clearInterval(t); }, [end]);
  useEffect(() => { setText(""); setErr(""); }, [s?.phase, s?.round]);

  const emit = (ev: string, d: any = {}) => sock.current!.emit(ev, d, (r: any) => { setErr(r?.error || ""); if (r?.code) localStorage.setItem("code", r.code); });
  const leave = () => { localStorage.removeItem("code"); setS(null); };

  if (!s) return (
    <main><h1>Bluff & Command</h1>
      <input placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
      <button onClick={() => emit("create", { name, pid: pid() })}>Create Room</button>
      <input placeholder="Room code" value={code} onChange={e => setCode(e.target.value)} />
      <button className="alt" onClick={() => emit("join", { code, name, pid: pid() })}>Join Room</button>
      <div className="err">{err}</div></main>
  );

  const me = s.me, isHost = s.hostId === me?.id, ph = s.phase;
  const Timer = () => <div className="timer">{left}s</div>;
  return (
    <main>
      <div className="row"><span>Room <b>{s.code}</b></span>{ph !== "LOBBY" && ph !== "RESULTS" && <span>Round {s.round}/{s.maxRounds}</span>}<span>⚡ {me?.energy}{me?.shield ? " 🛡" : ""}</span></div>

      {ph === "LOBBY" && <div className="card"><h2>Lobby</h2><p>Share code <b className="big">{s.code}</b></p>
        {isHost ? <button disabled={s.players.length < 2} onClick={() => emit("start")}>Start Game ({s.players.length} players)</button> : <p>Waiting for host…</p>}</div>}

      {ph === "BLUFF" && <div className="card"><div className="row"><span>{s.question.category}</span><Timer /></div>
        <h2>{s.question.prompt}</h2>
        {me.hasBluffed ? <p>Bluff locked in ✅ ({s.counts.bluffs}/{s.counts.players})</p> : <>
          <p>Write a believable FAKE answer:</p>
          <input value={text} maxLength={60} onChange={e => setText(e.target.value)} />
          <button onClick={() => emit("bluff", { answer: text })}>Submit Bluff</button></>}</div>}

      {ph === "VOTE" && <div className="card"><div className="row"><span>Find the truth</span><Timer /></div><h2>{s.question.prompt}</h2>
        {s.options.map((o: string) => <button key={o} className="alt" style={{ marginTop: 8 }}
          disabled={me.hasVoted || o.trim().toLowerCase().replace(/\s+/g, " ") === me.mine} onClick={() => emit("vote", { answer: o })}>{o}</button>)}
        {me.hasVoted && <p>Vote cast ✅ ({s.counts.votes}/{s.counts.players})</p>}</div>}

      {(ph === "REVEAL" || ph === "COMMAND") && s.reveal && <div className="card"><h2>Reveal</h2>
        {s.reveal.map((o: any) => <div key={o.text} className={"card " + (o.correct ? "ok" : "")} style={{ marginTop: 8 }}>
          <b>{o.correct ? "✔ " : ""}{o.text}</b>
          <div className="dim">{o.correct ? "The truth" : "Bluff by " + o.authors.join(", ")} · Voted: {o.voters.join(", ") || "nobody"}</div></div>)}</div>}

      {ph === "COMMAND" && <div className="card"><div className="row"><h2>Command</h2><Timer /></div>
        {me.acted ? <p>Order locked in ✅</p> : <>
          <select value={target} onChange={e => setTarget(e.target.value)}><option value="">Sabotage target…</option>
            {s.players.filter((p: any) => p.id !== me.id).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          {ABIL.map(([t, label, cost, d]) => <button key={t} style={{ marginTop: 8 }} disabled={me.energy < cost}
            onClick={() => emit("ability", { type: t, target })}>{label} ({cost}) – {d}</button>)}
          <button className="alt" style={{ marginTop: 8 }} onClick={() => emit("ability", { type: "PASS" })}>Pass</button></>}</div>}

      {ph === "RESULTS" && s.awards && <div className="card"><h2>🏆 {s.awards.winner} wins!</h2>
        <p>🎭 Greatest Deceiver: {s.awards.deceiver}<br />🧠 Sharpest Mind: {s.awards.thinker}<br />⚡ Fastest Thinker: {s.awards.speedster}<br />💥 Top Saboteur: {s.awards.saboteur}</p>
        {isHost && <button onClick={() => emit("restart")}>Play Again</button>}<button className="alt" style={{ marginTop: 8 }} onClick={leave}>Leave</button></div>}

      {s.log.length > 0 && ph !== "LOBBY" && <div className="card">{s.log.map((l: string, i: number) => <div key={i}>{l}</div>)}</div>}

      <div className="card"><h2>Leaderboard</h2>
        {s.players.map((p: any, i: number) => <div key={p.id} className={"row " + (p.connected ? "" : "dim")}>
          <span>#{i + 1} {p.name}{p.id === s.hostId ? " 👑" : ""}</span><span>{p.score}{p.energy !== null ? ` · ⚡${p.energy}` : ""}</span></div>)}</div>
      <div className="err">{err}</div>
    </main>
  );
}
