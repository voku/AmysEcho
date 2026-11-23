// Real-browser test of recognising a gesture on the child's board (card NG-20, docs/recognise.md).
//
// Chromium (Playwright) runs the built app. A profile is set up in the page through the app's own
// store and board data; gesture examples are taught from DGS sign videos (SignDict.org, adult
// signers, read from the main_old history at test time and never added to main, as in
// dgs-capture.test.mjs) by tracking them through the app's capture path and storing them with
// `saveExample`. Then each attempt goes through the BOARD's own flow: a tap on "Gebärde", the
// countdown, the recording, "Stopp", and the confirm or unknown view. The frames of the attempt are
// fed into the app's capture path (`startCapture` with the real tracker worker; only the camera is
// replaced, through the capture bridge the board looks up). Speech is observed through a stand-in
// engine in the page and the sentence bar.
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
/** The press shield of the board after the gesture view closed (BOARD_SHIELD_MS), plus a margin. */
const AFTER_VIEW_MS = 900;

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
 * Replaces the capture bridge the board looks up with one that runs the app's own `startCapture`
 * and real tracker, with frames from the test instead of a camera. Frames are handed in only when
 * the test feeds them (after the countdown, while the board records). Also gives the page a
 * teaching helper that tracks a pass and stores it as an example through the app's store.
 */
