// Service Worker: Netzwerk zuerst, bei fehlender Verbindung aus dem Cache.
// So sind Änderungen online sofort sichtbar, und offline läuft die App mit dem letzten Stand.

const CACHE = 'vokabeln-v2';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'src/app.js',
  'src/parser.js',
  'src/check.js',
  'src/storage.js',
  'src/decks.js',
  'src/quiz.js',
  'decks/index.json',
];

async function precache() {
  const cache = await caches.open(CACHE);
  // cache: 'reload' umgeht den HTTP-Cache des Browsers, sonst landen evtl. alte Dateien im Offline-Cache.
  await cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' })));
  try {
    const list = await (await fetch('decks/index.json')).json();
    await cache.addAll(list.map((entry) => `decks/${entry.file}`));
  } catch {
    // Kapitel werden dann beim ersten Laden zwischengespeichert.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      // no-cache: beim Server nachfragen statt den HTTP-Cache zu nehmen (GitHub Pages erlaubt 10 Minuten).
      // Sonst könnten nach einem Update neue und alte Module gemischt geladen werden.
      const response = await fetch(request, { cache: 'no-cache' });
      if (response.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      const cached = await caches.match(request, { ignoreSearch: true });
      return cached ?? Response.error();
    }
  })());
});
