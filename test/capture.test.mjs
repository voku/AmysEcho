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
  CAMERA_CONSTRAINTS, CAMERA_FACING_KEY, CAPTURE_ROUTE, cameraConstraints, loadCameraFacing, mountCaptureEntry, previewMirrored, saveCameraFacing,
  CAPTURE_BRIDGE_KEY, CAPTURE_TEXT, HAND_CONNECTIONS, POSE_EVERY, PREVIEW_COLOURS, captureBridge, createCapturePreview, drawPreviewShapes, previewPoint, previewShapes, SHOULDERS_LOST_AFTER, TRACKER_CACHE_PREFIX, nextShoulders, TrackerStartError, cameraProblem, parseTrackerManifest, prepareTrackerFiles, startCapture, trackerFiles, trackerProblem,
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
  assert.deepEqual(Object.keys(frames[0]).sort(), ["hands", "imageHeight", "imageWidth", "pose", "poseRan", "timestampMs"]);
  assert.equal(JSON.stringify(frames).includes("close"), false);
  // Pose runs on every POSE_EVERY-th frame.
  log.poseFlags.forEach((flag, index) => assert.equal(flag, index % POSE_EVERY === 0));
  // Each frame says whether pose ran on it, so a frame without a pose result is not read as "no shoulders".
  frames.forEach((frame, index) => assert.equal(frame.poseRan, log.poseFlags[index]));
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

test("capture: recordings can be started and stopped while the camera keeps running (teaching, card NG-19)", async () => {
  const { environment, log } = fakeEnvironment();
  let seen = 0;
  const started = await startCapture(environment, { onFrame: () => { seen += 1; } });
  await until(() => seen >= 3);
  // Without `record` nothing is kept until a recording starts.
  assert.deepEqual(started.session.stopRecording(), []);
  started.session.startRecording();
  const from = seen;
  await until(() => seen >= from + 5);
  const first = started.session.stopRecording();
  assert.ok(first.length >= 5);
  assert.ok(first.every((frame) => Object.keys(frame).sort().join() === "hands,imageHeight,imageWidth,pose,poseRan,timestampMs"));
  // Stopped: frames flow on, none is kept; the camera still runs.
  const after = seen;
  await until(() => seen >= after + 3);
  assert.deepEqual(started.session.stopRecording(), []);
  assert.equal(log.tracksStopped, 0);
  // A second recording starts empty, and the end of the capture returns what it holds.
  started.session.startRecording();
  const again = seen;
  await until(() => seen >= again + 2);
  const last = started.session.stop();
  assert.ok(last.length >= 2 && last[0].timestampMs > first[first.length - 1].timestampMs);
  assert.equal(log.tracksStopped, 1);
  // After the end nothing starts again.
  started.session.startRecording();
  assert.deepEqual(started.session.stopRecording(), []);

  // With `record` frames are kept from the start; `startRecording` forgets those.
  const kept = fakeEnvironment();
  let count = 0;
  const recording = await startCapture(kept.environment, { record: true, onFrame: () => { count += 1; } });
  try {
    await until(() => count >= 4);
    recording.session.startRecording();
    const mark = count;
    await until(() => count >= mark + 2);
    const fresh = recording.session.stopRecording();
    assert.ok(fresh.length >= 2 && fresh.length <= count - mark);
  } finally {
    recording.session.stop();
  }
});

