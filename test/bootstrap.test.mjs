import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { appAssets, precacheList, smoke } from "../scripts/offline-smoke.mjs";
import { getBootstrapState } from "../dist/status.js";
import { CONCEPTS, findConcept } from "../dist/concepts.js";

function fakeElement(tagName) {
  return {
    tagName, textContent: "", className: "", children: [], dataset: {}, handlers: {},
    hidden: false,
    setAttribute(name, value) { this[name] = value; },
    addEventListener(name, handler) { this.handlers[name] = handler; },
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = nodes; },
    click() { this.handlers.click?.(); },
  };
}

test("NG shell state is ready", () => {
  assert.equal(getBootstrapState(), "ready");
});

test("built UI starts in the board region only and remains usable without TTS/network/camera/storage", async () => {
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  const previousWarn = console.warn;
  // The page as index.html delivers it: #app with a board region (static line) and the caregiver region.
  const staticLine = fakeElement("p");
  staticLine.textContent = "Die Tafel ist noch nicht gestartet.";
  const region = fakeElement("section");
  region.children = [staticLine];
  const caregiver = fakeElement("section");
  // The element outside #app that gets the control which opens the caregiver area.
  const entry = fakeElement("footer");
  entry.hidden = true;
  const root = fakeElement("main");
  root.children = [region, caregiver];
  root.replaceChildren = () => assert.fail("#app itself must keep its structure");
  root.append = () => assert.fail("#app itself must keep its structure");
  const mounts = [];
  region.replaceChildren = (...nodes) => { region.children = nodes; mounts.push(nodes); };
  const warnings = [];
  const selectors = [];
  const documentEvents = [];
  globalThis.document = {
    querySelector(selector) {
      selectors.push(selector);
      return { "#app": root, "#board-region": region, "#caregiver-region": caregiver, "#caregiver-entry": entry }[selector]
        ?? assert.fail(`unexpected selector ${selector}`);
    },
    createElement: fakeElement,
    addEventListener(name) { documentEvents.push(name); },
  };
  globalThis.fetch = () => { throw new Error("Unexpected network request from board"); };
  console.warn = (...parts) => { warnings.push(parts); };
  const part = (className) => region.children.find((child) => child.className.split(" ")[0] === className);

  try {
    const main = await import(new URL("../dist/main.js?board-smoke", import.meta.url));
    await main.app.started;
    assert.deepEqual(selectors.sort(), ["#app", "#board-region", "#caregiver-entry", "#caregiver-region"]);
    assert.equal(root.dataset.bootstrap, "ready");
    // Node has no IndexedDB: storage is unavailable, and the examples stand in with the reason.
    assert.equal(await main.app.store(), null);
    assert.equal(region.dataset.startup, "demo-unavailable");
    assert.equal(region.dataset.boardFallback, "storage-unavailable");
    assert.equal(warnings.length, 1);
    // Mounted twice: a waiting line that replaces the static line at once, then one board. No timer is left running.
    assert.equal(mounts.length, 2);
    assert.deepEqual(mounts[0].map((child) => child.tagName), ["h1", "p"]);
    assert.equal(mounts[0][1].textContent, "Die Tafel wird geladen.");
    assert.ok(!mounts[0].includes(staticLine));
    assert.equal("startupLate" in region.dataset, false);
    // #app and the caregiver region are untouched.
    assert.deepEqual(root.children, [region, caregiver]);
    assert.deepEqual(caregiver.children, []);
    // The opening control is in its own element, visible once the script runs, and it only reacts to holding.
    assert.equal(entry.hidden, false);
    assert.deepEqual(entry.children.map((child) => child.tagName), ["button", "progress", "p"]);
    assert.equal(entry.children[0].textContent, "Für Bezugspersonen");
    assert.equal(entry.children[0].handlers.click, undefined);
    // The caregiver area listens on the document for a hidden page and for Escape (which it answers only while it is open).
    assert.deepEqual(documentEvents.sort(), ["keydown", "visibilitychange"]);
    assert.deepEqual(Object.keys(root.dataset), ["bootstrap"]);

    assert.match(part("board-notice").textContent, /Speicher.*nicht erreichbar.*Beispiele/);
    const board = part("concept-board");
    const bar = part("sentence-bar");
    const output = bar.children[0];
    const tiles = board.children.filter((child) => child.tagName === "button");
    assert.equal(board.className, "concept-board concept-board-examples");
    assert.equal(board.children[0].textContent, "Beispiele");
    assert.equal(tiles.length, 5);
    assert.equal(tiles[0].children[1].textContent, "Hilfe");
    tiles[0].click();
    assert.equal(output.textContent, "Ich brauche Hilfe.");
    // Node has no speech engine: tapping again cannot help, and the line does not say it would.
    assert.equal(part("speech-status").textContent, "Keine deutsche Stimme. Hol eine Bezugsperson.");
    assert.equal(part("message").textContent, "Ich brauche Hilfe.");
    assert.equal(part("retry"), undefined);
    bar.click();
    assert.equal(output.textContent, "Ich brauche Hilfe.");
    tiles[4].click();
    assert.equal(output.textContent, "Ich bin fertig.");
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
    console.warn = previousWarn;
  }
});

