/* Pocket QB: the Play screen. Draws a PocketRep and feeds it input.
   All rules (clock, kill, read, release, sack, scoring) live in rep.js. */
(function () {
  "use strict";
  const E = window.PocketEngine, B = window.PocketBook, D = window.PocketDefense, P = window.PocketPlay, RP = window.PocketRep, DR = window.PocketDrive;
  const $ = id => document.getElementById(id);
  const POSC = { X: "#F2B84B", H: "#FF8A6B", Y: "#9BE38C", Z: "#7FB8FF", RB: "#D7A8FF" };
  const POS_ORDER = ["X", "H", "Y", "Z", "RB"];
  const YR = 40;               // yards of field shown top to bottom
  const CAM_MIN = 30, CAM_MAX = 75;
  const CHALK = "#E4F0F3", TURF = "#0E2418", TEAL = "#37C6DB", GOLD = "#E8C547", RED = "#FF8455";
  const STRIPE = ["#10291B", "#133020"];          // mowing stripes, five yards each
  const CAL = window.PocketCalib;
  const lum = hex => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  /* the defense wears the chosen team's colors (league average: slate and chalk) */
  function teamKit(abbr) {
    const t = abbr && CAL.teams[abbr];
    if (!t) return { c1: "#2A3A42", c2: "#E4F0F3", ink: "#E4F0F3", name: "", nick: "" };
    let c2 = t.c2; if (Math.abs(lum(t.c1) - lum(c2)) < 0.25) c2 = lum(t.c1) > 0.5 ? "#0C1417" : "#FFFFFF";
    return { c1: t.c1, c2, ink: lum(t.c1) > 0.55 ? "#0C1417" : "#FFFFFF", name: t.name, nick: t.nick };
  }
  const CBYID = Object.fromEntries(B.CONCEPTS.map(c => [c.id, c]));
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const sgn = v => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2);
  const ABBR = { LCB: "CB", RCB: "CB", FS: "FS", SS: "SS", N: "N", DB: "DB", WLB: "W", MLB: "M", SLB: "S" };
  /* every coverage the defense can play, grouped by how many safeties are deep */
  const READ_GROUPS = [
    { deep: 2, label: "Two deep", covs: ["c2", "tampa2", "c4", "c6", "m2"] },
    { deep: 1, label: "One deep", covs: ["c1", "c3sky", "c3buzz", "fire"] },
    { deep: 0, label: "None deep", covs: ["c0"] }
  ];
  const covShort = k => D.COV[k].short || D.COV[k].label;

  /* ---------- stats (this browser only) ---------- */
  const SKEY = "pocket.play.v1";
  const blankStats = () => ({ level: 1, reps: 0, epa: 0, att: 0, comp: 0, int: 0, sack: 0, idOk: 0, idN: 0, readGap: 0, readN: 0,
    runs: 0, runYds: 0, mode: "snaps", pers: "11", games: 0, wins: 0, losses: 0, ties: 0, team: "" });
  let S = blankStats();
  try { const r = localStorage.getItem(SKEY); if (r) S = Object.assign(blankStats(), JSON.parse(r)); } catch (e) { }
  if (!P.LEVELS[S.level]) S.level = 1;
  const saveS = () => { try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) { } };

  /* a call reads formation, side, play: "Trips Rt Flood". The formation is the
     play's set in the personnel on the field. */
  const fmLabel = (c, flip) => {
    const f = (G && G.formFor(c.id)) || c.formation, fm = B.FORMATIONS[f];
    return `${fm.short} ${flip ? "Lt" : "Rt"}`;
  };
  const callName = (c, flip) => c ? `${fmLabel(c, flip)} ${c.name}` : "—";
  /* runs are never locked: Install drills the passing game */
  const unlocked = level => {
    if (!P.LEVELS[level].lock) return B.CONCEPTS.map(c => c.id);
    const m = (window.PocketInstall && window.PocketInstall.mastered()) || [];
    return B.CONCEPTS.filter(c => c.kind === "run" || m.includes(c.id)).map(c => c.id);
  };
  const passCount = ids => ids.filter(id => CBYID[id].kind !== "run").length;
  const MODE_KEYS = ["snaps", "drive", "twomin", "quarter", "half"];
  const MODE_LABEL = { snaps: "Snaps", drive: "Drive", twomin: "2-minute", quarter: "4th qtr", half: "2nd half" };

  /* ---------- canvas + camera ----------
     The view is 40 yards tall. Its top edge (camTop, yards downfield) starts
     at 30 and pans upfield to keep a deep ball and its catch point in view. */
  const cv = $("playField"), ctx = cv.getContext("2d");
  let camTop = CAM_MIN;
  function resize() {
    const box = cv.parentElement.clientWidth || 360;
    let w = box, h = Math.round(w * YR / D.FW);
    if (document.body.classList.contains("immersive")) {
      const maxH = Math.round(window.innerHeight * 0.56);
      if (h > maxH) { h = maxH; w = Math.round(h * D.FW / YR); }
    }
    const ws = w === box ? "100%" : w + "px";
    if (cv.style.width !== ws) cv.style.width = ws;
    const d = Math.min(2.5, window.devicePixelRatio || 1);
    if (cv.style.height !== h + "px") cv.style.height = h + "px";
    const W = Math.round(w * d), H = Math.round(h * d);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    draw();
  }
  new ResizeObserver(resize).observe(cv.parentElement);
  window.addEventListener("resize", resize);
  const toField = (cx, cy) => { const r = cv.getBoundingClientRect(); return { x: (cx - r.left) / r.width * D.FW, y: camTop - (cy - r.top) / r.height * YR }; };

  /* where the camera wants to be: it rides the ball, keeping it about 14 yards
     below the top edge, and stops once the catch point is in frame. A deep
     throw can span more than the 40 yards on screen, so it follows the ball
     rather than jumping to the catch point and dropping the QB end. */
  function camWant(t, ballPt) {
    let need = CAM_MIN;
    if (G && G.runRes && ballPt) need = ballPt.y + 14;
    else if (G && G.ball && t >= G.ball.e.ta) need = ballPt ? Math.max(G.ball.e.C.y + 6, ballPt.y + 10) : G.ball.e.C.y + 6;   // the run after the catch
    else if (G && G.ball && t >= G.ball.tLeave && ballPt) need = Math.min(G.ball.e.C.y + 6, ballPt.y + ballPt.h + 14);
    return Math.max(CAM_MIN, Math.min(CAM_MAX, need));
  }

  /* ---------- full-screen play mode ---------- */
  function enterImmersive() {
    document.body.classList.add("immersive");
    const el = document.documentElement;
    try { if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => { }); } catch (e) { }
    requestAnimationFrame(resize);
  }
  function exitImmersive() {
    document.body.classList.remove("immersive");
    try { if (document.fullscreenElement) document.exitFullscreen().catch(() => { }); } catch (e) { }
    requestAnimationFrame(resize);
  }

  /* ---------- rep lifecycle ---------- */
  let G = null, GM = null, lastPhase = null, between = null;
  function flash(text, tone) { if (G) G.msg = { text, tone: tone || "", until: performance.now() + 900 }; }
  function startSession() {
    GM = null;
    if (S.mode !== "snaps") { GM = DR.newGame(S.mode); GM.coord = P.coordinator(); GM.team = S.team || null; }
    newRep();
  }
  function newRep() {
    between = null;
    const opts = { personnel: S.pers, team: S.team || null };
    if (GM) { opts.sit = DR.sitFor(GM); opts.coord = GM.coord; }
    G = new RP.Rep(S.level, unlocked(S.level), opts);
    G.onFlash = flash;
    G.replay = { i: 0, playing: false, acc: 0 }; G.heat = false; G.heatCache = null; G.msg = null; G.scored = false;
    camTop = CAM_MIN; ptrs.clear();
    $("playSetup").hidden = true; $("playRep").hidden = false;
    lastPhase = null;
    renderTop(); sync(); resize();
  }
  function endSession() {
    G = null; GM = null; between = null; ptrs.clear();
    $("playRep").hidden = true; $("playSetup").hidden = false;
    exitImmersive(); renderSetup();
  }
  /* re-render controls on any phase change, and score the snap once */
  function sync() {
    if (!G) return;
    if (G.phase === "result" && !G.scored) score();
    if (G.phase !== lastPhase) { lastPhase = G.phase; renderCtl(); }
  }
  function score() {
    G.scored = true;
    const R = G.result, r = G.rep;
    if (R.oracle && R.oracle.overall) { S.readGap += Math.max(0, R.oracle.overall.best.ev - R.yourEV); S.readN++; }
    if (R.kind !== "delay") { S.idN++; if (R.id && R.id.cov === r.cov) S.idOk++; }
    S.reps++; S.epa += R.epa;
    if (R.e) { S.att++; if (R.kind === "complete") S.comp++; if (R.kind === "int") S.int++; }
    if (R.kind === "sack") S.sack++;
    if (R.kind === "run") { S.runs++; S.runYds += R.gain; }
    S.pers = G.personnel;
    if (GM) {
      GM.coord.note(R.kind, r.cov, R.epa);
      G.events = DR.applyPlay(GM, R);
      if (GM.over) { S.games++; if (GM.result === "win" || GM.result === "td") S.wins++; else if (GM.result === "loss" || GM.result === "none") S.losses++; else S.ties++; }
    }
    saveS();
    G.replay = { i: G.releaseFrameIndex(), playing: false, acc: 0 };
    G.heatCache = null;
  }

  /* ---------- gestures: hold = eyes, tap = fast, double tap = touch ---------- */
  const ptrs = new Map();
  cv.addEventListener("pointerdown", e => {
    if (!G || G.phase !== "live") return;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (_) { }
    const rec = { f: toField(e.clientX, e.clientY), hold: false };
    rec.timer = setTimeout(() => { rec.hold = true; if (G) G.setEye(rec.f); }, RP.HOLD_MS);
    ptrs.set(e.pointerId, rec);
  });
  cv.addEventListener("pointermove", e => {
    const rec = ptrs.get(e.pointerId); if (!rec) return;
    rec.f = toField(e.clientX, e.clientY);
    if (rec.hold && G) G.setEye(rec.f);
  });
  cv.addEventListener("pointerup", e => {
    const rec = ptrs.get(e.pointerId); if (!rec) return;
    clearTimeout(rec.timer); ptrs.delete(e.pointerId);
    if (!rec.hold && G) G.tapAt(rec.f, performance.now());
  });
  cv.addEventListener("pointercancel", e => { const r = ptrs.get(e.pointerId); if (r) clearTimeout(r.timer); ptrs.delete(e.pointerId); });

  /* ---------- drawing ---------- */
  function draw() {
    const W = cv.width, H = cv.height;
    if (!W) return;
    const s = W / D.FW, dpr = W / (cv.clientWidth || W);
    const top = camTop, bot = camTop - YR;
    const X = x => x * s, Y = y => (top - y) * s;
    ctx.clearRect(0, 0, W, H);
    /* the field is drawn in real yard lines: the line of scrimmage sits
       sit.yl yards from the goal, so the stripes, numbers and end zone line up
       with the actual spot of the ball */
    const gyl = G ? G.rep.sit.yl : (GM ? GM.yl : 75);
    const kit = teamKit(G ? G.team : (GM && GM.team) || S.team);
    const abs = y => gyl - y;                              // yards to the goal at field depth y
    ctx.fillStyle = STRIPE[0]; ctx.fillRect(0, 0, W, H);
    for (let a = Math.floor(abs(top) / 5) * 5; a <= abs(bot) + 5; a += 5) {
      if (a < 0 || a >= 100) continue;
      ctx.fillStyle = STRIPE[(Math.floor(a / 5) % 2 + 2) % 2];
      const y0 = Y(gyl - a), y1 = Y(gyl - a - 5);
      ctx.fillRect(0, y0, W, y1 - y0);
    }
    if (gyl + 10 < top) { ctx.fillStyle = "#0A1610"; ctx.fillRect(0, 0, W, Y(gyl + 10)); }   // past the end line
    // the end zone we attack, in the defense's colors with its name
    if (gyl < top) {
      const y0 = Math.max(0, Y(gyl + 10)), y1 = Y(gyl);
      ctx.fillStyle = kit.c1; ctx.globalAlpha = 0.55; ctx.fillRect(0, y0, W, y1 - y0); ctx.globalAlpha = 1;
      const mid = (Y(gyl + 10) + Y(gyl)) / 2;
      ctx.fillStyle = kit.c2; ctx.globalAlpha = 0.5; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = `700 ${Math.min(5.5 * s, 40 * dpr)}px "Saira Condensed", sans-serif`;
      ctx.fillText((kit.nick || "End zone").toUpperCase(), W / 2, mid); ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 2.2 * dpr;
      ctx.beginPath(); ctx.moveTo(0, Y(gyl)); ctx.lineTo(W, Y(gyl)); ctx.stroke();
      if (gyl + 10 < top) { ctx.beginPath(); ctx.moveTo(0, Y(gyl + 10)); ctx.lineTo(W, Y(gyl + 10)); ctx.stroke(); }
    }
    // yard lines every 5, numbers every 10 (with the arrow toward the nearer goal), hashes and sideline ticks
    for (let a = Math.ceil(abs(top) / 5) * 5; a <= abs(bot); a += 5) {
      if (a <= 0 || a >= 100) continue;
      const y = Y(gyl - a);
      ctx.strokeStyle = "rgba(255,255,255,.28)"; ctx.lineWidth = (a % 10 ? 1 : 1.5) * dpr;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      if (a % 10 === 0) {
        const n = a > 50 ? 100 - a : a;
        ctx.fillStyle = "rgba(255,255,255,.30)"; ctx.textBaseline = "middle"; ctx.textAlign = "center";
        ctx.font = `700 ${Math.max(14 * dpr, 2.1 * s)}px "Saira Condensed", sans-serif`;
        for (const nx of [12, 41.3]) {
          ctx.fillText(String(n), X(nx), y);
          if (n !== 50) {   // the arrow points to the goal line this number counts toward
            const w = ctx.measureText(String(n)).width, ax = X(nx) - w / 2 - 6 * dpr, up = a < 50;
            ctx.beginPath(); ctx.moveTo(ax, y + (up ? -5 : 5) * dpr); ctx.lineTo(ax - 3 * dpr, y); ctx.lineTo(ax + 3 * dpr, y); ctx.closePath(); ctx.fill();
          }
        }
      }
    }
    ctx.strokeStyle = "rgba(255,255,255,.32)"; ctx.lineWidth = dpr;
    for (let a = Math.ceil(abs(top)); a <= abs(bot); a++) {
      if (a <= 0 || a >= 100 || a % 5 === 0) continue;
      const y = Y(gyl - a);
      for (const hx of [23.58, 29.75]) { ctx.beginPath(); ctx.moveTo(X(hx - .33), y); ctx.lineTo(X(hx + .33), y); ctx.stroke(); }
      for (const hx of [0.15, 52.6]) { ctx.beginPath(); ctx.moveTo(X(hx), y); ctx.lineTo(X(hx + 0.55), y); ctx.stroke(); }
    }
    // relative depth guide on the left edge (yards past the line of scrimmage)
    ctx.font = `500 ${9 * dpr}px "JetBrains Mono", monospace`; ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.fillStyle = "rgba(228,240,243,.38)";
    for (let y = Math.ceil(bot / 5) * 5; y <= top; y += 5) if (y > 0 && y < gyl) ctx.fillText("+" + y, 3 * dpr, Y(y) - 6 * dpr);
    if (!G) return;
    const sit = G.rep.sit;
    const runArrow = (sim, c, alpha) => {
      const rb = sim.players.RB; if (!rb) return;
      const dir = (G.rep.flip ? -1 : 1) * (c.runDir || 1), ax = D.FW / 2 + dir * ({ B: 2.8, C: 5.0, edge: 9.5 }[c.aim] || 3);
      const st = rb.run.start;
      ctx.globalAlpha = alpha; ctx.strokeStyle = POSC.RB; ctx.lineWidth = 2.4 * dpr; ctx.setLineDash([5 * dpr, 4 * dpr]);
      ctx.beginPath(); ctx.moveTo(X(st.x), Y(st.y)); ctx.quadraticCurveTo(X(ax), Y(st.y + 1), X(ax), Y(3)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = POSC.RB; ctx.beginPath(); ctx.moveTo(X(ax), Y(4.2)); ctx.lineTo(X(ax) - 5 * dpr, Y(3)); ctx.lineTo(X(ax) + 5 * dpr, Y(3)); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    };
    if (sit.togo < top && sit.togo < sit.yl) { ctx.strokeStyle = "rgba(232,197,71,.75)"; ctx.lineWidth = 2 * dpr; ctx.beginPath(); ctx.moveTo(0, Y(sit.togo)); ctx.lineTo(W, Y(sit.togo)); ctx.stroke(); }
    ctx.strokeStyle = "rgba(55,198,219,.85)"; ctx.lineWidth = 2 * dpr; ctx.beginPath(); ctx.moveTo(0, Y(0)); ctx.lineTo(W, Y(0)); ctx.stroke();

    const L = P.LEVELS[G.level];
    const shadow = (x, y, r) => { ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(x + 1.5 * dpr, y + r * 0.55, r * 0.95, r * 0.45, 0, 0, 7); ctx.fill(); };
    const jersey = (x, y, r, fill, edge, text, ink, sq) => {
      shadow(x, y, r);
      ctx.fillStyle = fill; ctx.strokeStyle = edge; ctx.lineWidth = 1.6 * dpr; ctx.beginPath();
      if (sq) { const q = r * 0.92; if (ctx.roundRect) ctx.roundRect(x - q, y - q, 2 * q, 2 * q, 3 * dpr); else ctx.rect(x - q, y - q, 2 * q, 2 * q); }
      else ctx.arc(x, y, r, 0, 7);
      ctx.fill(); ctx.stroke();
      if (text) { ctx.fillStyle = ink; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = `700 ${(text.length > 1 ? 8 : 10) * dpr}px "Archivo", sans-serif`; ctx.fillText(text, x, y + 0.5 * dpr); }
    };
    /* motion trails: the last 0.6 s of everyone's path, fading */
    const drawTrails = (upto) => {
      const F = G.frames; if (!F.length || upto < 1) return;
      const i0 = Math.max(0, upto - 1), tEnd = F[i0].t;
      let j = i0; while (j > 0 && tEnd - F[j - 1].t <= 0.6) j--;
      if (i0 - j < 2) return;
      ctx.lineCap = "round"; ctx.lineWidth = 2.2 * dpr;
      const seg = (get, col) => {
        for (let k = j + 1; k <= i0; k++) {
          const a = get(F[k - 1]), b = get(F[k]); if (!a || !b) continue;
          ctx.globalAlpha = 0.45 * (k - j) / (i0 - j + 1); ctx.strokeStyle = col;
          ctx.beginPath(); ctx.moveTo(X(a.x), Y(a.y)); ctx.lineTo(X(b.x), Y(b.y)); ctx.stroke();
        }
      };
      for (const pos of POS_ORDER) if (G.sim.players[pos] && !G.sim.players[pos].blocking || (pos === "RB" && G.runRes)) seg(f => f.recv[pos], POSC[pos]);
      G.def.players.forEach((p, i) => { if (!p.dl) seg(f => f.defs[i], kit.c1 === "#2A3A42" ? "#9FB3B9" : kit.c1); });
      seg(f => f.ball, "#E8A06A");
      ctx.globalAlpha = 1; ctx.lineCap = "butt";
    };

    if (G.phase === "huddle") {
      const id = G[G.slot] || G.call;
      if (L.huddle === "diagram" && id) { const sm = G.simFor(id); drawRoutes(sm, 1, true); if (CBYID[id].kind === "run") runArrow(sm, CBYID[id], 1); }
      else {
        ctx.fillStyle = "rgba(12,20,23,.85)"; ctx.fillRect(W * 0.12, H * 0.32, W * 0.76, H * 0.3);
        ctx.strokeStyle = "rgba(228,240,243,.25)"; ctx.lineWidth = dpr; ctx.strokeRect(W * 0.12, H * 0.32, W * 0.76, H * 0.3);
        ctx.fillStyle = CHALK; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = `600 ${11 * dpr}px "JetBrains Mono", monospace`;
        ctx.fillText("WRISTBAND", W / 2, H * 0.38);
        ctx.font = `700 ${18 * dpr}px "Saira Condensed", sans-serif`;
        ctx.fillText(G.call ? callName(CBYID[G.call], G.rep.flip) : "No call yet", W / 2, H * 0.46);
        ctx.fillStyle = "rgba(228,240,243,.65)"; ctx.font = `600 ${14 * dpr}px "Saira Condensed", sans-serif`;
        ctx.fillText(G.kill ? "Kill: " + callName(CBYID[G.kill], G.rep.flip) : "No kill", W / 2, H * 0.54);
      }
      drawLineAndQB({ x: D.FW / 2, y: -5 }, 0);
      return;
    }

    const fr = G.phase === "result" && G.frames.length ? G.frames[Math.max(0, Math.min(G.frames.length - 1, G.replay.i))] : null;

    if (fr && G.heat) drawHeat(fr);
    if (G.phase === "result") drawRoutes(G.sim, 0.45, false);
    else if (L.view === "faint") { drawRoutes(G.sim, 0.22, false); if (G.isRun() && G.phase === "line") runArrow(G.sim, G.concept(), 0.3); }

    if (G.phase === "result" && G.def.zones) {
      for (const p of G.def.players) if (!p.rush && p.land) {
        ctx.strokeStyle = "rgba(228,240,243,.35)"; ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.lineWidth = dpr;
        ctx.beginPath(); ctx.arc(X(p.land.x), Y(p.land.y), 2.2 * s, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      }
    }

    const live = G.phase === "live";
    const tNow = fr ? fr.t : (live ? G.t : 0);
    if (live) drawTrails(G.frames.length); else if (fr) drawTrails(G.replay.i + 1);
    const qb = fr ? fr.qb : (live ? E.qbAt(G.drop(), G.t) : { x: D.FW / 2, y: -5 });
    const thrown = G.ball && tNow >= G.ball.tLeave;
    if ((live || fr) && !thrown && tNow > 0 && !G.runRes) {
      const k = Math.max(0, 1 - tNow / G.rep.sackT);
      ctx.strokeStyle = tNow > G.rep.sackT - 0.5 ? RED : "rgba(255,132,85,.45)"; ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.arc(X(qb.x), Y(qb.y), (1.2 + 3.2 * k) * s, 0, 7); ctx.stroke();
    }
    const pend = fr ? fr.pend : (G.pending && !G.ball ? Math.min(1, (G.t - G.pending.t1) / G.pending.rel) : 0);
    drawLineAndQB(qb, pend);

    // receivers
    for (const pos of POS_ORDER) {
      const pl = G.sim.players[pos]; if (!pl) continue;
      let st;
      if (fr) st = fr.recv[pos];
      else if (live) st = G.receiverShown(pos, G.t);
      else st = pl.run.start;
      const reveal = G.phase === "result" || L.view !== "dots";
      const r = Math.max(8 * dpr, 0.8 * s);
      jersey(X(st.x), Y(st.y), r, reveal ? POSC[pos] : CHALK, "rgba(255,255,255,.9)", reveal ? pos : "", "#0C1417");
    }

    // defenders
    const outl = new Set(G.rep.scout.map(x => x.id));
    const dst = fr ? fr.defs : (live ? G.defenderStates(G.t) : G.def.players.map(p => D.preState(G.def, p, G.tau)));
    G.def.players.forEach((p, i) => {
      const st = dst[i]; if (!st) return;
      const x = X(st.x), y = Y(st.y);
      if (p.rush && (p.dl || G.phase === "live" || G.phase === "result")) {
        const q = Math.max(7.5 * dpr, 0.62 * s), free = G.plan && G.plan.freeId === p.id;
        jersey(x, y, q, kit.c1, free ? RED : kit.c2, p.blitz ? (ABBR[p.id] || "") : "", kit.ink, true);
        if (free) { ctx.strokeStyle = RED; ctx.lineWidth = 2.2 * dpr; ctx.beginPath(); ctx.arc(x, y, q * 1.7, 0, 7); ctx.stroke(); }
        return;
      }
      const r = Math.max(8.5 * dpr, 0.85 * s);
      shadow(x, y, r);
      ctx.fillStyle = kit.c1; ctx.strokeStyle = kit.c2; ctx.lineWidth = 1.8 * dpr;
      ctx.beginPath(); ctx.moveTo(x, y - r * 1.05); ctx.lineTo(x + r, y + r * 0.8); ctx.lineTo(x - r, y + r * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (outl.has(p.id) && G.level >= 4) { ctx.strokeStyle = GOLD; ctx.lineWidth = 2 * dpr; ctx.beginPath(); ctx.arc(x, y + r * 0.1, r + 4 * dpr, 0, 7); ctx.stroke(); }
      ctx.fillStyle = kit.ink; ctx.font = `700 ${8 * dpr}px "Archivo", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(ABBR[p.id] || p.id, x, y + r * 0.25);
    });

    // eyes
    const eye = fr ? fr.eye : (live ? G.eye : null);
    if (eye) {
      ctx.strokeStyle = TEAL; ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.arc(X(eye.x), Y(eye.y), 12 * dpr, 0, 7); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(X(eye.x) - 17 * dpr, Y(eye.y)); ctx.lineTo(X(eye.x) - 7 * dpr, Y(eye.y));
      ctx.moveTo(X(eye.x) + 7 * dpr, Y(eye.y)); ctx.lineTo(X(eye.x) + 17 * dpr, Y(eye.y));
      ctx.moveTo(X(eye.x), Y(eye.y) - 17 * dpr); ctx.lineTo(X(eye.x), Y(eye.y) - 7 * dpr);
      ctx.moveTo(X(eye.x), Y(eye.y) + 7 * dpr); ctx.lineTo(X(eye.x), Y(eye.y) + 17 * dpr); ctx.stroke();
      ctx.globalAlpha = 0.35; ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.beginPath(); ctx.moveTo(X(qb.x), Y(qb.y)); ctx.lineTo(X(eye.x), Y(eye.y)); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }

    // ball
    const b = fr ? fr.ball : (live ? G.ballAt(G.t) : null);
    if (b) {
      const hs = 1 + Math.min(0.6, b.h / 8);                 // a ball high in the air reads bigger, its shadow smaller
      ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.beginPath(); ctx.ellipse(X(b.x), Y(b.y), 4.5 * dpr / hs, 2.6 * dpr / hs, 0, 0, 7); ctx.fill();
      const bx = X(b.x), by = Y(b.y + b.h);
      ctx.save(); ctx.translate(bx, by); ctx.rotate(-0.6);
      ctx.fillStyle = "#8A4B25"; ctx.strokeStyle = "#3A1E0E"; ctx.lineWidth = dpr;
      ctx.beginPath(); ctx.ellipse(0, 0, 6.5 * dpr * hs, 4 * dpr * hs, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 1.1 * dpr;
      ctx.beginPath(); ctx.moveTo(-2.6 * dpr * hs, 0); ctx.lineTo(2.6 * dpr * hs, 0);
      for (let k = -2; k <= 2; k++) { ctx.moveTo(k * dpr * hs, -1.1 * dpr * hs); ctx.lineTo(k * dpr * hs, 1.1 * dpr * hs); }
      ctx.stroke(); ctx.restore();
    }
    // where the ball is headed (live, once thrown) and how it ended (result)
    if (G.ball && (live || fr) && tNow >= G.ball.tLeave) {
      const C = G.ball.e.C;
      if (G.phase === "result") {
        const ok = G.result.kind === "complete", q = 6 * dpr;
        ctx.strokeStyle = ok ? "#4CCB83" : RED; ctx.lineWidth = 2.5 * dpr; ctx.beginPath();
        if (ok) ctx.arc(X(C.x), Y(C.y), q + 3 * dpr, 0, 7);
        else { ctx.moveTo(X(C.x) - q, Y(C.y) - q); ctx.lineTo(X(C.x) + q, Y(C.y) + q); ctx.moveTo(X(C.x) + q, Y(C.y) - q); ctx.lineTo(X(C.x) - q, Y(C.y) + q); }
        ctx.stroke();
      } else {
        ctx.strokeStyle = "rgba(228,240,243,.5)"; ctx.setLineDash([2 * dpr, 3 * dpr]); ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath(); ctx.arc(X(C.x), Y(C.y), 9 * dpr, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // QB below the frame on a deep ball: a small marker on the bottom edge
    if (qb.y < bot) {
      ctx.fillStyle = "rgba(228,240,243,.7)"; ctx.beginPath();
      ctx.moveTo(X(qb.x), H - 2 * dpr); ctx.lineTo(X(qb.x) - 6 * dpr, H - 10 * dpr); ctx.lineTo(X(qb.x) + 6 * dpr, H - 10 * dpr); ctx.closePath(); ctx.fill();
    }

    function drawLineAndQB(q, pnd) {
      const ol = Math.max(6.5 * dpr, 0.55 * s);
      for (const o of B.OL) jersey(X(o.x), Y(o.y), ol, "#C9D6DA", "rgba(255,255,255,.9)", "", "", true);
      jersey(X(q.x), Y(q.y), Math.max(7 * dpr, 0.75 * s), CHALK, "#FFFFFF", "", "", false);
      if (pnd > 0) {
        ctx.strokeStyle = TEAL; ctx.lineWidth = 3 * dpr;
        ctx.beginPath(); ctx.arc(X(q.x), Y(q.y), Math.max(7 * dpr, 0.75 * s) + 4 * dpr, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * pnd); ctx.stroke();
      }
      ctx.fillStyle = TURF; ctx.font = `700 ${8.5 * dpr}px "Archivo", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("QB", X(q.x), Y(q.y) + 0.5 * dpr);
    }
    function drawRoutes(sim, alpha, labels) {
      for (const pos of POS_ORDER) {
        const pl = sim.players[pos]; if (!pl) continue;
        const run = pl.run;
        ctx.globalAlpha = alpha; ctx.strokeStyle = POSC[pos]; ctx.lineWidth = 2.2 * dpr; ctx.lineJoin = "round";
        ctx.beginPath(); ctx.moveTo(X(run.start.x), Y(run.start.y));
        let last = run.start;
        for (let t = run.t0; t <= Math.min(run.tEnd, 5.5); t += 0.04) { const st = run.stateAt(t); last = st; ctx.lineTo(X(st.x), Y(st.y)); }
        ctx.stroke(); ctx.globalAlpha = 1;
        if (labels) {
          let lp = last;
          if (lp.y > top - 2) { for (let t = Math.min(run.tEnd, 5.5); t > run.t0; t -= 0.04) { const st = run.stateAt(t); if (st.y <= top - 2) { lp = st; break; } } }
          ctx.font = `600 ${10.5 * dpr}px "JetBrains Mono", monospace`;
          const txt = pl.route.label, w = ctx.measureText(txt).width + 8 * dpr, h = 15 * dpr;
          const lx = Math.min(W - w - 2 * dpr, Math.max(2 * dpr, X(lp.x) - w / 2)), ly = Math.max(2 * dpr, Y(lp.y) - h - 6 * dpr);
          ctx.fillStyle = "rgba(12,20,23,.82)"; ctx.fillRect(lx, ly, w, h);
          ctx.fillStyle = POSC[pos]; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(txt, lx + 4 * dpr, ly + h / 2);
          const st = run.start, r = Math.max(8 * dpr, 0.8 * s);
          ctx.beginPath(); ctx.arc(X(st.x), Y(st.y), r, 0, 7); ctx.fill();
          ctx.fillStyle = TURF; ctx.textAlign = "center"; ctx.font = `700 ${(pos.length > 1 ? 8.5 : 10.5) * dpr}px "Archivo", sans-serif`;
          ctx.fillText(pos, X(st.x), Y(st.y) + 0.5 * dpr);
        }
      }
    }
    function drawHeat(f) {
      // one offscreen canvas, recomputed only when the frame or the camera moves
      const key = G.replay.i + ":" + top.toFixed(1);
      if (!G.heatCache || G.heatCache.key !== key) {
        const ks = [];
        G.def.players.forEach((p, i) => { if (!p.rush) ks.push(D.kernel(p, f.defs[i], f.qb)); });
        const octx = HEAT.getContext("2d"), img = octx.createImageData(HEAT.width, HEAT.height);
        for (let j = 0; j < HEAT.height; j++) for (let i = 0; i < HEAT.width; i++) {
          const v = D.coverage(ks, (i + 0.5) * HEAT_CELL, top - (j + 0.5) * HEAT_CELL);
          let k = 0; while (k < HEAT_STOPS.length - 2 && v > HEAT_STOPS[k + 1][0]) k++;
          const A = HEAT_STOPS[k], Bc = HEAT_STOPS[k + 1], u = Math.max(0, Math.min(1, (v - A[0]) / (Bc[0] - A[0])));
          const o = (j * HEAT.width + i) * 4;
          for (let q = 0; q < 3; q++) img.data[o + q] = A[1][q] + (Bc[1][q] - A[1][q]) * u;
          img.data[o + 3] = 255 * Math.min(0.85, v * 1.3);
        }
        octx.putImageData(img, 0, 0);
        G.heatCache = { key };
      }
      ctx.imageSmoothingEnabled = true; ctx.drawImage(HEAT, 0, 0, W, H);
    }
  }
  const HEAT_CELL = 0.8;
  const HEAT = document.createElement("canvas");
  HEAT.width = Math.ceil(53.33 / HEAT_CELL); HEAT.height = Math.ceil(YR / HEAT_CELL);
  const HEAT_STOPS = [[0, [12, 20, 23]], [0.22, [20, 69, 79]], [0.46, [28, 126, 147]], [0.7, [49, 182, 204]], [1, [159, 231, 241]]];

  /* ---------- DOM: top bar and controls ---------- */
  function renderTop() {
    if (G) $("pSit").textContent = P.sitLabel(G.rep.sit);
    else if (GM) $("pSit").textContent = GM.over ? "Final" : P.sitLabel(DR.sitFor(GM));
    $("pLevel").textContent = `Level ${S.level} · ${P.LEVELS[S.level].label}`;
    renderBoard();
  }
  /* the scoreboard strip: score, quarter, game clock, timeouts */
  function renderBoard() {
    const el = $("pBoard");
    if (!GM) { el.hidden = true; return; }
    el.hidden = false;
    const clock = DR.timed(GM) ? `<span class="bq">Q${GM.q} ${DR.fmtClock(GM.clock)}${GM.stopped ? "" : " <i class=\"run\">▶</i>"}</span>` : `<span class="bq">${esc(DR.MODES[GM.mode].label)}</span>`;
    const to = DR.timed(GM) ? `<span class="bto" aria-label="${GM.to} timeouts left">${[0, 1, 2].map(i => `<i class="${i < GM.to ? "on" : ""}"></i>`).join("")}</span>` : "";
    el.innerHTML = `<span class="bs"><b>YOU</b> ${GM.us}</span><span class="bs">${GM.them} <b>OPP</b></span>${clock}${to}`;
  }
  function renderCtl() {
    const el = $("playCtl"), r = G.rep;
    $("pPhase").textContent = { huddle: "Huddle", line: "At the line", live: "Live", result: "Result" }[G.phase];
    if (G.phase === "huddle") {
      const pk = D.PKG[r.pkg];
      const scout = G.level >= 4 && r.scout.length
        ? `<div class="scout">${r.scout.map(x => `<div class="sc"><b>${esc(x.name)}</b><span>Range ${x.range} · Burst ${x.burst} · Ball skills ${x.ball}</span></div>`).join("")}</div>` : "";
      const avail = G.available();
      el.innerHTML = `
        <div class="persrow"><span class="lab">Personnel</span><div class="seg" id="persSeg" role="group" aria-label="Offensive personnel">${Object.keys(B.PERSONNEL).map(k =>
          `<button data-pers="${k}" aria-pressed="${k === G.personnel}" title="${esc(B.PERSONNEL[k].desc)}">${k}</button>`).join("")}</div><span class="cnt">${esc(B.PERSONNEL[G.personnel].desc)}</span></div>
        <div class="pers"><span class="lab">Defense</span><b>${esc(pk.label)}</b><span class="cnt">${esc(pk.count)}</span>${G.team ? `<span class="opp" style="--tc:${CAL.teams[G.team].c1}">${esc(CAL.teams[G.team].name)}</span>` : ""}</div>
        ${scoutHTML()}
        ${scout}
        <div class="slots">
          <button class="slot" data-slot="call" aria-pressed="${G.slot === "call"}"><span class="lab">Call</span><b>${esc(G.call ? callName(CBYID[G.call], r.flip) : "Pick a play")}</b></button>
          <button class="slot" data-slot="kill" aria-pressed="${G.slot === "kill"}"><span class="lab">Kill</span><b>${esc(G.kill ? callName(CBYID[G.kill], r.flip) : "Pick a play")}</b></button>
        </div>
        <div class="chips wrap" id="callChips">${avail.map(id => `<button class="chip toggle${CBYID[id].kind === "run" ? " runchip" : (CBYID[id].pa ? " pachip" : "")}" data-cid="${id}" aria-pressed="${id === G[G.slot]}">${esc(CBYID[id].name)}</button>`).join("")}</div>
        <button class="bigbtn" id="breakBtn" ${G.call ? "" : "disabled"}>Break huddle</button>
        <p class="hint">Runs are green, play-action gold. Changing personnel brings on a new defensive package and call. The huddle breaks itself at :${P.AUTO_BREAK}.</p>`;
      el.querySelectorAll("[data-slot]").forEach(b => b.onclick = () => { G.setSlot(b.dataset.slot); renderCtl(); draw(); });
      $("callChips").onclick = e => { const b = e.target.closest("[data-cid]"); if (!b) return; G.pick(b.dataset.cid); renderCtl(); draw(); };
      $("persSeg").onclick = e => { const b = e.target.closest("[data-pers]"); if (!b) return; if (G.setPersonnel(b.dataset.pers)) { S.pers = G.personnel; saveS(); } renderCtl(); draw(); };
      $("breakBtn").onclick = () => { G.breakHuddle(); sync(); };
    } else if (G.phase === "line") {
      const live = G.concept(), other = G.kill ? CBYID[G[G.live === "call" ? "kill" : "call"]] : null;
      el.innerHTML = `
        <button class="killbtn" id="killBtn" ${other ? "" : "disabled"}><span class="lab">${G.live === "kill" ? "Killed to" : "Live call"}</span><b>${esc(callName(live, r.flip))}</b>
          <small>${other ? "Tap to switch to " + esc(other.name) : "No kill called"}</small></button>
        <div class="readhead"><span class="lab">Your coverage read</span><span class="hint">Right: faster trigger · Wrong shell: you hesitate</span></div>
        <div class="readgrid" id="readGrid">${READ_GROUPS.map(g => `<div class="rg"><span class="rgl">${g.label}</span><div class="chips wrap">${g.covs.map(k =>
          `<button class="chip toggle" data-cov="${k}" aria-pressed="${G.id.cov === k}">${esc(covShort(k))}</button>`).join("")}</div></div>`).join("")}</div>
        ${G.isRun() ? `<p class="hint">Run call: count the box. Six or fewer near the line favors the run; seven or eight means kill to a pass.</p>` : `<div class="readhead"><span class="lab">Protection</span><span class="hint">Slide the line toward the pressure</span></div>
        <div class="protrow">
          <div class="seg" id="slideSeg" role="group" aria-label="Slide protection"><button data-slide="L" aria-pressed="${G.prot.slide === "L"}">Slide left</button><button data-slide="R" aria-pressed="${G.prot.slide === "R"}">Slide right</button></div>
          <button class="chip toggle" id="keepBtn" aria-pressed="${G.prot.keepRB}">Keep RB in</button>
        </div>`}
        <button class="bigbtn snapbtn" id="snapBtn">Snap</button>`;
      $("killBtn").onclick = () => { G.toggleKill(); renderCtl(); draw(); };
      $("readGrid").onclick = e => { const b = e.target.closest("[data-cov]"); if (!b) return; G.setRead(G.id.cov === b.dataset.cov ? null : b.dataset.cov); renderCtl(); };
      if ($("slideSeg")) {
        $("slideSeg").onclick = e => { const b = e.target.closest("[data-slide]"); if (!b) return; G.setProtection(b.dataset.slide); renderCtl(); };
        $("keepBtn").onclick = () => { G.setProtection(undefined, !G.prot.keepRB); renderCtl(); };
      }
      $("snapBtn").onclick = () => { G.snap(); sync(); };
    } else if (G.phase === "live" && G.runRes) {
      el.innerHTML = `<p class="hint strong">Handoff. Watch the blocks and the box.</p>`;
    } else if (G.phase === "live") {
      el.innerHTML = `<p class="hint strong">Hold to look · Tap a receiver to throw · Double-tap for touch</p>
        <button class="ghost" id="awayBtn">Throw it away</button>`;
      $("awayBtn").onclick = () => { G.throwAway(); sync(); };
    } else if (G.phase === "result") {
      el.innerHTML = resultHTML();
      $("replayBtn").onclick = () => { G.replay = { i: 0, playing: true, acc: 0 }; };
      $("repScrub").oninput = e => { G.replay.i = +e.target.value; G.replay.playing = false; };
      $("heatBtn").onclick = () => { G.heat = !G.heat; $("heatBtn").setAttribute("aria-pressed", G.heat); };
      wireGame();
    }
  }

  /* ---------- between plays (game modes) ----------
     After a result: fourth-down choices, timeouts, the spike, and the
     opponent's possessions, which arrive as events from drive.js. */
  function gameHTML(evs) {
    if (!GM) return `<button class="bigbtn" id="nextBtn2">Next snap</button><button class="ghost wide" id="doneBtn">End session</button>`;
    let h = evs && evs.length ? `<div class="evs">${evs.map(t => `<span>${esc(t)}</span>`).join("")}</div>` : "";
    if (GM.over) {
      const res = { win: "You won", loss: "You lost", tie: "Tie game", td: "Touchdown drive", fg: "Field goal drive", none: "No points" }[GM.result] || "Final";
      const ok = GM.result === "win" || GM.result === "td" || GM.result === "fg";
      h += `<div class="reshead ${ok ? "good" : "bad"}"><b>${esc(res)}</b><span class="epa">${GM.us}–${GM.them}</span></div>
        <div class="glog">${GM.log.slice(-8).map(l => `<div class="${l.kind}">${DR.timed(GM) && l.clock != null ? `<span>Q${l.q} ${DR.fmtClock(l.clock)}</span>` : "<span></span>"}${esc(l.text)}</div>`).join("")}</div>
        <button class="bigbtn" id="newGameBtn">Play again</button><button class="ghost wide" id="doneBtn">End session</button>`;
      return h;
    }
    const sit = DR.sitFor(GM);
    h += `<div class="nextup"><span class="lab">Next</span><b>${esc(P.sitLabel(sit))}</b></div>`;
    const btns = [];
    if (GM.down === 4) {
      const fg = DR.fgOdds(GM), dist = GM.yl + 17;
      btns.push(`<button class="ghost" data-sp="punt">Punt</button>`);
      if (dist <= 66) btns.push(`<button class="ghost" data-sp="fg">${dist}-yd field goal · ${Math.round(fg * 100)}%</button>`);
      const go = DR.goRate(GM);
      if (go != null) h += `<p class="hint">NFL coaches went for it ${Math.round(go * 100)}% of the time on 4th and ${GM.togo <= 1 ? "1" : (GM.togo <= 3 ? "2-3" : (GM.togo <= 6 ? "4-6" : "7+"))} from here (2023-25).</p>`;
    }
    if (DR.timed(GM) && !GM.stopped) {
      btns.push(`<button class="ghost" data-sp="to" ${GM.to ? "" : "disabled"}>Timeout (${GM.to})</button>`);
      if (GM.down < 4) btns.push(`<button class="ghost" data-sp="spike">Spike it</button>`);
    }
    if (btns.length) h += `<div class="resbtns">${btns.join("")}</div>`;
    h += `<button class="bigbtn" id="nextBtn2">${GM.down === 4 ? "Go for it" : "Next snap"}</button><button class="ghost wide" id="doneBtn">End session</button>`;
    return h;
  }
  function wireGame() {
    const n = $("nextBtn2"); if (n) n.onclick = newRep;
    const d = $("doneBtn"); if (d) d.onclick = endSession;
    const ng = $("newGameBtn"); if (ng) ng.onclick = startSession;
    document.querySelectorAll("#playCtl [data-sp]").forEach(b => b.onclick = () => {
      const k = b.dataset.sp;
      if (k === "to") { DR.timeout(GM); showBetween(["Timeout"]); }
      else if (k === "spike") { DR.spike(GM); showBetween(["Spiked: clock stopped"]); }
      else showBetween(DR.special(GM, k));
    });
  }
  function showBetween(evs) {
    G = null; between = { evs }; lastPhase = null; ptrs.clear();
    $("pPhase").textContent = GM && GM.over ? "Final" : "Between plays";
    $("playCtl").innerHTML = gameHTML(evs);
    $("pClock").textContent = ""; $("pClockLab").textContent = ""; $("pClock").classList.remove("warn");
    wireGame(); renderTop(); camTop = CAM_MIN; draw();
  }

  /* the scouting report: what NFL defenses (or the chosen team) call in this
     package and situation, from the 2025 coverage charting */
  function scoutHTML() {
    const r = G.rep, tl = P.tendencies(r.pkg, r.sit, G.team ? CAL.teams[G.team] : null).slice(0, 3);
    const who = G.team ? CAL.teams[G.team].nick : "NFL defenses";
    const bk = { early: "on early downs", "3s": "on 3rd and short", "3m": "on 3rd and medium", "3l": "on 3rd and long", red: "in the red zone", goal: "inside the 5", two: "in the two-minute drill" }[P.sitBucket(r.sit)];
    return `<div class="scoutrep"><span class="lab">Tendencies</span><span class="hint">${esc(who)} in ${esc(D.PKG[r.pkg].label.toLowerCase())} ${bk}</span>
      <div class="tbars">${tl.map(t => `<div class="tb"><span>${esc(covShort(t.cov))}</span><i style="width:${Math.round(t.p * 100)}%"></i><b>${Math.round(t.p * 100)}%</b></div>`).join("")}</div></div>`;
  }
  /* one line of league context for the result: how this kind of play went in the NFL */
  function nflRow(R) {
    const pct = v => Math.round(v * 100) + "%";
    if (R.kind === "run" && R.run) {
      const nb = Math.max(5, Math.min(10, R.run.boxNFL)), b = CAL.runBox[nb];
      return b ? `NFL runs into a ${nb}-man box (2023-25): ${b.ypc.toFixed(1)} yards a carry, ${pct(b.ten)} went 10+, ${pct(b.stuff)} were stopped at or behind the line.` : null;
    }
    if (R.kind === "sack") return `NFL quarterbacks were sacked on ${(CAL.dropback.sack * 100).toFixed(1)}% of dropbacks, with a median ${CAL.dropback.ttt.toFixed(1)} s to throw (2023-25).`;
    if (R.e) {
      const a = R.e.air, b = CAL.passAir.find(x => a >= x.lo && a < x.hi);
      let t = b ? `NFL passes thrown ${b.lo < 0 ? "behind the line" : b.lo + "-" + (b.hi - 1) + " yards"} in the air: ${pct(b.comp)} complete, ${b.yac.toFixed(1)} yards after the catch (2023-25).` : "";
      const fam = D.COV[G.rep.cov].fam, pc = CAL.passCov[fam === "tampa2" ? "c2" : fam];
      if (pc) t += ` Against ${covShort(G.rep.cov)}-family coverage in 2025, dropbacks averaged ${sgn(pc.epa)} EPA.`;
      if (G.concept().pa) t += ` Play-action dropbacks: ${sgn(CAL.pa.epa)} EPA vs ${sgn(CAL.pa.epaNo)} without.`;
      return t;
    }
    return null;
  }
  /* the zone defenders' match rules at the release, in coaching language */
  const ROLE_NAME = { c3corner: "deep-third corner", mof: "middle-of-field safety", curlflat: "curl/flat defender", seamcurl: "seam/curl defender",
    hook: "hook defender", rat: "hole defender", qcorner: "quarters corner", qsafety: "quarters safety", apex: "apex defender",
    half: "half-field safety", c2corner: "cloud corner", pipe: "pipe defender" };
  function matchText(b) {
    const num = pos => { const N = b.nums || { L: [], R: [] }; for (const k of ["L", "R"]) { const i = N[k].indexOf(pos); if (i >= 0) return `#${i + 1}`; } return pos === "RB" ? "the back" : ""; };
    const tech = { top: "over the top of", top1: "in man on", top1o: "in man, outside leverage, on", wall: "walling", flat: "in the flat with", sink: "sinking under", zone: "in his zone near" };
    const order = { top1: 0, top1o: 0, flat: 1, sink: 1, top: 2, wall: 3, zone: 4 };
    const items = b.rules.filter(r => r.pos).sort((a, c) => (order[a.tech] ?? 5) - (order[c.tech] ?? 5) || (a.pos === b.e.pos ? -1 : 1)).slice(0, 7);
    const parts = items.map(r => `the ${esc(ROLE_NAME[r.role] || r.role)} (${esc(ABBR[r.id] || r.id)}) ${tech[r.tech] || "on"} ${esc(r.pos)}${num(r.pos) && num(r.pos) !== "the back" ? " (" + num(r.pos) + ")" : ""}${r.pos === b.e.pos ? " <b>your target</b>" : ""}`);
    const free = b.rules.filter(r => !r.pos).map(r => ROLE_NAME[r.role] || r.role);
    return `When you threw: ${parts.join("; ")}.` + (free.length ? ` No match for the ${esc(free.join(", the "))}: zone spot.` : "");
  }
  function resultHTML() {
    const R = G.result, r = G.rep, e = R.e;
    const pname = p => `${p} ${G.sim.players[p].route.label.toLowerCase()}`;
    let head;
    const big = g => (R.td ? " · touchdown" : (g >= r.sit.togo ? " · first down" : ""));
    switch (R.kind) {
      case "run": head = `${CBYID[G[G.live]].name} · ${R.gain >= 0 ? "+" : ""}${R.gain} yd${big(R.gain)}`; break;
      case "complete": head = `Complete to ${e.pos} · ${R.gain >= 0 ? "+" : ""}${R.gain} yd` + (R.gain >= r.sit.yl ? " · touchdown" : (R.gain >= r.sit.togo ? " · first down" : "")); break;
      case "int": head = `Intercepted, intended for ${e.pos}`; break;
      case "incomplete": head = `Incomplete, intended for ${e.pos}`; break;
      case "sack": head = "Sacked · −7 yd"; break;
      case "throwaway": head = "Thrown away"; break;
      case "delay": head = "Delay of game · −5 yd"; break;
    }
    const tone = R.epa >= 0 ? "good" : "bad";
    let rows = "";
    if (e) {
      const nm = id => id ? "the " + D.META[id].name.toLowerCase() : "a defender";
      const yd = v => v.toFixed(1) + " yd";
      const what = `${pname(e.pos)}, ${e.type === "fast" ? "a bullet" : "touch"}, ${Math.round(e.air)} yd in the air`;
      const t = {
        catch: `Open: the nearest defender, ${nm(e.contest.reduce((a, k) => (!a || k.rem < a.rem ? k : a), null).id)}, was ${yd(e.sep)} away when it arrived.`,
        contested: `Caught in a tight window: ${nm(e.by)} was ${yd(e.sep)} away and hit him on the catch, so nothing after it.`,
        breakup: `${nm(e.by)} got to the catch point as the ball did and knocked it away. A window under 1 yd is a defender's ball.`,
        int: e.laneAt != null ? `Thrown into ${nm(e.by)}'s lane: he was sitting under the bullet's path and caught it.` : `${nm(e.by)} was at the catch point ${e.early >= 0.5 ? "half a second" : "a beat"} before the ball, in front of the receiver, and caught it.`,
        tipped: `A bullet thrown through ${nm(e.by)}'s area: he got a hand on it. Touch would have gone over him.`,
        range: `${Math.round(e.air)} yd in the air is past the arm (${e.maxAir} yd on ${e.type === "fast" ? "a bullet" : "touch"}): it died short.`
      }[e.how] || "";
      const cap = t.charAt(0).toUpperCase() + t.slice(1);
      rows += row("Your throw", `${what}. ${cap} Worth ${sgn(e.ev)} EPA as thrown.`, R.kind === "complete" ? "good" : "bad");
    }
    if (R.rac && R.rac.end !== "contested") {
      const caught = Math.round(e.C.y);
      rows += row("After catch", `Caught at ${caught >= 0 ? caught : "−" + Math.abs(caught)}, ran ${R.rac.yac >= 0 ? R.rac.yac : "−" + Math.abs(R.rac.yac)} after the catch` +
        (R.rac.broken ? ", broke a tackle" : "") + (R.rac.end === "oob" ? ", out of bounds" : (R.rac.end === "td" ? ", into the end zone" : "")) +
        ".", "good");
    }
    if (R.run) {
      const ru = R.run, pk = D.PKG[r.pkg];
      const un = ru.unblocked.map(id => D.META[id].name.toLowerCase());
      let t = `${ru.box} defenders in the box against ${ru.blockers} blockers` + (ru.doubles ? `, ${ru.doubles} double team${ru.doubles > 1 ? "s" : ""} at the point of attack` : "") + ". ";
      t += un.length ? `Unblocked: the ${un.join(", the ")}. ` : "Everyone in the box was blocked. ";
      t += { tackle: ru.tfl ? "Dropped behind the line." : "Tackled.", oob: "Ran out of bounds.", td: "Into the end zone.", time: "" }[ru.end] || "";
      if (ru.broken) t += " Broke a tackle.";
      t += ` Against this ${pk.label.toLowerCase()} look the run averages ${ru.exp.toFixed(1)} yd.`;
      rows += row("Run", t, R.gain >= ru.exp ? "good" : "");
      rows += row("Box", ru.box <= ru.blockers ? "A light box: the right look to hand it off." : (ru.box - ru.blockers >= 2 ? "Two more defenders than blockers. That is a look to kill to a pass." : "One more defender than blockers: the back has to beat a man himself."), ru.box <= ru.blockers ? "good" : "bad");
    }
    if (R.pa) {
      const names = R.pa.bit.map(id => D.META[id].name.toLowerCase());
      const lvl = R.pa.s >= 0.95 ? "hard" : "some";
      rows += row("Fake", names.length ? `The defense respected the run (${lvl}): the ${names.join(", the ")} stepped up on the fake and dropped late, opening the window behind them.` : "Nobody bit on the fake.", "good");
    }
    if (R.plan) {
      const pl = R.plan, slideW = pl.slide === "L" ? "left" : "right";
      const rbTxt = pl.rbJob === "block" ? "the back stayed in" : (pl.rbJob === "check" ? "the back picked up a blitzer before releasing" : "the back ran his route");
      let ptxt = `${pl.nR} rushed against ${pl.nB} blockers; the line slid ${slideW} and ${rbTxt}. `;
      if (pl.freeId) {
        const fr = D.META[pl.freeId].name, fs = pl.freeSide === "L" ? "left" : "right";
        ptxt += `The ${fr.toLowerCase()} came free off the ${fs} at ${pl.sackT.toFixed(2)} s. ` +
          (pl.slide !== pl.freeSide ? `Sliding ${fs} would have picked him up.` : (pl.rbJob === "route" ? "Keeping the back in would have picked him up." : "That pressure brought more than you could block: the answer was the hot throw."));
      } else ptxt += R.kind === "sack" ? `The pocket held ${pl.sackT.toFixed(2)} s and the ball was still in your hand.` : `The pocket held ${pl.sackT.toFixed(2)} s.`;
      rows += row("Pocket", ptxt, pl.freeId ? "bad" : (R.kind === "sack" ? "bad" : ""));
    }
    if (R.bestAtRelease) {
      const b = R.bestAtRelease, gap = b.ev - e.ev;
      rows += row("Read", gap < 0.1 ? `Best available when you let it go. ${pname(b.pos)}, ${b.type} (${sgn(b.ev)}).`
        : `When you released, ${pname(b.pos)}, ${b.type} was worth ${sgn(b.ev)} (yours ${sgn(e.ev)}).`, gap < 0.1 ? "good" : "bad");
    }
    if (R.oracle && R.oracle.overall) {
      const o = R.oracle.overall, late = R.tDecide - o.t;
      const threw = R.e != null;
      rows += row("Timing", `Best window of the rep: ${o.t.toFixed(1)} s, ${pname(o.best.pos)}, ${o.best.type} (${sgn(o.best.ev)}).` +
        (threw ? (Math.abs(late) < 0.15 ? " You were on time." : ` You decided at ${R.tDecide.toFixed(1)} s.`) : ""),
        threw && Math.abs(late) < 0.15 ? "good" : "");
    }
    const truth = D.COV[r.cov], shownDeep = D.SHELL[r.shown].deep;
    const id = R.id || {};
    let idTxt;
    const ms = Math.round(Math.abs(R.readAdj || 0) * 1000);
    if (!id.cov) idTxt = "No read entered before the snap, so no head start on the progression.";
    else if (id.cov === r.cov) idTxt = `You had it, so the ball came out ${ms} ms sooner.`;
    else if (id.deep === truth.deep) idTxt = `Right shell (${D.DEEP_NAME[truth.deep].toLowerCase()}), wrong coverage: you said ${covShort(id.cov)}. No head start.`;
    else if (r.disguised && id.deep === shownDeep) idTxt = `You read the disguise: they showed ${D.SHELL[r.shown].label.toLowerCase()}, then rotated. Wrong shell cost ${ms} ms of hesitation.`;
    else idTxt = `You said ${covShort(id.cov)}: wrong shell, ${ms} ms of hesitation.`;
    if (R.kind !== "delay")
      rows += row("Coverage", `Showed ${esc(D.SHELL[r.shown].label.toLowerCase())}, played <b>${esc(truth.label)}</b>${r.variant === "blitz" ? " with the hole player blitzing" : ""}${r.disguised ? (r.declareAt < 0 ? " (rotated after the snap)" : " (disguised)") : ""}. ${esc(idTxt)}`, id.cov === r.cov ? "good" : (id.cov ? "bad" : ""), true);
    if (G.ball && G.ball.rules && G.ball.rules.length) rows += row("Match", matchText(G.ball), "", true);
    const nr = nflRow(R); if (nr) rows += row("NFL", nr, "nfl");
    const m = P.matchup(G.concept(), r.cov);
    const kg = P.killGrade(CBYID[G.call], G.kill ? CBYID[G.kill] : null);
    rows += row("Call", `${esc(m.text)} ${esc(kg.text)}${G.lateCall ? " The huddle broke with no call, so you ran the first play on the sheet." : ""}`, m.tone === "good" ? "good" : (m.tone === "bad" ? "bad" : ""), true);
    if (r.baiter && G.level >= 5) rows += row("Film", `${esc(D.META[r.baiter].name)} was baiting: playing soft, then breaking early on the ball.`, "", true);
    const n = G.frames.length;
    return `
      <div class="reshead ${tone}"><b>${esc(head)}</b><span class="epa">${sgn(R.epa)} EPA</span></div>
      ${GM ? "" : ""}
      <div class="resrows">${rows}</div>
      ${n ? `<div class="resbtns">
        <button class="ghost" id="replayBtn">Replay</button>
        <button class="chip toggle" id="heatBtn" aria-pressed="${G.heat}">Coverage heat</button>
      </div>
      <div class="scrubrow">
        <input type="range" id="repScrub" min="0" max="${n - 1}" step="1" value="${G.replay.i}" aria-label="Scrub the play">
        <p class="hint">Opens on the moment you released. Drag to step through the play; the heat map shows how much grass each defender could contest at that instant.</p>
      </div>` : `<div hidden><button id="replayBtn"></button><button id="heatBtn"></button><input id="repScrub" type="range"></div>`}
      ${gameHTML(G.events)}`;
    function row(k, v, tone, raw) { return `<div class="rr ${tone || ""}"><span class="k">${k}</span><span class="v">${raw ? v : esc(v)}</span></div>`; }
  }

  /* ---------- setup ---------- */
  function renderSetup() {
    $("modeSeg").innerHTML = MODE_KEYS.map(k => `<button data-mode="${k}" aria-pressed="${k === S.mode}">${MODE_LABEL[k]}</button>`).join("");
    const md = S.mode === "snaps" ? "Single snaps from random situations, scored in EPA." : DR.MODES[S.mode].desc;
    $("modeDesc").innerHTML = md + (S.games ? ` <span class="rec">Record ${S.wins}-${S.losses}${S.ties ? "-" + S.ties : ""}</span>` : "");
    $("startRep").textContent = S.mode === "snaps" ? "Start a snap" : "Kick it off";
    const sel = $("teamSel");
    if (!sel.options.length) {
      const ts = Object.entries(CAL.teams).sort((a, b) => a[1].name.localeCompare(b[1].name));
      sel.innerHTML = `<option value="">League average</option>` + ts.map(([k, t]) => `<option value="${k}">${esc(t.name)}</option>`).join("");
    }
    sel.value = S.team || "";
    const T = S.team && CAL.teams[S.team];
    if (T) {
      const rank = Object.values(CAL.teams).sort((a, b) => a.epa - b.epa).indexOf(T) + 1;
      const top = Object.entries(T.mix).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${covShort(k)} ${Math.round(v * 100)}%`).join(", ");
      $("teamDesc").innerHTML = `2025 defense: #${rank} in EPA allowed per play. Blitzed on ${Math.round(T.blitz * 100)}% of dropbacks (league ${Math.round(CAL.blitzLeague * 100)}%), man coverage ${Math.round(T.man * 100)}%. Most-called: ${esc(top)}.`;
    } else $("teamDesc").textContent = "Coverage calls follow 2025 league-wide rates for each package and situation.";
    $("lvlSeg").innerHTML = [1, 2, 3, 4, 5].map(l => `<button data-lvl="${l}" aria-pressed="${l === S.level}">${l}</button>`).join("");
    const L = P.LEVELS[S.level];
    const desc = {
      1: "No disguise, half-speed play, routes stay on the field.",
      2: "Some disguise, 70% speed, routes stay faint.",
      3: "Real-time. Routes vanish after the huddle.",
      4: "Alignments only after the huddle. Athletic outliers. Install-mastered plays only.",
      5: "Wristband calls only, late rotations, one hidden baiter."
    }[S.level];
    $("lvlDesc").innerHTML = `<b>${L.label}.</b> ${desc}`;
    const ids = unlocked(S.level), ok = passCount(ids) >= 2;
    $("lockNote").hidden = ok;
    $("lockNote").textContent = `Level ${S.level} only allows pass plays you've mastered in Install. You have ${passCount(ids)}; you need 2.`;
    $("startRep").disabled = !ok;
    $("stReps").textContent = S.reps;
    $("stEpa").textContent = S.reps ? sgn(S.epa / S.reps) : "—";
    $("stComp").textContent = S.att ? Math.round(100 * S.comp / S.att) + "%" : "—";
    $("stId").textContent = S.idN ? Math.round(100 * S.idOk / S.idN) + "%" : "—";
  }
  $("lvlSeg").addEventListener("click", e => { const b = e.target.closest("[data-lvl]"); if (!b) return; S.level = +b.dataset.lvl; saveS(); renderSetup(); });
  $("teamSel").addEventListener("change", e => { S.team = e.target.value; saveS(); renderSetup(); });
  $("modeSeg").addEventListener("click", e => { const b = e.target.closest("[data-mode]"); if (!b) return; S.mode = b.dataset.mode; saveS(); renderSetup(); });
  $("startRep").addEventListener("click", () => { if (passCount(unlocked(S.level)) < 2) return; enterImmersive(); startSession(); });
  $("exitRep").addEventListener("click", endSession);

  /* ---------- loop ---------- */
  let last = 0;
  function loop(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
    if (!G && between && !$("v-play").hidden) { draw(); }
    if (G && !$("v-play").hidden) {
      if (G.phase !== "result") G.tick(dt);
      else if (G.replay.playing) {
        G.replay.acc += dt * 0.6;
        const t0 = G.frames.length ? G.frames[0].t : 0;
        while (G.replay.i < G.frames.length - 1 && G.frames[G.replay.i + 1].t - t0 <= G.replay.acc) G.replay.i++;
        if (G.replay.i >= G.frames.length - 1) G.replay.playing = false;
        const sc = $("repScrub"); if (sc) sc.value = G.replay.i;
      }
      sync();
      // camera: follow the ball live and in the replay
      let want = CAM_MIN;
      if (G.phase === "live") want = camWant(G.t, G.ballAt(G.t));
      else if (G.phase === "result" && G.frames.length) { const f = G.frames[Math.min(G.frames.length - 1, G.replay.i)]; want = camWant(f.t, f.ball); }
      camTop += (want - camTop) * Math.min(1, dt * 5);
      // clock overlay
      const clk = $("pClock"), sm = $("pClockLab");
      if (GM && DR.timed(GM) && (G.phase === "huddle" || G.phase === "line")) {
        renderBoardClock();
        if (!GM.stopped && GM.clock - (P.PLAY_CLOCK - G.clock) <= 0) { showBetween(DR.expire(GM)); requestAnimationFrame(loop); return; }
      }
      if (G.phase === "huddle" || G.phase === "line") { clk.textContent = String(Math.ceil(Math.max(0, G.clock))).padStart(2, "0"); sm.textContent = "play clock"; clk.classList.toggle("warn", G.clock <= 5); }
      else { const tt = G.phase === "result" && G.frames.length ? G.frames[Math.min(G.frames.length - 1, G.replay.i)].t : G.t; clk.textContent = tt.toFixed(2); sm.textContent = "sec post-snap"; clk.classList.remove("warn"); }
      const m = $("pMsg");
      if (G.msg && performance.now() < G.msg.until) { m.textContent = G.msg.text; m.className = "f-msg on " + G.msg.tone; }
      else m.className = "f-msg";
      draw();
    }
    requestAnimationFrame(loop);
  }

  /* the game clock keeps running in the huddle when it was running at the
     end of the last play: show it ticking (drive.js charges it at the snap) */
  function renderBoardClock() {
    const q = $("pBoard").querySelector(".bq");
    if (!q || GM.stopped) return;
    const c = Math.max(0, GM.clock - (P.PLAY_CLOCK - G.clock));
    q.innerHTML = `Q${GM.q} ${DR.fmtClock(c)} <i class="run">▶</i>`;
  }
  window.PocketGame = { onShow() { renderSetup(); resize(); }, state: () => G, game: () => GM, cam: () => camTop };
  renderSetup();
  requestAnimationFrame(loop);
})();
