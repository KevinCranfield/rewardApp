const CACHE_NAME = "reward-game-v1";
const urlsToCache = [
  "/",
  "/static/game/css/styles.css",
  "/static/game/js/game.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});