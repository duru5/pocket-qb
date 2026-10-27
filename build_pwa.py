"""Build Pocket QB as an installable web app (PWA) in dist/.

The claude.ai artifact wraps index.html in its own page, so it cannot be installed
as a standalone app. This wraps the same files in a full HTML document with the
Home Screen tags iOS and Android read, a web app manifest, icons, and a service
worker that caches everything so the app opens offline.

Usage: python3 build_pwa.py   (then serve dist/ from any static host over HTTPS)
"""
import hashlib, json, os, shutil
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, "docs")   # GitHub Pages serves main /docs
JS = ["calib.js", "engine.js", "playbook.js", "defense.js", "play.js", "run.js", "rep.js", "drive.js", "lab.js", "app.js", "game.js", "study_content.js", "study.js"]
TURF, CHALK, GOLD, LEATHER = (14, 36, 24), (228, 240, 243), (232, 197, 71), (138, 75, 37)

def icon(size, maskable=False):
    """Turf with yard lines and a football. Maskable icons keep the art inside the
    central 80% safe zone; the iOS icon is square (iOS rounds the corners itself)."""
    S = size * 4                                   # draw large, downsample for smooth edges
    im = Image.new("RGB", (S, S), TURF)
    d = ImageDraw.Draw(im)
    for i in range(1, 6):                          # mowing stripes and yard lines
        y = int(S * i / 6)
        d.rectangle([0, y - S // 12, S, y], fill=(16, 41, 27) if i % 2 else (19, 48, 32))
        d.line([0, y, S, y], fill=(255, 255, 255, 90), width=max(2, S // 160))
    pad = 0.24 if maskable else 0.16
    box = [S * pad, S * (0.5 - (0.5 - pad) * 0.62), S * (1 - pad), S * (0.5 + (0.5 - pad) * 0.62)]
    d.ellipse(box, fill=LEATHER, outline=(58, 30, 14), width=S // 90)
    cx, cy, w = S / 2, S / 2, (box[2] - box[0])
    d.line([cx - w * 0.2, cy, cx + w * 0.2, cy], fill=CHALK, width=S // 70)       # laces
    for k in range(-2, 3):
        x = cx + k * w * 0.08
        d.line([x, cy - S * 0.03, x, cy + S * 0.03], fill=CHALK, width=S // 90)
    for sx in (box[0] + w * 0.13, box[2] - w * 0.13):                              # stripes
        d.line([sx, cy - S * 0.07, sx, cy + S * 0.07], fill=CHALK, width=S // 80)
    return im.resize((size, size), Image.LANCZOS)

def main():
    if os.path.isdir(DIST): shutil.rmtree(DIST)
    os.makedirs(os.path.join(DIST, "icons"))
    for f in JS: shutil.copy(os.path.join(ROOT, f), os.path.join(DIST, f))
    icon(180).save(os.path.join(DIST, "icons", "apple-touch-icon.png"))
    icon(192).save(os.path.join(DIST, "icons", "icon-192.png"))
    icon(512).save(os.path.join(DIST, "icons", "icon-512.png"))
    icon(512, maskable=True).save(os.path.join(DIST, "icons", "icon-512-maskable.png"))

    manifest = {
        "name": "Pocket QB", "short_name": "Pocket QB",
        "description": "Call it, read it, throw it. A quarterback read trainer calibrated to NFL data.",
        "start_url": "./", "scope": "./", "display": "standalone", "orientation": "portrait",
        "background_color": "#0E2418", "theme_color": "#0E2418",
        "icons": [
            {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
            {"src": "icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]}
    json.dump(manifest, open(os.path.join(DIST, "manifest.webmanifest"), "w"), indent=1)

    body = open(os.path.join(ROOT, "index.html")).read()
    head = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0E2418">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Pocket QB">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="manifest" href="manifest.webmanifest">
"""
    sw_reg = """
<script>
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
</script>
</html>
"""
    html = head + body + sw_reg
    open(os.path.join(DIST, "index.html"), "w").write(html)

    # the cache name changes whenever any file changes, so an update replaces the old copy
    files = ["./", "index.html", "manifest.webmanifest"] + JS + ["icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-512-maskable.png"]
    h = hashlib.sha1()
    for f in ["index.html"] + JS: h.update(open(os.path.join(DIST, f), "rb").read())
    version = h.hexdigest()[:10]
    sw = """/* Pocket QB service worker: app files cache-first (the app runs offline);
   fonts cached as they load. A new build gets a new cache name and the old one is deleted. */
const CACHE = "pocketqb-%s";
const FILES = %s;
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("pocketqb-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
    const u = new URL(e.request.url);
    if (res.ok && (u.origin === location.origin || /fonts\\.(googleapis|gstatic)\\.com$/.test(u.hostname))) {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy));
    }
    return res;
  }).catch(() => caches.match("index.html"))));
});
""" % (version, json.dumps(files))
    open(os.path.join(DIST, "sw.js"), "w").write(sw)
    # GitHub Pages: serve files as they are
    open(os.path.join(DIST, ".nojekyll"), "w").write("")
    print("built dist/ version", version, "files:", len(files))

if __name__ == "__main__":
    main()
