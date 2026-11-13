import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getBootstrapState } from "../dist/status.js";

test("NG shell is independently bootstrappable", () => {
  assert.equal(getBootstrapState(), "ready");
});

test("compiled main.js mounts the shell and exposes a ready marker", async () => {
  const previousDocument = globalThis.document;
  const root = {
    children: [],
    dataset: {},
    replaceChildren(...children) {
      this.children = children;
    },
  };

  globalThis.document = {
    querySelector(selector) {
      assert.equal(selector, "#app");
      return root;
    },
    createElement(tagName) {
      return { tagName, textContent: "" };
    },
  };

  try {
    await import(new URL("../dist/main.js?bootstrap-test", import.meta.url));
    assert.deepEqual(
      root.children.map(({ tagName, textContent }) => [tagName, textContent]),
      [
        ["h1", "Amy's Echo NG"],
        ["p", "Neuer Kommunikationsbereich. Die Bedienoberfläche folgt in S1."],
      ],
    );
    assert.equal(root.dataset.bootstrap, "ready");
  } finally {
    if (previousDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }
  }
});

test("static bootstrap includes no remote resources or legacy imports", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  const js = await readFile(new URL("../dist/main.js", import.meta.url), "utf8");
  assert.match(html, /lang="de"/);
  assert.match(html, /src="\.\/main\.js"/);
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.doesNotMatch(js, /from\s+["'](?:\.\.\/)+(?:webapp|server|integration)\//);
});