test("index.html has the stable regions and a static German line for when scripts do not start", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  const app = /<main id="app">([\s\S]*)<\/main>/.exec(html)?.[1] ?? "";
  const board = /<section id="board-region"[^>]*>([\s\S]*?)<\/section>/.exec(app)?.[1] ?? "";
  // The regions, in this order, directly inside #app: the board, the caregiver area and the camera test (card NG-3), both hidden and empty.
  assert.match(app, /^\s*<section id="board-region"[^>]*>[\s\S]*?<\/section>\s*<section id="caregiver-region"[^>]*\shidden>\s*<\/section>\s*<section id="capture-region" class="capture-region" aria-label="Kamera testen" hidden><\/section>\s*$/);
  // The opening control of the caregiver area gets its own element after #app; empty and hidden until the script fills it.
  assert.match(html, /<\/main>\s*<footer id="caregiver-entry" class="caregiver-entry" hidden><\/footer>\s*<\/body>/);
  // A plain line that is visible until the script replaces it, and one for a browser without scripts.
  const plain = board.replace(/<noscript>[\s\S]*?<\/noscript>/, "");
  assert.match(plain, /<p class="board-notice board-line">Die Tafel ist noch nicht gestartet\.[^<]*<\/p>/);
  assert.match(board, /<noscript><p class="board-notice board-line">Diese Seite braucht JavaScript\.[^<]*<\/p><\/noscript>/);
  // The app name is a heading for the document outline only, not a visible one.
  assert.match(board, /^\s*<h1 class="visually-hidden">Amy's Echo NG<\/h1>/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">/);
  assert.match(html, /<meta name="theme-color" content="#174e6c">/);
  // An installed app has no reload button: the line names something that can be done there.
  assert.match(plain, /schließe die App und öffne sie wieder/);
  assert.doesNotMatch(board, /lade[^<]*neu|neu laden/);
  // Without a running script nothing may claim that the board is loading.
  assert.doesNotMatch(board, /wird geladen|lädt/);
  // Still no inline script or style, and the same policy with one addition: 'wasm-unsafe-eval', so that the
  // hand tracker's WebAssembly compiles (card NG-3). Not 'unsafe-eval', no other source.
  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' data:; object-src 'none'; base-uri 'none'">/);
  assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>|<style|\sstyle=|\son[a-z]+=/i);
});

for (const concept of CONCEPTS) {
  test(`concept transition: ${concept.id}`, () => {
    assert.equal(concept.version, 1);
    assert.equal(findConcept(concept.id), concept);
    assert.ok(concept.labelDe.length > 0);
    assert.ok(concept.speechDe.length > 0);
    assert.match(concept.symbolPath, /^\.\/icons\/[a-z]+\.svg$/);
  });
}

test("unknown concepts are never reinterpreted", () => {
  assert.equal(findConcept("unknown"), null);
  assert.equal(findConcept("__proto__"), null);
});

