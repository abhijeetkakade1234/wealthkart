/* WealthKart service worker: caches the app shell so the PWA opens offline.
 *
 * Rules:
 * - Only same-origin GET requests are handled. RPC calls, wallet traffic and anything
 *   cross-origin go straight to the network and are never cached (chain data must be live).
 * - Pages: network first, cached copy when offline (the UI marks data stale, S-WEB-09).
 * - Hashed build assets (/_next/static/) and icons: cache first.
 * Bump VERSION to drop old caches.
 */
const VERSION = "wk-shell-v1";
const SHELL = ["/", "/app/", "/manifest.webmanifest", "/icon.svg", "/icon-192.png"];

/** @returns {"network-first" | "cache-first" | "bypass"} */
function strategyFor(url, method, origin) {
  if (method !== "GET") return "bypass";
  const u = new URL(url);
  if (u.origin !== origin) return "bypass";
  if (u.pathname.startsWith("/_next/static/") || /^\/icon[\w-]*\.(png|svg)$/.test(u.pathname)) {
    return "cache-first";
  }
  if (u.pathname.startsWith("/_next/") || u.pathname === "/sw.js") return "bypass";
  return "network-first";
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(VERSION)).put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      (await caches.open(VERSION)).put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request, { ignoreSearch: request.mode === "navigate" });
    if (cached) return cached;
    if (request.mode === "navigate") {
      const path = new URL(request.url).pathname;
      const shell = await caches.match(path.startsWith("/app/") ? "/app/" : "/");
      if (shell) return shell;
    }
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const strategy = strategyFor(request.url, request.method, self.location.origin);
  if (strategy === "bypass") return;
  event.respondWith(strategy === "cache-first" ? cacheFirst(request) : networkFirst(request));
});
