import express from "express"; import http from "http"; import cors from "cors";
import { Server } from "socket.io"; import questions from "./questions.json";

const COST: any = { SHIELD: 50, RECON: 40, SABOTAGE: 75, EMP: 100, PASS: 0 };
const DUR: any = { BLUFF: 30, VOTE: 20, REVEAL: 8, COMMAND: 15 };
const MAX_ROUNDS = 5;
const rooms = new Map<string, any>();
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const shuffle = <T,>(a: T[]) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const P = (r: any, id: string) => r.players.find((p: any) => p.id === id);
const live = (r: any) => r.players.filter((p: any) => p.connected);

const app = express(); app.use(cors()); app.get("/health", (_q, s) => { s.send("ok"); });
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

function view(r: any, pid: string) {
  const me = P(r, pid);
  const shown = ["REVEAL", "COMMAND", "RESULTS"].includes(r.phase);
  return {
    code: r.code, hostId: r.hostId, phase: r.phase, round: r.round, maxRounds: MAX_ROUNDS,
    msLeft: Math.max(0, r.deadline - Date.now()),
    question: r.q ? { category: r.q.category, prompt: r.q.prompt } : null,
    options: r.phase === "VOTE" ? r.options.map((o: any) => o.text) : [],
    reveal: shown ? r.reveal : null, log: r.log, awards: r.awards,
    counts: { bluffs: Object.keys(r.subs).length, votes: Object.keys(r.votes).length, actions: r.actions.length, players: live(r).length },
    me: me && { id: me.id, energy: me.energy, shield: me.shield, hasBluffed: pid in r.subs, hasVoted: pid in r.votes, acted: r.actions.some((a: any) => a.pid === pid), mine: r.subs[pid] ? norm(r.subs[pid]) : "" },
    players: [...r.players].sort((a, b) => b.score - a.score).map(p => ({ id: p.id, name: p.name, score: p.score, connected: p.connected, energy: p.id === pid || me?.recon ? p.energy : null })),
  };
}
function broadcast(r: any) { r.players.forEach((p: any) => p.sid && io.to(p.sid).emit("state", view(r, p.id))); }