test("capture bridge: what the caregiver area gets without importing this module", () => {
  // Registered under this global name when the page loads capture.js (not in Node: there is no document).
  assert.equal(CAPTURE_BRIDGE_KEY, "amysEchoCapture");
  assert.equal(globalThis[CAPTURE_BRIDGE_KEY], undefined);
  const bridge = captureBridge();
  assert.equal(typeof bridge.start, "function");
  assert.equal(bridge.text, CAPTURE_TEXT);
  assert.equal(bridge.nextShoulders, nextShoulders);
  assert.equal(bridge.createPreview, createCapturePreview);
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

test("live line: the shoulders stay shown between pose results and go only after two pose results without them", () => {
  let state = { seen: false, posesWithout: 0 };
  // Pose runs on every fifth frame: shoulders found on the first, the next four frames carry no pose.
  const frames = [[true, true], [false, false], [false, false], [false, false], [false, false], [true, true], [false, false]];
  for (const [shoulders, poseRan] of frames) {
    state = nextShoulders(state, shoulders, poseRan);
    assert.equal(state.seen, true);
  }
  // One pose result without shoulders (a single miss) keeps them shown; a second in a row hides them.
  state = nextShoulders(state, false, true);
  assert.equal(state.seen, true);
  state = nextShoulders(state, false, false);
  assert.equal(state.seen, true);
  state = nextShoulders(state, false, true);
  assert.equal(state.seen, false);
  // Seen again: shown at once.
  state = nextShoulders(state, true, true);
  assert.deepEqual(state, { seen: true, posesWithout: 0 });
  // Unknown whether pose ran (older frames): counted as a pose result.
  assert.equal(nextShoulders(nextShoulders({ seen: true, posesWithout: 0 }, false, undefined), false, undefined).seen, false);
  assert.equal(SHOULDERS_LOST_AFTER, 2);
});

// ---------------------------------------------------------------------------
// The live preview (card NG-42): the mirrored picture with the tracked points.

/** A preview sink that records what the capture asks of it. */
function recordingPreview({ throws = false } = {}) {
  const log = { shown: [], drawn: [], closed: 0 };
  const sink = {
    show(stream) { log.shown.push(stream); if (throws) throw new Error("no video"); },
    draw(entry) { log.drawn.push(entry); if (throws) throw new Error("no canvas"); },
    close() { log.closed += 1; },
  };
  return { sink, log };
}

test("preview point: the picture is fitted whole into the box, centred, and flipped left to right", () => {
  // Same aspect: corners map to the box's corners, x mirrored.
  assert.deepEqual(previewPoint(0, 0, 640, 480, 400, 300), [400, 0]);
  assert.deepEqual(previewPoint(1, 1, 640, 480, 400, 300), [0, 300]);
  assert.deepEqual(previewPoint(0.25, 0.5, 640, 480, 400, 300), [300, 150]);
  // A 4:3 picture in a square box: bars above and below (object-fit: contain).
  assert.deepEqual(previewPoint(0, 0, 640, 480, 300, 300), [300, 37.5]);
  assert.deepEqual(previewPoint(1, 1, 640, 480, 300, 300), [0, 262.5]);
  // A picture held upright (3:4) in a 4:3 box: bars left and right.
  assert.deepEqual(previewPoint(0, 0, 480, 640, 400, 300), [312.5, 0]);
  assert.deepEqual(previewPoint(1, 1, 480, 640, 400, 300), [87.5, 300]);
  assert.deepEqual(previewPoint(0.5, 0.5, 480, 640, 400, 300), [200, 150]);
});

test("preview shapes: the child's left hand shows on the left of the mirrored picture in its own colour; no hand draws nothing", () => {
  // Unflipped: the child's left hand is on the right of the camera picture, labelled "Left".
  const both = frame(0, [hand(0.7, 0.6, "Left"), hand(0.3, 0.6, "Right")], pose());
  const shoulders = [{ x: 0.62, y: 0.55 }, { x: 0.38, y: 0.55 }];
  const shapes = previewShapes(both, shoulders, 400, 300);
  assert.deepEqual(shapes.hands.map((entry) => entry.side), ["left", "right"]);
  const [left, right] = shapes.hands;
  assert.equal(left.points.length, HAND_POINTS);
  assert.ok(Math.abs(left.points[0][0] - 120) < 1e-9 && Math.abs(left.points[0][1] - 180) < 1e-9, "left wrist at 1 - 0.7 of the width");
  assert.ok(Math.abs(right.points[0][0] - 280) < 1e-9);
  assert.ok(left.points[0][0] < right.points[0][0], "as in a mirror: the child's left hand on the left");
  // The child's left shoulder (pose 11, on the right of the camera picture) is on the left too.
  assert.ok(Math.abs(shapes.shoulders[0][0] - 152) < 1e-9 && Math.abs(shapes.shoulders[1][0] - 248) < 1e-9);
  assert.notEqual(PREVIEW_COLOURS.left, PREVIEW_COLOURS.right);
  // No hand: nothing to draw, not even the shoulders.
  assert.deepEqual(previewShapes(frame(0, [], pose()), shoulders, 400, 300), { hands: [], shoulders: null });
  // An unusable hand (not 21 points) is not drawn; a frame of no size draws nothing.
  assert.deepEqual(previewShapes(frame(0, [{ landmarks: [{ x: 0.5, y: 0.5 }], label: "Left", score: 1 }]), null, 400, 300).hands, []);
  assert.deepEqual(previewShapes({ ...both, imageWidth: 0 }, null, 400, 300).hands, []);
  // The bones are 21 pairs of the 21 points.
  assert.equal(HAND_CONNECTIONS.length, 21);
  assert.ok(HAND_CONNECTIONS.flat().every((index) => index >= 0 && index < HAND_POINTS));
});

/** A 2D context that records every call and every property it is given. */
function recordingContext() {
  const calls = [];
  const context = new Proxy({}, {
    get: (target, name) => (name in target ? target[name] : (...args) => calls.push([name, ...args])),
    set: (target, name, value) => { target[name] = value; calls.push([`${String(name)}=`, value]); return true; },
  });
  return { context, calls };
}

test("drawing: the canvas is cleared first; hands are drawn in two colours with L and R; without hands it is only cleared", () => {
  const { context, calls } = recordingContext();
  const shapes = previewShapes(frame(0, [hand(0.7, 0.6, "Left"), hand(0.3, 0.6, "Right")]), [{ x: 0.62, y: 0.55 }, { x: 0.38, y: 0.55 }], 400, 300);
  drawPreviewShapes(context, shapes, 400, 300);
  assert.deepEqual(calls[0], ["clearRect", 0, 0, 400, 300]);
  const colours = calls.filter(([name]) => name === "strokeStyle=").map(([, value]) => value);
  assert.ok(colours.includes(PREVIEW_COLOURS.left) && colours.includes(PREVIEW_COLOURS.right) && colours.includes(PREVIEW_COLOURS.shoulders));
  assert.deepEqual(calls.filter(([name]) => name === "fillText").map(([, text]) => text), ["L", "R"]);
  // Every bone of both hands and the shoulder line.
  assert.equal(calls.filter(([name]) => name === "lineTo").length, 2 * HAND_CONNECTIONS.length + 1);
  const empty = recordingContext();
  drawPreviewShapes(empty.context, previewShapes(frame(0, []), null, 400, 300), 400, 300);
  assert.deepEqual(empty.calls, [["clearRect", 0, 0, 400, 300]]);
});

test("capture with a preview: shown once the camera is open, every tracked frame drawn unchanged, closed when the capture stops", async () => {
  const { environment, log } = fakeEnvironment();
  const preview = recordingPreview();
  const seen = [];
  const images = [];
  const detect = environment.startTracker;
  environment.startTracker = async () => {
    const tracker = await detect();
    return { ...tracker, detect: (image, ...rest) => { images.push(image); return tracker.detect(image, ...rest); } };
  };
  const started = await startCapture(environment, { record: true, preview: preview.sink, onFrame: (entry) => seen.push(entry) });
  assert.equal(preview.log.shown.length, 1);
  assert.equal(typeof preview.log.shown[0].getTracks, "function", "the camera's own stream");
  await until(() => seen.length >= 6);
  const frames = started.session.stop();
  assert.equal(preview.log.closed, 1);
  // The tracker frames are the same objects, with the same keys, as without a preview; the preview gets those, nothing more.
  assert.deepEqual(preview.log.drawn, seen.slice(0, preview.log.drawn.length));
  assert.ok(preview.log.drawn.every((entry, index) => entry === seen[index]));
  assert.deepEqual(Object.keys(frames[0]).sort(), ["hands", "imageHeight", "imageWidth", "pose", "poseRan", "timestampMs"]);
  // The tracker still gets the camera's frames as they come (unflipped): the preview takes nothing from them.
  assert.ok(images.length >= 6 && images.every((image) => typeof image.close === "function" && Object.keys(image).join() === "close"));
  // No frame is drawn after the end.
  const drawn = preview.log.drawn.length;
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(preview.log.drawn.length, drawn);
  started.session.stop();
  assert.equal(preview.log.closed, 1);
});

test("capture with a preview: closed on every end (signal, tracker failure, ended camera); never shown when the camera did not open", async () => {
  const aborted = fakeEnvironment();
  const byAbort = recordingPreview();
  const controller = new AbortController();
  let frames = 0;
  await startCapture(aborted.environment, { signal: controller.signal, preview: byAbort.sink, onFrame: () => { frames += 1; } });
  await until(() => frames >= 2);
  controller.abort();
  assert.equal(byAbort.log.closed, 1);

  for (const options of [{ detectFails: true }, { framesUntilEnd: 3 }]) {
    const failing = fakeEnvironment(options);
    const preview = recordingPreview();
    const started = await startCapture(failing.environment, { preview: preview.sink });
    assert.equal((await started.session.ended).kind, "problem");
    assert.deepEqual([preview.log.shown.length, preview.log.closed], [1, 1], JSON.stringify(options));
  }

  const denied = fakeEnvironment({ cameraError: "NotAllowedError" });
  const unseen = recordingPreview();
  assert.deepEqual(await startCapture(denied.environment, { preview: unseen.sink }), { ok: false, problem: "denied" });
  const cancelled = fakeEnvironment();
  cancelled.environment.isVisible = () => false;
  await startCapture(cancelled.environment, { preview: unseen.sink });
  assert.deepEqual(unseen.log, { shown: [], drawn: [], closed: 0 });
});

test("capture with a preview: a failing preview never stops the capture", async () => {
  const { environment, log } = fakeEnvironment();
  const preview = recordingPreview({ throws: true });
  let frames = 0;
  const started = await startCapture(environment, { preview: preview.sink, onFrame: () => { frames += 1; } });
  await until(() => frames >= 5);
  assert.equal(log.tracksStopped, 0);
  started.session.stop();
  assert.equal(preview.log.closed, 1);
});

/** Just enough of a document for the preview: elements with children, a video and a canvas that record what is done to them. */
function previewDocument({ width = 400, height = 300 } = {}) {
  const made = { videos: [], canvases: [] };
  const doc = {
    defaultView: { devicePixelRatio: 2 },
    createElement(tag) {
      const created = {
        tagName: tag, className: "", dataset: {}, children: [], attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        replaceChildren(...nodes) { this.children = nodes; },
      };
      if (tag === "video") {
        Object.assign(created, { paused: true, srcObject: null, play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; } });
        made.videos.push(created);
      }
      if (tag === "canvas") {
        const drawing = recordingContext();
        Object.assign(created, { clientWidth: width, clientHeight: height, width: 300, height: 150, calls: drawing.calls, getContext: () => drawing.context });
        made.canvases.push(created);
      }
      return created;
    },
  };
  return { doc, made };
}

test("browser preview: a mirrored video on the camera's stream and a canvas while it runs; points drawn per frame; emptied when closed", () => {
  const { doc, made } = previewDocument();
  const preview = createCapturePreview(doc);
  assert.equal(preview.element.className, "capture-preview");
  assert.deepEqual(preview.element.children, []);
  assert.equal(preview.element.dataset.camera, "off");
  const stream = { getTracks: () => [] };
  preview.show(stream);
  const [video] = made.videos;
  const [canvas] = made.canvases;
  assert.deepEqual(preview.element.children, [video, canvas]);
  assert.equal(preview.element.dataset.camera, "on");
  assert.equal(video.className, "capture-preview-video", "the class the stylesheet mirrors");
  assert.equal(video.srcObject, stream);
  assert.equal(video.muted, true);
  assert.equal(video.paused, false);
  // A frame with a hand: the canvas takes the box's size in device pixels, is cleared and drawn on.
  preview.draw(frame(0, [hand(0.3, 0.6, "Right")], pose()));
  assert.deepEqual([canvas.width, canvas.height], [800, 600]);
  assert.deepEqual(canvas.calls[0], ["clearRect", 0, 0, 800, 600]);
  assert.ok(canvas.calls.some(([name]) => name === "stroke"));
  // A frame without a pose result keeps the shoulders of the last one.
  canvas.calls.length = 0;
  preview.draw({ ...frame(100, [hand(0.3, 0.6, "Right")]), poseRan: false });
  assert.ok(canvas.calls.some(([name, value]) => name === "strokeStyle=" && value === PREVIEW_COLOURS.shoulders));
  // No hand: the canvas is only cleared.
  canvas.calls.length = 0;
  preview.draw(frame(200, [], pose()));
  assert.deepEqual(canvas.calls, [["clearRect", 0, 0, 800, 600]]);
  // Closed: the video lets go of the stream, and the box is empty.
  preview.close();
  assert.equal(video.srcObject, null);
  assert.equal(video.paused, true);
  assert.deepEqual(preview.element.children, []);
  assert.equal(preview.element.dataset.camera, "off");
  canvas.calls.length = 0;
  preview.draw(frame(300, [hand(0.3, 0.6, "Right")]));
  assert.deepEqual(canvas.calls, [], "nothing is drawn after the end");
  // A box with no size yet draws nothing and does not fail.
  const hidden = previewDocument({ width: 0, height: 0 });
  const unsized = createCapturePreview(hidden.doc);
  unsized.show(stream);
  unsized.draw(frame(0, [hand(0.3, 0.6, "Right")]));
  assert.deepEqual(hidden.made.canvases[0].calls, []);
});

test("the stylesheet mirrors only the shown video, keeps the whole picture, and gives the preview boxes a fixed aspect", async () => {
  const css = await readFile(new URL("styles.css", DIST), "utf8");
  const rule = (selector) => css.split("\n").find((line) => line.startsWith(`${selector} {`)) ?? "";
  // Mirrored with the transform property `scale` (the same as scaleX(-1); the board's stylesheet test keeps "transform" for motion only),
  // and only in a box the preview marks as mirrored: the front camera's (card NG-43).
  assert.equal(rule(".capture-preview-video"), ".capture-preview-video { object-fit: contain; }");
  assert.equal(rule('.capture-preview[data-mirrored="true"] .capture-preview-video'), '.capture-preview[data-mirrored="true"] .capture-preview-video { scale: -1 1; }');
  // Besides the preview only the two views of a demo clip (card NG-56) mirror a video, each only when it is marked as mirrored.
  assert.deepEqual(css.split("\n").filter((line) => !line.startsWith("/*") && line.includes("scale: -1 1")).map((line) => line.slice(0, line.indexOf(" {"))), [
    '.recognise-demo-video[data-mirrored="true"]', '.caregiver-demo-live[data-mirrored="true"]', '.capture-preview[data-mirrored="true"] .capture-preview-video',
  ], "nothing else is mirrored");
  // The canvas is not mirrored: the points are mapped with x → 1 − x, so "L" and "R" read the right way round.
  assert.doesNotMatch(css, /capture-preview-points[^}]*(scale|transform)/);
  assert.match(rule(".capture-preview-video, .capture-preview-points"), /position: absolute; top: 0; left: 0; width: 100%; height: 100%;/);
  assert.match(rule(".caregiver-teach-preview"), /aspect-ratio: 4 \/ 3;/);
  assert.match(rule(".capture-preview-holder"), /aspect-ratio: 4 \/ 3;/);
});

