const CACHE_NAME = 'dmlek-cache-v1';
const OFFLINE_URLS = [
  '/',
  '/index.html',
  '/news.html',
  '/announcements.html',
  '/about.html',
  '/contact.html',
  '/gallery.html',
  '/styles.css',
  '/manifest.json',
  '/images/kunama-flag.png',
  '/images/emblem.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        // Put a copy of the response in the runtime cache.
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, response.clone());
          return response;
        });
      });
    })
  );
});