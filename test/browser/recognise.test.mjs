// Real-browser test of recognising a gesture on the child's board (card NG-20, docs/recognise.md).
//
// Chromium (Playwright) runs the built app. A profile is set up in the page through the app's own
// store and board data; gesture examples are taught from DGS sign videos (SignDict.org, adult
// signers, read from the main_old history at test time and never added to main, as in
// dgs-capture.test.mjs) by tracking them through the app's capture path and storing them with
// `saveExample`. Then each attempt goes through the BOARD's own flow: a tap on "Gebärde", the
// countdown, the recording, "Stopp", and the confirm or unknown view. The frames of the attempt are
// fed into the app's capture path (`startCapture`, through the capture bridge the board looks up),
// with the camera replaced and the tracker replaying the real tracker's answers for these frames,
// tracked up front so that machine speed cannot cut the recording (see installFeeder). Speech is
// observed through a stand-in engine in the page and the sentence bar.
//
// Without the main_old history (an exported copy) the test is skipped with a reason, except under
// CI=true, where it fails. DGS_REF=<ref> as in dgs-capture.test.mjs.
import assert from "node:assert/strict";
import { execFile, execFileSync, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { serveDist } from "../../scripts/offline-smoke.mjs";

const run = promisify(execFile);
const DIST = new URL("../../dist/", import.meta.url);
const REPO = new URL("../../", import.meta.url).pathname;
const REF = process.env.DGS_REF ?? "origin/main_old";
const VIDEO_DIR = "server/data/dgs_video_examples";
/** Frames per second of video handed to the tracker, as in dgs-capture.test.mjs. */
const CAPTURE_RATE = 10;
/** The press guard of a view (RECOGNISE_GUARD_MS), plus a margin. */
const AFTER_VIEW_MS = 900;
/** The shield of "Gebärde" after the gesture view closed (GESTURE_SHIELD_MS), plus a margin. */
const BEFORE_GESTURE_MS = 1600;
const THROTTLE = Number(process.env.RECOGNISE_CPU_THROTTLE ?? 1);

/**
 * Taught words: an app concept signed with one hand and a two-hand sign as a custom concept
 * (which hands a video shows is measured when it is taught, and printed). Short videos
 * (at most 3 s), so that an attempt is tracked within the recording's time limit; two videos per
 * word are taught (first pass), and the same videos are attempted again (second pass, half a frame
 * later: the same signing seen in other frames). Two short videos of words that are not taught are
 * attempted as well.
 */
const TAUGHT = [
  { word: "trinken", conceptId: "trinken", videos: ["trinken_var_trinken_0.mp4", "trinken_var_trinken_1.mp4"] },
  { word: "kaffee", conceptId: "kaffee", custom: { labelDe: "Kaffee", speechDe: "Ich möchte einen Kaffee." }, videos: ["trinken_var_kaffee_2.mp4", "trinken_main_kaffee.mp4"] },
];
const UNTAUGHT = [{ word: "danke", videos: ["danke_var_danke_2.mp4"] }, { word: "oma", videos: ["oma_main_oma.mp4"] }];
const SPEECH = { trinken: "Ich möchte etwas trinken.", kaffee: "Ich möchte einen Kaffee." };

function git(args, options = {}) {
  return execFileSync("git", args, { cwd: REPO, maxBuffer: 64 * 1024 * 1024, ...options });
}

let historyAvailable = true;
try {
  git(["rev-parse", "--verify", "--quiet", `${REF}^{commit}`], { stdio: "ignore" });
} catch {
  historyAvailable = false;
}
const skip = historyAvailable ? false
  : process.env.CI === "true" ? false
    : `${REF} is not available here (an exported copy without Git history); run in the repository after git fetch origin main_old`;

/** The video from the history, through Git LFS, as an mp4 in `directory`. Never written anywhere else. */
async function videoFile(name, directory) {
  const path = `${VIDEO_DIR}/${name}`;
  const pointer = git(["show", `${REF}:${path}`]);
  const mp4 = join(directory, name);
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

/** Decodes the video with ffmpeg and picks the frames of two passes (phases 0 and 0.5) at CAPTURE_RATE. */
async function videoPasses(mp4) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "csv=p=0", mp4]);
  const [width, height, rate] = stdout.trim().split(",");
  const [numerator, denominator] = rate.split("/").map(Number);
  const fps = numerator / denominator;
  const { stdout: raw } = await run("ffmpeg", ["-v", "error", "-i", mp4, "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { encoding: "buffer", maxBuffer: 1 << 30 });
  const frameBytes = Number(width) * Number(height) * 4;
  const count = Math.floor(raw.length / frameBytes);
  const passes = [0, 0.5].map((phase) => {
    const picks = [];
    for (let i = 0; ; i += 1) {
      const frame = Math.floor((i + phase) * fps / CAPTURE_RATE);
      if (frame >= count) break;
      picks.push(frame);
    }
    return { picks, times: picks.map((frame) => Math.round(frame * 1000 / fps)) };
  });
  return { width: Number(width), height: Number(height), raw, frameBytes, passes };
}

/** A speech engine in the page that records what it is asked to say (headless Chromium has no German voice). */
function standInSpeech() {
  window.__spoken = [];
  const engine = {
    speaking: false, pending: false,
    getVoices: () => [{ lang: "de-DE", localService: true, name: "Test" }],
    cancel() {},
    speak(utterance) {
      window.__spoken.push(utterance.text);
      setTimeout(() => utterance.onend?.(), 20);
    },
    addEventListener() {},
    removeEventListener() {},
  };
  Object.defineProperty(window, "speechSynthesis", { value: engine, configurable: true });
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; this.lang = ""; this.voice = null; this.onend = null; this.onerror = null; } };
}

