// Camera capture (card NG-3): the adapter from tracker output to landmark
// frames, the capture controller with a fake camera and tracker, the worker's
// message protocol with a fake tracker, the tracker cache, and the checks on
// the vendored tracker files. The real browser run is test/browser/.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import {
  MIN_TRACK_FRAMES, frameSummary, shouldersOf, sideOfLabel, toLandmarkFrame, toLandmarkFrames,
} from "../dist/recognition/tracker-adapter.js";
import { buildFeatureSequence, HAND_POINTS } from "../dist/recognition/features.js";
import {
  CAPTURE_TEXT, POSE_EVERY, TRACKER_CACHE_PREFIX, TrackerStartError, cameraProblem, parseTrackerManifest, prepareTrackerFiles, startCapture, trackerFiles, trackerProblem,
} from "../dist/capture/capture.js";
import { createTrackerHost } from "../dist/capture/tracker-worker.js";

const DIST = new URL("../dist/", import.meta.url);
const WIDTH = 640;
const HEIGHT = 480;

/** A tracker hand: 21 normalised points around a wrist at (x, y), size s (of image width). */
function hand(x, y, label, score = 0.95, s = 0.08) {
  const landmarks = Array.from({ length: HAND_POINTS }, (_, index) => {
    if (index === 0) return { x, y };
    const finger = Math.floor((index - 1) / 4);
    const joint = (index - 1) % 4 + 1;
    return { x: x + (finger - 2) * s * 0.25, y: y - joint * s * 0.3 };
  });
  return { landmarks, label, score };
}

function pose(leftShoulder = [0.62, 0.55], rightShoulder = [0.38, 0.55], visibility = 0.99) {
  return Array.from({ length: 33 }, (_, index) => {
    if (index === 11) return { x: leftShoulder[0], y: leftShoulder[1], visibility };
    if (index === 12) return { x: rightShoulder[0], y: rightShoulder[1], visibility };
    return { x: 0.5, y: 0.5, visibility: 0.9 };
  });
}

function frame(tMs, hands, withPose = null) {
  return { timestampMs: 1000 + tMs, imageWidth: WIDTH, imageHeight: HEIGHT, hands, pose: withPose };
}

/** A capture of `count` frames at `fps`; `make(i, t)` gives the hands of frame i. Pose every 5th frame. */
function capture(count, make, { fps = 15, poseFrames = true } = {}) {
  return Array.from({ length: count }, (_, i) => {
    const t = Math.round(i * 1000 / fps);
    return frame(t, make(i, t), poseFrames && i % 5 === 0 ? pose() : null);
  });
}

// ---------------------------------------------------------------------------
// Adapter

test("coordinates get the same scale on both axes: normalised x times width, y times height", () => {
  const result = toLandmarkFrame(frame(0, [hand(0.25, 0.5, "Right")], pose()), 1000);
  assert.deepEqual(result.right[0], [0.25 * WIDTH, 0.5 * HEIGHT]);
  assert.equal(result.left, null);
  assert.equal(result.tMs, 0);
  // A hand of the same normalised size is wider in pixels than tall on a 4:3 image, as on the screen.
  const square = hand(0.5, 0.5, "Left").landmarks;
  const pixels = toLandmarkFrame(frame(0, [{ landmarks: square, label: "Left", score: 1 }]), 1000).left;
  for (let i = 0; i < HAND_POINTS; i += 1) {
    assert.equal(pixels[i][0], square[i].x * WIDTH);
    assert.equal(pixels[i][1], square[i].y * HEIGHT);
  }
  assert.deepEqual(result.shoulders, [[0.62 * WIDTH, 0.55 * HEIGHT], [0.38 * WIDTH, 0.55 * HEIGHT]]);
});

test("left is the child's own left hand: the tracker's label on unflipped frames, swapped for flipped ones", () => {
  assert.equal(sideOfLabel("Left"), "left");
  assert.equal(sideOfLabel("Right"), "right");
  assert.equal(sideOfLabel("Left", true), "right");
  assert.equal(sideOfLabel("left"), null);
  // Unflipped: the child's left hand is on the right of the picture and labelled "Left".
  const plain = toLandmarkFrame(frame(0, [hand(0.7, 0.5, "Left"), hand(0.3, 0.5, "Right")]), 1000);
  assert.equal(plain.left[0][0], 0.7 * WIDTH);
  assert.equal(plain.right[0][0], 0.3 * WIDTH);
  // The same picture flipped before tracking: the labels swap, and the output is the same.
  const flipped = toLandmarkFrame(frame(0, [hand(0.7, 0.5, "Left"), hand(0.3, 0.5, "Right")].map((entry) => ({
    ...entry,
    label: entry.label === "Left" ? "Right" : "Left",
    landmarks: entry.landmarks.map((point) => ({ x: 1 - point.x, y: point.y })),
  }))), 1000, { inputMirrored: true });
  for (const side of ["left", "right"]) {
    flipped[side].forEach((point, index) => {
      assert.ok(Math.abs(point[0] - plain[side][index][0]) < 1e-9 && Math.abs(point[1] - plain[side][index][1]) < 1e-9);
    });
  }
});

test("one-hand capture: frames for the matcher with the hand in its own slot and shoulders from pose landmarks 11 and 12", () => {
  const raw = capture(30, (i) => [hand(0.3 + i * 0.01, 0.5 - i * 0.005, "Right")]);
  const frames = toLandmarkFrames(raw);
  assert.equal(frames.length, 30);
  assert.ok(frames.every((entry) => entry.left === null && entry.right !== null));
  assert.equal(frames[0].tMs, 0);
  assert.ok(frames.every((entry, i) => entry.tMs === Math.round(i * 1000 / 15)));
  assert.equal(frames.filter((entry) => entry.shoulders !== null).length, 6);
  const built = buildFeatureSequence(frames);
  assert.ok(built.ok, JSON.stringify(built));
  assert.equal(built.sequence.hands, "right");
  assert.equal(built.sequence.anchor, "shoulders");
});

