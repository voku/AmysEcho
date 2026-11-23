import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
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
  // The hand tracker (vendor/mediapipe/, card NG-3).
  ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".task": "application/octet-stream",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
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
 * index.html, known file types only, query strings ignored). `onRequest` sees
 * every request path. Resolves to the server and its origin
 * ("http://127.0.0.1:<port>/").
 */
export async function serveDist(dist = DIST, onRequest = () => undefined) {
  const server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname).slice(1);
      onRequest(path, request);
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
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return { server, origin: `http://127.0.0.1:${address.port}/` };
}

/**
 * Serves `dist` (see `serveDist`) and fetches the service worker and every
 * entry of its pre-cache list. Rejects for an entry that is not served or is
 * empty: installing the worker would fail on it, and the app would not work
 * offline. Returns the checked paths.
 */
export async function smoke(dist = DIST) {
  const { server, origin } = await serveDist(dist);
  try {
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

/**
 * The tracker files (card NG-3) are not in the board's pre-cache; the capture
 * path fills their own cache from vendor/mediapipe/manifest.json. Checks that
 * every file the manifest names is served with its size and sha256, and that
 * none of them is in the board's pre-cache list, so a failed tracker download
 * cannot fail the board's install. Returns the checked paths.
 */
export async function trackerSmoke(dist = DIST) {
  const { server, origin } = await serveDist(dist);
  try {
    const manifestPath = "vendor/mediapipe/manifest.json";
    const response = await fetch(new URL(manifestPath, origin));
    assert.equal(response.status, 200, `missing tracker manifest: ./${manifestPath}`);
    const manifest = await response.json();
    const precached = new Set(await precacheList(await readFile(new URL("sw.js", dist), "utf8")));
    const paths = [];
    for (const file of manifest.files) {
      const path = `vendor/mediapipe/${file.path}`;
      assert.ok(!precached.has(path), `tracker file in the board's pre-cache: ./${path}`);
      const served = await fetch(new URL(path, origin));
      assert.equal(served.status, 200, `missing tracker file: ./${path}`);
      const bytes = Buffer.from(await served.arrayBuffer());
      assert.equal(bytes.byteLength, file.bytes, `tracker file of the wrong size: ./${path}`);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256, `tracker file does not match its sha256: ./${path}`);
      paths.push(path);
    }
    assert.ok(!precached.has(manifestPath), "the tracker manifest is in the board's pre-cache");
    return paths;
  } finally {
    server.close();
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const paths = await smoke();
  console.log(`NG local bundle smoke OK (${paths.length} files from the service worker's pre-cache list); browser offline and actual speech are unverified`);
  const tracker = await trackerSmoke();
  console.log(`NG tracker files OK (${tracker.length} files with their sha256, served, none in the board's pre-cache)`);
}
