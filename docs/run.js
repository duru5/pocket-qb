/* Pocket runs: inside zone, outside zone and power, resolved by simulation.

   The box decides it. Defenders near the ball at the snap (within 9 yd of
   the ball sideways and 7.5 yd deep, plus every rusher) are matched to the
   offense's blockers: five linemen, attached tight ends, a fullback. Blocks
   are handed out from the hole outward, so extra blockers become double
   teams at the point of attack and missing blockers leave a backside
   defender unblocked, as in real zone schemes.

   A blocked defender is held for a random time (a lineman 0.7 s + exponential
   mean 1.6 s, a linebacker 0.3 + 1.0; a double team adds 1.0 s; a blitzer
   running hot 0.3 + 0.6), then
   sheds and pursues. Second-level linebackers flow toward the hole until the
   blocker reaches them (0.7 s). Defensive backs read run after their reaction
   time, later if they are in man and turn with their receiver first;
   receivers' stalk blocks slow the nearest of them.

   The back takes the handoff, presses the scheme's aiming point, then picks a
   lane each 0.05 s the same way a receiver runs after the catch. Contact with
   a free defender inside 1.3 yd is a tackle unless broken (12-20%); an
   engaged defender is moved off the lane by his block and gets one arm-tackle
   try (30%) if the back passes within 0.6 yd.
   Every constant is a first pass. */