test("two-hand capture: both slots filled, two-hand sequence", () => {
  const raw = capture(30, (i) => [hand(0.65 - i * 0.005, 0.5, "Left"), hand(0.35 + i * 0.005, 0.5, "Right")]);
  const frames = toLandmarkFrames(raw);
  assert.ok(frames.every((entry) => entry.left !== null && entry.right !== null));
  assert.ok(frames.every((entry) => entry.left[0][0] > entry.right[0][0]));
  const built = buildFeatureSequence(frames);
  assert.ok(built.ok);
  assert.equal(built.sequence.hands, "both");
});

test("a missing hand is null, an unusable hand is dropped, and frames without hands stay in the capture", () => {
  const raw = capture(20, (i) => (i >= 8 && i < 11 ? [] : [hand(0.3 + i * 0.01, 0.5, "Right")]));
  raw[5] = { ...raw[5], hands: [{ ...hand(0.4, 0.5, "Right"), landmarks: hand(0.4, 0.5, "Right").landmarks.slice(0, 20) }] };
  raw[6] = { ...raw[6], hands: [hand(0.4, 0.5, "Unknown")] };
  const frames = toLandmarkFrames(raw);
  assert.equal(frames.length, 20);
  for (const index of [5, 6, 8, 9, 10]) assert.equal(frames[index].right, null, `frame ${index}`);
  assert.equal(frames.filter((entry) => entry.right !== null).length, 15);
  const built = buildFeatureSequence(frames);
  assert.ok(built.ok, "a gap of four frames at 15 per second is bridged by the matcher");
  assert.equal(built.sequence.hands, "right");
});

test("missing shoulders: no pose, pose without a shoulder, a shoulder outside the picture or too faint give null; 'never' always does", () => {
  assert.equal(shouldersOf(frame(0, [], null)), null);
  const noShoulder = pose();
  noShoulder.length = 11;
  assert.equal(shouldersOf(frame(0, [], noShoulder)), null);
  assert.equal(shouldersOf(frame(0, [], pose([1.2, 0.5]))), null);
  assert.equal(shouldersOf(frame(0, [], pose(undefined, undefined, 0.2))), null);
  assert.notEqual(shouldersOf(frame(0, [], pose())), null);
  assert.equal(shouldersOf(frame(0, [], pose()), { shoulders: "never" }), null);
  // A capture without any shoulders is anchored to the hands.
  const frames = toLandmarkFrames(capture(30, (i) => [hand(0.3 + i * 0.01, 0.5, "Right")], { poseFrames: false }));
  assert.ok(frames.every((entry) => entry.shoulders === null));
  const built = buildFeatureSequence(frames);
  assert.ok(built.ok);
  assert.equal(built.sequence.anchor, "hands");
});

test("handedness flicker: each followed hand keeps the majority label, also when one frame calls both hands the same", () => {
  // Every 4th frame the labels are wrong: swapped, or both "Right".
  const raw = capture(40, (i) => {
    const left = hand(0.65, 0.45 + i * 0.004, "Left");
    const right = hand(0.35, 0.45 + i * 0.004, "Right");
    if (i % 8 === 3) return [{ ...left, label: "Right", score: 0.6 }, { ...right, label: "Left", score: 0.6 }];
    if (i % 8 === 7) return [{ ...left, label: "Right", score: 0.55 }, right];
    return [left, right];
  });
  const frames = toLandmarkFrames(raw);
  assert.ok(frames.every((entry) => entry.left !== null && entry.right !== null));
  assert.ok(frames.every((entry) => entry.left[0][0] === 0.65 * WIDTH && entry.right[0][0] === 0.35 * WIDTH));
  // Per frame on its own, the flicker would swap the hands.
  assert.equal(toLandmarkFrame(raw[3], 1000).left[0][0], 0.35 * WIDTH);

  // One hand alone, with its label flickering: it stays in one slot.
  const single = toLandmarkFrames(capture(30, (i) => [hand(0.4, 0.5 + i * 0.003, i % 5 === 2 ? "Left" : "Right", i % 5 === 2 ? 0.7 : 0.9)]));
  assert.ok(single.every((entry) => entry.left === null && entry.right !== null));
});

test("hands that cross keep their slots; a hand seen in single frames is kept unless asked otherwise", () => {
  // The hands swap sides of the picture over 40 frames.
  const raw = capture(40, (i) => [hand(0.7 - i * 0.01, 0.5, "Left"), hand(0.3 + i * 0.01, 0.5 + 0.002 * i, "Right")]);
  const frames = toLandmarkFrames(raw);
  assert.ok(frames[0].left[0][0] > frames[0].right[0][0]);
  assert.ok(frames[39].left[0][0] < frames[39].right[0][0]);
  frames.forEach((entry, i) => assert.equal(entry.left[0][0], (0.7 - i * 0.01) * WIDTH));

  // A false second hand in one frame next to a still one-hand sign.
  // A second hand caught only in single frames more than 500 ms apart (a real hand the tracker keeps losing,
  // or false detections): it is kept, so the matcher's visit rules decide (here: hands_unclear, no answer).
  const flicker = capture(45, (i) => ([5, 14, 23, 32, 41].includes(i)
    ? [hand(0.4, 0.5 + i * 0.002, "Right"), hand(0.75, 0.45, "Left", 0.6)]
    : [hand(0.4, 0.5 + i * 0.002, "Right")]));
  assert.equal(MIN_TRACK_FRAMES, 1);
  const kept = toLandmarkFrames(flicker);
  assert.deepEqual(kept.flatMap((entry, i) => (entry.left === null ? [] : [i])), [5, 14, 23, 32, 41]);
  const built = buildFeatureSequence(kept);
  assert.deepEqual(built, { ok: false, reason: "hands_unclear" });
  // Removing single-frame hands (possible on request) turns that into a one-hand sequence the matcher would compare.
  const removed = buildFeatureSequence(toLandmarkFrames(flicker, { minTrackFrames: 2 }));
  assert.ok(removed.ok && removed.sequence.hands === "right");
});

test("a hand that leaves and comes back, and a hand that enters during the capture", () => {
  const raw = capture(45, (i) => {
    const hands = [];
    if (i < 10 || i >= 30) hands.push(hand(0.35, 0.5, "Right"));
    if (i >= 15) hands.push(hand(0.65, 0.5 - (i - 15) * 0.005, "Left"));
    return hands;
  });
  const frames = toLandmarkFrames(raw);
  assert.equal(frames.filter((entry) => entry.right !== null).length, 25);
  assert.equal(frames.filter((entry) => entry.left !== null).length, 30);
  assert.ok(frames.slice(0, 15).every((entry) => entry.left === null));
});

