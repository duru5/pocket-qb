/* Pocket drives and games: downs, the game clock, timeouts, the spike, fourth
   down decisions, scoring, and the opponent's possessions.

   A game is a plain object so it can be saved and tested in node. Modes:
     drive     one possession from your own 25, no clock
     twomin    2:00 left in the 4th, down 3 to 7 points, 2 timeouts
     quarter   a full 4th quarter (15:00), score tied or close
     half      the 2nd half (30:00), from 0-0 or close
   Clock rules (NFL, simplified):
   - the clock stops on an incompletion, out of bounds, a score, a change of
     possession and a timeout, and at the two-minute warning
   - out of bounds only stops it in the last 2:00 of the 2nd quarter and the
     last 5:00 of the 4th; otherwise it restarts at the snap of the ball from
     the referee, which we treat as running
   - a running clock loses the play clock used before the snap (40 minus what
     was left), plus the play itself
   Kicking and the opponent's possessions use NFL 2023-2025 rates (calib.js):
   field goal odds by distance, punt net by field position, and drive results,
   plays and time of possession by where the drive starts. */
(function (root) {
  "use strict";
  const req = n => (typeof require !== "undefined" ? require(n) : null);
  const P = root.PocketPlay || req("./play.js");
  const CAL = root.PocketCalib || req("./calib.js");

  const MODES = {
    drive:   { label: "Single drive", desc: "One possession from your own 25. Score or punt." },
    twomin:  { label: "Two-minute drill", desc: "2:00 left, down by 3 to 7, two timeouts. Get points." },
    quarter: { label: "Fourth quarter", desc: "15 minutes, close game, both offenses." },
    half:    { label: "Second half", desc: "30 minutes from the third-quarter kickoff." }
  };
  const rnd = (a, b, r) => a + (r || Math.random)() * (b - a);
  const gauss = r => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const bucket = (tab, yl) => { const ks = Object.keys(tab).map(Number).sort((a, b) => a - b); let k = ks[0]; for (const x of ks) if (yl >= x) k = x; return tab[k]; };
  const KICK_START = 69;   // average start after a kickoff under the 2025 rules (touchback at the 35)

  function newGame(mode, rand) {
    rand = rand || Math.random;
    const g = { mode, us: 0, them: 0, q: 4, clock: 900, to: 3, oppTo: 3, down: 1, togo: 10, yl: 75,
      poss: "us", over: false, log: [], drives: 0, plays: 0, twoMinDone: false, stopped: true, coord: null, result: null };
    if (mode === "drive") { g.q = 0; g.clock = null; }
    if (mode === "twomin") { g.clock = 120; g.to = 2; g.twoMinDone = true; g.them = 3 + Math.floor(rand() * 5); }
    if (mode === "quarter") { const d = Math.floor(rand() * 9) - 4; g.us = 13 + Math.max(0, d); g.them = 13 + Math.max(0, -d); }
    if (mode === "half") { g.q = 3; g.clock = 900; const d = Math.floor(rand() * 7) - 3; g.us = 10 + Math.max(0, d); g.them = 10 + Math.max(0, -d); }
    g.start = { us: g.us, them: g.them };
    return g;
  }
  const timed = g => g.clock != null;
  const fmtClock = c => c == null ? "" : `${Math.floor(Math.max(0, c) / 60)}:${String(Math.floor(Math.max(0, c) % 60)).padStart(2, "0")}`;
  /* the situation handed to the next rep */
  function sitFor(g) {
    const twoMin = timed(g) && (g.q === 2 || g.q === 4) && g.clock <= 120;
    return { down: g.down, togo: Math.min(g.togo, g.yl), yl: g.yl, twoMin, q: g.q, clock: g.clock };
  }
  function log(g, text, kind) { g.log.push({ text, kind: kind || "", q: g.q, clock: g.clock, us: g.us, them: g.them }); }

  /* run the clock off; handles the two-minute warning and the end of a quarter.
     Returns true if the period ended. */
  function runClock(g, secs) {
    if (!timed(g) || secs <= 0) return false;
    const warnAt = 120;
    if ((g.q === 2 || g.q === 4) && !g.twoMinDone && g.clock > warnAt && g.clock - secs <= warnAt) {
      g.clock = warnAt; g.twoMinDone = true; g.stopped = true; log(g, "Two-minute warning", "info"); return false;
    }
    g.clock -= secs;
    if (g.clock <= 0) { g.clock = 0; return true; }
    return false;
  }
  function endPeriod(g) {
    if (g.q >= 4 || g.mode === "twomin") {
      g.over = true;
      g.result = g.us > g.them ? "win" : (g.us < g.them ? "loss" : "tie");
      log(g, `Final: ${g.us}-${g.them}`, "end");
      return;
    }
    g.q++; g.clock = 900; g.stopped = true;
    if (g.q === 4) g.twoMinDone = false;
    log(g, `End of the ${["", "1st", "2nd", "3rd"][g.q - 1]} quarter`, "info");
  }
  const outOfBoundsStops = g => timed(g) && ((g.q === 2 && g.clock <= 120) || (g.q === 4 && g.clock <= 300));

  /* after one of our snaps. res: the rep result (kind, gain, td, oob, playT,
     clockAtSnap). Returns a list of events for the UI. */
  function applyPlay(g, res, rand) {
    rand = rand || Math.random;
    const ev = [];
    g.plays++;
    // clock: the pre-snap runoff, if it was running, then the play
    if (timed(g)) {
      let ended = false;
      if (!g.stopped) ended = runClock(g, res.kind === "delay" ? 40 : Math.max(0, 40 - (res.clockAtSnap != null ? res.clockAtSnap : 40)));
      if (!ended && res.kind !== "delay") ended = runClock(g, Math.max(2, Math.round(res.playT || 0) + 2));
      g.periodOver = ended;
    }
    const k = res.kind;
    let stop = false;
    if (k === "delay") { g.yl = Math.min(99, g.yl + 5); g.togo += 5; ev.push("Delay of game, 5 yards"); log(g, "Delay of game", "bad"); g.stopped = true; return finishPlay(g, ev, true); }
    if (k === "int") {
      const at = res.e ? res.e.intSpot : 10;
      ev.push("Intercepted"); log(g, "Interception", "bad");
      g.oppStart = Math.max(1, Math.min(99, 100 - (g.yl - at)));
      return changePoss(g, ev, "to", rand);
    }
    const gain = res.gain || 0;
    if (k === "incomplete" || k === "throwaway") stop = true;
    if ((k === "complete" || k === "run") && res.oob) stop = outOfBoundsStops(g);
    g.yl -= gain;
    if (g.yl <= 0 || res.td) {
      g.us += 7; ev.push("Touchdown"); log(g, `Touchdown (${gain} yd ${k === "run" ? "run" : "pass"})`, "good");
      g.stopped = true; return changePoss(g, ev, "score", rand);
    }
    if (g.yl >= 100) {
      g.them += 2; ev.push("Safety"); log(g, "Safety", "bad"); g.stopped = true;
      g.oppStart = 60; return changePoss(g, ev, "kick", rand);
    }
    if (gain >= g.togo) { g.down = 1; g.togo = Math.min(10, g.yl); ev.push("First down"); }
    else {
      g.down++; g.togo -= gain;
      if (g.down > 4) { ev.push("Turnover on downs"); log(g, "Turnover on downs", "bad"); g.oppStart = 100 - g.yl; return changePoss(g, ev, "downs", rand); }
    }
    g.stopped = stop;
    return finishPlay(g, ev, false);
  }
  function finishPlay(g, ev, dead) {
    if (g.periodOver) { g.periodOver = false; endPeriod(g); if (g.over) ev.push("Game over"); else ev.push(`Start of Q${g.q}`); }
    if (g.mode === "drive" && g.over) ev.push("Drive over");
    return ev;
  }

  /* fourth down: "punt" or "fg" (going for it is just running the play) */
  /* NFL field goals 2023-2025, logistic fit: about 97% from 30, 84% from 40, 74% from 50 */
  function fgOdds(g) { const d = g.yl + 17; return Math.max(0.02, Math.min(0.99, 1 / (1 + Math.exp((d - CAL.fg.d0) / CAL.fg.k)))); }
  function special(g, choice, rand) {
    rand = rand || Math.random;
    const ev = [];
    runClock(g, 6);
    if (choice === "punt") {
      const pt = bucket(CAL.punt, g.yl);
      const tb = rand() < pt.tb;
      const net = Math.round(Math.max(15, pt.net + pt.sd * 0.6 * gauss(rand)));
      const spot = tb ? 0 : Math.max(1, g.yl - net);         // where it ends, in yards from their goal line
      const oppStart = spot <= 0 ? 80 : Math.min(99, 100 - spot);   // touchback at their 20
      ev.push(`Punt, ${spot <= 0 ? "touchback" : "fair catch at their " + (100 - oppStart)}`); log(g, "Punt", "info");
      g.oppStart = oppStart;
      return changePoss(g, ev, "punt", rand);
    }
    if (choice === "fg") {
      const d = g.yl + 17, ok = rand() < fgOdds(g);
      if (ok) { g.us += 3; ev.push(`${d}-yard field goal is good`); log(g, `${d}-yard field goal`, "good"); return changePoss(g, ev, "score", rand); }
      ev.push(`${d}-yard field goal is no good`); log(g, `Missed ${d}-yard field goal`, "bad");
      g.oppStart = Math.min(80, 100 - (g.yl + 7));
      return changePoss(g, ev, "miss", rand);
    }
    return ev;
  }
  function timeout(g) {
    if (!timed(g) || g.to <= 0 || g.stopped) return false;
    g.to--; g.stopped = true; log(g, "Timeout", "info"); return true;
  }
  /* spike: stops the clock, costs a down and about three seconds */
  function spike(g) {
    if (!timed(g) || g.stopped || g.down >= 4) return false;
    runClock(g, 3); g.down++; g.stopped = true; g.plays++; log(g, "Spike", "info"); return true;
  }

  /* our possession ended. In a single drive, that ends the game. Otherwise the
     opponent's drive is simulated and we get the ball back. */
  function changePoss(g, ev, why, rand) {
    g.drives++;
    if (g.mode === "drive") { g.over = true; g.result = why === "score" ? (g.us - g.start.us >= 7 ? "td" : "fg") : "none"; log(g, "Drive over", "end"); return ev; }
    if (g.periodOver) { g.periodOver = false; endPeriod(g); if (g.over) { ev.push("Game over"); return ev; } }
    if (g.mode === "twomin" && why !== "score") { g.over = true; g.result = g.us > g.them ? "win" : (g.us < g.them ? "loss" : "tie"); log(g, `Final: ${g.us}-${g.them}`, "end"); ev.push("Game over"); return ev; }
    if (g.mode === "twomin") { g.over = true; g.result = g.us > g.them ? "win" : (g.us === g.them ? "tie" : "loss"); log(g, `Final: ${g.us}-${g.them}`, "end"); ev.push("Game over"); return ev; }
    const start = why === "score" ? KICK_START : (g.oppStart != null ? g.oppStart : 75);   // a kickoff after a score
    g.oppStart = null;
    const o = oppDrive(g, start, rand);
    ev.push(o.text);
    if (g.over) return ev;
    g.down = 1; g.togo = 10; g.yl = o.ourStart; g.togo = Math.min(10, g.yl); g.stopped = true;
    return ev;
  }
  /* the opponent's possession: an outcome, the time it used and where we get
     the ball. Late in a half they hurry; a leading team late in the game runs
     the clock. */
  function oppDrive(g, start, rand) {
    const d = bucket(CAL.drives, start);
    const ks = ["td", "fg", "punt", "to", "downs", "miss", "safety"];
    let u = rand() * ks.reduce((a, k) => a + d[k], 0), out = "punt";
    for (const k of ks) { u -= d[k]; if (u <= 0) { out = k; break; } }
    const plays = Math.max(3, Math.round(d.plays * rnd(0.5, 1.5, rand)));
    const leading = g.them > g.us;
    let secs = d.secs * rnd(0.55, 1.45, rand) * (leading && g.q === 4 ? 1.2 : 1);
    let ended = false;
    if (timed(g)) {
      const left = g.clock;
      if (secs >= left) { secs = left; ended = true; }
      if ((g.q === 2 || g.q === 4) && !g.twoMinDone && left > 120 && left - secs <= 120) g.twoMinDone = true;
      g.clock = Math.max(0, left - secs);
    }
    let text, ourStart = 75;
    if (ended && (out === "td" || out === "fg") && rand() < 0.5) out = "punt";   // ran out of time short of points
    if (out === "td") { g.them += 7; text = "Opponent touchdown"; ourStart = KICK_START; }
    else if (out === "fg") { g.them += 3; text = "Opponent field goal"; ourStart = KICK_START; }
    else if (out === "punt") { text = "Opponent punt"; ourStart = Math.round(Math.max(55, Math.min(95, 72 + 9 * gauss(rand)))); }
    else if (out === "miss") { text = "Opponent missed a field goal"; ourStart = Math.round(rnd(55, 70, rand)); }
    else if (out === "safety") { g.us += 2; text = "Safety! Two points for you"; ourStart = 60; }
    else if (out === "downs") { text = "Stopped on fourth down"; ourStart = Math.round(rnd(30, 65, rand)); }
    else { text = "Takeaway! Your defense got the ball back"; ourStart = Math.round(rnd(35, 75, rand)); }
    text += ` (${plays} plays${timed(g) ? ", " + fmtClock(secs) : ""})`;
    log(g, text, out === "td" || out === "fg" ? "bad" : "good");
    if (ended) { endPeriod(g); if (!g.over) text += `. Start of Q${g.q}`; }
    return { out, text, ourStart };
  }

  /* the game clock ran out before the snap (it was running through the huddle) */
  function expire(g) {
    if (!timed(g)) return [];
    g.clock = 0; endPeriod(g); g.stopped = true;
    return [g.over ? "Time expired" : `End of the quarter. Start of Q${g.q}`];
  }
  /* how often NFL coaches went for it here (2023-2025), or null if too few cases */
  function goRate(g) {
    const tb = g.togo <= 1 ? 0 : (g.togo <= 3 ? 1 : (g.togo <= 6 ? 2 : 3)), yb = Math.min(9, Math.floor(Math.max(1, g.yl) / 10));
    const v = CAL.go4[`${tb}-${yb}`]; return v == null ? null : v;
  }
  /* when to show the hurry-up options: under 2 minutes in a half, or trailing late */
  const hurry = g => timed(g) && ((g.q === 2 || g.q === 4) && g.clock <= 150);

  const api = { MODES, newGame, sitFor, applyPlay, special, timeout, spike, fgOdds, fmtClock, hurry, timed, oppDrive, expire, goRate };
  root.PocketDrive = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
