/* Pocket lab: film of one play for the Study tab, built by the same engine
   that runs Play. No browser code, so node can check every lesson's film.

   film(spec) runs a Rep with the defense, coverage and shell fixed by the
   lesson instead of drawn at random, records the pre-snap look (with the
   rotation, if any) and the play after the snap, and keeps each zone
   defender's match rule on every frame.

   spec: {
     cid:        concept id (playbook.js)
     pers:       offensive personnel, "11" default
     pkg:        "base" | "nickel" | "dime" (default from personnel: 11/10 nickel, 12/21 base)
     cov:        coverage key (defense.js COV)
     truth:      the shell they play (default: the coverage's first shell)
     shown:      the shell they show (default: truth)
     declare:    seconds before the snap that the defense moves to its real
                 alignment (default 1.2 when shown = truth; null = rotate at the snap)
     flip, press, variant ("blitz"), blitzSide ("L"/"R")
     prot:       {slide: "L"|"R", keepRB: bool} (default: the game's default slide)
     pocket:     "clean" (no sack inside the film, default) | "real"
     pre:        seconds of pre-snap film (default 1.6)
     T:          seconds of post-snap film (default 3.2)
     eye:        [{t, x, y}] where the QB's eyes go, from time t
     throwAt:    {t, pos, type} a throw (decision at t)
     sit:        {down, togo, yl}
   } */
