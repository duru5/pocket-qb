/* drive.js invariants with synthetic play results (fast): 20k games per mode */
const DR = require("/home/claude/pocket/drive.js");
let checks = 0, fails = 0; const log = [];
const ok = (c, m, x) => { checks++; if (!c) { fails++; if (log.length < 20) log.push(m + " " + JSON.stringify(x)); } };
const KINDS = ["complete", "incomplete", "run", "sack", "int", "throwaway", "delay"];
const stats = {};
for (const mode of Object.keys(DR.MODES)) {
  const st = stats[mode] = { games: 0, plays: 0, us: 0, them: 0, res: {} };
  for (let gi = 0; gi < 20000; gi++) {
    const g = DR.newGame(mode); let guard = 0, prevQ = g.q, prevC = g.clock;
    while (!g.over && guard++ < 600) {
      ok(g.down >= 1 && g.down <= 4 && g.togo >= 1 && g.yl >= 1 && g.yl <= 99 && g.togo <= g.yl, "bad spot", { d: g.down, t: g.togo, yl: g.yl });
      if (DR.timed(g)) { ok(g.clock >= 0 && g.clock <= 900, "clock range", g.clock); if (g.q === prevQ) ok(g.clock <= prevC + 1e-9, "clock went up", [prevC, g.clock]); prevQ = g.q; prevC = g.clock; }
      const r = Math.random();
      if (g.down === 4 && r < 0.6) { DR.special(g, g.yl < 35 ? "fg" : "punt"); continue; }
      if (DR.timed(g) && !g.stopped && r < 0.05) { const to = g.to; DR.timeout(g); ok(g.to === Math.max(0, to - 1) || to === 0, "timeout count", { to, now: g.to }); continue; }
      if (DR.timed(g) && !g.stopped && r < 0.08) { DR.spike(g); continue; }
      const kind = KINDS[Math.floor(Math.random() * KINDS.length)];
      let gain = 0;
      if (kind === "complete") gain = Math.round(Math.random() * 25);
      if (kind === "run") gain = Math.round(-3 + Math.random() * 12);
      if (kind === "sack") gain = -7;
      gain = Math.min(gain, g.yl);
      const res = { kind, gain, td: (kind === "complete" || kind === "run") && gain >= g.yl, oob: Math.random() < 0.2, playT: 2 + Math.random() * 5,
        clockAtSnap: kind === "delay" ? null : Math.random() * 30, e: kind === "int" ? { intSpot: Math.round(Math.random() * 20) } : null };
      const before = g.us + g.them;
      DR.applyPlay(g, res);
      ok(g.us + g.them >= before, "score went down", {});
      st.plays++;
    }
    ok(g.over, "game never ended", { mode, q: g.q, clock: g.clock });
    ok(["win", "loss", "tie", "td", "fg", "none"].includes(g.result), "bad result", g.result);
    st.games++; st.us += g.us - g.start.us; st.them += g.them - g.start.them; st.res[g.result] = (st.res[g.result] || 0) + 1;
  }
}
for (const m in stats) { const s = stats[m]; console.log(`${m}: ${(s.plays / s.games).toFixed(1)} plays, us +${(s.us / s.games).toFixed(1)}, opp +${(s.them / s.games).toFixed(1)}, ${JSON.stringify(s.res)}`); }
console.log(`${checks} checks, ${fails} failures`); log.forEach(l => console.log("  FAIL " + l));