// ---------------------------------------------------------------------------
// Front or back camera (card NG-43).

/** A `localStorage` stand-in; `refuse` makes it throw as a blocked storage does. */
function memoryStorage({ refuse = false } = {}) {
  const items = new Map();
  return {
    items,
    getItem(key) { if (refuse) throw new DOMException("blocked", "SecurityError"); return items.has(key) ? items.get(key) : null; },
    setItem(key, value) { if (refuse) throw new DOMException("full", "QuotaExceededError"); items.set(key, String(value)); },
  };
}

/**
 * A device for `fakeEnvironment`: `cameras` it has ("user", "environment"; a camera without a
 * reported facing, as a desktop webcam or Chromium's fake camera: "unlabelled"), and which of them
 * fail to open. Answers as browsers do: an exact facing it lacks is an OverconstrainedError, a
 * preference takes any camera, no camera at all is NotFoundError.
 */
function cameraDevice({ cameras = ["user", "environment"], busy = [], denied = false } = {}) {
  const { environment, log } = fakeEnvironment();
  log.asked = [];
  log.opened = [];
  environment.getUserMedia = async (constraints) => {
    log.cameraRequests += 1;
    log.asked.push(constraints.video.facingMode);
    if (denied) throw Object.assign(new Error("camera"), { name: "NotAllowedError" });
    if (cameras.length === 0) throw Object.assign(new Error("camera"), { name: "NotFoundError" });
    const wanted = constraints.video.facingMode;
    const exact = typeof wanted === "object" ? wanted.exact : null;
    const camera = exact === null ? (cameras.includes(wanted) ? wanted : cameras[0]) : cameras.find((entry) => entry === exact);
    if (camera === undefined) throw Object.assign(new Error("camera"), { name: "OverconstrainedError" });
    if (busy.includes(camera)) throw Object.assign(new Error("camera"), { name: "NotReadableError" });
    log.opened.push(camera);
    const settings = camera === "unlabelled" ? {} : { facingMode: camera };
    return { getTracks: () => [{ stop() { log.tracksStopped += 1; }, getSettings: () => settings }] };
  };
  return { environment, log };
}