function go(r: any, phase: string) {
  clearTimeout(r.timer); r.phase = phase;
  if (phase === "BLUFF") { r.q = questions[r.deck[(r.round - 1) % r.deck.length]]; r.subs = {}; r.votes = {}; r.options = []; r.reveal = null; r.log = []; }
  if (phase === "VOTE") {
    const map = new Map<string, any>();
    map.set(norm(r.q.answer), { key: norm(r.q.answer), text: r.q.answer, correct: true, authors: [] });
    for (const [pid, a] of Object.entries<string>(r.subs)) { const k = norm(a); if (!map.has(k)) map.set(k, { key: k, text: a.trim(), correct: false, authors: [] }); map.get(k).authors.push(pid); }
    r.options = shuffle([...map.values()]);
    if (r.options.length < 2) return go(r, "REVEAL");
  }
  if (phase === "REVEAL") score(r);
  if (phase === "COMMAND") { r.players.forEach((p: any) => (p.recon = false)); r.actions = []; }
  if (phase === "RESULTS") { r.awards = awards(r); r.deadline = Date.now(); return broadcast(r); }
  r.deadline = Date.now() + DUR[phase] * 1000;
  r.timer = setTimeout(() => next(r), DUR[phase] * 1000);
  broadcast(r);
}
function next(r: any) {
  if (r.phase === "BLUFF") go(r, "VOTE");
  else if (r.phase === "VOTE") go(r, "REVEAL");
  else if (r.phase === "REVEAL") go(r, r.round >= MAX_ROUNDS ? "RESULTS" : "COMMAND");
  else if (r.phase === "COMMAND") { resolve(r); r.round++; go(r, "BLUFF"); }
}
function check(r: any) {
  const ids = live(r).map((p: any) => p.id);
  if (r.phase === "BLUFF" && ids.every((i: string) => i in r.subs)) next(r);
  else if (r.phase === "VOTE" && ids.every((i: string) => i in r.votes)) next(r);
  else if (r.phase === "COMMAND" && ids.every((i: string) => r.actions.some((a: any) => a.pid === i))) next(r);
  else broadcast(r);
}
function score(r: any) {
  const rev = r.options.map((o: any) => ({ text: o.text, correct: o.correct, authors: o.authors.map((i: string) => P(r, i).name), voters: [] as string[] }));
  let fastest: any = null;
  for (const [pid, v] of Object.entries<any>(r.votes)) {
    const p = P(r, pid), oi = r.options.findIndex((o: any) => o.key === norm(v.a)); if (!p || oi < 0) continue;
    rev[oi].voters.push(p.name);
    if (r.options[oi].correct) { p.score += 100; p.energy += 20; p.correctAnswers++; if (!fastest || v.t < fastest.t) fastest = { p, t: v.t }; }
    else for (const aid of r.options[oi].authors) { const a = P(r, aid); a.score += 50; a.energy += 10; a.playersFooled++; }
  }
  if (fastest) { fastest.p.score += 25; fastest.p.fastestAnswers++; }
  r.reveal = rev;
}
function resolve(r: any) {
  let acts = [...r.actions].filter(a => a.type !== "PASS"); const log: string[] = [];
  const emp = acts.find(a => a.type === "EMP");
  if (emp) {
    log.push(`⚡ ${P(r, emp.pid).name} fired an EMP - all other abilities jammed!`);
    acts.filter(a => a.pid !== emp.pid).forEach(a => (P(r, a.pid).energy += COST[a.type]));
    acts = acts.filter(a => a.pid === emp.pid);
  }
  const order: any = { SHIELD: 1, RECON: 2, SABOTAGE: 3 };
  acts.sort((a, b) => (order[a.type] || 0) - (order[b.type] || 0));
  for (const a of acts) {
    const me = P(r, a.pid);
    if (a.type === "SHIELD") { me.shield = true; log.push(`🛡 ${me.name} raised a shield`); }
    if (a.type === "RECON") { me.recon = true; log.push(`📡 ${me.name} ran recon`); }
    if (a.type === "SABOTAGE") {
      const t = P(r, a.target); if (!t || t.id === me.id) continue;
      if (t.shield) { t.shield = false; log.push(`🛡 ${t.name}'s shield blocked ${me.name}'s sabotage`); }
      else { const d = Math.min(50, t.score); t.score -= d; me.score += d; me.sabotageSuccess++; log.push(`💥 ${me.name} sabotaged ${t.name} (-${d})`); }
    }
  }
  r.log = log;
}
function awards(r: any) {
  const top = (k: string) => [...r.players].sort((a, b) => b[k] - a[k])[0]?.name;
  return { winner: top("score"), deceiver: top("playersFooled"), thinker: top("correctAnswers"), speedster: top("fastestAnswers"), saboteur: top("sabotageSuccess") };
}
const newPlayer = (id: string, name: string, sid: string) => ({ id, sid, name, score: 0, energy: 0, connected: true, shield: false, recon: false, correctAnswers: 0, playersFooled: 0, fastestAnswers: 0, sabotageSuccess: 0 });

