/* three quarterbacks against the tightened coverage, no dice anywhere in the throw:
   "first read" throws the progression's first receiver at the top of the drop;
   "best at the top" throws the best option at the top of the drop (a sharp QB);
   "oracle" is the best throw at any moment (perfect information). */
const path = "/home/claude/pocket/";
const B = require(path + "playbook.js"), RP = require(path + "rep.js"), P = require(path + "play.js");
const PASS = B.CONCEPTS.filter(c => c.kind !== "run").map(c => c.id);
const st = { first: { n: 0, k: {}, epa: 0 }, top: { n: 0, epa: 0, comp: 0 }, oracle: { n: 0, epa: 0 } };
for (let i = 0; i < +(process.argv[2] || 300); i++) {
  const r = new RP.Rep(3, PASS, { personnel: "11" }); const av = r.available(); const cid = av[i % av.length];
  r.pick(cid); r.breakHuddle(); r.tick(8); r.snap();
  const c = r.concept(), tgt = c.progression[0], tT = B.DROPS[c.drop].t - P.REL;
  while (!r.result) { if (!r.pending && r.t >= tT) r.tapAt(r.receiversAt(r.t)[tgt], 0); r.tick(0.02); }
  const R = r.result, f = st.first; f.n++; f.epa += R.epa; const key = r.ball ? r.ball.how : R.kind; f.k[key] = (f.k[key] || 0) + 1;
  if (R.oracle && R.oracle.overall) { st.oracle.n++; st.oracle.epa += R.oracle.overall.best.ev; }
  if (R.oracle) { const w = R.oracle.timeline.filter(x => Math.abs(x.t - tT) < 0.15); if (w.length) { const b = w[0].best; st.top.n++; st.top.epa += b.ev; st.top.comp += b.pC; st.top.cy = (st.top.cy || 0) + b.C.y; st.top.yac = (st.top.yac || 0) + b.yac; st.top.sep = (st.top.sep || 0) + Math.min(15, b.sep); (st.top.h = st.top.h || {})[b.how] = (st.top.h[b.how] || 0) + 1; } }
}
const f = st.first;
console.log(`first read at the top of the drop: ${f.n} snaps, ${(f.epa / f.n).toFixed(2)} EPA/play, outcomes ${JSON.stringify(f.k)}`);
console.log(`best throw at the top of the drop: ${(st.top.epa / st.top.n).toFixed(2)} EPA, ${(100 * st.top.comp / st.top.n).toFixed(0)}% complete; caught at ${(st.top.cy / st.top.n).toFixed(1)} yd, YAC ${(st.top.yac / st.top.n).toFixed(1)}, separation ${(st.top.sep / st.top.n).toFixed(1)}, ${JSON.stringify(st.top.h)}`);
console.log(`oracle (best moment, perfect information): ${(st.oracle.epa / st.oracle.n).toFixed(2)} EPA`);
console.log("NFL 2023-25 dropback EPA ~ +0.03 league, ~ +0.25 for the best QBs");