test("camera choice: remembered on the device, the front camera by default and whenever the storage cannot be read", () => {
  assert.equal(CAMERA_FACING_KEY, "amysecho-camera-facing");
  const storage = memoryStorage();
  assert.equal(loadCameraFacing(storage), "user");
  saveCameraFacing(storage, "environment");
  assert.equal(storage.items.get(CAMERA_FACING_KEY), "environment");
  assert.equal(loadCameraFacing(storage), "environment");
  saveCameraFacing(storage, "user");
  assert.equal(loadCameraFacing(storage), "user");
  // Anything else stored there, no storage, or a storage that throws: the front camera, and no error.
  storage.items.set(CAMERA_FACING_KEY, "left");
  assert.equal(loadCameraFacing(storage), "user");
  assert.equal(loadCameraFacing(null), "user");
  const blocked = memoryStorage({ refuse: true });
  assert.equal(loadCameraFacing(blocked), "user");
  assert.doesNotThrow(() => saveCameraFacing(blocked, "environment"));
  assert.doesNotThrow(() => saveCameraFacing(null, "environment"));
});

test("camera choice: the front camera is asked for as before (a preference); the back camera with an exact facing", async () => {
  assert.equal(cameraConstraints("user"), CAMERA_CONSTRAINTS);
  assert.deepEqual(cameraConstraints("environment"), { audio: false, video: { facingMode: { exact: "environment" }, width: { ideal: 640 }, height: { ideal: 480 } } });
  for (const [facing, asked] of [[undefined, "user"], ["user", "user"], ["environment", { exact: "environment" }]]) {
    const { environment, log } = cameraDevice();
    const started = await startCapture(environment, facing === undefined ? {} : { facing });
    assert.ok(started.ok);
    assert.deepEqual(log.asked, [asked]);
    assert.deepEqual(started.camera, { facing: facing ?? "user", fellBack: false });
    started.session.stop();
    assert.equal(log.tracksStopped, 1);
  }
  // A camera that reports no facing (a desktop webcam) is the one asked for: no second request, no message.
  const webcam = cameraDevice({ cameras: ["unlabelled"] });
  const plain = await startCapture(webcam.environment);
  assert.deepEqual([webcam.log.asked, plain.camera], [["user"], { facing: "user", fellBack: false }]);
  plain.session.stop();
});

