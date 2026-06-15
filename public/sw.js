const CACHE_NAME = "tanhowa-v8";
const OFFLINE_URL = "/offline";
const STATIC_ASSETS = [
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
];

// Cache key for API responses (network-first with offline fallback)
const API_CACHE = "tanhowa-api-v4";
const CACHEABLE_API = [
  "/api/announcements", "/api/events", "/api/polls", "/api/documents",
  "/api/resolutions", "/api/stats", "/api/trainings", "/api/faq",
  "/api/wishlist", "/api/notifications",
];

// Auth-sensitive paths — never intercept these. Their behavior depends entirely on
// the session cookie; serving a stale cached version causes "browser stuck loading"
// or redirect-loop bugs that disappear only in incognito (where there's no SW).
const AUTH_SENSITIVE_PATHS = [
  "/", "/onboarding", "/pending", "/suspended", "/verify", "/feedback",
];
const AUTH_SENSITIVE_PREFIXES = ["/admin", "/dashboard"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== API_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Cache-then-network for cacheable API routes (announcements, events)
  if (CACHEABLE_API.some((path) => url.pathname.startsWith(path))) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(API_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Skip other API calls
  if (url.pathname.startsWith("/api/")) return;

  // Skip auth-sensitive pages — let the browser go straight to network so the session
  // cookie is always honored. Otherwise stale cached HTML can break the OAuth round-trip
  // ("browser running but not going through" symptom that disappears in incognito).
  if (AUTH_SENSITIVE_PATHS.includes(url.pathname)) return;
  if (AUTH_SENSITIVE_PREFIXES.some((p) => url.pathname.startsWith(p))) return;

  // Network-first for pages, cache-first for static assets
  if (request.url.match(/\.(png|jpg|jpeg|svg|webp|woff2?|ico)$/)) {
    // Cache-first for images/fonts
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
  } else {
    // Network-first for HTML/pages — fall back to cache or offline page
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))
      )
    );
  }
});

// Push notification handler
self.addEventListener("push", (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    const options = {
      body: data.body || "",
      icon: data.icon || "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      data: { url: data.url || "/" },
    };
    event.waitUntil(self.registration.showNotification(data.title || "TANHOWA", options));
  } catch {
    // Silent
  }
});

// Notification click handler — open the URL
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});