/**
 * Why the tracker runs before the attempt, not during it. The board's recording ends by wall-clock
 * time (5 s). Tracking a video frame in the test (a Playwright route, `createImageBitmap`, the
 * worker, MediaPipe on the CPU) can take longer than the video frame's 100 ms on a slow or busy
 * machine, so tracking during the recording let the limit cut attempts, and on a slow enough
 * machine every attempt, depending on machine speed alone. So every pass of every video is tracked
 * once, up front, through the app's own `startCapture` with the real tracker worker
 * (`window.__track`). Teaching stores the first passes. An attempt then goes through the board's
 * own flow and the app's own capture path (`startCapture` through the bridge the board looks up:
 * recording, `stopRecording`, the feature builder, the matcher, the view); only the camera and the
 * tracker are replaced there, the tracker by a replay of what the real tracker answered for exactly
 * these frames (its answers are identical when the same frames are tracked again, as
 * dgs-capture.test.mjs asserts). A replayed frame takes microseconds, so the whole attempt is in
 * the recording long before the limit, and "Stopp" ends it. The pose flag is the same in both runs:
 * both captures start counting frames at the first frame of the pass.
 */
async function installFeeder(page) {
  await page.evaluate(async () => {
    const capture = await import("./capture/capture.js");
    const examples = await import("./recognition/examples.js");
    const fetchFrame = async (url, width, height) => {
      const bytes = await (await fetch(url)).arrayBuffer();
      return createImageBitmap(new ImageData(new Uint8ClampedArray(bytes), width, height));
    };
    /** Tracked passes by key: what the real tracker answered, frame by frame. */
    const trackedPasses = new Map();
    window.__track = async (key, frames) => {
      const tracked = [];
      let index = 0;
      const started = await capture.startCapture({
        ...capture.browserEnvironment(document.body),
        getUserMedia: async () => ({ getTracks: () => [] }),
        openFrames: async () => ({
          async next() {
            if (index >= frames.length) return null;
            const { url, timestampMs, width, height } = frames[index++];
            return { image: await fetchFrame(url, width, height), timestampMs, width, height };
          },
          close() {},
        }),
      }, { onFrame: (frame) => tracked.push(frame) });
      if (!started.ok) throw new Error(`capture did not start: ${started.problem}`);
      await started.session.ended;
      trackedPasses.set(key, tracked);
      return tracked.length;
    };

    window.__camera = { starts: 0, stops: 0, tracked: 0 };
    let pending = [];
    let wake = () => undefined;
    /** Hands the frames of a tracked pass to the running capture (while the board records). */
    window.__feed = (key) => {
      pending.push(...trackedPasses.get(key).map((frame, index) => ({ key, index, frame })));
      wake();
      return trackedPasses.get(key).length;
    };
    const source = () => {
      let closed = false;
      return {
        async next() {
          while (!closed) {
            if (pending.length > 0) {
              const { key, index, frame } = pending.shift();
              return { image: { key, index }, timestampMs: frame.timestampMs, width: frame.imageWidth, height: frame.imageHeight };
            }
            await new Promise((resolve) => { wake = resolve; });
          }
          return null;
        },
        close() {
          closed = true;
          pending = [];
          wake();
        },
      };
    };
    /** The real tracker's answers for exactly these frames. */
    const replay = {
      async detect(image, timestampMs, pose) {
        const frame = trackedPasses.get(image.key)[image.index];
        if (frame.timestampMs !== timestampMs || frame.poseRan !== pose) {
          // The capture turns a thrown error into "tracker_failed"; keep a record so the test fails on it.
          (window.__replayFaults ??= []).push({ key: image.key, index: image.index, timestampMs, pose });
          throw new Error("replay out of step with the capture");
        }
        return { hands: frame.hands, pose: frame.pose };
      },
      close() {},
    };
    const environment = () => ({
      startTracker: async () => replay,
      getUserMedia: async () => {
        window.__camera.starts += 1;
        return { getTracks: () => [{ stop() { window.__camera.stops += 1; } }] };
      },
      openFrames: async () => source(),
      isVisible: () => document.visibilityState === "visible",
    });
    Object.defineProperty(globalThis, capture.CAPTURE_BRIDGE_KEY, {
      configurable: true,
      value: {
        text: capture.CAPTURE_TEXT,
        nextShoulders: capture.nextShoulders,
        start: (host, options) => capture.startCapture(environment(), {
          ...options,
          onFrame: (frame) => {
            window.__camera.tracked += 1;
            options.onFrame?.(frame);
          },
        }),
      },
    });

    window.__teach = async (store, profileId, conceptId, key) => {
      const recording = examples.sequenceFromRecording(trackedPasses.get(key));
      if (!recording.ok) return { ok: false, reason: recording.reason };
      await examples.saveExample(store, profileId, conceptId, recording.sequence, { capturedAt: new Date(), frames: recording.frames, durationMs: recording.durationMs });
      return { ok: true, hands: recording.sequence.hands };
    };
  });
}

