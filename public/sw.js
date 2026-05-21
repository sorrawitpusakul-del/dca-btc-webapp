const CACHE_NAME = 'btc-dca-runtime-cache-v1';

// Install Event: Skip waiting to activate SW immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate Event: Clean up outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('PWA: Removing old cache', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Smart dynamic stale-while-revalidate caching
self.addEventListener('fetch', (event) => {
  // Only handle standard GET requests
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  // Bypass logging/debugging hot reloads and third party developer sockets
  if (url.includes('chrome-extension') || url.includes('/@vite/') || url.includes('/@fs/')) {
    return;
  }

  // Bypass Live BTC market rates and USD/THB exchange rates APIs (Must be live)
  if (
    url.includes('coingecko.com') || 
    url.includes('api.exchangerate') || 
    url.includes('api.coindesk')
  ) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Safe fallback to local cache in case of complete internet disconnection
        return caches.match(event.request);
      })
    );
    return;
  }

  // Stale-While-Revalidate strategy for static and hashed chunks
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch fresh copy in the background and update the cache
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(() => {/* ignore errors offline */});
        
        return cachedResponse;
      }

      // If not in cache, fetch from network and dynamically cache the result
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        
        return networkResponse;
      }).catch(() => {
        // Offline dynamic fallback: if navigating, return the cached entry point
        if (event.request.mode === 'navigate') {
          return caches.match('/');
        }
      });
    })
  );
});
