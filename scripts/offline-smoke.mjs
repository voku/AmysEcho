import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { extname } from "node:path";
import { pathToFileURL } from "node:url";

const DIST = new URL("../dist/", import.meta.url);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

/**
 * The pre-cache list of a built service worker, as the worker itself hands it
 * to the cache: its source is run with a fake scope and the install step is
 * recorded. So there is no second list here that could go stale. Returns
 * paths relative to the scope ("" for the scope itself).
 */
export async function precacheList(workerSource) {
  const scope = "https://smoke.invalid/app/";
  const listeners = {};
  const added = [];
  const self = {
    registration: { scope },
    location: { origin: new URL(scope).origin },
    addEventListener(type, listener) { listeners[type] = listener; },
    skipWaiting: async () => undefined,
  };
  const caches = { open: async () => ({ addAll: async (requests) => { added.push(...requests); } }) };
  new Function("self", "caches", workerSource)(self, caches);
  assert.equal(typeof listeners.install, "function", "the service worker has no install step");
  let installed;
  listeners.install({ waitUntil(promise) { installed = promise; } });
  await installed;
  const paths = added.map((request) => {
    const url = typeof request === "string" ? new URL(request, scope).href : request.url;
    assert.ok(url.startsWith(scope), `pre-cache entry outside the scope: ${url}`);
    return url.slice(scope.length);
  });
  assert.ok(paths.length > 0, "the service worker pre-caches nothing");
  return paths;
}

/**
 * Serves `dist` the way a plain static host does (the directory itself as
 * index.html, known file types only) and fetches the service worker and every
 * entry of its pre-cache list. Rejects for an entry that is not served or is
 * empty: installing the worker would fail on it, and the app would not work
 * offline. Returns the checked paths.
 */
export async function smoke(dist = DIST) {
  const server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname).slice(1);
      const file = path === "" || path.endsWith("/") ? `${path}index.html` : path;
      const type = TYPES[extname(file)];
      const target = new URL(file, dist);
      if (type === undefined || !target.href.startsWith(dist.href)) throw new Error("not served");
      const body = await readFile(target);
      response.writeHead(200, { "content-type": type, "cache-control": "no-store" });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  server.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}/`;
    const paths = ["sw.js", ...await precacheList(await readFile(new URL("sw.js", dist), "utf8"))];
    for (const path of paths) {
      const response = await fetch(new URL(path, origin));
      assert.equal(response.status, 200, `missing locally bundled asset: ./${path}`);
      assert.ok((await response.arrayBuffer()).byteLength > 0, `empty locally bundled asset: ./${path}`);
    }
    return paths;
  } finally {
    server.close();
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const paths = await smoke();
  console.log(`NG local bundle smoke OK (${paths.length} files from the service worker's pre-cache list); browser offline and actual speech are unverified`);
}
