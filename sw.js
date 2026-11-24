// Offline support: app shell + data precached; map tiles, terrain and photos cached as you browse.
const SHELL = 'geoarch-shell-v59';
const PRE = [
  './', 'index.html', 'styles.css?v=58', 'app.js?v=58', 'config.js?v=59', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'vendor/gsap.min.js', 'vendor/ScrollTrigger.min.js', 'vendor/supabase.js',
  'vendor/maplibre/maplibre-gl.js', 'vendor/maplibre/maplibre-gl.css', 'vendor/fonts/serif.woff2', 'vendor/fonts/sans.woff2',
  'data/places.json?v=20261121b', 'data/borders.json?v=20261121b', 'data/curated.json?v=20261121b',
  ...['data', 'i18n', 'map', 'names', 'names_data', 'placeview', 'walk', 'guide', 'tour', 'routes_data', 'voice_ka', 'ka_say', 'say', 'photos', 'catalog', 'route_me', 'sakartvelo', 'uk_names'].map(m => m + '.js?v=58'),
];
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('geoarch-shell-') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const TILE = /tiles\.openfreemap\.org|elevation-tiles-prod|basemaps\.cartocdn/;
const EXT = /wikipedia\.org|wikidata\.org|wikimedia\.org|memkvidreoba\.gov\.ge|routing\.openstreetmap\.de/;
async function trim(name, max) { const c = await caches.open(name); const ks = await c.keys(); for (let i = 0; i < ks.length - max; i++) await c.delete(ks[i]); }
let puts = 0;
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin && req.mode === 'navigate') {
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(r => { const cp = r.clone(); caches.open(SHELL).then(c => c.put('index.html', cp)); return r; }).catch(() => caches.match('index.html')));
    return;
  }
  if (url.pathname.includes('/vendor/piper/')) return; // the voice files keep their own cache (voice_ka.js)
  if (url.origin === location.origin) {
    // same-origin: cache first, refresh in background
    e.respondWith(caches.match(req).then(hit => {
      const net = fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(url.pathname.includes('/data/desc/') ? 'geoarch-data' : SHELL).then(c => c.put(req, cp)); } return r; })
        .catch(() => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()));
      return hit || net;
    }));
    return;
  }
  if (TILE.test(url.host + url.pathname)) {
    e.respondWith(caches.open('geoarch-tiles').then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const r = await fetch(req); if (r.ok) { c.put(req, r.clone()); if (++puts % 200 === 0) trim('geoarch-tiles', 8000); } return r;
    }));
    return;
  }
  if (EXT.test(url.host)) {
    e.respondWith(fetch(req).then(r => { if (r.ok || r.type === 'opaque') { const cp = r.clone(); caches.open('geoarch-ext').then(c => c.put(req, cp)); if (++puts % 100 === 0) trim('geoarch-ext', 1500); } return r; })
      .catch(() => caches.match(req).then(h => h || Response.error())));
  }
});
