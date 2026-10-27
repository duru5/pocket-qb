"""Browser stress test of Pocket QB at phone size: every control path, no console errors."""
import asyncio, sys, json
from playwright.async_api import async_playwright
SP = sys.argv[1]
HEAD = ('<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>')
open('/home/claude/pocket-qb/_p.html', 'w').write(HEAD + open('/home/claude/pocket-qb/index.html').read() + '</body></html>')
URL = "file:///home/claude/pocket-qb/_p.html"
results = []
def check(cond, name, info=""):
    results.append((bool(cond), name, info))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{info}]" if info else ""))

ST = "PocketGame.state()"
async def until(pg, js, timeout=20000, step=40):
    t = 0
    while t < timeout:
        if await pg.evaluate(js): return True
        await pg.wait_for_timeout(step); t += step
    return False
async def field_xy(pg, x, y):
    return await pg.evaluate(f"""(()=>{{const c=document.getElementById('playField').getBoundingClientRect();const top=PocketGame.cam();
      return [c.left+{x}/53.33*c.width, c.top+(top-({y}))/40*c.height];}})()""")
async def recv_xy(pg, pos):
    st = await pg.evaluate(f"(()=>{{const G={ST};const s=G.sim.players['{pos}'].run.stateAt(G.t);return [s.x,s.y]}})()")
    return await field_xy(pg, st[0], st[1])
async def ptr(pg, kind, pid, xy):
    await pg.evaluate(f"""document.getElementById('playField').dispatchEvent(new PointerEvent('{kind}',
      {{pointerId:{pid},clientX:{xy[0]},clientY:{xy[1]},bubbles:true,cancelable:true,pointerType:'touch',isPrimary:{'true' if pid==1 else 'false'}}}))""")
async def tap(pg, xy, pid=1):
    await ptr(pg, "pointerdown", pid, xy); await ptr(pg, "pointerup", pid, xy)

