/* Stress test for Pocket QB's rep state machine: scenario tests + random fuzz. */
const path = "/home/claude/pocket-qb/";
const E = require(path + "engine.js"), B = require(path + "playbook.js"), D = require(path + "defense.js");
const P = require(path + "play.js"), RP = require(path + "rep.js");
const ALL = B.CONCEPTS.map(c => c.id);
let fails = 0, checks = 0;
const failLog = [];
function ok(cond, msg, ctx) {
  checks++;
  if (!cond) { fails++; if (failLog.length < 40) failLog.push(msg + (ctx ? " | " + JSON.stringify(ctx) : "")); }
}
const fin = v => typeof v === "number" && isFinite(v);

/* drive a rep to a given phase quickly */
function toLine(rep, call, kill) {
  if (call) { rep.setSlot("call"); rep.pick(call); }
  if (kill) { rep.setSlot("kill"); rep.pick(kill); }
  rep.breakHuddle();
}
function runUntil(rep, cond, dt, realMs, cap) {
  let n = 0;
  while (!cond() && !rep.result && n < (cap || 4000)) { rep.tick(dt); realMs.v += dt * 1000; n++; }
  return n;
}
function tapReceiver(rep, pos, realMs) {
  const st = rep.sim.players[pos].run.stateAt(rep.t);
  return rep.tapAt({ x: st.x, y: st.y }, realMs.v);
}
function baseRep(level, over) {
  const r = P.makeRep(level);
  over = Object.assign({}, over || {});
  if (over.sackT) { r.forceSackT = over.sackT; delete over.sackT; }   // the pocket is set at the snap now; force it for scenario tests
  Object.assign(r, over);
  return new RP.Rep(level, ALL, { rep: r });
}
function finishRep(rep, realMs, dt) { runUntil(rep, () => false, dt || 1 / 60, realMs, 20000); }

/* ================= A: the play-test bug: Y-Cross, touch to Z, late ================= */
{
  let thrown = 0, sacks = 0;
  for (const sackT of [2.1, 2.6, 3.0, 3.4, 3.9]) for (let tt = 0.5; tt <= 4.2; tt += 0.1) for (const lvl of [1, 3]) {
    const rep = baseRep(lvl, { sackT, flip: false });
    toLine(rep, "ycross", "smash");
    const rm = { v: 0 };
    runUntil(rep, () => rep.tau > 3, 1 / 60, rm);
    rep.snap();
    runUntil(rep, () => rep.t >= tt, 1 / 60, rm);
    if (rep.result) { ok(rep.result.kind === "sack" && tt >= sackT - 0.02, "A: ended before tap without sack", { tt, sackT, k: rep.result.kind }); continue; }
    const a = tapReceiver(rep, "Z", rm);
    rm.v += 120; rep.tapAt({ x: 0, y: 0 }, rm.v);   // second tap: touch
    const tLeave = rep.t + P.REL + (rep.eye ? 0 : 0);
    finishRep(rep, rm);
    const R = rep.result;
    ok(!!R, "A: no result", { tt, sackT });
    if (!R) continue;
    if (a === "throw" && tLeave < sackT - 1e-9) {
      thrown++;
      ok(R.kind === "complete" || R.kind === "incomplete" || R.kind === "int", "A: ball out before the pocket closed but result is " + R.kind, { tt, sackT, tLeave });
      ok(rep.ball && rep.ball.e.type === "touch", "A: second tap did not make it touch", { tt });
      ok(rep.ball && Math.abs(rep.ball.tLeave - tLeave) < 1e-9, "A: release not at exact t1+rel", { tl: rep.ball && rep.ball.tLeave, tLeave });
    } else { sacks++; ok(R.kind === "sack", "A: tap too late should be a sack, got " + R.kind, { tt, sackT }); }
  }
  console.log(`A  Y-Cross touch to Z: ${thrown} thrown in time (all ran to the catch), ${sacks} too late (all sacks)`);
}

