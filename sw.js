/* Service worker: app werkt offline. Verhoog VERSION bij elke wijziging aan de bestanden. */
const VERSION = 'rf-v6';
const FILES = [
  './', './index.html', './css/styles.css', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  './js/units.js', './js/vdot.js', './js/conditions.js', './js/sports.js', './js/goal.js', './js/coach.js', './js/stats.js', './js/player.js', './js/zones.js', './js/load.js', './js/planner.js',
  './js/importers.js', './js/fitexport.js', './js/storage.js', './js/charts.js', './js/app.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// netwerk eerst (altijd de nieuwste versie), cache als terugval wanneer je offline bent
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