test("camera choice: a missing or failing camera falls back to the other one and says so; no camera, a refusal or a cancel never asks twice", async () => {
  const run = async (device, options) => {
    const { environment, log } = cameraDevice(device);
    const preview = recordingPreview();
    const started = await startCapture(environment, { ...options, preview: preview.sink });
    if (started.ok) started.session.stop();
    return { started, log, preview };
  };
  // No back camera (a phone without one, a laptop): the front camera, mirrored, with the message.
  const noBack = await run({ cameras: ["user"] }, { facing: "environment" });
  assert.deepEqual(noBack.log.asked, [{ exact: "environment" }, "user"]);
  assert.deepEqual(noBack.started.camera, { facing: "user", fellBack: true });
  assert.equal(CAPTURE_TEXT.cameraFallback.environment, "Hintere Kamera nicht verfügbar. Es läuft die vordere.");
  assert.equal(noBack.log.tracksStopped, 1, "the camera that opened is stopped at the end");
  // A laptop's webcam reports no facing: taken as the front camera.
  const laptop = await run({ cameras: ["unlabelled"] }, { facing: "environment" });
  assert.deepEqual(laptop.started.camera, { facing: "user", fellBack: true });
  // The back camera fails to open (busy): the front one.
  const backBusy = await run({ busy: ["environment"] }, { facing: "environment" });
  assert.deepEqual([backBusy.log.asked, backBusy.started.camera], [[{ exact: "environment" }, "user"], { facing: "user", fellBack: true }]);
  // The front camera fails to open: the back one, unmirrored, with the other message.
  const frontBusy = await run({ busy: ["user"] }, {});
  assert.deepEqual(frontBusy.log.asked, ["user", { exact: "environment" }]);
  assert.deepEqual(frontBusy.started.camera, { facing: "environment", fellBack: true });
  assert.equal(CAPTURE_TEXT.cameraFallback.user, "Vordere Kamera nicht verfügbar. Es läuft die hintere.");
  assert.deepEqual(frontBusy.preview.log.shown.length, 1);
  // A device with only a back camera: the front preference gets it, and it says which it is.
  const backOnly = await run({ cameras: ["environment"] }, {});
  assert.deepEqual([backOnly.log.asked, backOnly.started.camera], [["user"], { facing: "environment", fellBack: true }]);

  // Both fail to open: "busy", the tracker closed, nothing open.
  const bothBusy = await run({ busy: ["user", "environment"] }, { facing: "environment" });
  assert.deepEqual(bothBusy.started, { ok: false, problem: "busy" });
  assert.equal(bothBusy.log.trackerClosed, 1);
  // A desktop webcam that is busy: the other camera does not exist, the answer is still "busy".
  const webcamBusy = await run({ cameras: ["unlabelled"], busy: ["unlabelled"] }, {});
  assert.deepEqual([webcamBusy.log.asked.length, webcamBusy.started], [2, { ok: false, problem: "busy" }]);
  // No camera at all: with the front camera one request (as before), with the back camera two; "no_camera".
  const noneFront = await run({ cameras: [] }, {});
  assert.deepEqual([noneFront.log.cameraRequests, noneFront.started], [1, { ok: false, problem: "no_camera" }]);
  const noneBack = await run({ cameras: [] }, { facing: "environment" });
  assert.deepEqual([noneBack.log.cameraRequests, noneBack.started], [2, { ok: false, problem: "no_camera" }]);
  // Refused: never asked again, for either camera.
  for (const facing of ["user", "environment"]) {
    const refused = await run({ denied: true }, { facing });
    assert.deepEqual([refused.log.cameraRequests, refused.started], [1, { ok: false, problem: "denied" }]);
    assert.equal(refused.preview.log.shown.length, 0);
  }
  // Cancelled while the first request was open: no second request.
  const controller = new AbortController();
  const { environment, log } = cameraDevice({ cameras: ["user"] });
  const first = environment.getUserMedia;
  environment.getUserMedia = async (constraints) => {
    controller.abort();
    return first(constraints);
  };
  assert.deepEqual(await startCapture(environment, { facing: "environment", signal: controller.signal }), { ok: false, cancelled: true });
  assert.deepEqual([log.cameraRequests, log.trackerClosed], [1, 1]);
});

test("camera choice: the bridge uses the device's choice when a view names no camera (the child's gesture view), and the view's own otherwise", async () => {
  const storage = memoryStorage();
  const devices = [];
  const bridge = captureBridge({}, {
    storage: () => storage,
    environment: () => {
      const device = cameraDevice();
      devices.push(device);
      return device.environment;
    },
  });
  const ask = async (options) => {
    const started = await bridge.start({}, options);
    started.session.stop();
    return devices.at(-1).log.asked;
  };
  assert.deepEqual(await ask({}), ["user"]);
  saveCameraFacing(storage, "environment");
  assert.deepEqual(await ask({}), [{ exact: "environment" }]);
  assert.deepEqual(await ask({ facing: "user" }), ["user"]);
});