test("frameSummary counts hands and shoulders for the live line", () => {
  assert.deepEqual(frameSummary(frame(0, [])), { hands: 0, shoulders: false });
  assert.deepEqual(frameSummary(frame(0, [hand(0.3, 0.5, "Right")], pose())), { hands: 1, shoulders: true });
  assert.deepEqual(frameSummary(frame(0, [hand(0.3, 0.5, "Right"), hand(0.6, 0.5, "Right", 0.5)])), { hands: 2, shoulders: false });
});

test("the adapter is deterministic", () => {
  const raw = capture(40, (i) => [hand(0.7 - i * 0.01, 0.5, i % 6 === 0 ? "Right" : "Left"), hand(0.3 + i * 0.01, 0.5, "Right")]);
  assert.deepEqual(toLandmarkFrames(raw), toLandmarkFrames(structuredClone(raw)));
});

// ---------------------------------------------------------------------------
// Capture controller with a fake camera and tracker

function fakeEnvironment({ trackerFails = false, cameraError = null, framesUntilEnd = Infinity, detectFails = false } = {}) {
  const log = { cameraRequests: 0, constraints: null, tracksStopped: 0, trackerClosed: 0, sourceClosed: 0, poseFlags: [], imagesOpen: 0 };
  const environment = {
    async startTracker() {
      if (trackerFails) throw new Error("no tracker");
      return {
        async detect(image, timestampMs, withPose) {
          image.close();
          log.poseFlags.push(withPose);
          if (detectFails) throw new Error("tracker crashed");
          return { hands: [hand(0.4, 0.5, "Right")], pose: withPose ? pose() : null };
        },
        close() { log.trackerClosed += 1; },
      };
    },
    async getUserMedia(constraints) {
      log.cameraRequests += 1;
      log.constraints = constraints;
      if (cameraError !== null) throw Object.assign(new Error("camera"), { name: cameraError });
      return { getTracks: () => [{ stop() { log.tracksStopped += 1; } }] };
    },
    async openFrames() {
      let index = 0;
      return {
        async next() {
          await new Promise((resolve) => setTimeout(resolve, 1));
          if (index >= framesUntilEnd) return null;
          index += 1;
          log.imagesOpen += 1;
          return { image: { close() { log.imagesOpen -= 1; } }, timestampMs: index * 66, width: WIDTH, height: HEIGHT };
        },
        close() { log.sourceClosed += 1; },
      };
    },
  };
  return { environment, log };
}

async function until(condition) {
  for (let i = 0; i < 500 && !condition(); i += 1) await new Promise((resolve) => setTimeout(resolve, 2));
  assert.ok(condition());
}

test("capture: tracker first, then the camera; frames flow; stop turns the camera off and returns only landmark numbers", async () => {
  const { environment, log } = fakeEnvironment();
  const steps = [];
  const seen = [];
  const started = await startCapture(environment, { record: true, onStep: (step) => steps.push(step), onFrame: (entry) => seen.push(entry) });
  assert.ok(started.ok);
  assert.equal(log.cameraRequests, 1);
  assert.deepEqual(log.constraints, { audio: false, video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } });
  await until(() => seen.length >= 12);
  const frames = started.session.stop();
  assert.ok(frames.length >= 12);
  assert.deepEqual(steps, ["preparing", "asking", "running", "stopped"]);
  assert.equal(log.tracksStopped, 1);
  assert.equal(log.trackerClosed, 1);
  assert.equal(log.sourceClosed, 1);
  assert.deepEqual(await started.session.ended, { kind: "stopped" });
  // No picture is kept: every image was closed, and a frame holds numbers only.
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(log.imagesOpen, 0);
  assert.deepEqual(Object.keys(frames[0]).sort(), ["hands", "imageHeight", "imageWidth", "pose", "timestampMs"]);
  assert.equal(JSON.stringify(frames).includes("close"), false);
  // Pose runs on every POSE_EVERY-th frame.
  log.poseFlags.forEach((flag, index) => assert.equal(flag, index % POSE_EVERY === 0));
  // Stopping again changes nothing and returns nothing.
  assert.deepEqual(started.session.stop(), []);
  assert.equal(log.tracksStopped, 1);
});

test("capture without record keeps no frames; with a limit it keeps only the newest", async () => {
  const plain = fakeEnvironment();
  let count = 0;
  const started = await startCapture(plain.environment, { onFrame: () => { count += 1; } });
  await until(() => count >= 5);
  assert.deepEqual(started.session.stop(), []);

  const limited = fakeEnvironment();
  let seen = 0;
  const kept = await startCapture(limited.environment, { record: true, maxRecordedFrames: 4, onFrame: () => { seen += 1; } });
  await until(() => seen >= 10);
  const frames = kept.session.stop();
  assert.equal(frames.length, 4);
  assert.ok(frames[3].timestampMs > frames[0].timestampMs);
});

test("capture: a tracker that cannot load never asks for the camera", async () => {
  const { environment, log } = fakeEnvironment({ trackerFails: true });
  assert.deepEqual(await startCapture(environment), { ok: false, problem: "tracker_unavailable" });
  assert.equal(log.cameraRequests, 0);
  for (const [error, problem] of [
    [new TrackerStartError("tracker_download", "x"), "tracker_download"],
    [new TypeError("Failed to fetch"), "tracker_download"],
    [new DOMException("full", "QuotaExceededError"), "tracker_storage"],
    [new DOMException("stalled", "TimeoutError"), "tracker_timeout"],
    [new Error("checksum"), "tracker_unavailable"],
  ]) {
    assert.equal(trackerProblem(error), problem);
    const failing = fakeEnvironment();
    failing.environment.startTracker = async () => { throw error; };
    assert.deepEqual(await startCapture(failing.environment), { ok: false, problem });
    assert.equal(failing.log.cameraRequests, 0);
  }
});