io.on("connection", socket => {
  const ctx = () => { const r = rooms.get(socket.data.code); return r ? { r, pid: socket.data.pid as string } : null; };
  const attach = (r: any, pid: string) => { socket.data = { code: r.code, pid }; socket.join(r.code); };

  socket.on("create", ({ name, pid }, cb) => {
    if (!name?.trim()) return cb({ error: "Enter a name" });
    let code; do code = Math.random().toString(36).slice(2, 6).toUpperCase(); while (rooms.has(code));
    const r: any = { code, hostId: pid, players: [newPlayer(pid, name.trim().slice(0, 16), socket.id)], phase: "LOBBY", round: 1, subs: {}, votes: {}, options: [], actions: [], log: [], deadline: 0, awards: null, reveal: null, q: null, deck: [] };
    rooms.set(code, r); attach(r, pid); cb({ code }); broadcast(r);
  });
  socket.on("join", ({ code, name, pid }, cb) => {
    const r = rooms.get(String(code || "").toUpperCase().trim());
    if (!r) return cb({ error: "Room not found" });
    if (!name?.trim()) return cb({ error: "Enter a name" });
    let p = P(r, pid);
    if (!p) {
      if (r.phase !== "LOBBY") return cb({ error: "Game already started" });
      if (r.players.length >= 8) return cb({ error: "Room full" });
      if (r.players.some((x: any) => norm(x.name) === norm(name))) return cb({ error: "Name taken" });
      r.players.push((p = newPlayer(pid, name.trim().slice(0, 16), socket.id)));
    }
    p.sid = socket.id; p.connected = true; attach(r, pid); cb({ code: r.code }); broadcast(r);
  });
  socket.on("resume", ({ code, pid }, cb) => {
    const r = rooms.get(code), p = r && P(r, pid);
    if (!p) return cb({ error: "gone" });
    p.sid = socket.id; p.connected = true; attach(r, pid); cb({ code }); broadcast(r);
  });
  socket.on("start", (_d, cb) => {
    const c = ctx(); if (!c || c.r.hostId !== c.pid || c.r.phase !== "LOBBY") return;
    if (c.r.players.length < 2) return cb?.({ error: "Need at least 2 players" });
    c.r.deck = shuffle(questions.map((_, i) => i)); c.r.round = 1; go(c.r, "BLUFF");
  });
  socket.on("bluff", ({ answer }, cb) => {
    const c = ctx(); if (!c || c.r.phase !== "BLUFF") return;
    const a = String(answer || "").trim().slice(0, 60);
    if (!a) return cb?.({ error: "Type a fake answer" });
    if (norm(a) === norm(c.r.q.answer)) return cb?.({ error: "Too close to the truth - try another!" });
    c.r.subs[c.pid] = a; cb?.({}); check(c.r);
  });
  socket.on("vote", ({ answer }, cb) => {
    const c = ctx(); if (!c || c.r.phase !== "VOTE" || c.pid in c.r.votes) return;
    const o = c.r.options.find((x: any) => x.key === norm(answer || ""));
    if (!o) return; if (o.authors.includes(c.pid)) return cb?.({ error: "You can't vote for your own bluff" });
    c.r.votes[c.pid] = { a: o.text, t: Date.now() }; cb?.({}); check(c.r);
  });
  socket.on("ability", ({ type, target }, cb) => {
    const c = ctx(); if (!c || c.r.phase !== "COMMAND" || !(type in COST)) return;
    const me = P(c.r, c.pid); if (c.r.actions.some((a: any) => a.pid === c.pid)) return;
    if (me.energy < COST[type]) return cb?.({ error: "Not enough energy" });
    if (type === "SABOTAGE" && (!P(c.r, target) || target === c.pid)) return cb?.({ error: "Pick a target" });
    me.energy -= COST[type]; c.r.actions.push({ pid: c.pid, type, target }); cb?.({}); check(c.r);
  });
  socket.on("restart", () => {
    const c = ctx(); if (!c || c.r.hostId !== c.pid || c.r.phase !== "RESULTS") return;
    Object.assign(c.r, { phase: "LOBBY", round: 1, awards: null, q: null, reveal: null, log: [] });
    c.r.players.forEach((p: any) => Object.assign(p, { score: 0, energy: 0, shield: false, recon: false, correctAnswers: 0, playersFooled: 0, fastestAnswers: 0, sabotageSuccess: 0 }));
    broadcast(c.r);
  });
  socket.on("disconnect", () => {
    const c = ctx(); if (!c) return; const p = P(c.r, c.pid);
    if (!p || p.sid !== socket.id) return; p.connected = false;
    if (c.r.hostId === c.pid) { const n = live(c.r)[0]; if (n) c.r.hostId = n.id; }
    if (!live(c.r).length) { clearTimeout(c.r.timer); rooms.delete(c.r.code); return; }
    check(c.r);
  });
});
server.listen(Number(process.env.PORT) || 4000, () => console.log("Bluff server on", process.env.PORT || 4000));
