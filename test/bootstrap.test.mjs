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

test("built UI displays synthetic concepts and remains usable without TTS/network/camera/storage", async () => {
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  const previousWarn = console.warn;
  const root = fakeElement("main");
  const mounts = [];
  root.replaceChildren = (...nodes) => { root.children = nodes; mounts.push(nodes); };
  const warnings = [];
  globalThis.document = {
    querySelector(selector) { assert.equal(selector, "#app"); return root; },
    createElement: fakeElement,
  };
  globalThis.fetch = () => { throw new Error("Unexpected network request from board"); };
  console.warn = (...parts) => { warnings.push(parts); };
  const part = (className) => root.children.find((child) => child.className === className);

  try {
    await import(new URL("../dist/main.js?board-smoke", import.meta.url));
    // Node has no IndexedDB: storage is unavailable, and the board must stay a working example board.
    for (let i = 0; i < 1000 && root.dataset.startup === "pending"; i += 1) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(root.dataset.bootstrap, "ready");
    assert.equal(root.dataset.startup, "demo-unavailable");
    assert.equal(warnings.length, 1);
    // Mounted twice: the plain example board first, without waiting for storage, then the same board with the storage notice.
    assert.equal(mounts.length, 2);
    assert.deepEqual(mounts[0].map((child) => child.className), ["", "board-notice", "concept-board", "message", "speech-status", "retry"]);
    assert.equal(mounts[0][2].children.length, 5);
    assert.match(root.children[1].textContent, /Testoberfläche/);
    assert.match(root.children[2].textContent, /Speicher.*nicht erreichbar/);
    const board = part("concept-board");
    const output = part("message");
    const retry = part("retry");
    assert.equal(board.children.length, 5);
    assert.equal(board.children[0].children[1].textContent, "Hilfe");
    board.children[0].click();
    assert.equal(output.textContent, "Ich brauche Hilfe.");
    assert.match(part("speech-status").textContent, /keine lokale deutsche Stimme/i);
    assert.equal(retry.hidden, false);
    retry.click();
    assert.equal(output.textContent, "Ich brauche Hilfe.");
    board.children[4].click();
    assert.equal(output.textContent, "Ich bin fertig.");
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
    console.warn = previousWarn;
  }
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
  for (const expected of ["main.js", "board.js", "concepts.js", "speech.js", "startup.js", "status.js", "board-data.js", "profiles/store.js", "profiles/profile.js", "profiles/backend.js", "profiles/indexeddb-backend.js"]) {
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
