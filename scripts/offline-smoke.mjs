import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { once } from "node:events";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
 * What the built app needs offline, worked out from `dist` itself (card
 * NG-14): the page; the module scripts and the style sheet and manifest it
 * links; every module those reach through static imports; module workers
 * started as `new Worker(new URL("...", import.meta.url))` and what they
 * import; and every picture under icons/. Test-only modules that nothing
 * imports (the in-memory backend, the synthetic recognition data) are left
 * out. The hand tracker (vendor/mediapipe/) is never followed: it has a cache
 * of its own (card NG-3). Returns sorted paths relative to `dist`, with "" for
 * the scope itself; scripts/assemble.mjs writes them into dist/sw.js.
 *
 * Throws for a reference that leaves `dist`, names a missing file, is not a
 * relative path, or carries a query or hash, so a broken page fails the build
 * rather than the install or the offline start.
 */
export async function appAssets(dist = DIST) {
  const root = new URL(".", dist).href;
  const found = new Set(["", "index.html"]);
  const pending = [];
  const reference = (target, from) => {
    assert.match(target, /^\.\.?\//, `${from} names something that is not a local file: ${target}`);
    const url = new URL(target, new URL(from, root));
    assert.ok(url.href.startsWith(root), `${from} names a file outside dist/: ${target}`);
    // The service worker answers board files by exact URL (caches.match without ignoreSearch), so
    // "./main.js?v=2" would be fetched offline under a URL the pre-cache does not hold.
    assert.ok(url.search === "" && url.hash === "", `${from} names ${target} with a query or hash; the offline cache matches exact URLs, so use the plain path`);
    return decodeURIComponent(url.href.slice(root.length));
  };
  const add = (path) => {
    if (found.has(path)) return;
    found.add(path);
    if (path.endsWith(".js")) pending.push(path);
  };
  const page = await readFile(new URL("index.html", root), "utf8");
  for (const match of page.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) add(reference(match[1], "index.html"));
  for (const match of page.matchAll(/<link\b[^>]*\bhref="([^"]+)"/g)) add(reference(match[1], "index.html"));
  while (pending.length > 0) {
    const path = pending.pop();
    const source = await readFile(new URL(path, root), "utf8").catch(() => {
      throw new Error(`appAssets: ${path} is referenced but not built`);
    });
    // `import "./x.js";`, `import ... from "./x.js";` and `export ... from "./x.js";`, as tsc writes them.
    for (const match of source.matchAll(/^\s*(?:import\s+(?:[^"';]*?\sfrom\s+)?|export\s+[^"';]*?\sfrom\s+)["']([^"']+)["']\s*;/gm)) {
      add(reference(match[1], path));
    }
    for (const match of source.matchAll(/new Worker\(\s*new URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g)) {
      add(reference(match[1], path));
    }
  }
  for (const name of await readdir(new URL("icons/", root))) {
    if (name.endsWith(".svg")) add(`icons/${name}`);
  }
  for (const path of found) {
    if (path === "") continue;
    assert.ok(!path.startsWith("vendor/"), `appAssets: the hand tracker is not pre-cached with the board: ${path}`);
    await readFile(new URL(path, root)).catch(() => {
      throw new Error(`appAssets: ${path} is referenced but not built`);
    });
  }
  return [...found].sort();
}

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
      // Resolve inside dist and refuse anything that leaves it ("..", absolute paths).
      const root = resolve(fileURLToPath(dist));
      const target = resolve(root, file);
      const inside = relative(root, target);
      if (type === undefined || inside === "" || inside.startsWith("..") || isAbsolute(inside)) throw new Error("not served");
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
  console.log(`NG local bundle smoke OK (${paths.length} files from the service worker's pre-cache list); the offline start in a browser is test/browser/offline.test.mjs, actual speech is unverified`);
  const tracker = await trackerSmoke();
  console.log(`NG tracker files OK (${tracker.length} files with their sha256, served, none in the board's pre-cache)`);
}
