
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
        // Use addAll for atomic operation, but handle potential individual failures gracefully
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
    // We only want to handle GET requests
    if (event.request.method !== 'GET') {
        return;
    }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response; // Return from cache
        }
        // Not in cache, fetch from network
        return fetch(event.request).then(
          networkResponse => {
            // Check if we received a valid response
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            // Clone the response to cache it
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            return networkResponse;
          }
        ).catch(error => {
            // Network request failed, you could return a fallback page here if needed
            console.error('Fetch failed:', error);
            // Example: return caches.match('/offline.html');
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
