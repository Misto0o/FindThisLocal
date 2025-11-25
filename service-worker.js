const CACHE_NAME = "find-this-local-cache-v1";
const urlsToCache = [
    "./",
    "./index.html",
    "./styles.css",
    "./app.js",
    "./privacy.html",
    "./manifest.json",
    "FindThisLocalIcons/favicon.ico"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener("fetch", event => {
    event.respondWith(
        caches.match(event.request).then(response => response || fetch(event.request))
    );
});