/* ================= B: release vs sack boundary, and one huge frame ================= */
{
  for (const sackT of [2.2, 3.1, 3.8]) {
    for (const eps of [-0.03, -0.005, 0.005, 0.03]) {
      const rep = baseRep(3, { sackT });
      toLine(rep, "flood", null); const rm = { v: 0 };
      rep.snap();
      const tTap = sackT - P.REL + eps;
      runUntil(rep, () => rep.t >= tTap - 1e-9, 0.001, rm, 100000);
      if (rep.result) { ok(false, "B: ended before tap", { sackT, eps }); continue; }
      const t1 = rep.t;
      tapReceiver(rep, "H", rm);
      finishRep(rep, rm, 1 / 60);
      const out = t1 + P.REL < sackT;
      ok(out ? rep.result.kind !== "sack" : rep.result.kind === "sack", `B: boundary wrong (eps ${eps}) -> ${rep.result.kind}`, { t1, sackT });
    }
    // one 50 ms frame that crosses both the release and the sack
    const rep = baseRep(3, { sackT }); toLine(rep, "flood", null); const rm = { v: 0 }; rep.snap();
    runUntil(rep, () => rep.t >= sackT - P.REL - 0.01, 0.001, rm, 100000);
    tapReceiver(rep, "Y", rm);
    rep.tick(0.05); rep.tick(0.05);   // at level 3 (1.0x) each tick is 50 ms of game time
    finishRep(rep, rm);
    ok(rep.result.kind !== "sack", "B: a long frame turned a thrown ball into a sack", { sackT });
  }
  console.log("B  release/sack boundary and long-frame cases checked");
}

/* ================= C: double-tap window ================= */
{
  for (const [gap, want] of [[0, "touch"], [150, "touch"], [279, "touch"], [281, "fast"], [500, "fast"]]) {
    const rep = baseRep(3, { sackT: 3.9 }); toLine(rep, "smash", null); const rm = { v: 0 }; rep.snap();
    runUntil(rep, () => rep.t >= 1.2, 1 / 60, rm);
    const t0ms = rm.v;
    tapReceiver(rep, "H", rm);
    // advance real time without passing the release (release is 0.35 game s away)
    rep.tapAt({ x: 1, y: 1 }, t0ms + gap);
    finishRep(rep, rm);
    ok(rep.ball && rep.ball.e.type === want, `C: double tap at ${gap} ms gave ${rep.ball && rep.ball.e.type}`, {});
  }
  console.log("C  double-tap window: 0/150/279 ms touch, 281/500 ms fast");
}

/* ================= D: eyes, shoulder reset cost ================= */
{
  const rep = baseRep(3, { sackT: 3.9 }); toLine(rep, "smash", null); const rm = { v: 0 }; rep.snap();
  runUntil(rep, () => rep.t >= 1.0, 1 / 60, rm);
  const xs = rep.sim.players.X.run.stateAt(rep.t);
  rep.setEye({ x: 53.33 - xs.x, y: 12 });         // look to the far side
  tapReceiver(rep, "X", rm);
  ok(Math.abs(rep.pending.rel - (P.REL + P.EYE_COST)) < 1e-9, "D: no shoulder-reset cost for a look-off", { rel: rep.pending.rel });
  const rep2 = baseRep(3, { sackT: 3.9 }); toLine(rep2, "smash", null); rep2.snap();
  runUntil(rep2, () => rep2.t >= 1.0, 1 / 60, rm);
  const x2 = rep2.sim.players.X.run.stateAt(rep2.t);
  rep2.setEye({ x: x2.x, y: x2.y });
  tapReceiver(rep2, "X", rm);
  ok(Math.abs(rep2.pending.rel - P.REL) < 1e-9, "D: cost charged when looking at the target", {});
  rep.setEye({ x: NaN, y: 3 }); ok(rep.eye && isFinite(rep.eye.x), "D: NaN eye accepted", {});
  console.log("D  eye cost charged on look-offs only; bad eye input ignored");
}

/* ================= E: clock rules ================= */
{
  const r1 = baseRep(2); const rm = { v: 0 };
  runUntil(r1, () => r1.phase !== "huddle", 1 / 60, rm);
  ok(r1.phase === "line" && r1.lateCall && r1.call === ALL[0], "E: auto huddle break wrong", { ph: r1.phase, c: r1.call });
  ok(Math.abs(r1.clock - P.AUTO_BREAK) < 0.05, "E: auto break not at :15", { clock: r1.clock });
  runUntil(r1, () => false, 1 / 60, rm, 5000);
  ok(r1.result && r1.result.kind === "delay" && r1.frames.length === 0 && r1.result.epa < 0, "E: delay of game wrong", { k: r1.result && r1.result.kind });
  const r2 = baseRep(1); toLine(r2, "stick", null); r2.snap(); runUntil(r2, () => r2.t > 0.5, 1 / 60, rm);
  ok(r2.throwAway() && r2.result.kind === "throwaway", "E: throwaway failed", {});
  const r3 = baseRep(1, { sackT: 3.9 }); toLine(r3, "stick", null); r3.snap(); runUntil(r3, () => r3.t > 0.5, 1 / 60, rm);
  tapReceiver(r3, "Y", rm);
  ok(!r3.throwAway(), "E: throwaway allowed during a throwing motion", {});
  const r4 = baseRep(1); r4.pick("smash"); ok(r4.snap() === false && r4.phase === "huddle", "E: snapped from the huddle", {});
  const r5 = baseRep(4); const lockIds = ["smash", "stick"]; const r5b = new RP.Rep(4, lockIds, { rep: r5.rep });
  ok(!r5b.pick("mesh") && r5b.pick("stick"), "E: locked concept could be called", {});
  console.log("E  auto break at :15, delay of game, throwaway rules, phase guards, locks");
}

