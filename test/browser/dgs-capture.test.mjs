// Real-browser tests of the camera capture (card NG-3, docs/capture.md).
//
// Chromium (Playwright) serves the built dist/ and runs the app's own capture
// code: capture/capture.js, the tracker worker and the vendored tracker. DGS
// sign videos (SignDict.org, adult signers), read from the main_old history at
// test time and never added to main, are handed to that capture path at fixed
// frames (one of them also through Chromium's live fake camera). The landmark
// frames are then taught and attempted with the real matcher
// (dist/recognition/) in Node.
//
// Environment:
//   DGS_FULL=1          every word with at least 3 distinct videos (slow) instead of the CI subset
//   DGS_PARALLEL=<n>    browsers at the same time (default 3; the results do not depend on it)
//   DGS_PHASES=a,b,...  phases of the passes over each video (default 0,0.5); more than two prints every pair
//   DGS_REF=<ref>       where the videos are (default origin/main_old)
//   DGS_FRAMES_OUT=<f>  also write the tracker frames to <f> (adult signers' landmarks; never commit it)
//   DGS_FRAMES_IN=<f>   evaluate frames written before instead of capturing (to study the numbers; not a test of the capture)
// Without that ref (an exported copy without Git history) the DGS test is
// skipped with a reason, except under CI=true, where it fails.
import assert from "node:assert/strict";
import { execFile, execFileSync, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { serveDist } from "../../scripts/offline-smoke.mjs";
import { toLandmarkFrames } from "../../dist/recognition/tracker-adapter.js";
import { buildFeatureSequence } from "../../dist/recognition/features.js";
import { calibrateMaxDistance, matchGesture, DEFAULT_MIN_MARGIN } from "../../dist/recognition/matcher.js";

const run = promisify(execFile);
const DIST = new URL("../../dist/", import.meta.url);
const REPO = new URL("../../", import.meta.url).pathname;
const REF = process.env.DGS_REF ?? "origin/main_old";
const VIDEO_DIR = "server/data/dgs_video_examples";
const FULL = process.env.DGS_FULL === "1";
const PARALLEL = Math.max(1, Number(process.env.DGS_PARALLEL ?? 3));
/** Phases of the passes over each video, in frames of CAPTURE_RATE: the first pass teaches, the second attempts. */
const PHASES = (process.env.DGS_PHASES ?? "0,0.5").split(",").map(Number);
/** The video also played through the live fake camera, and tracked twice to show the frames are reproducible. */
const CAMERA_WORD = "kaffee";
const FAKE_CAMERA = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"];

/**
 * The words of the plain run: the app's concepts that have three distinct
 * videos (trinken, fertig), and others with one-hand and two-hand signs.
 * Which hands a sign uses is measured, not taken from this list.
 */
const CI_WORDS = ["trinken", "fertig", "danke", "milch", "oma", "banane", "kaffee"];
/** "äpfel" is the plural of "apfel"; teaching both as two concepts would count one sign as two. */
const EXCLUDED_WORDS = new Set(["äpfel"]);

/** Starts a page on the built app; every request is recorded, any to another origin is answered with an error. */
async function openApp(browser, origin, path, { contextOptions = {}, initScript } = {}) {
  const context = await browser.newContext({ serviceWorkers: "allow", ...contextOptions });
  const foreign = [];
  const requests = [];
  await context.route("**/*", (route) => {
    const url = route.request().url();
    requests.push(url);
    if (!url.startsWith(origin)) {
      foreign.push(url);
      return route.abort();
    }
    return route.continue();
  });
  if (initScript !== undefined) await context.addInitScript(initScript);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(new URL(path, origin).href);
  return { context, page, foreign, requests, errors };
}

/** Counts camera requests in the page, before any app script runs. */
function countCameraRequests() {
  window.__cameraRequests = 0;
  window.__cameraStreams = [];
  const devices = navigator.mediaDevices;
  if (devices === undefined) return;
  const original = devices.getUserMedia.bind(devices);
  devices.getUserMedia = async (constraints) => {
    window.__cameraRequests += 1;
    const stream = await original(constraints);
    window.__cameraStreams.push(stream);
    return stream;
  };
}

async function boardStarted(page) {
  await page.waitForFunction(() => {
    const state = document.querySelector("#board-region")?.dataset.startup;
    return state !== undefined && state !== "pending" && document.querySelectorAll("#board-region button.concept").length > 0;
  }, undefined, { timeout: 20_000 });
}

let distServer;
let origin;
let syntheticCamera;
let workDir;

test.before(async () => {
  await readFile(new URL("vendor/mediapipe/manifest.json", DIST)).catch(() => {
    throw new Error("dist/ has no tracker; run npm run build first");
  });
  workDir = await mkdtemp(join(tmpdir(), "amysecho-browser-"));
  // A camera picture with nobody in it, for the tests that only need some camera.
  syntheticCamera = join(workDir, "empty-room.y4m");
  await run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=320x240:d=2:r=15", "-pix_fmt", "yuv420p", syntheticCamera]);
  ({ server: distServer, origin } = await serveDist(DIST));
});

test.after(async () => {
  distServer?.close();
  if (workDir !== undefined) await rm(workDir, { recursive: true, force: true });
});

test("the board never requests the camera or the tracker, and starts offline when the tracker cannot be loaded", async () => {
  const browser = await chromium.launch({ args: [...FAKE_CAMERA, `--use-file-for-fake-video-capture=${syntheticCamera}`] });
  try {
    const { context, page, foreign, requests, errors } = await openApp(browser, origin, "./", { initScript: countCameraRequests });
    await boardStarted(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    // Wait for the install to finish and take control, then load once more under it.
    await page.reload();
    await boardStarted(page);
    assert.equal(await page.evaluate(() => navigator.serviceWorker.controller !== null), true, "the service worker does not control the page");
    assert.equal(await page.evaluate(() => window.__cameraRequests), 0, "the board requested the camera");
    assert.equal(await page.evaluate(async () => (await navigator.permissions.query({ name: "camera" })).state), "prompt",
      "the camera permission was touched by the board");
    // The worker's own small script is pre-cached with the board; the tracker it would load is not.
    assert.ok(!requests.some((url) => url.includes("/vendor/mediapipe/")), "the board loaded the tracker");
    assert.equal(await page.evaluate(() => performance.getEntriesByType("resource").some((entry) => entry.name.includes("tracker-worker"))), false,
      "the board started the tracker worker");
    assert.ok(await page.locator("#capture-region").isHidden(), "the camera test is visible on the board");
    const cacheNames = await page.evaluate(() => caches.keys());
    assert.ok(cacheNames.some((name) => name.startsWith("amysecho-ng-")), `no board cache: ${cacheNames}`);
    assert.ok(!cacheNames.some((name) => name.startsWith("amysecho-tracker-")), "the board filled the tracker cache");

    // The tracker cannot be downloaded: the capture path says so in German, never asks for the camera, and the board stays.
    await context.unroute("**/*");
    await context.route("**/*", (route) => {
      const url = route.request().url();
      if (!url.startsWith(origin) || url.includes("/vendor/mediapipe/")) return route.abort();
      return route.continue();
    });
    await page.goto(new URL("./#kamera-testen", origin).href);
    await page.getByRole("button", { name: "Kamera starten" }).click();
    await page.waitForFunction(() => document.querySelector("#capture-region")?.dataset.captureProblem !== undefined);
    assert.equal(await page.locator("#capture-region").getAttribute("data-capture-problem"), "tracker_download");
    assert.match(await page.locator("#capture-region [role=status]").textContent(), /Handerkennung konnte nicht geladen werden/);
    assert.equal(await page.evaluate(() => window.__cameraRequests), 0, "the camera was requested although the tracker failed");
    assert.ok(!(await page.evaluate(() => caches.keys())).some((name) => name.startsWith("amysecho-tracker-")),
      "a failed download left a tracker cache");
    await page.getByRole("button", { name: "Zurück zur Tafel" }).click();
    assert.ok(await page.locator("#capture-region").isHidden());
    assert.equal(new URL(page.url()).hash, "");

    // Offline, with no tracker cache at all: the board starts from the board's pre-cache.
    await context.setOffline(true);
    await page.reload();
    await boardStarted(page);
    assert.equal(await page.evaluate(() => window.__cameraRequests), 0);
    assert.deepEqual(foreign, [], "a request left the app's origin");
    assert.deepEqual(errors.filter((text) => !/Failed to load resource|net::ERR_/.test(text)), []);
  } finally {
    await browser.close();
  }
});

test("the camera test: a tap starts the camera, the live line shows the hands, stop turns the camera off", async () => {
  const browser = await chromium.launch({ args: [...FAKE_CAMERA, `--use-file-for-fake-video-capture=${syntheticCamera}`] });
  try {
    const { page, foreign, errors } = await openApp(browser, origin, "./#kamera-testen", { initScript: countCameraRequests });
    await boardStarted(page);
    assert.equal(await page.evaluate(() => window.__cameraRequests), 0, "the camera was requested before the tap");
    await page.getByRole("button", { name: "Kamera starten" }).click();
    await page.waitForFunction(() => document.querySelector("#capture-region .capture-seen")?.dataset.hands === "0", undefined, { timeout: 60_000 });
    assert.equal(await page.locator("#capture-region .capture-seen").textContent(), "Keine Hand im Bild. Schultern nicht zu sehen.");
    assert.equal(await page.evaluate(() => window.__cameraRequests), 1);
    // The video that feeds the tracker stays hidden; the preview (card NG-42) is a second, mirrored video on the same stream.
    assert.equal(await page.locator("#capture-region video").count(), 2);
    assert.ok(await page.locator("#capture-region video:not(.capture-preview-video)").isHidden(), "the frame source is shown");
    assert.ok(await page.locator("#capture-region .capture-preview-video").isVisible(), "no preview");
    assert.ok((await page.evaluate(() => caches.keys())).some((name) => name.startsWith("amysecho-tracker-0.10.35-")), "no tracker cache");
    await page.getByRole("button", { name: "Kamera stoppen" }).click();
    await page.waitForFunction(() => document.querySelector("#capture-region")?.dataset.captureStep === "stopped");
    assert.deepEqual(await page.evaluate(() => window.__cameraStreams.flatMap((stream) => stream.getTracks().map((track) => track.readyState))), ["ended"]);
    assert.equal(await page.locator("#capture-region video").count(), 0);
    assert.equal(await page.locator("#capture-region [role=status]").textContent(), "Die Kamera ist aus.");
    assert.deepEqual(foreign, []);
    // The wasm writes its own start-up lines ("INFO: Created TensorFlow Lite XNNPACK delegate") to the error console.
    assert.deepEqual(errors.filter((text) => !/^INFO: /.test(text)), []);
  } finally {
    await browser.close();
  }
});

/** Holds the camera request until the page calls `window.__releaseCamera()`, as a permission prompt does. */
function holdCameraRequests() {
  window.__cameraRequests = 0;
  window.__cameraStreams = [];
  let release;
  const released = new Promise((resolve) => { release = resolve; });
  window.__releaseCamera = () => release();
  const devices = navigator.mediaDevices;
  const original = devices.getUserMedia.bind(devices);
  devices.getUserMedia = async (constraints) => {
    window.__cameraRequests += 1;
    await released;
    const stream = await original(constraints);
    window.__cameraStreams.push(stream);
    return stream;
  };
}

const LEAVE = {
  back: (page) => page.getByRole("button", { name: "Zurück zur Tafel" }).click(),
  "hash cleared": (page) => page.evaluate(() => { location.hash = ""; }),
  hidden: (page) => page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { get: () => "hidden", configurable: true });
    Object.defineProperty(document, "hidden", { get: () => true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  }),
  pagehide: (page) => page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }))),
};

