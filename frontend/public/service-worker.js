// ProCV Service Worker
// Caches only the app shell (HTML + icons + manifest).
// All JS/CSS bundles are Vite-hashed so we can't hardcode them here —
// they are served fresh from the network and cached automatically on
// first fetch. API calls (Cloudflare Worker, Drive, Google APIs) are
// always network-first and never cached.

const CACHE_NAME = 'procv-v2';

// The minimal shell we want available offline (so the app at least loads)
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/logo.svg',
];

// ── Install: cache the shell ──────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(
        SHELL_URLS.map(url =>
          cache.add(url).catch(err =>
            console.warn(`[SW] Failed to cache ${url}:`, err)
          )
        )
      )
    )
  );
  self.skipWaiting();
});

// ── Activate: delete old caches ───────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: network-first with shell fallback ──────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;

  // Only handle GET requests over http(s)
  if (request.method !== 'GET') return;
  if (!request.url.startsWith('http')) return;

  const url = new URL(request.url);

  // Never cache API calls, OAuth flows, or cross-origin resources
  const isApi = url.pathname.startsWith('/api/') ||
                url.hostname !== self.location.hostname;
  if (isApi) return; // let the browser handle it normally

  event.respondWith(
    fetch(request)
      .then(networkResponse => {
        // Cache valid same-origin responses (JS bundles, CSS, fonts, etc.)
        if (
          networkResponse.ok &&
          networkResponse.type === 'basic'
        ) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return networkResponse;
      })
      .catch(() =>
        // Network failed — serve from cache (shell / previously cached bundle)
        caches.match(request).then(cached =>
          cached ?? caches.match('/index.html')
        )
      )
  );
});