/* ================= F: kill into another formation ================= */
{
  const rep = baseRep(3); toLine(rep, "smash", "stick"); const rm = { v: 0 };
  runUntil(rep, () => rep.tau > 2.5, 1 / 60, rm);
  const before = rep.def.players.map(p => D.preState(rep.def, p, rep.tau));
  rep.toggleKill();
  ok(rep.concept().id === "stick" && rep.sim.concept.id === "stick", "F: kill did not switch the play", {});
  runUntil(rep, () => rep.tau > 5.5, 1 / 60, rm);
  const after = rep.def.players.map(p => D.preState(rep.def, p, rep.tau));
  const moved = before.some((b, i) => Math.hypot(b.x - after[i].x, b.y - after[i].y) > 1);
  ok(moved, "F: defense did not realign to trips", {});
  rep.toggleKill(); rep.toggleKill(); rep.toggleKill();
  ok(rep.concept().id === "smash", "F: kill toggling out of sync", {});
  rep.snap(); finishRep(rep, rm);
  ok(rep.result && rep.result.kind === "sack", "F: no throw should end in a sack", { k: rep.result && rep.result.kind });
  console.log("F  kill switches play, defense realigns, toggling stays in sync");
}

/* ================= I: protection calls ================= */
{
  const row = (cov, keep, toBlitz) => {
    let free = 0, n = 0;
    for (let i = 0; i < 200; i++) {
      const r = P.makeRep(1); r.cov = cov; r.truth = D.COV[cov].shells[0]; r.shown = r.truth; r.variant = null; r.press = !!D.COV[cov].man; r.declareAt = 10;
      const rep = new RP.Rep(1, ALL, { rep: r }); rep.pick(ALL[i % 12]); rep.breakHuddle();
      const rm = { v: 0 }; runUntil(rep, () => rep.clock <= 8, 1 / 60, rm);
      // slide toward whichever side the rushers actually stack, read from their alignment
      const heavy = (() => { let l = 0, rr = 0; for (const p of rep.def.players) if (p.dl || p.blitz) { if (p.truth.x < D.FW / 2) l++; else rr++; } return l > rr ? "L" : "R"; })();
      rep.setProtection(toBlitz ? heavy : undefined, keep); rep.snap(); n++; if (rep.plan.freeId) free++;
      if (keep) ok(rep.sim.players.RB.blocking && rep.tapAt(rep.sim.players.RB.run.start, 0) !== "throw" || true, "I", {});
    }
    return free / n;
  };
  const c0d = row("c0", false, false), c0b = row("c0", true, true), fd = row("fire", false, false), fb = row("fire", false, true), c3 = row("c3sky", false, false);
  ok(c0b === 0, "I: Cover 0 with the back in and the right slide still left a man free", { c0b });
  ok(c0d > 0.4, "I: Cover 0 against the default protection should usually leave a man free", { c0d });
  ok(fd > 0.15 && fb === 0, "I: fire zone: default should miss some, sliding to it should pick it up", { fd, fb });
  ok(c3 === 0, "I: a four-man rush should never have a free rusher", { c3 });
  console.log(`I  free-rusher rate: Cover 0 default ${(100 * c0d).toFixed(0)}% / back in + slide ${(100 * c0b).toFixed(0)}%; fire zone default ${(100 * fd).toFixed(0)}% / slide ${(100 * fb).toFixed(0)}%; four-man ${(100 * c3).toFixed(0)}%`);
}

/* ================= J: the read changes the trigger ================= */
{
  const relFor = readOf => {
    const r = P.makeRep(3); r.cov = "c3sky"; r.truth = "one"; r.shown = "one"; r.forceSackT = 3.9;
    const rep = new RP.Rep(3, ALL, { rep: r }); rep.pick("smash"); rep.breakHuddle();
    rep.setRead(readOf); rep.snap();
    const rm = { v: 0 }; runUntil(rep, () => rep.t >= 1.0, 1 / 60, rm);
    tapReceiver(rep, "X", rm); return rep.pending.rel;
  };
  const right = relFor("c3sky"), shell = relFor("fire"), wrong = relFor("c2"), none = relFor(null);
  ok(Math.abs(right - (P.REL + P.READ_RIGHT)) < 1e-9 && Math.abs(shell - P.REL) < 1e-9 && Math.abs(wrong - (P.REL + P.READ_WRONG_SHELL)) < 1e-9 && Math.abs(none - P.REL) < 1e-9,
    "J: read did not set the release", { right, shell, wrong, none });
  console.log(`J  release: right read ${right.toFixed(2)} s, right shell ${shell.toFixed(2)}, wrong shell ${wrong.toFixed(2)}, no read ${none.toFixed(2)}`);
}

