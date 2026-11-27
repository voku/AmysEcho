// Real-browser test of the installed app's offline cold start (card NG-14). Chromium (Playwright)
// visits the built app once online, which installs the service worker and fills its cache, and a
// synthetic profile is stored through the real IndexedDB adapter. Then the browser is closed, the
// web server is stopped and the network is switched off; a fresh browser on the same profile
// directory opens the app. It must show the stored board, answer a tap, never ask for the camera
// and never send a request off the app's origin.
//
// This automates what a machine can check of card NG-6; it does not replace the session on a
// physical device (touch, speech output, the installed home-screen app, Safari).
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { precacheList, serveDist } from "../../scripts/offline-smoke.mjs";

const DIST = new URL("../../dist/", import.meta.url);

/** Counts camera requests and camera permission queries in the page, before any app script runs. */
function watchCamera() {
  window.__camera = { getUserMedia: 0, permissionQueries: 0, enumerateDevices: 0 };
  const devices = navigator.mediaDevices;
  if (devices !== undefined) {
    devices.getUserMedia = async () => {
      window.__camera.getUserMedia += 1;
      throw new DOMException("camera denied by the test", "NotAllowedError");
    };
    const enumerate = devices.enumerateDevices.bind(devices);
    devices.enumerateDevices = async () => {
      window.__camera.enumerateDevices += 1;
      return enumerate();
    };
  }
  if (navigator.permissions !== undefined) {
    const query = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (descriptor) => {
      if (descriptor?.name === "camera") window.__camera.permissionQueries += 1;
      return query(descriptor);
    };
  }
}

/** Collects page errors, console errors and every request the context makes, service worker included. */
function record(context) {
  const seen = { errors: [], requests: [] };
  context.on("request", (request) => seen.requests.push(request.url()));
  context.on("weberror", (error) => seen.errors.push(String(error.error())));
  const watch = (page) => page.on("console", (message) => {
    if (message.type() === "error") seen.errors.push(message.text());
  });
  for (const page of context.pages()) watch(page);
  context.on("page", watch);
  return seen;
}

async function boardStarted(page) {
  await page.waitForFunction(() => {
    const state = document.querySelector("#board-region")?.dataset.startup;
    return state !== undefined && state !== "pending" && document.querySelectorAll("#board-region button.concept").length > 0;
  }, undefined, { timeout: 20_000 });
  return page.evaluate(() => document.querySelector("#board-region")?.dataset.startup);
}

test("offline: after one online visit the app cold-starts with no network, shows the stored board and never asks for the camera", async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), "amysecho-offline-"));
  const { server, origin } = await serveDist(DIST);
  let serverOpen = true;
  let context = null;
  try {
    // 1. The one online visit.
    context = await chromium.launchPersistentContext(userDataDir, { permissions: [] });
    await context.addInitScript(watchCamera);
    const online = record(context);
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(origin);
    assert.equal(await boardStarted(page), "demo-empty");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 20_000 });

    // Every entry of the built worker's list is in its cache, under the built cache name.
    const worker = await readFile(new URL("sw.js", DIST), "utf8");
    const cacheName = /const CACHE_NAME = CACHE_PREFIX \+ "([^"]+)";/.exec(worker)?.[1];
    const expected = (await precacheList(worker)).map((path) => new URL(path, origin).href).sort();
    const cached = await page.evaluate(async () => {
      const names = await caches.keys();
      const result = {};
      for (const name of names) result[name] = (await (await caches.open(name)).keys()).map((request) => request.url).sort();
      return result;
    });
    assert.deepEqual(Object.keys(cached), [`amysecho-ng-${cacheName}`], "exactly the board's cache exists after the visit");
    assert.deepEqual(Object.values(cached)[0], expected);

    // A synthetic profile, stored through the real IndexedDB adapter the app uses.
    await page.evaluate(async () => {
      const { openIndexedDbBackend } = await import("./profiles/indexeddb-backend.js");
      const { ProfileStore } = await import("./profiles/store.js");
      const store = await ProfileStore.open(await openIndexedDbBackend());
      const mia = await store.create("Mia", ["trinken", "pause"]);
      await store.setActive(mia.id);
    });
    assert.deepEqual(await page.evaluate(() => window.__camera), { getUserMedia: 0, permissionQueries: 0, enumerateDevices: 0 });
    assert.deepEqual(online.errors, []);
    await context.close();
    context = null;

    // 2. No server, no network: a cold start from what the visit left on the device.
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    serverOpen = false;
    context = await chromium.launchPersistentContext(userDataDir, { permissions: [], offline: true });
    await context.addInitScript(watchCamera);
    const offline = record(context);
    const cold = context.pages()[0] ?? await context.newPage();
    const started = Date.now();
    const response = await cold.goto(origin);
    assert.ok(response?.fromServiceWorker(), "the page was not answered by the service worker");
    assert.equal(await boardStarted(cold), "profile");
    const startMs = Date.now() - started;

    const tiles = await cold.$$eval("#board-region button.concept", (buttons) => buttons.map((button) => button.getAttribute("aria-label")));
    assert.deepEqual(tiles, ["Trinken", "Pause"]);
    // Every picture of the board loaded from the cache.
    assert.equal(await cold.$$eval("#board-region button.concept img", (images) => images.every((image) => image.complete && image.naturalWidth > 0)), true);
    // A tap after the board's press shield (BOARD_SHIELD_MS, 700 ms) fills the sentence.
    await cold.waitForTimeout(800);
    await cold.click("#board-region button.concept[aria-label='Trinken']");
    assert.equal(await cold.textContent("#board-region .sentence"), "Ich möchte etwas trinken.");
    assert.equal(await cold.getAttribute("#board-region button.concept[aria-label='Trinken']", "aria-pressed"), "true");

    assert.deepEqual(await cold.evaluate(() => window.__camera), { getUserMedia: 0, permissionQueries: 0, enumerateDevices: 0 });
    // Nothing leaves the app's origin, online or offline (data: pictures are not requests).
    for (const url of [...online.requests, ...offline.requests]) {
      assert.ok(url.startsWith(origin) || url.startsWith("data:") || url.startsWith("blob:"), `request off the origin: ${url}`);
    }
    // The worker's update check of sw.js may fail with no network; that is no page error, and it is the only failure allowed.
    assert.deepEqual(offline.errors.filter((line) => !/sw\.js/.test(line)), []);
    console.log(`# offline: cold start to the stored board took ${startMs} ms (desktop Chromium; the target device is NG-6)`);
  } finally {
    await context?.close();
    if (serverOpen) await new Promise((resolve) => server.close(resolve));
    await rm(userDataDir, { recursive: true, force: true });
  }
});