/** A promise and the function that settles it. */
function gate() {
  let open;
  const opened = new Promise((resolve) => { open = resolve; });
  return { opened, open };
}

test("capture: cancelled while the tracker loads, the camera is never requested and the tracker is closed", async () => {
  const { environment, log } = fakeEnvironment();
  const loading = gate();
  const original = environment.startTracker;
  let sawSignal = null;
  environment.startTracker = async (signal) => { sawSignal = signal; await loading.opened; return original(); };
  const controller = new AbortController();
  const result = startCapture(environment, { signal: controller.signal });
  await new Promise((resolve) => setTimeout(resolve, 5));
  controller.abort();
  loading.open();
  assert.deepEqual(await result, { ok: false, cancelled: true });
  assert.equal(sawSignal, controller.signal, "the tracker start gets the signal, to stop its download and worker");
  assert.equal(log.cameraRequests, 0);
  assert.equal(log.trackerClosed, 1);
});

test("capture: cancelled while the permission is asked, a camera granted afterwards is stopped at once", async () => {
  const { environment, log } = fakeEnvironment();
  const asking = gate();
  const original = environment.getUserMedia;
  environment.getUserMedia = async (constraints) => { const stream = await original(constraints); await asking.opened; return stream; };
  const controller = new AbortController();
  const steps = [];
  const result = startCapture(environment, { signal: controller.signal, onStep: (step) => steps.push(step) });
  await until(() => log.cameraRequests === 1);
  controller.abort();
  asking.open();
  assert.deepEqual(await result, { ok: false, cancelled: true });
  assert.equal(log.tracksStopped, 1);
  assert.equal(log.trackerClosed, 1);
  assert.equal(log.sourceClosed, 0);
  assert.deepEqual(steps, ["preparing", "asking"]);
});

test("capture: a hidden page never requests the camera, and a camera granted while hidden is stopped", async () => {
  const hiddenFirst = fakeEnvironment();
  hiddenFirst.environment.isVisible = () => false;
  assert.deepEqual(await startCapture(hiddenFirst.environment), { ok: false, cancelled: true });
  assert.equal(hiddenFirst.log.cameraRequests, 0);

  const loading = fakeEnvironment();
  let visible = true;
  loading.environment.isVisible = () => visible;
  const original = loading.environment.startTracker;
  loading.environment.startTracker = async () => { visible = false; return original(); };
  assert.deepEqual(await startCapture(loading.environment), { ok: false, cancelled: true });
  assert.equal(loading.log.cameraRequests, 0);
  assert.equal(loading.log.trackerClosed, 1);

  const asking = fakeEnvironment();
  visible = true;
  asking.environment.isVisible = () => visible;
  const gum = asking.environment.getUserMedia;
  asking.environment.getUserMedia = async (constraints) => { const stream = await gum(constraints); visible = false; return stream; };
  assert.deepEqual(await startCapture(asking.environment), { ok: false, cancelled: true });
  assert.equal(asking.log.tracksStopped, 1);
  assert.equal(asking.log.trackerClosed, 1);
});

test("capture: the signal also stops a running capture", async () => {
  const { environment, log } = fakeEnvironment();
  const controller = new AbortController();
  let frames = 0;
  const started = await startCapture(environment, { signal: controller.signal, onFrame: () => { frames += 1; } });
  await until(() => frames >= 2);
  controller.abort();
  assert.deepEqual(await started.session.ended, { kind: "stopped" });
  assert.equal(log.tracksStopped, 1);
  assert.equal(log.trackerClosed, 1);
});

test("capture: denied, missing and busy cameras are told apart, and the tracker is closed again", async () => {
  for (const [name, problem] of [["NotAllowedError", "denied"], ["SecurityError", "denied"], ["NotFoundError", "no_camera"],
    ["OverconstrainedError", "no_camera"], ["NotReadableError", "busy"], ["AbortError", "busy"], ["NotSupportedError", "unsupported"], ["TypeError", "unsupported"]]) {
    assert.equal(cameraProblem({ name }), problem, name);
    const { environment, log } = fakeEnvironment({ cameraError: name });
    assert.deepEqual(await startCapture(environment), { ok: false, problem });
    assert.equal(log.trackerClosed, 1);
  }
  assert.equal(cameraProblem(null), "unsupported");
});

test("capture: a tracker failure or an ended camera stops the capture with a problem", async () => {
  const failing = fakeEnvironment({ detectFails: true });
  const started = await startCapture(failing.environment);
  assert.deepEqual(await started.session.ended, { kind: "problem", problem: "tracker_failed" });
  assert.equal(failing.log.tracksStopped, 1);
  const ending = fakeEnvironment({ framesUntilEnd: 3 });
  const second = await startCapture(ending.environment, { record: true });
  assert.deepEqual(await second.session.ended, { kind: "problem", problem: "busy" });
  assert.equal(ending.log.tracksStopped, 1);
});

test("every user-facing capture text is German and says how to go on", () => {
  for (const text of [CAPTURE_TEXT.title, CAPTURE_TEXT.start, CAPTURE_TEXT.back, ...Object.values(CAPTURE_TEXT.problems)]) {
    assert.ok(text.length > 0);
  }
  assert.match(CAPTURE_TEXT.problems.denied, /Tafel funktioniert auch ohne Kamera/);
  assert.match(CAPTURE_TEXT.problems.no_camera, /Tafel funktioniert auch ohne Kamera/);
  // Only a failed download speaks of the network; full storage and a stalled download say what they are.
  assert.match(CAPTURE_TEXT.problems.tracker_download, /Internet/);
  for (const problem of ["tracker_storage", "tracker_timeout", "tracker_unavailable"]) assert.doesNotMatch(CAPTURE_TEXT.problems[problem], /Internet/);
  assert.match(CAPTURE_TEXT.problems.tracker_storage, /Speicher/);
  assert.match(CAPTURE_TEXT.problems.tracker_timeout, /noch einmal/);
  assert.match(CAPTURE_TEXT.intro, /nicht gespeichert und nicht gesendet/);
  assert.equal(CAPTURE_TEXT.back, "Zurück zur Tafel");
});

// ---------------------------------------------------------------------------
// Worker protocol with a fake tracker