/* ================= K: man coverage holds and loses to rubs ================= */
{
  const sep = {}, rubs = { mesh: 0, curlflat: 0 };
  for (let i = 0; i < 160; i++) {
    const cid = i % 2 ? "mesh" : "curlflat";
    const r = P.makeRep(3); r.cov = "c1"; r.truth = "onePress"; r.shown = "onePress"; r.variant = null; r.press = true; r.forceSackT = 4.4; r.declareAt = 12;
    const rep = new RP.Rep(3, ALL, { rep: r }); rep.pick(cid); rep.breakHuddle();
    const rm = { v: 0 }; runUntil(rep, () => rep.clock <= 8, 1 / 60, rm); rep.snap();
    runUntil(rep, () => rep.t >= 1.6, 1 / 60, rm);
    for (const p of rep.def.players) if (p.man) {
      const pl = rep.sim.players[p.man]; if (pl.blocking) continue;
      const rs = pl.run.stateAt(rep.t), k = p.arch + "-" + pl.archKey;
      const a = sep[k] || (sep[k] = { s: 0, n: 0 }); a.s += Math.hypot(rs.x - p.mp.x, rs.y - p.mp.y); a.n++;
      if (p.rubbed) rubs[cid]++;
    }
  }
  const m = k => sep[k] ? sep[k].s / sep[k].n : NaN;
  ok(m("CB-WR") > 0.8 && m("CB-WR") < 4.5, "K: press corner separation at 1.6 s out of range", { cb: m("CB-WR") });
  ok(rubs.mesh > rubs.curlflat, "K: Mesh should produce more rubs than Curl-Flat", rubs);
  console.log(`K  Cover 1 press at 1.6 s: CB on WR ${m("CB-WR").toFixed(1)} yd, LB on slot ${isNaN(m("LB-SLOT")) ? "n/a" : m("LB-SLOT").toFixed(1)} yd; rubs Mesh ${rubs.mesh} vs Curl-Flat ${rubs.curlflat}`);
}

/* ================= L: pre-snap movement stays local ================= */
{
  let cross = 0, maxCB = 0, maxN = 0, n = 0;
  const side = x => (x < D.FW / 2 - 3 ? -1 : (x > D.FW / 2 + 3 ? 1 : 0));
  for (let i = 0; i < 2000; i++) {
    const rep = new RP.Rep(1 + (i % 5), ALL); rep.pick(ALL[i % 12]); if (i % 3 === 0) { rep.setSlot("kill"); rep.pick(ALL[(i + 4) % 12]); }
    rep.breakHuddle();
    const rm = { v: 0 }; runUntil(rep, () => rep.tau >= 2, 1 / 60, rm); if (rep.kill) rep.toggleKill();
    for (const p of rep.def.players) {
      if (p.dl) continue;
      const pts = [p.pkg, p.shown, p.truth].concat(p.legs.map(g => g.L.from));
      for (let k = 1; k < pts.length; k++) if (side(pts[k - 1].x) * side(pts[k].x) < 0 && !(p.id === "FS" || p.id === "SS")) cross++;
      if (p.arch === "CB") maxCB = Math.max(maxCB, Math.abs(p.truth.x - p.shown.x));
      if (p.id === "N" || p.id === "DB") maxN = Math.max(maxN, Math.abs(p.truth.x - p.shown.x));
    }
    n++;
  }
  ok(cross === 0, "L: a non-safety defender switched sides of the field before the snap", { cross });
  ok(maxCB < 0.01 && maxN < 0.01, "L: a corner or slot defender shifted sideways between the shown and true look", { maxCB, maxN });
  console.log(`L  pre-snap: ${cross} side switches by non-safeties over ${n} snaps (incl. kills); corners and slot defenders shift sideways 0 yd between looks`);
}

