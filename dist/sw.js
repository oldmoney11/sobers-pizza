const CACHE_NAME = "sobers-pizza-independent-v44";
const SHELL = [
  "./",
  "./index.html",
  "./css/sobers-pizza.css",
  "./css/sobers-vibrant.css",
  "./css/sobers-urban.css",
  "./css/sobers-glass.css",
  "./css/sobers-customer.css",
  "./JS/sobers-platform-orders.js",
  "./JS/sobers-pizza.js",
  "./JS/sobers-notices.js",
  "./JS/sobers-extras.js",
  "./JS/sobers-customer.js",
  "./JS/sobers-auth.js",
  "./manifest.json",
  "./track/",
  "./track/index.html",
  "./track/track.css",
  "./track/track.js",
  "./legal/terms.html",
  "./legal/privacy.html",
  "./kiosk/main-branch/",
  "./kiosk/main-branch/index.html",
  "./kiosk/kiosk-config.js",
  "./kiosk/kiosk.css",
  "./kiosk/kiosk.js",
  "./assets/logo/favicon-192.png",
  "./assets/logo/favicon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("sobers-pizza-independent-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin)
    return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((hit) => hit || caches.match("./index.html"))),
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(
      (hit) =>
        hit ||
        fetch(event.request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        }),
    ),
  );
});
