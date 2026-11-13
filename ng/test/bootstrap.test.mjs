import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getBootstrapState } from "../dist/status.js";
import { CONCEPTS, findConcept } from "../dist/concepts.js";

function fakeElement(tagName) {
  return {
    tagName, textContent: "", children: [], dataset: {}, handlers: {},
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

test("built UI displays synthetic concepts and remains usable without TTS/network/camera", async () => {
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  const root = fakeElement("main");
  globalThis.document = {
    querySelector(selector) { assert.equal(selector, "#app"); return root; },
    createElement: fakeElement,
  };
  globalThis.fetch = () => { throw new Error("Unexpected network request from board"); };

  try {
    await import(new URL("../dist/main.js?board-smoke", import.meta.url));
    assert.equal(root.dataset.bootstrap, "ready");
    const [heading, explanatoryText, board, output, speechStatus, retry] = root.children;
    assert.equal(heading.tagName, "h1");
    assert.match(explanatoryText.textContent, /Testoberfläche/);
    assert.equal(board.children.length, 5);
    assert.equal(board.children[0].children[1].textContent, "Hilfe");
    board.children[0].click();
    assert.equal(output.textContent, "Ich brauche Hilfe.");
    assert.match(speechStatus.textContent, /keine lokale deutsche Stimme/i);
    assert.equal(retry.hidden, false);
    retry.click();
    assert.equal(output.textContent, "Ich brauche Hilfe.");
    board.children[4].click();
    assert.equal(output.textContent, "Ich bin fertig.");
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
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

test("service-worker pre-cache includes the full local concept bundle", async () => {
  const worker = await readFile(new URL("../dist/sw.js", import.meta.url), "utf8");
  for (const asset of ["board.js", "concepts.js", "speech.js", "styles.css", "manifest.webmanifest", "main.js"]) {
    assert.ok(worker.includes(`"./${asset}"`), `missing precache member ${asset}`);
  }
  for (const concept of CONCEPTS) {
    assert.ok(worker.includes(`"${concept.symbolPath}"`), `missing precache icon for ${concept.id}`);
  }
});
