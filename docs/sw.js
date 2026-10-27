/* Pocket QB service worker: app files cache-first (the app runs offline);
   fonts cached as they load. A new build gets a new cache name and the old one is deleted. */
const CACHE = "pocketqb-37985b2c38";
const FILES = ["./", "index.html", "manifest.webmanifest", "calib.js", "engine.js", "playbook.js", "defense.js", "play.js", "run.js", "rep.js", "drive.js", "app.js", "game.js", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-512-maskable.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("pocketqb-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
    const u = new URL(e.request.url);
    if (res.ok && (u.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(u.hostname))) {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy));
    }
    return res;
  }).catch(() => caches.match("index.html"))));
});