test("leaving while the tracker loads or the permission is asked: no camera request, or the camera stopped at once, and no worker left", async () => {
  const browser = await chromium.launch({ args: [...FAKE_CAMERA, `--use-file-for-fake-video-capture=${syntheticCamera}`] });
  try {
    for (const step of ["preparing", "asking"]) {
      for (const [how, leave] of Object.entries(LEAVE)) {
        const label = `${how} while ${step}`;
        let releaseDownload = () => undefined;
        const downloadHeld = new Promise((resolve) => { releaseDownload = resolve; });
        const { context, page, foreign } = await openApp(browser, origin, "./#kamera-testen", {
          initScript: step === "asking" ? holdCameraRequests : countCameraRequests,
        });
        if (step === "preparing") {
          // Tracker files (not the manifest) wait until released: the start stays in "preparing".
          await context.route(/\/vendor\/mediapipe\/[^/]+\//, async (route) => {
            await downloadHeld;
            await route.continue().catch(() => undefined);
          });
        }
        await boardStarted(page);
        await page.getByRole("button", { name: "Kamera starten" }).click();
        if (step === "preparing") {
          await page.waitForFunction(() => document.querySelector("#capture-region")?.dataset.captureStep === "preparing");
        } else {
          await page.waitForFunction(() => window.__cameraRequests === 1, undefined, { timeout: 60_000 });
        }
        await leave(page);
        releaseDownload();
        if (step === "asking") await page.evaluate(() => window.__releaseCamera());
        // Long enough for a start that was not cancelled to reach the camera, and for a closed worker to end.
        await new Promise((resolve) => setTimeout(resolve, 2500));
        const state = await page.evaluate(() => ({
          requests: window.__cameraRequests,
          live: window.__cameraStreams.flatMap((stream) => stream.getTracks()).filter((track) => track.readyState === "live").length,
          step: document.querySelector("#capture-region")?.dataset.captureStep ?? null,
          videos: document.querySelectorAll("video").length,
        }));
        assert.equal(state.requests, step === "asking" ? 1 : 0, `${label}: camera requests`);
        assert.equal(state.live, 0, `${label}: a camera is running`);
        assert.notEqual(state.step, "running", label);
        assert.equal(state.videos, 0, `${label}: a video element is left`);
        assert.equal(page.workers().length, 0, `${label}: a tracker worker is left`);
        assert.deepEqual(foreign, []);
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
});

test("a missing or denied camera gives a German message and a way back to the board", async () => {
  // No fake camera device: Chromium has no camera at all.
  const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream"] });
  try {
    const { page, foreign } = await openApp(browser, origin, "./#kamera-testen", { initScript: countCameraRequests });
    await boardStarted(page);
    await page.getByRole("button", { name: "Kamera starten" }).click();
    await page.waitForFunction(() => document.querySelector("#capture-region")?.dataset.captureProblem !== undefined, undefined, { timeout: 60_000 });
    assert.equal(await page.locator("#capture-region").getAttribute("data-capture-problem"), "no_camera");
    assert.match(await page.locator("#capture-region [role=status]").textContent(), /keine Kamera gefunden/);
    assert.equal(await page.evaluate(() => window.__cameraRequests), 1);
    assert.deepEqual(foreign, []);

    // Denied: Chromium answers a refused permission with NotAllowedError; headless Chromium cannot show the
    // prompt, so the refusal is made by the page's getUserMedia here. The app's own handling is what is tested.
    const denied = await openApp(browser, origin, "./#kamera-testen", {
      initScript: () => {
        navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("denied", "NotAllowedError"); };
      },
    });
    await boardStarted(denied.page);
    await denied.page.getByRole("button", { name: "Kamera starten" }).click();
    await denied.page.waitForFunction(() => document.querySelector("#capture-region")?.dataset.captureProblem !== undefined, undefined, { timeout: 60_000 });
    assert.equal(await denied.page.locator("#capture-region").getAttribute("data-capture-problem"), "denied");
    assert.match(await denied.page.locator("#capture-region [role=status]").textContent(), /Kamera ist nicht erlaubt/);
    await denied.page.getByRole("button", { name: "Zurück zur Tafel" }).click();
    assert.ok(await denied.page.locator("#capture-region").isHidden());
    assert.ok(await denied.page.locator("#board-region button.concept").first().isVisible());
  } finally {
    await browser.close();
  }
});

// ---------------------------------------------------------------------------
// DGS sign videos as the camera.

function git(args, options = {}) {
  return execFileSync("git", args, { cwd: REPO, maxBuffer: 64 * 1024 * 1024, ...options });
}

/** Words with at least `minimum` distinct videos (by Git LFS object id) of `<group>_main_<word>.mp4` and `<group>_var_<word>_<n>.mp4`. */
function dgsWords(minimum = 3) {
  const listing = git(["ls-tree", "-z", "-r", REF, VIDEO_DIR], { encoding: "utf8" });
  const words = new Map();
  for (const entry of listing.split("\0").filter(Boolean)) {
    const [meta, path] = entry.split("\t");
    const name = path.split("/").pop();
    const match = /^[^_]+_(?:main|var)_(.+?)(?:_\d+)?\.mp4$/.exec(name);
    if (match === null) continue;
    const pointer = git(["cat-file", "-p", meta.split(" ")[2]], { encoding: "utf8" });
    const oid = /oid sha256:([0-9a-f]{64})/.exec(pointer)?.[1];
    if (oid === undefined) continue;
    const word = match[1];
    if (!words.has(word)) words.set(word, new Map());
    if (!words.get(word).has(oid)) words.get(word).set(oid, path);
  }
  return [...words.entries()]
    .filter(([word, videos]) => videos.size >= minimum && !EXCLUDED_WORDS.has(word))
    .map(([word, videos]) => ({ word, videos: [...videos.values()].sort() }))
    .sort((a, b) => a.word.localeCompare(b.word));
}

/** The video from the history, through Git LFS, as an mp4 in `directory`. Never written anywhere else. */
async function videoFile(path, directory, index) {
  const pointer = git(["show", `${REF}:${path}`]);
  const mp4 = join(directory, `video-${index}.mp4`);
  await new Promise((resolve, reject) => {
    const smudge = spawn("git", ["lfs", "smudge", "--", path], { cwd: REPO, stdio: ["pipe", "pipe", "inherit"] });
    const chunks = [];
    smudge.stdout.on("data", (chunk) => chunks.push(chunk));
    smudge.on("error", reject);
    smudge.on("close", async (code) => {
      if (code !== 0) return reject(new Error(`git lfs smudge failed for ${path}`));
      await writeFile(mp4, Buffer.concat(chunks)).then(resolve, reject);
    });
    smudge.stdin.end(pointer);
  });
  return mp4;
}

/** Every decoded frame of the video as RGBA, decoded by ffmpeg, with its size and frame rate. */
async function decodedFrames(mp4) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "csv=p=0", mp4]);
  const [width, height, rate] = stdout.trim().split(",");
  const [numerator, denominator] = rate.split("/").map(Number);
  const { stdout: raw } = await run("ffmpeg", ["-v", "error", "-i", mp4, "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { encoding: "buffer", maxBuffer: 1 << 30 });
  const frameBytes = Number(width) * Number(height) * 4;
  return { width: Number(width), height: Number(height), fps: numerator / denominator, raw, count: Math.floor(raw.length / frameBytes), frameBytes };
}

/** Frames per second the DGS captures are tracked at: about the rate the pipeline reached with the live fake camera (9 per second). */
const CAPTURE_RATE = 10;

/**
 * Tracks one video through the app's own capture path: `startCapture` with
 * the real tracker worker and vendored tracker (`browserEnvironment`), but
 * with the frames handed in at fixed points of the video instead of the live
 * fake camera. Frame i of a pass is the video frame at (i + phase) /
 * CAPTURE_RATE seconds, with that time as its timestamp. The live fake camera
 * delivers whichever frames the timing of the machine lets through, so its
 * frames, and every rate computed from them, differ from run to run; these do
 * not. A pass with another phase sees the same signing in other frames, as a
 * second look at the same movement would.
 */
async function trackVideo(video, phases) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const passes = phases.map((phase) => {
      const picks = [];
      for (let i = 0; ; i += 1) {
        const frame = Math.floor((i + phase) * video.fps / CAPTURE_RATE);
        if (frame >= video.count) break;
        picks.push(frame);
      }
      return { picks, times: picks.map((frame) => Math.round(frame * 1000 / video.fps)) };
    });
    const foreign = [];
    await context.route("**/*", (route) => {
      const url = route.request().url();
      // One video frame per request, served by the test (never part of dist/).
      const wanted = /\/dgs-test-frames-(\d+)-(\d+)\.rgba$/.exec(url);
      if (url.startsWith(origin) && wanted !== null) {
        const frame = passes[Number(wanted[1])].picks[Number(wanted[2])];
        return route.fulfill({ body: video.raw.subarray(frame * video.frameBytes, (frame + 1) * video.frameBytes), contentType: "application/octet-stream" });
      }
      if (!url.startsWith(origin)) {
        foreign.push(url);
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    await page.goto(new URL("./#kamera-testen", origin).href);
    const tracked = await page.evaluate(async ({ width, height, times }) => {
      const capture = await import("./capture/capture.js");
      const region = document.querySelector("#capture-region");
      const results = [];
      for (const [pass, passTimes] of times.entries()) {
        let index = 0;
        const frames = [];
        const environment = {
          ...capture.browserEnvironment(region),
          // No camera: the frames come from the video. Everything after the camera is the app's own.
          getUserMedia: async () => ({ getTracks: () => [] }),
          openFrames: async () => ({
            async next() {
              if (index >= passTimes.length) return null;
              const bytes = await (await fetch(`./dgs-test-frames-${pass}-${index}.rgba`)).arrayBuffer();
              const pixels = new ImageData(new Uint8ClampedArray(bytes), width, height);
              const image = await createImageBitmap(pixels);
              return { image, timestampMs: passTimes[index++], width, height };
            },
            close() {},
          }),
        };
        const started = await capture.startCapture(environment, { onFrame: (frame) => frames.push(frame) });
        if (!started.ok) throw new Error(`capture did not start: ${started.problem}`);
        // The source ends after the last frame, which ends the capture.
        await started.session.ended;
        results.push(frames);
      }
      return results;
    }, { width: video.width, height: video.height, times: passes.map((pass) => pass.times) });
    assert.deepEqual(foreign, [], "a request left the app's origin");
    return tracked;
  } finally {
    await browser.close();
  }
}

/** Plays one video through Chromium's fake camera and records the app's live capture of one pass of it. */
async function captureWithFakeCamera(mp4, directory) {
  const y4m = join(directory, "camera.y4m");
  await run("ffmpeg", ["-v", "error", "-y", "-i", mp4, "-pix_fmt", "yuv420p", y4m]);
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4]);
  const lengthMs = Math.round(Number(stdout.trim()) * 1000);
  const browser = await chromium.launch({ args: [...FAKE_CAMERA, `--use-file-for-fake-video-capture=${y4m}`] });
  try {
    const { page, foreign } = await openApp(browser, origin, "./#kamera-testen");
    const frames = await page.evaluate(async (length) => {
      const capture = await import("./capture/capture.js");
      let first = null;
      const started = await capture.startCapture(capture.browserEnvironment(document.querySelector("#capture-region")), {
        record: true,
        onFrame: (frame) => { first ??= frame.timestampMs; },
      });
      if (!started.ok) throw new Error(`capture did not start: ${started.problem}`);
      // Chromium's fake camera starts the file at its first frame when the camera opens, and loops it.
      while (first === null) await new Promise((resolve) => setTimeout(resolve, 5));
      await new Promise((resolve) => setTimeout(resolve, length));
      return started.session.stop().filter((frame) => frame.timestampMs - first < length);
    }, lengthMs);
    assert.deepEqual(foreign, [], "a request left the app's origin");
    return { frames, lengthMs };
  } finally {
    await browser.close();
    await rm(y4m, { force: true });
  }
}

