/* trace the match rules on classic matchups: who each zone defender has, and how */
const path = "/home/claude/pocket/";
const RP = require(path + "rep.js"), P = require(path + "play.js"), D = require(path + "defense.js");
const cases = [["mills", "c4"], ["smash", "c2"], ["flood", "c3sky"], ["verts", "c3buzz"], ["verts", "tampa2"], ["dagger", "c3sky"], ["stick", "c4"], ["levels", "fire"]];
for (const [cid, cov] of cases) {
  for (let tries = 0; tries < 50; tries++) {
    const base = P.makeRep(1, { personnel: "11" });
    if (base.pkg !== "nickel") continue;
    Object.assign(base, { cov, truth: D.COV[cov].shells[0], shown: D.COV[cov].shells[0], disguised: false, declareAt: 30, flip: false, variant: null, press: false, mods: {}, forceSackT: 4.4 });
    const r = new RP.Rep(1, [cid], { rep: base, personnel: "11" });
    if (!r.formFor(cid)) break;
    r.pick(cid); r.breakHuddle(); for (let k = 0; k < 300; k++) r.tick(0.02); r.snap();
    const nums = () => { const N = r.def.nums; return N ? `L ${N.L.join(",")} | R ${N.R.join(",")}` : ""; };
    const line = [];
    for (const T of [1.4, 2.4]) {
      while (r.t < T) r.tick(0.02);
      const parts = r.def.players.filter(p => !p.rush && !p.man && p.rule).map(p => `${p.id}:${p.rule.role}${p.rule.pos ? "→" + p.rule.pos + "(" + p.rule.tech + ")" : ""}`);
      line.push(`  t=${T}: ${parts.join("  ")}`);
    }
    const routes = Object.values(r.sim.players).filter(q => !q.blocking).map(q => `${q.pos} ${q.routeId}`).join(", ");
    console.log(`${r.concept().name} vs ${cov}  [${routes}]  numbers ${nums()}`); line.forEach(l => console.log(l));
    break;
  }
}
