/* Pocket engine: shared motion model for the Coverage Clock family.
   Coordinates in yards. x runs 0..53.33 across the field (ball at the middle
   hash for now), y is depth from the line of scrimmage, positive downfield.

   The motion primitive is the Coverage Clock's trapezoidal speed profile,
   generalised to a non-zero end speed so a receiver can carry speed through
   a cut. Defensive kinematics will move into this file in Phase 2. */
(function (root) {
  "use strict";

  const FIELD = { W: 53.33, BALLX: 53.33 / 2, XMIN: 1.0, XMAX: 52.33, YMAX: 60 };   // YMAX: deep routes keep running to 60 yd

  /* ---------- receiver archetypes ----------
     speed yd/s, accel and decel yd/s^2, release s (time to clear the line),
     cut 0..1 (how much speed survives a hard break).
     Acceleration is set so the WR 10-yard split from a stance is ~1.6 s,
     near NFL combine splits. Constant acceleration still understates the
     first two steps; Phase 7 calibrates against tracking data. */
  const RARCH = {
    WR:   { label: "Outside receiver", speed: 10.0, accel: 8.4, decel: 10.5, release: 0.12, cut: 0.80 },
    SLOT: { label: "Slot receiver",    speed: 9.7,  accel: 8.8, decel: 11.0, release: 0.10, cut: 0.88 },
    TE:   { label: "Tight end",        speed: 9.0,  accel: 7.0, decel: 8.8,  release: 0.22, cut: 0.65 },
    RB:   { label: "Running back",     speed: 9.6,  accel: 8.2, decel: 10.2, release: 0.18, cut: 0.78 },
    FB:   { label: "Fullback",         speed: 8.7,  accel: 7.2, decel: 9.0,  release: 0.20, cut: 0.66 }
  };

  /* ---------- 1D profile with start and end speed ----------
     accelerate at a to a peak, cruise, decelerate at b to v1.
     If v1 is unreachable over D the profile does the best it can
     (ends faster or slower than asked) and reports vEnd. */
  function profile(D, a, b, vmax, v0, v1) {
    v0 = Math.min(Math.max(0, v0), vmax);
    if (D <= 1e-6) return { dur: 0, vEnd: v0, at: () => ({ s: 0, v: v0 }) };
    v1 = Math.min(Math.max(0, v1), vmax, Math.sqrt(v0 * v0 + 2 * a * D));
    v1 = Math.max(v1, Math.sqrt(Math.max(0, v0 * v0 - 2 * b * D)));
    let vpk = Math.sqrt((D + (v0 * v0) / (2 * a) + (v1 * v1) / (2 * b)) / (1 / (2 * a) + 1 / (2 * b)));
    vpk = Math.max(Math.min(vpk, vmax), v0, v1);
    const t1 = (vpk - v0) / a, d1 = (vpk * vpk - v0 * v0) / (2 * a);
    const dDec = (vpk * vpk - v1 * v1) / (2 * b);
    const dCr = Math.max(0, D - d1 - dDec), tc = vpk > 1e-6 ? dCr / vpk : 0;
    const t2 = t1 + tc, t3 = t2 + (vpk - v1) / b;
    return {
      dur: t3, vEnd: v1, vPeak: vpk,
      at(te) {
        let s, v;
        if (te <= 0) { s = 0; v = v0; }
        else if (te < t1) { s = v0 * te + 0.5 * a * te * te; v = v0 + a * te; }
        else if (te < t2) { s = d1 + vpk * (te - t1); v = vpk; }
        else if (te < t3) { const td = te - t2; s = d1 + dCr + vpk * td - 0.5 * b * td * td; v = vpk - b * td; }
        else { s = D; v = v1; }
        return { s: Math.min(D, s), v };
      }
    };
  }

  /* speed kept through a break. turn angle theta between legs:
     f = (1 + cos theta)/2 is 1 straight on, 0.5 at 90 deg, 0 reversing.
     Exponent (2 - cut): good route runners lose less on sharp cuts.
     WR (cut 0.8): 45 deg keeps 83%, 90 deg 44%, 135 deg 10%. */
  function carry(u0, u1, vmax, cut) {
    const c = u0.x * u1.x + u0.y * u1.y;
    return vmax * Math.pow(Math.max(0, (1 + c) / 2), 2 - cut);
  }

  const clampX = x => Math.min(FIELD.XMAX, Math.max(FIELD.XMIN, x));
  const unit = (dx, dy) => { const D = Math.hypot(dx, dy); return D > 1e-9 ? { x: dx / D, y: dy / D, D } : { x: 0, y: 1, D: 0 }; };

  /* distance from p along u until the ray leaves the playable box */
  function rayToBoundary(p, u, ymax) {
    let d = Infinity;
    if (u.x > 1e-6) d = Math.min(d, (FIELD.XMAX - p.x) / u.x);
    if (u.x < -1e-6) d = Math.min(d, (FIELD.XMIN - p.x) / u.x);
    if (u.y > 1e-6) d = Math.min(d, ((ymax || FIELD.YMAX) - p.y) / u.y);
    return Number.isFinite(d) ? Math.max(0, d) : 0;
  }

  /* ---------- build one receiver's run ----------
     start {x,y}; out = +1 if "outside" means +x, -1 if -x;
     route {pts:[[o,d],...], settle, brk}; o is lateral offset toward the
     sideline from the alignment, d is absolute depth from the LOS.
     arch: archetype numbers; relExtra: added release (inline TE, RB). */
  function buildRun(start, out, route, arch, relExtra, ymax) {
    // ymax: the deepest a receiver can go (the back of the end zone near the goal line)
    const lim = ymax || FIELD.YMAX;
    const pts = route.pts.map(([o, d]) => ({ x: clampX(start.x + out * o), y: Math.min(d, lim - 0.5) }));
    const legs = [];
    const t0 = arch.release + (relExtra || 0);
    let cur = { x: start.x, y: start.y }, v = 0, t = t0;
    const dirs = [];
    let prev = cur;
    for (const p of pts) { dirs.push(unit(p.x - prev.x, p.y - prev.y)); prev = p; }

    for (let i = 0; i < pts.length; i++) {
      const u = dirs[i], last = i === pts.length - 1;
      let vT;
      if (!last) vT = carry(u, dirs[i + 1], arch.speed, arch.cut);
      else vT = route.settle ? 0 : arch.speed;
      const pr = profile(u.D, arch.accel, arch.decel, arch.speed, v, vT);
      legs.push({ from: cur, to: pts[i], u, D: u.D, pr, tStart: t, kind: "route" });
      t += pr.dur; v = pr.vEnd; cur = pts[i];
    }
    // non-settling routes keep running in their last direction to the boundary
    if (!route.settle && legs.length) {
      const u = dirs[dirs.length - 1];
      const Dc = rayToBoundary(cur, u, lim - 0.5);
      if (Dc > 0.1 && v > 0.2) {
        const pr = profile(Dc, arch.accel, arch.decel, arch.speed, v, arch.speed);
        const end = { x: cur.x + u.x * Dc, y: cur.y + u.y * Dc };
        legs.push({ from: cur, to: end, u, D: Dc, pr, tStart: t, kind: "run" });
        t += pr.dur;
      }
    }

    function stateAt(tt) {
      if (tt < t0 || !legs.length) return { x: start.x, y: start.y, vx: 0, vy: 0, sp: 0 };
      for (const L of legs) {
        const te = tt - L.tStart;
        if (te <= L.pr.dur) {
          const r = L.pr.at(te);
          return { x: L.from.x + L.u.x * r.s, y: L.from.y + L.u.y * r.s, vx: L.u.x * r.v, vy: L.u.y * r.v, sp: r.v };
        }
      }
      const L = legs[legs.length - 1];
      return { x: L.to.x, y: L.to.y, vx: 0, vy: 0, sp: 0 };
    }

    // timing stats
    const bi = route.brk;
    const brk = (bi != null && bi >= 0 && legs[bi]) ? {
      t: legs[bi].tStart + legs[bi].pr.dur, x: legs[bi].to.x, y: legs[bi].to.y, v: legs[bi].pr.vEnd
    } : null;
    const routeLegs = legs.filter(L => L.kind === "route");
    const lastR = routeLegs[routeLegs.length - 1];
    const settleT = route.settle && lastR ? lastR.tStart + lastR.pr.dur : null;

    return { start, pts, legs, t0, tEnd: t, stateAt, brk, settleT,
      timeToDepth(dep) { // first time the receiver reaches depth dep, by sampling
        for (let tt = t0; tt <= t + 0.01; tt += 0.01) if (stateAt(tt).y >= dep) return tt;
        return null;
      } };
  }

  /* ---------- simulate a concept from a formation ---------- */
  /* opts.override: {pos: {route: id, delay: s}} for this snap only:
     a back kept in to block, a check-release delay, a jammed release */
  function simulate(concept, formations, routes, opts) {
    opts = opts || {};
    const mir = !!opts.mirror, ov = opts.override || {};
    // the formation can be any the concept allows (opts.formation), default its first
    const fid = opts.formation && (concept.forms || [concept.formation]).includes(opts.formation) ? opts.formation : concept.formation;
    const fm = formations[fid];
    const players = {};
    for (const pos of Object.keys(fm.slots)) {
      const slot = fm.slots[pos];
      const o = ov[pos] || {};
      // a slot the concept gives no route blocks: on a run, receivers stalk-block, tight ends
      // block, the fullback leads; on a pass, a spare tight end or back stays in
      const runDefault = { WR: "stalk", SLOT: "stalk", TE: "blockTE", FB: "lead", RB: "carry" };
      const rid = o.route || concept.routes[pos] || (concept.kind === "run" ? runDefault[slot.arch] : (slot.arch === "RB" ? "block" : "blockTE"));
      const route = routes[rid];
      if (!route) throw new Error("Unknown route " + rid);
      const arch = RARCH[slot.arch];
      let x = slot.x, side = slot.side;
      if (mir) { x = FIELD.W - x; side = side === "L" ? "R" : "L"; }
      const out = side === "L" ? -1 : 1;
      const run = buildRun({ x, y: slot.y }, out, route, arch, (slot.rel || 0) + (o.delay || 0), opts.ymax);
      players[pos] = { pos, slot, arch, archKey: slot.arch, route, routeId: rid, run, blocking: !!route.block };
    }
    return { concept, formation: fm, players, mirror: mir, formationId: fid };
  }

  /* ---------- QB drop: shotgun start, ease to top of drop ---------- */
  /* drop.lat: yards the QB rolls out on a boot, drop.sign: which way (+1 right).
     drop.under: under center, the QB starts at the line (y -1) instead of the gun. */
  function qbAt(drop, tt) {
    const y0 = drop.under ? -1 : -5;
    if (tt <= 0) return { x: FIELD.BALLX, y: y0 };
    const f = Math.min(1, tt / drop.t);
    const e = 1 - Math.pow(1 - f, 2);   // fast out of the gun, settle at the top
    return { x: FIELD.BALLX + (drop.lat || 0) * (drop.sign || 1) * e, y: y0 - drop.depth * e };
  }

  const api = { FIELD, RARCH, profile, carry, buildRun, simulate, qbAt };
  root.PocketEngine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