test("preview: mirrored for the front camera only; the back camera's picture is shown as it comes, like a photo", () => {
  assert.equal(previewMirrored("user"), true);
  assert.equal(previewMirrored(undefined), true, "a camera of unknown facing counts as the front one, as before");
  assert.equal(previewMirrored("environment"), false);
  // Unmirrored: the picture's corners are the box's corners.
  assert.deepEqual(previewPoint(0, 0, 640, 480, 400, 300, false), [0, 0]);
  assert.deepEqual(previewPoint(1, 1, 640, 480, 400, 300, false), [400, 300]);
  assert.deepEqual(previewPoint(0.25, 0.5, 640, 480, 400, 300, false), [100, 150]);
  assert.deepEqual(previewPoint(0, 0, 640, 480, 300, 300, false), [0, 37.5]);
  // The same frame (the child's left hand on the right of the camera picture, labelled "Left").
  const both = frame(0, [hand(0.7, 0.6, "Left"), hand(0.3, 0.6, "Right")], pose());
  const shoulders = [{ x: 0.62, y: 0.55 }, { x: 0.38, y: 0.55 }];
  const front = previewShapes(both, shoulders, 400, 300, true);
  const back = previewShapes(both, shoulders, 400, 300, false);
  // "L" is drawn at the wrist of the child's left hand in both: on the left of a mirror, on the right of a photo of the child.
  const near = (actual, expected) => assert.ok(actual.every((value, index) => Math.abs(value - expected[index]) < 1e-9), `${actual} ≠ ${expected}`);
  assert.deepEqual(front.hands.map((entry) => entry.side), ["left", "right"]);
  assert.deepEqual(back.hands.map((entry) => entry.side), ["left", "right"]);
  near(front.hands.map((entry) => entry.points[0][0]), [120, 280]);
  near(back.hands.map((entry) => entry.points[0][0]), [280, 120]);
  near(back.shoulders.map((point) => point[0]), [248, 152]);
  // Every point of the back camera's drawing is the front camera's flipped back: the same picture, not mirrored.
  front.hands.forEach((entry, index) => entry.points.forEach((point, at) => {
    assert.ok(Math.abs(point[0] - (400 - back.hands[index].points[at][0])) < 1e-9 && point[1] === back.hands[index].points[at][1]);
  }));

  // The browser's preview marks its box for the stylesheet and draws to match.
  const { doc, made } = previewDocument();
  const preview = createCapturePreview(doc);
  const stream = { getTracks: () => [] };
  preview.show(stream, "environment");
  assert.equal(preview.element.dataset.mirrored, "false");
  preview.draw(frame(0, [hand(0.7, 0.6, "Left")], pose()));
  const label = made.canvases[0].calls.find(([name]) => name === "fillText");
  assert.equal(label[1], "L");
  assert.ok(Math.abs(label[2] - 0.7 * 800) < 1e-9);
  preview.show(stream, "user");
  assert.equal(preview.element.dataset.mirrored, "true");
  preview.draw(frame(0, [hand(0.7, 0.6, "Left")], pose()));
  const mirroredLabel = made.canvases[1].calls.find(([name]) => name === "fillText");
  assert.ok(Math.abs(mirroredLabel[2] - 0.3 * 800) < 1e-9);
  preview.show(stream);
  assert.equal(preview.element.dataset.mirrored, "true", "a caller that names no camera gets the mirror, as before");
  preview.close();
  assert.equal(preview.element.dataset.mirrored, undefined);
});

test("capture: the preview is told the camera in use, also after a fallback", async () => {
  for (const [device, facing, shown] of [[{}, "user", "user"], [{}, "environment", "environment"], [{ cameras: ["user"] }, "environment", "user"]]) {
    const { environment } = cameraDevice(device);
    const facings = [];
    const started = await startCapture(environment, { facing, preview: { show: (stream, used) => facings.push(used), draw() {}, close() {} } });
    started.session.stop();
    assert.deepEqual(facings, [shown]);
  }
});

/**
 * The geometry of both cameras, as vectors. A camera's picture, as the sensor delivers it (not
 * mirrored), has its x axis along forward × up. The phone's screen faces along `screen`; the front
 * camera looks along `screen`, the back camera against it.
 */
const cross = ([a, b, c], [d, e, f]) => [b * f - c * e, c * d - a * f, a * e - b * d];
const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const minus = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
function cameraOf(phone, facing) {
  const forward = facing === "user" ? phone.screen : phone.screen.map((value) => 0 - value);
  const up = [0, 1, 0];
  return { at: phone.at, forward, up, right: cross(forward, up) };
}
/** A point in the camera's picture, normalised (0..1), unflipped. */
function project(camera, point) {
  const relative = minus(point, camera.at);
  const depth = dot(relative, camera.forward);
  return { x: 0.5 + 0.8 * dot(relative, camera.right) / depth, y: 0.5 - 0.8 * dot(relative, camera.up) / depth };
}