async function inParallel(items, limit, work) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index], index);
    }
  }));
  return results;
}

/**
 * Leave one out: every video of a taught word is attempted against a profile
 * of all other videos (so its own word has at least two examples). Videos of
 * words with fewer videos are attempted against the whole profile; for them
 * any concept is wrong.
 */
function evaluate(captures, profile = captures, leaveOut = true) {
  const taught = profile.filter((capture) => capture.taught && capture.sequence !== null);
  const outcomes = [];
  for (const attempt of captures) {
    let outcome;
    if (attempt.sequence === null) {
      outcome = { kind: "unknown", reason: attempt.failure };
    } else {
      const examples = taught.filter((other) => !leaveOut || other !== attempt).map((other) => ({ conceptId: other.word, sequence: other.sequence }));
      const result = matchGesture(attempt.sequence, examples, { maxDistance: calibrateMaxDistance(examples), minMargin: DEFAULT_MIN_MARGIN });
      outcome = result.kind === "match"
        ? { kind: result.conceptId === attempt.word ? "top1" : "wrong", spoken: result.conceptId }
        : { kind: "unknown", reason: result.reason };
      outcome.top3 = result.ranked.slice(0, 3).some((entry) => entry.conceptId === attempt.word);
    }
    outcomes.push({ word: attempt.word, path: attempt.path, taught: attempt.taught, ...outcome });
  }
  return outcomes;
}

