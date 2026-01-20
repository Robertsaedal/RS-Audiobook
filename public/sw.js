const CACHE_NAME = 'rs-audio-v13';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Robust Caching: Iterate assets individually.
      // If one asset fails (e.g., version mismatch), the SW still installs, 
      // ensuring the "Add to Home Screen" banner works on Android.
      await Promise.all(
        STATIC_ASSETS.map(url => 
          cache.add(url).catch(err => console.error(`Failed to cache ${url}:`, err))
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip caching for API calls, streams, and sockets
  if (
    url.hostname.includes('robertsaedal.xyz') || 
    url.pathname.includes('/api/') ||
    url.pathname.includes('/socket.io') ||
    url.pathname.endsWith('.m3u8') || 
    url.pathname.endsWith('.ts')
  ) {
    return;
  }

  // Cache static UI assets
  if (STATIC_ASSETS.includes(url.pathname) || url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
    return;
  }

  return;
});