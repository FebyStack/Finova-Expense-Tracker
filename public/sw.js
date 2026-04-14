// 1. Core Asset Configuration
const CACHE_NAME = 'finova-v3'; // Bumped version
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './login.html',
  './signup.html',
  './dashboard.html',
  './manifest.json',
  './assets/fivano.png',
  './css/style.css',
  './css/dashboard.css',
  './css/auth.css',
  './css/dark.css',
  './css/sync.css',
  './css/upload.css',
  './js/app.js',
  './js/api.js',
  './js/db.js',
  './js/sync.js',
  './js/dashboard.js',
  './js/auth.js',
  './js/signup.js',
  './js/expenses.js',
  './js/expense-list.js',
  './js/income.js',
  './js/income-list.js',
  './js/budgets.js',
  './js/budgets-list.js',
  './js/savings.js',
  './js/savings-list.js',
  './js/recurring-list.js',
  './js/categories.js',
  './js/currency.js',
  './js/charts.js',
  './js/chat.js',
  './js/notifications.js',
  './js/receipt.js',
  './js/settings.js',
  './js/calendar.js',
  './js/confirm.js',
  './js/reports-export.js',
  './js/supabase-config.js',
  './api/config-js',
  './js/animation.js',
  // External Dependencies
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm',
  'https://fonts.googleapis.com/css2?family=Merriweather:wght@700;900&family=Inter:wght@400;500;600&display=swap',
  'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap',
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// 2. Install Event - Fault-tolerant caching
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Commencing pre-cache...');
      const cachePromises = ASSETS_TO_CACHE.map(url => {
        return cache.add(new Request(url, { mode: 'no-cors' })).catch(err => {
          // If no-cors doesn't work (for ESM), try normal
          return cache.add(url).catch(e => {
            console.warn(`[Service Worker] Skipping cache for: ${url}`);
          });
        });
      });
      return Promise.all(cachePromises).then(() => {
        console.log('[Service Worker] Pre-cache complete!');
        self.skipWaiting();
        
        // Notify all clients that assets are ready for offline use
        self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
          clients.forEach(client => {
            client.postMessage({ type: 'OFFLINE_READY' });
          });
        });
      });
    })
  );
});

// 3. Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 4. Fetch Event - Hybrid Strategy (Cache First for Deps, SWR for Assets)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip caching for dynamic API calls that require network
  if ((url.pathname.includes('/api/') && !url.pathname.includes('config-js')) || url.hostname.includes('supabase.co')) {
    return;
  }

  // Helper to check if it's an external CDN dependency
  const isCDN = url.hostname.includes('gstatic.com') || 
                url.hostname.includes('googleapis.com') || 
                url.hostname.includes('jsdelivr.net') || 
                url.hostname.includes('cdnjs.cloudflare.com');

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // If it's a CDN asset, return cache IMMEDIATELY (Cache-First)
        // because these rarely change and are critical for offline boot.
        if (isCDN) return cachedResponse;
        
        // Otherwise, return cache but refresh in background (SWR)
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        }).catch(() => {});
        return cachedResponse;
      }

      // If not in cache, fetch and store dynamically if it's a CDN or local asset
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'error') {
          return networkResponse;
        }

        const isAsset = url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|ico|woff2|json)$/) || isCDN;
        if (isAsset && event.request.method === 'GET') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      }).catch((err) => {
        // Ultimate fallback for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('./dashboard.html') || caches.match('./index.html');
        }
        throw err;
      });
    })
  );
});

// 5. Push Notification Events
self.addEventListener('push', (event) => {
  let data = { title: 'Finova Update', body: 'You have a new message!', url: '/dashboard.html' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: './assets/fivano.png',
    badge: './assets/fivano.png',
    data: {
      url: data.url || '/dashboard.html'
    },
    actions: [
      { action: 'open', title: 'Open Finova' },
      { action: 'close', title: 'Dismiss' }
    ],
    vibrate: [100, 50, 100],
    tag: 'finova-alert'
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const urlToOpen = event.notification.data.url;
      
      for (const client of clientList) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
