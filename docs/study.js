/* Pocket QB: the Study tab. An interactive QB development plan built on the
   game's own engine: every board is a film from lab.js, every throw check is
   graded by play.js, and drills launch Play with the lesson's slice of the
   NFL call sheet. Content lives in study_content.js. */
(function () {
  "use strict";
  const E = window.PocketEngine, B = window.PocketBook, D = window.PocketDefense, P = window.PocketPlay;
  const LAB = window.PocketLab, CAL = window.PocketCalib, SC = window.PocketStudyContent, KC = window.PocketCoaches;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const pct = (v, d = 0) => (100 * v).toFixed(d) + "%";
  const sgn = v => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2);
  const POSC = { X: "#F2B84B", H: "#FF8A6B", Y: "#9BE38C", Z: "#7FB8FF", RB: "#D7A8FF" };
  const POS_ORDER = ["X", "H", "Y", "Z", "RB"];
  const ABBR = { LCB: "CB", RCB: "CB", FS: "FS", SS: "SS", N: "N", DB: "DB", WLB: "W", MLB: "M", SLB: "S" };
  const CHALK = "#E4F0F3", GOLD = "#E8C547", TEAL = "#37C6DB", RED = "#FF8455";
  const STRIPE = ["#10291B", "#133020"];
  const CBYID = Object.fromEntries(B.CONCEPTS.map(c => [c.id, c]));
  const covName = k => D.COV[k].short || D.COV[k].label;
  const READ_GROUPS = [
    { deep: 2, label: "Two deep", covs: ["c2", "tampa2", "c4", "c6", "m2"] },
    { deep: 1, label: "One deep", covs: ["c1", "c3sky", "c3buzz", "fire"] },
    { deep: 0, label: "None deep", covs: ["c0"] }
  ];
  const TECH = { top1: "man", top1o: "MOD", top: "over", wall: "wall", sink: "sink", flat: "flat", zone: "zone" };
  const TECHC = { top1: "#FF8A6B", top1o: "#FF8A6B", top: "#7FB8FF", wall: GOLD, sink: "#D7A8FF", flat: "#9BE38C", zone: "rgba(228,240,243,.55)", man: "#FF8A6B" };
  const TECH_LONG = {
    top1: "man coverage over the top: his rule has turned into man", top1o: "man only deep (MOD), from outside leverage",
    top: "over the top, inside-out", wall: "walling him: inside and underneath", sink: "sinking under #1, no deeper than 12 yards",
    flat: "taking him in the flat", zone: "playing his zone, eyes on the nearest receiver"
  };
  const ROLE_NAME = { c3corner: "Cover 3 corner", qcorner: "quarters corner", qsafety: "quarters safety", mof: "middle-of-field safety", pipe: "pipe runner",
    half: "half-field safety", curlflat: "curl/flat defender", apex: "apex (flat) defender", seamcurl: "seam/curl defender", c2corner: "cloud corner",
    hook: "hook defender", rat: "hole player (rat)" };
  const PASS_IDS = B.CONCEPTS.filter(c => c.kind !== "run" && !c.pa && (c.forms || [c.formation]).some(f => B.FORMATIONS[f].personnel === "11")).map(c => c.id);

  /* ---------- progress (this browser only) ---------- */
  const KEY = "pocket.study.v1";
  const blank = () => ({ done: {}, checks: {}, reps: { shell: { n: 0, ok: 0 }, cov: { n: 0, ok: 0, fam: 0 }, thr: { n: 0, ok: 0, gap: 0 } }, drills: {}, last: null, days: [], coach: null });
  let ST = blank();
  try { const r = localStorage.getItem(KEY); if (r) { const o = JSON.parse(r); ST = Object.assign(blank(), o); ST.reps = Object.assign(blank().reps, o.reps || {}); } } catch (e) { }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) { } };
  function touchDay() { const d = new Date().toISOString().slice(0, 10); if (!ST.days.includes(d)) { ST.days.push(d); ST.days = ST.days.slice(-90); } }

  const LESSONS = [];
  for (const ph of SC.PHASES) for (const l of ph.lessons) { l.phase = ph; LESSONS.push(l); }
  const LBYID = Object.fromEntries(LESSONS.map(l => [l.id, l]));
  const checksOf = l => l.blocks.map((b, i) => ({ b, i })).filter(({ b }) => b.tap || b.throw || b.mc || b.idrun).map(({ i }) => l.id + ":" + i);
  function lessonState(l) {
    if (ST.done[l.id]) return "done";
    const cs = checksOf(l);
    return cs.some(k => ST.checks[k]) ? "started" : "new";
  }
  function noteCheck(l, key, ok) {
    if (ok) ST.checks[key] = true;
    touchDay();
    const cs = checksOf(l);
    if (cs.length && cs.every(k => ST.checks[k])) ST.done[l.id] = true;
    save();
  }

  /* ---------- films (deterministic, so cached) ---------- */
  const FILMS = new Map();
  function film(spec) {
    const k = JSON.stringify(spec);
    if (!FILMS.has(k)) { if (FILMS.size > 60) FILMS.delete(FILMS.keys().next().value); FILMS.set(k, LAB.film(spec)); }
    return FILMS.get(k);
  }
  function frameIdx(F, t) {
    const fr = F.frames; let lo = 0, hi = fr.length - 1;
    if (t <= fr[0].t) return 0;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (fr[m].t <= t) lo = m; else hi = m - 1; }
    return lo;
  }
  function viewTop(F) {
    let m = 14;
    for (const f of F.live) for (const pos in f.recv) if (f.t <= F.spec.T) m = Math.max(m, f.recv[pos].y);
    return Math.max(20, Math.min(34, m + 4));
  }
  const compact = n => (n || "").replace("Deep third", "Third").replace("Deep half", "Half").replace("Deep middle", "Middle").replace("Curl/flat", "C/F")
    .replace("Quarter inside", "Qtr in").replace("Quarter outside", "Qtr out").replace("Quarter", "Qtr").replace("Seam/curl", "S/C")
    .replace(" strong", " S").replace(" weak", " W").replace(" middle", " M").replace("Deep hole (pipe)", "Pipe").replace("Hole (rat)", "Rat");

  /* ================= the board ================= */
  const BOARDS = new Set();
  let ANIM = false;
  function animate() {
    if (ANIM) return; ANIM = true;
    let last = 0;
    const step = now => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
      let any = false;
      for (const b of BOARDS) if (b.playing && b.el.isConnected) { any = true; b.advance(dt); }
      if (any) requestAnimationFrame(step); else { ANIM = false; }
    };
    requestAnimationFrame(step);
  }

  class Board {
    /* cfg: {films:[{label,spec}], opts, chapters, ev, explore, start, maxT, onTap, noTransport} */
    constructor(cfg) {
      this.cfg = cfg;
      this.opts = Object.assign({ rules: true, zones: true, routes: true, nums: false, depth: false, eyes: true }, cfg.opts || {});
      this.fi = 0; this.F = null; this.t = cfg.start != null ? cfg.start : -1.2; this.playing = false; this.rate = 0.5;
      this.hl = null; this.sel = null; this.mark = null; this.chap = -1; this.override = null;
      const el = this.el = document.createElement("div");
      el.className = "sb panel bleed";
      const films = cfg.films || [];
      el.innerHTML = `
        ${films.length > 1 ? `<div class="chips sb-films" role="group" aria-label="Films">${films.map((f, i) => `<button class="chip toggle" data-fi="${i}" aria-pressed="${i === 0}">${esc(f.label)}</button>`).join("")}</div>` : (films[0] && films[0].label ? `<div class="sb-title">${esc(films[0].label)}</div>` : "")}
        <div class="fieldwrap sb-fw"><canvas class="sbc" aria-label="Film"></canvas>
          <div class="f-clock"><span class="sb-clk">0.00</span><small class="sb-clkl">sec</small></div>
          <div class="f-tag sb-tag"></div><div class="f-drop sb-drop">Top of drop</div>
          <div class="sb-pop" hidden></div></div>
        ${cfg.noTransport ? "" : `<div class="transport">
          <button class="playbtn sb-play" aria-label="Play"><svg viewBox="0 0 16 16"><path d="M3 1.5v13l11-6.5z"/></svg></button>
          <div class="scrub"><input type="range" class="sb-scrub" step="0.01" aria-label="Time"><div class="ticks sb-ticks"></div></div>
          <div class="seg sb-rate" role="group" aria-label="Speed"><button data-rate="0.25">¼×</button><button data-rate="0.5" aria-pressed="true">½×</button><button data-rate="1">1×</button></div>
        </div>
        <div class="opts sb-opts">${[["rules", "Rules"], ["zones", "Zones"], ["routes", "Routes"], ["nums", "Numbers"], ["depth", "Depth"]].map(([k, n]) =>
          `<button class="chip toggle" data-opt="${k}" aria-pressed="${!!this.opts[k]}">${n}</button>`).join("")}</div>`}
        ${cfg.chapters && cfg.chapters.length ? `<div class="sb-chaps">${cfg.chapters.map((c, i) => `<button class="chap" data-ch="${i}"><span>${i + 1}</span>${esc(c.title)}</button>`).join("")}</div><p class="sb-note" hidden></p>` : ""}
        ${cfg.explore ? `<p class="sb-hint">Tap a defender to see his job at this moment.</p>` : ""}
        ${cfg.ev ? `<div class="sb-ev"><div class="sb-evh"><span class="lab">If you decide now</span><span class="hint">value of each throw, EPA</span></div><div class="sb-evc"></div></div>` : ""}`;
      this.cv = el.querySelector(".sbc"); this.ctx = this.cv.getContext("2d");
      const q = s => el.querySelector(s);
      this.scrub = q(".sb-scrub");
      el.addEventListener("click", e => {
        const fb = e.target.closest("[data-fi]"); if (fb) { this.setFilm(+fb.dataset.fi); return; }
        const ob = e.target.closest("[data-opt]"); if (ob) { const k = ob.dataset.opt; this.opts[k] = !this.opts[k]; ob.setAttribute("aria-pressed", this.opts[k]); this.draw(); return; }
        const rb = e.target.closest("[data-rate]"); if (rb) { this.rate = +rb.dataset.rate; el.querySelectorAll("[data-rate]").forEach(b => b.setAttribute("aria-pressed", b === rb)); return; }
        const cb = e.target.closest("[data-ch]"); if (cb) { this.goChapter(+cb.dataset.ch); return; }
        if (e.target.closest(".sb-play")) { this.toggle(); return; }
      });
      if (this.scrub) this.scrub.addEventListener("input", () => { this.pause(); this.setT(+this.scrub.value); });
      this.cv.addEventListener("pointerdown", e => this.tap(e));
      new ResizeObserver(() => this.resize()).observe(this.cv);
      BOARDS.add(this);
      // build the film when the board scrolls into view
      const io = new IntersectionObserver(ents => { if (ents.some(x => x.isIntersecting)) { io.disconnect(); this.setFilm(0); } }, { rootMargin: "200px" });
      io.observe(el);
    }
    get tMin() { return this.F ? this.F.frames[0].t : -1.6; }
    get tMax() { return this.cfg.maxT != null ? this.cfg.maxT : (this.F ? this.F.frames[this.F.frames.length - 1].t : 3); }
    setFilm(i, spec) {
      this.fi = i;
      const f = spec ? { spec } : this.cfg.films[i];
      try { this.F = f.F || film(f.spec); } catch (e) { console.error(e); return; }
      this.el.querySelectorAll("[data-fi]").forEach(b => b.setAttribute("aria-pressed", +b.dataset.fi === i));
      this.top = this.cfg.top || Math.max(...this.cfg.films.map(x => { try { return viewTop(x.F || film(x.spec)); } catch (e) { return 24; } }), spec ? viewTop(this.F) : 0);
      this.bot = -8;
      if (this.scrub) {
        this.scrub.min = this.tMin.toFixed(2); this.scrub.max = this.tMax.toFixed(2);
        const tk = this.el.querySelector(".sb-ticks"), span = this.tMax - this.tMin;
        const pos = v => (100 * (v - this.tMin) / span).toFixed(1) + "%";
        tk.innerHTML = `<span style="left:${pos(0)}">snap</span><span class="drop" style="left:${pos(this.F.tTop)}">top ${this.F.tTop.toFixed(1)}</span>`;
      }
      this.t = Math.max(this.tMin, Math.min(this.tMax, this.t));
      this.resize();
      this.setT(this.t);
      if (this.cfg.ev) this.buildEV();
      if (this.chap >= 0) this.goChapter(this.chap, true);
    }
    resize() {
      const w = this.cv.clientWidth || 360, h = Math.round(w * (this.top - this.bot) / D.FW);
      const d = Math.min(2.5, window.devicePixelRatio || 1);
      if (this.cv.style.height !== h + "px") this.cv.style.height = h + "px";
      const W = Math.round(w * d), H = Math.round(h * d);
      if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
      this.draw();
    }
    toggle() { if (this.playing) this.pause(); else { if (this.t >= this.tMax - 0.01) this.t = this.tMin; this.playing = true; this.icon(); animate(); } }
    play() { this.playing = true; this.icon(); animate(); }
    pause() { this.playing = false; this.icon(); }
    icon() { const b = this.el.querySelector(".sb-play svg"); if (b) b.innerHTML = this.playing ? `<path d="M3 2h3.5v12H3zM9.5 2H13v12H9.5z"/>` : `<path d="M3 1.5v13l11-6.5z"/>`; }
    advance(dt) {
      const nt = this.t + dt * this.rate;
      if (nt >= this.tMax) { this.setT(this.tMax); this.pause(); if (this.onEnd) this.onEnd(); return; }
      this.setT(nt);
    }
    setT(t) {
      this.t = Math.max(this.tMin, Math.min(this.tMax, t));
      if (this.scrub) this.scrub.value = this.t;
      this.draw();
      if (this.evMark) this.moveEV();
    }
    goChapter(i, quiet) {
      const c = this.cfg.chapters[i]; if (!c) return;
      this.chap = i; this.pause();
      this.el.querySelectorAll("[data-ch]").forEach(b => b.classList.toggle("on", +b.dataset.ch === i));
      const n = this.el.querySelector(".sb-note"); if (n) { n.hidden = false; n.textContent = c.text; }
      this.hl = c.hl || null; this.override = c.opts || null;
      if (!quiet || true) this.setT(c.t);
    }
    /* field coordinates of a pointer event */
    fieldAt(e) { const r = this.cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * D.FW, y: this.top - (e.clientY - r.top) / r.height * (this.top - this.bot) }; }
    hit(pt) {
      if (!this.F) return null;
      const fr = this.F.frames[frameIdx(this.F, this.t)];
      let best = null, bd = 3.2;
      this.F.defs.forEach((d, i) => { const s = fr.defs[i]; const dd = Math.hypot(s.x - pt.x, s.y - pt.y); if (dd < bd) { bd = dd; best = { kind: "def", i, id: d.id }; } });
      for (const pos in fr.recv) { const s = fr.recv[pos]; const dd = Math.hypot(s.x - pt.x, s.y - pt.y); if (dd < bd) { bd = dd; best = { kind: "off", pos }; } }
      return best;
    }
    tap(e) {
      const h = this.hit(this.fieldAt(e));
      if (this.cfg.onTap) { if (h) this.cfg.onTap(h, this); return; }
      if (this.cfg.explore && h) { this.sel = h; this.pause(); this.showPop(); this.draw(); }
    }
    showPop() {
      const pop = this.el.querySelector(".sb-pop"), F = this.F, h = this.sel;
      if (!h || h.kind !== "def") { pop.hidden = true; return; }
      const d = F.defs[h.i], fr = F.frames[frameIdx(F, this.t)], r = fr.rules && fr.rules[h.i];
      const name = D.META[d.id].name;
      let txt;
      if (this.t < 0) txt = `Before the snap. At the snap: ${d.rush ? (d.blitz ? "blitzes" : "rushes") : (d.man ? "man on " + d.man : esc(d.zone || ""))}.`;
      else if (d.rush) txt = d.blitz ? "Blitzing." : "Rushing the passer.";
      else if (d.man) txt = `Man on ${d.man}${F.plan && F.plan.pressed && F.plan.pressed.includes(d.man) ? ", pressed at the line" : ""}.`;
      else if (r) {
        const n = r.pos ? LAB.numberOf(F.nums, r.pos) : null;
        txt = `${esc(d.zone)} · ${esc(ROLE_NAME[r.role] || r.role)}. ${r.pos ? `On ${r.pos}${n ? " (#" + n.n + ")" : ""}: ${TECH_LONG[r.tech] || r.tech}.` : "No receiver threatening his area yet: playing his landmark."}`;
      } else txt = `${esc(d.zone || "")}: reacting to the snap.`;
      pop.innerHTML = `<b>${esc(name)}</b> ${txt}<button class="sb-x" aria-label="Close">×</button>`;
      pop.hidden = false;
      pop.querySelector(".sb-x").onclick = ev => { ev.stopPropagation(); this.sel = null; pop.hidden = true; this.draw(); };
    }
    buildEV() {
      const host = this.el.querySelector(".sb-evc"); if (!host) return;
      host.innerHTML = `<div class="hint">Working it out…</div>`;
      const F = this.F;
      setTimeout(() => {
        if (this.F !== F) return;
        const tl = F.evTL || (F.evTL = LAB.evTimeline(F, 0.3, null, 0.1));
        if (!tl.length) { host.innerHTML = ""; return; }
        const W = 340, H = 130, L = 26, R = 22, T = 8, Bm = 18;
        const t0 = tl[0].t, t1 = tl[tl.length - 1].t;
        const vals = tl.flatMap(r => Object.values(r.v).map(x => x.ev));
        const ymax = Math.max(1, Math.min(4, Math.ceil(Math.max(...vals)))), ymin = -1;
        const X = t => L + (t - t0) / (t1 - t0 || 1) * (W - L - R), Y = v => T + (ymax - Math.max(ymin, Math.min(ymax, v))) / (ymax - ymin) * (H - T - Bm);
        let g = "";
        for (let v = ymin; v <= ymax; v++) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="${v === 0 ? "z" : "g"}"/><text x="${L - 4}" y="${Y(v) + 3}" class="yl">${v > 0 ? "+" : ""}${v}</text>`;
        for (let t = Math.ceil(t0 * 2) / 2; t <= t1 + 1e-6; t += 0.5) g += `<text x="${X(t)}" y="${H - 4}" class="xl">${t.toFixed(1)}</text>`;
        const top = F.tTop;
        if (top >= t0 && top <= t1) g += `<line x1="${X(top)}" x2="${X(top)}" y1="${T}" y2="${H - Bm}" class="drop"/>`;
        const pos = Object.keys(tl[0].v);
        const labs = [];
        for (const p of pos) {
          const pts = tl.map(r => `${X(r.t).toFixed(1)},${Y(r.v[p].ev).toFixed(1)}`).join(" ");
          labs.push({ p, y: Y(tl[tl.length - 1].v[p].ev) + 3 });
          g += `<polyline points="${pts}" fill="none" stroke="${POSC[p]}" stroke-width="2" stroke-linejoin="round"/>`;
        }
        // end labels, pushed apart so they do not overlap
        labs.sort((a, b) => a.y - b.y);
        for (let k = 1; k < labs.length; k++) if (labs[k].y - labs[k - 1].y < 10) labs[k].y = labs[k - 1].y + 10;
        for (const L2 of labs) g += `<text x="${W - R + 3}" y="${L2.y}" fill="${POSC[L2.p]}" class="pl">${L2.p}</text>`;
        g += `<line class="mk" x1="0" x2="0" y1="${T}" y2="${H - Bm}"/>`;
        host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="evsvg" role="img" aria-label="Value of each throw by decision time">${g}</svg>
          <p class="foot">Decision time after the snap (s). The ball leaves 0.35 s after you decide. Same grader as Play: best of a bullet and touch, no dice. Dashed line: top of the drop.</p>`;
        this.evX = X; this.evRange = [t0, t1]; this.evMark = host.querySelector(".mk");
        this.moveEV();
      }, 30);
    }
    moveEV() {
      if (!this.evMark) return;
      const [a, b] = this.evRange, on = this.t >= a && this.t <= b;
      this.evMark.style.display = on ? "" : "none";
      if (on) { const x = this.evX(this.t); this.evMark.setAttribute("x1", x); this.evMark.setAttribute("x2", x); }
    }

    draw() {
      const ctx = this.ctx, W = this.cv.width, H = this.cv.height, F = this.F;
      if (!W) return;
      const s = W / D.FW, dpr = W / (this.cv.clientWidth || W), top = this.top, bot = this.bot;
      const X = x => x * s, Y = y => (top - y) * s;
      const o = Object.assign({}, this.opts, this.override || {});
      ctx.clearRect(0, 0, W, H);
      // turf: five-yard stripes from the line of scrimmage
      for (let y = Math.floor(bot / 5) * 5; y < top; y += 5) {
        ctx.fillStyle = STRIPE[((y / 5) % 2 + 2) % 2]; ctx.fillRect(0, Y(y + 5), W, Y(y) - Y(y + 5) + 1);
      }
      ctx.strokeStyle = "rgba(255,255,255,.22)"; ctx.lineWidth = dpr;
      for (let y = Math.ceil(bot / 5) * 5; y <= top; y += 5) { if (!y) continue; ctx.beginPath(); ctx.moveTo(0, Y(y)); ctx.lineTo(W, Y(y)); ctx.stroke(); }
      ctx.strokeStyle = "rgba(255,255,255,.3)";
      for (let y = Math.ceil(bot); y <= top; y++) { if (y % 5 === 0) continue; for (const hx of [23.58, 29.75]) { ctx.beginPath(); ctx.moveTo(X(hx - .33), Y(y)); ctx.lineTo(X(hx + .33), Y(y)); ctx.stroke(); } }
      ctx.font = `500 ${9 * dpr}px "JetBrains Mono", monospace`; ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.fillStyle = "rgba(228,240,243,.4)";
      for (let y = 5; y <= top; y += 5) ctx.fillText("+" + y, 3 * dpr, Y(y) - 6 * dpr);
      ctx.strokeStyle = "rgba(55,198,219,.85)"; ctx.lineWidth = 2 * dpr; ctx.beginPath(); ctx.moveTo(0, Y(0)); ctx.lineTo(W, Y(0)); ctx.stroke();
      if (!F) return;
      const sit = F.sit;
      if (sit.togo < top) { ctx.strokeStyle = "rgba(232,197,71,.6)"; ctx.lineWidth = 1.6 * dpr; ctx.beginPath(); ctx.moveTo(0, Y(sit.togo)); ctx.lineTo(W, Y(sit.togo)); ctx.stroke(); }
      const t = this.t, fi = frameIdx(F, t), fr = F.frames[fi], post = t >= 0;
      const hl = this.hl ? LAB.who(F, this.hl) : { def: [], off: [] };
      const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 260);

      // zones (after the snap: each zone defender's landmark)
      if (o.zones && post) {
        F.defs.forEach(d => {
          if (d.rush || d.man || !d.land) return;
          const deep = d.tier === "deep", rx = (deep ? 5.5 : 4) * s, ry = (deep ? 3.4 : 2.6) * s;
          ctx.fillStyle = deep ? "rgba(127,184,255,.10)" : "rgba(55,198,219,.10)";
          ctx.strokeStyle = deep ? "rgba(127,184,255,.35)" : "rgba(55,198,219,.35)"; ctx.lineWidth = dpr; ctx.setLineDash([3 * dpr, 3 * dpr]);
          ctx.beginPath(); ctx.ellipse(X(d.land.x), Y(d.land.y), rx, ry, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = "rgba(228,240,243,.55)"; ctx.font = `600 ${8.5 * dpr}px "Archivo", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(compact(d.zone), X(d.land.x), Y(d.land.y) + ry - 6 * dpr);
        });
      }
      // routes
      if (o.routes) {
        for (const pos of POS_ORDER) {
          const pl = F.sim.players[pos]; if (!pl || pl.blocking) continue;
          const run = pl.run;
          ctx.globalAlpha = 0.32; ctx.strokeStyle = POSC[pos]; ctx.lineWidth = 2 * dpr; ctx.lineJoin = "round";
          ctx.beginPath(); ctx.moveTo(X(run.start.x), Y(run.start.y));
          for (let tt = run.t0; tt <= Math.min(run.tEnd, F.spec.T + 0.4); tt += 0.04) { const st = run.stateAt(tt); ctx.lineTo(X(st.x), Y(Math.min(st.y, top))); }
          ctx.stroke(); ctx.globalAlpha = 1;
        }
      }
      // rule links
      const tag = [];
      if (o.rules && post && fr.rules) {
        F.defs.forEach((d, i) => {
          const st = fr.defs[i]; let tech = null, pos = null;
          if (d.man) { tech = "man"; pos = d.man; }
          else if (fr.rules[i]) { tech = fr.rules[i].tech; pos = fr.rules[i].pos; }
          if (!tech || d.rush) return;
          if (pos && fr.recv[pos]) {
            const r = fr.recv[pos];
            ctx.strokeStyle = TECHC[tech] || CHALK; ctx.lineWidth = (tech === "zone" ? 1.2 : 1.8) * dpr;
            ctx.setLineDash(tech === "zone" ? [3 * dpr, 4 * dpr] : []); ctx.globalAlpha = 0.85;
            ctx.beginPath(); ctx.moveTo(X(st.x), Y(st.y)); ctx.lineTo(X(r.x), Y(r.y)); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
          }
          if (tech !== "zone" && tech !== "man") {
            const n = pos ? LAB.numberOf(F.nums, pos) : null;
            tag.push({ x: X(st.x), y: Y(st.y), text: TECH[tech] + (n ? " #" + n.n : (pos ? " " + pos : "")), col: TECHC[tech] });
          }
        });
      }
      const shadow = (x, y, r) => { ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(x + 1.5 * dpr, y + r * 0.55, r * 0.95, r * 0.45, 0, 0, 7); ctx.fill(); };
      const ring = (x, y, r, col, w) => { ctx.strokeStyle = col; ctx.lineWidth = (w || 2.4) * dpr; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); };
      // pocket clock
      if (post && F.spec.pocket === "real" && !fr.ball) {
        const k = Math.max(0, 1 - t / F.rep.sackT);
        ctx.strokeStyle = t > F.rep.sackT - 0.5 ? RED : "rgba(255,132,85,.45)"; ctx.lineWidth = 2 * dpr;
        ctx.beginPath(); ctx.arc(X(fr.qb.x), Y(fr.qb.y), (1.2 + 3.2 * k) * s, 0, 7); ctx.stroke();
      }
      // line and QB
      const ol = Math.min(0.5 * s, Math.max(4 * dpr, 0.42 * s));
      ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 1.2 * dpr;
      for (const p of B.OL) { ctx.fillStyle = "#C9D6DA"; ctx.fillRect(X(p.x) - ol, Y(p.y) - ol, 2 * ol, 2 * ol); ctx.strokeRect(X(p.x) - ol, Y(p.y) - ol, 2 * ol, 2 * ol); }
      const qr = Math.max(7 * dpr, 0.75 * s);
      shadow(X(fr.qb.x), Y(fr.qb.y), qr); ctx.fillStyle = CHALK; ctx.beginPath(); ctx.arc(X(fr.qb.x), Y(fr.qb.y), qr, 0, 7); ctx.fill();
      ctx.fillStyle = "#0E2418"; ctx.font = `700 ${8 * dpr}px "Archivo", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("QB", X(fr.qb.x), Y(fr.qb.y) + 0.5 * dpr);
      // receivers
      const rr = Math.max(8 * dpr, 0.8 * s);
      for (const pos of POS_ORDER) {
        const st = fr.recv[pos]; if (!st) continue;
        const x = X(st.x), y = Y(st.y);
        shadow(x, y, rr);
        ctx.fillStyle = POSC[pos]; ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 1.6 * dpr;
        ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#0C1417"; ctx.font = `700 ${(pos.length > 1 ? 8 : 10) * dpr}px "Archivo", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(pos, x, y + 0.5 * dpr);
        if (hl.off.includes(pos)) { ctx.globalAlpha = pulse; ring(x, y, rr + 5 * dpr, GOLD, 2.6); ctx.globalAlpha = 1; }
        if (this.mark && this.mark.off && this.mark.off[pos]) ring(x, y, rr + 4 * dpr, this.mark.off[pos], 3);
        if (o.nums && pos !== "RB") {
          const n = LAB.numberOf(F.nums, pos);
          if (n) {
            const tx = "#" + n.n; ctx.font = `700 ${9.5 * dpr}px "JetBrains Mono", monospace`;
            const w = ctx.measureText(tx).width + 6 * dpr, bx = x - w / 2, by = y - rr - 15 * dpr;
            ctx.fillStyle = "rgba(12,20,23,.85)"; ctx.fillRect(bx, by, w, 12 * dpr); ctx.fillStyle = POSC[pos]; ctx.fillText(tx, x, by + 6 * dpr);
          }
        }
      }
      // defenders
      F.defs.forEach((d, i) => {
        const st = fr.defs[i]; if (!st) return;
        const x = X(st.x), y = Y(st.y);
        const free = post && F.plan && F.plan.freeId === d.id && F.spec.pocket === "real";
        if (d.dl || (d.rush && post)) {
          const q = Math.max(5 * dpr, 0.46 * s);
          shadow(x, y, q); ctx.fillStyle = "#2A3A42"; ctx.strokeStyle = free ? RED : CHALK; ctx.lineWidth = (free ? 2.4 : 1.4) * dpr;
          ctx.beginPath(); ctx.rect(x - q, y - q, 2 * q, 2 * q); ctx.fill(); ctx.stroke();
          if (d.blitz) { ctx.fillStyle = CHALK; ctx.font = `700 ${8 * dpr}px "Archivo", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(ABBR[d.id] || "", x, y + 0.5 * dpr); }
          if (free) ring(x, y, q * 1.8, RED, 2.2);
        } else {
          const r = Math.max(8.5 * dpr, 0.85 * s);
          shadow(x, y, r);
          ctx.fillStyle = "#2A3A42"; ctx.strokeStyle = CHALK; ctx.lineWidth = 1.7 * dpr;
          ctx.beginPath(); ctx.moveTo(x, y - r * 1.05); ctx.lineTo(x + r, y + r * 0.8); ctx.lineTo(x - r, y + r * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = CHALK; ctx.font = `700 ${7.5 * dpr}px "Archivo", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(ABBR[d.id] || d.id, x, y + r * 0.25);
          if (o.depth && t < 0.25 && (d.arch === "CB" || d.arch === "S" || d.arch === "N")) {
            ctx.font = `700 ${9 * dpr}px "JetBrains Mono", monospace`; ctx.textAlign = "left"; ctx.fillStyle = GOLD;
            ctx.fillText(Math.round(st.y) + "", x + r + 2 * dpr, y);
          }
        }
        const hr = Math.max(8.5 * dpr, 0.85 * s) + 5 * dpr;
        if (hl.def.includes(i) || (free && this.hl && this.hl.free)) { ctx.globalAlpha = pulse; ring(x, y, hr, GOLD, 2.6); ctx.globalAlpha = 1; }
        if (this.sel && this.sel.kind === "def" && this.sel.i === i) ring(x, y, hr, TEAL, 2.6);
        if (this.mark && this.mark.def && this.mark.def[i]) ring(x, y, hr, this.mark.def[i], 3);
      });
      // rule tags last, so they sit on top
      ctx.font = `700 ${8.5 * dpr}px "JetBrains Mono", monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (const g of tag) {
        const w = ctx.measureText(g.text).width + 6 * dpr, h = 11 * dpr, by = g.y + 11 * dpr;
        ctx.fillStyle = "rgba(12,20,23,.85)"; ctx.fillRect(g.x - w / 2, by, w, h); ctx.fillStyle = g.col; ctx.fillText(g.text, g.x, by + h / 2 + 0.5 * dpr);
      }
      // eyes
      if (o.eyes && fr.eye) {
        const ex = X(fr.eye.x), ey = Y(fr.eye.y);
        ctx.strokeStyle = TEAL; ctx.lineWidth = 2 * dpr; ring(ex, ey, 11 * dpr, TEAL, 2);
        ctx.globalAlpha = 0.35; ctx.setLineDash([4 * dpr, 4 * dpr]); ctx.beginPath(); ctx.moveTo(X(fr.qb.x), Y(fr.qb.y)); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      // ball
      if (fr.ball) {
        const b = fr.ball, hs = 1 + Math.min(0.6, b.h / 8);
        ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.beginPath(); ctx.ellipse(X(b.x), Y(b.y), 4.5 * dpr / hs, 2.6 * dpr / hs, 0, 0, 7); ctx.fill();
        ctx.save(); ctx.translate(X(b.x), Y(b.y + b.h)); ctx.rotate(-0.6);
        ctx.fillStyle = "#8A4B25"; ctx.strokeStyle = "#3A1E0E"; ctx.lineWidth = dpr;
        ctx.beginPath(); ctx.ellipse(0, 0, 6.5 * dpr * hs, 4 * dpr * hs, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
      }
      // clock and tags
      const clk = this.el.querySelector(".sb-clk"), cl = this.el.querySelector(".sb-clkl");
      clk.textContent = (t < 0 ? "−" : "") + Math.abs(t).toFixed(2); cl.textContent = t < 0 ? "before snap" : "after snap";
      const tagEl = this.el.querySelector(".sb-tag");
      tagEl.textContent = t < 0 ? (F.spec.shown && F.spec.shown !== (F.rep.truth) ? "Pre-snap · disguised" : "Pre-snap") : `${CBYID[F.spec.cid].name} vs ${covName(F.spec.cov)}`;
      if (this.cfg.hideAnswer && t >= -0.001) tagEl.textContent = "After the snap";
      if (this.cfg.hideAnswer && t < 0) tagEl.textContent = "Pre-snap";
      this.el.querySelector(".sb-drop").classList.toggle("on", Math.abs(t - F.tTop) < 0.12);
      if (this.sel) this.showPop();
      if (this.hl && (this.playing || this.hlAnim)) { /* the pulse redraws while playing */ }
    }
  }
  // highlights pulse while a chapter is showing
  setInterval(() => { for (const b of BOARDS) if (b.hl && !b.playing && b.el.isConnected && b.F) b.draw(); }, 120);

  /* ================= blocks ================= */
  const coachOn = () => ST.coach && KC.BYID[ST.coach] ? KC.BYID[ST.coach] : null;
  const SIDE = { offense: "Offense", defense: "Defense", program: "Program" }, LVL = { nfl: "NFL", college: "College", both: "NFL and college" };
  function blockEl(b, l, i) {
    const key = l ? l.id + ":" + i : null;
    const div = document.createElement("div");
    if (b.p) { div.innerHTML = `<p class="st-p">${b.p}</p>`; return div.firstChild; }
    if (b.h) { div.innerHTML = `<h4 class="st-h">${esc(b.h)}</h4>`; return div.firstChild; }
    if (b.list) { div.innerHTML = `<ul class="st-list">${b.list.map(x => `<li>${x}</li>`).join("")}</ul>`; return div.firstChild; }
    if (b.note) { div.innerHTML = `<p class="st-note">${b.note}</p>`; return div.firstChild; }
    if (b.key) { div.innerHTML = `<div class="st-key"><span class="lab">Coaching point</span><p>${b.key}</p></div>`; return div.firstChild; }
    if (b.table) {
      div.innerHTML = `<div class="tblwrap st-tbl"><table class="timing"><thead><tr>${b.table.head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${b.table.rows.map(r => `<tr>${r.map((c, j) => `<td${j === 0 ? ' class="k"' : ""}>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      return div.firstChild;
    }
    if (b.board) return new Board(b.board).el;
    if (b.tap) return tapCheck(b.tap, l, key);
    if (b.throw) return throwCheck(b.throw, l, key);
    if (b.mc) return mcCheck(b.mc, l, key);
    if (b.reveal) {
      div.innerHTML = `<details class="st-reveal"><summary>${esc(b.reveal.q)}</summary><p>${esc(b.reveal.a)}</p></details>`; return div.firstChild;
    }
    if (b.widget) return widget(b.widget, b.args || {});
    if (b.drill) return drillEl(b.drill);
    if (b.idrun) return repsEl(b.idrun.mode, { n: b.idrun.n, level: b.idrun.level, title: b.idrun.title, onDone: (ok, n) => { if (l) noteCheck(l, key, ok >= Math.ceil(n * 0.6)); } });
    div.textContent = ""; return div;
  }

  function checkShell(kind, prompt) {
    const el = document.createElement("div");
    el.className = "st-check";
    el.innerHTML = `<div class="st-ch-h"><span class="lab">${esc(kind)}</span></div><p class="st-q">${esc(prompt)}</p>`;
    return el;
  }
  function verdict(host, ok, text, extra) {
    let fb = host.querySelector(".fb");
    if (!fb) { fb = document.createElement("div"); host.appendChild(fb); }
    fb.className = "fb " + (ok ? "ok" : "no");
    fb.innerHTML = `<div class="verdict">${ok ? "Right" : "Not quite"}</div>${text}${extra || ""}`;
  }
  function mcCheck(m, l, key) {
    const el = checkShell("Check", m.q);
    el.insertAdjacentHTML("beforeend", `<div class="answers one">${m.opts.map((o, j) => `<button class="ans" data-j="${j}">${esc(o)}</button>`).join("")}</div>`);
    if (key && ST.checks[key]) el.classList.add("passed");
    el.querySelector(".answers").onclick = e => {
      const b = e.target.closest("[data-j]"); if (!b) return;
      const j = +b.dataset.j, ok = j === m.a;
      el.querySelectorAll(".ans").forEach(x => { x.disabled = true; const k = +x.dataset.j; if (k === m.a) x.classList.add("right"); else if (k === j) x.classList.add("wrong"); else x.classList.add("dim"); });
      verdict(el, ok, esc(m.why), ok ? "" : `<button class="ghost again">Try again</button>`);
      const a = el.querySelector(".again"); if (a) a.onclick = () => { el.querySelectorAll(".ans").forEach(x => { x.disabled = false; x.className = "ans"; }); el.querySelector(".fb").remove(); };
      if (l) noteCheck(l, key, ok);
      if (ok) el.classList.add("passed");
      refreshLessonHead();
    };
    return el;
  }
  function tapCheck(c, l, key) {
    const el = checkShell("Tap check", c.prompt);
    const bd = new Board({ films: [{ spec: c.film }], opts: Object.assign({ rules: false, zones: false, routes: true }, c.opts || {}), maxT: c.at, start: Math.min(-1.0, c.at), hideAnswer: true,
      onTap: (h) => {
        if (done) return;
        const want = LAB.who(bd.F, c.answer);
        const ok = h.kind === "def" ? want.def.includes(h.i) : want.off.includes(h.pos);
        const mark = { def: {}, off: {} };
        want.def.forEach(i => { mark.def[i] = "#4CCB83"; }); want.off.forEach(p => { mark.off[p] = "#4CCB83"; });
        if (!ok) { if (h.kind === "def") mark.def[h.i] = RED; else mark.off[h.pos] = RED; }
        bd.mark = mark; bd.setT(c.at); done = true;
        const name = h.kind === "def" ? D.META[h.id].name : h.pos;
        verdict(el, ok, `${ok ? "" : `You tapped ${esc(name)}. `}${esc(c.why)}`, ok ? "" : `<button class="ghost again">Try again</button>`);
        const a = el.querySelector(".again"); if (a) a.onclick = () => { done = false; bd.mark = null; bd.draw(); el.querySelector(".fb").remove(); };
        if (l) noteCheck(l, key, ok);
        if (ok) el.classList.add("passed");
        refreshLessonHead();
      } });
    let done = false;
    el.appendChild(bd.el);
    const go = () => { bd.setT(c.at); };
    el.insertAdjacentHTML("beforeend", `<p class="hint">Scrub or play up to the moment, then tap on the field.</p>`);
    if (key && ST.checks[key]) el.classList.add("passed");
    bd.onEnd = go;
    return el;
  }
  /* engine-graded throw: freeze at the decision, tap a receiver, then watch it */
  function throwCheck(c, l, key) {
    const el = checkShell("Throw check", c.prompt);
    let done = false;
    const bd = new Board({ films: [{ spec: c.film }], opts: { rules: false, zones: false, routes: true }, maxT: c.at, start: -0.6,
      onTap: (h) => {
        if (done || h.kind !== "off") return;
        if (bd.t < c.at - 0.02) { bd.setT(c.at); }
        const v = LAB.evalAt(bd.F, c.at); if (!v) return;
        const arr = Object.entries(v).sort((a, b) => b[1].ev - a[1].ev), best = arr[0][1].ev;
        const mine = v[h.pos]; if (!mine) return;
        const ok = mine.ev > 0 ? mine.ev >= best - 0.3 : best <= 0;
        done = true;
        const words = { catch: "caught", contested: "contested catch", int: "intercepted", breakup: "broken up", tipped: "tipped at the line", range: "out of range" };
        const bars = `<div class="evbars">${arr.map(([p, x]) => {
          const w = Math.max(2, Math.min(100, (x.ev + 1) / (Math.max(1.5, best) + 1) * 100));
          return `<div class="evb${p === h.pos ? " me" : ""}"><span class="p" style="color:${POSC[p]}">${p}</span><span class="r">${esc(bd.F.sim.players[p].route.label)}</span><i style="width:${w}%;background:${POSC[p]}"></i><span class="v">${sgn(x.ev)}</span><span class="w">${words[x.how] || x.how}</span></div>`;
        }).join("")}</div>`;
        verdict(el, ok, esc(c.why), bars + `<button class="ghost watch">Watch your throw</button>${ok ? "" : ` <button class="ghost again">Try again</button>`}`);
        el.querySelector(".watch").onclick = () => {
          const spec = Object.assign({}, c.film, { throwAt: { t: c.at, pos: h.pos, type: mine.type || "fast" } });
          bd.cfg.maxT = null; bd.setFilm(0, spec); bd.t = c.at; bd.rate = 0.5; bd.play();
        };
        const a = el.querySelector(".again"); if (a) a.onclick = () => { done = false; bd.cfg.maxT = c.at; bd.setFilm(0); bd.setT(c.at); el.querySelector(".fb").remove(); };
        if (l) noteCheck(l, key, ok);
        if (ok) el.classList.add("passed");
        refreshLessonHead();
      } });
    el.appendChild(bd.el);
    el.insertAdjacentHTML("beforeend", `<p class="hint">Play it to the decision point (it stops there), then tap the receiver you throw to. Graded by Play's own grader.</p>`);
    if (key && ST.checks[key]) el.classList.add("passed");
    return el;
  }
  function drillEl(dr) {
    const el = document.createElement("div");
    el.className = "st-drill";
    const rec = ST.drills[dr.name];
    el.innerHTML = `<div><span class="lab">Drill in Play</span><b>${esc(dr.name)}</b><p>${esc(dr.text)}</p>${rec ? `<p class="hint">Last: ${rec.n} snaps · ${sgn(rec.epa)} EPA/play${rec.idN ? ` · reads ${rec.id}/${rec.idN}` : ""}</p>` : ""}</div><button class="bigbtn">Go</button>`;
    el.querySelector("button").onclick = () => launchDrill(dr);
    return el;
  }
  function launchDrill(dr) {
    if (!window.PocketGame) return;
    if (window.PocketApp) window.PocketApp.setView("play");
    ST.returnTo = cur.view === "lesson" ? cur.id : null; save();
    window.PocketGame.drill(Object.assign({ name: dr.name }, dr.d));
  }

  /* ================= reps (generated) ================= */
  function randomRep(level, honest) {
    const r = P.makeRep(level, { personnel: "11" });
    const cid = PASS_IDS[Math.floor(Math.random() * PASS_IDS.length)];
    const spec = { cid, cov: r.cov, truth: r.truth, shown: honest ? r.truth : r.shown, press: r.press, variant: r.variant, blitzSide: r.blitzSide, flip: r.flip, pkg: r.pkg,
      declare: honest || !r.disguised ? 1.2 : (r.declareAt < 0 ? null : +(0.25 + Math.random() * 0.9).toFixed(2)), T: 1.4 };
    return spec;
  }
  function repsEl(mode, o) {
    o = Object.assign({ n: 10, level: 2 }, o);
    const el = document.createElement("div");
    el.className = "st-check st-reps";
    const title = o.title || { shell: "Shell reps", cov: "Coverage reps", thr: "Throw reps" }[mode];
    let i = 0, ok = 0, spec = null, bd = null, answered = false;
    el.innerHTML = `<div class="st-ch-h"><span class="lab">${esc(title)}</span><span class="qcount"></span></div><div class="bar"><i style="width:0%"></i></div><div class="rp-body"></div>`;
    const body = el.querySelector(".rp-body");
    const start = () => { i = 0; ok = 0; next(); };
    function next() {
      answered = false;
      el.querySelector(".qcount").textContent = `${i + 1} / ${o.n}`;
      el.querySelector(".bar i").style.width = (100 * i / o.n) + "%";
      body.innerHTML = "";
      if (mode === "thr") {
        let s; for (let k = 0; k < 20; k++) { s = randomRep(o.level, true); s.T = 3.2; s.cid = PASS_IDS[Math.floor(Math.random() * PASS_IDS.length)]; s.pocket = "clean"; s.declare = 1.2; s.shown = s.truth;
          try { const F = film(s); if (LAB.evalAt(F, F.tTop)) break; } catch (e) { } }
        spec = s;
        const F = film(spec);
        body.insertAdjacentHTML("beforeend", `<p class="st-q">${esc(CBYID[spec.cid].name)}. Watch to the top of the drop, then tap the throw.</p>`);
        bd = new Board({ films: [{ spec }], opts: { rules: false, zones: false, routes: true }, maxT: F.tTop, start: -0.8, hideAnswer: true,
          onTap: h => {
            if (answered || h.kind !== "off") return;
            const v = LAB.evalAt(bd.F, F.tTop); if (!v) return;
            const arr = Object.entries(v).sort((a, b) => b[1].ev - a[1].ev), best = arr[0][1].ev, mine = v[h.pos];
            if (!mine) return;
            answered = true; bd.setT(F.tTop);
            const good = mine.ev > 0 ? mine.ev >= best - 0.3 : best <= 0;
            if (good) ok++;
            ST.reps.thr.n++; if (good) ST.reps.thr.ok++; ST.reps.thr.gap += Math.max(0, best - mine.ev); touchDay(); save();
            const bars = `<div class="evbars">${arr.map(([p, x]) => `<div class="evb${p === h.pos ? " me" : ""}"><span class="p" style="color:${POSC[p]}">${p}</span><span class="r">${esc(F.sim.players[p].route.label)}</span><i style="width:${Math.max(2, Math.min(100, (x.ev + 1) / (Math.max(1.5, best) + 1) * 100))}%;background:${POSC[p]}"></i><span class="v">${sgn(x.ev)}</span></div>`).join("")}</div>`;
            verdict(body, good, `They played ${esc(D.COV[spec.cov].label)}. ${good ? "That throw was worth as much as the best one available." : `The best throw was ${arr[0][0]} (${esc(F.sim.players[arr[0][0]].route.label.toLowerCase())}).`}`,
              bars + `<button class="ghost watch">Watch your throw</button> <button class="bigbtn nx">${i + 1 < o.n ? "Next" : "Finish"}</button>`);
            body.querySelector(".watch").onclick = () => { bd.cfg.maxT = null; bd.setFilm(0, Object.assign({}, spec, { throwAt: { t: F.tTop, pos: h.pos, type: mine.type || "fast" } })); bd.t = F.tTop; bd.play(); };
            body.querySelector(".nx").onclick = advance;
          } });
        body.appendChild(bd.el);
        bd.onEnd = () => { };
        setTimeout(() => bd.play(), 300);
        return;
      }
      spec = randomRep(o.level, mode === "shell" && o.level <= 1);
      bd = new Board({ films: [{ spec }], opts: { rules: false, zones: false, routes: false, depth: o.level <= 1 }, start: -1.4, maxT: 0.9, hideAnswer: true, noTransport: false });
      body.appendChild(bd.el);
      const truth = D.COV[spec.cov];
      if (mode === "shell") {
        body.insertAdjacentHTML("beforeend", `<p class="st-q">Count the deep safeties after the snap.</p><div class="answers three">${[2, 1, 0].map(k => `<button class="ans" data-k="${k}">${["None", "One", "Two"][k]} deep</button>`).join("")}</div>`);
        body.querySelector(".answers").onclick = e => {
          const b = e.target.closest("[data-k]"); if (!b || answered) return;
          answered = true; const k = +b.dataset.k, good = k === truth.deep; if (good) ok++;
          ST.reps.shell.n++; if (good) ST.reps.shell.ok++; touchDay(); save();
          body.querySelectorAll(".ans").forEach(x => { x.disabled = true; if (+x.dataset.k === truth.deep) x.classList.add("right"); else if (x === b) x.classList.add("wrong"); else x.classList.add("dim"); });
          bd.cfg.maxT = 1.4; bd.setFilm(0); bd.cfg.hideAnswer = false; bd.setT(0.9);
          verdict(body, good, `${D.DEEP_NAME[truth.deep]}: ${esc(truth.label)}. ${tellText(spec)}`, `<button class="bigbtn nx">${i + 1 < o.n ? "Next" : "Finish"}</button>`);
          body.querySelector(".nx").onclick = advance;
        };
      } else {
        body.insertAdjacentHTML("beforeend", `<p class="st-q">Watch through the snap, then name the coverage.</p><div class="readgrid">${READ_GROUPS.map(g => `<div class="rg"><span class="rgl">${g.label}</span><div class="chips wrap">${g.covs.map(k => `<button class="chip toggle" data-cov="${k}">${esc(covName(k))}</button>`).join("")}</div></div>`).join("")}</div>`);
        body.querySelector(".readgrid").onclick = e => {
          const b = e.target.closest("[data-cov]"); if (!b || answered) return;
          answered = true; const k = b.dataset.cov, good = k === spec.cov, fam = D.COV[k].deep === truth.deep;
          if (good) ok++;
          ST.reps.cov.n++; if (good) ST.reps.cov.ok++; if (fam) ST.reps.cov.fam++; touchDay(); save();
          body.querySelectorAll("[data-cov]").forEach(x => { x.disabled = true; if (x.dataset.cov === spec.cov) x.classList.add("rightc"); else if (x === b) x.classList.add("wrongc"); });
          bd.cfg.maxT = 1.4; bd.setFilm(0); bd.cfg.hideAnswer = false; bd.opts.zones = true; bd.opts.rules = true; bd.setT(1.2);
          verdict(body, good, `${esc(truth.label)}.${!good && fam ? " You had the shell right." : ""} ${tellText(spec)}`, `<button class="bigbtn nx">${i + 1 < o.n ? "Next" : "Finish"}</button>`);
          body.querySelector(".nx").onclick = advance;
        };
      }
      setTimeout(() => bd.play(), 300);
    }
    function advance() {
      i++;
      if (i < o.n) { next(); return; }
      el.querySelector(".bar i").style.width = "100%";
      body.innerHTML = `<div class="fb ${ok >= Math.ceil(o.n * 0.6) ? "ok" : "no"}"><div class="verdict">${ok} of ${o.n}</div>${ok >= Math.ceil(o.n * 0.6) ? "Good set." : "Run another set; 60% passes."}</div><button class="ghost again">Another set</button>`;
      body.querySelector(".again").onclick = start;
      if (o.onDone) o.onDone(ok, o.n);
      refreshLessonHead();
    }
    body.innerHTML = `<button class="bigbtn">Start</button>`;
    body.querySelector("button").onclick = start;
    return el;
  }
  /* what gave it away, in the words of the tells table */
  function tellText(spec) {
    const disg = spec.shown !== spec.truth;
    const T = {
      c2: "Two safeties wide at 12 to 14, corners shallow and sitting.", tampa2: "A Cover 2 shell; the Mike opened and ran the middle at the snap.",
      c4: "Safeties at about 11 near the hashes, corners off with inside leverage.", c6: "The two corners differ: one shallow (half side), one off (quarters side).",
      m2: "Two high with everyone underneath tight on a receiver.", c1: "One high, everyone else on a receiver.",
      c3sky: "One high; the strong safety went to the flat.", c3buzz: "One high; the strong safety dropped to the hook and the nickel or a linebacker took the flat.",
      fire: "One high with five rushing: three under, three deep.", c0: "Nobody deep; six rushing, everyone else in man."
    }[spec.cov] || "";
    return (disg ? `They showed ${D.SHELL[spec.shown].label.toLowerCase()}${spec.declare == null ? " and rotated at the snap" : " and rotated late"}. ` : "") + T;
  }

  /* ================= widgets ================= */
  function widget(name, args) {
    const el = document.createElement("div");
    el.className = "st-widget";
    const W = WIDGETS[name];
    if (W) W(el, args); else el.textContent = "";
    return el;
  }
  const segHTML = (id, items, cur) => `<div class="seg wrapseg" data-seg="${id}">${items.map(([k, n]) => `<button data-v="${k}" aria-pressed="${k === cur}">${esc(n)}</button>`).join("")}</div>`;
  const onSeg = (el, id, fn) => el.querySelector(`[data-seg="${id}"]`).addEventListener("click", e => { const b = e.target.closest("[data-v]"); if (!b) return; el.querySelectorAll(`[data-seg="${id}"] [data-v]`).forEach(x => x.setAttribute("aria-pressed", x === b)); fn(b.dataset.v); });
  const BUCKETS = [["early", "1st/2nd down"], ["3s", "3rd & 1-3"], ["3m", "3rd & 4-6"], ["3l", "3rd & 7+"], ["red", "Red zone"], ["goal", "Goal line"], ["two", "2-minute"]];
  const barRow = (label, v, max, txt, col) => `<div class="hb"><span class="hl">${label}</span><span class="ht"><i style="width:${Math.max(1, 100 * v / max)}%;${col ? "background:" + col : ""}"></i></span><span class="hv">${txt}</span></div>`;
  const WIDGETS = {
    pkgByPers(el) {
      let pers = "11";
      const render = () => {
        const T = CAL.pkg[pers];
        el.querySelector(".wb").innerHTML = `<div class="tblwrap"><table class="timing"><thead><tr><th>Situation</th><th class="r">Base</th><th class="r">Nickel</th><th class="r">Dime</th></tr></thead><tbody>${BUCKETS.filter(([k]) => T[k]).map(([k, n]) => {
          const r = T[k], mx = Math.max(r.base || 0, r.nickel || 0, r.dime || 0);
          return `<tr><td>${n}</td>${["base", "nickel", "dime"].map(p => `<td class="m${(r[p] || 0) === mx ? " hi" : ""}">${pct(r[p] || 0)}</td>`).join("")}</tr>`;
        }).join("")}</tbody></table></div>`;
      };
      el.innerHTML = `<div class="wh"><span class="lab">Defensive package vs your personnel</span>${segHTML("pers", [["11", "11"], ["12", "12"], ["21", "21"], ["10", "10"]], pers)}</div><div class="wb"></div><p class="foot">NFL regular seasons 2023-2025 (nflverse participation data). Share of snaps.</p>`;
      onSeg(el, "pers", v => { pers = v; render(); }); render();
    },
    boxRuns(el) {
      const R = CAL.runBox, ks = Object.keys(R).filter(k => R[k].n >= 300).sort((a, b) => a - b);
      const mx = Math.max(...ks.map(k => R[k].ypc));
      el.innerHTML = `<div class="wh"><span class="lab">Yards per carry by box count</span></div><div class="hbars">${ks.map(k => barRow(k + " in box", R[k].ypc, mx, `${R[k].ypc.toFixed(1)} ypc · stuffed ${pct(R[k].stuff)}`)).join("")}</div><p class="foot">NFL runs 2023-2025; stuffed = no gain or a loss.</p>`;
    },
    gaps(el) {
      // offensive line and tight end, with gaps and techniques, drawn left to right
      const x0 = 30, sp = 52, y = 70, OL = ["LT", "LG", "C", "RG", "RT", "TE"];
      let g = "";
      OL.forEach((n, i) => { const x = x0 + i * sp; g += `<rect x="${x - 15}" y="${y - 15}" width="30" height="30" rx="4" class="ol"/><text x="${x}" y="${y + 4}" class="oln">${n}</text>`; });
      const gx = [[2.5, "A"], [1.5, "B"], [0.5, "C"]];
      // right side gaps (from the center): A between C and RG, B between RG and RT, C between RT and TE, D outside the TE
      [["A", 2.5], ["B", 3.5], ["C", 4.5], ["D", 5.5]].forEach(([n, k]) => { const x = x0 + k * sp; g += `<text x="${x}" y="${y + 52}" class="gap">${n}</text>`; });
      [["A", 1.5], ["B", 0.5], ["C", -0.5]].forEach(([n, k]) => { const x = x0 + k * sp; if (x > 6) g += `<text x="${x}" y="${y + 52}" class="gap">${n}</text>`; });
      // techniques on the right side
      const techs = [["0", 2, 0], ["1", 2, 0.4], ["2i", 3, -0.35], ["2", 3, 0], ["3", 3, 0.4], ["4i", 4, -0.35], ["4", 4, 0], ["5", 4, 0.4], ["7", 5, -0.35], ["6", 5, 0], ["9", 5, 0.75]];
      techs.forEach(([n, i, o]) => { const x = x0 + (i + o) * sp; g += `<circle cx="${x}" cy="${y - 38}" r="11" class="tc"/><text x="${x}" y="${y - 34}" class="tcn">${n}</text>`; });
      el.innerHTML = `<div class="wh"><span class="lab">Gaps and techniques</span><span class="hint">One side shown; the other mirrors it</span></div>
        <svg viewBox="0 0 ${x0 * 2 + 5 * sp + 30} 140" class="gapsvg" role="img" aria-label="Gaps A to D and defensive techniques 0 to 9">${g}</svg>
        <p class="foot">Even numbers head-up, odd numbers on the outside shoulder, "i" on the inside shoulder. A 3-technique sits on the guard's outside shoulder (B gap); a 5 on the tackle's outside shoulder (C gap). Numbering differs a little between staffs.</p>`;
    },
    covTree(el) {
      const L = CAL.covLeague, mx = Math.max(...Object.values(L));
      el.innerHTML = `<div class="wh"><span class="lab">Coverage families and how often NFL defenses called them</span></div>${READ_GROUPS.map(g => `<div class="ctree"><div class="cth">${g.label} <span class="hint">${pct(g.covs.reduce((s, k) => s + (L[k] || 0), 0))}</span></div><div class="hbars">${g.covs.map(k => barRow(esc(covName(k)), L[k] || 0, mx, pct(L[k] || 0, 1))).join("")}</div></div>`).join("")}
        <p class="foot">FTN charting via nflverse, 2023-2025, all pass plays. Cover 3 Sky and Buzz, and Cover 2 and Tampa 2, are split by assumption (see Phase 7).</p>`;
    },
    covBySit(el) {
      let pkg = "nickel";
      const render = () => {
        const T = CAL.cov[pkg];
        const ks = ["c0", "c1", "c3sky", "c3buzz", "fire", "c2", "tampa2", "m2", "c4", "c6"];
        el.querySelector(".wb").innerHTML = `<div class="tblwrap"><table class="timing heat"><thead><tr><th>Situation</th>${ks.map(k => `<th class="r">${esc(covName(k).replace("Cover ", "C").replace("Fire zone", "Fire").replace("Tampa 2", "T2").replace(" Sky", "S").replace(" Buzz", "B"))}</th>`).join("")}</tr></thead><tbody>${BUCKETS.filter(([k]) => T[k]).map(([b, n]) => {
          const r = T[b], mx = Math.max(...ks.map(k => r[k] || 0));
          return `<tr><td>${n}</td>${ks.map(k => { const v = r[k] || 0; return `<td class="m" style="background:rgba(55,198,219,${(0.55 * v / mx).toFixed(2)})">${v ? Math.round(100 * v) : "·"}</td>`; }).join("")}</tr>`;
        }).join("")}</tbody></table></div>`;
      };
      el.innerHTML = `<div class="wh"><span class="lab">Coverage calls by situation (%)</span>${segHTML("pkg", [["base", "Base"], ["nickel", "Nickel"], ["dime", "Dime"]], pkg)}</div><div class="wb"></div>
        <p class="foot">C0 Cover 0, C1 Cover 1, C3S/C3B Cover 3 Sky/Buzz, Fire fire zone, C2 Cover 2, T2 Tampa 2, 2-Man, C4 quarters, C6 Cover 6. Rows sum to about 100.</p>`;
      onSeg(el, "pkg", v => { pkg = v; render(); }); render();
    },
    rushers(el) {
      const R = CAL.rushers, ks = Object.keys(R).sort((a, b) => a - b);
      el.innerHTML = `<div class="tblwrap"><table class="timing"><thead><tr><th>Rushers</th><th class="r">Share</th><th class="r">Pressure</th><th class="r">Sack</th><th class="r">Time to throw</th><th class="r">EPA/play</th></tr></thead><tbody>${(() => {
        const tot = ks.reduce((s, k) => s + R[k].n, 0);
        return ks.map(k => `<tr><td class="k">${k}</td><td class="m">${pct(R[k].n / tot)}</td><td class="m">${pct(R[k].press)}</td><td class="m">${pct(R[k].sack, 1)}</td><td class="m">${R[k].ttt.toFixed(1)} s</td><td class="m">${sgn(R[k].epa)}</td></tr>`).join("");
      })()}</tbody></table></div><p class="foot">NFL dropbacks 2023-2025, FTN charting via nflverse. EPA is the offense's.</p>`;
    },
    prot(el, args) {
      let slide = null, keep = false;
      el.innerHTML = `<div class="wh"><span class="lab">Set the protection</span></div>
        <div class="protrow"><div class="seg" data-seg="slide"><button data-v="L">Slide left</button><button data-v="R">Slide right</button></div><button class="chip toggle" data-keep aria-pressed="false">Keep RB in</button></div>
        <div class="pr-out"></div><div class="pr-board"></div>`;
      const host = el.querySelector(".pr-board");
      let bd = null;
      const render = () => {
        const spec = Object.assign({}, args.spec, { prot: slide ? { slide, keepRB: keep } : (keep ? { slide: "R", keepRB: true } : undefined), T: 2.6 });
        const F = film(spec);
        if (!slide) { slide = F.G.prot.slide; el.querySelectorAll('[data-seg="slide"] [data-v]').forEach(x => x.setAttribute("aria-pressed", x.dataset.v === slide)); }
        const pl = F.plan, rush = F.defs.filter(d => d.rush).length, blk = 5 + (keep ? 1 : 0);
        const side = id => { const i = F.defs.findIndex(d => d.id === id); return F.pre[F.pre.length - 1].defs[i].x < D.FW / 2 ? "left" : "right"; };
        el.querySelector(".pr-out").innerHTML = `<div class="stats3"><div class="stat"><div class="v">${rush}</div><div class="k">rushers</div></div><div class="stat"><div class="v">${blk}</div><div class="k">blockers</div></div><div class="stat"><div class="v ${pl.freeId ? "bad" : "good"}">${pl.sackT.toFixed(1)} s</div><div class="k">${pl.freeId ? "free rusher arrives" : "pocket holds"}</div></div></div>
          <p class="note">${pl.freeId ? `The ${esc(D.META[pl.freeId].name.toLowerCase())} comes free from the ${side(pl.freeId)}. The ball has to be out before ${pl.sackT.toFixed(1)} seconds.` : `Everyone is blocked. ${keep ? "The back stays in, so you have four routes." : ""}`}</p>`;
        if (!bd) { bd = new Board({ films: [{ spec }], opts: { rules: false, zones: false, routes: true }, start: -0.4 }); host.appendChild(bd.el); }
        else { bd.cfg.films = [{ spec }]; bd.setFilm(0); }
        bd.hl = pl.freeId ? { free: true } : null;
        bd.setT(Math.min(pl.sackT - 0.2, 1.0));
      };
      onSeg(el, "slide", v => { slide = v; render(); });
      el.querySelector("[data-keep]").onclick = e => { keep = !keep; e.currentTarget.setAttribute("aria-pressed", keep); render(); };
      setTimeout(render, 0);
    },
    drops(el) {
      const rows = Object.entries(B.DROPS).map(([k, d]) => `<tr><td class="k">${esc(d.label)}</td><td class="m">${d.t.toFixed(1)} s</td><td class="m">${d.depth.toFixed(1)} yd</td><td>${esc(B.CONCEPTS.filter(c => c.drop === k && c.kind !== "run").slice(0, 4).map(c => c.name).join(", "))}</td></tr>`).join("");
      el.innerHTML = `<div class="wh"><span class="lab">Drops in this game</span></div><div class="tblwrap"><table class="timing"><thead><tr><th>Drop</th><th class="r">Top</th><th class="r">Depth</th><th>Used by</th></tr></thead><tbody>${rows}</tbody></table></div>
        <p class="foot">Top = time from the snap to the top of the drop. NFL average time to throw was ${CAL.dropback.ttt.toFixed(1)} s on all dropbacks, ${CAL.pa.ttt.toFixed(1)} s on play-action (2023-2025).</p>`;
    },
    cost(el) {
      let down = 2, togo = 8, yl = 50;
      const render = () => {
        const s = { down, togo, yl };
        const rows = [["Complete, +15", P.epa(s, Math.min(15, yl), "comp")], ["Complete, first down", P.epa(s, Math.min(togo, yl), "comp")], ["Complete, +4", P.epa(s, Math.min(4, yl), "comp")],
          ["Incomplete / throwaway", P.epa(s, 0, "inc")], ["Sack, −7", P.epa(s, -7, "comp")], ["Interception at the catch point (+12)", P.epa(s, 12, "int")]];
        const mx = Math.max(...rows.map(r => Math.abs(r[1])));
        el.querySelector(".wb").innerHTML = `<p class="note">Expected points now: <b>${P.ep(down, togo, yl).toFixed(2)}</b></p><div class="hbars two">${rows.map(([n, v]) => `<div class="hb2"><span class="hl">${n}</span><span class="neg">${v < 0 ? `<i style="width:${100 * -v / mx}%"></i>` : ""}</span><span class="pos">${v >= 0 ? `<i style="width:${100 * v / mx}%"></i>` : ""}</span><span class="hv">${sgn(v)}</span></div>`).join("")}</div>`;
      };
      el.innerHTML = `<div class="wh"><span class="lab">What each outcome costs (EPA)</span></div>
        <div class="ctlrow"><label>Down ${segHTML("down", [[1, "1st"], [2, "2nd"], [3, "3rd"]], down)}</label>
        <label>To go <input type="range" min="1" max="20" value="${togo}" data-in="togo"><span class="iv">${togo}</span></label>
        <label>Yards to goal <input type="range" min="10" max="95" value="${yl}" data-in="yl"><span class="iv">${yl}</span></label></div><div class="wb"></div>
        <p class="foot">nflverse expected-points model, averaged by down, distance and field position (the same table Play scores with).</p>`;
      el.querySelector('[data-seg="down"]').addEventListener("click", e => { const b = e.target.closest("[data-v]"); if (!b) return; down = +b.dataset.v; el.querySelectorAll('[data-seg="down"] [data-v]').forEach(x => x.setAttribute("aria-pressed", x === b)); render(); });
      el.querySelectorAll("[data-in]").forEach(inp => inp.addEventListener("input", () => { if (inp.dataset.in === "togo") togo = +inp.value; else yl = +inp.value; togo = Math.min(togo, yl); inp.nextElementSibling.textContent = inp.value; render(); }));
      render();
    },
    epCurve(el) {
      const W = 340, H = 140, L = 28, R = 8, T = 8, Bm = 22;
      const pts = []; for (let yl = 99; yl >= 1; yl -= 1) pts.push([yl, P.ep(1, Math.min(10, yl), yl)]);
      const ymin = Math.floor(Math.min(...pts.map(p => p[1]))), ymax = Math.ceil(Math.max(...pts.map(p => p[1])));
      const X = yl => L + (99 - yl) / 98 * (W - L - R), Y = v => T + (ymax - v) / (ymax - ymin) * (H - T - Bm);
      let g = "";
      for (let v = ymin; v <= ymax; v++) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="${v === 0 ? "z" : "g"}"/><text x="${L - 4}" y="${Y(v) + 3}" class="yl">${v}</text>`;
      for (const yl of [90, 75, 50, 25, 10]) g += `<text x="${X(yl)}" y="${H - 6}" class="xl">${yl > 50 ? "Own " + (100 - yl) : (yl === 50 ? "50" : "Opp " + yl)}</text>`;
      g += `<polyline points="${pts.map(([a, b]) => X(a).toFixed(1) + "," + Y(b).toFixed(1)).join(" ")}" fill="none" stroke="${TEAL}" stroke-width="2.4"/>`;
      el.innerHTML = `<div class="wh"><span class="lab">Expected points, first and 10, by field position</span></div><svg viewBox="0 0 ${W} ${H}" class="evsvg">${g}</svg>`;
    },
    go4(el) {
      const tb = [["1", 0], ["2-3", 1], ["4-6", 2], ["7+", 3]], yb = [[9, "Own 1-10"], [7, "Own 21-30"], [5, "Opp 41-50"], [4, "Opp 31-40"], [3, "Opp 21-30"], [2, "Opp 11-20"], [1, "Opp 1-10"]];
      el.innerHTML = `<div class="wh"><span class="lab">How often NFL coaches went for it on fourth down</span></div><div class="tblwrap"><table class="timing heat"><thead><tr><th>Field</th>${tb.map(([n]) => `<th class="r">4th & ${n}</th>`).join("")}</tr></thead><tbody>${yb.map(([y, n]) => `<tr><td>${n}</td>${tb.map(([, t]) => { const v = CAL.go4[t + "-" + y]; return `<td class="m" style="background:rgba(55,198,219,${v == null ? 0 : (0.6 * v).toFixed(2)})">${v == null ? "·" : Math.round(100 * v) + "%"}</td>`; }).join("")}</tr>`).join("")}</tbody></table></div>
        <p class="foot">NFL regular seasons 2023-2025, all fourth downs that were run, passed, punted or kicked. "·" = fewer than 25 cases.</p>`;
    },
    pair(el) {
      const pass = B.CONCEPTS.filter(c => c.kind !== "run");
      let call = "smash", kill = "stick", pkg = "nickel", bucket = "early";
      const ks = ["c0", "c1", "c3sky", "c3buzz", "fire", "c2", "tampa2", "m2", "c4", "c6"];
      const beats = (c, k) => c.beats.includes(k) || c.beats.includes(D.COV[k].fam), weak = (c, k) => c.weak.includes(k) || c.weak.includes(D.COV[k].fam);
      const sel = (id, v) => `<select class="teamsel" data-sel="${id}">${pass.map(c => `<option value="${c.id}"${c.id === v ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select>`;
      el.innerHTML = `<div class="wh"><span class="lab">Call and kill</span></div><div class="pairsel"><label><span class="lab">Call</span>${sel("call", call)}</label><label><span class="lab">Kill</span>${sel("kill", kill)}</label></div>
        <div class="ctlrow">${segHTML("pb", BUCKETS.slice(0, 5).map(([k, n]) => [k, n]), bucket)}</div><div class="wb"></div>`;
      const render = () => {
        const A = CBYID[call], K = CBYID[kill], mix = (CAL.cov[pkg] && CAL.cov[pkg][bucket]) || CAL.covLeague;
        const cell = (c, k) => beats(c, k) ? `<td class="m good">built for</td>` : (weak(c, k) ? `<td class="m bad">struggles</td>` : `<td class="m">·</td>`);
        let cov = 0; for (const k of ks) if (beats(A, k) || beats(K, k)) cov += mix[k] || 0;
        const g = P.killGrade(A, K);
        el.querySelector(".wb").innerHTML = `<div class="tblwrap"><table class="timing"><thead><tr><th>Coverage</th><th class="r">NFL share</th><th class="r">${esc(A.name)}</th><th class="r">${esc(K.name)}</th></tr></thead><tbody>${ks.map(k => `<tr><td>${esc(covName(k))}</td><td class="m">${pct(mix[k] || 0)}</td>${cell(A, k)}${cell(K, k)}</tr>`).join("")}</tbody></table></div>
          <div class="hbars">${barRow("Covered", cov, 1, pct(cov) + " of calls", cov > 0.6 ? "var(--good)" : "var(--alert)")}</div>
          <p class="fb ${g.ok ? "ok" : "no"}" style="margin:8px 0 0">${esc(g.text)}</p>`;
      };
      el.querySelectorAll("[data-sel]").forEach(s => s.addEventListener("change", () => { if (s.dataset.sel === "call") call = s.value; else kill = s.value; render(); }));
      onSeg(el, "pb", v => { bucket = v; pkg = v === "3l" ? "dime" : "nickel"; render(); });
      render();
    },
    selfScout(el) {
      let S = {}; try { S = JSON.parse(localStorage.getItem("pocket.play.v1") || "{}"); } catch (e) { }
      const R = ST.reps;
      const drops = (S.att || 0) + (S.sack || 0);
      const rows = [];
      const nfl = { sack: CAL.dropback.sack };
      if (S.reps) {
        rows.push(["Snaps", S.reps, ""]);
        rows.push(["EPA per play", sgn(S.epa / S.reps), "NFL passes averaged about +0.05"]);
        if (S.att) rows.push(["Completion", pct(S.comp / S.att), "NFL about 64%"]);
        if (drops) rows.push(["Sack rate", pct(S.sack / drops, 1), `NFL ${pct(nfl.sack, 1)} of dropbacks`]);
        if (S.att) rows.push(["Interceptions", pct(S.int / S.att, 1) + " of throws", "NFL about 2.3%"]);
        if (S.idN) rows.push(["Coverage reads at the line", pct(S.idOk / S.idN), ""]);
        if (S.readN) rows.push(["Read gap", (S.readGap / S.readN).toFixed(2) + " EPA", "best available minus yours, per throw"]);
      }
      if (R.cov.n) rows.push(["Coverage reps", `${R.cov.ok}/${R.cov.n}`, `shell right ${pct(R.cov.fam / R.cov.n)}`]);
      if (R.thr.n) rows.push(["Throw reps", `${R.thr.ok}/${R.thr.n}`, `average gap ${(R.thr.gap / R.thr.n).toFixed(2)} EPA`]);
      const tips = [];
      if (S.idN >= 10 && S.idOk / S.idN < 0.6) tips.push(["Coverage reads are under 60%.", "l26"]);
      if (drops >= 15 && S.sack / drops > 0.09) tips.push(["You take sacks more often than the NFL average: check the protection and the hot throw.", "l42"]);
      if (S.att >= 15 && S.int / S.att > 0.035) tips.push(["Interceptions are high. Know what each mistake costs.", "l72"]);
      if (S.readN >= 10 && S.readGap / S.readN > 0.6) tips.push(["The read gap is large: the better throw was there. Work the conflict-defender lessons.", "l51"]);
      if (R.thr.n >= 10 && R.thr.ok / R.thr.n < 0.6) tips.push(["Throw reps under 60%: drill timing.", "l61"]);
      el.innerHTML = `<div class="wh"><span class="lab">Your tendencies</span></div>${rows.length ? `<div class="tblwrap"><table class="timing"><tbody>${rows.map(r => `<tr><td class="k">${r[0]}</td><td class="m">${r[1]}</td><td class="sub">${esc(r[2])}</td></tr>`).join("")}</tbody></table></div>` : `<p class="note">No snaps yet. Play some snaps or run the reps, then come back.</p>`}
        ${tips.length ? `<div class="tips">${tips.map(([t, id]) => `<button class="tip" data-open="${id}"><span>${esc(t)}</span><b>${esc(LBYID[id].title)} ›</b></button>`).join("")}</div>` : (rows.length ? `<p class="note">Nothing stands out against the thresholds. Raise the level in Play.</p>` : "")}
        <p class="foot">NFL references are approximate league-wide averages for 2023-2025 dropbacks.</p>`;
    },
    routine(el) {
      el.innerHTML = `<ol class="routine">${SC.ROUTINE.map(([h, t], i) => `<li><button class="rt-h" aria-expanded="false"><span class="num">${i + 1}</span><b>${esc(h)}</b></button><p hidden>${esc(t)}</p></li>`).join("")}</ol><p class="hint">Say each step before you open it.</p>`;
      el.querySelectorAll(".rt-h").forEach(b => b.onclick = () => { const p = b.nextElementSibling; p.hidden = !p.hidden; b.setAttribute("aria-expanded", !p.hidden); });
    },
    week(el) {
      el.innerHTML = `<div class="week">${SC.WEEK.map(d => `<div class="wday"><div class="wd"><b>${d.day}</b></div><div class="wf">${esc(d.focus)}</div><div class="wi">${d.items.map(([k, n]) => `<button class="witem" data-k="${k}" data-n="${esc(n)}">${esc(n)}</button>`).join("")}</div></div>`).join("")}</div>`;
      el.onclick = e => {
        const b = e.target.closest(".witem"); if (!b) return;
        const k = b.dataset.k, n = b.dataset.n;
        if (k === "drill") { const dr = allDrills().find(d => d.name === n); if (dr) launchDrill(dr); }
        else if (k === "film") show({ view: "film" });
        else if (k === "reps") show({ view: "reps", mode: /Throw/.test(n) ? "thr" : "cov" });
        else if (k === "play") { if (window.PocketApp) window.PocketApp.setView("play"); }
        else if (k === "lesson") show(/Self/.test(n) ? { view: "lesson", id: "l83" } : { view: "lesson", id: nextLesson("p2").id });
      };
    }
  };
  function allDrills() {
    const out = [];
    for (const l of LESSONS) for (const b of l.blocks) if (b.drill) out.push(b.drill);
    return out;
  }
  function nextLesson(phaseId) {
    const pool = phaseId ? LESSONS.filter(l => l.phase.id === phaseId) : LESSONS;
    return pool.find(l => !ST.done[l.id]) || pool[0];
  }

  /* ================= views ================= */
  const root = () => $("studyRoot");
  let cur = { view: "home" };
  function show(v) {
    cur = v;
    for (const b of BOARDS) b.pause();
    BOARDS.clear();
    const r = root(); r.innerHTML = "";
    if (v.view === "lesson") renderLesson(r, LBYID[v.id] || LESSONS[0]);
    else if (v.view === "film") renderFilm(r);
    else if (v.view === "reps") renderReps(r, v.mode);
    else if (v.view === "coaches") renderCoaches(r);
    else if (v.view === "coach") renderCoach(r, v.id);
    else renderHome(r);
    if (v.view !== "home") window.scrollTo({ top: 0 });
  }
  function phaseProgress(ph) { const n = ph.lessons.length, d = ph.lessons.filter(l => ST.done[l.id]).length; return { n, d }; }
  function renderHome(r) {
    const nx = nextLesson();
    const total = LESSONS.length, done = LESSONS.filter(l => ST.done[l.id]).length;
    const week = ST.days.filter(d => (Date.now() - new Date(d + "T12:00:00").getTime()) < 7 * 864e5).length;
    const R = ST.reps;
    const drillMsg = ST.lastDrill ? `<div class="st-toast"><span class="lab">Last drill</span><b>${esc(ST.lastDrill.name)}</b> · ${ST.lastDrill.n} snaps · ${sgn(ST.lastDrill.epa)} EPA/play${ST.lastDrill.idN ? ` · coverage reads ${ST.lastDrill.id}/${ST.lastDrill.idN}` : ""}</div>` : "";
    r.innerHTML = `
      <div class="st-hero">
        <div class="eyebrow">QB development plan</div>
        <h2>Read it, then rep it</h2>
        <p>Eight phases, from the language of the field to the game plan. Every film runs on the same engine as Play, every throw check is graded by Play's grader, and every drill opens Play with the lesson's slice of the NFL call sheet.</p>
        <div class="st-prog"><div class="bar"><i style="width:${100 * done / total}%"></i></div><span>${done} of ${total} lessons · studied ${week} day${week === 1 ? "" : "s"} this week</span></div>
      </div>
      ${drillMsg}
      <div class="st-today panel">
        <div class="phead"><h3>Today</h3><span class="hint">About 20 minutes</span></div>
        <button class="st-next" data-open="${nx.id}"><span class="lab">Phase ${nx.phase.n} · ${esc(nx.phase.title)}</span><b>${esc(nx.title)}</b><span class="why">${esc(nx.why)}</span><span class="go">${ST.done[nx.id] ? "Review" : lessonState(nx) === "started" ? "Continue" : "Start"} · ${nx.mins} min ›</span></button>
        <div class="st-tools">
          <button class="tool" data-reps="cov"><b>Coverage reps</b><span>${R.cov.n ? `${pct(R.cov.ok / R.cov.n)} of ${R.cov.n}` : "Name it after the snap"}</span></button>
          <button class="tool" data-reps="thr"><b>Throw reps</b><span>${R.thr.n ? `${pct(R.thr.ok / R.thr.n)} of ${R.thr.n}` : "Tap the throw on time"}</span></button>
          <button class="tool" data-film><b>Film room</b><span>Any play, any coverage</span></button>
        </div>
      </div>
      ${coachCard()}
      <div class="st-phases">${SC.PHASES.map(ph => { const p = phaseProgress(ph); return `
        <div class="phase panel">
          <div class="ph-h"><span class="ph-n">${ph.n}</span><div><b>${esc(ph.title)}</b><p>${esc(ph.goal)}</p></div><span class="ph-p">${p.d}/${p.n}</span></div>
          <div class="ph-l">${ph.lessons.map(l => { const s = lessonState(l); return `<button class="lrow ${s}" data-open="${l.id}"><span class="dot"></span><span class="lt">${esc(l.title)}${coachOn() && coachOn().notes[l.id] ? ` <span class="cmark" title="${esc(coachOn().name)} has a note here">${esc(initials(coachOn().name))}</span>` : ""}</span><span class="lm">${l.mins} min</span></button>`; }).join("")}</div>
        </div>`; }).join("")}</div>`;
  }
  const initials = n => n.split(/\s+/).filter(w => /^[A-Z]/.test(w)).map(w => w[0]).join("").slice(0, 3);
  function coachCard() {
    const c = coachOn();
    if (!c) return `<div class="st-coach panel"><div class="pbody"><span class="lab">Coach's lens</span><b>Off</b>
      <p class="note">Step into one of 50 coaches' approach to scheming and teaching. His notes appear only in the lessons where he has something to say; the concepts stay the same.</p>
      <button class="ghost" data-coaches>Choose a coach</button></div></div>`;
    const n = Object.keys(c.notes).length;
    return `<div class="st-coach panel on"><div class="pbody"><span class="lab">Coach's lens · ${SIDE[c.side]} · ${LVL[c.lvl]}</span><b>${esc(c.name)}</b>
      <p class="note">${esc(c.known)}</p><p class="hint">Notes in ${n} lesson${n === 1 ? "" : "s"}, marked ${esc(initials(c.name))} below.</p>
      <div class="resbtns"><button class="ghost" data-coach="${c.id}">His page</button><button class="ghost" data-coaches>Change</button><button class="ghost" data-lensoff>Turn off</button></div></div></div>`;
  }
  function lessonCoach(l) {
    const c = coachOn();
    if (!c) return "";
    const t = c.notes[l.id];
    if (!t) return "";
    return `<div class="st-cnote"><span class="lab">Through ${esc(c.name)}'s lens <button class="linkbtn" data-coach="${c.id}">his page</button></span><p>${esc(t)}</p></div>`;
  }
  function renderCoaches(r) {
    const f = Object.assign({ side: "all", lvl: "all", q: "" }, ST.cf || {});
    r.innerHTML = `<div class="ls-top"><button class="ghost back" data-home>‹ Plan</button>${coachOn() ? `<button class="ghost" data-lensoff>Lens off</button>` : ""}</div>
      <div class="ls-head"><span class="lab">Coach's lens</span><h2>Fifty coaches</h2><p class="why">Pick one to see the plan through his approach. Nothing in the lessons changes except his notes, which show up only where he has something to say.</p></div>
      <div class="cf"><input type="search" class="teamsel" placeholder="Search coaches, teams, schemes" value="${esc(f.q)}" data-cq>
        <div class="ctlrow">${segHTML("cs", [["all", "All"], ["offense", "Offense"], ["defense", "Defense"], ["program", "Program"]], f.side)}${segHTML("cl", [["all", "All"], ["nfl", "NFL"], ["college", "College"]], f.lvl)}</div></div>
      <div class="clist"></div><p class="foot">${esc(KC.NOTE)}</p>`;
    const list = r.querySelector(".clist");
    const render = () => {
      ST.cf = f; save();
      const q = f.q.trim().toLowerCase();
      const rows = KC.COACHES.filter(c => (f.side === "all" || c.side === f.side) && (f.lvl === "all" || c.lvl === f.lvl || c.lvl === "both") &&
        (!q || (c.name + " " + c.teams + " " + c.known + " " + c.philosophy).toLowerCase().includes(q)));
      list.innerHTML = rows.length ? rows.map(c => `<button class="crow${ST.coach === c.id ? " on" : ""}" data-coach="${c.id}"><span class="ci">${esc(initials(c.name))}</span><span class="cb"><b>${esc(c.name)}</b><span class="cy">${esc(c.years)} · ${SIDE[c.side]} · ${LVL[c.lvl]}</span><span class="ck">${esc(c.known)}</span></span></button>`).join("")
        : `<p class="note">No coach matches.</p>`;
    };
    r.querySelector("[data-cq]").addEventListener("input", e => { f.q = e.target.value; render(); });
    onSeg(r, "cs", v => { f.side = v; render(); }); onSeg(r, "cl", v => { f.lvl = v; render(); });
    render();
  }
  function renderCoach(r, id) {
    const c = KC.BYID[id]; if (!c) { renderCoaches(r); return; }
    const on = ST.coach === c.id;
    const lessons = LESSONS.filter(l => c.notes[l.id]);
    r.innerHTML = `<div class="ls-top"><button class="ghost back" data-coaches>‹ Coaches</button><button class="ghost back" data-home>Plan</button></div>
      <div class="ls-head"><span class="lab">${esc(c.years)} · ${SIDE[c.side]} · ${LVL[c.lvl]}</span><h2>${esc(c.name)}</h2><p class="why">${esc(c.teams)}</p></div>
      <button class="bigbtn${on ? " offb" : ""}" ${on ? "data-lensoff" : `data-lenson="${c.id}"`}>${on ? "Leave this lens" : "Step into this lens"}</button>
      <div class="st-key"><span class="lab">Known for</span><p>${esc(c.known)}</p></div>
      <h4 class="st-h">The approach</h4><p class="st-p">${esc(c.philosophy)}</p>
      <h4 class="st-h">For the quarterback</h4><p class="st-p">${esc(c.qb)}</p>
      <h4 class="st-h">Where he speaks up</h4>
      <div class="ph-l clessons">${lessons.map(l => `<button class="lrow ${lessonState(l)}" data-open="${l.id}" data-withlens="${c.id}"><span class="dot"></span><span class="lt">${esc(l.title)}<span class="cn">${esc(c.notes[l.id])}</span></span><span class="lm">P${l.phase.n}</span></button>`).join("")}</div>
      <h4 class="st-h">On film</h4><div class="cfilms"></div><div class="cdrill"></div>
      <p class="foot">${esc(KC.NOTE)}</p>`;
    const fh = r.querySelector(".cfilms");
    for (const f of c.films) fh.appendChild(new Board({ films: [f], opts: { rules: true, zones: true, routes: true }, explore: true }).el);
    r.querySelector(".cdrill").appendChild(drillEl(c.drill));
  }
  function refreshLessonHead() {
    if (cur.view !== "lesson") return;
    const l = LBYID[cur.id], h = root().querySelector(".ls-status"); if (!h) return;
    const cs = checksOf(l), n = cs.filter(k => ST.checks[k]).length;
    h.innerHTML = ST.done[l.id] ? `<span class="okc">Complete</span>` : (cs.length ? `${n} of ${cs.length} checks` : "");
  }
  function renderLesson(r, l) {
    ST.last = l.id; save();
    const ph = l.phase, idx = LESSONS.indexOf(l), prev = LESSONS[idx - 1], next = LESSONS[idx + 1];
    r.innerHTML = `
      <div class="ls-top"><button class="ghost back" data-home>‹ Plan</button><span class="ls-status"></span></div>
      <div class="ls-head"><span class="lab">Phase ${ph.n} · ${esc(ph.title)}</span><h2>${esc(l.title)}</h2><p class="why">${esc(l.why)}</p></div>
      ${lessonCoach(l)}
      <div class="ls-body"></div>
      <div class="ls-foot">
        ${checksOf(l).length ? "" : `<button class="bigbtn" data-mark>${ST.done[l.id] ? "Marked complete" : "Mark complete"}</button>`}
        <div class="ls-nav">${prev ? `<button class="ghost" data-open="${prev.id}">‹ ${esc(prev.title)}</button>` : "<span></span>"}${next ? `<button class="ghost" data-open="${next.id}">${esc(next.title)} ›</button>` : ""}</div>
      </div>`;
    const body = r.querySelector(".ls-body");
    l.blocks.forEach((b, i) => { try { body.appendChild(blockEl(b, l, i)); } catch (e) { console.error(e); } });
    const mk = r.querySelector("[data-mark]");
    if (mk) mk.onclick = () => { ST.done[l.id] = true; touchDay(); save(); mk.textContent = "Marked complete"; refreshLessonHead(); };
    refreshLessonHead();
  }
  function renderFilm(r) {
    const st = Object.assign({ cid: "smash", cov: "c2", disg: false, flip: false }, ST.film || {});
    r.innerHTML = `<div class="ls-top"><button class="ghost back" data-home>‹ Plan</button></div>
      <div class="ls-head"><span class="lab">Film room</span><h2>Any play against any coverage</h2><p class="why">Pick a concept and a coverage. Tap a defender to see his job. The chart under the film is what each throw is worth at each moment.</p></div>
      <div class="fr-ctl">
        <label><span class="lab">Concept</span><select class="teamsel" data-f="cid">${PASS_IDS.concat(B.CONCEPTS.filter(c => c.pa).map(c => c.id)).map(id => `<option value="${id}"${id === st.cid ? " selected" : ""}>${esc(CBYID[id].name)}</option>`).join("")}</select></label>
        <label><span class="lab">Coverage</span><select class="teamsel" data-f="cov">${READ_GROUPS.flatMap(g => g.covs).map(k => `<option value="${k}"${k === st.cov ? " selected" : ""}>${esc(D.COV[k].label)}</option>`).join("")}</select></label>
        <div class="fr-tog"><button class="chip toggle" data-f="disg" aria-pressed="${st.disg}">Disguised</button><button class="chip toggle" data-f="flip" aria-pressed="${st.flip}">Flip</button></div>
      </div><div class="fr-board"></div><div class="fr-notes"></div>`;
    const host = r.querySelector(".fr-board");
    const render = () => {
      ST.film = st; save();
      const c = CBYID[st.cid];
      const pers = (c.forms || [c.formation]).map(f => B.FORMATIONS[f].personnel).includes("11") ? "11" : B.FORMATIONS[c.formation].personnel;
      const C = D.COV[st.cov];
      const truth = st.cov === "c1" ? "one" : C.shells[0];
      const shown = st.disg ? (C.deep === 2 ? "one" : "two") : truth;
      const spec = { cid: st.cid, cov: st.cov, pers, flip: st.flip, shown, declare: st.disg ? null : 1.2 };
      host.innerHTML = "";
      host.appendChild(new Board({ films: [{ label: `${c.name} vs ${C.label}`, spec }], opts: { rules: true, zones: true, routes: true }, ev: true, explore: true }).el);
      r.querySelector(".fr-notes").innerHTML = `<div class="panel pbody"><div class="lab">${esc(c.name)} · coaching convention</div><p class="rule">${esc(c.rule)}</p><p class="note">Built for: ${c.beats.map(k => esc(B.COVS[k] || k)).join(", ")}. Struggles against: ${c.weak.map(k => esc(B.COVS[k] || k)).join(", ")}.</p></div>`;
    };
    r.querySelectorAll("select[data-f]").forEach(s => s.addEventListener("change", () => { st[s.dataset.f] = s.value; render(); }));
    r.querySelectorAll("button[data-f]").forEach(b => b.addEventListener("click", () => { const k = b.dataset.f; st[k] = !st[k]; b.setAttribute("aria-pressed", st[k]); render(); }));
    render();
  }
  function renderReps(r, mode) {
    mode = mode || "cov";
    const lvl = ST.repLevel || 2;
    r.innerHTML = `<div class="ls-top"><button class="ghost back" data-home>‹ Plan</button></div>
      <div class="ls-head"><span class="lab">Reps</span><h2>${mode === "thr" ? "Throw reps" : (mode === "shell" ? "Shell reps" : "Coverage reps")}</h2>
      <p class="why">${mode === "thr" ? "A random concept against a random coverage. The film stops at the top of the drop: tap the throw. Graded by Play's grader." : "Coverage calls drawn from NFL rates, with disguise at the level you pick. Watch through the snap, then name it."}</p></div>
      <div class="ctlrow">${segHTML("rm", [["cov", "Coverage"], ["shell", "Shell"], ["thr", "Throw"]], mode)}${mode === "thr" ? "" : `<label>Disguise ${segHTML("rl", [[1, "None"], [2, "Some"], [3, "Starter"], [4, "Pro"]], lvl)}</label>`}</div><div class="rp-host"></div>`;
    r.querySelector(".rp-host").appendChild(repsEl(mode, { n: 10, level: mode === "thr" ? 1 : lvl }));
    onSeg(r, "rm", v => show({ view: "reps", mode: v }));
    if (r.querySelector('[data-seg="rl"]')) onSeg(r, "rl", v => { ST.repLevel = +v; save(); show({ view: "reps", mode }); });
  }

  // navigation clicks anywhere in the tab
  document.addEventListener("click", e => {
    if (!root() || !root().contains(e.target)) return;
    const o = e.target.closest("[data-open]"); if (o) { if (o.dataset.withlens) { ST.coach = o.dataset.withlens; save(); } show({ view: "lesson", id: o.dataset.open }); return; }
    const on = e.target.closest("[data-lenson]"); if (on) { ST.coach = on.dataset.lenson; touchDay(); save(); show({ view: "coach", id: ST.coach }); return; }
    if (e.target.closest("[data-lensoff]")) { ST.coach = null; save(); show(cur.view === "coach" ? cur : (cur.view === "lesson" ? cur : { view: "home" })); return; }
    const cc = e.target.closest("[data-coach]"); if (cc) { show({ view: "coach", id: cc.dataset.coach }); return; }
    if (e.target.closest("[data-coaches]")) { show({ view: "coaches" }); return; }
    if (e.target.closest("[data-home]")) { show({ view: "home" }); return; }
    const rp = e.target.closest("[data-reps]"); if (rp) { show({ view: "reps", mode: rp.dataset.reps }); return; }
    if (e.target.closest("[data-film]")) { show({ view: "film" }); return; }
  });

  let shown = false;
  window.PocketStudy = {
    onShow() { if (!shown) { shown = true; show(ST.returnTo ? { view: "lesson", id: ST.returnTo } : { view: "home" }); ST.returnTo = null; save(); } else for (const b of BOARDS) b.resize(); },
    /* back from a Play drill: keep the summary and return to the lesson */
    drillDone(d) {
      const reps = d.reps || [];
      if (reps.length) {
        const sum = { name: d.name, n: reps.length, epa: reps.reduce((s, x) => s + x.epa, 0) / reps.length, id: reps.filter(x => x.idOk).length, idN: reps.filter(x => x.kind !== "run").length, at: Date.now() };
        ST.drills[d.name] = sum; ST.lastDrill = sum; touchDay(); save();
      }
      const back = ST.returnTo;
      setTimeout(() => {
        if (window.PocketApp) window.PocketApp.setView("study");
        show(back ? { view: "lesson", id: back } : { view: "home" }); ST.returnTo = null; save();
      }, 0);
    },
    open(id) { show({ view: "lesson", id }); },
    state: () => ST, show
  };
})();
