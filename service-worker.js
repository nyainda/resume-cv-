const CACHE_NAME = 'ai-cv-builder-v1';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/index.tsx',
  '/App.tsx',
  '/types.ts',
  '/hooks/useLocalStorage.ts',
  '/hooks/useSessionStorage.ts',
  '/services/geminiService.ts',
  '/services/pdfService.ts',
  '/components/icons.tsx',
  '/components/ui/Button.tsx',
  '/components/ui/Input.tsx',
  '/components/ui/Textarea.tsx',
  '/components/ui/Label.tsx',
  '/components/ProfileForm.tsx',
  '/components/CVGenerator.tsx',
  '/components/CVPreview.tsx',
  '/components/SavedCVs.tsx',
  '/components/CoverLetterPreview.tsx',
  '/components/templates/TemplateModern.tsx',
  '/components/templates/TemplateProfessional.tsx',
  '/components/templates/TemplateMinimalist.tsx',
  '/components/templates/TemplateCorporate.tsx',
  '/components/templates/TemplateCreative.tsx',
  '/components/templates/TemplateTimeline.tsx',
  '/components/templates/TemplateTwoColumnBlue.tsx',
  '/components/templates/TemplateExecutive.tsx',
  '/components/templates/TemplateCompact.tsx',
  '/components/templates/TemplateElegant.tsx',
  '/components/templates/TemplateTechnical.tsx',
  '/components/templates/TemplateSoftwareEngineer.tsx',
  '/components/templates/TemplateModernTech.tsx',
  '/components/templates/TemplateInfographic.tsx',
  '/components/templates/TemplateClassic.tsx',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        const cachePromises = URLS_TO_CACHE.map(url => {
          return cache.add(url).catch(err => {
            console.warn(`Failed to cache ${url}:`, err);
          });
        });
        return Promise.all(cachePromises);
      })
  );
});

self.addEventListener('fetch', event => {
  // Ignore non-GET requests
  if (event.request.method !== 'GET') return;

  // ✅ Ignore non-http(s) requests (chrome-extension://, etc.)
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response; // Return from cache
        }

        // Not in cache, fetch from network
        return fetch(event.request).then(networkResponse => {
          // Only cache valid basic responses
          if (
            !networkResponse ||
            networkResponse.status !== 200 ||
            networkResponse.type !== 'basic'
          ) {
            return networkResponse;
          }

          // Clone and cache the response
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            // ✅ Extra safety: only cache http(s) requests
            if (event.request.url.startsWith('http')) {
              cache.put(event.request, responseToCache);
            }
          });

          return networkResponse;
        }).catch(error => {
          console.error('Fetch failed:', error);
          // Optionally: return caches.match('/offline.html');
        });
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName); // Delete old caches
          }
        })
      );
    })
  );
});