/* WealthKart service worker: caches the app shell so the PWA opens offline.
 *
 * Rules:
 * - Only same-origin GET requests are handled. RPC calls, wallet traffic and anything
 *   cross-origin go straight to the network and are never cached (chain data must be live).
 * - Pages: network first, cached copy when offline (the UI marks data stale, S-WEB-09).
 * - Hashed build assets (/_next/static/) and icons: cache first.
 * Bump VERSION to drop old caches.
 *
 * Reminders (ADR 0052): `push` shows the message the indexer Worker sent, adding the deadline in
 * this device's own time (ADR 0014); `notificationclick` opens or focuses the app page it names.
 * Only same-origin `/app/` paths are opened, whatever the message says.
 */
const VERSION = "wk-shell-v2";
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

/** "Wed 11 Dec, 05:29" in the device's time zone, or "" if the date can't be shown. */
function localTime(sec) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(sec * 1000));
  } catch {
    return "";
  }
}

/** Only app pages on this site; anything else opens the app home. */
function safeAppPath(url) {
  try {
    const u = new URL(String(url || ""), self.location.origin);
    if (u.origin === self.location.origin && u.pathname.startsWith("/app/")) {
      return u.pathname + u.search + u.hash;
    }
  } catch {
    // fall through
  }
  return "/app/";
}

/** The notification to show for a push message (unit tested in seo.test.ts via new Function). */
function notificationFrom(data) {
  const d = data && typeof data === "object" ? data : {};
  const title = typeof d.title === "string" && d.title ? d.title.slice(0, 80) : "WealthKart";
  let body = typeof d.body === "string" ? d.body.slice(0, 300) : "";
  if (typeof d.at === "number" && d.at > 0) {
    const local = localTime(d.at);
    if (local) body = `${body} Your time: ${local}.`;
  }
  return {
    title,
    options: {
      body,
      tag: typeof d.tag === "string" ? d.tag.slice(0, 120) : undefined,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: safeAppPath(d.url) },
    },
  };
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const n = notificationFrom(data);
  event.waitUntil(self.registration.showNotification(n.title, n.options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = safeAppPath(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          return w.focus().then(() => ("navigate" in w ? w.navigate(path) : undefined));
        }
      }
      return self.clients.openWindow(path);
    }),
  );
});