test("handedness: the child's own left hand gets the same label and slot with the front and the back camera, so no flip is needed", () => {
  // The child stands at the origin and faces +z; with y up, the child's own left is +x.
  const childLeft = [1, 0, 0];
  assert.deepEqual(cross([0, 0, 1], [0, 1, 0]), [-1, 0, 0], "facing +z with y up, the child's right is −x");
  // A parent holds the phone 1.5 m in front of the child. Front camera: the screen faces the child.
  // Back camera: the phone is turned round, its back faces the child. Either way the camera looks at the child.
  const screenToChild = { at: [0, 0, 1.5], screen: [0, 0, -1] };
  const backToChild = { at: [0, 0, 1.5], screen: [0, 0, 1] };
  const front = cameraOf(screenToChild, "user");
  const back = cameraOf(backToChild, "environment");
  assert.deepEqual([front.forward, back.forward], [[0, 0, -1], [0, 0, -1]]);
  // The picture's x axis points to the child's own left in both: the child's left hand is on the right of the picture.
  assert.equal(dot(front.right, childLeft), 1);
  assert.equal(dot(back.right, childLeft), 1);
  // The wrong set-up, as a check that the model can tell: the back camera of a phone whose screen faces the child
  // looks away from the child; and a mirrored picture would put the left hand on the left.
  assert.equal(dot(cameraOf(screenToChild, "environment").forward, [0, 0, -1]), -1);

  // A synthetic child moves its left hand outwards, its right hand stays low; hands made of 21 points
  // around the wrist. MediaPipe labels a hand by its shape on the picture it is given: on an unflipped
  // picture, the subject's own hand ("On unflipped images the label matched the subject's real hand",
  // docs/tracker-decision.md); a mirror image of a left hand looks like a right hand, and is labelled so.
  const wrists = (i) => ({ left: [0.15 + i * 0.01, 0.1, 0], right: [-0.2, -0.15, 0] });
  const trackerOutput = (camera, i, mirroredTrack = false) => ["left", "right"].map((side) => {
    const wrist = wrists(i)[side];
    const points = hand(0, 0, "Left").landmarks.map((offset) => project(camera, [wrist[0] + (offset.x) * 0.5, wrist[1] - (offset.y) * 0.5, wrist[2]]));
    const flip = (point) => (mirroredTrack ? { x: 1 - point.x, y: point.y } : point);
    const label = (side === "left") !== mirroredTrack ? "Left" : "Right";
    return { landmarks: points.map(flip), label, score: 0.95 };
  });
  const recording = (camera, mirroredTrack = false) => capture(20, (i) => trackerOutput(camera, i, mirroredTrack));

  const byFront = recording(front);
  const byBack = recording(back);
  assert.deepEqual(byBack, byFront, "the same picture: the tracker gets the same numbers");
  const framesFront = toLandmarkFrames(byFront);
  const framesBack = toLandmarkFrames(byBack);
  assert.deepEqual(framesBack, framesFront);
  // "left" holds the child's own left hand: the one that moves, on the right of the picture.
  assert.ok(framesFront.every((entry) => entry.left[0][0] > entry.right[0][0]));
  assert.ok(framesFront.at(-1).left[0][0] > framesFront[0].left[0][0]);
  const builtFront = buildFeatureSequence(framesFront);
  const builtBack = buildFeatureSequence(framesBack);
  assert.ok(builtFront.ok && builtBack.ok);
  assert.deepEqual(builtBack.sequence, builtFront.sequence, "an example taught with one camera is the same as one taught with the other");

  // A device that mirrors its track (a device-trial item): the labels swap with the picture, the hands
  // come out in the other slots, and only `inputMirrored` would put them back. Nothing here detects it.
  const mirrored = recording(back, true);
  const wrong = toLandmarkFrames(mirrored);
  // The moving hand (the child's own left) is now in the "right" slot, and the still one in "left".
  assert.equal(wrong.at(-1).left[0][0], wrong[0].left[0][0]);
  assert.notEqual(wrong.at(-1).right[0][0], wrong[0].right[0][0]);
  assert.notDeepEqual(buildFeatureSequence(wrong).sequence, builtFront.sequence);
  const corrected = toLandmarkFrames(mirrored, { inputMirrored: true });
  corrected.forEach((entry, index) => {
    for (const side of ["left", "right"]) {
      entry[side].forEach((point, at) => assert.ok(Math.abs(point[0] - framesFront[index][side][at][0]) < 1e-9));
    }
  });
});

test("handedness: the capture path does nothing by camera: the same tracker answers give the same recorded frames with either camera", async () => {
  const recordings = [];
  for (const facing of ["user", "environment"]) {
    const { environment, log } = cameraDevice();
    let count = 0;
    const images = [];
    environment.startTracker = async () => ({
      async detect(image, timestampMs, withPose) {
        images.push(Object.keys(image).join());
        image.close();
        // Frame by frame the same answer: a left hand on the right of the picture.
        return { hands: [hand(0.7, 0.5 - (count++) * 0.01, "Left")], pose: withPose ? pose() : null };
      },
      close() { log.trackerClosed += 1; },
    });
    const started = await startCapture(environment, { facing, record: true, onFrame: () => undefined });
    await until(() => count >= 8);
    const frames = started.session.stop().slice(0, 8);
    assert.ok(images.every((keys) => keys === "close"), "the tracker gets the camera's frame as it is, with either camera");
    recordings.push(frames.map(({ hands, poseRan }) => ({ hands, poseRan })));
  }
  assert.deepEqual(recordings[1], recordings[0]);
  const [front, back] = recordings.map((frames) => toLandmarkFrames(frames.map((entry, index) => ({ ...entry, timestampMs: index * 66, imageWidth: WIDTH, imageHeight: HEIGHT, pose: null }))));
  assert.deepEqual(back, front);
  assert.ok(front.every((entry) => entry.left !== null && entry.right === null));
});

/** Just enough of a document for the camera test's entry: elements with children, buttons that click, and an address. */
function entryDocument(hash = CAPTURE_ROUTE) {
  const listeners = {};
  const make = (tag) => {
    const handlers = {};
    const node = {
      tagName: tag, className: "", textContent: "", hidden: false, disabled: false, dataset: {}, children: [], attributes: {},
      setAttribute(name, value) { this.attributes[name] = String(value); },
      replaceChildren(...nodes) { this.children = nodes; },
      append(...nodes) { this.children.push(...nodes); },
      remove() {},
      addEventListener(type, handler) { handlers[type] = handler; },
      click() { handlers.click?.(); },
    };
    if (tag === "video") Object.assign(node, { play: () => Promise.resolve(), pause() {}, srcObject: null });
    if (tag === "canvas") Object.assign(node, { clientWidth: 0, clientHeight: 0, getContext: () => null });
    return node;
  };
  const doc = {
    createElement: make,
    addEventListener(type, handler) { listeners[type] = handler; },
    defaultView: { location: { hash, pathname: "/", search: "" }, addEventListener() {}, history: { replaceState() {} }, devicePixelRatio: 1 },
  };
  return { doc, region: make("section") };
}