(function (root) {
  "use strict";
  const req = n => (typeof require !== "undefined" ? require(n) : null);
  const E = root.PocketEngine || req("./engine.js");
  const D = root.PocketDefense || req("./defense.js");
  const BX = 53.33 / 2;
  const AIM = { B: 2.8, C: 5.0, edge: 9.5 };   // yards from the ball toward the play side

  const expo = (mean, rand) => -mean * Math.log(1 - Math.min(0.999, rand()));

  function runSim(ctx) {
    const rand = ctx.rand || Math.random;
    const { sim, def, dir, aim, yl } = ctx;
    const scheme = ctx.scheme;                      // "iz" | "oz" | "power"
    const under = !!sim.formation.under;
    const hx = BX + dir * AIM[aim], hole = { x: hx, y: 0.3 };
    const dt = 0.05;

    // ---------- blockers ----------
    let nBlock = 5, notes = [];
    for (const pos in sim.players) {
      const pl = sim.players[pos], a = pl.archKey, st = pl.run.start;
      if (pos === "RB") continue;
      if (a === "TE" && pl.blocking && Math.abs(st.x - BX) < 8) nBlock++;
      if (a === "FB") nBlock++;
    }
    const pull = scheme === "power";               // the backside guard pulls: same count, but at the hole

    // ---------- the box ----------
    const all = def.players.map(p => ({ p, x: p.s0.x, y: p.s0.y }));
    const box = all.filter(d => d.p.rush || (Math.abs(d.x - BX) < 9 && d.y < 7.5));
    // the box as NFL charting counts it (tighter: inside 8 yd of the ball, under 7 deep), for display and league comparisons
    const boxNFL = all.filter(d => d.p.rush || (Math.abs(d.x - BX) < 8 && d.y < 7)).length;
    const second = all.filter(d => !box.includes(d));
    box.sort((a, b) => Math.hypot(a.x - hx, a.y) - Math.hypot(b.x - hx, b.y));
    const blocked = new Map();                    // defender -> 1 single block, 2 double team
    let blockersLeft = nBlock;
    // with more defenders than blockers, the defense decides where the extra man is:
    // half the time a second-level player fills the play side (the offense blocks the
    // rest), otherwise the offense leaves the backside man and blocks from the hole out
    const extra = box.length - nBlock;
    const free = new Set();
    if (extra > 0) {
      const fillers = box.filter(d => !d.p.rush && Math.abs(d.x - hx) < 7);
      for (let k = 0; k < extra; k++) {
        if (fillers.length && rand() < 0.5) free.add(fillers.splice(Math.floor(rand() * fillers.length), 1)[0]);
      }
    }
    for (const d of box) {
      if (blockersLeft <= 0) break;
      if (free.has(d)) continue;
      blocked.set(d, 1); blockersLeft--;
    }
    // extra blockers double the defenders nearest the hole (power's puller always counts as one there)
    let doubles = blockersLeft + (pull ? 1 : 0);
    for (const d of box) { if (doubles <= 0) break; if (blocked.has(d)) { blocked.set(d, 2); doubles--; } }

    // ---------- defenders over time ----------
    const ds = all.map(d => {
      const inBox = box.includes(d), bl = blocked.get(d) || 0;
      let hold = 0;
      if (bl) {
        // linemen are covered up longer than linebackers, who are blocked on the move
        hold = (d.p.dl ? 0.8 + expo(2.2, rand) : 0.45 + expo(1.5, rand)) + (bl === 2 ? 1.0 : 0);
        if (d.p.blitz) hold = 0.3 + expo(0.6, rand);
        // a lineman sometimes wins at the snap and is in the backfield
        if (d.p.dl && rand() < (bl === 2 ? 0.01 : 0.045)) { hold = 0.1 + 0.2 * rand(); d.penetrate = true; }
        if (scheme === "oz" && Math.sign(d.x - BX) === -dir && Math.abs(d.x - BX) > 2) hold *= 0.6;   // backside cut-off blocks
      }
      const lb = inBox && !d.p.rush && d.y > 2.5;
      let react = d.p.a.react + (inBox ? 0 : 0.6);   // off the line, defenders read pass first (play-action, routes) before they fit the run
      if (!inBox && d.p.man) react += 0.45;          // turned and ran with his man first
      if (inBox && !bl && !d.p.rush) react += 0.3;   // an unblocked second-level player reads, then fits
      return { p: d.p, x: d.x, y: d.y, vx: 0, vy: 0, inBox, bl, hold, lb, react, out: 0, engagedAt: lb ? 0.7 : 0.25, pen: !!d.penetrate };
    });
    // stalk blocks: each receiver blocking downfield slows the nearest defensive back
    for (const pos in sim.players) {
      const pl = sim.players[pos];
      if (!(pl.routeId === "stalk")) continue;
      const st = pl.run.start;
      let best = null, bd = 8;
      for (const d of ds) if (!d.inBox && !d.stalked) { const dd = Math.hypot(d.x - st.x, d.y - st.y); if (dd < bd) { bd = dd; best = d; } }
      if (best) { best.stalked = true; best.react += 0.35 + expo(0.4, rand); }
    }

    // ---------- the ball carrier ----------
    const rbSlot = sim.players.RB.run.start;
    const tHand = under ? 0.75 : 0.55;
    const mesh = { x: BX + dir * (under ? 1.2 : 0.9), y: under ? -4.6 : -3.9 };
    const vmax = 9.0, acc = 6.5;
    let x = rbSlot.x, y = rbSlot.y, vx = 0, vy = 0, sp = 0, hd = 0;
    const path = [], dpaths = ds.map(() => []);
    let end = "time", contacts = 0, broken = false, t = 0, tfl = false;
    for (; t < 7; t += dt) {
      // carrier
      if (t < tHand) {
        const f = Math.min(1, (t + dt) / tHand);
        x = rbSlot.x + (mesh.x - rbSlot.x) * f; y = rbSlot.y + (mesh.y - rbSlot.y) * f;
        const ux = (mesh.x - rbSlot.x) / tHand, uy = (mesh.y - rbSlot.y) / tHand;
        vx = ux; vy = uy; sp = Math.hypot(vx, vy); hd = Math.atan2(vx, Math.max(0.1, vy));
      } else {
        const pressing = t < tHand + 0.75 && y < 0.5;
        let best = hd, bs = -Infinity;
        for (let a = -75; a <= 75; a += 15) {
          const ang = a * Math.PI / 180, ux = Math.sin(ang), uy = Math.cos(ang);
          const look = Math.max(sp, 4) * 0.45;
          const px = x + ux * look, py = y + uy * look;
          let room = 4;
          for (const d of ds) {
            if (d.out > t) continue;
            const engaged = d.bl && !d.pen && t < d.engagedAt + d.hold;
            const w = engaged ? 3 : 1;            // a blocked defender is mostly out of the way
            room = Math.min(room, Math.hypot(d.x + d.vx * 0.45 - px, d.y + d.vy * 0.45 - py) * w);
          }
          let score = uy + 0.3 * room;
          if (pressing) score -= 0.12 * Math.abs(px - hx);                 // stay on the scheme's track
          if (px < 2 || px > 51.3) score -= 3;
          if (score > bs) { bs = score; best = ang; }
        }
        const dh = Math.max(-4 * dt, Math.min(4 * dt, best - hd));
        hd += dh;
        if (t - dt < tHand) sp = Math.max(sp, 4.5);   // he takes the ball on the move
        sp = Math.min(vmax, sp + acc * dt) * (Math.abs(dh) > 0.15 ? 0.95 : 1);
        vx = Math.sin(hd) * sp; vy = Math.cos(hd) * sp;
        x += vx * dt; y += vy * dt;
      }
      // defenders
      for (const d of ds) {
        if (d.out > t) { d.x += d.vx * dt * 0.3; d.y += d.vy * dt * 0.3; continue; }
        let tx, ty, spd;
        if (d.pen && t < 1.8) {
          // he won at the snap: straight into the backfield at the mesh, then the ball carrier
          const dist = Math.hypot(x - d.x, y - d.y), lead = Math.min(0.4, dist / d.p.a.speed);
          tx = t < tHand ? mesh.x : x + vx * lead; ty = t < tHand ? mesh.y : y + vy * lead; spd = d.p.a.speed * 0.9;
        } else if (d.bl && t < d.engagedAt) {                    // reading, flowing to the hole
          tx = hx; ty = Math.max(0.5, d.y - 1); spd = d.p.a.speed * (d.lb ? 0.55 : 0.2);
        } else if (d.bl && t < d.engagedAt + d.hold) {
          // engaged: the block moves him off the running lane, away from the hole
          // (inside defenders inside, outside ones outside), up to ~2 yd, and back a little
          const away = Math.sign(d.x - hx) || -dir;
          const push = Math.min(1, (t - d.engagedAt) / 0.6);
          d.vx = away * 2.2 * (1 - push * 0.6) * (push < 1 ? 1 : 0.15); d.vy = push < 1 ? 0.8 : 0;
          d.x += d.vx * dt; d.y += d.vy * dt; continue;
        } else if (t < d.react) { d.x += d.vx * dt; d.y += d.vy * dt; continue; }
        else {                                            // free: pursue the carrier on a lead angle
          const dist = Math.hypot(x - d.x, y - d.y), lead = Math.min(0.7, dist / d.p.a.speed);
          tx = x + vx * lead; ty = y + vy * lead; spd = d.p.a.speed;
        }
        const gx = tx - d.x, gy = ty - d.y, gd = Math.hypot(gx, gy) || 1;
        const ax = gx / gd * spd - d.vx, ay = gy / gd * spd - d.vy, am = Math.hypot(ax, ay), lim = (d.p.a.accel + 2.2) * dt;
        d.vx += am > lim ? ax / am * lim : ax; d.vy += am > lim ? ay / am * lim : ay;
        d.x += d.vx * dt; d.y += d.vy * dt;
      }
      path.push({ x, y }); ds.forEach((d, i) => dpaths[i].push({ x: d.x, y: d.y }));
      if (t < tHand) continue;
      if (y >= yl) { end = "td"; break; }
      if (x < 0.8 || x > 52.5) { end = "oob"; break; }
      let hit = null, arm = false;
      for (const d of ds) {
        if (d.out > t) continue;
        const dd = Math.hypot(x - d.x, y - d.y);
        const engaged = d.bl && !d.pen && t >= d.engagedAt && t < d.engagedAt + d.hold;
        if (engaged) { if (dd < 0.6 && !d.armTried) { d.armTried = true; if (rand() < 0.3) { hit = d; arm = true; break; } } }
        else if (dd < 1.1) { hit = d; break; }
      }
      if (hit) {
        contacts++;
        // broken tackles: more at speed and in the open field, where a defensive back
        // is tackling alone; two can be broken on one run
        const openField = y > 4 ? 0.14 + (hit.p.arch === "LB" || hit.p.dl ? 0 : 0.08) : 0;   // a lone defensive back in space misses more
        const pb = arm ? 0.45 : y < 0 ? 0.1 : 0.17 + 0.1 * Math.max(0, Math.min(1, (sp - 5) / 4)) + openField;
        if (contacts <= 3 && rand() < pb) { broken = true; hit.out = t + 0.7; sp *= 0.6; }
        else { end = "tackle"; if (y < 0) tfl = true; break; }
      }
    }
    const fall = end === "tackle" && vy > 1 ? 0.8 : 0;
    const gain = Math.max(-8, Math.min(yl, Math.round(y + fall)));
    return {
      gain, end, broken, tfl, t, dt, path, dpaths, ids: ds.map(d => d.p.id), tHand,
      box: box.length, boxNFL, blockers: nBlock, unblocked: box.filter(d => !blocked.has(d)).map(d => d.p.id),
      doubles: [...blocked.values()].filter(v => v === 2).length
    };
  }

  /* the expected result of a run against this defense, for grading the call:
     the mean over n simulated tries with fixed dice */
  function expectedRun(ctx, n) {
    let s = 0, k = 0, seed = 12345;
    const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    for (let i = 0; i < (n || 12); i++) { const r = runSim(Object.assign({}, ctx, { rand })); s += r.gain; k++; }
    return s / k;
  }

  const api = { runSim, expectedRun, AIM };
  root.PocketRun = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
