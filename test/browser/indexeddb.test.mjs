// Real-browser test of the IndexedDB adapter (src/profiles/indexeddb-backend.ts, card NG-14). Node
// has no IndexedDB, so the unit tests run the profile store against the in-memory backend only;
// here Chromium (Playwright) runs the built adapter under the page's own Content Security Policy.
// Every value is synthetic.
import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { serveDist } from "../../scripts/offline-smoke.mjs";

const DIST = new URL("../../dist/", import.meta.url);

let server;
let origin;
let browser;

test.before(async () => {
  ({ server, origin } = await serveDist(DIST));
  browser = await chromium.launch();
});

test.after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

/** A fresh page of the app (its own context, so its own empty storage) with page errors collected. */
async function appPage() {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(origin);
  await page.waitForFunction(() => document.querySelector("#board-region")?.dataset.startup === "demo-empty");
  return { page, errors, close: () => context.close() };
}

test("indexeddb: values survive a second connection, come back as private copies, and a prefix lists only its own keys", async () => {
  const { page, errors, close } = await appPage();
  try {
    const result = await page.evaluate(async () => {
      const { openIndexedDbBackend } = await import("./profiles/indexeddb-backend.js");
      const first = await openIndexedDbBackend("amysecho-test-roundtrip");
      const keys = ["p/1", "p/1/a", "p/1/b", "p/1/ä", "p/1/😀", "p/10/a", "p/2/a", "p0", "q/1/a"];
      await first.write({ set: Object.fromEntries(keys.map((key, index) => [key, { index, nested: [key, null, true, -0] }])) });
      const second = await openIndexedDbBackend("amysecho-test-roundtrip");
      const value = await second.get("p/1/ä");
      value.nested.push("changed here");
      return {
        value: await second.get("p/1/ä"),
        missing: await second.get("p/3"),
        all: await second.keys(""),
        profileOne: await second.keys("p/1/"),
        profileOneLoose: await second.keys("p/1"),
        none: await second.keys("r/"),
      };
    });
    assert.deepEqual(result.value, { index: 3, nested: ["p/1/ä", null, true, 0] });
    assert.equal(result.missing, undefined);
    assert.deepEqual(result.all, ["p/1", "p/1/a", "p/1/b", "p/1/ä", "p/1/😀", "p/10/a", "p/2/a", "p0", "q/1/a"]);
    assert.deepEqual(result.profileOne, ["p/1/a", "p/1/b", "p/1/ä", "p/1/😀"]);
    assert.deepEqual(result.profileOneLoose, ["p/1", "p/1/a", "p/1/b", "p/1/ä", "p/1/😀", "p/10/a"]);
    assert.deepEqual(result.none, []);
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});

test("indexeddb: a batch is all or nothing, also when it fails inside the transaction", async () => {
  const { page, errors, close } = await appPage();
  try {
    const result = await page.evaluate(async () => {
      const { openIndexedDbBackend } = await import("./profiles/indexeddb-backend.js");
      const { JsonValueError } = await import("./profiles/backend.js");
      const backend = await openIndexedDbBackend("amysecho-test-atomic");
      await backend.write({ set: { keep: 1, gone: 2 } });
      // Deletes come before sets: a key deleted and set in one batch ends up set.
      await backend.write({ delete: ["gone"], set: { gone: 3 } });
      const afterBoth = await backend.get("gone");
      // A value JSON cannot hold is refused before anything is written.
      let refused = "accepted";
      try {
        await backend.write({ set: { fresh: 1, bad: Number.NaN } });
      } catch (error) {
        refused = error instanceof JsonValueError ? "JsonValueError" : String(error);
      }
      // A key IndexedDB refuses, after a delete and a put of the same batch were queued: the whole batch is rolled back.
      let aborted = "accepted";
      try {
        await backend.write({ delete: ["keep", Number.NaN], set: { other: 1 } });
      } catch (error) {
        aborted = error instanceof Error ? error.message : String(error);
      }
      return { afterBoth, refused, aborted, keys: await backend.keys(""), keep: await backend.get("keep") };
    });
    assert.equal(result.afterBoth, 3);
    assert.equal(result.refused, "JsonValueError");
    assert.match(result.aborted, /^IndexedDB write failed/);
    assert.deepEqual(result.keys, ["gone", "keep"]);
    assert.equal(result.keep, 1);
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});

test("indexeddb: a newer app version can upgrade past an open connection, and a database newer than the app is refused", async () => {
  const { page, errors, close } = await appPage();
  try {
    const result = await page.evaluate(async () => {
      const { openIndexedDbBackend } = await import("./profiles/indexeddb-backend.js");
      const backend = await openIndexedDbBackend("amysecho-test-upgrade");
      await backend.write({ set: { kept: "yes" } });
      // What a newer app version in another tab does: open the same database at version 2.
      const upgraded = await new Promise((resolve, reject) => {
        const request = indexedDB.open("amysecho-test-upgrade", 2);
        request.onblocked = () => resolve("blocked");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const names = [...request.result.objectStoreNames];
          request.result.close();
          resolve(names);
        };
      });
      // The old connection closed itself; using it now fails with an error, it does not hang.
      let stale = "answered";
      try {
        await backend.get("kept");
      } catch (error) {
        stale = error instanceof Error ? error.message : String(error);
      }
      // This app (version 1) on a database a newer version left behind: storage is unavailable, not damaged.
      let older = "opened";
      try {
        await openIndexedDbBackend("amysecho-test-upgrade");
      } catch (error) {
        older = error instanceof Error ? error.message : String(error);
      }
      return { upgraded, stale, older };
    });
    assert.deepEqual(result.upgraded, ["kv"]);
    assert.match(result.stale, /^IndexedDB read failed/);
    assert.match(result.older, /^IndexedDB open failed: VersionError/);
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});

test("indexeddb: one batch of 10,000 puts commits as one transaction and is listed completely", async () => {
  const { page, errors, close } = await appPage();
  try {
    const result = await page.evaluate(async () => {
      const { openIndexedDbBackend } = await import("./profiles/indexeddb-backend.js");
      const backend = await openIndexedDbBackend("amysecho-test-large");
      const set = {};
      for (let i = 0; i < 10_000; i += 1) set[`p/large/${String(i).padStart(5, "0")}`] = { frame: i, points: Array.from({ length: 42 }, (_, j) => (i + j) / 100) };
      const started = performance.now();
      await backend.write({ set });
      const writeMs = Math.round(performance.now() - started);
      const keys = await backend.keys("p/large/");
      return { writeMs, count: keys.length, first: keys[0], last: keys.at(-1), sample: await backend.get("p/large/04711") };
    });
    assert.equal(result.count, 10_000);
    assert.equal(result.first, "p/large/00000");
    assert.equal(result.last, "p/large/09999");
    assert.equal(result.sample.frame, 4711);
    assert.equal(result.sample.points.length, 42);
    // Well under a second in a desktop Chromium; recorded so a slow device can be compared (card NG-6).
    assert.ok(result.writeMs < 30_000, `writing took ${result.writeMs} ms`);
    console.log(`# indexeddb: one batch of 10,000 puts took ${result.writeMs} ms`);
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});
