/* Precache only locally bundled public test assets. No remote fallback.
 * A successful cache install is NOT proof of target-device offline TTS.
 */
const CACHE_PREFIX = "amysecho-ng-";
const CACHE_NAME = CACHE_PREFIX + "board-ux-v4";
const ASSETS = [
  "./", "./index.html", "./manifest.webmanifest", "./styles.css",
  "./main.js", "./status.js", "./board.js", "./concepts.js", "./speech.js",
  "./app.js", "./board-data.js", "./startup.js", "./caregiver.js", "./profiles/backend.js",
  "./profiles/indexeddb-backend.js", "./profiles/profile.js", "./profiles/store.js",
  "./icons/hilfe.svg", "./icons/trinken.svg", "./icons/pause.svg",
  "./icons/mehr.svg", "./icons/fertig.svg", "./icons/sprechen.svg",
  "./icons/app.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // "reload" goes past the HTTP cache: an update must not pin a mix of old
    // and new modules because some of them were still cached by the browser.
    await cache.addAll(ASSETS.map((asset) =>
      new Request(new URL(asset, self.registration.scope).href, { cache: "reload" })));
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