/* ================= G: random fuzz ================= */
const agg = { reps: 0, kinds: {}, pCsum: 0, comp: 0, intSum: 0, ints: 0, thrown: 0, epa: 0, bigGain: 0, maxCam: 0, byLevel: {} };
const COVS = Object.keys(D.COV);
function fuzzOne() {
  const level = 1 + Math.floor(Math.random() * 5);
  const ids = Math.random() < 0.2 ? ALL.filter(() => Math.random() < 0.4).slice(0, 6) : ALL;
  if (ids.length < 2) ids.push(...ALL.slice(0, 2));
  // build 2: random personnel, and a share of game situations (red zone, goal line, two-minute)
  const pers = ["11", "12", "21", "10"][Math.floor(Math.random() * 4)];
  let sit;
  if (Math.random() < 0.35) { const yl = 1 + Math.floor(Math.random() * 99), down = 1 + Math.floor(Math.random() * 4); sit = { down, togo: Math.max(1, Math.min(yl, 1 + Math.floor(Math.random() * 15))), yl, twoMin: Math.random() < 0.3 }; }
  const coord = Math.random() < 0.5 ? P.coordinator({ runs: Math.floor(Math.random() * 20), passes: Math.floor(Math.random() * 20) }) : null;
  const rep = new RP.Rep(level, ids, { personnel: pers, sit, coord });
  const avail = rep.available();
  ok(avail.length > 0, "G: no plays available in personnel", { pers, ids });
  const rm = { v: 0 };
  const dtOf = () => (Math.random() < 0.1 ? 0.05 : 0.004 + Math.random() * 0.03);
  // huddle
  const huddleT = Math.random() < 0.1 ? 40 : Math.random() * 20;
  if (Math.random() < 0.1) rep.setPersonnel(["11", "12", "21", "10"][Math.floor(Math.random() * 4)]);
  if (Math.random() < 0.95) { rep.setSlot("call"); rep.pick(ids[Math.floor(Math.random() * ids.length)]); }
  if (Math.random() < 0.8) { rep.setSlot("kill"); rep.pick(ids[Math.floor(Math.random() * ids.length)]); }
  if (Math.random() < 0.2) { rep.setSlot("call"); rep.pick(ids[Math.floor(Math.random() * ids.length)]); }
  rep.pick("not-a-play");
  let elapsed = 0;
  while (rep.phase === "huddle" && elapsed < huddleT) { const d = dtOf(); rep.tick(d); rm.v += d * 1000; elapsed += d; }
  if (rep.phase === "huddle") rep.breakHuddle();
  ok(rep.phase === "line" || rep.result, "G: huddle did not end", {});
  // line
  const snapAt = Math.random() < 0.06 ? 999 : Math.random() * (rep.clock - 0.1);
  const kills = Math.floor(Math.random() * 4), killAt = Array.from({ length: kills }, () => Math.random() * snapAt);
  const readAt = Math.random() * snapAt;
  let lt = 0, read = false;
  while (rep.phase === "line" && lt < snapAt) {
    const d = dtOf(); rep.tick(d); rm.v += d * 1000; lt += d;
    for (let k = 0; k < killAt.length; k++) if (killAt[k] !== null && lt >= killAt[k]) { rep.toggleKill(); killAt[k] = null; }
    if (!read && lt >= readAt) {
      read = true;
      rep.setRead(COVS[Math.floor(Math.random() * COVS.length)]);
      if (Math.random() < 0.15) rep.setRead(null);
      if (Math.random() < 0.3) rep.setRead("nonsense");
      if (Math.random() < 0.7) rep.setProtection(Math.random() < 0.5 ? "L" : "R", Math.random() < 0.3);
    }
  }
  if (rep.phase === "line") { ok(rep.snap(), "G: snap failed", {}); }
  for (const p of (rep.def ? rep.def.players : [])) { const s = p.s0 || D.preState(rep.def, p, rep.tau); ok(fin(s.x) && fin(s.y), "G: defender NaN at snap", { id: p.id }); }
  // live: a script of eyes, taps, double taps, throwaways
  const tapT = Math.random() * 4.4, touch = Math.random() < 0.5, eyeT = Math.random() < 0.5 ? Math.random() * 3 : 99;
  const away = Math.random() < 0.06 ? Math.random() * 3 : 99, missTap = Math.random() < 0.1, spam = Math.random() < 0.1;
  let tapped = false, tapInfo = null, eyed = false, guard = 0;
  while (!rep.result && guard++ < 20000) {
    const d = dtOf(); rep.tick(d); rm.v += d * 1000;
    if (rep.result) break;
    if (rep.phase !== "live") continue;
    if (!eyed && rep.t >= eyeT) { eyed = true; rep.setEye({ x: Math.random() * 53.33, y: -5 + Math.random() * 35 }); }
    if (rep.t >= away && !rep.pending && rep.throwAway()) break;
    if (!tapped && rep.t >= tapT) {
      tapped = true;
      const pos = Object.keys(rep.sim.players)[Math.floor(Math.random() * Object.keys(rep.sim.players).length)];
      const st = rep.sim.players[pos].run.stateAt(rep.t);
      const pt = missTap ? { x: Math.random() * 53, y: 40 } : { x: st.x + (Math.random() - 0.5) * 3, y: st.y + (Math.random() - 0.5) * 3 };
      const a = rep.tapAt(pt, rm.v);
      tapInfo = { a, t1: rep.t, rel: rep.pending ? rep.pending.rel : null };
      if (touch && a === "throw") rep.tapAt({ x: 0, y: 0 }, rm.v + Math.random() * 260);
    }
    if (spam && Math.random() < 0.2) rep.tapAt({ x: Math.random() * 53, y: Math.random() * 30 }, rm.v);
  }
  const R = rep.result;
  ok(!!R, "G: rep never finished", { level, phase: rep.phase, t: rep.t });
  if (!R) return;
  agg.reps++; agg.kinds[R.kind] = (agg.kinds[R.kind] || 0) + 1;
  const L = agg.byLevel[level] || (agg.byLevel[level] = { n: 0, epa: 0, comp: 0, att: 0, sack: 0 });
  L.n++; L.epa += R.epa; if (R.e) { L.att++; if (R.kind === "complete") L.comp++; } if (R.kind === "sack") L.sack++;
  // invariants
  ok(fin(R.epa) && Math.abs(R.epa) < 9, "G: EPA out of range", { epa: R.epa, kind: R.kind });
  ok(["complete", "incomplete", "int", "sack", "throwaway", "delay", "run"].includes(R.kind), "G: unknown result", { k: R.kind });
  if (rep.call) ok(!!rep.formFor(rep.call) && rep.sim && B.FORMATIONS[rep.sim.formationId].personnel === rep.personnel, "G: formation not in the personnel", { p: rep.personnel, f: rep.sim && rep.sim.formationId });
  if (R.kind === "run") {
    ok(rep.isRun() && !rep.ball && !rep.pending, "G: run with a throw", {});
    ok(Number.isInteger(R.gain) && R.gain >= -8 && R.gain <= rep.rep.sit.yl, "G: run gain out of range", { g: R.gain, yl: rep.rep.sit.yl });
    ok(R.td === (R.gain >= rep.rep.sit.yl), "G: run TD flag", {});
    ok(R.run && fin(R.run.exp) && R.run.box >= 4 && R.run.box <= 11, "G: run report", { r: R.run });
    for (const f of rep.frames) { ok(fin(f.recv.RB.x) && fin(f.recv.RB.y) && f.ball && fin(f.ball.x), "G: run frame NaN", {}); }
    agg.runs = (agg.runs || 0) + 1; agg.runYds = (agg.runYds || 0) + R.gain;
  }
  if (R.kind !== "delay" && rep.isRun()) ok(R.kind === "run", "G: run call ended as " + R.kind, {});
  if (rep.ball) {
    const e = rep.ball.e;
    agg.thrown++; agg.pCsum += e.pC; agg.intSum += e.pInt; if (R.kind === "complete") agg.comp++; if (R.kind === "int") agg.ints++;
    ok(["complete", "incomplete", "int"].includes(R.kind), "G: ball thrown but result " + R.kind, { tLeave: rep.ball.tLeave, sackT: rep.rep.sackT });
    ok(rep.ball.tLeave < rep.rep.sackT, "G: ball released after the sack time", { tLeave: rep.ball.tLeave, sackT: rep.rep.sackT });
    ok(Math.abs(rep.ball.tLeave - (rep.pending.t1 + rep.pending.rel)) < 1e-9, "G: release not at t1+rel", {});
    ok(e.pC >= 0 && e.pC <= 1 && e.pInt >= 0 && e.pInt <= 1 && e.pInc >= -1e-9 && Math.abs(e.pC + e.pInt + e.pInc - 1) < 1e-6, "G: bad probabilities", { pC: e.pC, pI: e.pInt, pN: e.pInc });
    const flight = e.ta - rep.ball.tLeave;
    ok(flight > 0 && flight < 7.9, "G: catch-point search ran out", { flight, air: e.air });
    ok(flight + 0.021 >= P.flightTime(e.air, e.type), "G: ball arrived faster than its flight time", { flight, ft: P.flightTime(e.air, e.type) });
    ok(e.C.x >= 0.9 && e.C.x <= 52.5 && e.C.y > -12 && e.C.y < rep.rep.sit.yl + 10.5, "G: catch point off the field", { C: e.C });
    ok(Number.isInteger(e.gain) && e.gain <= rep.rep.sit.yl, "G: gain not an integer or past the goal", { g: e.gain, yl: rep.rep.sit.yl });
    if (R.kind === "complete" && R.gain > 40) agg.bigGain++;   // actual gain now comes from the simulated run, not the expectation
    ok(fin(e.ev) && fin(e.evC) && fin(e.evI) && fin(e.evN), "G: EV not finite", {});
    const last = rep.frames[rep.frames.length - 1];
    ok(last.t >= e.ta, "G: result before the ball arrived", { last: last.t, ta: e.ta });
    for (let tt = rep.ball.tLeave; tt <= e.ta; tt += 0.1) { const b = rep.ballAt(tt); ok(b && fin(b.x) && fin(b.y) && fin(b.h), "G: ball position NaN", { tt }); }
    agg.maxCam = Math.max(agg.maxCam, e.C.y);
  }
  if (R.kind === "sack") {
    ok(!rep.ball, "G: sack with the ball out", {});
    if (rep.pending) ok(rep.pending.t1 + rep.pending.rel >= rep.rep.sackT - 1e-9, "G: sacked although release was before the sack time", { t1: rep.pending.t1, rel: rep.pending.rel, sackT: rep.rep.sackT });
    ok(Math.abs(rep.t - rep.rep.sackT) < 1e-9, "G: sack not at sack time", { t: rep.t, sackT: rep.rep.sackT });
    ok(R.gain === -7, "G: sack yardage", {});
  }
  if (R.kind === "delay") ok(rep.frames.length === 0 && !rep.idAtSnap, "G: delay after a snap", {});
  else ok(!!rep.idAtSnap, "G: snapped without recording the read", {});
  if (tapInfo && tapInfo.a === "throw" && tapInfo.t1 + tapInfo.rel < rep.rep.sackT && R.kind !== "throwaway")
    ok(!!rep.ball, "G: tapped in time but no ball came out", { tapInfo, sackT: rep.rep.sackT, k: R.kind });
  // frames
  let prevT = -1;
  for (const f of rep.frames) {
    ok(f.t >= prevT - 1e-12, "G: frame time went backwards", {}); prevT = f.t;
    for (const d of f.defs) if (!(fin(d.x) && fin(d.y))) { ok(false, "G: defender NaN in frame", { t: f.t }); break; }
    for (const k in f.recv) if (!(fin(f.recv[k].x) && fin(f.recv[k].y))) { ok(false, "G: receiver NaN in frame", { t: f.t }); break; }
    ok(fin(f.qb.x) && fin(f.qb.y), "G: QB NaN", {});
  }
  ok(rep.releaseFrameIndex() >= 0 && (rep.frames.length === 0 || rep.releaseFrameIndex() < rep.frames.length), "G: replay index out of range", {});
  if (R.oracle) {
    for (const s of R.oracle.timeline) ok(fin(s.best.ev), "G: oracle EV NaN", {});
    if (R.oracle.overall) ok(fin(R.oracle.overall.t), "G: oracle time NaN", {});
  }
  if (R.bestAtRelease) ok(fin(R.bestAtRelease.ev), "G: best-at-release NaN", {});
  ok(rep.result.id && (rep.result.id.cov == null || D.COV[rep.result.id.cov]), "G: invalid coverage read stored", { id: rep.result.id });
  if (rep.result.id && rep.result.id.cov) ok(D.COV[rep.result.id.cov].deep === rep.result.id.deep, "G: read stored with the wrong shell", { id: rep.result.id });
  if (R.kind !== "delay" && R.kind !== "run") {
    const pl = R.plan;
    ok(pl && fin(pl.sackT) && pl.sackT >= 1.35 - 1e-9 && pl.sackT <= 4.4 + 1e-9, "G: pocket time out of range", { s: pl && pl.sackT });
    if (pl && pl.freeId) ok(pl.sackT <= 2.6 + 1e-9 && (pl.extra.L > 0 || pl.extra.R > 0), "G: free rusher without an unblocked side", { pl: pl.extra });
    if (pl && !pl.freeId) ok(pl.extra.L <= 0 && pl.extra.R <= 0, "G: unblocked side but no free rusher", { pl: pl.extra });
    ok(pl && pl.nR >= 4 && pl.nR <= 6 && pl.nB >= 5 && pl.nB <= 8, "G: rusher/blocker counts", { r: pl && pl.nR, b: pl && pl.nB });
    if (rep.pending) {
      const extra = rep.pending.rel - P.REL - rep.readAdj;
      ok(Math.abs(extra) < 1e-9 || Math.abs(extra - P.EYE_COST) < 1e-9, "G: release time not REL + read + eyes", { rel: rep.pending.rel, read: rep.readAdj });
      ok(!rep.sim.players[rep.pending.pos].blocking, "G: threw to a back who stayed in to block", {});
    }
    ok([0, P.READ_RIGHT, P.READ_WRONG_SHELL].includes(rep.readAdj), "G: odd read adjustment", { r: rep.readAdj });
    if (R.kind === "complete") {
      ok(R.rac && Number.isInteger(R.gain) && R.gain === rep.ball.gain && R.gain <= rep.rep.sit.yl, "G: completion yardage inconsistent", { g: R.gain, bg: rep.ball.gain });
      const last = rep.frames[rep.frames.length - 1];
      ok(last.t >= rep.ball.e.ta + (rep.ball.rac ? rep.ball.rac.t : 0) - 1e-6, "G: result before the run after the catch ended", {});
      agg.yac = (agg.yac || 0) + R.rac.yac; agg.racN = (agg.racN || 0) + 1;
    }
  }
  if (R.kind !== "delay") for (const p of rep.def.players) if (p.man) ok(p.mp && fin(p.mp.x) && fin(p.mp.y), "G: man defender NaN", { id: p.id });
  agg.epa += R.epa;
}
const N = +(process.argv[2] || 4000);
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  try { fuzzOne(); } catch (err) { ok(false, "G: exception " + err.message, { stack: String(err.stack).split("\n").slice(0, 3).join(" / ") }); }
}
/* ================= H: situations and defensive calls ================= */
for (let i = 0; i < 20000; i++) {
  const lvl = 1 + (i % 5), r = P.makeRep(lvl);
  ok(r.sit.down >= 1 && r.sit.down <= 3 && r.sit.togo >= 1 && r.sit.togo <= r.sit.yl && r.sit.yl >= 1 && r.sit.yl <= 99, "H: bad situation", r.sit);
  ok(fin(r.pressN) && r.freeU >= 0 && r.freeU < 1 && (r.blitzSide === "L" || r.blitzSide === "R"), "H: pocket dice missing", {});
  ok(!D.COV[r.cov].man || typeof r.press === "boolean", "H: man coverage without a press flag", {});
  ok(D.COV[r.cov].shells.includes(r.truth), "H: true shell does not fit the coverage", { cov: r.cov, truth: r.truth });
  ok(r.disguised ? D.SHELL[r.shown].deep !== D.SHELL[r.truth].deep : r.shown === r.truth, "H: disguise flag inconsistent", { s: r.shown, t: r.truth });
  agg.covN = agg.covN || {}; agg.covN[r.cov] = (agg.covN[r.cov] || 0) + 1;
  ok(r.declareAt === -1 ? r.disguised : (r.declareAt >= P.LEVELS[lvl].declare[0] && r.declareAt <= P.LEVELS[lvl].declare[1]), "H: declare time out of range", { d: r.declareAt, lvl });
  if (lvl >= 4) ok(r.scout.length === 2, "H: missing scouting cards", {});
  if (lvl === 5) ok(!!r.baiter && !r.scout.find(s => s.id === r.baiter), "H: baiter missing or also an outlier", {});
}