async function installFeeder(page) {
  await page.evaluate(async () => {
    const capture = await import("./capture/capture.js");
    const examples = await import("./recognition/examples.js");
    const fetchFrame = async (url, width, height) => {
      const bytes = await (await fetch(url)).arrayBuffer();
      return createImageBitmap(new ImageData(new Uint8ClampedArray(bytes), width, height));
    };
    window.__camera = { starts: 0, stops: 0, tracked: 0 };
    let pending = [];
    let wake = () => undefined;
    window.__feed = (frames) => {
      pending.push(...frames);
      wake();
    };
    const source = () => {
      let closed = false;
      return {
        async next() {
          while (!closed) {
            if (pending.length > 0) {
              const { url, timestampMs, width, height } = pending.shift();
              return { image: await fetchFrame(url, width, height), timestampMs, width, height };
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
    const environment = (host) => ({
      ...capture.browserEnvironment(host),
      getUserMedia: async () => {
        window.__camera.starts += 1;
        return { getTracks: () => [{ stop() { window.__camera.stops += 1; } }] };
      },
      openFrames: async () => source(),
    });
    Object.defineProperty(globalThis, capture.CAPTURE_BRIDGE_KEY, {
      configurable: true,
      value: {
        text: capture.CAPTURE_TEXT,
        nextShoulders: capture.nextShoulders,
        start: (host, options) => capture.startCapture(environment(host), {
          ...options,
          onFrame: (frame) => {
            window.__camera.tracked += 1;
            options.onFrame?.(frame);
          },
        }),
      },
    });

    window.__teach = async (store, profileId, conceptId, frames) => {
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
      const recording = examples.sequenceFromRecording(tracked);
      if (!recording.ok) return { ok: false, reason: recording.reason };
      await examples.saveExample(store, profileId, conceptId, recording.sequence, { capturedAt: new Date(), frames: recording.frames, durationMs: recording.durationMs });
      return { ok: true, hands: recording.sequence.hands };
    };
  });
}

test("recognising on the board: DGS videos taught as examples, attempted through the board's own flow; nothing is spoken without 'Ja, sagen'", { skip, timeout: 15 * 60_000 }, async () => {
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
    const taughtHands = {};
    for (const entry of TAUGHT) {
      for (const name of entry.videos) {
        const result = await page.evaluate(async ({ profileId: id, conceptId, frames }) => {
          const { app } = await import("./main.js");
          return window.__teach(await app.store(), id, conceptId, frames);
        }, { profileId, conceptId: entry.conceptId, frames: frameList(name, 0) });
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

    /** One attempt through the board: tap "Gebärde", wait for the recording, feed the frames, tap "Stopp"; returns the view it ends in. */
    const attempt = async (name, pass) => {
      await page.waitForTimeout(AFTER_VIEW_MS);
      await gesture.click();
      await page.waitForFunction(() => document.querySelector("#board-region .recognise")?.dataset.state === "recording", undefined, { timeout: 90_000 });
      assert.ok(await gesture.isHidden(), "the board is covered while recording");
      const frames = frameList(name, pass);
      const before = await page.evaluate(() => window.__camera.tracked);
      await page.evaluate((list) => window.__feed(list), frames);
      await page.waitForFunction(({ until }) => window.__camera.tracked >= until
        || document.querySelector("#board-region .recognise")?.dataset.state !== "recording", { until: before + frames.length }, { timeout: 60_000 });
      const cut = (await panelState()).state !== "recording";
      if (!cut) await page.getByRole("button", { name: "Stopp" }).click();
      await page.waitForFunction(() => document.querySelector("#board-region .recognise")?.dataset.state !== "recording", undefined, { timeout: 10_000 });
      const camera = await page.evaluate(() => window.__camera);
      assert.equal(camera.stops, camera.starts, `${name}: the camera is still on after the attempt`);
      return { ...await panelState(), cut, frames: frames.length };
    };
    const back = async () => {
      await page.getByRole("button", { name: "Zurück zur Tafel" }).click();
      assert.equal(await panelState(), null);
    };

    const outcomes = [];
    let confirmedSpoken = 0;
    let rejected = 0;
    let candidateSpoken = 0;
    let firstRecognised = null;
    /** One attempt and the answer to its view. `reject`: press "Nein" even on the right concept. */
    const handle = async (name, word, conceptId, pass, { reject = false } = {}) => {
      const before = await spoken();
      const result = await attempt(name, pass);
      outcomes.push({ name, word, ...result });
      assert.deepEqual(await spoken(), before, `${name}: spoken before any confirming tap`);
      if (result.state === "confirm") {
        assert.ok(await page.getByRole("button", { name: "Ja, sagen" }).isVisible());
        assert.ok(await page.getByRole("button", { name: "Nein" }).isVisible());
        assert.ok(await page.getByRole("button", { name: "Zurück zur Tafel" }).isVisible());
        await page.waitForTimeout(AFTER_VIEW_MS);
        if (!reject && result.concept === conceptId && confirmedSpoken === 0) {
          firstRecognised ??= { name, conceptId };
          await page.getByRole("button", { name: "Ja, sagen" }).click();
          assert.equal(await panelState(), null);
          assert.deepEqual(await spoken(), [...before, SPEECH[conceptId]], `${name}: 'Ja, sagen' speaks the concept once`);
          assert.equal(await sentence(), SPEECH[conceptId], "the sentence bar shows it, as after a tap on the tile");
          confirmedSpoken += 1;
        } else {
          if (result.concept === conceptId) firstRecognised ??= { name, conceptId };
          await page.getByRole("button", { name: "Nein" }).click();
          assert.equal(await panelState(), null);
          assert.deepEqual(await spoken(), before, `${name}: 'Nein' spoke`);
          rejected += 1;
        }
      } else {
        assert.match(await page.locator("#board-region .recognise .recognise-line").textContent(),
          result.state === "unknown" ? /^Das habe ich nicht verstanden\.$/ : /./);
        if (result.state === "unknown" && candidateSpoken === 0) {
          const candidates = page.locator("#board-region .recognise-candidate");
          const count = await candidates.count();
          assert.ok(count <= 3);
          if (count > 0) {
            await page.waitForTimeout(AFTER_VIEW_MS);
            const chosen = await candidates.first().getAttribute("data-concept");
            await candidates.first().click();
            assert.deepEqual(await spoken(), [...before, SPEECH[chosen]], `${name}: a candidate speaks like its tile`);
            candidateSpoken += 1;
            return;
          }
        }
        await back();
        assert.deepEqual(await spoken(), before, `${name}: an unknown or refused attempt spoke`);
      }
    };

    for (const entry of TAUGHT) for (const name of entry.videos) await handle(name, entry.word, entry.conceptId, 1);
    for (const entry of UNTAUGHT) for (const name of entry.videos) await handle(name, entry.word, null, 1);
    // "Nein" on a recognised word, if no confirm view was left for it yet: the same frames give the same answer.
    const planned = outcomes.length;
    if (rejected === 0 && firstRecognised !== null) await handle(firstRecognised.name, firstRecognised.conceptId, firstRecognised.conceptId, 1, { reject: true });

    const taughtOutcomes = outcomes.slice(0, planned).filter((outcome) => TAUGHT.some((entry) => entry.videos.includes(outcome.name)));
    const untaughtOutcomes = outcomes.slice(0, planned).filter((outcome) => !TAUGHT.some((entry) => entry.videos.includes(outcome.name)));
    const count = (list, predicate) => list.filter(predicate).length;
    const wordOf = (name) => TAUGHT.find((entry) => entry.videos.includes(name))?.conceptId ?? null;
    const lines = [
      `Recognise on the board (${((Date.now() - started) / 1000).toFixed(0)} s): taught ${Object.keys(taughtHands).length} examples ${JSON.stringify(taughtHands)}`,
      `  attempts ${outcomes.length} (${outcomes.length - planned} repeated for 'Nein'): taught words ${taughtOutcomes.length} (recognised ${count(taughtOutcomes, (outcome) => outcome.state === "confirm" && outcome.concept === wordOf(outcome.name))}, `
        + `wrong concept shown ${count(taughtOutcomes, (outcome) => outcome.state === "confirm" && outcome.concept !== wordOf(outcome.name))}, `
        + `unknown ${count(taughtOutcomes, (outcome) => outcome.state === "unknown")}, refused ${count(taughtOutcomes, (outcome) => outcome.state === "unusable")})`,
      `  untaught words ${untaughtOutcomes.length}: confirm view shown ${count(untaughtOutcomes, (outcome) => outcome.state === "confirm")}, unknown ${count(untaughtOutcomes, (outcome) => outcome.state === "unknown")}, refused ${count(untaughtOutcomes, (outcome) => outcome.state === "unusable")}`,
      `  spoken: after 'Ja, sagen' ${confirmedSpoken}, after a candidate ${candidateSpoken}; 'Nein' pressed ${rejected}; recordings cut by the time limit ${count(outcomes, (outcome) => outcome.cut)}`,
      ...outcomes.map((outcome) => `    ${outcome.name} (${outcome.frames} frames): ${outcome.state}${outcome.concept === null ? "" : ` ${outcome.concept}`}${outcome.reason === null ? "" : ` (${outcome.reason})`}${outcome.hands === null ? "" : `, attempt ${outcome.hands === "both" ? "two-hand" : "one-hand"}`}`),
    ];
    console.log(lines.join("\n"));

    assert.ok(confirmedSpoken >= 1, "no attempt was recognised and confirmed");
    assert.ok(rejected >= 1, "'Nein' was never tried");
    assert.equal((await spoken()).length, confirmedSpoken + candidateSpoken, "something was spoken without a confirming tap");
    assert.deepEqual(foreign, [], "a request left the app's origin");
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser.close();
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