test("camera test: 'Kamera: vorne / hinten' above 'Kamera starten', remembered on the device, locked while the camera runs; a fallback is said in the status line", async () => {
  const storage = memoryStorage();
  const devices = [];
  const { doc, region } = entryDocument();
  mountCaptureEntry(doc, region, {}, () => storage, () => {
    const device = cameraDevice({ cameras: ["user"] });
    devices.push(device);
    return device.environment;
  });
  const [, , choice, start] = region.children;
  assert.equal(choice.className, "camera-choice");
  assert.equal(choice.attributes.role, "group");
  const [label, front, back] = choice.children;
  assert.deepEqual([label.textContent, front.textContent, back.textContent], ["Kamera:", "vorne", "hinten"]);
  assert.equal(start.textContent, "Kamera starten");
  assert.deepEqual([front.attributes["aria-pressed"], back.attributes["aria-pressed"]], ["true", "false"]);
  back.click();
  assert.deepEqual([front.attributes["aria-pressed"], back.attributes["aria-pressed"]], ["false", "true"]);
  assert.equal(storage.items.get(CAMERA_FACING_KEY), "environment");
  start.click();
  assert.equal(front.disabled && back.disabled, true, "no change while the camera starts or runs");
  front.click();
  assert.equal(storage.items.get(CAMERA_FACING_KEY), "environment");
  await until(() => region.dataset.captureStep === "running" && region.children[5].textContent !== CAPTURE_TEXT.running);
  assert.deepEqual(devices[0].log.asked, [{ exact: "environment" }, "user"]);
  const status = region.children.find((node) => node.className === "capture-status");
  assert.equal(status.textContent, "Hintere Kamera nicht verfügbar. Es läuft die vordere.");
  // "Kamera stoppen": the camera off, the choice free again.
  region.children.find((node) => node.className === "capture-stop").click();
  await until(() => region.dataset.captureStep === "stopped");
  assert.equal(devices[0].log.tracksStopped, 1);
  assert.equal(front.disabled || back.disabled, false);
  front.click();
  assert.equal(loadCameraFacing(storage), "user");
});

test("camera choice: `fallback: false` (the child's gesture view) never tries the other camera", async () => {
  for (const [device, problem] of [[{ busy: ["user"] }, "busy"], [{ cameras: ["environment"], busy: ["environment"] }, "busy"]]) {
    const { environment, log } = cameraDevice(device);
    assert.deepEqual(await startCapture(environment, { facing: "user", fallback: false }), { ok: false, problem });
    assert.deepEqual([log.asked, log.trackerClosed], [["user"], 1]);
  }
});

test("browser preview without video (card NG-49): only the points on the box, never a video element; mirrored for the front camera only", () => {
  const { doc, made } = previewDocument();
  const preview = createCapturePreview(doc, { video: false });
  assert.equal(preview.element.dataset.picture, "points");
  const stream = { getTracks: () => [] };
  preview.show(stream, "user");
  assert.equal(made.videos.length, 0, "the stream is never put into a video element");
  const [canvas] = made.canvases;
  assert.deepEqual(preview.element.children, [canvas]);
  assert.equal(preview.element.dataset.camera, "on");
  assert.equal(preview.element.dataset.mirrored, "true");
  preview.draw(frame(0, [hand(0.3, 0.6, "Right")], pose()));
  assert.ok(canvas.calls.some(([name]) => name === "stroke"), "the hand is drawn as with the video");
  // The back camera: not mirrored, as in a photo app.
  preview.show(stream, "environment");
  assert.equal(made.videos.length, 0);
  assert.equal(preview.element.dataset.mirrored, "false");
  preview.close();
  assert.deepEqual(preview.element.children, []);
  assert.equal(preview.element.dataset.camera, "off");
  // The default keeps the video (teaching and the camera test).
  const withVideo = createCapturePreview(doc);
  assert.equal(withVideo.element.dataset.picture, "video");
  withVideo.show(stream, "user");
  assert.equal(made.videos.length, 1);
});

test("browser preview: setVideo switches the camera picture off and on while it runs, on the same stream; the points stay (card NG-52)", () => {
  const { doc, made } = previewDocument();
  const preview = createCapturePreview(doc);
  const stream = { getTracks: () => [] };
  preview.show(stream, "user");
  const [first] = made.videos;
  const [canvas] = made.canvases;
  assert.deepEqual(preview.element.children, [first, canvas]);
  preview.setVideo(false);
  assert.deepEqual(preview.element.children, [canvas], "points only");
  assert.equal(preview.element.dataset.picture, "points");
  assert.equal(first.srcObject, null, "the hidden picture lets go of the stream");
  assert.equal(first.paused, true);
  preview.draw(frame(0, [hand(0.3, 0.6, "Right")], pose()));
  assert.ok(canvas.calls.some(([name]) => name === "stroke"), "the hand is still drawn");
  preview.setVideo(true);
  const second = made.videos[1];
  assert.deepEqual(preview.element.children, [second, canvas], "the picture under the same canvas");
  assert.equal(second.srcObject, stream, "the same stream: the camera was not restarted");
  assert.equal(preview.element.dataset.picture, "video");
  // Before show and after close there is nothing to switch, but the choice holds for the next show.
  preview.close();
  preview.setVideo(false);
  assert.deepEqual(preview.element.children, []);
  preview.show(stream, "user");
  assert.equal(made.videos.length, 2, "no video after 'Bild aus' was chosen");
  assert.deepEqual(preview.element.children, [made.canvases[1]]);
});