function fakeVision(log) {
  const landmarker = (kind) => ({
    async createFromOptions(fileset, options) {
      log.push(["create", kind, fileset.wasmLoaderPath, options.baseOptions.modelAssetPath, options.numHands ?? options.numPoses, options.runningMode]);
      return {
        detectForVideo(image, timestampMs) {
          log.push(["detect", kind, timestampMs]);
          if (kind === "hand") {
            return { landmarks: [hand(0.4, 0.5, "Right").landmarks], handedness: [[{ categoryName: "Right", score: 0.9, index: 1, displayName: "" }]] };
          }
          return { landmarks: [pose()] };
        },
        close() { log.push(["close", kind]); },
      };
    },
  });
  return {
    FilesetResolver: { async forVisionTasks(base, useModule) { log.push(["fileset", base, useModule]); return { wasmLoaderPath: `${base}/vision_wasm_module_internal.js`, wasmBinaryPath: `${base}/vision_wasm_module_internal.wasm` }; } },
    HandLandmarker: landmarker("hand"),
    PoseLandmarker: landmarker("pose"),
  };
}

test("tracker worker protocol: init, frames with and without pose, images closed, close", async () => {
  const log = [];
  const replies = [];
  const files = trackerFiles("https://app.example/echo/vendor/mediapipe/0.10.35-abc/");
  assert.deepEqual(files, {
    bundle: "https://app.example/echo/vendor/mediapipe/0.10.35-abc/vision_bundle.mjs",
    wasm: "https://app.example/echo/vendor/mediapipe/0.10.35-abc/wasm",
    handModel: "https://app.example/echo/vendor/mediapipe/0.10.35-abc/models/hand_landmarker.task",
    poseModel: "https://app.example/echo/vendor/mediapipe/0.10.35-abc/models/pose_landmarker_lite.task",
  });
  const loaded = [];
  const handle = createTrackerHost(async (bundle) => { loaded.push(bundle); return fakeVision(log); }, "https://app.example", (reply) => replies.push(reply));
  // A frame before init is an error, and its picture is still closed.
  let closed = 0;
  await handle({ type: "frame", id: 0, image: { close() { closed += 1; } }, timestampMs: 1, pose: false });
  assert.deepEqual(replies.shift(), { type: "error", id: 0, message: "tracker not ready" });
  assert.equal(closed, 1);

  await handle({ type: "init", delegate: "CPU", pose: true, files });
  assert.deepEqual(replies.shift(), { type: "ready" });
  assert.deepEqual(loaded, [files.bundle]);
  assert.deepEqual(log.slice(0, 3), [
    ["fileset", files.wasm, true],
    ["create", "hand", `${files.wasm}/vision_wasm_module_internal.js`, files.handModel, 2, "VIDEO"],
    // The second task loads the wasm loader under a second URL (module worker).
    ["create", "pose", `${files.wasm}/vision_wasm_module_internal.js?task=pose`, files.poseModel, 1, "VIDEO"],
  ]);
  await handle({ type: "frame", id: 1, image: { close() { closed += 1; } }, timestampMs: 10, pose: true });
  await handle({ type: "frame", id: 2, image: { close() { closed += 1; } }, timestampMs: 20, pose: false });
  assert.equal(closed, 3);
  const [first, second] = replies.splice(0, 2);
  assert.equal(first.type, "result");
  assert.equal(first.id, 1);
  assert.equal(first.hands.length, 1);
  assert.equal(first.hands[0].label, "Right");
  assert.equal(first.hands[0].landmarks.length, 21);
  assert.equal(first.pose.length, 33);
  assert.equal(second.pose, null);
  assert.deepEqual(log.filter((entry) => entry[0] === "detect"), [["detect", "hand", 10], ["detect", "pose", 10], ["detect", "hand", 20]]);
  // Replies carry plain numbers only (structured-clone safe, no picture).
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);

  await handle({ type: "close" });
  assert.deepEqual(replies.shift(), { type: "closed" });
  assert.deepEqual(log.filter((entry) => entry[0] === "close"), [["close", "hand"], ["close", "pose"]]);
  await handle({ type: "init", delegate: "CPU", pose: false, files });
  assert.equal(replies.shift().type, "error");
});

test("tracker worker: files from another origin are refused before anything loads", async () => {
  const replies = [];
  const loaded = [];
  const handle = createTrackerHost(async (bundle) => { loaded.push(bundle); return fakeVision([]); }, "https://app.example", (reply) => replies.push(reply));
  await handle({ type: "init", delegate: "CPU", pose: false, files: { ...trackerFiles("https://app.example/v/"), bundle: "https://cdn.example/vision_bundle.mjs" } });
  assert.deepEqual(loaded, []);
  assert.equal(replies[0].type, "error");
});

test("tracker worker: a failing load is reported, not thrown", async () => {
  const replies = [];
  const handle = createTrackerHost(async () => { throw new Error("wasm blocked"); }, "https://a.example", (reply) => replies.push(reply));
  await handle({ type: "init", delegate: "CPU", pose: false, files: trackerFiles("https://a.example/vendor/mediapipe/x/") });
  assert.deepEqual(replies, [{ type: "error", id: null, message: "wasm blocked" }]);
});

// ---------------------------------------------------------------------------
// Tracker cache

function fakeCaches(initial = {}) {
  const stores = new Map(Object.entries(initial).map(([name, entries]) => [name, new Map(Object.entries(entries))]));
  const puts = [];
  return {
    stores,
    puts,
    api: {
      async open(name) {
        if (!stores.has(name)) stores.set(name, new Map());
        const store = stores.get(name);
        return {
          async match(url) { return store.has(url) ? new Response(store.get(url)) : undefined; },
          async put(url, response) { puts.push([name, url]); store.set(url, new Uint8Array(await response.arrayBuffer())); },
        };
      },
      async keys() { return [...stores.keys()]; },
      async has(name) { return stores.has(name); },
      async delete(name) { return stores.delete(name); },
    },
  };
}

const sha256 = async (bytes) => createHash("sha256").update(Buffer.from(bytes)).digest("hex");

function served(files) {
  const fetched = [];
  return {
    fetched,
    fetch: async (url) => {
      fetched.push(url);
      if (!(url in files)) return new Response("", { status: 404 });
      return new Response(files[url], { headers: { "content-type": "application/octet-stream" } });
    },
  };
}

