/* Pocket defense: the Coverage Clock's defense, ported into the shared engine
   and extended with man coverage and pressure.

   From the Clock, unchanged: packages, shells, zone sets, the assignment
   solver, and momentum-carrying legs through the snap.
   Added:
   - pre-snap legs on play-clock time; the defense declares (rotates, shows its
     tells, walks blitzers down) when the clock says so
   - alignment to the offense's formation, and re-alignment on a kill
   - man coverage (Cover 0, Cover 1, 2-Man): an assignment solver pairs
     defenders with receivers; man defenders trail their man with a reaction
     lag, inside leverage, press at the line, and lose time to rubs
   - blitzers (Cover 0, Cover 1 blitz, fire zone) and a rush plan set by the
     protection model in play.js
   - zone-match-lite after the drop, eyes, and pursuit of the ball */
(function (root) {
  "use strict";
  const E = root.PocketEngine || (typeof require !== "undefined" ? require("./engine.js") : null);
  const FW = 53.33, BX = FW / 2;

  const ARCH = {
    CB: { speed: 9.6, accel: 7.6, react: 0.30, skill: 0.80, instinct: 0.30, ball: 0.50 },
    S:  { speed: 9.2, accel: 7.0, react: 0.32, skill: 0.78, instinct: 0.55, ball: 0.50 },
    N:  { speed: 9.4, accel: 7.6, react: 0.28, skill: 0.76, instinct: 0.40, ball: 0.35 },
    LB: { speed: 8.9, accel: 6.4, react: 0.38, skill: 0.66, instinct: 0.45, ball: 0.25 },
    DL: { speed: 8.0, accel: 4.6, react: 0.22, skill: 0.30, instinct: 0.10, ball: 0.10 }
  };
  const META = {
    LCB: { name: "Left corner", arch: "CB" }, RCB: { name: "Right corner", arch: "CB" },
    FS: { name: "Free safety", arch: "S" }, SS: { name: "Strong safety", arch: "S" },
    N: { name: "Nickel", arch: "N" }, DB: { name: "Dime back", arch: "N" },
    WLB: { name: "Will", arch: "LB" }, MLB: { name: "Mike", arch: "LB" }, SLB: { name: "Sam", arch: "LB" },
    DEW: { name: "Weak end", arch: "DL" }, NT: { name: "Nose", arch: "DL" },
    DT: { name: "3-technique", arch: "DL" }, DES: { name: "Strong end", arch: "DL" }
  };
  const DL = new Set(["DEW", "NT", "DT", "DES"]);
  const RUSHERS = DL;   // kept for older callers: the four down linemen

  const PKG = {
    base: { label: "Base", count: "4 DL · 3 LB · 4 DB",
      order: ["LCB", "WLB", "FS", "MLB", "SLB", "SS", "RCB", "DEW", "NT", "DT", "DES"],
      spot: { LCB: [8.5, 7.5], WLB: [21.8, 4.6], FS: [22.0, 11.0], MLB: [26.7, 5.0], SLB: [31.2, 4.6],
        SS: [31.5, 11.0], RCB: [45.0, 7.5], DEW: [21.8, 0.8], NT: [25.0, 0.8], DT: [28.6, 0.8], DES: [32.2, 0.8] } },
    nickel: { label: "Nickel", count: "4 DL · 2 LB · 5 DB",
      order: ["LCB", "N", "FS", "WLB", "SLB", "SS", "RCB", "DEW", "NT", "DT", "DES"],
      spot: { LCB: [8.5, 7.5], N: [36.0, 4.6], FS: [22.0, 11.0], WLB: [22.6, 4.5], SLB: [29.0, 4.5],
        SS: [31.5, 11.0], RCB: [45.0, 7.5], DEW: [22.4, 0.8], NT: [25.0, 0.8], DT: [28.6, 0.8], DES: [31.8, 0.8] } },
    dime: { label: "Dime", count: "4 DL · 1 LB · 6 DB",
      order: ["LCB", "N", "FS", "MLB", "DB", "SS", "RCB", "DEW", "NT", "DT", "DES"],
      spot: { LCB: [8.0, 8.0], N: [36.0, 5.2], FS: [22.0, 12.0], MLB: [26.4, 5.2], DB: [17.5, 5.4],
        SS: [31.5, 12.0], RCB: [45.5, 8.0], DEW: [22.4, 0.8], NT: [25.0, 0.8], DT: [28.6, 0.8], DES: [31.8, 0.8] } }
  };
  /* shells. deep = how many safeties sit deep: 2 (two-high), 1 (single-high), 0 (zero) */
  const SHELL = {
    two:      { label: "Two-high", deep: 2, ov: { FS: [21.0, 12.8], SS: [32.5, 12.8], LCB: [8.5, 7.0], RCB: [45.0, 7.0] } },
    press:    { label: "Two-high, press corners", deep: 2, ov: { FS: [20.0, 13.8], SS: [33.0, 13.8], LCB: [9.5, 1.3], RCB: [44.0, 1.3] } },
    one:      { label: "Single-high", deep: 1, ov: { FS: [26.7, 14.2], SS: [33.8, 7.2], LCB: [8.0, 6.5], RCB: [45.5, 6.5] } },
    onePress: { label: "Single-high, press corners", deep: 1, ov: { FS: [26.7, 14.5], SS: [33.8, 7.5], LCB: [9.5, 1.3], RCB: [44.0, 1.3] } },
    roll:     { label: "Rolled strong", deep: 1, ov: { FS: [29.5, 13.2], SS: [38.5, 8.0], LCB: [8.0, 9.0], RCB: [45.0, 5.5] } },
    zero:     { label: "Zero (both safeties down)", deep: 0, ov: { FS: [23.5, 7.5], SS: [31.0, 7.5], LCB: [9.5, 1.3], RCB: [44.0, 1.3] } }
  };
  const DEEP_NAME = { 2: "Two deep", 1: "One deep", 0: "None deep" };
  const Z = (key, name, x, y) => ({ key, name, x, y, tier: y >= 14.5 ? "deep" : (y >= 8 ? "mid" : "flat") });
  const THIRDS = [Z("third-l", "Deep third L", 9.0, 19.5), Z("third-m", "Deep middle", 26.7, 20.5), Z("third-r", "Deep third R", 44.3, 19.5)];

  /* coverages. man coverages carry role tables per package:
     man = defenders matched to receivers, deep/rat = zone players, rush = blitzers.
     Zone coverages may name blitzers too (fire zone); everyone else is solved into zones. */
  const COV = {
    c3buzz: { label: "Cover 3 Buzz", fam: "c3", deep: 1, shells: ["one", "roll"], pin: { SS: "hook-s" }, zones: [
      ...THIRDS, Z("cf-w", "Curl/flat weak", 15.0, 7.0), Z("hook-w", "Hook weak", 23.0, 11.0), Z("hook-s", "Hook strong", 31.5, 10.5),
      Z("cf-s", "Curl/flat strong", 38.5, 6.0)] },
    c3sky: { label: "Cover 3 Sky", fam: "c3", deep: 1, shells: ["one", "roll"], pin: { SS: "cf-s" }, zones: [
      ...THIRDS, Z("cf-w", "Curl/flat weak", 15.0, 7.0), Z("hook-w", "Hook weak", 22.5, 11.0), Z("hook-s", "Hook strong", 31.0, 11.0),
      Z("cf-s", "Flat strong", 39.5, 5.5)] },
    fire: { label: "Fire zone (3 deep, 3 under)", short: "Fire zone", fam: "c3", deep: 1, shells: ["one", "roll"],
      roles: { base: { rush: ["WLB"] }, nickel: { rush: ["WLB"] }, dime: { rush: ["MLB"] } },
      zones: [...THIRDS, Z("sc-w", "Seam/curl weak", 17.0, 8.0), Z("hook", "Hook", 26.7, 9.5), Z("sc-s", "Seam/curl strong", 36.5, 8.0)] },
    c1: { label: "Cover 1 (man-free)", short: "Cover 1", fam: "c1", deep: 1, man: true, shells: ["one", "onePress"],
      roles: {
        base:   { deep: ["FS"], rat: ["MLB"], man: ["LCB", "RCB", "SS", "WLB", "SLB"] },
        nickel: { deep: ["FS"], rat: ["WLB"], man: ["LCB", "RCB", "N", "SS", "SLB"] },
        dime:   { deep: ["FS"], rat: ["MLB"], man: ["LCB", "RCB", "N", "DB", "SS"] } },
      zones: [Z("deep-m", "Deep middle", 26.7, 19.0), Z("hole", "Hole (rat)", 26.7, 9.0)] },
    c0: { label: "Cover 0 (all-out man, 6 rush)", short: "Cover 0", fam: "c0", deep: 0, man: true, shells: ["zero"],
      roles: {
        base:   { rush: ["MLB", "WLB"], man: ["LCB", "RCB", "SS", "FS", "SLB"] },
        nickel: { rush: ["WLB", "SLB"], man: ["LCB", "RCB", "N", "SS", "FS"] },
        dime:   { rush: ["MLB", "SS"], man: ["LCB", "RCB", "N", "DB", "FS"] } },
      zones: [] },
    m2: { label: "2-Man (man under, two deep)", short: "2-Man", fam: "m2", deep: 2, man: true, shells: ["two", "press"],
      roles: {
        base:   { deep: ["FS", "SS"], man: ["LCB", "RCB", "WLB", "MLB", "SLB"] },
        nickel: { deep: ["FS", "SS"], man: ["LCB", "RCB", "N", "WLB", "SLB"] },
        dime:   { deep: ["FS", "SS"], man: ["LCB", "RCB", "N", "DB", "MLB"] } },
      zones: [Z("half-l", "Deep half L", 14.5, 18.5), Z("half-r", "Deep half R", 39.0, 18.5)] },
    c2: { label: "Cover 2", fam: "c2", deep: 2, shells: ["two", "press"], zones: [
      Z("half-l", "Deep half L", 14.5, 18.5), Z("half-r", "Deep half R", 39.0, 18.5),
      Z("flat-l", "Flat L", 7.5, 5.0), Z("flat-r", "Flat R", 46.0, 5.0),
      Z("hook-w", "Hook weak", 19.0, 10.5), Z("hook-m", "Hook middle", 26.7, 11.0), Z("hook-s", "Hook strong", 33.5, 10.5)] },
    /* the Mike runs the pipe: the middle linebacker if there is one, else the
       inside linebacker left in the package (pinAny takes the first one present) */
    tampa2: { label: "Tampa 2", fam: "tampa2", deep: 2, shells: ["two"], pinAny: [["pipe", ["MLB", "WLB", "SLB"]]], zones: [
      Z("half-l", "Deep half L", 12.5, 19.5), Z("half-r", "Deep half R", 41.0, 19.5),
      Z("flat-l", "Flat L", 7.5, 5.0), Z("flat-r", "Flat R", 46.0, 5.0),
      Z("hook-w", "Hook weak", 18.0, 10.5), Z("pipe", "Deep hole (pipe)", 26.7, 20.0), Z("hook-s", "Hook strong", 33.5, 10.5)] },
    c4: { label: "Cover 4", fam: "c4", deep: 2, shells: ["two", "press"], zones: [
      Z("qtr-l", "Quarter L", 9.0, 16.5), Z("qtr-il", "Quarter inside L", 20.0, 16.5),
      Z("qtr-ir", "Quarter inside R", 33.5, 16.5), Z("qtr-r", "Quarter R", 44.3, 16.5),
      Z("flat-w", "Flat weak", 16.5, 6.5), Z("hook-w", "Hook weak", 24.0, 9.5), Z("hook-s", "Hook strong", 32.0, 9.5)] },
    c6: { label: "Cover 6", fam: "c6", deep: 2, shells: ["two"], zones: [
      Z("flat-w", "Flat weak", 8.0, 5.0), Z("half-w", "Deep half weak", 15.5, 18.5),
      Z("hook-w", "Hook weak", 23.0, 10.5), Z("hook-m", "Hook middle", 29.0, 10.5),
      Z("qtr-i", "Quarter inside", 34.0, 16.5), Z("qtr-o", "Quarter outside", 44.3, 16.5), Z("flat-s", "Flat strong", 41.0, 5.5)] }
  };
  const PEN = {
    CB: { deep: 0, mid: 4.0, flat: 1.5 }, S: { deep: 0, mid: 1.5, flat: 5.0 },
    N: { deep: 11, mid: 1.0, flat: 0 }, LB: { deep: 19, mid: 0, flat: 2.5 }
  };
  /* man matchups: yards-equivalent cost of a defender type on a receiver type */
  const MAN_PEN = {
    CB: { WR: 0, SLOT: 2, TE: 8, RB: 12 }, N: { WR: 3, SLOT: 0, TE: 4, RB: 6 },
    S: { WR: 5, SLOT: 3, TE: 0, RB: 2 }, LB: { WR: 15, SLOT: 10, TE: 3, RB: 0 }
  };
  const ROT = 0.72; // pre-snap movement at 72% of top speed

  function leg(from, to, a, vmax, v0) {
    const dx = to.x - from.x, dy = to.y - from.y, D = Math.hypot(dx, dy);
    return { from, D, ux: D > 1e-6 ? dx / D : 0, uy: D > 1e-6 ? dy / D : 0, dy, pr: E.profile(D, a, a, vmax, v0 || 0, 0) };
  }
  function legState(L, te) {
    const r = L.pr.at(te);
    const v = te <= 0 ? (L.pr.at(0).v) : r.v;
    return { x: L.from.x + L.ux * r.s, y: L.from.y + L.uy * r.s, vx: L.ux * v, vy: L.uy * v, sp: v };
  }

  /* ---------- roles for a coverage in a package ---------- */
  function rolesFor(cov, pkg, variant) {
    const C = COV[cov], R = (C.roles && C.roles[pkg]) || {};
    const out = { rush: (R.rush || []).slice(), man: (R.man || []).slice(), deep: (R.deep || []).slice(), rat: (R.rat || []).slice() };
    if (cov === "c1" && variant === "blitz") { out.rush.push(...out.rat); out.rat = []; }   // Cover 1 blitz: the rat rushes
    return out;
  }

  /* ---------- pre-snap tells (strong side = right before mirroring) ---------- */
  const TELL = {
    c2:     { LCB: { y: 5 }, RCB: { y: 5 }, FS: { dx: -2, y: 13 }, SS: { dx: 2, y: 13 } },
    tampa2: { LCB: { y: 5.5 }, RCB: { y: 5.5 }, FS: { dx: -2.5, y: 14 }, SS: { dx: 2.5, y: 14 }, MLB: { y: 6.5 } },
    c4:     { LCB: { y: 8 }, RCB: { y: 8 }, FS: { dx: 1.5, y: 11 }, SS: { dx: -1.5, y: 11 } },
    c6:     { LCB: { y: 5 }, RCB: { y: 8 }, FS: { dx: -1.5, y: 13.5 }, SS: { dx: -1, y: 11 } },
    c3sky:  {}, c3buzz: { SS: { dx: -3, y: 8.5 } }, fire: {},
    c1: {}, c0: {}, m2: { FS: { dx: -1, y: 14 }, SS: { dx: 1, y: 14 } }
  };

  /* ---------- man assignment: defenders to receivers, min distance + type cost ---------- */
  function solveMan(defs, spots, recvAll) {
    if (!defs.length || !recvAll || !recvAll.length) return {};
    const R = recvAll.slice(0, Math.max(defs.length, recvAll.length));
    // distance + matchup cost, and a heavy cost for crossing the field: defenses do not
    // send the strong-side nickel to the weak side, they pick the man on their side
    const side = x => (x < BX - 4 ? -1 : (x > BX + 4 ? 1 : 0));
    const cost = (id, r) => Math.hypot(spots[id].x - r.x, spots[id].y - r.y) + MAN_PEN[META[id].arch === "S" ? "S" : META[id].arch][r.arch || "WR"]
      + (side(spots[id].x) * side(r.x) < 0 ? 40 : 0);
    let best = null, bestC = Infinity;
    const cur = [], used = new Array(R.length).fill(false);
    (function rec(i, acc) {
      if (acc >= bestC) return;
      if (i === defs.length) { bestC = acc; best = cur.slice(); return; }
      for (let j = 0; j < R.length; j++) {
        if (used[j]) continue;
        used[j] = true; cur[i] = j;
        rec(i + 1, acc + cost(defs[i], R[j]));
        used[j] = false;
      }
    })(0, 0);
    const out = {};
    if (best) defs.forEach((id, i) => { out[id] = R[best[i]].pos; });
    return out;
  }

  /* ---------- align to the offense ----------
     Zone: corners on #1 with a yard of inside leverage, nickel on #2 to the
     strength, dime on the other #2, linebackers bump toward a trips side.
     Man: each man defender lines up on his man (press corners at 1.3 yd).
     Blitzers in the true alignment walk down to the line over a gap. */
  function alignTo(spots, recv, mirror, opts) {
    opts = opts || {};
    if (recv && recv.length) {
      const L = recv.filter(r => r.x < BX).sort((a, b) => a.x - b.x);
      const R = recv.filter(r => r.x > BX).sort((a, b) => b.x - a.x);
      const strongR = R.length > L.length ? true : (L.length > R.length ? false : !mirror);
      const S = strongR ? R : L, inS = strongR ? -1 : 1;
      if (spots.LCB && L[0]) spots.LCB.x = L[0].x + 1.0;
      if (spots.RCB && R[0]) spots.RCB.x = R[0].x - 1.0;
      // slot defenders keep their side: the nickel on the side he came out on
      // (the strength at the huddle break), the dime back on the other. Each takes
      // the #2 on his side, or plays an apex over the tackle box if there is none.
      const nSide = opts.nSide || (strongR ? "R" : "L");
      const slot = (id, sd) => {
        if (!spots[id]) return;
        const side = sd === "R" ? R : L, inn = sd === "R" ? -1 : 1;
        spots[id].x = side[1] ? side[1].x + inn * 0.8 : BX - inn * 7;
      };
      slot("N", nSide); slot("DB", nSide === "R" ? "L" : "R");
      if (S.length >= 3) for (const id of ["WLB", "MLB", "SLB"]) if (spots[id]) spots[id].x += -inS * 1.5;
    }
    if (opts.man && opts.recvAll) {
      for (const id in opts.man) {
        const r = opts.recvAll.find(q => q.pos === opts.man[id]);
        if (!r || !spots[id]) continue;
        const inside = r.x < BX ? 1 : -1;
        if (r.arch === "RB") { spots[id].x = r.x + inside * 1.5; spots[id].y = 4.5; continue; }
        spots[id].x = r.x + inside * 0.8;
        if (META[id].arch === "CB") spots[id].y = opts.press ? 1.3 : 6.0;
        else spots[id].y = opts.press ? 1.8 : 3.8;
      }
    }
    // blitzers walk down into a gap. A blitzer near the ball may slide a few steps to
    // stack the called overload side; one who would have to cross the field rushes
    // from his own side instead (defenders do not swap sides to blitz)
    if (opts.blitz) {
      const used = { L: 0, R: 0 };
      opts.blitz.forEach(id => {
        if (!spots[id]) return;
        const own = spots[id].x < BX ? "L" : "R";
        let sd = opts.blitzSide === "L" || opts.blitzSide === "R" ? opts.blitzSide : own;
        const tx = k => BX + (k === "L" ? -1 : 1) * (2.4 + 1.7 * used[k]);
        if (Math.abs(tx(sd) - spots[id].x) > 6) sd = own;
        spots[id].x = tx(sd); spots[id].y = 1.8; used[sd]++;
      });
    }
  }

  /* ---------- alignment for one rep ----------
     The true alignment is solved first: shell + tells, fitted to the formation,
     man matchups (same side of the field), blitzers walked down. The shown look
     is that same alignment with only the things a real disguise changes: the
     safeties' spots, the corners' depth, and blitzers and press defenders backed
     off to normal depth. Nobody changes sides or jobs to disguise.
     Corners keep their side of the field when the formation is flipped: the
     left corner takes the right corner's spec, mirrored, and vice versa. */
  const SAFE = new Set(["FS", "SS"]);
  function spec(ov, pk, id, mirror) {
    const key = mirror && id === "LCB" ? "RCB" : (mirror && id === "RCB" ? "LCB" : id);
    const v = ov[key] || pk.spot[key];
    return { x: mirror ? FW - v[0] : v[0], y: v[1], key };
  }
  function alignAll(cfg, roles, C, recv, recvAll) {
    const pk = PKG[cfg.pkg], tell = TELL[cfg.cov] || {};
    const shO = SHELL[cfg.shown].ov, trO = SHELL[cfg.truth].ov;
    const base = {}, truth = {}, shown = {}, pkg = {};
    for (const id of pk.order) {
      const t = spec(trO, pk, id, cfg.mirror), tl = tell[t.key] || {};
      base[id] = { x: t.x + (cfg.mirror ? -1 : 1) * (tl.dx || 0), y: tl.y != null ? tl.y : t.y };
    }
    if (!cfg.nSide) cfg.nSide = cfg.mirror ? "L" : "R";              // set once, at the huddle break
    if (recv && recv.length && !cfg.nSideSet) {
      const l = recv.filter(r => r.x < BX).length, r = recv.length - l;
      cfg.nSide = r > l ? "R" : (l > r ? "L" : cfg.nSide); cfg.nSideSet = true;
    }
    alignTo(base, recv, cfg.mirror, { nSide: cfg.nSide });         // zone-style fit to the formation
    const man = C.man ? solveMan(roles.man, base, recvAll) : {};
    for (const id of pk.order) truth[id] = Object.assign({}, base[id]);
    alignTo(truth, null, cfg.mirror, { man, recvAll, press: cfg.press, blitz: roles.rush, blitzSide: cfg.blitzSide });
    for (const id of pk.order) {
      const sv = spec(shO, pk, id, cfg.mirror), pv = spec({}, pk, id, cfg.mirror);
      const t = truth[id], b = base[id];
      if (DL.has(id)) shown[id] = Object.assign({}, t);
      else if (SAFE.has(id) && !man[id] && !roles.rush.includes(id)) shown[id] = { x: sv.x, y: sv.y };   // the disguise lives here
      else if (META[id].arch === "CB") shown[id] = { x: t.x, y: sv.y };                                 // corners: depth only
      else if (roles.rush.includes(id)) shown[id] = { x: b.x, y: Math.max(pv.y, 4) };                  // blitzer at normal depth
      else if (man[id]) shown[id] = { x: t.x, y: Math.max(t.y, Math.min(pv.y, 5)) };                    // man: over his man, off the line
      else shown[id] = { x: t.x, y: pv.y };                                                             // linebackers, nickel: tells hidden
      pkg[id] = { x: shown[id].x, y: shown[id].y + (DL.has(id) ? 0 : 2.5) };                           // break the huddle a few yards deep
    }
    // near the goal line the field is short: nobody aligns deeper than the cap
    if (cfg.capY) for (const m of [truth, shown, pkg]) for (const id in m) m[id].y = Math.min(m[id].y, cfg.capY);
    return { truth, shown, pkg, man };
  }

  /* ---------- build a defense for one rep ----------
     cfg: {pkg, cov, shown, truth, mirror, mods, variant ("blitz" for Cover 1 blitz),
           press (man corners press), blitzSide ("L"/"R": the side blitzers overload),
           recv: [{x,y}] receivers, recvAll: [{pos,x,y,arch}] incl. RB} */
  function build(cfg) {
    const pk = PKG[cfg.pkg];
    const C = COV[cfg.cov];
    const roles = rolesFor(cfg.cov, cfg.pkg, cfg.variant);
    const al = alignAll(cfg, roles, C, cfg.recv, cfg.recvAll);
    const man = al.man;
    const players = [];
    for (const id of pk.order) {
      const a = Object.assign({}, ARCH[META[id].arch], (cfg.mods && cfg.mods[id]) || {});
      const p = {
        id, arch: META[id].arch, a,
        dl: DL.has(id), blitz: roles.rush.includes(id), rush: DL.has(id) || roles.rush.includes(id),
        man: man[id] || null,
        pkg: al.pkg[id],
        shown: al.shown[id], truth: al.truth[id],
        off: { x: 0, y: 0 }, ov: { x: 0, y: 0 }
      };
      p.legs = [{ t0: 0.4, L: leg(p.pkg, p.shown, p.a.accel * 0.9, p.a.speed * ROT, 0) }];
      players.push(p);
    }
    return { cfg, players, cov: C, roles, declared: null, zones: null, rushPlan: null };
  }

  function preState(D, p, tau) {
    let k = 0;
    for (let i = 0; i < p.legs.length; i++) if (p.legs[i].t0 <= tau) k = i;
    const g = p.legs[k];
    return legState(g.L, Math.max(0, tau - g.t0));
  }
  function moveTo(p, from, to, tau) {
    if (Math.hypot(to.x - from.x, to.y - from.y) > 0.3)
      p.legs.push({ t0: tau, L: leg({ x: from.x, y: from.y }, to, p.a.accel * 0.9, p.a.speed * ROT, 0) });
  }
  function declare(D, tau) {
    if (D.declared != null) return;
    D.declared = tau;
    for (const p of D.players) moveTo(p, preState(D, p, tau), p.truth, tau);
  }
  /* the offense changed formation at the line: re-solve man matchups and re-align */
  function realign(D, recv, recvAll, tau) {
    const al = alignAll(D.cfg, D.roles, D.cov, recv, recvAll);
    D.cfg.recv = recv; D.cfg.recvAll = recvAll;
    for (const p of D.players) {
      const from = preState(D, p, tau);
      p.shown = al.shown[p.id]; p.truth = al.truth[p.id]; p.man = al.man[p.id] || null;
      moveTo(p, from, D.declared != null ? p.truth : p.shown, tau);
    }
  }

  /* ---------- the snap ----------
     Zone players are solved into the coverage's zones from where they stand.
     Man defenders keep their man. Rushers get their plan from setRush(). */
  function snap(D, tau) {
    D.snapTau = tau;
    const st = {};
    for (const p of D.players) st[p.id] = preState(D, p, tau);
    // red zone: deep landmarks come up to the back of the end zone
    const zc = D.cfg.zoneCap || Infinity;
    const zones = D.cov.zones.map(z => Object.assign({}, z, { x: D.cfg.mirror ? FW - z.x : z.x, y: Math.min(z.y, z.tier === "deep" ? zc : zc - 3) }));
    const zoneP = D.players.filter(p => !p.rush && !p.man);
    const fixed = {};
    for (const id in (D.cov.pin || {})) {
      if (!zoneP.find(p => p.id === id)) continue;
      const zi = zones.findIndex(z => z.key === D.cov.pin[id]);
      if (zi >= 0) fixed[id] = zi;
    }
    for (const [zk, ids] of (D.cov.pinAny || [])) {
      const zi = zones.findIndex(z => z.key === zk);
      const id = ids.find(i => zoneP.find(p => p.id === i) && !(i in fixed));
      if (zi >= 0 && id && !Object.values(fixed).includes(zi)) fixed[id] = zi;
    }
    const takenZ = new Set(Object.values(fixed));
    const freeP = zoneP.filter(p => !(p.id in fixed));
    const freeZ = zones.map((_, i) => i).filter(i => !takenZ.has(i));
    const cost = (p, zi) => Math.hypot(zones[zi].x - st[p.id].x, zones[zi].y - st[p.id].y) + PEN[p.arch][zones[zi].tier];
    let best = null, bestC = Infinity;
    const cur = [], used = new Array(freeZ.length).fill(false);
    (function rec(i, acc) {
      if (acc >= bestC) return;
      if (i === freeP.length) { bestC = acc; best = cur.slice(); return; }
      for (let j = 0; j < freeZ.length; j++) {
        if (used[j]) continue;
        used[j] = true; cur[i] = freeZ[j];
        rec(i + 1, acc + cost(freeP[i], freeZ[j]));
        used[j] = false;
      }
    })(0, 0);
    const put = (p, zi) => { p.zone = zones[zi]; p.land = { x: zones[zi].x, y: zones[zi].y }; };
    for (const id in fixed) put(D.players.find(p => p.id === id), fixed[id]);
    if (best) freeP.forEach((p, i) => put(p, best[i]));
    // anyone left without a zone (more players than zones) sits in a short hook over the ball
    for (const p of zoneP) if (!p.zone) { p.zone = Z("hook-x", "Hook", st[p.id].x, 9); p.land = { x: st[p.id].x, y: 9 }; }
    for (const p of D.players) {
      if (p.rush) { p.zone = { key: "rush", name: p.blitz ? "Blitz" : "Rush", tier: "rush" }; p.land = { x: st[p.id].x, y: -4 }; }
      if (p.man) { p.zone = { key: "man", name: "Man on " + p.man, tier: "man" }; p.land = { x: st[p.id].x, y: st[p.id].y }; }
    }
    for (const p of D.players) {
      const s0 = st[p.id];
      p.s0 = s0;
      const dx = p.land.x - s0.x, dy = p.land.y - s0.y, Dd = Math.hypot(dx, dy);
      const ux = Dd > 1e-6 ? dx / Dd : 0, uy = Dd > 1e-6 ? dy / Dd : 0;
      const along = s0.vx * ux + s0.vy * uy, perp = Math.abs(-s0.vx * uy + s0.vy * ux);
      const redirect = (along < 0 ? -along / p.a.accel : 0) + perp / (p.a.accel * 1.5);
      const bail = dy > 5 && s0.y < 10;
      const vmax = p.a.speed * (bail ? 0.8 : 1);
      p.P = leg({ x: s0.x, y: s0.y }, p.land, p.a.accel, vmax, Math.min(Math.max(0, along), vmax));
      p.delay = p.a.react + redirect;
      p.arrive = p.delay + p.P.pr.dur;
      p.off = { x: 0, y: 0 }; p.ov = { x: 0, y: 0 };
      // man state: integrated each step
      p.mp = { x: s0.x, y: s0.y }; p.mv = { x: s0.vx, y: s0.vy };
      p.lag = 0.20 + 0.30 * (1 - p.a.skill);
      p.rubbed = false; p.rubUntil = -1; p.cush0 = null;
    }
    D.zones = zones;
  }
  /* play-action: zone linebackers step up and hold before dropping, safeties
     hesitate; man linebackers lose a step to their man. s = how much the
     defense respects the run (0.3 to 1.2), set by the coordinator's read of
     the offense's run rate. Returns who bit, for the result screen. */
  function paBite(D, s) {
    const bit = [];
    for (const p of D.players) {
      if (p.rush || !p.s0) continue;
      let d = 0;
      if (p.arch === "LB") d = p.man ? 0 : 0.6 * s;
      else if (p.arch === "S" && !p.man) d = (p.zone && p.zone.tier === "deep" ? 0.12 : 0.30) * s;
      else if (p.arch === "N" && !p.man) d = 0.18 * s;
      if (p.man && (p.arch === "LB" || p.arch === "S")) { p.lag += 0.12 * s; p.mp.y -= 0.6 * s; bit.push(p.id); continue; }
      if (d > 0.05) {
        // the bite: a step or two downhill toward the fake, then the drop starts from there
        const dy = p.arch === "LB" ? 1.4 * s : 0.6 * s;
        const from = { x: p.s0.x, y: p.s0.y - dy };
        p.bite = { dy, t: 0.45 };
        p.P = leg(from, p.land, p.a.accel, p.a.speed, 0);
        p.delay += d; p.arrive = p.delay + p.P.pr.dur; bit.push(p.id);
      }
    }
    D.pa = { s, bit };
    return bit;
  }
  /* which receivers are pressed at the snap (a man defender within 2 yd of them) */
  function pressed(D, recvAll) {
    const out = [];
    for (const p of D.players) if (p.man && p.s0) {
      const r = recvAll.find(q => q.pos === p.man);
      if (r && r.arch !== "RB" && Math.hypot(r.x - p.s0.x, r.y - p.s0.y) < 2.2) out.push(r.pos);
    }
    return out;
  }

  /* ---------- the rush ----------
     plan: {sackT, qbT:{x,y}, freeId, winnerId}. A free rusher runs straight at
     where the QB will be at sackT. Blocked rushers engage a yard into the
     backfield and the pocket squeezes; the winner gets home at sackT. */
  function setRush(D, plan) { D.rushPlan = plan; }
  function rushState(D, p, t) {
    const pl = D.rushPlan, s0 = p.s0;
    if (!pl) return { x: s0.x, y: s0.y, vx: 0, vy: 0, sp: 0 };
    const q = pl.qbT;
    const tc = Math.max(0, t);
    let x, y;
    if (p.id === pl.freeId || p.id === pl.winnerId) {
      let f = Math.min(1, tc / pl.sackT);
      if (p.id === pl.winnerId) {
        const eng = { x: s0.x + (q.x - s0.x) * 0.25, y: Math.max(-1.6, s0.y - 2.2) };
        const tw = Math.max(0.5, pl.sackT - 0.7);
        if (tc < 0.5) { const g = tc / 0.5; x = s0.x + (eng.x - s0.x) * g; y = s0.y + (eng.y - s0.y) * g; }
        else if (tc < tw) { x = eng.x; y = eng.y; }
        else { const g = Math.min(1, (tc - tw) / (pl.sackT - tw)); x = eng.x + (q.x - eng.x) * g; y = eng.y + (q.y - eng.y) * g; }
      } else { f = Math.pow(f, 1.1); x = s0.x + (q.x - s0.x) * f; y = s0.y + (q.y - s0.y) * f; }
    } else {
      const eng = { x: s0.x + (q.x - s0.x) * 0.2, y: Math.max(-1.6, s0.y - 2.2) };
      const g = Math.min(1, tc / 0.5), squeeze = Math.min(1, tc / pl.sackT) * 0.3;
      x = s0.x + (eng.x - s0.x) * g + (q.x - eng.x) * squeeze;
      y = s0.y + (eng.y - s0.y) * g + (q.y - eng.y) * squeeze;
    }
    return { x, y, vx: 0, vy: 0, sp: 0 };
  }

  function baseAt(p, t) {
    if (t < p.delay && p.bite) { const f = Math.min(1, t / p.bite.t); return { x: p.s0.x, y: p.s0.y - p.bite.dy * f, vx: 0, vy: f < 1 ? -p.bite.dy / p.bite.t : 0, sp: f < 1 ? p.bite.dy / p.bite.t : 0 }; }
    if (t < p.delay) return { x: p.s0.x, y: p.s0.y, vx: 0, vy: 0, sp: 0 };
    return legState(p.P, t - p.delay);
  }

  /* ---------- one step of post-snap reactions ----------
     recv: [{pos,x,y,vx,vy}] receivers now; recvAt(pos, t) gives a receiver at
     any time (for the man defender's reaction lag); eye: {x,y} or null */
  const R_ZONE = { deep: 10, mid: 7, flat: 6.5 };
  const segDist = (q, a, b) => {   // distance from point q to segment a-b
    const vx = b.x - a.x, vy = b.y - a.y, L = vx * vx + vy * vy;
    const u = L > 1e-9 ? Math.max(0, Math.min(1, ((q.x - a.x) * vx + (q.y - a.y) * vy) / L)) : 0;
    return Math.hypot(a.x + u * vx - q.x, a.y + u * vy - q.y);
  };
  const clampV = (x, y, m) => { const d = Math.hypot(x, y); return d > m ? { x: x * m / d, y: y * m / d } : { x, y }; };
  /* ---------- match rules ----------
     Zone coverage as NFL teams teach it: every zone defender has a rule keyed
     to the receivers on his side, numbered from the outside in (#1, #2, #3; a
     back who releases becomes the next number on the side he goes to). The rule
     says whom he takes and how: over the top, walling him underneath, or taking
     the flat. Some rules turn into man coverage once a route declares itself
     (a commitment), the way Quarters and Cover 3 Match are played.
       Cover 3 Match (Sky, Buzz): corners take #1 if he goes vertical (MOD),
         otherwise sit in the third and look for #2 vertical outside. Curl/flat:
         #2 to the flat, take him; #2 vertical, wall him to 12-13 yd and hand him
         off, then sink under #1's curl. Hook: carry #3 vertical, otherwise rob
         crossers. Middle third: the deepest inside vertical, else drive on posts
         and digs in front of him.
       Fire zone: the three underneath are seam/curl players: carry #2 vertical,
         then the curl; the middle hook takes #3.
       Quarters (Cover 4): corners MOD on #1 (man if he goes vertical or past
         7 yd, otherwise zone). Safeties read #2: #2 vertical, man him; #2 out or
         under, help over the top of #1 (bracket); nobody threatening, rob the
         dig/curl in front. Apex: wall #2, take him to the flat.
       Cover 2: corners cloud: #2 to the flat, take him; #1 vertical, sink under
         him to 12 yd (squat-sink); otherwise wall #1. Halves: the deepest
         vertical on their side. Tampa 2 adds the Mike running the pipe on any
         inside vertical.
       Cover 6: Cover 2 rules to the weak side, Quarters rules to the strong side.
       Cover 1 and 2-Man: deep players by their deep rules; the hole player robs crossers. */
  const ROLE_KEYS = {
    "third-l": "c3corner", "third-r": "c3corner", "third-m": "mof", "deep-m": "mof",
    "cf-w": "curlflat", "cf-s": "curlflat", "sc-w": "seamcurl", "sc-s": "seamcurl",
    "hook-w": "hook", "hook-s": "hook", "hook-m": "hook", "hook": "hook", "hook-x": "hook", "hole": "rat",
    "qtr-l": "qcorner", "qtr-r": "qcorner", "qtr-o": "qcorner", "qtr-il": "qsafety", "qtr-ir": "qsafety", "qtr-i": "qsafety",
    "flat-w": "apex", "flat-s": "apex", "half-l": "half", "half-r": "half", "half-w": "half",
    "flat-l": "c2corner", "flat-r": "c2corner", "pipe": "pipe"
  };
  function roleOf(D, p) {
    const k = p.zone && p.zone.key;
    if (D.cfg.cov === "c6" && k === "flat-w") return "c2corner";   // Cover 6: the weak side is Cover 2
    if (D.cfg.cov === "c4" && k === "flat-w") return "apex";
    return ROLE_KEYS[k] || (p.zone && p.zone.tier === "deep" ? "half" : "hook");
  }
  const isVert = r => (r.vy || 0) > 4 && Math.abs(r.vx || 0) < 0.8 * (r.vy || 0);
  /* receivers by side, numbered from the outside in; the back joins when he releases */
  function numbers(D, recv) {
    if (!D.nums) {
      D.nums = { L: [], R: [] };
      for (const r of recv) if (r.pos !== "RB") D.nums[r.x < BX ? "L" : "R"].push({ pos: r.pos, d: Math.abs(r.x - BX) });
      for (const k of ["L", "R"]) D.nums[k] = D.nums[k].sort((a, b) => b.d - a.d).map(o => o.pos);
    }
    const by = Object.fromEntries(recv.map(r => [r.pos, r]));
    const out = { L: D.nums.L.map(p => by[p]).filter(Boolean), R: D.nums.R.map(p => by[p]).filter(Boolean) };
    const rb = by.RB;
    if (rb && rb.y > 0) out[rb.x < BX ? "L" : "R"].push(rb);
    return out;
  }
  const outward = (r, side) => side === "L" ? (r.vx || 0) < -2 : (r.vx || 0) > 2;
  /* one defender's rule: {r, tech} or null (no assignment: play the zone) */
  function rule(D, p, role, N, t, cur) {
    const side = p.land.x < BX ? "L" : "R", S = N[side];
    const n1 = S[0] || null, n2 = S[1] || null, n3 = S[2] || null;
    const mm = p.mm && N.L.concat(N.R).find(r => r.pos === p.mm.pos);
    if (mm && p.mm.until(mm)) return { r: mm, tech: p.mm.tech };
    p.mm = null;
    const commit = (r, tech, until) => { p.mm = { pos: r.pos, tech, until }; return { r, tech }; };
    p.done = p.done || {};
    switch (role) {
      case "c3corner":
        if (n1 && isVert(n1) && n1.y > 5) return commit(n1, "top1", r => r.y > 6);
        if (n2 && isVert(n2) && Math.abs(n2.x - BX) > 6 && n2.y > 8) return { r: n2, tech: "top" };
        return null;
      case "qcorner":
        // MOD from outside leverage: he funnels #1 inside, toward the safety's help
        if (n1 && (isVert(n1) || n1.y > 7)) return commit(n1, "top1o", r => r.y > 5);
        if (n2 && isVert(n2) && Math.abs(n2.x - BX) > 8 && n2.y > 8) return { r: n2, tech: "top" };
        return null;
      case "qsafety":
        // read #2 for three steps: vertical past 6 yd, he is yours (man); out or under, help over #1
        if (n2 && isVert(n2) && n2.y > 6) return commit(n2, "top1", r => r.y > 4);
        if (n2 && isVert(n2)) return null;                                     // still reading
        if (n1 && n1.y > 5 && (!n2 || n2.y > 0.5)) return { r: n1, tech: "top" };
        return null;
      case "mof": case "pipe": {
        let best = null;
        for (const r of N.L.concat(N.R)) if (isVert(r) && Math.abs(r.x - BX) < (role === "pipe" ? 9 : 12) && r.y > 8 && (!best || r.y > best.y)) best = r;
        return best ? { r: best, tech: "top" } : null;
      }
      case "half":
        // Cover 2 safety: read #2 to #1. #2 vertical (the seam), he takes #2; otherwise he
        // gets over the top of #1, inside-out, and follows a post across the middle
        if (n2 && isVert(n2) && n2.y > 6) return { r: n2, tech: "top" };
        if (n1 && n1.y > 8) return { r: n1, tech: "top" };
        return null;
      case "curlflat": case "apex": case "seamcurl": {
        const r2 = n2 || n1;
        if (r2 && !p.done[r2.pos]) {
          if (role !== "seamcurl" && r2.y < 6 && outward(r2, side)) return { r: r2, tech: "flat" };
          if (isVert(r2) && r2.y < 13) return { r: r2, tech: "wall" };
          if (isVert(r2)) p.done[r2.pos] = true;                              // handed off: sink to the curl
        }
        if (n1 && n1 !== r2 && n1.y < 15 && !isVert(n1)) return { r: n1, tech: "wall" };
        return null;
      }
      case "c2corner":
        if (n2 && n2.y < 6 && outward(n2, side)) return { r: n2, tech: "flat" };
        if (n1 && isVert(n1)) return { r: n1, tech: "sink" };
        if (n1 && n1.y < 14) return { r: n1, tech: "wall" };
        return null;
      case "hook":
        if (n3 && isVert(n3) && n3.y < 13 && !p.done[n3.pos]) return { r: n3, tech: "wall" };
        if (n3 && isVert(n3)) p.done[n3.pos] = true;
        return null;
      default: return null;
    }
  }
  /* where a technique puts him: inside and over the top, inside and underneath, in the flat */
  function techTarget(r, tech, D) {
    const inside = r.x < BX ? 0.6 : -0.6, end = (D.cfg.endLine || 99) - 0.5;
    const px = r.x + (r.vx || 0) * 0.3, py = r.y + (r.vy || 0) * 0.3;
    if (tech === "top") return { x: px + inside, y: Math.min(end, py + 1.5 + 0.25 * Math.max(0, r.vy || 0)), deep: true };
    // man over the top: against a vertical route he keeps a cushion that shrinks only as fast
    // as the receiver can eat it; once the route breaks he closes to a step over the top
    const over = isVert(r) ? 1.2 + 0.22 * Math.max(0, r.vy || 0) : 0.9;
    if (tech === "top1") return { x: px + inside * 0.8, y: Math.min(end, py + over), deep: true };
    if (tech === "top1o") return { x: px - inside * 0.9, y: Math.min(end, py + over), deep: true };       // from outside leverage
    if (tech === "sink") return { x: px + inside * 0.5, y: Math.min(12, r.y - 1.5), deep: false };       // under #1, no deeper than 12
    if (tech === "flat") return { x: px, y: py - 0.3, deep: false };
    return { x: px + inside * 1.3, y: py - (r.y > 6 ? 1.0 : -0.3), deep: false };                        // wall
  }

  const AREA = { flat: 9.5, mid: 9.5 };
  function stepOffsets(D, t, dt, recv, eye, recvAt) {
    const claimed = {};
    const N = numbers(D, recv);
    const zoneP = D.players.filter(p => !p.rush && !p.man && p.zone);
    // 1) the rules
    const plan = new Map();
    for (const p of zoneP) {
      const b0 = baseAt(p, t), cur = { x: b0.x + p.off.x, y: b0.y + p.off.y };
      const a = t > p.a.react ? rule(D, p, roleOf(D, p), N, t, cur) : null;
      if (a) { claimed[a.r.pos] = p.id; }
      plan.set(p, { b0, cur, a });
    }
    for (const p of D.players) if (p.man) stepMan(D, p, t, dt, recv, recvAt);
    // 2) targets: a rule's technique, or the zone fallback (underneath: the nearest
    //    unclaimed receiver in his area; deep: stay on top of verticals, drive on breaks)
    const order = zoneP.filter(p => p.zone.tier !== "deep").concat(zoneP.filter(p => p.zone.tier === "deep"));
    for (const p of order) {
      const { b0, cur, a } = plan.get(p);
      const tier = p.zone.tier;
      let tx = 0, ty = 0, best = null, deepTech = tier === "deep";
      if (a) {
        const T = techTarget(a.r, a.tech, D);
        deepTech = T.deep;
        // a halves safety stays between the hash and the numbers: he can carry #1 deep but
        // cannot be pulled to the sideline and leave the middle (the corner sinks under #1)
        const role = roleOf(D, p);
        if (role === "half" || role === "qsafety" && a.tech === "top") {
          // no wider than the numbers; inside he can go as far as the route takes him
          const sgn = p.land.x < BX ? -1 : 1, wide = BX + sgn * 15;
          T.x = sgn < 0 ? Math.max(wide, T.x) : Math.min(wide, T.x);
        }
        const c = clampV(T.x - b0.x, T.y - b0.y, T.deep ? 45 : 16);
        const ramp = Math.min(1, (t - p.a.react) / 0.3) * (p.a.bait ? 0.45 : 1);
        tx = c.x * ramp; ty = Math.max(T.deep ? 0 : -20, c.y) * ramp;
        p.mt = a.r.pos;
      } else if (tier === "deep") {
        let bd = Infinity, brk = null, bb = Infinity;
        for (const r of recv) {
          const dx = Math.abs(r.x - p.land.x);
          if (dx < 11 && r.y > p.land.y - 16 && (r.vy || 0) > 4.5) { const sc = -r.y + 0.4 * dx; if (sc < bd) { bd = sc; best = r; } }
          const dc = Math.hypot(r.x - cur.x, r.y - cur.y);
          if (dc < 12 && r.y > cur.y - 12 && r.y > 7 && (Math.abs(r.vx || 0) > 3 || (r.vy || 0) < 2) && !claimed[r.pos]) { if (dc < bb) { bb = dc; brk = r; } }
        }
        if (best) {
          const cushion = 2.5 + 0.45 * Math.max(0, best.vy || 0);
          tx = Math.max(-8, Math.min(8, best.x - b0.x));
          ty = Math.max(0, Math.min(45, best.y + cushion - b0.y, (D.cfg.endLine || 99) - 0.5 - b0.y));
        } else if (brk && t > p.a.react + 0.2) {
          tx = brk.x + (brk.vx || 0) * 0.3 - b0.x;
          ty = Math.min(brk.y + (brk.vy || 0) * 0.3 + 1.2, (D.cfg.endLine || 99) - 0.5) - b0.y;
          claimed[brk.pos] = p.id;
        }
      } else {
        const A = (roleOf(D, p) === "rat" ? 12 : AREA[tier]) || 9.5;
        let bs = -Infinity;
        for (const r of recv) {
          if (r.y < -1.5) continue;
          const dl = Math.hypot(r.x - p.land.x, r.y - p.land.y), dc = Math.hypot(r.x - cur.x, r.y - cur.y);
          const keep = p.mt === r.pos && dc < A + 4;
          if (dl > A && !keep) continue;
          const sc = -dl + (keep ? 4 : 0) - (claimed[r.pos] ? 8 : 0);
          if (sc > bs) { bs = sc; best = r; }
        }
        if (best && t > p.a.react) {
          p.mt = best.pos; claimed[best.pos] = p.id;
          const T = techTarget(best, "wall", D);
          const c = clampV(T.x - b0.x, T.y - b0.y, 14);
          const ramp = Math.max(0, Math.min(1, (t - p.a.react) / 0.4)) * (p.a.bait ? 0.45 : 1);
          tx = c.x * ramp; ty = c.y * ramp;
        } else p.mt = null;
      }
      p.rule = a ? { pos: a.r.pos, tech: a.tech, role: roleOf(D, p) } : { role: roleOf(D, p), pos: p.mt || null, tech: "zone" };
      if (eye) {
        const c = clampV(eye.x - cur.x, eye.y - cur.y, 6);
        const k = p.a.instinct * (p.arch === "CB" ? 0.2 : 0.4) * (a && (a.tech === "top1") ? 0.3 : 1);
        tx += c.x * k; ty += c.y * k;
      }
      const vmax = Math.max(1, p.a.speed * (deepTech ? 1 : 0.95) - Math.hypot(b0.vx, b0.vy));
      const dv = clampV((tx - p.off.x) * 3, (ty - p.off.y) * 3, vmax);
      const ax = clampV(dv.x - p.ov.x, dv.y - p.ov.y, p.a.accel * (deepTech ? 1.3 : 1.15) * dt);
      p.ov.x += ax.x; p.ov.y += ax.y;
      p.off.x += p.ov.x * dt; p.off.y += p.ov.y * dt;
    }
  }
  /* man technique: the defender sees the receiver one reaction lag late and
     projects that view forward, so straight running is matched and a hard
     break opens a window of about speed x lag. Inside leverage, an off-man
     cushion that the receiver eats down to a trail, and velocity feed-forward.
     A rub (another receiver crossing his path) costs about 0.35 s once. */
  function stepMan(D, p, t, dt, recv, recvAt) {
    const me = recv.find(r => r.pos === p.man);
    if (!me) return;
    const lagT = recvAt ? recvAt(p.man, Math.max(0, t - p.lag)) : me;
    if (!lagT) return;
    // a rub: another receiver crosses between the defender and his man while both
    // receivers are running across the field (Mesh, Slant-Flat), not on a vertical stem
    if (!p.rubbed && t > 0.3 && Math.abs(me.vx || 0) > 3 && Math.hypot(me.x - p.mp.x, me.y - p.mp.y) > 0.8) {
      for (const r of recv) {
        if (r.pos === p.man || Math.abs(r.vx || 0) < 4) continue;
        if (Math.sign(r.vx) === Math.sign(me.vx)) continue;                 // crossing, not running alongside
        if (segDist(r, p.mp, me) < 1.8 && Math.hypot(r.x - p.mp.x, r.y - p.mp.y) < 2.5) { p.rubbed = true; p.rubUntil = t + 0.35; break; }
      }
    }
    const inside = lagT.x < BX ? 0.9 : -0.9;
    const isRB = me.arch === "RB";
    // off-man: keep the alignment cushion and give ground, letting the receiver
    // eat it at ~2.5 yd/s down to a 0.8 yd trail; press starts in the trail
    if (p.cush0 == null) p.cush0 = Math.max(0.8, p.mp.y - me.y);
    const cushion = Math.max(0.8, p.cush0 - 2.5 * Math.max(0, t - 0.3));
    const trail = isRB ? 0 : (lagT.vy >= -0.5 ? cushion : 0.5);   // hold the cushion until he breaks back to the ball
    // project the lagged view forward: running straight, he is matched exactly;
    // only a change of direction (a break) opens a window
    const px = lagT.x + (lagT.vx || 0) * p.lag, py = lagT.y + (lagT.vy || 0) * p.lag;
    const gx = px + (isRB ? 0 : inside);
    let gy = Math.min(py + trail, (D.cfg.endLine || 99) - 0.4);
    if (isRB) gy = Math.max(gy, 1.5);   // on a back, wait at the line instead of chasing him into the backfield
    const vcap = p.a.speed * (t < p.rubUntil ? 0.35 : 1) * (t < p.a.react * 0.5 ? 0.5 : 1);
    const dv = clampV((gx - p.mp.x) * 3 + (lagT.vx || 0), (gy - p.mp.y) * 3 + (lagT.vy || 0), vcap);
    // turn-and-run acceleration matches a receiver's (the zone-drop figure is a pedal)
    const ax = clampV(dv.x - p.mv.x, dv.y - p.mv.y, p.a.accel * 1.4 * dt);
    p.mv.x += ax.x; p.mv.y += ax.y;
    p.mp.x += p.mv.x * dt; p.mp.y += p.mv.y * dt;
  }
  function stateAt(p, t, D) {
    if (p.rush && D) return rushState(D, p, t);
    if (p.man && p.mp) { const sp = Math.hypot(p.mv.x, p.mv.y); return { x: p.mp.x, y: p.mp.y, vx: p.mv.x, vy: p.mv.y, sp }; }
    const b = baseAt(p, t);
    const x = b.x + p.off.x, y = b.y + p.off.y, vx = b.vx + p.ov.x, vy = b.vy + p.ov.y;
    return { x, y, vx, vy, sp: Math.hypot(vx, vy) };
  }

  /* ---------- pursuit of the catch point after the throw ----------
     Integrated in 0.04 s steps: during his reaction the defender keeps running
     the way he was going (zone defenders facing the quarterback start breaking
     on his motion, 0.25 s early); then he steers at the catch point with a
     turning acceleration of 1.3 x his normal one, up to top speed, and pulls up
     when he gets there. A defender already running at the spot loses nothing
     to the reaction; one running the other way has to stop and turn. */
  const ANTICIPATE = 0.25;
  /* track(t): for a man defender, where his technique has him going t seconds after
     the release (his man, seen one reaction lag late and projected). He keeps
     playing his man while the ball is in the air instead of running at the spot. */
  function pursue(p, st, C, dt, reactAdj, track) {
    if (track) {
      const h = 0.04, vmax = p.a.speed, amax = p.a.accel * 1.4 * h;
      let x = st.x, y = st.y, vx = st.vx || 0, vy = st.vy || 0;
      for (let t = 0; t < dt - 1e-9; t += h) {
        // in phase with his man near the end of the flight, he turns and plays the ball
        let g = track(t);
        if (dt - t <= 0.5 && Math.hypot(C.x - x, C.y - y) < 3.5) g = { x: C.x, y: C.y, vx: 0, vy: 0 };
        const step = Math.min(h, dt - t);
        const d0 = clampV((g.x - x) * 3 + (g.vx || 0), (g.y - y) * 3 + (g.vy || 0), vmax);
        const d = clampV(d0.x - vx, d0.y - vy, amax * step / h);
        vx += d.x; vy += d.y; x += vx * step; y += vy * step;
      }
      const v = Math.hypot(vx, vy);
      return { x, y, rem: Math.hypot(C.x - x, C.y - y), ux: v > 1e-6 ? vx / v : 0, uy: v > 1e-6 ? vy / v : 0, v };
    }
    const ant = p.man ? 0 : ANTICIPATE;
    const react = Math.max(0.05, p.a.react * (p.a.bait ? 0.5 : 1) + (reactAdj || 0) - ant);
    const h = 0.04, vmax = p.a.speed, amax = p.a.accel * 1.3 * h;
    let x = st.x, y = st.y, vx = st.vx || 0, vy = st.vy || 0;
    const sp0 = Math.hypot(vx, vy); if (sp0 > vmax) { vx *= vmax / sp0; vy *= vmax / sp0; }
    for (let t = 0; t < dt - 1e-9; t += h) {
      const step = Math.min(h, dt - t);
      if (t >= react) {
        const gx = C.x - x, gy = C.y - y, g = Math.hypot(gx, gy);
        const want = Math.min(vmax, g / Math.max(step, 0.08));     // ease in at the spot
        const tvx = g > 1e-6 ? gx / g * want : 0, tvy = g > 1e-6 ? gy / g * want : 0;
        const d = clampV(tvx - vx, tvy - vy, amax * step / h);
        vx += d.x; vy += d.y;
      }
      x += vx * step; y += vy * step;
    }
    const v = Math.hypot(vx, vy);
    return { x, y, rem: Math.hypot(C.x - x, C.y - y), ux: v > 1e-6 ? vx / v : 0, uy: v > 1e-6 ? vy / v : 0, v };
  }

  /* ---------- Clock influence kernel, for the replay heat map ---------- */
  function kernel(p, st, ball) {
    const dBall = Math.hypot(st.x - ball.x, st.y - ball.y);
    const R = 3.4 + 5.2 * Math.min(1, Math.pow(dBall / 22, 2));
    const s = Math.min(1, st.sp / p.a.speed), s2 = s * s;
    const sa = (R + R * s2) / 2, sp = Math.max(1.1, (R - R * s2) / 2);
    let ux = 0, uy = 1;
    if (st.sp > 0.05) { ux = st.vx / st.sp; uy = st.vy / st.sp; }
    return { cx: st.x + st.vx * 0.5, cy: st.y + st.vy * 0.5, ux, uy, ia: 1 / (sa * sa), ip: 1 / (sp * sp), amp: 0.44 + 0.5 * p.a.skill };
  }
  function coverage(ks, x, y) {
    let miss = 1;
    for (const k of ks) {
      const dx = x - k.cx, dy = y - k.cy, al = dx * k.ux + dy * k.uy, pe = -dx * k.uy + dy * k.ux;
      const md = al * al * k.ia + pe * pe * k.ip;
      if (md < 12) miss *= 1 - k.amp * Math.exp(-0.5 * md);
    }
    return 1 - miss;
  }

  const api = { FW, ARCH, META, PKG, SHELL, COV, DEEP_NAME, DL, RUSHERS, TELL, rolesFor, build, preState, declare, realign, snap, paBite,
    pressed, setRush, rushState, baseAt, stepOffsets, roleOf, stateAt, pursue, kernel, coverage };
  root.PocketDefense = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
