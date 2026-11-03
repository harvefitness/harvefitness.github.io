// DNT & HARVE FITNESS – service worker: makes repeat visits load almost instantly.
// - Page (index.html): network first, so new versions show up right away; cached copy when offline.
// - Versioned / hashed files (app.js?v=…, chunks, 3D model, exercise data, icons): cache first.
// - Exercise photos and Google Fonts: cached after the first view.
// - Firebase / Gemini requests are never cached (personal data stays live).
const CACHE = "dnt-harve-v1";
const IMG = "dnt-harve-img-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

const cacheFirst = async (req, name = CACHE) => {
  const c = await caches.open(name);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") c.put(req, res.clone());
  return res;
};
const networkFirst = async (req) => {
  const c = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) c.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw e;
  }
};

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("index.html")) return e.respondWith(networkFirst(req));
    if (url.pathname.endsWith("sw.js")) return;
    // Files whose URL changes with every release, or that rarely change.
    if (url.search.includes("v=") || /\/(chunks|models|data)\//.test(url.pathname) || /\.(png|svg|webmanifest)$/.test(url.pathname)) return e.respondWith(cacheFirst(req));
    return e.respondWith(networkFirst(req));
  }
  if (url.hostname === "raw.githubusercontent.com" && url.pathname.includes("free-exercise-db")) return e.respondWith(cacheFirst(req, IMG));
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") return e.respondWith(cacheFirst(req));
  // everything else (Firebase, Gemini, Google sign-in) goes straight to the network
});
