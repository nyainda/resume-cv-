// ProCV Service Worker
// Caches only the app shell (HTML + icons + manifest).
// All JS/CSS bundles are Vite-hashed so we can't hardcode them here —
// they are served fresh from the network and cached automatically on
// first fetch. API calls (Cloudflare Worker, Drive, Google APIs) are
// always network-first and never cached.
//
// ⚠️  skipWaiting() is NOT called automatically on install.
//     A new SW sits in "waiting" state — it does NOT take over open tabs
//     mid-session (which would cause a surprise reload and lose user work).
//     The app shows an "Update available" banner; when the user clicks it
//     the page sends SKIP_WAITING which triggers the swap.

const CACHE_NAME = 'procv-v3';

const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/logo.svg',
];

// ── Install: cache shell, stay in waiting ──────────────────────────────────
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
    // No self.skipWaiting() — the new SW waits for the user to opt in.
  );
});

// ── On-demand: user clicked "Update" in the banner ────────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Activate: delete old caches, then claim clients ───────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch: network-first with shell fallback ──────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;

  if (request.method !== 'GET') return;
  if (!request.url.startsWith('http')) return;

  const url = new URL(request.url);

  const isApi = url.pathname.startsWith('/api/') ||
                url.hostname !== self.location.hostname;
  if (isApi) return;

  event.respondWith(
    fetch(request)
      .then(networkResponse => {
        if (networkResponse.ok && networkResponse.type === 'basic') {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return networkResponse;
      })
      .catch(() =>
        caches.match(request).then(cached =>
          cached ?? caches.match('/index.html')
        )
      )
  );
});