function rates(outcomes) {
  const count = (kind) => outcomes.filter((outcome) => outcome.kind === kind).length;
  const percent = (value) => (outcomes.length === 0 ? "-" : `${(100 * value / outcomes.length).toFixed(1)}%`);
  return {
    attempts: outcomes.length,
    top1: count("top1"),
    wrong: count("wrong"),
    unknown: count("unknown"),
    line: `top-1 ${percent(count("top1"))}, wrong concept ${percent(count("wrong"))}, unknown ${percent(count("unknown"))} (${outcomes.length} attempts)`,
  };
}

/** Which hands a capture shows: the share of frames with a hand in which both hands are seen. */
function bothShare(frames) {
  const withHand = frames.filter((frame) => frame.left !== null || frame.right !== null);
  return withHand.length === 0 ? 0 : withHand.filter((frame) => frame.left !== null && frame.right !== null).length / withHand.length;
}

/**
 * The left/right convention, cross-checked with the pose model: in frames
 * where pose ran, the wrist of the `left` hand should be nearer to pose
 * landmark 15 (left wrist) than to 16 (right wrist), and the other way round.
 */
function poseAgreement(trackerFrames, frames) {
  let agree = 0;
  let total = 0;
  trackerFrames.forEach((raw, index) => {
    const pose = raw.pose;
    if (pose === null) return;
    const poseWrist = (i) => [pose[i].x * raw.imageWidth, pose[i].y * raw.imageHeight];
    for (const [side, own, otherIndex] of [["left", 15, 16], ["right", 16, 15]]) {
      const hand = frames[index][side];
      if (hand === null || !((pose[own].visibility ?? 0) >= 0.5) || !((pose[otherIndex].visibility ?? 0) >= 0.5)) continue;
      const distance = (point) => Math.hypot(point[0] - hand[0][0], point[1] - hand[0][1]);
      total += 1;
      if (distance(poseWrist(own)) < distance(poseWrist(otherIndex))) agree += 1;
    }
  });
  return { agree, total };
}

