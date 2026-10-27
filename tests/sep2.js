/* Coverage audit. For every play: separation at the catch (nearest defender when the ball
   arrives, defenders breaking on the throw) for every receiver, thrown fast at times from
   0.4 s before to 0.6 s after the top of the drop. Reports the most-open option per play
   (what a perfect reader gets) and per-receiver separation, by coverage and by route. */
const path = "/home/claude/pocket-qb/";
const B = require(path + "playbook.js"), RP = require(path + "rep.js"), P = require(path + "play.js"), D = require(path + "defense.js"), E = require(path + "engine.js");
const PASS = B.CONCEPTS.filter(c => c.kind !== "run").map(c => c.id);
const N = +(process.argv[2] || 300);
const best = [], byCov = {}, byRoute = {}, all = [];
const add = (m, k, v) => { const o = m[k] || (m[k] = { n: 0, s: 0, open: 0 }); o.n++; o.s += v; if (v >= 5) o.open++; };
for (let i = 0; i < N; i++) {
  const r = new RP.Rep(3, PASS, { personnel: Math.random() < 0.75 ? "11" : "12" });
  const av = r.available(); r.pick(av[i % av.length]); r.breakHuddle(); r.tick(8); r.rep.forceSackT = 4.4; r.snap();
  const dt = B.DROPS[r.concept().drop].t;
  const times = []; for (let t = dt - 0.4; t <= dt + 0.61; t += 0.2) times.push(t);
  let bestSep = -1, bestInfo = null, ti = 0, bestDown = -1, bestDownInfo = null;
  while (ti < times.length) {
    r.tick(0.02);
    if (r.t < times[ti] - 1e-9) continue;
    const tL = r.t, Q = E.qbAt(r.drop(), tL), defs = r.def.players.map(p => ({ p, st: D.stateAt(p, tL, r.def) }));
    for (const pos of P.targets(r.sim)) {
      const e = P.evalThrow({ sim: r.sim, def: r.def, sit: r.rep.sit, eye: null }, pos, "fast", tL, defs, Q);
      if (e.air > 55) continue;
      const sep = Math.min(15, Math.min(...e.contest.map(k => k.rem)));
      if (Math.abs(tL - dt) < 0.11) { add(byRoute, r.sim.players[pos].routeId, sep); all.push(sep); }
      if (pos !== "RB" && e.C.y >= 8 && sep > bestDown) { bestDown = sep; bestDownInfo = r.sim.players[pos].routeId + "/" + r.rep.cov; }
      if (sep > bestSep) { bestSep = sep; bestInfo = { cov: r.rep.cov, concept: r.concept().id, pos, route: r.sim.players[pos].routeId, depth: Math.round(e.C.y), t: +tL.toFixed(1) }; }
    }
    ti++;
  }
  best.push(Object.assign({ sep: bestSep, down: bestDown, downInfo: bestDownInfo }, bestInfo)); add(byCov, r.rep.cov, bestSep);
}
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const bs = best.map(b => b.sep), bd = best.map(b => b.down).filter(v => v >= 0);
console.log(`best downfield option (8+ yd, not the back): ${mean(bd).toFixed(1)} yd; >=5 on ${(100 * bd.filter(s => s >= 5).length / bd.length).toFixed(0)}%, >=7 on ${(100 * bd.filter(s => s >= 7).length / bd.length).toFixed(0)}%`);
console.log(`plays ${N}: best available separation ${mean(bs).toFixed(1)} yd; >=5 yd open on ${(100 * bs.filter(s => s >= 5).length / N).toFixed(0)}% of plays, >=8 on ${(100 * bs.filter(s => s >= 8).length / N).toFixed(0)}%`);
console.log(`all receivers at the top of the drop: ${mean(all).toFixed(1)} yd, >=5 yd ${(100 * all.filter(s => s >= 5).length / all.length).toFixed(0)}%`);
console.log("by coverage (best per play):"); for (const k in byCov) console.log(`  ${k.padEnd(7)} n ${byCov[k].n} best ${(byCov[k].s / byCov[k].n).toFixed(1)} open5 ${(100 * byCov[k].open / byCov[k].n).toFixed(0)}%`);
console.log("by route (at the top of the drop):"); for (const [k, o] of Object.entries(byRoute).sort((a, b) => b[1].s / b[1].n - a[1].s / a[1].n)) console.log(`  ${k.padEnd(9)} n ${String(o.n).padStart(4)} sep ${(o.s / o.n).toFixed(1)} open5 ${(100 * o.open / o.n).toFixed(0)}%`);
const f2 = {}; for (const b of best) if (b.down >= 6) f2[b.downInfo] = (f2[b.downInfo] || 0) + 1;
console.log("downfield wide open (>=6) by route/coverage:", JSON.stringify(Object.entries(f2).sort((a, b) => b[1] - a[1]).slice(0, 16)));
const freq = {}; for (const b of best) if (b.sep >= 6) { const k = `${b.route}`; freq[k] = (freq[k] || 0) + 1; }
console.log("routes most often wide open (>=6) as the best option:", JSON.stringify(Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10)));
