import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
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
    assert.deepEqual(documentEvents, ["visibilitychange"]);
    assert.deepEqual(Object.keys(root.dataset), ["bootstrap"]);

    assert.match(region.children[1].textContent, /Speicher.*nicht erreichbar.*Beispiele/);
    const board = part("concept-board");
    const output = part("message");
    const retry = part("retry");
    const tiles = board.children.filter((child) => child.tagName === "button");
    assert.equal(board.className, "concept-board concept-board-examples");
    assert.equal(board.children[0].textContent, "Beispiele");
    assert.equal(tiles.length, 5);
    assert.equal(tiles[0].children[1].textContent, "Hilfe");
    tiles[0].click();
    assert.equal(output.textContent, "Ich brauche Hilfe.");
    assert.match(part("speech-status").textContent, /keine lokale deutsche Stimme/i);
    assert.equal(retry.hidden, false);
    retry.click();
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
  // The two regions, in this order, directly inside #app.
  assert.match(app, /^\s*<section id="board-region"[^>]*>[\s\S]*?<\/section>\s*<section id="caregiver-region"[^>]*\shidden>\s*<\/section>\s*$/);
  // The opening control of the caregiver area gets its own element after #app; empty and hidden until the script fills it.
  assert.match(html, /<\/main>\s*<footer id="caregiver-entry" class="caregiver-entry" hidden><\/footer>\s*<\/body>/);
  // A plain line that is visible until the script replaces it, and one for a browser without scripts.
  const plain = board.replace(/<noscript>[\s\S]*?<\/noscript>/, "");
  assert.match(plain, /<p class="board-notice">Die Tafel ist noch nicht gestartet\.[^<]*<\/p>/);
  assert.match(board, /<noscript><p class="board-notice">Diese Seite braucht JavaScript\.[^<]*<\/p><\/noscript>/);
  // Without a running script nothing may claim that the board is loading.
  assert.doesNotMatch(board, /wird geladen|lädt/);
  // Still no inline script or style, and the same policy.
  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'">/);
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
  const modules = await reachableModules("main.js");
  // The walk really follows imports, including into a subdirectory and through a re-export-free chain.
  for (const expected of ["main.js", "app.js", "board.js", "concepts.js", "speech.js", "startup.js", "status.js", "board-data.js", "caregiver.js", "profiles/store.js", "profiles/profile.js", "profiles/backend.js", "profiles/indexeddb-backend.js"]) {
    assert.ok(modules.includes(expected), `import walk did not reach ${expected}`);
  }
  // Test-only code is not part of the app.
  assert.ok(!modules.includes("profiles/memory-backend.js"));
  for (const asset of [...modules, "styles.css", "manifest.webmanifest"]) {
    assert.ok(worker.includes(`"./${asset}"`), `missing precache member ${asset}`);
  }
  for (const concept of CONCEPTS) {
    assert.ok(worker.includes(`"${concept.symbolPath}"`), `missing precache icon for ${concept.id}`);
  }
});

test("service-worker install fetches the pre-cache list past the HTTP cache, under a new cache name", async () => {
  const source = await readFile(new URL("../dist/sw.js", import.meta.url), "utf8");
  const name = /const CACHE_NAME = CACHE_PREFIX \+ "([^"]+)";/.exec(source)?.[1];
  // Names already shipped; a changed asset list or install step needs a name that is none of them.
  assert.ok(name !== undefined && !["board-s1a-v1", "board-s1b-v1", "board-s1b-v2", "board-s1c-v1", "board-s1c-v2", "caregiver-s1-v1", "caregiver-s1-v2", "caregiver-s1-v3"].includes(name), `cache name ${name}`);

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
});
