/* Pocket play rules: levels, situations, defensive calls, protection, the
   throw model, the run after the catch, expected points and the oracle.
   Pure functions over engine/defense state, so they run in node for testing.
   Situations, defensive packages, coverage mixes, team tendencies and the
   expected-points table come from NFL data (calib.js, built from nflverse
   2023-2025); the motion and throw constants are still first passes. */
(function (root) {
  "use strict";
  const req = n => (typeof require !== "undefined" ? require(n) : null);
  const E = root.PocketEngine || req("./engine.js");
  const B = root.PocketBook || req("./playbook.js");
  const D = root.PocketDefense || req("./defense.js");
  const CAL = root.PocketCalib || req("./calib.js");
  const BX = 53.33 / 2;

  /* ---------- levels ----------
     speed: post-snap game-time rate. disguise: chance the shown shell lies.
     declare: play-clock window (s) when the defense shows its true look.
     postOnly: chance a disguise holds until after the snap. view: what survives the huddle. */
  const LEVELS = {
    1: { label: "Rookie",  speed: 0.5, disguise: 0,    declare: [8, 11], postOnly: 0,    view: "faint",   huddle: "diagram", outliers: 0, bait: false, lock: false },
    2: { label: "Backup",  speed: 0.7, disguise: 0.30, declare: [5, 8],  postOnly: 0,    view: "faint",   huddle: "diagram", outliers: 0, bait: false, lock: false },
    3: { label: "Starter", speed: 1.0, disguise: 0.45, declare: [2, 5],  postOnly: 0,    view: "letters", huddle: "diagram", outliers: 0, bait: false, lock: false },
    4: { label: "Pro",     speed: 1.0, disguise: 0.55, declare: [1, 3],  postOnly: 0.10, view: "dots",    huddle: "diagram", outliers: 2, bait: false, lock: true },
    5: { label: "All-Pro", speed: 1.0, disguise: 0.60, declare: [0.5, 2], postOnly: 0.25, view: "dots",   huddle: "names",   outliers: 2, bait: true,  lock: true }
  };

  const REL = 0.35;          // throwing motion, first tap to ball out
  const EYE_COST = 0.10;     // extra release when throwing far from your eyes
  /* the pre-snap read sets up the progression: get the coverage right and the
     ball comes out sooner; get the shell wrong and you hesitate */
  const READ_RIGHT = -0.07, READ_WRONG_SHELL = 0.08;
  const flightTime = (air, type) => {
    const f = 0.1 + air / 26 + air * air / 6000;   // fast: ~0.5 s at 10 yd, 1.4 s at 30, 2.4 s at 50
    return type === "touch" ? 1.2 * f + 0.15 : f;  // touch: arc adds time
  };
  const PLAY_CLOCK = 40, AUTO_BREAK = 15;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const wpick = w => { let r = Math.random() * Object.values(w).reduce((s, v) => s + v, 0); for (const k in w) { r -= w[k]; if (r <= 0) return k; } return Object.keys(w)[0]; };
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  function sample(a, n) { const c = a.slice(); for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c.slice(0, n); }

  /* ---------- situation ----------
     A real NFL situation (down, distance, field position) drawn from 2,500
     first- through third-down snaps, 2023-2025. */
  function situation() {
    const [down, togo, yl] = pick(CAL.sits);
    return { down, togo: Math.max(1, Math.min(togo, yl)), yl };
  }
  const spot = yl => yl > 50 ? `Own ${100 - yl}` : (yl === 50 ? "Midfield" : `Opp ${yl}`);
  const ord = d => ["", "1st", "2nd", "3rd", "4th"][d];
  const sitLabel = s => `${ord(s.down)} & ${s.yl <= s.togo ? "Goal" : s.togo} · ${spot(s.yl)}`;

  /* ---------- the defensive call ----------
     The bucket a situation falls in, for the NFL tables: early downs, third
     down short (1-3), medium (4-6) and long (7+), red zone, goal-to-go inside
     the 5, and the last two minutes of a half. */
  function sitBucket(s) {
    if (s.twoMin) return "two";
    if (s.yl <= 5) return "goal";
    if (s.yl <= 20) return "red";
    if (s.down >= 3) return s.togo <= 3 ? "3s" : (s.togo <= 6 ? "3m" : "3l");
    return "early";
  }
  /* the defense answers the offense's personnel the way NFL defenses did:
     11 personnel draws nickel 91% of the time on early downs, 12 and 21 draw
     base about 56-60%, and third and long brings dime. */
  function pkgFor(s, pers) {
    const t = CAL.pkg[pers] || CAL.pkg["11"];
    return wpick(t[sitBucket(s)] || t.early);
  }
  const ONE_HIGH = ["c3sky", "c3buzz", "c1", "fire"], TWO_HIGH = ["c2", "c4", "c6", "tampa2", "m2"];
  const mul = (w, keys, f) => { for (const k of keys) if (w[k]) w[k] *= f; };
  /* NFL 2025 coverage rates for this package and situation, tilted toward an
     opponent's own tendencies when one is chosen (its rate over the league
     rate, kept between 0.3x and 3x), then by the adaptive coordinator.
     team: an entry of CAL.teams or null. */
  function covWeights(pkg, s, coord, team) {
    const w = Object.assign({}, (CAL.cov[pkg] || CAL.cov.nickel)[sitBucket(s)]);
    if (team) for (const k in w) {
      const lg = CAL.covLeague[k] || 0.01, tm = team.mix[k] != null ? team.mix[k] : lg * 0.3;
      w[k] *= Math.max(0.3, Math.min(3, tm / lg));
    }
    if (coord) {
      // lean toward the shell that stops what the offense has been doing
      const r = coord.runRate();
      mul(w, ONE_HIGH, 0.7 + 0.8 * r); mul(w, TWO_HIGH, 1.3 - 0.6 * r);
      for (const k in w) w[k] *= coord.trust(k);
    }
    return w;
  }
  /* the scouting report: the three likeliest coverages, as shares */
  function tendencies(pkg, s, team) {
    const w = covWeights(pkg, s, null, team), tot = Object.values(w).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(w).map(([k, v]) => ({ cov: k, p: v / tot })).sort((a, b) => b.p - a.p);
  }
  /* ---------- the adaptive coordinator ----------
     Watches the offense across a drive or a game: how often it runs, and which
     coverages have been beaten. A coverage that gives up a big play is called
     less until it has been "repaired" by a few good snaps. Its run respect also
     sets how hard linebackers bite on play-action. */
  function coordinator(prior) {
    const st = Object.assign({ runs: 0, passes: 0, hurt: {} }, prior || {});
    return {
      st,
      runRate() { const n = st.runs + st.passes; return (st.runs + 2) / (n + 5); },   // starts near 0.4
      trust(cov) { return Math.max(0.35, 1 - 0.3 * (st.hurt[cov] || 0)); },
      // play-action works whatever the run rate (NFL tracking studies find little link), so
      // the coordinator only shades it: 0.75 for a pass-only offense up to 1.05
      paRespect() { return 0.75 + 0.3 * Math.min(1, this.runRate() / 0.6); },
      note(kind, cov, epa) {
        if (kind === "run") st.runs++; else if (kind !== "delay") st.passes++;
        if (epa > 1.0) st.hurt[cov] = (st.hurt[cov] || 0) + 1;
        else if (epa < -0.3 && st.hurt[cov]) st.hurt[cov] = Math.max(0, st.hurt[cov] - 0.5);
      }
    };
  }
  const DBS = ["LCB", "RCB", "FS", "SS", "N", "DB"];
  const PRESS_P = { c0: 0.9, c1: 0.6, m2: 0.7 };

  /* opts: {sit, personnel, coord, team (abbreviation of a 2025 NFL defense)}.
     With no sit, a real NFL situation. */
  function makeRep(level, opts) {
    opts = opts || {};
    const L = LEVELS[level];
    const sit = opts.sit || situation();
    const personnel = opts.personnel || "11";
    const team = opts.team && CAL.teams[opts.team] ? CAL.teams[opts.team] : null;
    const pkg = pkgFor(sit, personnel);
    const cov = wpick(covWeights(pkg, sit, opts.coord, team));
    const C = D.COV[cov];
    const press = C.man ? Math.random() < (PRESS_P[cov] || 0.5) : false;
    let truth = pick(C.shells);
    if (cov === "c1") truth = press ? "onePress" : "one";
    if (cov === "m2" && press) truth = "press";
    // Cover 1 brought a fifth rusher 45% of the time in 2025; a blitz-heavy team more
    const blitzP = Math.min(0.8, CAL.c1blitz * (team ? team.blitz / CAL.blitzLeague : 1));
    const variant = cov === "c1" && Math.random() < blitzP ? "blitz" : null;
    const disguised = Math.random() < L.disguise;
    const tDeep = D.SHELL[truth].deep;
    const shown = !disguised ? truth : pick(tDeep === 2 ? ["one", "roll"] : (tDeep === 1 ? ["two", "press"] : ["one", "two"]));
    const declareAt = disguised && Math.random() < L.postOnly ? -1 : rnd(L.declare[0], L.declare[1]);
    const flip = Math.random() < 0.5;
    const blitzSide = Math.random() < 0.5 ? "L" : "R";   // where the pressure overloads

    const mods = {}, scout = [];
    const dbs = DBS.filter(id => D.PKG[pkg].order.includes(id));
    const out = sample(dbs, L.outliers);
    for (const id of out) {
      const a = D.ARCH[D.META[id].arch];
      mods[id] = { speed: a.speed * 1.06, accel: a.accel * 1.12, react: a.react * 0.72, skill: 0.95,
        instinct: Math.min(0.9, a.instinct + 0.25), ball: 0.8 };
      scout.push({ id, name: D.META[id].name, range: "A", burst: "A", ball: "A-" });
    }
    let baiter = null;
    if (L.bait) {
      baiter = pick(dbs.filter(id => !out.includes(id)));
      mods[baiter] = Object.assign({}, mods[baiter] || {}, { bait: true });
    }
    // dice for the pocket, drawn now so a snap is reproducible from its rep
    const pressN = gauss(), freeU = Math.random(), winnerU = Math.random();
    // the field is short in the red zone: no one deeper than the end line allows
    const capY = sit.yl <= 22 ? Math.max(4, sit.yl + 6) : null;
    const zoneCap = sit.yl <= 22 ? sit.yl + 8 : null;
    return { level, L, sit, personnel, pkg, cov, variant, team: team ? opts.team : null, capY, zoneCap, endLine: sit.yl + 10,
      paRespect: opts.coord ? opts.coord.paRespect() : 0.9, press, blitzSide, shown, truth, disguised, declareAt, flip, mods, scout, baiter,
      pressN, freeU, winnerU, sackT: null };
  }

  /* ---------- protection ----------
     Five linemen block two rushers per side, and the center goes to the slide
     side (by default toward the formation's strength). A back kept in blocks
     whichever side is short; a back on a route will check-release, picking
     up an extra rusher on his own side only, then leaves 0.9 s late.
     Any side with more rushers than blockers has a free rusher: the ball has
     to be out in about 1.4 to 2.2 s. Otherwise the pocket holds for about
     2.75 s, plus 0.3 s for each extra blocker over the rush. */
  function protection(rep, def, sim, prot) {
    const rushers = def.players.filter(p => p.rush);
    const side = x => (x < BX ? "L" : "R");
    const rb = sim.players.RB;
    const rbSide = rb ? side(rb.run.start.x) : null;
    const slide = prot.slide === "L" || prot.slide === "R" ? prot.slide : "R";
    const blk = { L: 2, R: 2 }; blk[slide] += 1;
    // tight ends and fullbacks with a blocking assignment add a blocker on their side
    let extraB = 0;
    for (const pos in sim.players) {
      const pl = sim.players[pos];
      if (pos === "RB" || !pl.blocking) continue;
      blk[side(pl.run.start.x)] += 1; extraB++;
    }
    const rush = { L: 0, R: 0 };
    for (const p of rushers) rush[side(p.s0.x)]++;
    let rbJob = "route";
    const rbFakes = rb && rb.blocking;   // a play-action back carries out the fake and stays in
    if (rb && (prot.keepRB || rbFakes)) {
      // a back kept in steps to whichever side is short (his own side if neither is)
      const need = rush.L - blk.L > rush.R - blk.R ? "L" : (rush.R - blk.R > rush.L - blk.L ? "R" : rbSide);
      blk[need] += 1; rbJob = "block";
    } else if (rb && rush[rbSide] > blk[rbSide]) { blk[rbSide] += 1; rbJob = "check"; }   // check-release: his side only
    const extra = { L: rush.L - blk.L, R: rush.R - blk.R };
    const nB = 5 + extraB + (rbJob === "route" ? 0 : 1), nR = rushers.length;
    const pa = !!B.DROPS[sim.concept.drop].pa;   // the rush plays the run first on a fake
    let sackT, freeId = null, winnerId = null, freeSide = null;
    if (extra.L > 0 || extra.R > 0) {
      freeSide = extra.L >= extra.R ? "L" : "R";
      const onSide = rushers.filter(p => side(p.s0.x) === freeSide);
      const pool = onSide.filter(p => p.blitz).length ? onSide.filter(p => p.blitz) : onSide;
      const free = pool.reduce((a, b) => (Math.abs(a.s0.x - BX) < Math.abs(b.s0.x - BX) ? a : b));
      freeId = free.id;
      sackT = 1.35 + 0.3 * rep.freeU + 0.12 * Math.max(0, free.s0.y - 1.5) + (pa ? 0.2 : 0);   // a deeper start gives you more time
      sackT = Math.min(2.6, Math.max(1.35, sackT));
    } else {
      let mean = 2.75 + 0.3 * (nB - nR);
      if (sim.formationId === "ace") mean += 0.1;              // inline tight end chips on his way out
      if (pa) mean += 0.25;
      sackT = Math.min(4.4, Math.max(1.9, mean + 0.35 * rep.pressN));
      const dl = rushers.filter(p => p.dl);
      winnerId = dl[Math.min(dl.length - 1, Math.floor(rep.winnerU * dl.length))].id;
    }
    if (rep.forceSackT) sackT = rep.forceSackT;                 // test hook
    return { sackT, freeId, winnerId, freeSide, slide, keepRB: !!prot.keepRB || !!rbFakes, pa, rbJob, rbSide, rush, blk, extra, nB, nR };
  }

  /* release time from the read: right coverage = quicker trigger, wrong shell = hesitation */
  function readRel(id, cov) {
    if (!id || !id.cov) return { adj: 0, kind: "none" };
    if (id.cov === cov) return { adj: READ_RIGHT, kind: "right" };
    if (D.COV[id.cov].deep === D.COV[cov].deep) return { adj: 0, kind: "shell" };
    return { adj: READ_WRONG_SHELL, kind: "wrong" };
  }

  /* ---------- expected points ----------
     nflverse's EP model, averaged in bins of down, distance (1, 2-3, 4-6,
     7-10, 11-15, 16+) and 5-yard field position, interpolated along the field. */
  function ep(down, togo, yl) {
    const T = CAL.ep, d = Math.max(1, Math.min(4, down)) - 1;
    let tb = T.togo.findIndex(v => togo <= v); if (tb < 0) tb = T.togo.length - 1;
    const row = T.tab[d][tb], f = Math.max(0, Math.min(19, (Math.max(1, Math.min(99, yl)) - 2.5) / 5));
    const i = Math.floor(f), j = Math.min(19, i + 1), u = f - i;
    return row[i] * (1 - u) + row[j] * u;
  }
  function epAfter(s, gain, kind) {
    if (kind === "int") { const ourYl = s.yl - gain; const opp = ourYl <= 0 ? 80 : Math.min(99, 100 - ourYl); return -ep(1, 10, opp); }
    const yl2 = s.yl - gain;
    if (yl2 <= 0) return 6.95 - 0.6;   // seven points less the opponent's expected points after the kickoff
    if (yl2 >= 100) return -2.5;
    if (gain >= s.togo) return ep(1, Math.min(10, yl2), yl2);
    if (s.down >= 4) return -ep(1, 10, 100 - yl2);
    return ep(s.down + 1, s.togo - gain, yl2);
  }
  const epa = (s, gain, kind) => epAfter(s, gain, kind) - ep(s.down, s.togo, s.yl);

  /* ---------- the run after the catch ----------
     The carrier picks, every 0.05 s, the heading (within 75 degrees of
     straight upfield) that balances yards against room from the nearest
     pursuer half a second out; he turns at up to 4 rad/s, accelerates at
     5 yd/s^2 and tops out at 85% of his route speed. Defenders run
     lead-pursuit angles at full speed and tackle inside 1.5 yd (reach and
     dive). First contact can be broken (12-20%, more at speed); the next
     one tackles.
     Ends at a tackle, the sideline or the goal line.
     mode "expected": no dice, returns the break-weighted mean.
     mode "sample": records the path for the replay (the run itself has no dice). */
  const HEAD = [-75, -50, -25, 0, 25, 50, 75].map(a => a * Math.PI / 180);
  const TACKLE_R = 0.8;   // a tackle needs the defender within this many yards (tuned to NFL yards after the catch by depth)
  function racOnce(start, v0, vmax, defs, yl, breakAt, rand, record) {
    const dt = 0.05;
    let x = start.x, y = start.y, vx = v0.x, vy = v0.y;
    let sp = Math.hypot(vx, vy), hd = sp > 0.3 ? Math.atan2(vx, vy) : 0;
    const ds = defs.map(d => ({ p: d.p, x: d.x, y: d.y, vx: d.vx, vy: d.vy, out: 0 }));
    const path = record ? [{ x, y }] : null, dpaths = record ? ds.map(d => [{ x: d.x, y: d.y }]) : null;
    let contacts = 0, broken = false, end = "time", t = 0;
    for (; t < 5; t += dt) {
      // choose a heading
      let best = hd, bs = -Infinity;
      for (const a of HEAD) {
        const ux = Math.sin(a), uy = Math.cos(a);
        const px = x + ux * Math.max(sp, 4) * 0.5, py = y + uy * Math.max(sp, 4) * 0.5;
        let room = 4;
        for (const d of ds) { if (d.out > t) continue; room = Math.min(room, Math.hypot(d.x + d.vx * 0.5 - px, d.y + d.vy * 0.5 - py)); }
        let score = uy + 0.25 * room;
        if (px < 2 || px > 51.3) score -= 3;
        if (score > bs) { bs = score; best = a; }
      }
      const dh = Math.max(-4 * dt, Math.min(4 * dt, best - hd));
      hd += dh;
      sp = Math.min(vmax, sp + 5 * dt) * (Math.abs(dh) > 0.15 ? 0.95 : 1);
      vx = Math.sin(hd) * sp; vy = Math.cos(hd) * sp;
      x += vx * dt; y += vy * dt;
      // pursuers
      for (const d of ds) {
        if (d.out > t) { d.x += d.vx * dt * 0.3; d.y += d.vy * dt * 0.3; continue; }
        const dist = Math.hypot(x - d.x, y - d.y);
        const lead = Math.min(0.8, dist / d.p.a.speed);
        const gx = x + vx * lead - d.x, gy = y + vy * lead - d.y, gd = Math.hypot(gx, gy) || 1;
        const tvx = gx / gd * d.p.a.speed, tvy = gy / gd * d.p.a.speed;
        const ax = tvx - d.vx, ay = tvy - d.vy, am = Math.hypot(ax, ay), lim = 9 * dt;
        d.vx += am > lim ? ax / am * lim : ax; d.vy += am > lim ? ay / am * lim : ay;
        d.x += d.vx * dt; d.y += d.vy * dt;
      }
      if (record) { path.push({ x, y }); ds.forEach((d, i) => dpaths[i].push({ x: d.x, y: d.y })); }
      if (y >= yl) { end = "td"; break; }
      if (x < 0.8 || x > 52.5) { end = "oob"; break; }
      let hit = null;
      for (const d of ds) if (d.out <= t && Math.hypot(x - d.x, y - d.y) < TACKLE_R) { hit = d; break; }
      if (hit) {
        contacts++;
        const brk = false;                  // no dice and no free misses: contact is a tackle
        if (brk) { broken = true; hit.out = t + 0.7; sp *= 0.6; }
        else { end = "tackle"; break; }
      }
    }
    const fall = end === "tackle" ? 0.8 : 0;
    return { yac: Math.max(-2, Math.min(yl - start.y, y - start.y + fall)), end, broken, t, path, dpaths, dt };
  }
  function runAfterCatch(ctx, pos, Cp, R, contest, mode, air) {
    const P = ctx.sim.players[pos];
    const vmax = P.arch.speed * 0.85;   // a ball carrier runs slower than a route runner
    // a ball caught in stride keeps most of his speed; tracking a deep ball over
    // the shoulder or adjusting to it costs most of it
    const keep = !(air > 12) ? 0.9 : (air > 20 ? 0.75 : 0.85);
    const v0 = { x: (R.vx || 0) * keep, y: (R.vy || 0) * keep };
    const defs = [];
    for (const k of contest) {
      const p = k.p;
      const v = k.v != null ? k.v : 0;
      defs.push({ p, x: k.x, y: k.y, vx: (k.ux || 0) * v, vy: (k.uy || 0) * v });
    }
    const yl = ctx.sit.yl;
    const r = racOnce(Cp, v0, vmax, defs, yl, 1, null, mode === "sample");
    r.yac0 = r.yac1 = r.yac;
    return r;
  }

  /* ---------- the throw model ----------
     ctx: {sim, def, sit, eye}; defs: [{p, st}] defender states when the ball
     leaves; Q: QB position at release. Returns odds, catch point and EV. */
  /* how far a defender can be from the catch point and still contest it (yd,
     Gaussian), and the share of his plays on the ball that are interceptions.
     Tuned so the throws a good QB picks are defended and picked off at NFL rates
     by depth (FTN: completion given a catchable ball, interceptions per attempt). */
  const CONTEST_R = 2.0;
  const INT_SHARE = 0.55;
  /* a man defender keeps playing his man while the ball is in the air */
  function manTrack(ctx, p, tLeave) {
    if (!p.man || !ctx.sim.players[p.man]) return null;
    const run = ctx.sim.players[p.man].run, lag = p.lag || 0.25;
    return tau => { const s = run.stateAt(Math.max(0, tLeave + tau - lag)); return { x: s.x + (s.vx || 0) * lag, y: s.y + (s.vy || 0) * lag, vx: s.vx, vy: s.vy }; };
  }
  /* FTN catchable rate at a downfield depth, interpolated between bucket midpoints */
  const TH = CAL.throw.map(b => ({ m: (b.lo + Math.min(b.hi, 60)) / 2, v: b.catchable }));
  function catchableAt(d) {
    if (d <= TH[0].m) return TH[0].v;
    for (let i = 1; i < TH.length; i++) if (d <= TH[i].m) { const u = (d - TH[i - 1].m) / (TH[i].m - TH[i - 1].m); return TH[i - 1].v + u * (TH[i].v - TH[i - 1].v); }
    return TH[TH.length - 1].v;
  }
  function evalThrow(ctx, pos, type, tLeave, defs, Q) {
    const P = ctx.sim.players[pos];
    const run = P.run;
    let ta = tLeave + 0.05, R = run.stateAt(ta);
    for (; ta < tLeave + 8; ta += 0.02) {
      R = run.stateAt(ta);
      if (ta - tLeave >= flightTime(Math.hypot(R.x - Q.x, R.y - Q.y), type)) break;
    }
    const Cp = { x: R.x, y: R.y };
    const air = Math.hypot(Cp.x - Q.x, Cp.y - Q.y), flight = ta - tLeave;

    let reactAdj = 0;
    if (ctx.eye) { const de = Math.hypot(ctx.eye.x - Cp.x, ctx.eye.y - Cp.y); reactAdj = de < 6 ? -0.12 : (de > 12 ? 0.10 : 0); }

    /* No dice. The ball goes where it is thrown; whether it is caught depends
       only on where the defenders can get to while it is in the air:
       - range: past the arm (58 yd in the air on a bullet, 66 with touch) it falls short
       - the lane: a bullet travels low, so a defender who can get within 0.9 yd
         of its path as it passes gets a hand on it (an interception if he is
         set in the lane 0.25 s early, a deflection otherwise); touch goes over
       - the catch point: a defender within reach (1 yd, up to 1.6 on a long ball) when the ball arrives makes the
         play. If he was there 0.3 s early and is in front of the receiver (closer
         to the quarterback), he catches it; otherwise he breaks it up. A
         linebacker needs 0.5 s to turn a breakup into an interception.
       - within another yard: the receiver catches it but is hit on the catch (no yards after)
       - otherwise it is a clean catch and he runs. */
    // a long ball gives a defender in phase time to find it and play it: his reach grows
    // from 1 yd on a quick throw to 1.6 yd when the ball hangs 3 s
    const REACH = Math.min(1.6, 1.0 + 0.3 * Math.max(0, flight - 1)), TIGHT = REACH + 1.0, LANE = 0.9;
    const maxAir = type === "fast" ? 58 : 66;
    const contest = [];
    let lane = null, point = null;
    for (const { p, st } of defs) {
      if (p.rush) continue;
      const ra = reactAdj * p.a.instinct * 2;
      const tr = manTrack(ctx, p, tLeave);
      const at = D.pursue(p, st, Cp, flight, ra, tr);
      const k = { p, id: p.id, rem: at.rem, x: at.x, y: at.y, ux: at.ux, uy: at.uy, v: at.v, c: 0, tip: 0 };
      if (type === "fast") {
        for (let f = 0.15; f <= 0.851; f += 0.05) {
          const bx = Q.x + (Cp.x - Q.x) * f, by = Q.y + (Cp.y - Q.y) * f;
          const dp = D.pursue(p, st, Cp, flight * f, ra, tr);
          const dd = Math.hypot(dp.x - bx, dp.y - by);
          if (dd < LANE && (!lane || dd < lane.d)) {
            const pre = D.pursue(p, st, Cp, Math.max(0, flight * f - 0.25), ra, tr);
            lane = { k, d: dd, f, set: Math.hypot(pre.x - bx, pre.y - by) < LANE };
          }
        }
      }
      if (!point || at.rem < point.rem) point = k;
      contest.push(k);
    }
    let how = "catch", by = null, early = 0;
    if (air > maxAir) how = "range";
    else if (lane) { how = lane.set && lane.k.p.a.ball >= 0.3 ? "int" : "tipped"; by = lane.k; lane.k.tip = 1; }
    else if (point && point.rem <= REACH) {
      by = point;
      const pre = D.pursue(point.p, defs.find(d => d.p === point.p).st, Cp, Math.max(0, flight - 0.3), reactAdj * point.p.a.instinct * 2, manTrack(ctx, point.p, tLeave));
      const pre5 = D.pursue(point.p, defs.find(d => d.p === point.p).st, Cp, Math.max(0, flight - 0.5), reactAdj * point.p.a.instinct * 2, manTrack(ctx, point.p, tLeave));
      early = pre5.rem <= REACH ? 0.5 : (pre.rem <= REACH ? 0.3 : 0);
      const inFront = Math.hypot(point.x - Q.x, point.y - Q.y) < air - 0.3;
      const canPick = point.p.a.ball >= 0.3 ? early >= 0.3 : early >= 0.5;
      how = inFront && canPick ? "int" : "breakup";
      point.c = 1;
    } else if (point && point.rem <= TIGHT) { how = "contested"; by = point; }
    const pC = how === "catch" || how === "contested" ? 1 : 0, pInt = how === "int" ? 1 : 0, pInc = 1 - pC - pInt;

    const rac = how === "catch" ? runAfterCatch(ctx, pos, Cp, R, contest, "expected", air) : { yac: how === "contested" ? 0 : 0 };
    const yac = rac.yac;
    const gain = Math.min(ctx.sit.yl, Math.round(Cp.y + yac));
    const intSpot = Math.round(Cp.y);
    const s = ctx.sit;
    const evC = epa(s, gain, "comp"), evI = epa(s, intSpot, "int"), evN = epa(s, 0, "inc");
    const sep = point ? point.rem : 99;
    return { pos, type, C: Cp, R, ta, flight, air, pC, pInt, pInc, acc: how === "range" ? 0 : 1, pNo: pC, hands: 1, early, how, by: by ? by.id : null, sep,
      laneAt: lane ? lane.f : null, maxAir, gain, yac, intSpot, rac: how === "catch" ? rac : null,
      ev: pC * evC + pInt * evI + pInc * evN, evC, evI, evN, contest };
  }

  /* ---------- the oracle ----------
     For every 0.1 s from 0.3 s, the best throw available given defender
     states recorded on this rep. rel: the release time the QB actually had. */
  function frameAt(frames, t) {
    let lo = 0, hi = frames.length - 1;
    if (!frames.length || t < frames[0].t) return null;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (frames[m].t <= t) lo = m; else hi = m - 1; }
    return frames[lo];
  }
  const targets = sim => Object.keys(sim.players).filter(p => !sim.players[p].blocking);
  function bestAt(ctx, frames, t, players, rel) {
    rel = rel || REL;
    const fr = frameAt(frames, t + rel);
    if (!fr) return null;
    const defs = ctx.def.players.map((p, i) => ({ p, st: fr.defs[i] }));
    let best = null;
    for (const pos of players) for (const type of ["fast", "touch"]) {
      const e = evalThrow(ctx, pos, type, t + rel, defs, fr.qb);
      if (!best || e.ev > best.ev) best = e;
    }
    return best;
  }
  function oracle(ctx, frames, tEnd, rel) {
    rel = rel || REL;
    const players = targets(ctx.sim);
    const timeline = [];
    let overall = null;
    for (let t = 0.3; t + rel <= tEnd + 1e-6; t += 0.1) {
      const b = bestAt(ctx, frames, t, players, rel);
      if (!b) continue;
      timeline.push({ t, best: b });
      if (!overall || b.ev > overall.best.ev) overall = { t, best: b };
    }
    return { timeline, overall };
  }

  /* ---------- grading helpers ---------- */
  const famOf = cov => D.COV[cov].fam;
  const OPEN = ["c2", "tampa2", "c4", "c6", "m2"], CLOSED = ["c3", "c1", "c0"];
  function killGrade(call, kill) {
    if (!kill || call.id === kill.id) return { ok: false, text: "No real kill: both calls are the same play." };
    const covers = (c, set) => c.beats.some(b => set.includes(b));
    const ok = (covers(call, OPEN) && covers(kill, CLOSED)) || (covers(call, CLOSED) && covers(kill, OPEN));
    if (ok) return { ok: true, text: `${call.name} and ${kill.name} cover both shells.` };
    const both = covers(call, OPEN) && covers(kill, OPEN) ? "two-high" : "single-high";
    return { ok: false, text: `${call.name} and ${kill.name} both lean on beating ${both}; a ${both === "two-high" ? "single-high" : "two-high"} look leaves you without an answer.` };
  }
  function matchup(concept, cov) {
    const f = famOf(cov), name = D.COV[cov].short || D.COV[cov].label;
    if (concept.beats.includes(f)) return { tone: "good", text: `${concept.name} is built for ${name}.` };
    if (concept.weak.includes(f)) return { tone: "bad", text: `${concept.name} struggles against ${name}.` };
    return { tone: "neutral", text: `${concept.name} against ${name} is a neutral matchup.` };
  }

  const api = { LEVELS, REL, EYE_COST, READ_RIGHT, READ_WRONG_SHELL, flightTime, PLAY_CLOCK, AUTO_BREAK, situation, sitLabel, spot,
    makeRep, manTrack, covWeights, pkgFor, sitBucket, tendencies, coordinator, CAL, protection, readRel, ep, epa, evalThrow, runAfterCatch, oracle, bestAt, frameAt, targets, famOf, killGrade, matchup };
  root.PocketPlay = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
