/* Pocket QB, Phase 1 UI: playbook viewer + spaced-repetition install. */
(function () {
  "use strict";
  const E = window.PocketEngine, B = window.PocketBook, F = E.FIELD;
  const $ = id => document.getElementById(id);

  const POSC = { X: "#F2B84B", H: "#FF8A6B", Y: "#9BE38C", Z: "#7FB8FF", RB: "#D7A8FF" };
  const POS_ORDER = ["X", "H", "Y", "Z", "RB"];
  const Y_TOP = 27, Y_BOT = -10, YR = Y_TOP - Y_BOT;
  const T_MIN = -0.3, T_MAX = 4.0;
  const CBYID = Object.fromEntries(B.CONCEPTS.map(c => [c.id, c]));
  const fmt = (v, n = 2) => (v < 0 ? "−" : "") + Math.abs(v).toFixed(n);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const sample = (a, n) => shuffle(a.slice()).slice(0, n);
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const simOf = (c, mirror) => E.simulate(c, B.FORMATIONS, B.ROUTES, { mirror: !!mirror });
  const routeLabel = (c, pos) => B.ROUTES[c.routes[pos]].label;

  /* =============== field view =============== */
  class FieldView {
    constructor(canvas, onTap) {
      this.cv = canvas; this.ctx = canvas.getContext("2d");
      this.sim = null; this.drop = null; this.paths = {}; this.t = 0; this.opts = {}; this.onTap = onTap;
      new ResizeObserver(() => this.resize()).observe(canvas);
      canvas.addEventListener("pointerdown", e => {
        if (!this.onTap || !this.sim) return;
        const r = canvas.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width * F.W, y = Y_TOP - (e.clientY - r.top) / r.height * YR;
        const p = this.nearest(x, y);
        if (p) this.onTap(p);
      });
      this.resize();
    }
    resize() {
      const w = this.cv.clientWidth || 360, h = Math.round(w * YR / F.W);
      const d = Math.min(2.5, window.devicePixelRatio || 1);
      if (this.cv.style.height !== h + "px") this.cv.style.height = h + "px";
      const W = Math.round(w * d), H = Math.round(h * d);
      if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
      this.draw();
    }
    setSim(sim, drop) {
      this.sim = sim; this.drop = drop; this.paths = {};
      for (const pos in sim.players) {
        const run = sim.players[pos].run, pts = [];
        const end = Math.min(run.tEnd, 5.5);
        for (let t = run.t0; t <= end + 1e-6; t += 0.03) { const s = run.stateAt(t); pts.push([s.x, s.y]); }
        const s = run.stateAt(end); pts.push([s.x, s.y]);
        this.paths[pos] = pts;
      }
      this.draw();
    }
    nearest(x, y) {
      let best = null, bd = 3.6;
      for (const pos in this.paths) {
        if (this.opts.hidden && this.opts.hidden.includes(pos)) continue;
        const st = this.sim.players[pos].run.start;
        let d = Math.hypot(st.x - x, st.y - y);
        for (const [px, py] of this.paths[pos]) if (py < Y_TOP) d = Math.min(d, Math.hypot(px - x, py - y));
        if (d < bd) { bd = d; best = pos; }
      }
      return best;
    }
    draw() {
      const ctx = this.ctx, W = this.cv.width, H = this.cv.height;
      if (!W) return;
      const s = W / F.W, dpr = W / (this.cv.clientWidth || W);
      const X = x => x * s, Y = y => (Y_TOP - y) * s;
      const o = this.opts, t = this.t;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#0C1417"; ctx.fillRect(0, 0, W, H);

      // yard lines and depth labels
      ctx.font = `500 ${10 * dpr}px "JetBrains Mono", monospace`;
      ctx.textBaseline = "middle";
      for (let y = -5; y <= 25; y += 5) {
        if (y === 0) continue;
        ctx.strokeStyle = "rgba(228,240,243,.10)"; ctx.lineWidth = dpr;
        ctx.beginPath(); ctx.moveTo(0, Y(y)); ctx.lineTo(W, Y(y)); ctx.stroke();
        if (y > 0) { ctx.fillStyle = "rgba(228,240,243,.32)"; ctx.fillText(String(y), 5 * dpr, Y(y) - 7 * dpr); }
      }
      // hashes
      ctx.strokeStyle = "rgba(228,240,243,.22)"; ctx.lineWidth = dpr;
      for (let y = -6; y <= 26; y++) for (const hx of [23.58, 29.75]) {
        ctx.beginPath(); ctx.moveTo(X(hx - 0.35), Y(y)); ctx.lineTo(X(hx + 0.35), Y(y)); ctx.stroke();
      }
      // line of scrimmage
      ctx.strokeStyle = "rgba(55,198,219,.85)"; ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.moveTo(0, Y(0)); ctx.lineTo(W, Y(0)); ctx.stroke();

      if (!this.sim) return;
      // line and QB
      ctx.fillStyle = "rgba(228,240,243,.45)";
      const ol = 1.05 * s;
      for (const p of B.OL) ctx.fillRect(X(p.x) - ol / 2, Y(p.y) - ol / 2, ol, ol);
      const qb = E.qbAt(this.drop, t);
      ctx.fillStyle = "#E4F0F3"; ctx.beginPath(); ctx.arc(X(qb.x), Y(qb.y), Math.max(6 * dpr, 0.75 * s), 0, 7); ctx.fill();
      ctx.fillStyle = "#0C1417"; ctx.font = `700 ${9 * dpr}px "Archivo", sans-serif`; ctx.textAlign = "center";
      ctx.fillText("QB", X(qb.x), Y(qb.y) + 0.5 * dpr);

      const hidden = o.hidden || [];
      const order = o.order || [];
      for (const pos of POS_ORDER) {
        const P = this.sim.players[pos];
        if (!P) continue;
        const col = POSC[pos], path = this.paths[pos], run = P.run;
        const faded = o.highlight && o.highlight !== pos;
        if (!hidden.includes(pos)) {
          // full route
          ctx.globalAlpha = faded ? 0.18 : 0.38;
          ctx.strokeStyle = col; ctx.lineWidth = 2 * dpr; ctx.lineJoin = "round"; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(X(run.start.x), Y(run.start.y));
          for (const [px, py] of path) ctx.lineTo(X(px), Y(py));
          ctx.stroke();
          // arrow or settle bar
          const n = path.length, a = path[n - 1], b = path[Math.max(0, n - 4)];
          const ang = Math.atan2(-(a[1] - b[1]), a[0] - b[0]);
          ctx.save(); ctx.translate(X(a[0]), Y(a[1])); ctx.rotate(ang); ctx.fillStyle = col;
          if (P.route.settle) { ctx.fillRect(-0.5 * dpr, -6 * dpr, 2.5 * dpr, 12 * dpr); }
          else { ctx.beginPath(); ctx.moveTo(7 * dpr, 0); ctx.lineTo(-4 * dpr, -5 * dpr); ctx.lineTo(-4 * dpr, 5 * dpr); ctx.closePath(); ctx.fill(); }
          ctx.restore();
          // trail up to now
          ctx.globalAlpha = faded ? 0.35 : 1;
          ctx.lineWidth = 3 * dpr; ctx.beginPath(); ctx.moveTo(X(run.start.x), Y(run.start.y));
          for (let tt = run.t0; tt <= Math.min(t, run.tEnd); tt += 0.03) { const st = run.stateAt(tt); ctx.lineTo(X(st.x), Y(st.y)); }
          if (t > run.t0) { const st = run.stateAt(t); ctx.lineTo(X(st.x), Y(st.y)); }
          ctx.stroke();
          ctx.globalAlpha = 1;
          // break marker
          if (o.breaks && run.brk && !faded) {
            ctx.strokeStyle = col; ctx.lineWidth = 1.5 * dpr;
            ctx.beginPath(); ctx.arc(X(run.brk.x), Y(run.brk.y), 4 * dpr, 0, 7); ctx.stroke();
            this.label(fmt(run.brk.t, 2) + "s", X(run.brk.x), Y(run.brk.y), col, dpr, W, H, "side");
          }
          // route label at the end
          if (o.labels) {
            let lp = a;
            for (let k = n - 1; k >= 0; k--) if (path[k][1] <= Y_TOP - 1.5) { lp = path[k]; break; }
            this.label(P.route.label, X(lp[0]), Y(lp[1]), col, dpr, W, H, false, faded);
          }
        }
        // player dot
        const st = hidden.includes(pos) ? run.start : run.stateAt(t);
        const r = Math.max(8 * dpr, 0.8 * s);
        if (o.highlight === pos) {
          ctx.strokeStyle = "#E4F0F3"; ctx.lineWidth = 2 * dpr;
          ctx.beginPath(); ctx.arc(X(st.x), Y(st.y), r + 4 * dpr, 0, 7); ctx.stroke();
        }
        ctx.globalAlpha = faded ? 0.55 : 1;
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(st.x), Y(st.y), r, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#0C1417"; ctx.font = `700 ${(pos.length > 1 ? 8.5 : 10.5) * dpr}px "Archivo", sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(hidden.includes(pos) ? "?" : pos, X(st.x), Y(st.y) + 0.5 * dpr);
      }
      // progression badges (tap order or answer)
      order.forEach((pos, i) => {
        const P = this.sim.players[pos]; if (!P) return;
        const path = this.paths[pos];
        let lp = path[path.length - 1];
        for (let k = path.length - 1; k >= 0; k--) if (path[k][1] <= Y_TOP - 2) { lp = path[k]; break; }
        const bx = Math.min(W - 12 * dpr, Math.max(12 * dpr, X(lp[0]))), by = Math.max(12 * dpr, Y(lp[1]) - 14 * dpr);
        ctx.fillStyle = o.orderColor || "#E4F0F3";
        ctx.beginPath(); ctx.arc(bx, by, 10 * dpr, 0, 7); ctx.fill();
        ctx.fillStyle = "#0C1417"; ctx.font = `700 ${11 * dpr}px "JetBrains Mono", monospace`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(i + 1), bx, by + 0.5 * dpr);
      });
    }
    label(text, x, y, col, dpr, W, H, below, faded) {
      const ctx = this.ctx;
      ctx.font = `600 ${10.5 * dpr}px "JetBrains Mono", monospace`;
      const w = ctx.measureText(text).width + 8 * dpr, h = 15 * dpr;
      // "side" sits right of the point (left if that runs off the field), clear of the player dot
      let lx = x - w / 2, ly = y - h - 7 * dpr;
      if (below === "side") { lx = x + 9 * dpr; ly = y - h / 2; if (lx + w > W - 2 * dpr) lx = x - 9 * dpr - w; }
      lx = Math.min(W - w - 2 * dpr, Math.max(2 * dpr, lx));
      ly = Math.min(H - h - 2 * dpr, Math.max(2 * dpr, ly));
      ctx.globalAlpha = faded ? 0.4 : 1;
      ctx.fillStyle = "rgba(12,20,23,.82)"; ctx.fillRect(lx, ly, w, h);
      ctx.fillStyle = col; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(text, lx + 4 * dpr, ly + h / 2 + 0.5 * dpr);
      ctx.globalAlpha = 1;
    }
  }

  /* =============== playbook =============== */
  const book = { cid: "smash", mirror: false, labels: true, breaks: true, t: 1.2, playing: false, rate: 0.5, hold: 0 };
  const bookField = new FieldView($("bookField"));

  function renderConceptChips() {
    $("conceptChips").innerHTML = B.CONCEPTS.map(c =>
      `<button class="chip" data-cid="${c.id}" aria-pressed="${c.id === book.cid}">${esc(c.name)}</button>`).join("");
  }
  $("conceptChips").addEventListener("click", e => {
    const b = e.target.closest("[data-cid]"); if (!b) return;
    book.cid = b.dataset.cid; book.t = T_MIN; book.playing = true; setPlayIcon();
    renderConceptChips(); loadConcept();
  });

  function ticks(el, drop) {
    const pct = v => ((v - T_MIN) / (T_MAX - T_MIN) * 100).toFixed(2) + "%";
    let h = [0, 1, 2, 3, 4].map(v => `<span style="left:${pct(v)}">${v}s</span>`).join("");
    if (drop) h += `<span class="drop" style="left:${pct(drop.t)};top:0">▲</span>`;
    el.innerHTML = h;
  }

  function loadConcept() {
    const c = CBYID[book.cid], drop = B.DROPS[c.drop];
    const sim = simOf(c, book.mirror);
    bookField.opts = { labels: book.labels, breaks: book.breaks };
    bookField.setSim(sim, drop);
    $("bookTag").textContent = B.FORMATIONS[c.formation].label + (book.mirror ? " · flipped" : "");
    ticks($("bookTicks"), drop);

    $("cName").textContent = c.name;
    $("cMeta").innerHTML = `<span><b>${esc(c.family)}</b></span><span>${esc(B.FORMATIONS[c.formation].label)}</span><span>${esc(drop.label)} · ${drop.t.toFixed(1)} s</span><span>${esc([...new Set((c.forms || [c.formation]).map(f => B.FORMATIONS[f].personnel))].join(" / "))} personnel</span>`;
    $("cKey").textContent = B.KEYS[c.key];
    $("cRule").textContent = c.rule;
    const AIMW = { B: "the B gap", C: "the C gap, behind the kick-out", edge: "outside the tight end" };
    if (c.kind === "run") $("cProg").innerHTML = `<li><span class="num" style="background:${POSC.RB}">RB</span><span class="pos">Run</span><span class="rt">Takes the handoff and aims at ${esc(AIMW[c.aim] || "the hole")}, then cuts off the blocks</span></li>`;
    else $("cProg").innerHTML = c.progression.map((p, i) => {
      const run = sim.players[p].run;
      const tm = run.brk ? `breaks ${run.brk.t.toFixed(2)} s` : (run.timeToDepth(15) ? `15 yd at ${run.timeToDepth(15).toFixed(2)} s` : "");
      return `<li><span class="num" style="background:${POSC[p]}">${i + 1}</span><span class="pos">${p}</span><span class="rt">${esc(routeLabel(c, p))}${tm ? " · " + tm : ""}</span></li>`;
    }).join("");
    $("cBeats").innerHTML = c.beats.map(k => `<span class="tag beat">${esc(B.COVS[k])}</span>`).join("");
    $("cWeak").innerHTML = c.weak.map(k => `<span class="tag weak">${esc(B.COVS[k])}</span>`).join("");
    $("cNote").textContent = c.note;

    // timing table
    let rows = `<tr class="dropRow"><td class="pos">QB</td><td>${esc(drop.label)}</td><td class="m">${drop.t.toFixed(2)}</td><td class="m">${(5 + drop.depth).toFixed(1)} deep</td><td class="m">top of drop</td></tr>`;
    for (const pos of POS_ORDER) {
      const P = sim.players[pos]; if (!P) continue;
      const run = P.run;
      let bt, dep, sp, lab = P.route.label;
      if (run.brk) {
        bt = run.brk.t; dep = run.brk.y.toFixed(1); sp = run.brk.v.toFixed(1);
      } else {
        bt = run.timeToDepth(15); dep = "15.0"; sp = P.arch.speed.toFixed(1); lab += " (to 15 yd)";
      }
      const rhythm = bt != null && Math.abs(bt - drop.t) <= 0.3 ? `<span class="rhythm">Rhythm</span>` : "";
      rows += `<tr><td class="pos" style="color:${POSC[pos]}">${pos}</td><td>${esc(lab)}${rhythm}</td>` +
        `<td class="m">${bt != null ? bt.toFixed(2) : "—"}</td><td class="m">${dep}</td><td class="m">${sp}</td></tr>`;
    }
    $("timingTbl").querySelector("tbody").innerHTML = rows;
    drawBook();
  }

  function drawBook() {
    bookField.t = book.t; bookField.draw();
    $("bookTime").value = book.t;
    $("bookClock").textContent = fmt(Math.max(book.t, T_MIN));
    const drop = B.DROPS[CBYID[book.cid].drop];
    $("bookDrop").classList.toggle("on", Math.abs(book.t - drop.t) < 0.2);
    $("bookDrop").textContent = "Top of drop · " + drop.t.toFixed(1) + " s";
  }
  function setPlayIcon() {
    $("bookPlayIcon").innerHTML = book.playing ? '<path d="M3 1.5h3.5v13H3zM9.5 1.5H13v13H9.5z"/>' : '<path d="M3 1.5v13l11-6.5z"/>';
    $("bookPlay").setAttribute("aria-label", book.playing ? "Pause" : "Play");
  }
  $("bookPlay").addEventListener("click", () => {
    if (!book.playing && book.t >= T_MAX - 0.01) book.t = T_MIN;
    book.playing = !book.playing; setPlayIcon();
  });
  $("bookTime").addEventListener("input", e => { book.t = +e.target.value; book.playing = false; setPlayIcon(); drawBook(); });
  document.querySelectorAll("#v-book .seg [data-rate]").forEach(b => b.addEventListener("click", () => {
    book.rate = +b.dataset.rate;
    document.querySelectorAll("#v-book .seg [data-rate]").forEach(x => x.setAttribute("aria-pressed", x === b));
  }));
  const tog = (id, key, reload) => $(id).addEventListener("click", () => {
    book[key] = !book[key]; $(id).setAttribute("aria-pressed", book[key]);
    if (reload) loadConcept(); else { bookField.opts = { labels: book.labels, breaks: book.breaks }; drawBook(); }
  });
  tog("optLabels", "labels"); tog("optBreaks", "breaks"); tog("optMirror", "mirror", true);

  /* =============== install: storage =============== */
  const STORE_KEY = "pocket.install.v1";
  const MIN = 60e3, DAY = 864e5;
  const INTERVAL = [0, 0, 10 * MIN, DAY, 3 * DAY, 7 * DAY, 21 * DAY];
  const TYPES = { name: "Name the concept", order: "Progression", key: "Key defender", route: "Route assignment", beats: "Coverage it beats", time: "Timing" };
  const blank = () => ({ cards: {}, intro: {}, types: {}, concepts: B.CONCEPTS.slice(0, 4).map(c => c.id), len: 12 });
  let store = blank();
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) store = Object.assign(blank(), JSON.parse(raw)); } catch (e) { /* storage unavailable: run in memory */ }
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { } };

  /* =============== install: cards =============== */
  const CARDS = [];
  for (const c of B.CONCEPTS) {
    const sim = simOf(c);
    if (c.kind !== "run") CARDS.push({ id: `name:${c.id}`, type: "name", cid: c.id });   // a run's blocks alone do not name it
    if (c.progression.length) CARDS.push({ id: `order:${c.id}`, type: "order", cid: c.id });   // runs have no progression
    CARDS.push({ id: `key:${c.id}`, type: "key", cid: c.id });
    for (const p of c.progression.filter(p => p !== "RB").slice(0, 3)) CARDS.push({ id: `route:${c.id}:${p}`, type: "route", cid: c.id, pos: p });
    CARDS.push({ id: `beats:${c.id}`, type: "beats", cid: c.id });
    const tp = c.progression.find(p => sim.players[p] && sim.players[p].run.brk);
    if (tp) CARDS.push({ id: `time:${c.id}:${tp}`, type: "time", cid: c.id, pos: tp });
  }
  const inSet = card => store.concepts.includes(card.cid);
  const dueCards = now => CARDS.filter(k => inSet(k) && store.cards[k.id] && store.cards[k.id].due <= now).sort((a, b) => store.cards[a.id].due - store.cards[b.id].due);
  const newCards = () => CARDS.filter(k => inSet(k) && !store.cards[k.id]);

  function refreshSetup() {
    const now = Date.now();
    $("sDue").textContent = dueCards(now).length;
    $("sNew").textContent = newCards().length;
    $("sMast").textContent = CARDS.filter(k => store.cards[k.id] && store.cards[k.id].box >= 4).length;
    $("instChips").innerHTML = B.CONCEPTS.map(c =>
      `<button class="chip toggle" data-cid="${c.id}" aria-pressed="${store.concepts.includes(c.id)}">${esc(c.name)}</button>`).join("");
    document.querySelectorAll("#lenSeg [data-len]").forEach(b => b.setAttribute("aria-pressed", +b.dataset.len === store.len));
    const any = store.concepts.length > 0;
    $("startBtn").disabled = !any;
    $("startBtn").textContent = !any ? "Pick a concept" : (dueCards(now).length || newCards().length ? "Start session" : "Practice anyway");
    const d = CARDS.filter(k => store.cards[k.id] && store.cards[k.id].due <= now).length;
    $("dueBadge").textContent = d; $("dueBadge").hidden = d === 0;
  }
  $("instChips").addEventListener("click", e => {
    const b = e.target.closest("[data-cid]"); if (!b) return;
    const id = b.dataset.cid, i = store.concepts.indexOf(id);
    if (i >= 0) store.concepts.splice(i, 1); else store.concepts.push(id);
    store.concepts.sort((a, b) => B.CONCEPTS.findIndex(c => c.id === a) - B.CONCEPTS.findIndex(c => c.id === b));
    save(); refreshSetup();
  });
  $("lenSeg").addEventListener("click", e => {
    const b = e.target.closest("[data-len]"); if (!b) return;
    store.len = +b.dataset.len; save(); refreshSetup();
  });

  /* =============== install: session =============== */
  let sess = null;
  const quizField = new FieldView($("quizField"), pos => onQuizTap(pos));
  const quiz = { t: T_MIN, rate: 0.5, hold: 0, playing: true };

  function startSession() {
    const now = Date.now();
    let q = dueCards(now).slice(0, store.len);
    if (q.length < store.len) q = q.concat(newCards().slice(0, store.len - q.length));
    if (!q.length) q = CARDS.filter(inSet).sort((a, b) => (store.cards[a.id] ? store.cards[a.id].due : 0) - (store.cards[b.id] ? store.cards[b.id].due : 0)).slice(0, store.len);
    // first looks before a concept's first card
    const seenIntro = new Set(Object.keys(store.intro).filter(k => store.intro[k]));
    const queue = [];
    for (const k of q) {
      if (!seenIntro.has(k.cid)) { queue.push({ type: "intro", cid: k.cid, id: "intro:" + k.cid }); seenIntro.add(k.cid); }
      queue.push(k);
    }
    sess = { queue, i: 0, tried: {}, right: 0, wrong: 0, misses: [], answered: false, tap: [] };
    $("instSetup").hidden = true; $("instDone").hidden = true; $("instCard").hidden = false;
    renderCard();
  }
  $("startBtn").addEventListener("click", startSession);
  $("quitBtn").addEventListener("click", () => endSession());
  $("againBtn").addEventListener("click", () => { $("instDone").hidden = true; $("instSetup").hidden = false; refreshSetup(); });

  function endSession() {
    $("instCard").hidden = true; $("instDone").hidden = false;
    const tot = sess.right + sess.wrong;
    $("dRight").textContent = sess.right; $("dWrong").textContent = sess.wrong;
    $("dPct").textContent = tot ? Math.round(100 * sess.right / tot) + "%" : "—";
    $("doneHint").textContent = tot + " graded";
    const miss = [...new Set(sess.misses)];
    $("dMisses").innerHTML = miss.length
      ? `<div class="lab" style="margin-bottom:6px">Back in box 1</div><div class="tags">${miss.map(id => {
          const k = CARDS.find(c => c.id === id); return `<span class="tag weak">${esc(CBYID[k.cid].name)} · ${esc(TYPES[k.type])}</span>`; }).join("")}</div>`
      : `<p class="note">No misses. Everything moved up a box.</p>`;
    sess = null; refreshSetup();
  }

  function setQuizField(card, extraOpts) {
    const c = CBYID[card.cid];
    if (card.mirror == null) card.mirror = card.type === "intro" ? false : Math.random() < 0.5;
    const sim = simOf(c, card.mirror);
    quizField.opts = Object.assign({ labels: true, breaks: false }, extraOpts || {});
    quizField.setSim(sim, B.DROPS[c.drop]);
    $("quizTag").textContent = B.FORMATIONS[c.formation].label + (card.mirror ? " · flipped" : "");
    quiz.t = T_MIN; quiz.hold = 0; quiz.playing = true;
    return sim;
  }

  function renderCard() {
    const card = sess.queue[sess.i];
    sess.answered = false; sess.tap = [];
    $("qFeedback").innerHTML = "";
    const graded = sess.queue.filter(k => k.type !== "intro").length;
    const done = sess.queue.slice(0, sess.i).filter(k => k.type !== "intro").length;
    $("qBar").style.width = (100 * done / Math.max(1, graded)).toFixed(1) + "%";
    $("qCount").textContent = `${Math.min(done + 1, graded)} / ${graded}`;
    const c = CBYID[card.cid];
    $("qType").textContent = card.type === "intro" ? "First look" : TYPES[card.type];

    if (card.type === "intro") {
      setQuizField(card, { labels: true, breaks: true });
      $("qPrompt").textContent = c.name;
      $("qBody").innerHTML = `<div class="block intro">
        <div class="cmeta"><span><b>${esc(c.family)}</b></span><span>${esc(B.DROPS[c.drop].label)}</span></div>
        <div class="lab" style="margin-top:6px">Key defender</div><div class="keyd">${esc(B.KEYS[c.key])}</div>
        <p class="rule">${esc(c.rule)}</p>
        <div class="lab">Progression</div>
        <ol class="prog">${c.progression.map((p, i) => `<li><span class="num" style="background:${POSC[p]}">${i + 1}</span><span class="pos">${p}</span><span class="rt">${esc(routeLabel(c, p))}</span></li>`).join("")}</ol>
        <div class="tags">${c.beats.map(k => `<span class="tag beat">${esc(B.COVS[k])}</span>`).join("")}${c.weak.map(k => `<span class="tag weak">${esc(B.COVS[k])}</span>`).join("")}</div>
      </div><div class="nextrow"><button class="bigbtn" id="introGo">Quiz me on it</button></div>`;
      quizField.opts.order = c.progression; quizField.draw();
      $("introGo").onclick = () => { store.intro[c.id] = true; save(); next(); };
      return;
    }

    let sim, prompt = "", options = null, correct = null;
    if (card.type === "name") {
      sim = setQuizField(card, { labels: false });
      prompt = "Which concept is this?";
      correct = c.name;
      // distractors from the same formation first, so the answer comes from the routes, not the alignment
      const same = sample(B.CONCEPTS.filter(x => x.id !== c.id && x.formation === c.formation).map(x => x.name), 3);
      const other = sample(B.CONCEPTS.filter(x => x.formation !== c.formation).map(x => x.name), 3);
      options = shuffle([correct, ...same.concat(other).slice(0, 3)]);
    } else if (card.type === "route") {
      sim = setQuizField(card, { hidden: [card.pos], highlight: card.pos });
      prompt = `What does ${card.pos} run in ${c.name}?`;
      correct = routeLabel(c, card.pos);
      const pool = [...new Set(Object.entries(B.ROUTES).filter(([k]) => !k.startsWith("rb")).map(([, r]) => r.label))].filter(l => l !== correct);
      options = shuffle([correct, ...sample(pool, 3)]);
    } else if (card.type === "key") {
      sim = setQuizField(card, {});
      prompt = `Who is the key defender in ${c.name}?`;
      correct = B.KEYS[c.key];
      options = shuffle([correct, ...sample(Object.values(B.KEYS).filter(v => v !== correct), 3)]);
    } else if (card.type === "beats") {
      sim = setQuizField(card, {});
      prompt = `${c.name} is built to beat which coverage?`;
      correct = B.COVS[sample(c.beats, 1)[0]];
      const wrong = [...c.weak.map(k => B.COVS[k]), ...sample(Object.keys(B.COVS).filter(k => !c.beats.includes(k) && !c.weak.includes(k)).map(k => B.COVS[k]), 4)];
      options = shuffle([correct, ...[...new Set(wrong)].slice(0, 3)]);
    } else if (card.type === "time") {
      sim = setQuizField(card, { highlight: card.pos });
      const run = sim.players[card.pos].run;
      prompt = `When does ${card.pos}'s ${routeLabel(c, card.pos).toLowerCase()} break?`;
      const v = Math.round(run.brk.t * 10) / 10;
      correct = v.toFixed(1) + " s";
      const offs = sample([-0.6, -0.3, 0.3, 0.6].filter(d => v + d >= 0.4), 3);
      options = [v, ...offs.map(d => Math.round((v + d) * 10) / 10)].sort((a, b) => a - b).map(x => x.toFixed(1) + " s");
    } else if (card.type === "order") {
      sim = setQuizField(card, {});
      prompt = `Tap ${c.name}'s progression in order.`;
    }
    $("qPrompt").textContent = prompt;

    if (card.type === "order") {
      const n = c.progression.length;
      $("qBody").innerHTML = `<div class="orderbar"><div class="seq" id="seq">Tap ${n} receivers on the field</div>
        <button class="ghost" id="undoBtn">Undo</button><button class="ghost" id="submitBtn" disabled>Check</button></div>`;
      $("undoBtn").onclick = () => { if (sess.answered) return; sess.tap.pop(); updateSeq(); };
      $("submitBtn").onclick = () => gradeOrder();
      updateSeq();
    } else {
      $("qBody").innerHTML = `<div class="answers">${options.map(op => `<button class="ans" data-op="${esc(op)}">${esc(op)}</button>`).join("")}</div>`;
      $("qBody").querySelectorAll(".ans").forEach(b => b.onclick = () => gradeChoice(b.dataset.op, correct));
    }
  }

  function updateSeq() {
    const card = sess.queue[sess.i], c = CBYID[card.cid], n = c.progression.length;
    $("seq").innerHTML = sess.tap.length
      ? sess.tap.map((p, i) => `<span class="num" style="background:${POSC[p]}">${i + 1}</span><span class="pos" style="font-family:var(--f-display);font-weight:700">${p}</span>`).join("")
      : `Tap ${n} receivers on the field`;
    $("submitBtn").disabled = sess.tap.length !== n || sess.answered;
    quizField.opts.order = sess.tap.slice(); quizField.opts.orderColor = null; quizField.draw();
  }
  function onQuizTap(pos) {
    if (!sess || sess.answered) return;
    const card = sess.queue[sess.i];
    if (card.type !== "order") return;
    const n = CBYID[card.cid].progression.length;
    const i = sess.tap.indexOf(pos);
    if (i >= 0) sess.tap.splice(i, 1); else if (sess.tap.length < n) sess.tap.push(pos);
    updateSeq();
  }

  function gradeChoice(op, correct) {
    if (sess.answered) return;
    const ok = op === correct;
    $("qBody").querySelectorAll(".ans").forEach(b => {
      b.disabled = true;
      if (b.dataset.op === correct) b.classList.add("right");
      else if (b.dataset.op === op) b.classList.add("wrong");
      else b.classList.add("dim");
    });
    const card = sess.queue[sess.i];
    if (card.type === "route") { quizField.opts.hidden = []; quizField.draw(); }
    if (card.type === "time") { quizField.opts.breaks = true; quizField.draw(); }
    finish(ok);
  }
  function gradeOrder() {
    const card = sess.queue[sess.i], c = CBYID[card.cid];
    const ok = c.progression.every((p, i) => sess.tap[i] === p);
    quizField.opts.order = c.progression.slice(); quizField.opts.orderColor = ok ? "#4CCB83" : "#FF8455"; quizField.draw();
    $("submitBtn").disabled = true;
    finish(ok);
  }

  function explain(card) {
    const c = CBYID[card.cid];
    const sim = quizField.sim;
    const prog = c.progression.map((p, i) => `${i + 1} ${p} ${routeLabel(c, p).toLowerCase()}`).join(", ");
    switch (card.type) {
      case "name": return `${c.name}: ${c.family.toLowerCase()}. ${c.rule}`;
      case "route": {
        const run = sim.players[card.pos].run;
        const tm = run.brk ? ` It breaks at ${run.brk.t.toFixed(2)} s, ${run.brk.y.toFixed(0)} yards deep.` : "";
        return `${card.pos} runs the ${routeLabel(c, card.pos).toLowerCase()}.${tm} Progression: ${prog}.`;
      }
      case "order": return `Progression: ${prog}. ${c.rule}`;
      case "key": return `${B.KEYS[c.key]}. ${c.rule}`;
      case "beats": return `Built to beat ${c.beats.map(k => B.COVS[k]).join(", ")}. Struggles against ${c.weak.map(k => B.COVS[k]).join(", ")}. ${c.note}`;
      case "time": {
        const run = sim.players[card.pos].run, d = B.DROPS[c.drop];
        const gap = run.brk.t - d.t;
        return `Break at ${run.brk.t.toFixed(2)} s, ${run.brk.y.toFixed(1)} yd deep, carrying ${run.brk.v.toFixed(1)} yd/s. The ${d.label.toLowerCase()} tops out at ${d.t.toFixed(1)} s, so the route breaks ${Math.abs(gap).toFixed(2)} s ${gap >= 0 ? "after" : "before"} the drop.`;
      }
    }
    return "";
  }

  function finish(ok) {
    sess.answered = true;
    const card = sess.queue[sess.i];
    const now = Date.now();
    const rec = store.cards[card.id] || { box: 0, due: 0, right: 0, wrong: 0 };
    const first = !sess.tried[card.id];
    sess.tried[card.id] = true;
    if (first) {
      const ts = store.types[card.type] || { r: 0, w: 0 };
      if (ok) ts.r++; else ts.w++;
      store.types[card.type] = ts;
      if (ok) sess.right++; else { sess.wrong++; }
    }
    if (ok) { rec.box = Math.min(6, rec.box + 1); rec.right++; }
    else {
      rec.box = 1; rec.wrong++; sess.misses.push(card.id);
      const copy = Object.assign({}, card, { mirror: null });
      sess.queue.splice(Math.min(sess.queue.length, sess.i + 4), 0, copy);
    }
    rec.due = now + INTERVAL[rec.box];
    store.cards[card.id] = rec; save();
    $("qFeedback").innerHTML = `<div class="fb ${ok ? "ok" : "no"}"><div class="verdict">${ok ? "Right" : "Not quite"}</div>${esc(explain(card))}</div>
      <div class="nextrow"><button class="bigbtn" id="nextBtn">${sess.i + 1 >= sess.queue.length ? "Finish" : "Next"}</button></div>`;
    $("nextBtn").onclick = next;
    $("nextBtn").focus({ preventScroll: true });
  }
  function next() {
    sess.i++;
    if (sess.i >= sess.queue.length) { endSession(); return; }
    renderCard();
    $("instCard").scrollIntoView({ block: "start", behavior: "smooth" });
  }

  /* =============== progress =============== */
  function renderProgress() {
    $("mastery").innerHTML = B.CONCEPTS.map(c => {
      const ks = CARDS.filter(k => k.cid === c.id);
      const m = ks.filter(k => store.cards[k.id] && store.cards[k.id].box >= 4).length;
      return `<div class="mrow"><span class="nm">${esc(c.name)}</span><div class="boxes">${ks.map(k => {
        const r = store.cards[k.id]; return `<i class="b${r ? r.box : 0}" title="${esc(TYPES[k.type])}"></i>`; }).join("")}</div>
        <span class="pct">${m}/${ks.length}</span></div>`;
    }).join("");
    $("typeTbl").querySelector("tbody").innerHTML = Object.keys(TYPES).map(t => {
      const s = store.types[t] || { r: 0, w: 0 }, n = s.r + s.w;
      return `<tr><td>${TYPES[t]}</td><td class="m">${s.r}</td><td class="m">${s.w}</td><td class="m">${n ? Math.round(100 * s.r / n) + "%" : "—"}</td></tr>`;
    }).join("");
  }
  let armTimer = 0;
  $("resetBtn").addEventListener("click", () => {
    const b = $("resetBtn");
    if (!b.classList.contains("armed")) {
      b.classList.add("armed"); b.textContent = "Tap again to erase all progress";
      clearTimeout(armTimer); armTimer = setTimeout(() => { b.classList.remove("armed"); b.textContent = "Reset progress"; }, 3500);
      return;
    }
    clearTimeout(armTimer); b.classList.remove("armed"); b.textContent = "Progress reset";
    const keep = store.concepts, len = store.len;
    store = blank(); store.concepts = keep; store.len = len; save();
    renderProgress(); refreshSetup();
    setTimeout(() => { b.textContent = "Reset progress"; }, 1800);
  });

  /* =============== views + loop =============== */
  /* concepts with at least 75% of their cards in box 4+ unlock Levels 4 and 5 in Play */
  window.PocketInstall = {
    mastered() {
      return B.CONCEPTS.filter(c => {
        const ks = CARDS.filter(k => k.cid === c.id);
        const m = ks.filter(k => store.cards[k.id] && store.cards[k.id].box >= 4).length;
        return ks.length && m / ks.length >= 0.75;
      }).map(c => c.id);
    }
  };

  const VIEWS = ["play", "book", "install", "progress"];
  let view = "play";
  function setView(v) {
    view = v;
    document.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-selected", t.dataset.view === v));
    for (const k of VIEWS) $("v-" + k).hidden = v !== k;
    if (v === "play" && window.PocketGame) window.PocketGame.onShow();
    if (v === "install") { refreshSetup(); quizField.resize(); }
    if (v === "progress") renderProgress();
    if (v === "book") bookField.resize();
  }
  document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => setView(t.dataset.view)));

  let last = 0;
  function step(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
    if (view === "book" && book.playing) {
      if (book.t >= T_MAX) { book.hold += dt; if (book.hold > 0.8) { book.hold = 0; book.t = T_MIN; } }
      else book.t = Math.min(T_MAX, book.t + dt * book.rate);
      drawBook();
    }
    if (view === "install" && sess && quiz.playing && !$("instCard").hidden) {
      if (quiz.t >= T_MAX) { quiz.hold += dt; if (quiz.hold > 1.0) { quiz.hold = 0; quiz.t = T_MIN; } }
      else quiz.t = Math.min(T_MAX, quiz.t + dt * quiz.rate);
      quizField.t = quiz.t; quizField.draw();
      $("quizClock").textContent = fmt(quiz.t);
      const d = quizField.drop;
      if (d) { $("quizDrop").classList.toggle("on", Math.abs(quiz.t - d.t) < 0.2); $("quizDrop").textContent = "Top of drop · " + d.t.toFixed(1) + " s"; }
    }
    requestAnimationFrame(step);
  }

  function start(data) {
    data = data || {};
    if (data.cid && CBYID[data.cid]) book.cid = data.cid;
    renderConceptChips(); loadConcept(); setPlayIcon(); refreshSetup();
    const h = (location.hash || "").replace("#", "");
    setView(data.view || (VIEWS.includes(h) ? h : "play"));
    requestAnimationFrame(step);
  }
  try { window.claude?.hot?.snapshot?.(() => ({ view, cid: book.cid })); } catch (e) { }
  window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
})();