let historyAvailable = true;
try {
  git(["rev-parse", "--verify", "--quiet", `${REF}^{commit}`], { stdio: "ignore" });
} catch {
  historyAvailable = false;
}
const skipDgs = historyAvailable ? false
  : process.env.CI === "true" ? false
    : `${REF} is not available here (an exported copy without Git history); run in the repository after git fetch origin main_old`;

test(`DGS sign videos through the app's capture and the real matcher (${FULL ? "full set" : "CI subset"})`, { skip: skipDgs, timeout: 30 * 60_000 }, async () => {
  assert.ok(historyAvailable, `${REF} is missing: CI must git fetch origin main_old`);
  const started = Date.now();
  const all = dgsWords(1);
  const taughtWords = dgsWords(3).filter(({ word }) => FULL || CI_WORDS.includes(word));
  if (!FULL) assert.deepEqual(taughtWords.map(({ word }) => word).sort(), [...CI_WORDS].sort(), "a CI word lost its videos");
  // Words with one or two videos: never taught, attempted to see whether they are spoken as something else (full run only).
  const untaught = FULL ? all.filter(({ word, videos }) => videos.length < 3 && !EXCLUDED_WORDS.has(word)) : [];
  const jobs = [
    ...taughtWords.flatMap(({ word, videos }) => videos.map((path) => ({ word, path, taught: true }))),
    ...untaught.flatMap(({ word, videos }) => videos.map((path) => ({ word, path, taught: false }))),
  ];
  let captures;
  let camera = null;
  let rerun = null;
  if (process.env.DGS_FRAMES_IN) {
    const saved = JSON.parse(await readFile(process.env.DGS_FRAMES_IN, "utf8"));
    captures = jobs.map((job) => saved.find((entry) => entry.path === job.path) ?? assert.fail(`${job.path} not in DGS_FRAMES_IN`));
  } else {
    const directory = await mkdtemp(join(tmpdir(), "amysecho-dgs-"));
    try {
      captures = await inParallel(jobs, PARALLEL, async (job, index) => {
        const mp4 = await videoFile(job.path, directory, index);
        try {
          const video = await decodedFrames(mp4);
          const passes = await trackVideo(video, PHASES);
          return { ...job, durationMs: Math.round(video.count * 1000 / video.fps), expectedFrames: passes[0].length, passes };
        } finally {
          await rm(mp4, { force: true });
        }
      });
      // The same video tracked again in a fresh browser gives exactly the same frames.
      const first = jobs.find((job) => job.word === CAMERA_WORD) ?? jobs[0];
      const mp4 = await videoFile(first.path, directory, "again");
      rerun = { path: first.path, passes: await trackVideo(await decodedFrames(mp4), [PHASES[0]]) };
      // And through the live fake camera, the path a real camera takes.
      camera = { path: first.path, ...await captureWithFakeCamera(mp4, directory) };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
  for (const capture of captures) {
    capture.trackerFrames = capture.passes[0];
    capture.secondPass = capture.passes[1];
  }
  const captureSeconds = (Date.now() - started) / 1000;
  if (process.env.DGS_FRAMES_OUT) await writeFile(process.env.DGS_FRAMES_OUT, JSON.stringify(captures.map(({ word, path, taught, durationMs, passes }) => ({ word, path, taught, durationMs, passes }))));

  if (rerun !== null) {
    assert.deepEqual(rerun.passes[0], captures.find((capture) => capture.path === rerun.path).passes[0], "tracking the same frames again gave other landmarks");
  }
  if (camera !== null) {
    const fps = camera.frames.length / (camera.lengthMs / 1000);
    assert.ok(fps >= 3, `live fake camera: ${fps.toFixed(1)} frames per second`);
    assert.ok(camera.frames.some((frame) => frame.hands.length > 0), "live fake camera: no hand seen");
  }

  for (const capture of captures) {
    capture.frames = toLandmarkFrames(capture.trackerFrames);
    const built = buildFeatureSequence(capture.frames);
    capture.sequence = built.ok ? built.sequence : null;
    capture.failure = built.ok ? null : built.reason;
    capture.both = bothShare(capture.frames);
  }

  // Pipeline: every frame handed in comes back tracked, with the size of the video, and pose ran.
  for (const capture of captures) {
    if (capture.expectedFrames !== undefined) assert.equal(capture.trackerFrames.length, capture.expectedFrames, `${capture.path}: frames lost`);
    assert.ok(capture.trackerFrames.every((frame) => frame.imageWidth > 0 && frame.imageHeight > 0));
    assert.ok(capture.trackerFrames.some((frame) => frame.pose !== null), `${capture.path}: pose never ran`);
  }
  // Hands are seen in nearly every video. A video in which the tracker sees no hand is reported, not failed:
  // some SignDict signers sign low or close to the edge of the picture.
  const handless = captures.filter((capture) => !capture.frames.some((frame) => frame.left !== null || frame.right !== null));
  assert.ok(handless.length * 10 <= captures.length, `no hand seen in ${handless.map((capture) => capture.path)}`);
  // Which hands a word uses is measured: two-hand when both hands are seen in at least half of the frames with a hand in most of its videos.
  const words = [...new Set(captures.filter((capture) => capture.taught).map((capture) => capture.word))];
  const twoHand = new Set(words.filter((word) => {
    const own = captures.filter((capture) => capture.word === word);
    return own.filter((capture) => capture.both >= 0.5).length * 2 > own.length;
  }));
  assert.ok(twoHand.size >= 1, "no two-hand sign seen");
  assert.ok(words.length - twoHand.size >= 1, "no one-hand sign seen");
  // In two-hand frames the two slots hold two different hands, never one hand twice.
  for (const capture of captures) {
    for (const frame of capture.frames) {
      if (frame.left !== null && frame.right !== null) assert.notDeepEqual(frame.left[0], frame.right[0], `${capture.path}: one hand in both slots`);
    }
  }

  // The real matcher runs, and gives the same answers for the same frames.
  const outcomes = evaluate(captures);
  const again = evaluate(captures.map((capture) => {
    const built = buildFeatureSequence(toLandmarkFrames(capture.trackerFrames));
    return { ...capture, sequence: built.ok ? built.sequence : null, failure: built.ok ? null : built.reason };
  }));
  assert.deepEqual(again, outcomes, "the same frames gave different answers");

  // The same signing seen again: every taught video's second pass through the camera, attempted against a
  // profile of the first passes (its own first pass included). Only the tracker and the capture differ between
  // the two passes, not the signer, so this is the closest the videos come to a child repeating a taught sign.
  const secondPass = captures.filter((capture) => capture.taught).map((capture) => {
    const built = buildFeatureSequence(toLandmarkFrames(capture.secondPass));
    return { ...capture, trackerFrames: capture.secondPass, sequence: built.ok ? built.sequence : null, failure: built.ok ? null : built.reason };
  });
  const repeatOutcomes = evaluate(secondPass, captures, false);
  assert.deepEqual(evaluate(secondPass, captures, false), repeatOutcomes, "the same frames gave different answers");

  const taughtOutcomes = outcomes.filter((outcome) => outcome.taught);
  const oneHandOutcomes = taughtOutcomes.filter((outcome) => !twoHand.has(outcome.word));
  const twoHandOutcomes = taughtOutcomes.filter((outcome) => twoHand.has(outcome.word));
  const agreement = captures.flatMap((capture) => [capture.trackerFrames, capture.secondPass]
    .map((pass) => poseAgreement(pass, toLandmarkFrames(pass))))
    .reduce((sum, value) => ({ agree: sum.agree + value.agree, total: sum.total + value.total }), { agree: 0, total: 0 });
  const failures = {};
  for (const capture of captures) if (capture.failure !== null) failures[capture.failure] = (failures[capture.failure] ?? 0) + 1;
  const unknownReasons = {};
  for (const outcome of taughtOutcomes) if (outcome.kind === "unknown") unknownReasons[outcome.reason] = (unknownReasons[outcome.reason] ?? 0) + 1;
  const all3 = rates(taughtOutcomes);
  const lines = [
    `DGS capture (${FULL ? "DGS_FULL=1" : "CI subset"}): ${captures.length} videos, ${words.length} taught words, captured in ${captureSeconds.toFixed(0)} s with ${PARALLEL} browsers`,
    `  tracked at ${CAPTURE_RATE} frames per second of video, passes at phases ${PHASES.join(", ")}${camera === null ? "" : `; live fake camera (${camera.path.split("/").pop()}): ${(camera.frames.length / (camera.lengthMs / 1000)).toFixed(1)} frames per second, ${camera.frames.filter((frame) => frame.hands.length > 0).length} of ${camera.frames.length} frames with a hand`}`,
    `  one-hand words (${words.length - twoHand.size}): ${words.filter((word) => !twoHand.has(word)).join(", ")}`,
    `  two-hand words (${twoHand.size}): ${[...twoHand].join(", ")}`,
    `  other signers (leave one video out; chance of top-1 by guessing ${(100 / words.length).toFixed(1)}%):`,
    `    one-hand: ${rates(oneHandOutcomes).line}`,
    `    two-hand: ${rates(twoHandOutcomes).line}`,
    `    all: ${all3.line}; top-3 ${taughtOutcomes.filter((outcome) => outcome.top3).length}/${taughtOutcomes.length}`,
    `  same video, second pass through the camera (profile: all first passes):`,
    `    one-hand: ${rates(repeatOutcomes.filter((outcome) => !twoHand.has(outcome.word))).line}`,
    `    two-hand: ${rates(repeatOutcomes.filter((outcome) => twoHand.has(outcome.word))).line}`,
    `    all: ${rates(repeatOutcomes).line}`,
    `  unknown reasons: ${JSON.stringify(unknownReasons)}; no sequence built: ${JSON.stringify(failures)}`,
    `  videos without any hand seen: ${handless.length}${handless.length === 0 ? "" : ` (${handless.map((capture) => capture.path.split("/").pop()).join(", ")})`}`,
    `  left/right against the pose model's wrists: ${agreement.agree}/${agreement.total} hand sightings agree (both passes)`,
  ];
  if (untaught.length > 0) {
    const untaughtOutcomes = outcomes.filter((outcome) => !outcome.taught);
    lines.push(`  words never taught (${untaught.length} words, ${untaughtOutcomes.length} videos): spoken as a concept ${untaughtOutcomes.filter((outcome) => outcome.kind === "wrong").length}`);
  }
  for (const [index, outcome] of taughtOutcomes.entries()) {
    const repeat = repeatOutcomes[index];
    lines.push(`    ${outcome.path.split("/").pop()}: ${outcome.kind}${outcome.spoken !== undefined && outcome.kind === "wrong" ? ` as ${outcome.spoken}` : ""}${outcome.reason === undefined ? "" : ` (${outcome.reason})`}; second pass: ${repeat.kind}${repeat.kind === "wrong" ? ` as ${repeat.spoken}` : ""}${repeat.reason === undefined ? "" : ` (${repeat.reason})`}`);
  }
  if (PHASES.length > 2) {
    // Every ordered pair of passes: taught from one phase, attempted from another.
    for (const [teach, taughtPhase] of PHASES.entries()) {
      for (const [attempt, attemptPhase] of PHASES.entries()) {
        if (teach === attempt) continue;
        const build = (capture, pass) => {
          const built = buildFeatureSequence(toLandmarkFrames(capture.passes[pass]));
          return { ...capture, trackerFrames: capture.passes[pass], sequence: built.ok ? built.sequence : null, failure: built.ok ? null : built.reason };
        };
        const profile = captures.map((capture) => build(capture, teach));
        const tries = captures.filter((capture) => capture.taught).map((capture) => build(capture, attempt));
        lines.push(`  phase ${taughtPhase} taught, ${attemptPhase} attempted: ${rates(evaluate(tries, profile, false)).line}`);
      }
      const passAgreement = captures.map((capture) => poseAgreement(capture.passes[teach], toLandmarkFrames(capture.passes[teach])))
        .reduce((sum, value) => ({ agree: sum.agree + value.agree, total: sum.total + value.total }), { agree: 0, total: 0 });
      lines.push(`  phase ${taughtPhase}: left/right agree with pose wrists ${passAgreement.agree}/${passAgreement.total}`);
    }
  }
  console.log(lines.join("\n"));

  // What is asserted on the numbers, and how each bar was derived, is in docs/capture.md ("What the DGS
  // test asserts"). The frames are reproducible, so on one machine these numbers do not change between runs;
  // the margins are for another machine's tracker arithmetic. The other-signer rates are only recorded.
  // No matcher limit is changed for any of this.
  assert.ok(agreement.total >= 100, `too few hand sightings with pose to check left/right: ${agreement.total}`);
  assert.ok(agreement.agree / agreement.total >= 0.85,
    `left/right disagree with the pose model's wrists: ${agreement.agree}/${agreement.total}`);
  const repeat = rates(repeatOutcomes);
  assert.ok(repeat.top1 / repeat.attempts >= 0.4, `the same signing seen again is recognised too rarely: ${repeat.line}`);
  assert.ok(repeat.wrong / repeat.attempts <= 0.2, `the same signing seen again is spoken as a wrong concept too often: ${repeat.line}`);
});

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? Number.NaN : sorted[Math.floor(sorted.length / 2)];
}
