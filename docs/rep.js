/* Pocket rep: one snap as a state machine, with no browser code, so node can
   drive thousands of them for testing. game.js draws it and feeds it input.

   phases: huddle -> line -> live -> result
   tick(dtReal) advances the play clock in real seconds and the play in game
   seconds (dtReal x level speed). Taps carry a real-time stamp so the
   double-tap window is measured the way a thumb experiences it.

   Rules:
   - the ball leaves at exactly t1 + release (release = 0.35 s, minus 0.07 for a
     correct coverage read, plus 0.08 for the wrong shell, plus 0.10 for a look-off)
   - a sack needs the pocket to close before the release; a ball in the air
     always runs to the catch point
   - a completion becomes a run after the catch, simulated and animated
   - the pocket comes from the protection: rushers against blockers per side */
(function (root) {
  "use strict";
  const req = n => (typeof require !== "undefined" ? require(n) : null);
  const E = root.PocketEngine || req("./engine.js");
  const B = root.PocketBook || req("./playbook.js");
  const D = root.PocketDefense || req("./defense.js");
  const P = root.PocketPlay || req("./play.js");
  const RN = root.PocketRun || req("./run.js");
  const CBYID = Object.fromEntries(B.CONCEPTS.map(c => [c.id, c]));
  const DOUBLE_TAP_MS = 280, HOLD_MS = 200, LAND_HOLD = 0.65;

  class Rep {
    /* opts: {rep, sit (from a drive), personnel ("11" default), coord (the
       adaptive coordinator, shared across a drive or game)} */
    constructor(level, ids, opts) {
      opts = opts || {};
      this.level = level;
      this.L = P.LEVELS[level];
      this.ids = ids.slice();
      this.coord = opts.coord || null;
      this.team = opts.team || null;                 // a 2025 NFL defense to play against, or league average
      this.personnel = opts.personnel || (opts.rep && opts.rep.personnel) || "11";
      if (!this.ids.some(id => this.formFor(id))) this.personnel = "11";
      this.rep = opts.rep || P.makeRep(level, { sit: opts.sit, personnel: this.personnel, coord: this.coord, team: this.team });
      this.runRes = null; this.clockAtSnap = null;
      this.phase = "huddle";
      this.clock = P.PLAY_CLOCK;
      this.slot = "call"; this.call = null; this.kill = null; this.live = "call";
      this.tau = 0; this.id = { cov: null, deep: null }; this.idAtSnap = null;
      this.prot = { slide: null, keepRB: false }; this.plan = null;
      this.def = null; this.sim = null; this.t = 0; this.eye = null; this.readAdj = 0; this.readKind = "none";
      this.pending = null; this.ball = null; this.frames = [];
      this.result = null; this.lateCall = false; this.landReal = 0;
      this.onFlash = null;
    }
    flash(text, tone) { if (this.onFlash) this.onFlash(text, tone || ""); }
    concept(which) { return CBYID[this[which || this.live]]; }
    /* the formation a play runs from in the current personnel, or null if it
       has none (then it is not on the call sheet this snap) */
    formFor(id) {
      const c = CBYID[id];
      if (!c) return null;
      return (c.forms || [c.formation]).find(f => B.FORMATIONS[f].personnel === this.personnel) || null;
    }
    available() { return this.ids.filter(id => this.formFor(id)); }
    simFor(id, override) {
      return E.simulate(CBYID[id], B.FORMATIONS, B.ROUTES,
        { mirror: this.rep.flip, override, formation: this.formFor(id), ymax: this.rep.sit.yl + 10 });
    }
    isRun(id) { const c = CBYID[id || this[this.live]]; return !!(c && c.kind === "run"); }
    drop() {
      const c = this.concept(), fm = B.FORMATIONS[this.formFor(c.id) || c.formation];
      return Object.assign({}, B.DROPS[c.drop], { under: !!fm.under, sign: (c.bootDir || 1) * (this.rep.flip ? -1 : 1) });
    }
    recvAll(sim) {
      return Object.values(sim.players).map(p => ({ pos: p.pos, x: p.run.start.x, y: p.run.start.y, arch: p.archKey }));
    }
    /* default protection: slide toward the formation's strength (more receivers;
       on a tie, the Y's side) */
    defaultSlide() {
      if (!this.sim) return "R";
      let l = 0, r = 0;
      for (const pos in this.sim.players) { if (pos === "RB") continue; if (this.sim.players[pos].run.start.x < D.FW / 2) l++; else r++; }
      if (l !== r) return l > r ? "L" : "R";
      const y = this.sim.players.Y;
      return y && y.run.start.x < D.FW / 2 ? "L" : "R";
    }

    /* ---------- huddle ---------- */
    /* change personnel: the defense substitutes and makes a new call */
    setPersonnel(pers) {
      if (this.phase !== "huddle" || !B.PERSONNEL[pers] || pers === this.personnel) return false;
      const prev = this.personnel;
      this.personnel = pers;
      if (!this.available().length) { this.personnel = prev; return false; }
      const flip = this.rep.flip, force = this.rep.forceSackT;
      this.rep = P.makeRep(this.level, { sit: this.rep.sit, personnel: pers, coord: this.coord, team: this.team });
      this.rep.flip = flip; if (force) this.rep.forceSackT = force;
      if (this.call && !this.formFor(this.call)) this.call = null;
      if (this.kill && !this.formFor(this.kill)) this.kill = null;
      this.slot = this.call ? "kill" : "call";
      return true;
    }
    pick(cid) {
      if (this.phase !== "huddle" || !CBYID[cid] || !this.ids.includes(cid) || !this.formFor(cid)) return false;
      this[this.slot] = cid;
      if (this.slot === "call" && !this.kill) this.slot = "kill";
      return true;
    }
    setSlot(s) { if (this.phase === "huddle" && (s === "call" || s === "kill")) this.slot = s; }
    breakHuddle() {
      if (this.phase !== "huddle") return false;
      if (!this.call) { this.call = this.available()[0]; this.lateCall = true; }
      this.live = "call";
      this.sim = this.simFor(this.call);
      const r = this.rep, all = this.recvAll(this.sim);
      this.def = D.build({ pkg: r.pkg, cov: r.cov, shown: r.shown, truth: r.truth, mirror: r.flip, mods: r.mods,
        variant: r.variant, press: r.press, blitzSide: r.blitzSide, recv: all.filter(q => q.arch !== "RB"), recvAll: all,
        capY: r.capY, zoneCap: r.zoneCap, endLine: r.endLine });
      this.prot.slide = this.defaultSlide();
      this.phase = "line"; this.tau = 0;
      return true;
    }

    /* ---------- line ---------- */
    toggleKill() {
      if (this.phase !== "line" || !this.kill) return false;
      const before = this.sim.formationId;
      this.live = this.live === "call" ? "kill" : "call";
      this.sim = this.simFor(this[this.live]);
      if (this.sim.formationId !== before) {
        const all = this.recvAll(this.sim);
        D.realign(this.def, all.filter(q => q.arch !== "RB"), all, this.tau);
        this.prot.slide = this.defaultSlide();
      }
      return true;
    }
    /* the coverage read: one coverage id, or null to clear */
    setRead(cov) {
      if (this.phase !== "line") return;
      if (cov === null || cov === undefined) { this.id = { cov: null, deep: null }; return; }
      if (!D.COV[cov]) return;
      this.id = { cov, deep: D.COV[cov].deep };
    }
    setProtection(slide, keepRB) {
      if (this.phase !== "line") return;
      if (slide === "L" || slide === "R") this.prot.slide = slide;
      if (typeof keepRB === "boolean") this.prot.keepRB = keepRB;
    }
    snap() {
      if (this.phase !== "line") return false;
      this.clockAtSnap = this.clock;
      D.snap(this.def, this.tau);
      this.idAtSnap = Object.assign({}, this.id);
      if (this.isRun()) return this.snapRun();
      // protection decides the pocket; the back's job and any jammed releases shape the routes
      const plan = P.protection(this.rep, this.def, this.sim, this.prot);
      const over = {};
      if (plan.rbJob === "block" && !this.sim.players.RB.blocking) over.RB = { route: "block" };
      else if (plan.rbJob === "check") over.RB = { delay: 0.9 };
      for (const pos of D.pressed(this.def, this.recvAll(this.sim))) over[pos] = Object.assign(over[pos] || {}, { delay: 0.12 });
      this.sim = this.simFor(this[this.live], over);
      if (this.concept().pa) D.paBite(this.def, this.rep.paRespect);
      plan.pressed = Object.keys(over).filter(k => k !== "RB" || plan.rbJob === "route");
      this.plan = plan;
      this.rep.sackT = plan.sackT;
      D.setRush(this.def, { sackT: plan.sackT, qbT: E.qbAt(this.drop(), plan.sackT), freeId: plan.freeId, winnerId: plan.winnerId });
      const rr = P.readRel(this.idAtSnap, this.rep.cov);
      this.readAdj = rr.adj; this.readKind = rr.kind;
      this.phase = "live"; this.t = 0;
      return true;
    }

    /* a run: the whole play is simulated at the snap and played back */
    snapRun() {
      const c = this.concept();
      const dir = (this.rep.flip ? -1 : 1) * (c.runDir || 1);
      this.runCtx = { sim: this.sim, def: this.def, dir, aim: c.aim, scheme: c.id, yl: this.rep.sit.yl };
      this.runRes = RN.runSim(this.runCtx);
      this.plan = null; this.rep.sackT = Infinity;
      const rr = P.readRel(this.idAtSnap, this.rep.cov);
      this.readAdj = 0; this.readKind = rr.kind;
      this.phase = "live"; this.t = 0;
      return true;
    }
    runIndex(t) { return Math.min(this.runRes.path.length - 1, Math.max(0, Math.floor(t / this.runRes.dt))); }

    /* ---------- live input ---------- */
    receiversAt(t) {
      const out = {};
      for (const pos in this.sim.players) out[pos] = this.sim.players[pos].run.stateAt(t);
      return out;
    }
    routeList(t) {
      const out = [];
      for (const pos in this.sim.players) {
        const pl = this.sim.players[pos];
        if (pl.blocking) continue;
        const s = pl.run.stateAt(t);
        out.push({ pos, arch: pl.archKey, x: s.x, y: s.y, vx: s.vx, vy: s.vy });
      }
      return out;
    }
    setEye(pt) { if (this.phase === "live" && pt && isFinite(pt.x) && isFinite(pt.y)) this.eye = { x: pt.x, y: pt.y }; }
    tapAt(pt, nowMs) {
      if (this.phase !== "live" || this.ball || this.result || this.runRes) return null;
      if (this.pending) {
        if (nowMs - this.pending.realT < DOUBLE_TAP_MS && this.pending.type === "fast") {
          this.pending.type = "touch"; this.flash("Touch"); return "touch";
        }
        return null;
      }
      const rs = this.receiversAt(this.t);
      let best = null, bd = 5;
      for (const pos in rs) {
        if (this.sim.players[pos].blocking) continue;
        const d = Math.hypot(rs[pos].x - pt.x, rs[pos].y - pt.y); if (d < bd) { bd = d; best = pos; }
      }
      if (!best) return null;
      const Q = E.qbAt(this.drop(), this.t);
      let rel = P.REL + this.readAdj;
      if (this.eye) {
        const a1 = Math.atan2(this.eye.y - Q.y, this.eye.x - Q.x), a2 = Math.atan2(rs[best].y - Q.y, rs[best].x - Q.x);
        let da = Math.abs(a1 - a2); if (da > Math.PI) da = 2 * Math.PI - da;
        if (da > Math.PI / 3) rel += P.EYE_COST;
      }
      this.pending = { pos: best, t1: this.t, rel, type: "fast", realT: nowMs };
      return "throw";
    }
    throwAway() {
      if (this.phase !== "live" || this.ball || this.pending || this.result || this.runRes) return false;
      this.finish("throwaway");
      return true;
    }

    /* ---------- time ---------- */
    tick(dtReal) {
      if (!(dtReal > 0) || this.result) return;
      if (this.phase === "huddle" || this.phase === "line") {
        this.clock -= dtReal;
        if (this.phase === "huddle" && this.clock <= P.AUTO_BREAK) this.breakHuddle();
        if (this.phase === "line") {
          this.tau += dtReal;
          if (this.rep.declareAt >= 0 && this.clock <= this.rep.declareAt) D.declare(this.def, this.tau);
          if (this.clock <= 0) { this.clock = 0; this.finish("delay"); }
        }
      } else if (this.phase === "live") this.stepLive(dtReal);
    }

    stepLive(dtReal) {
      const dt = dtReal * this.L.speed;
      const t = this.t + dt;
      if (this.runRes) {
        this.t = Math.min(t, this.runRes.t); this.recordFrame(this.t);
        if (t >= this.runRes.t) { this.landReal += dtReal; if (this.landReal >= LAND_HOLD) this.finish("run"); }
        return;
      }
      const sackT = this.rep.sackT;
      if (this.pending && !this.ball) {
        const tLeave = this.pending.t1 + this.pending.rel;
        if (tLeave >= sackT && t >= sackT) { this.t = sackT; this.recordFrame(sackT); this.finish("sack"); return; }
        if (t >= tLeave) this.release(tLeave);
      }
      if (!this.ball && t >= sackT) { this.t = sackT; this.recordFrame(sackT); this.finish("sack"); return; }

      this.t = t;
      if (!this.ball) D.stepOffsets(this.def, t, dt, this.routeList(t), this.eye, (pos, tt) => this.sim.players[pos] ? this.sim.players[pos].run.stateAt(tt) : null);
      this.recordFrame(t);

      if (this.ball && t >= this.ball.e.ta) {
        const b = this.ball;
        if (!b.done) {
          b.done = true; this.landReal = 0;
          const words = { catch: "Caught", contested: "Contested catch", int: "Picked", breakup: "Broken up", tipped: "Tipped", range: "Overthrown" };
          this.flash(words[b.how] || "Incomplete", b.outcome === "complete" ? "good" : "bad");
        }
        const runEnd = b.rac ? b.e.ta + b.rac.t : b.e.ta;
        if (t >= runEnd) {
          if (b.rac && !b.ranOut) { b.ranOut = true; this.landReal = 0; if (b.rac.broken) this.flash("Broke a tackle", "good"); }
          this.landReal += dtReal;
          if (this.landReal >= LAND_HOLD) this.finish(b.outcome);
        }
      }
    }

    release(tLeave) {
      const Q = E.qbAt(this.drop(), tLeave);
      const defs = this.def.players.map(p => ({ p, st: D.stateAt(p, tLeave, this.def) }));
      const ctx = { sim: this.sim, def: this.def, sit: this.rep.sit, eye: this.eye };
      const e = P.evalThrow(ctx, this.pending.pos, this.pending.type, tLeave, defs, Q);
      // no dice: the outcome follows from where the defenders can get to (play.js evalThrow)
      const how = e.how;
      const outcome = how === "catch" || how === "contested" ? "complete" : (how === "int" ? "int" : "incomplete");
      let land = e.C;
      const Q0 = E.qbAt(this.drop(), tLeave), dx = e.C.x - Q0.x, dy = e.C.y - Q0.y, d = Math.hypot(dx, dy) || 1;
      if (how === "range") land = { x: Q0.x + dx / d * (e.maxAir - 3), y: Q0.y + dy / d * (e.maxAir - 3) };   // dies short of him
      if (how === "tipped" || (how === "int" && e.laneAt != null)) land = { x: Q0.x + dx * e.laneAt, y: Q0.y + dy * e.laneAt };
      const by = e.by ? e.contest.find(k => k.id === e.by) : null;
      // what each zone defender's match rule had him doing when the ball came out
      const rules = this.def.players.filter(p => p.rule && !p.rush && !p.man).map(p => Object.assign({ id: p.id }, p.rule));
      let ra = 0;
      if (this.eye) { const de = Math.hypot(this.eye.x - e.C.x, this.eye.y - e.C.y); ra = de < 6 ? -0.12 : (de > 12 ? 0.10 : 0); }
      const rac = how === "catch" ? P.runAfterCatch(ctx, e.pos, e.C, e.R, e.contest, "sample", e.air) : null;
      const idx = {};
      e.contest.forEach((k, i) => { idx[k.id] = i; });
      this.ball = { e, tLeave, Q, defs, outcome, how, land, by: by ? by.id : null, rules, nums: this.def.nums, ra, done: false, rac, cidx: idx,
        gain: outcome === "complete" ? Math.min(this.rep.sit.yl, Math.round(e.C.y + (rac ? rac.yac : 0))) : 0 };
    }

    /* positions after the catch come from the recorded run */
    racAt(t) {
      const b = this.ball;
      if (!b || !b.rac || t < b.e.ta) return null;
      const k = Math.min(b.rac.path.length - 1, Math.max(0, Math.round((t - b.e.ta) / b.rac.dt)));
      return k;
    }
    /* nobody runs out the back of the end zone */
    defenderStates(t) {
      const lim = this.rep.endLine - 0.3;
      return this.defenderStates0(t).map(q => q.y > lim ? Object.assign({}, q, { y: lim }) : q);
    }
    defenderStates0(t) {
      if (this.runRes) { const k = this.runIndex(t); return this.runRes.dpaths.map(dp => Object.assign({ vx: 0, vy: 0, sp: 0 }, dp[k])); }
      const k = this.racAt(t);
      return this.def.players.map((p, i) => {
        if (this.ball && t >= this.ball.tLeave && !p.rush) {
          if (k != null && this.ball.cidx[p.id] != null) {
            const q = this.ball.rac.dpaths[this.ball.cidx[p.id]][k];
            return { x: q.x, y: q.y, vx: 0, vy: 0, sp: 0 };
          }
          const tt = Math.min(t, this.ball.e.ta) - this.ball.tLeave;
          const at = D.pursue(p, this.ball.defs[i].st, this.ball.e.C, tt, this.ball.ra * p.a.instinct * 2, P.manTrack({ sim: this.sim }, p, this.ball.tLeave));
          // the defender who made the play is shown making it: he closes the last of his
          // gap over the final 0.3 s (his pursuit already put him within about a yard)
          if (this.ball.by === p.id && at.rem > 0.4) {
            const g = Math.max(0, Math.min(1, (tt - (this.ball.e.ta - this.ball.tLeave - 0.3)) / 0.3));
            const k = g * (at.rem - 0.4) / Math.max(at.rem, 1e-6);
            return { x: at.x + (this.ball.e.C.x - at.x) * k, y: at.y + (this.ball.e.C.y - at.y) * k, vx: 0, vy: 0, sp: 0 };
          }
          return { x: at.x, y: at.y, vx: 0, vy: 0, sp: 0 };
        }
        return D.stateAt(p, t, this.def);
      });
    }
    ballAt(t) {
      if (this.runRes) {
        if (t < this.runRes.tHand) { const q = E.qbAt(this.drop(), Math.min(t, 0.5)); return { x: q.x, y: q.y, h: 0.5 }; }
        const q = this.runRes.path[this.runIndex(t)]; return { x: q.x, y: q.y, h: 0.6 };
      }
      if (!this.ball || t < this.ball.tLeave) return null;
      const b = this.ball;
      const k = this.racAt(t);
      if (k != null) { const q = b.rac.path[k]; return { x: q.x, y: q.y, h: 0.6 }; }
      const f = Math.min(1, (t - b.tLeave) / (b.e.ta - b.tLeave));
      const arc = (b.e.type === "touch" ? 0.22 : 0.06) * b.e.air * 4 * f * (1 - f);
      const L = b.land || b.e.C;
      return { x: b.Q.x + (L.x - b.Q.x) * f, y: b.Q.y + (L.y - b.Q.y) * f, h: arc };
    }
    receiverShown(pos, t) {
      if (this.runRes && pos === "RB") return this.runRes.path[this.runIndex(t)];
      const b = this.ball;
      if (b && pos === b.e.pos && t >= b.e.ta) {
        const k = this.racAt(t);
        if (k != null) return b.rac.path[k];
        if (b.how === "range" || b.how === "tipped") return this.sim.players[pos].run.stateAt(t);   // he keeps running; the ball is elsewhere
        return b.e.C;
      }
      return this.sim.players[pos].run.stateAt(t);
    }
    recordFrame(t) {
      const recv = {};
      for (const pos in this.sim.players) { const s = this.receiverShown(pos, t); recv[pos] = { x: s.x, y: s.y }; }
      this.frames.push({ t, qb: E.qbAt(this.drop(), this.runRes ? Math.min(t, 0.5) : t), defs: this.defenderStates(t), recv, ball: this.ballAt(t),
        eye: this.eye ? { x: this.eye.x, y: this.eye.y } : null,
        pend: this.pending && !this.ball ? Math.min(1, (t - this.pending.t1) / this.pending.rel) : 0 });
    }

    /* ---------- scoring ---------- */
    finish(kind) {
      if (this.result) return this.result;
      const r = this.rep, s = r.sit;
      let gain = 0, epa = 0, e = null;
      if (kind === "delay") { gain = -5; epa = P.ep(s.down, s.togo + 5, Math.min(99, s.yl + 5)) - P.ep(s.down, s.togo, s.yl); }
      else if (kind === "sack") { gain = -7; epa = P.epa(s, -7, "comp"); this.flash("Sacked", "bad"); }
      else if (kind === "throwaway") { epa = P.epa(s, 0, "inc"); }
      else if (kind === "run") { gain = this.runRes.gain; epa = P.epa(s, gain, "comp"); }
      else {
        e = this.ball.e;
        if (kind === "complete") { gain = this.ball.gain; epa = P.epa(s, gain, "comp"); }
        else if (kind === "int") { epa = e.evI; }
        else { epa = e.evN; }
      }
      const res = { kind, gain, epa, e, td: (kind === "complete" || kind === "run") && gain >= s.yl, playT: this.t, clockAtSnap: this.clockAtSnap };
      if (kind === "complete") res.oob = !!(this.ball.rac && this.ball.rac.end === "oob");
      if (kind === "run") {
        const R = this.runRes;
        res.oob = R.end === "oob";
        res.run = { box: R.box, boxNFL: R.boxNFL, blockers: R.blockers, unblocked: R.unblocked, doubles: R.doubles, end: R.end, broken: R.broken, tfl: R.tfl,
          exp: RN.expectedRun(this.runCtx, 16) };
        res.plan = null; res.readKind = this.readKind; res.readAdj = 0;
      }
      if (this.concept() && this.concept().pa && this.def && this.def.pa) res.pa = this.def.pa;
      if (kind !== "delay" && kind !== "run") {
        const ctxO = { sim: this.sim, def: this.def, sit: s, eye: null };
        const rel = P.REL + this.readAdj;
        const tDecide = this.pending ? this.pending.t1 : this.t;
        const tEnd = this.pending ? Math.min(this.pending.t1 + rel, r.sackT) : Math.min(this.t, r.sackT);
        res.oracle = P.oracle(ctxO, this.frames, tEnd, rel);
        res.bestAtRelease = this.pending && this.ball ? P.bestAt(ctxO, this.frames, this.pending.t1, P.targets(this.sim), rel) : null;
        res.tDecide = tDecide;
        res.yourEV = e ? e.ev : (kind === "throwaway" ? P.epa(s, 0, "inc") : P.epa(s, -7, "comp"));
        res.plan = this.plan; res.readKind = this.readKind; res.readAdj = this.readAdj;
        if (kind === "complete") res.rac = this.ball.rac ? { yac: gain - Math.round(e.C.y), end: this.ball.rac.end, broken: this.ball.rac.broken, expYac: e.yac } : { yac: 0, end: "contested", broken: false, expYac: 0 };
      }
      res.id = this.idAtSnap || this.id;
      this.result = res; this.phase = "result";
      return res;
    }
    releaseFrameIndex() {
      const i = this.frames.findIndex(f => f.ball);
      return Math.max(0, i > 0 ? i - 1 : this.frames.length - 1);
    }
  }

  const api = { Rep, DOUBLE_TAP_MS, HOLD_MS, LAND_HOLD };
  root.PocketRep = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