const BASE = "https://app.example/echo/vendor/mediapipe/";
const MANIFEST_URL = `${BASE}manifest.json`;
const FILE_A = new TextEncoder().encode("bundle");
const FILE_B = new TextEncoder().encode("model");
const hex = (bytes) => createHash("sha256").update(bytes).digest("hex");
function manifestOf(directory, files) {
  return {
    package: "@mediapipe/tasks-vision",
    version: "0.10.35",
    directory,
    cache: `${TRACKER_CACHE_PREFIX}${directory}`,
    files: Object.entries(files).map(([path, bytes]) => ({ path: `${directory}/${path}`, sha256: hex(bytes), bytes: bytes.byteLength })),
  };
}
const MANIFEST = manifestOf("0.10.35-abc", { "vision_bundle.mjs": FILE_A, "models/m.task": FILE_B });
const URL_A = `${BASE}0.10.35-abc/vision_bundle.mjs`;
const URL_B = `${BASE}0.10.35-abc/models/m.task`;

test("tracker cache: filled in its own cache, each file checked, the manifest last; older tracker caches removed, board cache kept", async () => {
  const caches = fakeCaches({ "amysecho-ng-capture-v2": { x: "board" }, [`${TRACKER_CACHE_PREFIX}old`]: { y: "old" } });
  const network = served({ [MANIFEST_URL]: JSON.stringify(MANIFEST), [URL_A]: FILE_A, [URL_B]: FILE_B });
  let persisted = 0;
  const result = await prepareTrackerFiles(MANIFEST_URL, { caches: caches.api, fetch: network.fetch, sha256, persist: async () => { persisted += 1; return true; } });
  assert.deepEqual(result, MANIFEST);
  assert.equal(persisted, 1);
  assert.deepEqual(caches.puts, [[MANIFEST.cache, URL_A], [MANIFEST.cache, URL_B], [MANIFEST.cache, MANIFEST_URL]]);
  assert.deepEqual([...caches.stores.keys()].sort(), ["amysecho-ng-capture-v2", MANIFEST.cache].sort());
  // A second start finds the complete cache and downloads nothing but the manifest.
  network.fetched.length = 0;
  assert.deepEqual(await prepareTrackerFiles(MANIFEST_URL, { caches: caches.api, fetch: network.fetch, sha256 }), MANIFEST);
  assert.deepEqual(network.fetched, [MANIFEST_URL]);
  // Offline, the complete cache from earlier still serves.
  const offline = async () => { throw new TypeError("Failed to fetch"); };
  assert.deepEqual(await prepareTrackerFiles(MANIFEST_URL, { caches: caches.api, fetch: offline, sha256 }), MANIFEST);
});

test("tracker cache: a wrong checksum, a failed download, full storage or a stalled download leave the cache incomplete and say which", async () => {
  const caches = fakeCaches();
  const wrong = served({ [MANIFEST_URL]: JSON.stringify(MANIFEST), [URL_A]: FILE_A, [URL_B]: new TextEncoder().encode("other") });
  await assert.rejects(prepareTrackerFiles(MANIFEST_URL, { caches: caches.api, fetch: wrong.fetch, sha256 }),
    (error) => /does not match its checksum/.test(error.message) && trackerProblem(error) === "tracker_unavailable");
  assert.ok(!caches.puts.some(([, url]) => url === MANIFEST_URL || url === URL_B));
  const missing = served({ [MANIFEST_URL]: JSON.stringify(MANIFEST), [URL_A]: FILE_A });
  await assert.rejects(prepareTrackerFiles(MANIFEST_URL, { caches: fakeCaches().api, fetch: missing.fetch, sha256 }),
    (error) => /HTTP 404/.test(error.message) && trackerProblem(error) === "tracker_download");
  await assert.rejects(prepareTrackerFiles(MANIFEST_URL, { caches: fakeCaches().api, fetch: async () => { throw new TypeError("offline"); }, sha256 }),
    (error) => trackerProblem(error) === "tracker_download");
  // Without a Cache API the current manifest is returned and nothing is cached.
  assert.deepEqual(await prepareTrackerFiles(MANIFEST_URL, { caches: undefined, fetch: missing.fetch, sha256 }), MANIFEST);
  // Full storage.
  const full = fakeCaches();
  const realOpen = full.api.open;
  full.api.open = async (name) => ({ ...(await realOpen(name)), put: async () => { throw new DOMException("quota", "QuotaExceededError"); } });
  const all = served({ [MANIFEST_URL]: JSON.stringify(MANIFEST), [URL_A]: FILE_A, [URL_B]: FILE_B });
  await assert.rejects(prepareTrackerFiles(MANIFEST_URL, { caches: full.api, fetch: all.fetch, sha256 }), (error) => trackerProblem(error) === "tracker_storage");
  // A download that stops sending: given up after the stall time, not waited for forever.
  const stalling = async (url, init) => {
    if (url === MANIFEST_URL) return new Response(JSON.stringify(MANIFEST));
    let pull = 0;
    const body = new ReadableStream({ pull(controller) { if (pull++ === 0) controller.enqueue(new Uint8Array([1])); return new Promise(() => undefined); } });
    init?.signal?.addEventListener("abort", () => undefined);
    return new Response(body);
  };
  const started = Date.now();
  await assert.rejects(prepareTrackerFiles(MANIFEST_URL, { caches: fakeCaches().api, fetch: stalling, sha256 }, { stallMs: 50 }),
    (error) => trackerProblem(error) === "tracker_timeout");
  assert.ok(Date.now() - started < 2000);
  // A cancelled download ends with the cancel, not with a problem.
  const controller = new AbortController();
  const cancelled = prepareTrackerFiles(MANIFEST_URL, { caches: fakeCaches().api, fetch: stalling, sha256 }, { signal: controller.signal, stallMs: 10_000 });
  setTimeout(() => controller.abort(new DOMException("cancelled", "AbortError")), 20);
  await assert.rejects(cancelled, (error) => error.name === "AbortError");
  assert.throws(() => parseTrackerManifest({ ...MANIFEST, cache: "amysecho-ng-x" }), /malformed/);
  assert.throws(() => parseTrackerManifest({ ...MANIFEST, files: [{ path: "0.10.35-abc/../sw.js", sha256: hex(FILE_A), bytes: 1 }] }), /malformed/);
  assert.throws(() => parseTrackerManifest({ ...MANIFEST, files: [{ path: "other/vision_bundle.mjs", sha256: hex(FILE_A), bytes: 1 }] }), /malformed/);
});