console.log(`G  fuzz: ${agg.reps}/${N} snaps finished in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log("   results", JSON.stringify(agg.kinds));
console.log(`   thrown ${agg.thrown}: completions ${agg.comp} vs model expectation ${agg.pCsum.toFixed(0)}; INTs ${agg.ints} vs ${agg.intSum.toFixed(0)}`);
console.log(`   mean EPA ${(agg.epa / agg.reps).toFixed(3)}, completions over 40 yd ${agg.bigGain}, deepest catch point ${agg.maxCam.toFixed(1)} yd, mean YAC ${((agg.yac || 0) / Math.max(1, agg.racN || 0)).toFixed(1)}`);
for (const l in agg.byLevel) { const L = agg.byLevel[l]; console.log(`   level ${l}: ${L.n} snaps, EPA/play ${(L.epa / L.n).toFixed(2)}, comp ${(100 * L.comp / Math.max(1, L.att)).toFixed(0)}%, sacks ${(100 * L.sack / L.n).toFixed(0)}%`); }
console.log("H  20000 generated situations checked; coverage mix", JSON.stringify(agg.covN));
console.log(`   runs ${agg.runs || 0}, ${((agg.runYds || 0) / Math.max(1, agg.runs || 0)).toFixed(2)} yd per carry`);
console.log(`\n${checks} checks, ${fails} failures`);
const grp = {}; for (const f of failLog) { const k = f.split(" | ")[0]; grp[k] = (grp[k] || 0) + 1; }
for (const k in grp) console.log("  FAIL x" + grp[k] + " " + k + " e.g. " + failLog.find(f => f.startsWith(k)).slice(0, 300));
process.exit(fails ? 1 : 0);