test("compiled shell contains only local assets", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  const js = await readFile(new URL("../dist/main.js", import.meta.url), "utf8");
  assert.match(html, /lang="de"/);
  assert.match(html, /src="\.\/main\.js"/);
  // The camera test is its own module next to the board's, so a failure in it cannot stop the board.
  assert.deepEqual([...html.matchAll(/<script\b[^>]*>/gi)].map((match) => match[0]),
    ['<script type="module" src="./main.js">', '<script type="module" src="./capture/capture.js">']);
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.doesNotMatch(js, /from\s+["'](?:\.\.\/)+(?:webapp|server|integration)\//);
});

/** Every module file under dist/ that `entry` reaches through static imports, as paths relative to dist/. */
async function reachableModules(entry) {
  const dist = new URL("../dist/", import.meta.url);
  const found = new Set();
  const pending = [new URL(entry, dist)];
  while (pending.length > 0) {
    const url = pending.pop();
    const path = url.href.slice(dist.href.length);
    if (found.has(path)) continue;
    assert.ok(url.href.startsWith(dist.href), `import leaves dist/: ${url.href}`);
    found.add(path);
    const source = await readFile(url, "utf8");
    assert.doesNotMatch(source, /\bimport\s*\(/, `${path} uses a dynamic import, which this test cannot follow`);
    // `import "./x.js";`, `import ... from "./x.js";` and `export ... from "./x.js";`, as tsc writes them.
    for (const match of source.matchAll(/^\s*(?:import\s+(?:[^"';]*?\sfrom\s+)?|export\s+[^"';]*?\sfrom\s+)["']([^"']+)["']\s*;/gm)) {
      assert.match(match[1], /^\.\.?\//, `${path} imports something that is not a local file: ${match[1]}`);
      pending.push(new URL(match[1], url));
    }
  }
  return [...found].sort();
}

test("service-worker pre-cache includes the full local concept bundle", async () => {
  const worker = await readFile(new URL("../dist/sw.js", import.meta.url), "utf8");
  const modules = [...new Set([...await reachableModules("main.js"), ...await reachableModules("capture/capture.js")])].sort();
  // The walk really follows imports, including into a subdirectory and through a re-export-free chain.
  for (const expected of ["main.js", "app.js", "board.js", "concepts.js", "speech.js", "startup.js", "status.js", "board-data.js", "caregiver.js", "profiles/store.js", "profiles/profile.js", "profiles/backend.js", "profiles/indexeddb-backend.js"]) {
    assert.ok(modules.includes(expected), `import walk did not reach ${expected}`);
  }
  // Test-only code is not part of the app.
  assert.ok(!modules.includes("profiles/memory-backend.js"));
  // The camera test and what it imports are pre-cached with the board, so the page loads offline without errors;
  // its worker's script too. The tracker itself (vendor/mediapipe/) is not: it has its own cache (card NG-3).
  for (const expected of ["capture/capture.js", "recognition/tracker-adapter.js", "recognition/features.js"]) {
    assert.ok(modules.includes(expected), `import walk did not reach ${expected}`);
  }
  modules.push("capture/tracker-worker.js");
  for (const asset of [...modules, "styles.css", "manifest.webmanifest"]) {
    assert.ok(worker.includes(`"./${asset}"`), `missing precache member ${asset}`);
  }
  for (const concept of CONCEPTS) {
    assert.ok(worker.includes(`"${concept.symbolPath}"`), `missing precache icon for ${concept.id}`);
  }
  // Every shipped picture, also one no concept names (the speaker of the sentence bar, the app icon).
  const listed = await precacheList(worker);
  // The licence record (docs/assets.md) ships beside the icons but is not a picture.
  const icons = (await readdir(new URL("../dist/icons/", import.meta.url))).filter((name) => name !== "licences.json").map((name) => `icons/${name}`);
  assert.ok(icons.includes("icons/sprechen.svg"));
  for (const icon of icons) assert.ok(listed.includes(icon), `missing precache icon ${icon}`);
  // What the worker hands to the cache is what the text search above saw: the page itself, the modules, the rest.
  for (const asset of ["", "index.html", ...modules, "styles.css", "manifest.webmanifest"]) {
    assert.ok(listed.includes(asset), `pre-cache list lacks ./${asset}`);
  }
  assert.equal(new Set(listed).size, listed.length, "an entry is listed twice");
});

test("the pre-cache list is generated from the built app: no hand list, no test-only module, a missing module fails", async () => {
  const dist = new URL("../dist/", import.meta.url);
  const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(source, /^const ASSETS = \[\];$/m, "public/sw.js keeps a hand-written pre-cache list");
  const listed = await precacheList(await readFile(new URL("sw.js", dist), "utf8"));
  assert.deepEqual(listed, await appAssets(dist));
  for (const testOnly of ["profiles/memory-backend.js", "recognition/evaluate.js", "recognition/synthetic.js", "icons/licences.json", "sw.js"]) {
    assert.ok(!listed.includes(testOnly), `pre-cached although the app does not load it: ${testOnly}`);
  }
  assert.ok(!listed.some((path) => path.startsWith("vendor/")), "the tracker is in the board's pre-cache");

  const copy = await mkdtemp(join(tmpdir(), "amysecho-assets-"));
  try {
    await cp(dist, copy, { recursive: true });
    const copyUrl = pathToFileURL(`${copy}/`);
    // A module that an import names but the build did not write.
    await rm(join(copy, "profiles", "profile.js"));
    await assert.rejects(appAssets(copyUrl), /profiles\/profile\.js is referenced but not built/);
    // A reference that leaves the app.
    await writeFile(join(copy, "index.html"), (await readFile(new URL("index.html", dist), "utf8")).replace('src="./main.js"', 'src="https://cdn.invalid/main.js"'));
    await assert.rejects(appAssets(copyUrl), /not a local file: https:\/\/cdn\.invalid\/main\.js/);
  } finally {
    await rm(copy, { recursive: true, force: true });
  }
});

test("the offline smoke check fetches exactly the service worker's pre-cache list and fails for an entry that is not served", async () => {
  const dist = new URL("../dist/", import.meta.url);
  const listed = await precacheList(await readFile(new URL("sw.js", dist), "utf8"));
  assert.deepEqual(await smoke(dist), ["sw.js", ...listed]);

  const copy = await mkdtemp(join(tmpdir(), "amysecho-smoke-"));
  try {
    await cp(dist, copy, { recursive: true });
    const copyUrl = pathToFileURL(`${copy}/`);
    assert.deepEqual(await smoke(copyUrl), ["sw.js", ...listed]);
    // A pre-cached file that is not shipped.
    await rm(join(copy, "icons", "sprechen.svg"));
    await assert.rejects(smoke(copyUrl), /missing locally bundled asset: \.\/icons\/sprechen\.svg/);
    // An entry added to the worker alone is checked too: the smoke check has no list of its own.
    await cp(new URL("icons/sprechen.svg", dist), join(copy, "icons", "sprechen.svg"));
    const worker = await readFile(join(copy, "sw.js"), "utf8");
    await writeFile(join(copy, "sw.js"), worker.replace('"./icons/app.svg"', '"./icons/app.svg", "./profiles/not-built.js"'));
    await assert.rejects(smoke(copyUrl), /missing locally bundled asset: \.\/profiles\/not-built\.js/);
    // An empty file is not a working asset.
    await writeFile(join(copy, "sw.js"), worker);
    await writeFile(join(copy, "styles.css"), "");
    await assert.rejects(smoke(copyUrl), /empty locally bundled asset: \.\/styles\.css/);
  } finally {
    await rm(copy, { recursive: true, force: true });
  }
});

test("service-worker install fetches the pre-cache list past the HTTP cache, under a new cache name", async () => {
  const source = await readFile(new URL("../dist/sw.js", import.meta.url), "utf8");
  const name = /const CACHE_NAME = CACHE_PREFIX \+ "([^"]+)";/.exec(source)?.[1];
  // Names already shipped; a changed asset list or install step needs a name that is none of them.
  assert.ok(name !== undefined && !["board-s1a-v1", "board-s1b-v1", "board-s1b-v2", "board-s1c-v1", "board-s1c-v2", "caregiver-s1-v1", "caregiver-s1-v2", "caregiver-s1-v3", "caregiver-s1-v4", "board-ux-v1", "board-ux-v2", "board-ux-v3", "board-ux-v4", "caregiver-ux-v1", "caregiver-ux-v2", "caregiver-ux-v3", "caregiver-ux-v4", "caregiver-ux-v5", "caregiver-ux-v6"].includes(name), `cache name ${name}`);

  // Run the worker with a fake scope and look at what install hands to the cache.
  const listeners = {};
  const added = [];
  const self = {
    registration: { scope: "https://app.example/echo/" },
    location: { origin: "https://app.example" },
    addEventListener(type, listener) { listeners[type] = listener; },
    skipWaiting: async () => undefined,
  };
  const caches = { open: async (cacheName) => ({ name: cacheName, addAll: async (requests) => { added.push(...requests); } }) };
  new Function("self", "caches", source)(self, caches);
  let installed;
  listeners.install({ waitUntil(promise) { installed = promise; } });
  await installed;
  assert.ok(added.length >= 15);
  for (const request of added) {
    assert.ok(request instanceof Request, `pre-cache entry is not a Request: ${request}`);
    assert.equal(request.cache, "reload", request.url);
    assert.ok(request.url.startsWith("https://app.example/echo/"), request.url);
  }
  assert.ok(added.some((request) => request.url === "https://app.example/echo/board-data.js"));
  assert.ok(added.some((request) => request.url === "https://app.example/echo/icons/sprechen.svg"));
});

test("the built cache name carries a digest of every pre-cached file, so a changed asset reaches an installed app", async () => {
  const { createHash } = await import("node:crypto");
  const { precacheList } = await import("../scripts/offline-smoke.mjs");
  const dist = new URL("../dist/", import.meta.url);
  const worker = await readFile(new URL("sw.js", dist), "utf8");
  const name = /const CACHE_NAME = CACHE_PREFIX \+ "([^"]+)";/.exec(worker)?.[1] ?? "";
  const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  const base = /const CACHE_NAME = CACHE_PREFIX \+ "([^"]+)";/.exec(source)?.[1];
  const hash = createHash("sha256");
  for (const asset of [...await precacheList(worker)].sort()) {
    const file = asset === "" ? "index.html" : asset.endsWith("/") ? `${asset}index.html` : asset;
    hash.update(`${asset}\0`).update(await readFile(new URL(file, dist))).update("\0");
  }
  assert.equal(name, `${base}-${hash.digest("hex").slice(0, 12)}`);
});
