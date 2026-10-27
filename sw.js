// Offline cache for the home-screen app. Bump VERSION when shipping changes.
const VERSION = 'sb27-v33';
const ASSETS = [
  './', './index.html', './manifest.json', './css/style.css',
  './js/main.js', './js/match.js', './js/model.js', './js/ball.js', './js/stadium.js', './js/input.js', './js/audio.js', './js/config.js', './js/commentary.js', './js/squad.js', './js/cards.js', './js/clubs.js', './js/dribble.js',
  './lib/three.module.min.js', './lib/GLTFLoader.js', './lib/SkeletonUtils.js', './lib/BufferGeometryUtils.js', './assets/player.glb', './assets/hero.jpg', './assets/voice/manifest.json', './js/commentary-lines.js', './js/cloud.js', './js/kits.js', './js/rules.js', './js/setpiece.js', './js/celebrations.js', './js/ratings.js', './js/drills.js', './js/drill-run.js', './js/league.js', './js/modes.js', './js/cup.js', './js/shootout.js', './js/facts.js', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Network first (so updates arrive), falling back to cache when offline.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (/firebaseio\.com|firebasedatabase\.app/.test(e.request.url)) return; // cloud save always goes to the network

  e.respondWith(
    // same-origin files always revalidate, so a new version shows up on the next launch
    fetch(e.request, new URL(e.request.url).origin === location.origin ? { cache: 'no-cache' } : {}).then(res => {
      if (res && (res.ok || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
