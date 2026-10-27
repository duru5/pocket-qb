/* concept x coverage: value of the best throw within 0.3 s of the top of the drop (a sharp
   reader, no dice), against each coverage played straight (no disguise, nickel, 1st & 10 at midfield).
   Checks that each concept does better against the coverages it is built to beat. */
const path = "/home/claude/pocket-qb/";
const B = require(path + "playbook.js"), RP = require(path + "rep.js"), P = require(path + "play.js"), D = require(path + "defense.js");
const COVS = ["c0", "c1", "c3sky", "c3buzz", "fire", "c2", "tampa2", "m2", "c4", "c6"];
const FAM = { c3sky: "c3", c3buzz: "c3", fire: "c3" };
const N = +(process.argv[2] || 8);
const PASS = B.CONCEPTS.filter(c => c.kind !== "run");
const out = {};
for (const c of PASS) {
  out[c.id] = {};
  for (const cov of COVS) {
    let s = 0, n = 0, op = 0;
    for (let i = 0; i < N * 4 && n < N; i++) {
      const base = P.makeRep(1, { personnel: "11", sit: { down: 1, togo: 10, yl: 75 } });
      if (base.pkg !== "nickel") continue;
      Object.assign(base, { cov, truth: D.COV[cov].shells[0], shown: D.COV[cov].shells[0], disguised: false, declareAt: 30, flip: i % 2 === 1, variant: null, press: false, mods: {}, forceSackT: 4.4 });
      const r = new RP.Rep(1, [c.id], { rep: base, personnel: "11" });
      if (!r.formFor(c.id)) { const fp = B.FORMATIONS[c.formation].personnel; break; }
      r.pick(c.id); r.breakHuddle(); for (let k = 0; k < 300; k++) r.tick(0.02); r.snap();
      while (!r.result) r.tick(0.02);
      const tT = B.DROPS[c.drop].t - P.REL;
      const w = (r.result.oracle ? r.result.oracle.timeline : []).filter(x => Math.abs(x.t - tT) <= 0.3);
      if (!w.length) continue;
      const b = w.reduce((a, x) => (x.best.ev > a.best.ev ? x : a)).best;
      s += b.ev; n++; if (b.sep >= 3) op++;
    }
    out[c.id][cov] = n ? { ev: s / n, open: op / n } : null;
  }
  const fam = cov => FAM[cov] || cov;
  const avg = keys => { const v = keys.map(k => out[c.id][k]).filter(Boolean).map(o => o.ev); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN; };
  const beats = COVS.filter(k => c.beats.includes(fam(k)) || c.beats.includes(k)), weak = COVS.filter(k => c.weak.includes(fam(k)) || c.weak.includes(k));
  const row = COVS.map(k => out[c.id][k] ? out[c.id][k].ev.toFixed(1).padStart(5) : "    -").join("");
  const ok = avg(beats) > avg(weak);
  console.log(`${c.name.padEnd(14)}${row}   built-for ${avg(beats).toFixed(2)} vs struggles ${isNaN(avg(weak)) ? "  -" : avg(weak).toFixed(2)} ${weak.length ? (ok ? "ok" : "FLIPPED") : ""}`);
}
console.log("".padEnd(14) + COVS.map(k => k.padStart(5)).join(""));
