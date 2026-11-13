/* Precache only locally bundled public test assets. No remote fallback.
 * A successful cache install is NOT proof of target-device offline TTS.
 */
const CACHE_PREFIX = "amysecho-ng-";
const CACHE_NAME = CACHE_PREFIX + "board-s1a-v1";
const ASSETS = [
  "./", "./index.html", "./manifest.webmanifest", "./styles.css",
  "./main.js", "./status.js", "./board.js", "./concepts.js", "./speech.js",
  "./icons/hilfe.svg", "./icons/trinken.svg", "./icons/pause.svg",
  "./icons/mehr.svg", "./icons/fertig.svg", "./icons/app.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS.map((asset) => new URL(asset, self.registration.scope).href));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin ||
      !url.href.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    return cached ?? fetch(event.request);
  })());
});
