const CACHE_NAME = "reward-game-v2"; // 🔁 bump this on each deploy

// Install - activate immediately
self.addEventListener("install", event => {
  self.skipWaiting();
});

// Activate - clear old caches and take control
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// Fetch - network first, fallback to cache
self.addEventListener("fetch", event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache successful responses
        if (event.request.method === "GET" && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// 🔥 Listen for skipWaiting message (instant update)
self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});