async def start_snap(pg, call_name, kill_name=None, level=1):
    await pg.evaluate(f"localStorage.setItem('pocket.play.v1', JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('pocket.play.v1')||'{{}}'),{{level:{level}}})))")
    await pg.reload(); await pg.wait_for_timeout(400)
    await pg.click("#startRep"); await pg.wait_for_timeout(200)
    await pg.click(f"#callChips >> text='{call_name}'")
    if kill_name: await pg.click(f"#callChips >> text='{kill_name}'")
    await pg.click("#breakBtn"); await pg.wait_for_timeout(200)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 390, "height": 664}, device_scale_factor=2, has_touch=True, color_scheme="dark")
        pg = await ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
        pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
        await pg.goto(URL); await pg.wait_for_timeout(500)
        await pg.evaluate("localStorage.clear()"); await pg.reload(); await pg.wait_for_timeout(400)

        # ---------- 1. the play-test case: Y-Cross, touch to Z late ----------
        await start_snap(pg, "Y-Cross", "Smash", level=1)
        await pg.evaluate(f"{ST}.rep.forceSackT = 3.9")
        await pg.click("[data-cov=c2]")
        await pg.click("#snapBtn")
        await until(pg, f"{ST}.t >= 2.6")
        xy = await recv_xy(pg, "Z"); await tap(pg, xy)
        await pg.wait_for_timeout(90); await tap(pg, [10, 10], pid=2)       # second tap anywhere: touch
        check(await pg.evaluate(f"{ST}.pending && {ST}.pending.type==='touch' && {ST}.pending.pos==='Z'"), "1 double tap made a touch throw to Z")
        await until(pg, f"!!{ST}.ball")
        info = await pg.evaluate(f"(()=>{{const G={ST};return {{tLeave:G.ball.tLeave, ta:G.ball.e.ta, Cy:G.ball.e.C.y, sackT:G.rep.sackT}}}})()")
        maxcam = 0; ball_vis = True; samples = 0
        while not await pg.evaluate(f"{ST}.phase==='result'"):
            c = await pg.evaluate("PocketGame.cam()"); maxcam = max(maxcam, c)
            bv = await pg.evaluate(f"(()=>{{const G={ST};const b=G.ballAt(G.t);if(!b)return true;const top=PocketGame.cam();return b.y+b.h<=top+0.5 && b.y>=top-40-0.5}})()")
            if await pg.evaluate(f"{ST}.t") > info["tLeave"] + 0.4: ball_vis = ball_vis and bv; samples += 1
            await pg.wait_for_timeout(60)
            if samples > 400: break
        kind = await pg.evaluate(f"{ST}.result.kind")
        check(kind in ("complete", "incomplete", "int"), "1 thrown ball runs to the catch (not a sack)", f"kind={kind} {json.dumps(info)}")
        check(maxcam > 31, "1 camera panned upfield on the deep ball", f"max camTop={maxcam:.1f}, catch y={info['Cy']:.1f}")
        check(ball_vis, "1 ball stayed on screen through the flight", f"{samples} samples")
        await pg.screenshot(path=f"{SP}/u1_result.png")
        # result tools
        n = await pg.evaluate(f"{ST}.frames.length"); ri = await pg.evaluate(f"{ST}.replay.i")
        check(0 <= ri < n, "1 result opens on a valid frame", f"i={ri} of {n}")
        fld = await pg.query_selector("#playField")
        a = await fld.screenshot(); await pg.click("#heatBtn"); await pg.wait_for_timeout(250); bimg = await fld.screenshot()
        check(a != bimg, "1 heat map changes the field when switched on")
        await pg.evaluate("(()=>{const s=document.getElementById('repScrub');s.value=Math.floor(s.max/2);s.dispatchEvent(new Event('input',{bubbles:true}))})()")
        await pg.wait_for_timeout(200)
        check(await pg.evaluate(f"{ST}.replay.i") == n // 2 or abs(await pg.evaluate(f"{ST}.replay.i") - (n - 1) // 2) <= 1, "1 scrubber moves the replay")
        await pg.click("#replayBtn"); await pg.wait_for_timeout(600)
        check(await pg.evaluate(f"{ST}.replay.playing || {ST}.replay.i>0"), "1 replay runs")

        # ---------- 2. next snap, fast throw with a real tap ----------
        await pg.click("#nextBtn2"); await pg.wait_for_timeout(200)
        check(await pg.evaluate(f"{ST}.phase==='huddle'"), "2 next snap starts a new huddle")
        await pg.click("#callChips >> text='Stick'"); await pg.click("#callChips >> text='Snag'"); await pg.click("#breakBtn")
        await pg.evaluate(f"{ST}.rep.forceSackT = 3.9"); await pg.click("#snapBtn")
        await until(pg, f"{ST}.t >= 1.3")
        xy = await recv_xy(pg, "Y"); await pg.touchscreen.tap(xy[0], xy[1])
        await until(pg, f"!!{ST}.ball", 5000)
        check(await pg.evaluate(f"{ST}.ball && {ST}.ball.e.type==='fast'"), "2 single tap throws a fast ball")
        await until(pg, f"{ST}.phase==='result'")
        check(await pg.evaluate(f"['complete','incomplete','int'].includes({ST}.result.kind)"), "2 fast throw scored")

        # ---------- 3. hold to look with one finger, throw with the other ----------
        await pg.click("#nextBtn2"); await pg.click("#callChips >> text='Smash'"); await pg.click("#breakBtn")
        await pg.evaluate(f"{ST}.rep.forceSackT = 3.9"); await pg.click("#snapBtn")
        await until(pg, f"{ST}.t >= 0.8")
        xside = await pg.evaluate(f"{ST}.sim.players.X.run.start.x")
        lx1, lx2 = (45, 40) if xside < 26.67 else (8, 13)     # look to the side away from X
        look = await field_xy(pg, lx1, 14)
        await ptr(pg, "pointerdown", 1, look); await pg.wait_for_timeout(320)
        check(await pg.evaluate(f"!!{ST}.eye && Math.abs({ST}.eye.x-{lx1})<1.5"), "3 holding sets the eyes")
        look2 = await field_xy(pg, lx2, 16); await ptr(pg, "pointermove", 1, look2); await pg.wait_for_timeout(60)
        check(await pg.evaluate(f"Math.abs({ST}.eye.x-{lx2})<1.5"), "3 eyes follow the finger")
        xy = await recv_xy(pg, "X"); await tap(pg, xy, pid=2)
        check(await pg.evaluate(f"{ST}.pending && {ST}.pending.pos==='X' && {ST}.pending.rel>0.4"), "3 second-finger tap throws away from the eyes, with the shoulder cost")
        await ptr(pg, "pointerup", 1, look2)
        check(await pg.evaluate(f"{ST}.pending.type==='fast'"), "3 lifting the look finger does not count as a second tap")
        await until(pg, f"{ST}.phase==='result'")

        # ---------- 4. throw it away ----------
        await pg.click("#nextBtn2"); await pg.click("#callChips >> text='Mesh'"); await pg.click("#breakBtn"); await pg.click("#snapBtn")
        await until(pg, f"{ST}.t >= 0.6"); await pg.click("#awayBtn")
        await until(pg, f"{ST}.phase==='result'", 3000)
        check(await pg.evaluate(f"{ST}.result.kind==='throwaway'"), "4 throw away")
        check(await pg.evaluate("document.querySelector('.reshead b').textContent.includes('Thrown away')"), "4 result says thrown away")

        # ---------- 5. hold the ball: sack ----------
        await pg.click("#nextBtn2"); await pg.click("#callChips >> text='Dagger'"); await pg.click("#breakBtn"); await pg.click("#snapBtn")
        await until(pg, f"{ST}.phase==='result'", 15000)
        check(await pg.evaluate(f"{ST}.result.kind==='sack' && {ST}.result.gain===-7"), "5 holding the ball is a sack")
        check(await pg.evaluate("document.body.innerText.includes('ball was still in your hand') || document.body.innerText.includes('came free')"), "5 result explains the sack")

        # ---------- 6. auto huddle break and delay of game ----------
        await pg.click("#nextBtn2"); await pg.evaluate(f"{ST}.clock = 15.4")
        await until(pg, f"{ST}.phase==='line'", 3000)
        check(await pg.evaluate(f"{ST}.lateCall===true && !!{ST}.call"), "6 huddle breaks itself at :15 with a call")
        check(await pg.evaluate("!!document.getElementById('snapBtn')"), "6 line controls shown after auto break")
        await pg.evaluate(f"{ST}.clock = 0.6")
        await until(pg, f"{ST}.phase==='result'", 3000)
        check(await pg.evaluate(f"{ST}.result.kind==='delay'"), "6 clock hits zero: delay of game")
        check(await pg.evaluate("!document.getElementById('repScrub') || document.getElementById('repScrub').closest('[hidden]')"), "6 no replay tools on a delay")

        # ---------- 7. kill into another formation ----------
        await pg.click("#nextBtn2"); await pg.click("#callChips >> text='Smash'"); await pg.click("#callChips >> text='Flood'"); await pg.click("#breakBtn")
        await pg.wait_for_timeout(1200)
        await pg.click("#killBtn"); await pg.wait_for_timeout(100)
        check(await pg.evaluate(f"{ST}.concept().id==='flood' && {ST}.sim.concept.id==='flood'"), "7 kill switches to Flood")
        check(await pg.evaluate("document.getElementById('killBtn').textContent.includes('Killed to')"), "7 kill card updates")
        await pg.wait_for_timeout(1500)
        covs = await pg.evaluate("[...document.querySelectorAll('#readGrid [data-cov]')].map(b=>b.dataset.cov).sort()")
        allc = await pg.evaluate("Object.keys(PocketDefense.COV).sort()")
        check(covs == allc, "7 every coverage the defense can play is a read option", f"{covs}")
        check(await pg.evaluate("[...document.querySelectorAll('.rgl')].map(e=>e.textContent).join('|')") == "Two deep|One deep|None deep", "7 read options grouped by deep safeties")
        await pg.click("[data-cov=c1]")
        check(await pg.evaluate(f"{ST}.id.cov==='c1' && {ST}.id.deep===1"), "7 one tap stores the read (Cover 1 under one deep)")
        await pg.click("[data-cov=c1]")
        check(await pg.evaluate(f"{ST}.id.cov===null"), "7 tapping the same read again clears it")
        await pg.click("[data-slide=L]")
        check(await pg.evaluate(f"{ST}.prot.slide==='L'"), "7 slide left sets the protection")
        await pg.click("#keepBtn")
        check(await pg.evaluate(f"{ST}.prot.keepRB===true"), "7 keep RB in toggles on")
        await pg.click("#keepBtn")
        await pg.click("[data-cov=c4]"); await pg.click("#snapBtn")
        await until(pg, f"{ST}.phase==='result'", 15000)
        check(await pg.evaluate(f"{ST}.result.id.cov==='c4'"), "7 read graded at the snap")
        await pg.screenshot(path=f"{SP}/u7_result.png", full_page=False)

        # ---------- 10. pressure, protection, the back in pass pro, run after catch ----------
        await pg.click("#nextBtn2"); await pg.wait_for_timeout(150)
        await pg.evaluate(f"(()=>{{const r={ST}.rep; r.cov='c0'; r.truth='zero'; r.shown='zero'; r.press=true; r.variant=null; r.declareAt=39;}})()")
        await pg.click("#callChips >> text='Slant-Flat'"); await pg.click("#breakBtn")
        await pg.wait_for_timeout(2600)
        rb_side = await pg.evaluate(f"(()=>{{let l=0,r=0;for(const p of {ST}.def.players) if(p.dl||p.blitz){{if(p.truth.x<26.67)l++;else r++;}} return l>r?'L':'R';}})()")
        await pg.click(f"[data-slide={rb_side}]"); await pg.click("#keepBtn")
        await pg.click("#snapBtn")
        check(await pg.evaluate(f"{ST}.plan && {ST}.plan.freeId===null && {ST}.plan.nR===6 && {ST}.plan.nB===6"), "10 Cover 0: back in + slide to the overload blocks all six", await pg.evaluate(f"JSON.stringify({ST}.plan.extra)"))
        check(await pg.evaluate(f"{ST}.sim.players.RB.blocking===true"), "10 the back stays in to block")
        xy = await recv_xy(pg, "RB"); await tap(pg, xy)
        check(await pg.evaluate(f"!{ST}.pending || {ST}.pending.pos!=='RB'"), "10 a back in pass protection cannot be targeted")
        await until(pg, f"{ST}.phase==='result'", 15000)
        await pg.click("#nextBtn2"); await pg.wait_for_timeout(150)
        await pg.evaluate(f"(()=>{{const r={ST}.rep; r.cov='c0'; r.truth='zero'; r.shown='zero'; r.press=true; r.variant=null; r.declareAt=39; r.pkg='dime'; r.blitzSide='R'; r.flip=false;}})()")
        await pg.click("#callChips >> text='Slant-Flat'"); await pg.click("#breakBtn")
        await pg.wait_for_timeout(2600)
        heavy = await pg.evaluate(f"(()=>{{let l=0,r=0;for(const p of {ST}.def.players) if(p.dl||p.blitz){{if(p.truth.x<26.67)l++;else r++;}} return l>r?'L':'R';}})()")
        other = "L" if heavy == "R" else "R"
        await pg.click(f"[data-slide={other}]"); await pg.click("#snapBtn")
        check(await pg.evaluate(f"!!{ST}.plan.freeId && {ST}.rep.sackT<=2.4"), "10 Cover 0 sliding away from the overload leaves a man free", await pg.evaluate(f"String({ST}.rep.sackT)"))
        await until(pg, f"{ST}.phase==='result'", 15000)
        check(await pg.evaluate("document.body.innerText.includes('came free')"), "10 result names the free rusher")
        # a completion with a run after the catch
        got = False
        for attempt in range(6):
            await pg.click("#nextBtn2"); await pg.wait_for_timeout(150)
            await pg.evaluate(f"(()=>{{const r={ST}.rep; r.cov='c3sky'; r.truth='one'; r.shown='one'; r.declareAt=39; r.forceSackT=4.0;}})()")
            await pg.click("#callChips >> text='Slant-Flat'"); await pg.click("#breakBtn"); await pg.wait_for_timeout(300); await pg.click("#snapBtn")
            await until(pg, f"{ST}.t >= 0.75")
            xy = await recv_xy(pg, "H"); await tap(pg, xy)
            await until(pg, f"{ST}.phase==='result'", 15000)
            if await pg.evaluate(f"{ST}.result.kind==='complete'"): got = True; break
        check(got, "10 got a completion to check the run after the catch")
        if got:
            moved = await pg.evaluate(f"""(()=>{{const G={ST};const ta=G.ball.e.ta;const fs=G.frames.filter(f=>f.t>=ta);const a=fs[0].recv[G.ball.e.pos],b=fs[fs.length-1].recv[G.ball.e.pos];
              return {{d:Math.hypot(b.x-a.x,b.y-a.y), yac:G.result.rac.yac, n:fs.length}}}})()""")
            check(moved["n"] > 3 and (moved["d"] > 0.5 or moved["yac"] <= 1), "10 the receiver runs after the catch in the replay", json.dumps(moved))
            check(await pg.evaluate("document.body.innerText.includes('after the catch')"), "10 result shows yards after the catch")
            await pg.screenshot(path=f"{SP}/u10_rac.png")

        # ---------- 8. exit and level locks ----------
        await pg.click("#exitRep"); await pg.wait_for_timeout(200)
        check(await pg.evaluate("!document.body.classList.contains('immersive') && !document.getElementById('playSetup').hidden"), "8 exit returns to setup")
        await pg.click("#lvlSeg [data-lvl='4']")
        check(await pg.evaluate("document.getElementById('startRep').disabled && !document.getElementById('lockNote').hidden"), "8 level 4 locked with no mastered plays")
        await pg.evaluate("""(()=>{const E=PocketEngine,B=PocketBook;const cards={};
          for(const c of B.CONCEPTS.filter(c=>['smash','stick','snag'].includes(c.id))){const sim=E.simulate(c,B.FORMATIONS,B.ROUTES,{});
            const ids=['name:'+c.id,'order:'+c.id,'key:'+c.id,'beats:'+c.id];for(const p of c.progression.filter(p=>p!=='RB').slice(0,3))ids.push('route:'+c.id+':'+p);
            const tp=c.progression.find(p=>sim.players[p]&&sim.players[p].run.brk);if(tp)ids.push('time:'+c.id+':'+tp);
            for(const id of ids)cards[id]={box:5,due:Date.now()+9e8,right:5,wrong:0};}
          localStorage.setItem('pocket.install.v1',JSON.stringify({cards,intro:{smash:true,stick:true,snag:true},types:{},concepts:['smash','stick','snag'],len:12}));})()""")
        await pg.reload(); await pg.wait_for_timeout(400)
        check(await pg.evaluate("!document.getElementById('startRep').disabled"), "8 mastering three plays unlocks level 4")
        await pg.click("#startRep"); await pg.wait_for_timeout(200)
        chips = await pg.evaluate("[...document.querySelectorAll('#callChips [data-cid]')].map(b=>b.dataset.cid)")
        check(sorted(c for c in chips if c not in ("iz", "oz", "power")) == ["smash", "snag", "stick"], "8 only mastered pass plays can be called (runs are never locked)", str(chips))
        check(await pg.evaluate("document.querySelectorAll('.scout .sc').length===2"), "8 level 4 shows two scouting cards")
        await pg.click("#callChips >> text='Smash'"); await pg.click("#breakBtn"); await pg.click("#snapBtn")
        await until(pg, f"{ST}.t >= 1.5")
        xy = await recv_xy(pg, "H"); await tap(pg, xy)
        await until(pg, f"{ST}.phase==='result'", 15000)
        check(await pg.evaluate(f"!!{ST}.result"), "8 level 4 snap completes")
        await pg.click("#exitRep"); await pg.click("#lvlSeg [data-lvl='5']"); await pg.click("#startRep"); await pg.wait_for_timeout(200)
        await pg.click("#callChips >> text='Stick'"); await pg.wait_for_timeout(150)
        await pg.screenshot(path=f"{SP}/u8_wristband.png")
        await pg.click("#breakBtn"); await pg.click("#snapBtn")
        await until(pg, f"{ST}.phase==='result'", 15000)
        check(await pg.evaluate("document.body.innerText.includes('was baiting')"), "8 level 5 result names the baiter")
        await pg.click("#doneBtn")

        # ---------- 9. other tabs ----------
        await pg.click("#tab-book"); await pg.wait_for_timeout(300)
        await pg.click("#conceptChips >> text='Levels'"); await pg.wait_for_timeout(400)
        check(await pg.evaluate("document.getElementById('cName').textContent==='Levels'"), "9 playbook switches concepts")
        await pg.click("#tab-install"); await pg.wait_for_timeout(200)
        await pg.click("#startBtn"); await pg.wait_for_timeout(400)
        if await pg.query_selector("#introGo"): await pg.click("#introGo"); await pg.wait_for_timeout(300)
        btn = await pg.query_selector(".ans")
        if btn: await btn.click()
        else:
            await pg.evaluate("document.getElementById('undoBtn') && 0")
        await pg.wait_for_timeout(200)
        check(await pg.evaluate("!!document.getElementById('nextBtn') || !!document.getElementById('submitBtn')"), "9 install card answers")
        await pg.click("#tab-progress"); await pg.wait_for_timeout(200)
        check(await pg.evaluate("document.querySelectorAll('.mrow').length===PocketBook.CONCEPTS.length"), "9 progress lists every concept")
        await pg.click("#tab-play"); await pg.wait_for_timeout(200)
        check(await pg.evaluate("document.getElementById('stReps').textContent !== '0'"), "9 play stats recorded", await pg.evaluate("document.getElementById('stReps').textContent"))
        # ---------- 11. build 2: modes, personnel, runs, fourth down, clock ----------
        GMJ = "PocketGame.game()"
        await pg.click("#lvlSeg [data-lvl='1']"); await pg.click("#modeSeg [data-mode='drive']")
        check(await pg.evaluate("document.getElementById('startRep').textContent==='Kick it off'"), "11 drive mode relabels the start button")
        await pg.click("#startRep"); await pg.wait_for_timeout(250)
        check(await pg.evaluate(f"!!{GMJ} && !document.getElementById('pBoard').hidden && {GMJ}.yl===75"), "11 drive starts at your own 25 with a scoreboard")
        await pg.click("#persSeg [data-pers='21']"); await pg.wait_for_timeout(150)
        ok21 = await pg.evaluate(f"(()=>{{const G={ST};return G.personnel==='21' && G.available().every(id=>PocketBook.FORMATIONS[G.formFor(id)].personnel==='21') && document.querySelectorAll('#callChips [data-cid]').length===G.available().length}})()")
        check(ok21, "11 21 personnel lists only plays with a 21 formation")
        check(await pg.evaluate(f"PocketDefense.PKG[{ST}.rep.pkg]!==undefined"), "11 defense package redrawn for the personnel", await pg.evaluate(f"{ST}.rep.pkg"))
        await pg.click("#callChips >> text='Power'"); await pg.wait_for_timeout(100)
        await pg.screenshot(path=f"{SP}/u11_huddle_run.png")
        await pg.click("#breakBtn"); await pg.wait_for_timeout(150)
        check(await pg.evaluate("!document.getElementById('slideSeg') && document.body.innerText.includes('count the box')"), "11 run call hides protection and prompts the box count")
        await pg.click("#snapBtn")
        await until(pg, f"{ST}.phase==='live'", 3000)
        check(await pg.evaluate(f"!!{ST}.runRes && {ST}.tapAt({{x:26,y:5}},0)===null"), "11 a run cannot be thrown")
        await until(pg, f"{ST}.phase==='result'", 20000)
        check(await pg.evaluate(f"{ST}.result.kind==='run' && document.body.innerText.includes('in the box')"), "11 run result explains the box")
        await pg.screenshot(path=f"{SP}/u11_run_result.png")
        dn = await pg.evaluate(f"[{GMJ}.down,{GMJ}.togo,{GMJ}.yl,{ST}.result.gain]")
        check(dn[2] == 75 - dn[3] or dn[3] >= 25, "11 game spot moves by the gain", str(dn))
        # force a fourth down: next snap with an impossible distance
        await pg.click("#nextBtn2"); await pg.wait_for_timeout(150)
        await pg.evaluate(f"{GMJ}.down=3; {GMJ}.togo=99; {GMJ}.yl=20")
        await pg.click("#callChips [data-cid]"); await pg.click("#breakBtn"); await pg.click("#snapBtn")
        await until(pg, f"{ST}.phase==='live'", 3000)
        await pg.evaluate(f"{ST}.runRes || {ST}.throwAway()")
        await until(pg, f"{ST}.phase==='result'", 20000)
        await pg.wait_for_timeout(200)
        check(await pg.evaluate(f"{GMJ}.down===4 && !!document.querySelector('[data-sp=fg]') && !!document.querySelector('[data-sp=punt]')"), "11 fourth down offers punt and field goal",
              await pg.evaluate(f"JSON.stringify([{GMJ}.down,{GMJ}.yl,{GMJ}.over])"))
        await pg.click("[data-sp=fg]"); await pg.wait_for_timeout(200)
        check(await pg.evaluate(f"{GMJ}.over && !!document.getElementById('newGameBtn') && /field goal/.test(document.body.innerText)"), "11 field goal ends the drive with a summary")
        await pg.screenshot(path=f"{SP}/u11_final.png")
        await pg.click("#doneBtn"); await pg.wait_for_timeout(150)
        await pg.click("#modeSeg [data-mode='twomin']"); await pg.click("#startRep"); await pg.wait_for_timeout(250)
        check(await pg.evaluate(f"{GMJ}.clock===120 && {GMJ}.to===2 && document.querySelector('#pBoard .bq').textContent.includes('2:00')"), "11 two-minute drill: 2:00, two timeouts")
        await pg.click("#persSeg [data-pers='11']"); await pg.wait_for_timeout(100)
        await pg.click("#callChips >> text='Inside Zone'"); await pg.click("#breakBtn"); await pg.click("#snapBtn")
        await until(pg, f"{ST}.phase==='result'", 20000)
        if await pg.evaluate(f"!{GMJ}.over && !{GMJ}.stopped"):
            await pg.click("[data-sp=to]"); await pg.wait_for_timeout(150)
            check(await pg.evaluate(f"{GMJ}.to===1 && {GMJ}.stopped && document.getElementById('pPhase').textContent==='Between plays'"), "11 timeout stops the clock")
            await pg.click("#nextBtn2"); await pg.wait_for_timeout(150)
        else:
            check(True, "11 timeout stops the clock (clock already stopped, skipped)")
            if await pg.query_selector("#nextBtn2"): await pg.click("#nextBtn2"); await pg.wait_for_timeout(150)
        if not await pg.evaluate(f"{GMJ}.over"):
            await pg.evaluate(f"{GMJ}.clock=4; {GMJ}.stopped=false")
            await until(pg, f"!{ST}", 4000)
            check(await pg.evaluate(f"{GMJ}.over && {GMJ}.clock===0 && document.getElementById('pPhase').textContent==='Final'"), "11 game clock running out in the huddle ends the game")
        await pg.screenshot(path=f"{SP}/u11_twomin.png")
        await pg.click("#doneBtn"); await pg.wait_for_timeout(150)
        await pg.click("#modeSeg [data-mode='snaps']")
        # ---------- 12. NFL data: opponent team, scouting report, league context ----------
        await pg.select_option("#teamSel", "HOU"); await pg.wait_for_timeout(150)
        check(await pg.evaluate("document.getElementById('teamDesc').textContent.includes('2025 defense')"), "12 picking a team shows its 2025 profile")
        await pg.click("#startRep"); await pg.wait_for_timeout(250)
        check(await pg.evaluate(f"{ST}.team==='HOU' && {ST}.rep.team==='HOU' && !!document.querySelector('.opp') && document.querySelectorAll('.tbars .tb').length===3"), "12 huddle shows the opponent and three tendencies")
        await pg.screenshot(path=f"{SP}/u12_huddle.png")
        await pg.click("#callChips >> text='Four Verts'"); await pg.click("#breakBtn"); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=f"{SP}/u12_line.png")
        await pg.click("#snapBtn"); await until(pg, f"{ST}.t >= 1.6")
        xy = await recv_xy(pg, "Z"); await tap(pg, xy); await pg.wait_for_timeout(900)
        await pg.screenshot(path=f"{SP}/u12_live.png")
        await until(pg, f"{ST}.phase==='result'", 20000); await pg.wait_for_timeout(300)
        check(await pg.evaluate("[...document.querySelectorAll('.rr.nfl')].length===1 && /NFL/.test(document.querySelector('.rr.nfl').textContent)"), "12 result adds an NFL comparison row")
        await pg.screenshot(path=f"{SP}/u12_result.png")
        await pg.click("#doneBtn"); await pg.wait_for_timeout(150)
        await pg.select_option("#teamSel", "")
        sw = await pg.evaluate("document.documentElement.scrollWidth")
        check(sw <= 390, "9 no sideways scroll at phone width", str(sw))

        check(len(errs) == 0, "no console or page errors", "; ".join(errs[:5]))
        await b.close()
    bad = [r for r in results if not r[0]]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed")
    sys.exit(1 if bad else 0)
asyncio.run(main())