/** The built service worker, run against a fake Cache Storage that, like the browser's, matches across all caches. */
async function serviceWorker(stores, network) {
  const source = await readFile(new URL("sw.js", DIST), "utf8");
  const listeners = {};
  const self = {
    registration: { scope: "https://app.example/echo/" },
    location: { origin: "https://app.example" },
    addEventListener(type, listener) { listeners[type] = listener; },
  };
  const strip = (url, options) => { const parsed = new URL(url); if (options?.ignoreSearch) parsed.search = ""; return parsed.href; };
  const cacheOf = (name) => ({
    async match(request, options) { const body = stores.get(name).get(strip(request.url ?? request, options)); return body === undefined ? undefined : new Response(body); },
    async put(url, response) { stores.get(name).set(url, new Uint8Array(await response.arrayBuffer())); },
  });
  const caches = {
    async open(name) { if (!stores.has(name)) stores.set(name, new Map()); return cacheOf(name); },
    async has(name) { return stores.has(name); },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async match(request, options) {
      for (const name of stores.keys()) { const found = await cacheOf(name).match(request, options); if (found !== undefined) return found; }
      return undefined;
    },
  };
  new Function("self", "caches", "fetch", source)(self, caches, network);
  const fetchThrough = async (url, init) => {
    let response;
    listeners.fetch({ request: new Request(url, init), respondWith(promise) { response = promise; } });
    return response ?? network(new Request(url, init));
  };
  return { caches, fetchThrough };
}

test("tracker update: a new build over a complete cache of the old one gets its own files, works at once, and the old cache goes", async () => {
  const oldBytes = new TextEncoder().encode("bundle v1");
  const newBytes = new TextEncoder().encode("bundle v2");
  const oldManifest = manifestOf("0.10.35-old", { "vision_bundle.mjs": oldBytes });
  const newManifest = manifestOf("0.10.35-new", { "vision_bundle.mjs": newBytes });
  const stores = new Map([[oldManifest.cache, new Map([
    [`${BASE}0.10.35-old/vision_bundle.mjs`, oldBytes],
    [MANIFEST_URL, new TextEncoder().encode(JSON.stringify(oldManifest))],
  ])]]);
  const server = { [MANIFEST_URL]: JSON.stringify(newManifest), [`${BASE}0.10.35-new/vision_bundle.mjs`]: newBytes };
  const requests = [];
  const network = async (request) => {
    const url = request.url ?? request;
    requests.push(url);
    return url in server ? new Response(server[url]) : new Response("", { status: 404 });
  };
  const { caches, fetchThrough } = await serviceWorker(stores, network);
  const ready = await prepareTrackerFiles(MANIFEST_URL, { caches, fetch: fetchThrough, sha256 });
  assert.deepEqual(ready, newManifest);
  assert.deepEqual([...stores.keys()], [newManifest.cache], "the old tracker cache is still there");
  assert.ok(requests.includes(`${BASE}0.10.35-new/vision_bundle.mjs`));
  // The worker's request for the new file is answered from the new cache.
  requests.length = 0;
  const served = await fetchThrough(`${BASE}0.10.35-new/vision_bundle.mjs`);
  assert.equal(await served.text(), "bundle v2");
  assert.deepEqual(requests, []);
  // A second start needs only the manifest.
  assert.deepEqual(await prepareTrackerFiles(MANIFEST_URL, { caches, fetch: fetchThrough, sha256 }), newManifest);
  assert.deepEqual(requests, [MANIFEST_URL]);
});

test("the service worker answers a tracker file only from the cache its path names, never from another", async () => {
  const stores = new Map([
    // A stale copy under the new URL in another tracker cache, and one in a board cache: neither may answer.
    [`${TRACKER_CACHE_PREFIX}0.10.35-old`, new Map([[`${BASE}0.10.35-new/vision_bundle.mjs`, new TextEncoder().encode("stale")]])],
    ["amysecho-ng-capture-v2", new Map([[`${BASE}0.10.35-new/wasm/loader.js`, new TextEncoder().encode("stale")]])],
    [`${TRACKER_CACHE_PREFIX}0.10.35-new`, new Map([[`${BASE}0.10.35-new/wasm/loader.js`, new TextEncoder().encode("loader")]])],
  ]);
  const network = async (request) => new Response(`network ${new URL(request.url ?? request).pathname}`);
  const { fetchThrough } = await serviceWorker(stores, network);
  assert.equal(await (await fetchThrough(`${BASE}0.10.35-new/vision_bundle.mjs`)).text(), "network /echo/vendor/mediapipe/0.10.35-new/vision_bundle.mjs");
  // The second URL of the wasm loader is found without its query, in the right cache.
  assert.equal(await (await fetchThrough(`${BASE}0.10.35-new/wasm/loader.js?task=pose`)).text(), "loader");
  // A directory without a cache goes to the network and creates no cache.
  assert.equal(await (await fetchThrough(`${BASE}0.10.35-gone/x.task`)).text(), "network /echo/vendor/mediapipe/0.10.35-gone/x.task");
  assert.ok(!stores.has(`${TRACKER_CACHE_PREFIX}0.10.35-gone`));
});

// ---------------------------------------------------------------------------
// The vendored tracker as built

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => new URL(`${entry.parentPath ?? entry.path}/${entry.name}`, "file://").pathname);
}

