import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getBootstrapState } from "../dist/status.js";

test("NG shell is independently bootstrappable", () => {
  assert.equal(getBootstrapState(), "ready");
});

test("static bootstrap includes no remote resources or legacy imports", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  const js = await readFile(new URL("../dist/main.js", import.meta.url), "utf8");
  assert.match(html, /lang="de"/);
  assert.match(html, /src="\.\/main\.js"/);
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.doesNotMatch(js, /from\s+["'](?:\.\.\/)+(?:webapp|server|integration)\//);
});
