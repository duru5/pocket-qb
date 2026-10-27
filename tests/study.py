"""Browser test of the Study tab at iPhone Air size (420x912): every lesson renders,
every board builds a film, checks answer, reps run, a drill launches Play and
comes back, no console errors. Usage: python3 tests/study.py [shots_dir]"""
import asyncio, sys, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SP = sys.argv[1] if len(sys.argv) > 1 else None
HEAD = ('<!doctype html><html><head><meta charset="utf-8"><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>[hidden]{display:none!important}</style></head><body>')
open(os.path.join(ROOT, "_s.html"), "w").write(HEAD + open(os.path.join(ROOT, "index.html")).read() + "</body></html>")
URL = "file://" + os.path.join(ROOT, "_s.html")
res = []
def check(c, n, info=""):
    res.append(bool(c)); print(("PASS " if c else "FAIL ") + n + (f"  [{info}]" if info else ""))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 420, "height": 912}, device_scale_factor=2, has_touch=True, color_scheme="dark")
        pg = await ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
        pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
        await pg.goto(URL); await pg.wait_for_timeout(500)
        await pg.evaluate("localStorage.clear()"); await pg.reload(); await pg.wait_for_timeout(500)
        # tabs fit on one row
        tops = await pg.evaluate("[...document.querySelectorAll('.tab')].map(t=>[t.getBoundingClientRect().top, t.scrollWidth<=t.clientWidth+1])")
        check(len(set(round(t[0]) for t in tops)) == 1 and all(t[1] for t in tops), "5 tabs on one row, labels fit", str(tops))
        await pg.click("#tab-study"); await pg.wait_for_timeout(400)
        check(await pg.locator(".phase").count() == 8, "8 phases listed")
        ids = await pg.evaluate("[...new Set([...document.querySelectorAll('.lrow')].map(b=>b.dataset.open))]")
        check(len(ids) >= 25, "lessons listed", str(len(ids)))
        for lid in ids:
            await pg.evaluate(f"PocketStudy.open('{lid}')"); await pg.wait_for_timeout(100)
            h = await pg.evaluate("document.body.scrollHeight")
            for y in range(0, h + 900, 700):
                await pg.evaluate(f"window.scrollTo(0,{y})"); await pg.wait_for_timeout(60)
            await pg.wait_for_timeout(250)
            nb = await pg.evaluate("document.querySelectorAll('#studyRoot .sbc').length")
            blank = await pg.evaluate("""[...document.querySelectorAll('#studyRoot .sbc')].filter(c=>{const x=c.getContext('2d').getImageData(c.width/2|0,c.height/2|0,1,1).data;return x[3]===0}).length""")
            check(blank == 0, f"lesson {lid}: {nb} boards drawn")
            if SP and lid in ("l23", "l24", "l42", "l54"):
                await pg.evaluate("window.scrollTo(0,0)"); await pg.screenshot(path=os.path.join(SP, f"{lid}.png"), full_page=True)
        # multiple choice: the right answer marks the check
        await pg.evaluate("PocketStudy.open('l12')"); await pg.wait_for_timeout(200)
        mc = pg.locator(".st-check").filter(has=pg.locator(".answers.one")).first
        await mc.locator(".ans").nth(1).click(); await pg.wait_for_timeout(100)
        check(await mc.locator(".fb.ok").count() == 1, "mc right answer accepted")
        # tap check: tap the answer found by the lab
        await pg.evaluate("PocketStudy.open('l11')"); await pg.wait_for_timeout(200)
        tc = pg.locator(".st-check").filter(has_text="Tap #2 on the trips side").first
        await tc.scroll_into_view_if_needed(); await pg.wait_for_timeout(400)
        xy = await tc.evaluate("""el=>{const c=el.querySelector('.sbc'), r=c.getBoundingClientRect();
          const F=PocketLab.film({cid:'flood',cov:'c4'}); const w=PocketLab.who(F,{num:['strong',2]}).off[0]; const s=F.sim.players[w].run.start;
          const top=Math.max(20,Math.min(34,Math.max(14,...F.live.flatMap(f=>Object.values(f.recv).map(q=>q.y)))+4));
          return [r.left+s.x/53.33*r.width, r.top+(top-s.y)/(top+8)*r.height]}""")
        await pg.mouse.click(xy[0], xy[1]); await pg.wait_for_timeout(150)
        check(await tc.locator(".fb.ok").count() == 1, "tap check: #2 accepted")
        # throw check: tap the best receiver
        await pg.evaluate("PocketStudy.open('l33')"); await pg.wait_for_timeout(200)
        th = pg.locator(".st-check").filter(has_text="Throw check").first
        await th.scroll_into_view_if_needed(); await pg.wait_for_timeout(400)
        xy = await th.evaluate("""el=>{const c=el.querySelector('.sbc'), r=c.getBoundingClientRect();
          const F=PocketLab.film({cid:'smash',cov:'c2'}); const f=F.frames.find(q=>q.t>=1.6)||F.frames[F.frames.length-1];
          const v=PocketLab.evalAt(F,1.6); const best=Object.entries(v).sort((a,b)=>b[1].ev-a[1].ev)[0][0];
          const top=Math.max(20,Math.min(34,Math.max(14,...F.live.filter(q=>q.t<=F.spec.T).flatMap(q=>Object.values(q.recv).map(z=>z.y)))+4));
          const fi=F.frames.reduce((a,q,i)=>q.t<=1.6?i:a,0), s=F.frames[fi].recv[best];
          return [r.left+s.x/53.33*r.width, r.top+(top-s.y)/(top+8)*r.height]}""")
        await th.evaluate("el=>{}")
        # move the board to the decision first
        await th.locator(".sb-scrub").evaluate("(s)=>{s.value=1.6;s.dispatchEvent(new Event('input'))}"); await pg.wait_for_timeout(100)
        await pg.mouse.click(xy[0], xy[1]); await pg.wait_for_timeout(200)
        check(await th.locator(".fb.ok").count() == 1, "throw check: best receiver accepted")
        await th.locator(".watch").click(); await pg.wait_for_timeout(1500)
        check(await th.evaluate("el=>!!PocketLab") , "watch your throw plays")
        # reps
        await pg.evaluate("PocketStudy.show({view:'reps',mode:'cov'})"); await pg.wait_for_timeout(200)
        await pg.click(".rp-body .bigbtn"); await pg.wait_for_timeout(2500)
        await pg.locator(".rp-body [data-cov]").first.click(); await pg.wait_for_timeout(200)
        check(await pg.locator(".rp-body .fb").count() == 1, "coverage rep answered")
        if SP: await pg.screenshot(path=os.path.join(SP, "reps.png"))
        await pg.evaluate("PocketStudy.show({view:'reps',mode:'thr'})"); await pg.wait_for_timeout(200)
        await pg.click(".rp-body .bigbtn"); await pg.wait_for_timeout(300)
        check(await pg.locator(".rp-body .sbc").count() == 1, "throw rep board up")
        # film room
        await pg.evaluate("PocketStudy.show({view:'film'})"); await pg.wait_for_timeout(300)
        await pg.select_option("select[data-f=cov]", "c4"); await pg.wait_for_timeout(600)
        check(await pg.locator(".fr-board .evsvg").count() == 1, "film room EV chart")
        if SP: await pg.screenshot(path=os.path.join(SP, "film.png"), full_page=True)
        # drill: launch, take a snap, end, come back
        await pg.evaluate("PocketStudy.open('l42')"); await pg.wait_for_timeout(200)
        await pg.locator(".st-drill .bigbtn").first.click(); await pg.wait_for_timeout(400)
        check(await pg.evaluate("!!PocketGame.drillState() && document.body.classList.contains('immersive')"), "drill opens Play")
        cov = await pg.evaluate("PocketGame.state().rep.cov")
        check(cov in ("c0", "c1", "fire"), "drill coverage in the slice", cov)
        await pg.click("#callChips .chip >> nth=0"); await pg.click("#breakBtn"); await pg.wait_for_timeout(100)
        await pg.click("#snapBtn"); await pg.wait_for_timeout(200)
        await pg.evaluate("(()=>{const G=PocketGame.state(); for(let i=0;i<400&&G.phase!=='result';i++){ if(G.phase==='live'&&!G.pending&&G.t>0.5){G.throwAway();} G.tick(0.02);} })()")
        await pg.wait_for_timeout(300)
        await pg.click("#exitRep"); await pg.wait_for_timeout(300)
        check(await pg.evaluate("!document.getElementById('v-study').hidden"), "back in Study after the drill")
        check(await pg.evaluate("!!PocketStudy.state().drills['Pressure looks']"), "drill summary saved")
        check(await pg.evaluate("PocketGame.drillState()===null"), "drill cleared")
        # coach lens: off by default, notes only where the coach has one
        await pg.click("#tab-study"); await pg.wait_for_timeout(200)
        await pg.evaluate("PocketStudy.show({view:'home'})"); await pg.wait_for_timeout(200)
        check(await pg.locator(".st-cnote").count() == 0 and await pg.evaluate("PocketStudy.state().coach") is None, "no lens by default")
        await pg.evaluate("PocketStudy.open('l31')"); await pg.wait_for_timeout(200)
        check(await pg.locator(".st-cnote").count() == 0, "no coach note without a lens")
        await pg.evaluate("PocketStudy.show({view:'coaches'})"); await pg.wait_for_timeout(200)
        check(await pg.locator(".crow").count() == 50, "50 coaches listed")
        await pg.fill("[data-cq]", "tampa"); await pg.wait_for_timeout(100)
        n = await pg.locator(".crow").count(); check(1 <= n <= 4, "search filters", str(n))
        await pg.fill("[data-cq]", ""); await pg.wait_for_timeout(100)
        await pg.locator(".crow[data-coach=saban]").click(); await pg.wait_for_timeout(500)
        if SP: await pg.screenshot(path=os.path.join(SP, "coach.png"), full_page=True)
        await pg.click("[data-lenson=saban]"); await pg.wait_for_timeout(200)
        await pg.evaluate("PocketStudy.open('l31')"); await pg.wait_for_timeout(200)
        check(await pg.locator(".st-cnote").count() == 1, "Saban note in Cover 3 match")
        await pg.evaluate("PocketStudy.open('l12')"); await pg.wait_for_timeout(200)
        check(await pg.locator(".st-cnote").count() == 0, "no Saban note where he has none")
        await pg.evaluate("PocketStudy.show({view:'home'})"); await pg.wait_for_timeout(200)
        check(await pg.locator(".cmark").count() == 4, "lessons with his notes are marked", str(await pg.locator(".cmark").count()))
        await pg.click(".st-coach [data-lensoff]"); await pg.wait_for_timeout(200)
        check(await pg.evaluate("PocketStudy.state().coach") is None, "lens turns off")
        for cid in ["leach", "fangio", "lombardi", "kshanahan", "ryan"]:
            await pg.evaluate(f"PocketStudy.show({{view:'coach',id:'{cid}'}})"); await pg.wait_for_timeout(150)
            await pg.evaluate("window.scrollTo(0, document.body.scrollHeight)"); await pg.wait_for_timeout(500)
            check(await pg.locator(".cfilms .sbc").count() >= 1, f"coach page {cid} films")
        # back to Play normally
        await pg.click("#tab-play"); await pg.wait_for_timeout(200)
        check(await pg.evaluate("!document.getElementById('playSetup').hidden"), "Play setup shows")
        check(not errs, "no console errors", "; ".join(errs[:5]))
        await b.close()
    print(f"{sum(res)}/{len(res)} passed")
    os.remove(os.path.join(ROOT, "_s.html"))
asyncio.run(main())
