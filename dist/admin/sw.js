const CACHE = "sobers-admin-v18",
  SHELL = [
    "./",
    "./index.html",
    "./manifest.json",
    "./platform-admin.css",
    "./admin-crud.css",
    "./sobers-admin-pro.css",
    "./business-admin-themes.css",
    "./platform-config.js",
    "./business-admin.js",
    "./admin-theme.js",
    "./admin-security.js",
    "./admin-pwa.js",
    "./vendor/supabase.min.js",
    "./assets/icon-192.png",
    "./assets/icon-512.png",
  ];
self.addEventListener("install", (e) =>
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.all(SHELL.map((x) => c.add(x))))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((k) =>
        Promise.all(
          k
            .filter((x) => x.startsWith("sobers-admin-") && x !== CACHE)
            .map((x) => caches.delete(x)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) {
          let x = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, x));
        }
        return r;
      })
      .catch(() =>
        caches
          .match(e.request)
          .then(
            (r) => r || (e.request.mode === "navigate" ? caches.match("./index.html") : undefined),
          ),
      ),
  );
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => (list[0] ? list[0].focus() : clients.openWindow("./#orders"))),
  );
});
