const CACHE_NAME = "sobers-pizza-independent-v71";
const SHELL = [
  "./",
  "./index.html",
  "./css/sobers-pizza.css",
  "./css/sobers-vibrant.css",
  "./css/sobers-urban.css",
  "./css/sobers-glass.css",
  "./css/sobers-customer.css",
  "./css/sobers-polished.css",
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
  "./track/track-live.css",
  "./track/track-live.js",
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
  "./assets/logo/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(
          SHELL.map((url) =>
            cache.add(url).catch((error) => {
              console.warn("Sobers Pizza could not pre-cache:", url, error);
            }),
          ),
        ),
      )
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
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((clients) => clients.forEach((client) => client.postMessage({ type: "PWA_UPDATED" }))),
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
  const destination = event.request.destination;
  if (destination === "image" || destination === "font") {
    event.respondWith(
      caches.match(event.request).then((hit) => {
        const fresh = fetch(event.request)
          .then((response) => {
            if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
            return response;
          })
          .catch(() => hit);
        return hit || fresh;
      }),
    );
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