(function (root) {
  "use strict";
  const req = n => (typeof require !== "undefined" ? require(n) : null);
  const E = root.PocketEngine || req("./engine.js");
  const B = root.PocketBook || req("./playbook.js");
  const D = root.PocketDefense || req("./defense.js");
  const P = root.PocketPlay || req("./play.js");
  const RP = root.PocketRep || req("./rep.js");
  const CBYID = Object.fromEntries(B.CONCEPTS.map(c => [c.id, c]));
  const DT = 1 / 60;

  const PKG_FOR = { "11": "nickel", "10": "dime", "12": "base", "21": "base" };

  function film(spec) {
    const s = Object.assign({ pers: "11", flip: false, press: false, variant: null, blitzSide: "R", pocket: "clean", pre: 1.6, T: 3.2 }, spec);
    const c = CBYID[s.cid];
    if (!c) throw new Error("no concept " + s.cid);
    const C = D.COV[s.cov];
    if (!C) throw new Error("no coverage " + s.cov);
    const fm = (c.forms || [c.formation]).find(f => B.FORMATIONS[f].personnel === s.pers);
    if (!fm) throw new Error(s.cid + " has no " + s.pers + " formation");
    const sit = Object.assign({ down: 1, togo: 10, yl: 65 }, s.sit || {});
    const truth = s.truth || (s.cov === "c1" ? (s.press ? "onePress" : "one") : (s.cov === "m2" && s.press ? "press" : C.shells[0]));
    const shown = s.shown || truth;
    const rep = P.makeRep(3, { sit, personnel: s.pers });
    Object.assign(rep, {
      pkg: s.pkg || PKG_FOR[s.pers] || "nickel", cov: s.cov, variant: s.variant, press: !!s.press, truth, shown,
      disguised: shown !== truth, declareAt: -1, flip: !!s.flip, blitzSide: s.blitzSide, mods: {}, scout: [], baiter: null,
      pressN: 0, freeU: 0.5, winnerU: 0.5, team: null,
      capY: sit.yl <= 22 ? Math.max(4, sit.yl + 6) : null, zoneCap: sit.yl <= 22 ? sit.yl + 8 : null, endLine: sit.yl + 10
    });
    const G = new RP.Rep(3, [s.cid], { rep, personnel: s.pers });
    G.L = Object.assign({}, G.L, { speed: 1 });
    G.call = s.cid;
    G.breakHuddle();

    // pre-snap: start once everyone has walked up to the shown look
    const declare = s.declare === undefined ? (shown === truth ? 1.2 : null) : s.declare;
    const tau0 = 3.2, snapTau = tau0 + s.pre;
    const pre = [];
    const qb0 = E.qbAt(G.drop(), 0), recv0 = {};
    for (const pos in G.sim.players) { const st = G.sim.players[pos].run.start; recv0[pos] = { x: st.x, y: st.y }; }
    let declared = false;
    for (let tau = tau0; tau < snapTau - 1e-9; tau += DT) {
      if (declare != null && !declared && tau >= snapTau - declare) { D.declare(G.def, tau); declared = true; }
      pre.push({ t: tau - snapTau, qb: qb0, recv: recv0, defs: G.def.players.map(p => { const q = D.preState(G.def, p, tau); return { x: q.x, y: q.y }; }), ball: null, rules: null });
    }
    if (declare != null && !declared) D.declare(G.def, snapTau - declare);
    G.tau = snapTau;
    if (s.prot) G.setProtection(s.prot.slide, s.prot.keepRB);
    G.snap();
    const plan = G.plan;
    if (s.pocket === "clean" && plan) {
      const sackT = Math.max(G.rep.sackT, s.T + 1.5);
      G.rep.sackT = sackT;
      D.setRush(G.def, Object.assign({}, G.def.rushPlan, { sackT, qbT: E.qbAt(G.drop(), sackT), freeId: null }));
    }
    const eyes = (s.eye || []).slice().sort((a, b) => a.t - b.t);
    const rulesNow = () => G.def.players.map(p => p.rule && !p.rush && !p.man ? Object.assign({}, p.rule) : null);
    let threw = false;
    for (let k = 0; k < 2000 && !G.result; k++) {
      const tn = G.t + DT;
      for (const e of eyes) if (e.t <= tn) G.eye = { x: e.x, y: e.y };
      if (s.throwAt && !threw && tn >= s.throwAt.t) {
        threw = true;
        G.pending = { pos: s.throwAt.pos, t1: s.throwAt.t, rel: P.REL + G.readAdj, type: s.throwAt.type || "fast", realT: 0 };
      }
      G.stepLive(DT);
      if (G.frames.length) G.frames[G.frames.length - 1].rules = rulesNow();
      if (!s.throwAt && G.t >= s.T) break;
    }
    const live = G.frames;
    const defs = G.def.players.map(p => ({ id: p.id, arch: p.arch, rush: p.rush, blitz: p.blitz, dl: p.dl, man: p.man,
      zone: p.zone ? p.zone.name : null, tier: p.zone ? p.zone.tier : null, land: p.land ? { x: p.land.x, y: p.land.y } : null, role: p.zone && !p.rush && !p.man ? D.roleOf(G.def, p) : null }));
    return { spec: s, G, rep: G.rep, sim: G.sim, def: G.def, defs, pre, live, frames: pre.concat(live), plan, nums: G.def.nums || numbersOf(G.sim),
      drop: G.drop(), concept: c, sit, tTop: B.DROPS[c.drop].t, result: G.result };
  }

  /* receivers numbered outside-in on each side, as the defense counts them */
  function numbersOf(sim) {
    const out = { L: [], R: [] };
    for (const pos in sim.players) {
      if (pos === "RB") continue;
      const st = sim.players[pos].run.start;
      out[st.x < D.FW / 2 ? "L" : "R"].push({ pos, d: Math.abs(st.x - D.FW / 2) });
    }
    for (const k of ["L", "R"]) out[k] = out[k].sort((a, b) => b.d - a.d).map(o => o.pos);
    return out;
  }
  function numberOf(nums, pos) {
    for (const k of ["L", "R"]) { const i = nums[k].indexOf(pos); if (i >= 0) return { side: k, n: i + 1 }; }
    return null;
  }

  /* what each throw is worth if the decision is made at t: the engine's own
     grader (play.js evalThrow), best of a bullet and touch */
  function evalAt(F, t) {
    const ctx = { sim: F.sim, def: F.def, sit: F.sit, eye: null };
    const rel = P.REL + (F.G.readAdj || 0);
    const fr = P.frameAt(F.live, t + rel);
    if (!fr || t + rel > F.live[F.live.length - 1].t + 1e-6) return null;
    const defs = F.def.players.map((p, i) => ({ p, st: fr.defs[i] }));
    const out = {};
    for (const pos of P.targets(F.sim)) {
      let best = null;
      for (const type of ["fast", "touch"]) {
        const e = P.evalThrow(ctx, pos, type, t + rel, defs, fr.qb);
        if (!best || e.ev > best.ev) best = e;
      }
      out[pos] = { ev: best.ev, how: best.how, type: best.type, C: best.C, air: best.air, sep: best.sep };
    }
    return out;
  }
  function evTimeline(F, t0, t1, step) {
    t0 = t0 == null ? 0.4 : t0; step = step || 0.1;
    const end = Math.min(t1 == null ? 9 : t1, F.live[F.live.length - 1].t - P.REL - (F.G.readAdj || 0));
    const out = [];
    for (let t = t0; t <= end + 1e-6; t += step) { const v = evalAt(F, t); if (v) out.push({ t: +t.toFixed(2), v }); }
    return out;
  }

  /* a rep for a Play drill: the game's own random rep, kept only if it matches
     the drill (coverage family, shell), so the frequencies inside the drill are
     still the NFL's */
  function repFor(level, opts) {
    opts = opts || {};
    let r = null;
    for (let i = 0; i < 400; i++) {
      r = P.makeRep(level, opts);
      const okC = !opts.covs || opts.covs.includes(r.cov);
      const okD = opts.deep == null || D.COV[r.cov].deep === opts.deep;
      if (okC && okD) return r;
    }
    return r;
  }

  /* players named by job, so a lesson stays right whoever the engine puts in
     the job: {def: [ids]}, {off: [pos]}, {num: [side, n]} (side "L", "R",
     "strong" or "weak"), {zone: [zone names]}, {free: true} (the unblocked
     rusher), {arch: ["LB"]}. Returns {def: [defender indices], off: [positions]} */
  function who(F, sel) {
    const out = { def: [], off: [] };
    if (!sel) return out;
    const N = F.nums || numbersOf(F.sim);
    const strong = N.R.length > N.L.length ? "R" : (N.L.length > N.R.length ? "L" : (F.spec.flip ? "L" : "R"));
    const sideOf = sd => sd === "strong" ? strong : (sd === "weak" ? (strong === "R" ? "L" : "R") : sd);
    F.defs.forEach((d, i) => {
      if ((sel.def && sel.def.includes(d.id)) || (sel.zone && sel.zone.includes(d.zone)) ||
          (sel.free && F.plan && F.plan.freeId === d.id) || (sel.arch && sel.arch.includes(d.arch) && !d.dl)) out.def.push(i);
    });
    if (sel.off) out.off.push(...sel.off.filter(p => F.sim.players[p]));
    const nums = sel.num ? (Array.isArray(sel.num[0]) ? sel.num : [sel.num]) : [];
    for (const [sd, n] of nums) { const p = N[sideOf(sd)][n - 1]; if (p) out.off.push(p); }
    return out;
  }

  const api = { film, numbersOf, numberOf, evalAt, evTimeline, repFor, who, PKG_FOR };
  root.PocketLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
