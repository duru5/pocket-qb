const path = "/home/claude/pocket-qb/";
const B = require(path + "playbook.js"), RP = require(path + "rep.js"), CAL = require(path + "calib.js");
const ALL = B.CONCEPTS.map(c => c.id);
const by = {}; let N = 0, Y = 0, ten = 0, neg = 0, stuff = 0;
const PERS = []; for (const [k, v] of Object.entries({ "11": 63, "12": 22, "21": 7 })) for (let i = 0; i < v; i++) PERS.push(k);
for (let i = 0; i < +(process.argv[2] || 2500); i++) {
  const cid = ["iz", "oz", "power"][i % 3], pers = PERS[Math.floor(Math.random() * PERS.length)];
  const r = new RP.Rep(3, ALL, { personnel: pers }); if (!r.formFor(cid)) continue;
  r.pick(cid); r.breakHuddle(); r.tick(8); r.snap();
  const R = r.runRes, g = R.gain, b = Math.min(9, R.box);
  const o = by[b] || (by[b] = { n: 0, y: 0, ten: 0, stuff: 0 }); o.n++; o.y += g; if (g >= 10) o.ten++; if (g <= 0) o.stuff++;
  N++; Y += g; if (g >= 10) ten++; if (g < 0) neg++; if (g <= 0) stuff++;
}
console.log(`model: ${(Y / N).toFixed(2)} ypc, 10+ ${(100 * ten / N).toFixed(1)}%, neg ${(100 * neg / N).toFixed(1)}%, stuffed ${(100 * stuff / N).toFixed(1)}%   NFL: ${CAL.runAll.ypc} ypc, 10+ ${(100 * CAL.runAll.ten).toFixed(1)}%, neg ${(100 * CAL.runAll.neg).toFixed(1)}%, stuffed ${(100 * CAL.runAll.stuff).toFixed(1)}%`);
for (const b of Object.keys(by).sort()) { const o = by[b], n = CAL.runBox[b]; console.log(`box ${b}: model n ${o.n} ${(o.y / o.n).toFixed(2)} ypc, 10+ ${(100 * o.ten / o.n).toFixed(0)}%, stuff ${(100 * o.stuff / o.n).toFixed(0)}%` + (n ? `   NFL ${n.ypc} ypc, 10+ ${(100 * n.ten).toFixed(0)}%, stuff ${(100 * n.stuff).toFixed(0)}%, share ${n.n}` : "")); }
