/* the same snap played the same way gives the same result, every time */
const path = "/home/claude/pocket/";
const B = require(path + "playbook.js"), RP = require(path + "rep.js"), P = require(path + "play.js");
const PASS = B.CONCEPTS.filter(c => c.kind !== "run").map(c => c.id);
let n = 0, same = 0, bad = [];
for (let i = 0; i < 300; i++) {
  const base = P.makeRep(3, { personnel: "11" });
  const cid = PASS[i % PASS.length], tTap = 1 + Math.random() * 2, touch = Math.random() < 0.5;
  const out = [];
  for (let k = 0; k < 3; k++) {
    const r = new RP.Rep(3, PASS, { rep: JSON.parse(JSON.stringify(Object.assign({}, base, { L: undefined }))) });
    r.rep.L = base.L;
    if (!r.formFor(cid)) break;
    r.pick(cid); r.breakHuddle(); for (let j = 0; j < 400; j++) r.tick(0.02); r.snap();
    const pos = P.targets(r.sim)[i % P.targets(r.sim).length];
    let tapped = false;
    while (!r.result) { if (!tapped && r.t >= tTap) { tapped = true; r.tapAt(r.receiversAt(r.t)[pos], 0); if (touch) r.tapAt({ x: 0, y: 0 }, 100); } r.tick(0.02); }
    out.push(`${r.result.kind}/${r.result.gain}/${r.ball ? r.ball.how : "-"}`);
  }
  if (out.length < 3) continue;
  n++; if (out[0] === out[1] && out[1] === out[2]) same++; else bad.push(out.join(" | "));
}
console.log(`${same}/${n} snaps replayed identically three times`); bad.slice(0, 5).forEach(b => console.log("  differs:", b));
