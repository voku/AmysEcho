/* Precache only locally bundled public test assets. No remote fallback.
 * A successful cache install is NOT proof of target-device offline TTS.
 *
 * The hand tracker (vendor/mediapipe/, about 25 MB) is NOT in this list: it
 * has its own cache, "amysecho-tracker-<version>-<digest>", which the capture path
 * (capture/capture.js) fills and checks on the first tap, so a failed tracker
 * download can never fail the board's install. "activate" below removes only
 * old board caches; that prefix does not match the tracker's.
 */
/* Revision of the precached files. A browser installs a new worker only when
 * this file changes, and the install re-fetches every asset below past the
 * HTTP cache into the same cache. Raise it whenever a precached file changes
 * without a change to this file. */
const ASSET_REVISION = "teach-replay-1"; // card NG-4: fit line and replay in the teaching view
const CACHE_PREFIX = "amysecho-ng-";
const CACHE_NAME = CACHE_PREFIX + "capture-v2";
/* Filled in by scripts/assemble.mjs (card NG-14) from the built app: the page,
 * what it links, every module reached through static imports, the tracker's
 * module worker, and the pictures (appAssets in scripts/offline-smoke.mjs).
 * Left empty here on purpose: there is no hand-kept list to forget a file in. */
const ASSETS = [];
/* Tracker files live under vendor/mediapipe/<version>-<digest>/ and are
 * answered only from the cache named "amysecho-tracker-<version>-<digest>",
 * never from another cache (an old build's file must not answer for a new
 * one). The wasm loader is also requested as "...?task=pose" (a module worker
 * evaluates it once per URL); its cached copy is found without the query. */
const TRACKER_CACHE_PREFIX = "amysecho-tracker-";
const TRACKER_PATH = "vendor/mediapipe/";

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
    const trackerBase = new URL(TRACKER_PATH, self.registration.scope).href;
    const tracker = url.href.startsWith(trackerBase);
    // The tracker's manifest names the files of the current build: from the
    // network when there is one, so an update is seen; the cached copy offline.
    if (url.href === trackerBase + "manifest.json") {
      try {
        return await fetch(event.request);
      } catch {
        return (await caches.match(event.request)) ?? Response.error();
      }
    }
    if (tracker) {
      const directory = url.pathname.slice(new URL(trackerBase).pathname.length).split("/")[0];
      const name = TRACKER_CACHE_PREFIX + directory;
      const cached = directory !== "" && await caches.has(name)
        ? await (await caches.open(name)).match(event.request, { ignoreSearch: true })
        : undefined;
      return cached ?? fetch(event.request);
    }
    const cached = await caches.match(event.request);
    return cached ?? fetch(event.request);
  })());
});
