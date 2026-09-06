const CACHE = 'leafy-shell-v1';
const SHELL_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './xframe-bypass.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Only cache-first the app shell itself. Everything the iframe loads (the
// actual sites being browsed, plus any proxy/bypass traffic) is a separate
// request context and is NOT intercepted here.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const isOwnFile = SHELL_FILES.some((f) => url.pathname.endsWith(f.replace('./', '/')) || (f === './' && url.pathname.endsWith('/')));

  if (e.request.mode === 'navigate' || isOwnFile) {
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetch(e.request).catch(() => caches.match('./index.html')))
    );
  }
});