test("recognising on the board: DGS videos taught as examples, made in the board's continuous view (card NG-54); nothing is spoken without a tap", { skip, timeout: 15 * 60_000 }, async () => {
  assert.ok(historyAvailable, `${REF} is missing: CI must git fetch origin main_old`);
  const started = Date.now();
  await readFile(new URL("vendor/mediapipe/manifest.json", DIST)).catch(() => {
    throw new Error("dist/ has no tracker; run npm run build first");
  });
  const directory = await mkdtemp(join(tmpdir(), "amysecho-recognise-"));
  const { server, origin } = await serveDist(DIST);
  const browser = await chromium.launch();
  try {
    // Every video once, decoded in Node; its frames are served to the page one request each.
    const videos = new Map();
    for (const entry of [...TAUGHT, ...UNTAUGHT]) {
      for (const name of entry.videos) {
        const mp4 = await videoFile(name, directory);
        videos.set(name, await videoPasses(mp4));
        await rm(mp4, { force: true });
      }
    }
    const names = [...videos.keys()];
    const frameList = (name, pass) => {
      const video = videos.get(name);
      const index = names.indexOf(name);
      return video.passes[pass].times.map((timestampMs, i) => ({ url: `./recognise-test-frames-${index}-${pass}-${i}.rgba`, timestampMs, width: video.width, height: video.height }));
    };

    const context = await browser.newContext({ serviceWorkers: "block" });
    const foreign = [];
    await context.route("**/*", (route) => {
      const url = route.request().url();
      const wanted = /\/recognise-test-frames-(\d+)-(\d+)-(\d+)\.rgba$/.exec(url);
      if (url.startsWith(origin) && wanted !== null) {
        const video = videos.get(names[Number(wanted[1])]);
        const frame = video.passes[Number(wanted[2])].picks[Number(wanted[3])];
        return route.fulfill({ body: video.raw.subarray(frame * video.frameBytes, (frame + 1) * video.frameBytes), contentType: "application/octet-stream" });
      }
      if (!url.startsWith(origin)) {
        foreign.push(url);
        return route.abort();
      }
      return route.continue();
    });
    await context.addInitScript(standInSpeech);
    const page = await context.newPage();
    if (THROTTLE > 1) {
      // RECOGNISE_CPU_THROTTLE=<n>: the page's CPU n times slower, to show the result does not depend on machine speed.
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
    }
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(new URL("./", origin).href);
    await page.waitForFunction(() => document.querySelectorAll("#board-region button.concept").length > 0, undefined, { timeout: 20_000 });
    // Without a profile (the examples board) there is no gesture control.
    assert.equal(await page.locator("#board-region .gesture-start").count(), 0);
    await installFeeder(page);

    // The profile and its board, through the app's own store; then the examples, taught from the first passes.
    const profileId = await page.evaluate(async (taught) => {
      const { app } = await import("./main.js");
      const { CONCEPTS } = await import("./concepts.js");
      const boardData = await import("./board-data.js");
      const store = await app.store();
      const profile = await store.create("Test", []);
      for (const entry of taught) if (entry.custom !== undefined) await boardData.putCustomConcept(store, profile.id, entry.conceptId, entry.custom, CONCEPTS);
      await boardData.setBoardConcepts(store, profile.id, taught.map((entry) => entry.conceptId), CONCEPTS);
      await store.setActive(profile.id);
      await app.refreshBoard();
      return profile.id;
    }, TAUGHT);
    assert.equal(await page.locator("#board-region .gesture-start").count(), 0, "a profile without examples has no gesture control");
    // Every pass tracked once by the real tracker, up front (see installFeeder).
    for (const name of names) {
      for (const pass of [0, 1]) {
        const tracked = await page.evaluate(({ key, frames }) => window.__track(key, frames), { key: `${name}:${pass}`, frames: frameList(name, pass) });
        assert.equal(tracked, frameList(name, pass).length, `${name}: frames lost while tracking`);
      }
    }
    const taughtHands = {};
    for (const entry of TAUGHT) {
      for (const name of entry.videos) {
        const result = await page.evaluate(async ({ profileId: id, conceptId, key }) => {
          const { app } = await import("./main.js");
          return window.__teach(await app.store(), id, conceptId, key);
        }, { profileId, conceptId: entry.conceptId, key: `${name}:0` });
        taughtHands[name] = result.ok ? result.hands : `unusable (${result.reason})`;
      }
    }
    // Closing the caregiver area refreshes the board; the examples are read with it.
    await page.evaluate(async () => (await import("./main.js")).app.refreshBoard());
    const gesture = page.locator("#board-region .gesture-start");
    await gesture.waitFor();
    assert.equal(await gesture.getAttribute("aria-label"), "Gebärde");
    const kinds = Object.values(taughtHands);
    assert.ok(kinds.includes("both"), `no two-hand example taught: ${JSON.stringify(taughtHands)}`);
    assert.ok(kinds.includes("left") || kinds.includes("right"), `no one-hand example taught: ${JSON.stringify(taughtHands)}`);
    assert.equal(await page.evaluate(() => window.__camera.starts), 0, "the camera started before the tap");

    const spoken = () => page.evaluate(() => [...window.__spoken]);
    const sentence = () => page.locator("#board-region .sentence-bar .sentence").textContent();
    const panelState = () => page.evaluate(() => {
      const panel = document.querySelector("#board-region .recognise");
      return panel === null ? null : { state: panel.dataset.state, concept: panel.dataset.concept ?? null, reason: panel.dataset.reason ?? null, hands: panel.dataset.hands ?? null };
    });

    const tiles = () => page.evaluate(() => [...document.querySelectorAll("#board-region .recognise-taken-tile")].map((tile) => tile.dataset.concept));

    /**
     * One gesture through the board's continuous view (card NG-54): tap "Gebärde", wait until it
     * listens, feed the frames, then "Fertig" (the replayed frames end with the hands in view, as when
     * a child does not lower them). Returns what was stacked: the concept, or null.
     */
    const attempt = async (name, pass) => {
      await page.waitForTimeout(BEFORE_GESTURE_MS);
      await gesture.click();
      await page.waitForFunction(() => document.querySelector("#board-region .recognise")?.dataset.state === "listening", undefined, { timeout: 90_000 });
      const listeningSince = Date.now();
      assert.ok(await gesture.isHidden(), "the board is covered while listening");
      const before = await page.evaluate(() => window.__camera.tracked);
      const fed = await page.evaluate((key) => window.__feed(key), `${name}:${pass}`);
      await page.waitForFunction(({ until }) => window.__camera.tracked >= until, { until: before + fed }, { timeout: 60_000 });
      // "Fertig" ignores presses sooner than RECOGNISE_GUARD_MS (700 ms) after the view appears.
      const wait = 1_000 - (Date.now() - listeningSince);
      if (wait > 0) await page.waitForTimeout(wait);
      await page.getByRole("button", { name: "Fertig" }).click({ timeout: 3_000 });
      await page.waitForTimeout(300);
      const stacked = await tiles();
      const line = await page.locator("#board-region .recognise .recognise-line").textContent();
      return { state: (await panelState()).state, concept: stacked[0] ?? null, tiles: stacked.length, dropped: /zu lang/.test(line), frames: fed };
    };
    const back = async () => {
      await page.getByRole("button", { name: "Zurück zur Tafel" }).click();
      assert.equal(await panelState(), null);
      const camera = await page.evaluate(() => window.__camera);
      assert.equal(camera.stops, camera.starts, "the camera is still on after 'Zurück'");
    };

    const outcomes = [];
    let confirmedSpoken = 0;
    let wordsSpoken = 0;
    /** One gesture and the answer to it: the first one recognised is spoken with "Ja, sagen" (its sentence), a later one with a tap on its tile (its word). */
    const handle = async (name, word, conceptId, pass) => {
      const before = await spoken();
      const result = await attempt(name, pass);
      outcomes.push({ name, word, ...result });
      assert.equal(result.state, "listening", `${name}: the view listens on after 'Fertig'`);
      assert.ok(result.tiles <= 1, `${name}: one gesture stacked at most one tile`);
      assert.deepEqual(await spoken(), before, `${name}: spoken before any tap`);
      if (result.concept !== null && conceptId !== null && result.concept === conceptId) {
        await page.waitForTimeout(AFTER_VIEW_MS);
        if (confirmedSpoken === 0) {
          await page.getByRole("button", { name: "Ja, sagen" }).click();
          assert.equal(await panelState(), null);
          assert.deepEqual(await spoken(), [...before, SPEECH[conceptId]], `${name}: 'Ja, sagen' speaks the sentence once`);
          assert.equal(await sentence(), SPEECH[conceptId], "the sentence bar shows it, as after a tap on the tile");
          confirmedSpoken += 1;
          return;
        }
        if (wordsSpoken === 0) {
          await page.locator("#board-region .recognise-taken-tile").first().click();
          const said = await spoken();
          assert.equal(said.length, before.length + 1, `${name}: a tile tap says one thing`);
          assert.notEqual(said.at(-1), SPEECH[conceptId], `${name}: a tile says its word, not the sentence`);
          wordsSpoken += 1;
        }
      }
      await back();
    };

    for (const entry of TAUGHT) for (const name of entry.videos) await handle(name, entry.word, entry.conceptId, 1);
    for (const entry of UNTAUGHT) for (const name of entry.videos) await handle(name, entry.word, null, 1);
    const planned = outcomes.length;
    const taughtOutcomes = outcomes.slice(0, planned).filter((outcome) => TAUGHT.some((entry) => entry.videos.includes(outcome.name)));
    const untaughtOutcomes = outcomes.slice(0, planned).filter((outcome) => !TAUGHT.some((entry) => entry.videos.includes(outcome.name)));
    const count = (list, predicate) => list.filter(predicate).length;
    const wordOf = (name) => TAUGHT.find((entry) => entry.videos.includes(name))?.conceptId ?? null;
    const lines = [
      `Recognise on the board, continuous (${((Date.now() - started) / 1000).toFixed(0)} s): taught ${Object.keys(taughtHands).length} examples ${JSON.stringify(taughtHands)}`,
      `  gestures ${outcomes.length}: taught words ${taughtOutcomes.length} (stacked right ${count(taughtOutcomes, (outcome) => outcome.concept === wordOf(outcome.name))}, `
        + `stacked wrong ${count(taughtOutcomes, (outcome) => outcome.concept !== null && outcome.concept !== wordOf(outcome.name))}, nothing ${count(taughtOutcomes, (outcome) => outcome.concept === null)})`,
      `  untaught words ${untaughtOutcomes.length}: stacked ${count(untaughtOutcomes, (outcome) => outcome.concept !== null)}, nothing ${count(untaughtOutcomes, (outcome) => outcome.concept === null)}`,
      `  spoken: sentence after 'Ja, sagen' ${confirmedSpoken}, word after a tile tap ${wordsSpoken}; too long ${count(outcomes, (outcome) => outcome.dropped)}`,
      ...outcomes.map((outcome) => `    ${outcome.name} (${outcome.frames} frames): ${outcome.concept ?? "nothing"}${outcome.dropped ? " (too long)" : ""}`),
    ];
    console.log(lines.join("\n"));

    assert.deepEqual(await page.evaluate(() => window.__replayFaults ?? []), [], "the replayed tracker answers went out of step with the capture");
    assert.deepEqual(outcomes.filter((outcome) => outcome.state !== "listening").map((outcome) => outcome.name), [], "a gesture ended outside the listening view");
    assert.ok(confirmedSpoken >= 1, "no gesture was recognised and confirmed");
    assert.equal((await spoken()).length, confirmedSpoken + wordsSpoken, "something was spoken without a tap");
    assert.deepEqual(foreign, [], "a request left the app's origin");
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser.close();
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