test("the built tracker: pinned 0.10.35 files with their checksums, the one wasm variant, licence and notice", async () => {
  const manifest = parseTrackerManifest(JSON.parse(await readFile(new URL("vendor/mediapipe/manifest.json", DIST), "utf8")));
  assert.equal(manifest.package, "@mediapipe/tasks-vision");
  assert.equal(manifest.version, "0.10.35");
  // Every file sits in a directory named after the contents of all of them, and the cache is named the same.
  assert.match(manifest.directory, /^0\.10\.35-[0-9a-f]{16}$/);
  assert.equal(manifest.cache, `${TRACKER_CACHE_PREFIX}${manifest.directory}`);
  assert.deepEqual(manifest.files.map((file) => file.path), [
    "vision_bundle.mjs", "wasm/vision_wasm_module_internal.js", "wasm/vision_wasm_module_internal.wasm",
    "models/hand_landmarker.task", "models/pose_landmarker_lite.task",
  ].map((path) => `${manifest.directory}/${path}`));
  const digest = createHash("sha256").update(manifest.files.map((file) => `${file.path.slice(manifest.directory.length + 1)} ${file.sha256}`).join("\n")).digest("hex").slice(0, 16);
  assert.equal(manifest.directory, `0.10.35-${digest}`);
  for (const file of manifest.files) {
    const bytes = await readFile(new URL(`vendor/mediapipe/${file.path}`, DIST));
    assert.equal(bytes.byteLength, file.bytes, file.path);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256, file.path);
  }
  const packageJson = JSON.parse(await readFile(new URL("../node_modules/@mediapipe/tasks-vision/package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.version, "0.10.35");
  const ownPackage = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(ownPackage.devDependencies["@mediapipe/tasks-vision"], "0.10.35", "the tracker must be pinned exactly");
  assert.deepEqual(Object.keys(ownPackage.dependencies ?? {}), [], "no runtime dependency");
  assert.match(await readFile(new URL("vendor/mediapipe/LICENSE.txt", DIST), "utf8"), /^Apache License\s+Version 2\.0/);
  assert.match(await readFile(new URL("vendor/mediapipe/NOTICE.txt", DIST), "utf8"), /@mediapipe\/tasks-vision 0\.10\.35[\s\S]*hand_landmarker[\s\S]*pose_landmarker_lite/);
});

/**
 * Hosts that occur in the vendored code only in comments and error texts
 * (documentation links, an example in a stack-trace parser). Any other host,
 * and any Google API or telemetry host at all, fails the test: the tracker
 * must not be able to talk to the network (decision record, "Metrics upload
 * in 1.x"), and the meta-tag CSP does not cover the worker.
 */
const DOCUMENTATION_HOSTS = new Set([
  "www.khronos.org", "www.ietf.org", "webkit.org", "tools.ietf.org", "github.com", "developer.mozilla.org", "bugzil.la",
  "www.w3.org", "unicode.org", "server.com", "pubs.opengroup.org", "kripken.github.io", "en.wikipedia.org",
  "go", "goto", "www.tensorflow.org",
]);
// "type.googleapis.com/..." names protobuf message types in the bundle and is not a request target; a URL to a Google host is.
const FORBIDDEN = /\/\/[a-z0-9.-]*(?:googleapis|gstatic|google-analytics|googletagmanager|doubleclick|firebaseio|clearcut)\b|sendBeacon|odml\.pa\.|\/v1\/log\b/i;

test("the vendored tracker names no network host except documentation links, and no telemetry", async () => {
  const vendor = new URL("vendor/mediapipe/", DIST);
  const files = (await filesUnder(vendor)).filter((path) => /\.(mjs|js|wasm)$/.test(path));
  assert.equal(files.length, 3);
  const app = (await filesUnder(DIST)).filter((path) => path.endsWith(".js") && !path.includes("/vendor/"));
  for (const path of [...files, ...app]) {
    const text = (await readFile(path)).toString("latin1");
    const forbidden = FORBIDDEN.exec(text);
    assert.equal(forbidden, null, `${path} contains ${forbidden?.[0]}`);
    for (const match of text.matchAll(/\b(?:https?|wss?):\/\/([A-Za-z0-9.-]+)/g)) {
      assert.ok(DOCUMENTATION_HOSTS.has(match[1].toLowerCase()), `${path} names the host ${match[1]}`);
    }
  }
  // The check itself catches what 1.x ships.
  assert.match('fetch("https://odml.pa.googleapis.com/v1/log",{method:"POST"})', FORBIDDEN);
  // The bundle of 0.10.35 names no URL at all.
  const { directory } = JSON.parse(await readFile(new URL("manifest.json", vendor), "utf8"));
  assert.equal(/https?:\/\//.test(await readFile(new URL(`${directory}/vision_bundle.mjs`, vendor), "utf8")), false);
});

test("the service worker keeps the tracker out of the board's install and never deletes the tracker cache", async () => {
  const source = await readFile(new URL("sw.js", DIST), "utf8");
  const listeners = {};
  const added = [];
  const deleted = [];
  const self = {
    registration: { scope: "https://app.example/echo/" },
    location: { origin: "https://app.example" },
    addEventListener(type, listener) { listeners[type] = listener; },
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };
  const matched = [];
  const caches = {
    open: async () => ({ addAll: async (requests) => { added.push(...requests.map((request) => request.url)); } }),
    keys: async () => ["amysecho-ng-capture-v1", "amysecho-ng-capture-v2", `${TRACKER_CACHE_PREFIX}0.10.35-abc`, "other-app"],
    delete: async (name) => { deleted.push(name); return true; },
    match: async (request, options) => { matched.push([request.url, options]); return new Response("cached"); },
  };
  new Function("self", "caches", source)(self, caches);
  let pending;
  listeners.install({ waitUntil(promise) { pending = promise; } });
  await pending;
  assert.ok(added.some((url) => url.endsWith("/capture/capture.js")));
  assert.ok(!added.some((url) => url.includes("/vendor/")), "tracker files in the board's pre-cache");
  listeners.activate({ waitUntil(promise) { pending = promise; } });
  await pending;
  // The built name carries a digest of the assets (card NG-39), so both older board caches go.
  assert.deepEqual(deleted, ["amysecho-ng-capture-v1", "amysecho-ng-capture-v2"]);
  // App files are matched in all caches, exactly (tracker files: the test above).
  let response;
  listeners.fetch({ request: new Request("https://app.example/echo/board.js"), respondWith(promise) { response = promise; } });
  await response;
  assert.deepEqual(matched, [["https://app.example/echo/board.js", undefined]]);
});
