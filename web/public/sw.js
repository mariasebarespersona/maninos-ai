/**
 * Maninos AI — Service Worker for PWA
 * 
 * Strategy: NETWORK FIRST for everything during development.
 * This prevents stale cache issues.
 * 
 * Bump CACHE_VERSION to force update on all clients.
 */

const CACHE_VERSION = 3;
const CACHE_NAME = `maninos-v${CACHE_VERSION}`;

// Install — skip waiting immediately to activate new SW
self.addEventListener('install', (event) => {
  console.log(`[SW] Installing v${CACHE_VERSION}`);
  self.skipWaiting();
});

// Activate — cleanup ALL old caches and take control
self.addEventListener('activate', (event) => {
  console.log(`[SW] Activating v${CACHE_VERSION}`);
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log(`[SW] Deleting old cache: ${key}`);
            return caches.delete(key);
          })
      );
    })
  );
  // Claim all open clients immediately
  self.clients.claim();
});

// Fetch — ALWAYS network first, no cache during development
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  // Always go to network, never serve from cache
  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match(event.request))
  );
});
