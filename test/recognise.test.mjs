// Recognising a gesture on the board (card NG-20, docs/recognise.md): the controller in Node
// with the real capture path (`startCapture`) on a fake camera and tracker, a clock and timers
// moved by hand, and the view on a fake document with the real board.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEMO_SLOW_RATE, RECOGNISE_DEMO_MIRROR_KEY, RECOGNISE_DEMO_SLOW_KEY,
  CAPTURE_BRIDGE_KEY, MAX_CANDIDATES, MAX_TAKEN, RECOGNISE_IDLE_MS, RECOGNISE_FACING_KEY, RECOGNISE_PICTURE_KEY, RECOGNISE_COUNTDOWN_S, RECOGNISE_GUARD_MS, RECOGNISE_MAX_RECORDING_MS, RECOGNISE_SECONDS, RECOGNISE_TEXT, SEEN_HOLD_MS,
  analyseAttempt, attachRecognise, createRecogniser, handsSeen,
} from "../dist/recognise/recognise.js";
import { BOARD_SHIELD_MS, GESTURE_LABEL, GESTURE_SHIELD_MS, mountBoard } from "../dist/board.js";
import { CAMERA_FACING_KEY, CAPTURE_BRIDGE_KEY as CAPTURE_MODULE_KEY, CAPTURE_TEXT, captureBridge, nextShoulders, startCapture } from "../dist/capture/capture.js";
import { sequenceFromRecording } from "../dist/recognition/examples.js";
import { HAND_POINTS } from "../dist/recognition/features.js";

const turn = () => new Promise((resolve) => setImmediate(resolve));
const settle = async () => { for (let i = 0; i < 30; i += 1) await turn(); };

// --- Synthetic tracker output (no child data: made-up numbers) ---

/** A tracker hand: 21 normalised points around a wrist at (x, y). */
function trackerHand(x, y, label) {
  const landmarks = Array.from({ length: HAND_POINTS }, (_, index) => {
    if (index === 0) return { x, y };
    const finger = Math.floor((index - 1) / 4);
    return { x: x + (finger - 2) * 0.02, y: y - ((index - 1) % 4 + 1) * 0.024 };
  });
  return { landmarks, label, score: 0.95 };
}
const POSE = Array.from({ length: 33 }, (_, index) => ({ x: index === 11 ? 0.62 : index === 12 ? 0.38 : 0.5, y: 0.55, visibility: 0.99 }));
/** Three made-up gestures: the right hand moves right, the right hand moves up, both hands move apart. */
const MOVES_RIGHT = (i) => [trackerHand(0.3 + i * 0.012, 0.5, "Right")];
const MOVES_UP = (i) => [trackerHand(0.45, 0.75 - i * 0.012, "Right")];
const BOTH_APART = (i) => [trackerHand(0.45 - i * 0.008, 0.5, "Right"), trackerHand(0.55 + i * 0.008, 0.5, "Left")];

/** Tracker frames of one capture of `hands(i)`, 100 ms apart, as the capture path delivers them. */
function frames(hands, count = 20, wobble = 0) {
  return Array.from({ length: count }, (_, i) => ({
    timestampMs: i * 100, imageWidth: 640, imageHeight: 480, poseRan: i % 5 === 0, pose: i % 5 === 0 ? POSE : null,
    hands: hands(i).map((hand) => ({ ...hand, landmarks: hand.landmarks.map((point) => ({ x: point.x + wobble * Math.sin(i), y: point.y })) })),
  }));
}
function example(conceptId, hands, wobble = 0) {
  const recording = sequenceFromRecording(frames(hands, 20, wobble));
  assert.ok(recording.ok, `synthetic example of ${conceptId} not usable`);
  return { conceptId, sequence: recording.sequence };
}

// --- The real capture path on a fake camera and tracker ---

/**
 * `startCapture` with a fake tracker and camera; `feed` hands one frame in and waits until it is tracked.
 * With `storage` (the device's camera choice, card NG-43) the bridge is the capture module's own
 * `captureBridge` on this camera, which reads the choice; `noBackCamera`: a device with a front camera only.
 */
function fakeCamera({ cameraError = null, holdTracker = false, storage = null, noBackCamera = false } = {}) {
  const log = { trackerStarts: 0, cameraRequests: 0, tracksStopped: 0, trackerClosed: 0, sourceClosed: 0, hosts: [], facings: [], asked: [] };
  let waiting = [];
  let queued = [];
  let t = 0;
  let release = () => undefined;
  const environment = {
    async startTracker(signal) {
      log.trackerStarts += 1;
      if (holdTracker) {
        await new Promise((resolve, reject) => {
          release = resolve;
          signal?.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), { once: true });
        });
      }
      return {
        async detect(image, timestampMs, pose) { return { hands: image.hands, pose: pose ? POSE : null }; },
        close() { log.trackerClosed += 1; },
      };
    },
    async getUserMedia(constraints) {
      log.cameraRequests += 1;
      log.asked.push(constraints.video.facingMode);
      if (cameraError !== null) throw Object.assign(new Error("camera"), { name: cameraError });
      const back = constraints.video.facingMode?.exact === "environment";
      if (back && noBackCamera) throw Object.assign(new Error("camera"), { name: "OverconstrainedError" });
      const facingMode = back ? "environment" : "user";
      return { getTracks: () => [{ stop() { log.tracksStopped += 1; }, getSettings: () => ({ facingMode }) }] };
    },
    async openFrames() {
      return {
        next: () => (queued.length > 0 ? Promise.resolve(queued.shift()) : new Promise((resolve) => waiting.push(resolve))),
        close() {
          log.sourceClosed += 1;
          for (const resolve of waiting) resolve(null);
          waiting = [];
        },
      };
    },
  };
  const bridge = storage === null
    ? {
      start(host, options) {
        log.hosts.push(host);
        log.facings.push(options.facing);
        return startCapture(environment, options);
      },
      text: CAPTURE_TEXT,
      nextShoulders,
    }
    : captureBridge({}, { storage: () => storage, environment: (host) => { log.hosts.push(host); return environment; } });
  if (storage !== null) {
    const start = bridge.start;
    bridge.start = (host, options) => { log.facings.push(options.facing); return start(host, options); };
  }
  return {
    bridge, log,
    releaseTracker: () => release(),
    async feed(hands) {
      t += 100;
      const frame = { image: { hands, close() {} }, timestampMs: t, width: 640, height: 480 };
      const resolve = waiting.shift();
      if (resolve === undefined) queued.push(frame);
      else resolve(frame);
      for (let i = 0; i < 5; i += 1) await turn();
    },
    async feedAll(hands, count = 20) { for (let i = 0; i < count; i += 1) await this.feed(hands(i)); },
    /** The camera is on: requested and not stopped. */
    get running() { return log.cameraRequests > log.tracksStopped; },
    /** The camera stops delivering frames, as when another app takes it. */
    fail() {
      for (const resolve of waiting) resolve(null);
      waiting = [];
    },
  };
}

/** A clock and timers that only move when the test moves them. */
function fakeTime() {
  const timers = [];
  const clock = { t: 10_000 };
  return {
    clock,
    now: () => clock.t,
    setTimer(callback, milliseconds) {
      const timer = { callback, at: clock.t + milliseconds, cancelled: false, done: false };
      timers.push(timer);
      return () => { timer.cancelled = true; };
    },
    /** Moves the clock, running each timer that comes due on the way. */
    advance(milliseconds) {
      const end = clock.t + milliseconds;
      for (;;) {
        const due = timers.filter((timer) => !timer.cancelled && !timer.done && timer.at <= end).sort((a, b) => a.at - b.at)[0];
        if (due === undefined) break;
        clock.t = due.at;
        due.done = true;
        due.callback();
      }
      clock.t = end;
    },
    pending: () => timers.filter((timer) => !timer.cancelled && !timer.done).length,
  };
}

const ON_BOARD = new Set(["trinken", "hilfe", "mehr", "pause", "fertig"]);

/** A recogniser on a fake camera with an analysis the test decides (`outcome`), or the real one. */
function setup({ camera = fakeCamera(), outcome, examples = [], onBoard = ON_BOARD, bridge, stillShown } = {}) {
  const time = fakeTime();
  const spoken = [];
  const states = [];
  const analysed = [];
  const host = { host: true };
  const recogniser = createRecogniser({
    examples, onBoard,
    bridge: bridge ?? (() => camera.bridge),
    host: () => host,
    setTimer: time.setTimer,
    now: time.now,
    speak: (conceptId) => spoken.push(conceptId),
    onChange: (state) => states.push(state),
    ...(stillShown === undefined ? {} : { stillShown }),
    ...(outcome === undefined ? {} : { analyse: (recorded) => { analysed.push(recorded); return typeof outcome === "function" ? outcome(recorded) : outcome; } }),
  });
  return { recogniser, camera, time, spoken, states, analysed, host, kind: () => recogniser.state().kind };
}

/** Starts and runs the countdown; resolves when frames are kept. */
async function toRecording(context) {
  context.recogniser.start();
  await settle();
  assert.equal(context.kind(), "countdown");
  context.time.advance(RECOGNISE_COUNTDOWN_S * 1000);
  assert.equal(context.kind(), "recording");
}

/** A whole attempt: countdown, `count` frames of `hands`, "Stopp" after the guard. */
async function attempt(context, hands = MOVES_RIGHT, count = 20) {
  await toRecording(context);
  await context.camera.feedAll(hands, count);
  context.time.advance(RECOGNISE_GUARD_MS);
  context.recogniser.finish();
}

const MATCH = { kind: "match", conceptId: "trinken", hands: "right" };

test("CAPTURE_BRIDGE_KEY is the same string here and in the capture module", () => {
  assert.equal(CAPTURE_BRIDGE_KEY, CAPTURE_MODULE_KEY);
});

test("start: no camera before the tap; then tracker, camera, a countdown of three seconds, and only then frames are kept", async () => {
  const context = setup({ outcome: MATCH });
  const { recogniser, camera, time, states } = context;
  assert.equal(context.kind(), "idle");
  assert.equal(camera.log.cameraRequests, 0);
  recogniser.start();
  assert.deepEqual(states[0], { kind: "starting", line: CAPTURE_TEXT.preparing });
  await settle();
  assert.equal(camera.log.cameraRequests, 1);
  assert.deepEqual(camera.log.hosts, [context.host], "the hidden video goes into the view");
  assert.deepEqual(recogniser.state(), { kind: "countdown", left: 3 });
  // Frames during the countdown are not part of the attempt: the hand that tapped is leaving the picture.
  await camera.feed(MOVES_UP(0));
  time.advance(1000);
  assert.deepEqual(recogniser.state(), { kind: "countdown", left: 2 });
  await camera.feed(MOVES_UP(1));
  time.advance(1000);
  assert.deepEqual(recogniser.state(), { kind: "countdown", left: 1 });
  time.advance(999);
  assert.equal(context.kind(), "countdown");
  time.advance(1);
  assert.equal(context.kind(), "recording");
  await camera.feedAll(MOVES_RIGHT, 4);
  time.advance(RECOGNISE_GUARD_MS);
  recogniser.finish();
  assert.equal(context.analysed.length, 1);
  assert.equal(context.analysed[0].length, 4, "only the frames of the recording");
  assert.deepEqual(context.analysed[0].map((frame) => frame.hands[0].landmarks[0].x), [0, 1, 2, 3].map((i) => MOVES_RIGHT(i)[0].landmarks[0].x));
  assert.deepEqual(recogniser.state(), { kind: "confirm", conceptId: "trinken", hands: "right" });
  assert.equal(camera.running, false, "the camera stops after the attempt");
  assert.equal(camera.log.trackerClosed, 1);
  assert.equal(time.pending(), 0);
  assert.deepEqual(context.spoken, [], "nothing spoken before the confirming tap");
});

test("the countdown texts are those of teaching", () => {
  assert.equal(RECOGNISE_TEXT.countdown(3), "Gleich geht’s los: 3");
  assert.equal(RECOGNISE_TEXT.countdown(2), "Gleich geht’s los: 3 … 2");
  assert.equal(RECOGNISE_TEXT.countdown(1), "Gleich geht’s los: 3 … 2 … 1");
});

test("countdown cancel: 'Zurück zur Tafel' during the countdown stops the camera, records nothing and speaks nothing", async () => {
  const context = setup({ outcome: MATCH });
  context.recogniser.start();
  await settle();
  context.time.advance(1000);
  assert.equal(context.kind(), "countdown");
  context.recogniser.back();
  assert.equal(context.kind(), "idle");
  assert.equal(context.camera.running, false);
  assert.equal(context.camera.log.trackerClosed, 1);
  assert.equal(context.time.pending(), 0, "the countdown's timer is cancelled");
  context.time.advance(10_000);
  await settle();
  assert.equal(context.kind(), "idle");
  assert.deepEqual(context.analysed, []);
  assert.deepEqual(context.spoken, []);
});

test("leaving while the tracker loads: no camera request ever, and nothing left running", async () => {
  const camera = fakeCamera({ holdTracker: true });
  const context = setup({ camera, outcome: MATCH });
  context.recogniser.start();
  await settle();
  assert.equal(context.kind(), "starting");
  context.recogniser.back();
  await settle();
  camera.releaseTracker();
  await settle();
  assert.equal(camera.log.cameraRequests, 0);
  assert.equal(context.kind(), "idle");
  assert.deepEqual(context.spoken, []);
});

test("the time limit ends the recording by itself", async () => {
  const context = setup({ outcome: MATCH });
  await toRecording(context);
  await context.camera.feedAll(MOVES_RIGHT, 3);
  context.time.advance(RECOGNISE_MAX_RECORDING_MS - 1);
  assert.equal(context.kind(), "recording");
  context.time.advance(1);
  assert.equal(context.kind(), "confirm");
  assert.equal(context.analysed[0].length, 3);
  assert.equal(context.camera.running, false);
});

test("'Ja, sagen' speaks the concept exactly once; the view is gone first", async () => {
  const context = setup({ outcome: MATCH });
  await attempt(context);
  context.time.advance(RECOGNISE_GUARD_MS);
  context.recogniser.confirm();
  context.recogniser.confirm();
  context.recogniser.choose("trinken");
  assert.deepEqual(context.spoken, ["trinken"]);
  assert.equal(context.kind(), "idle");
  assert.equal(context.states.at(-1).kind, "idle");
});

test("'Nein' and 'Zurück zur Tafel' on the confirm view speak nothing", async () => {
  for (const leave of ["reject", "back"]) {
    const context = setup({ outcome: MATCH });
    await attempt(context);
    context.time.advance(RECOGNISE_GUARD_MS);
    context.recogniser[leave]();
    assert.equal(context.kind(), "idle", leave);
    context.recogniser.confirm();
    assert.deepEqual(context.spoken, [], leave);
    assert.equal(context.camera.running, false);
  }
});

test("press guard: a press that began before the view appeared, or too soon after, does nothing", async () => {
  const context = setup({ outcome: MATCH });
  await toRecording(context);
  const recordingShownAt = context.time.now();
  context.recogniser.finish(recordingShownAt - 50);
  context.recogniser.finish(recordingShownAt + RECOGNISE_GUARD_MS - 1);
  assert.equal(context.kind(), "recording", "'Stopp' right after it appeared");
  context.time.advance(RECOGNISE_GUARD_MS);
  context.recogniser.finish();
  assert.equal(context.kind(), "confirm");
  // "Ja, sagen" can be where "Stopp" was: the second tap of a double tap must not speak.
  const shownAt = context.time.now();
  context.recogniser.confirm(shownAt);
  context.recogniser.confirm(shownAt - 1);
  context.time.advance(RECOGNISE_GUARD_MS - 1);
  context.recogniser.confirm();
  context.recogniser.reject();
  assert.deepEqual(context.spoken, []);
  assert.equal(context.kind(), "confirm");
  // "Zurück" is never guarded: the way back always works.
  context.recogniser.back();
  assert.equal(context.kind(), "idle");
});

test("unknown never speaks: at most three candidates on the board; a tap on one only asks, 'Ja, sagen' then speaks it once, 'Nein' returns to the candidates", async () => {
  const outcome = { kind: "unknown", reason: "ambiguous", candidates: ["mehr", "nicht-da", "hilfe", "pause", "fertig"], hands: "right" };
  const context = setup({ outcome });
  await attempt(context);
  assert.deepEqual(context.recogniser.state(), { kind: "unknown", reason: "ambiguous", candidates: ["mehr", "hilfe", "pause"], hands: "right" });
  assert.ok(MAX_CANDIDATES === 3);
  context.time.advance(RECOGNISE_GUARD_MS);
  context.recogniser.confirm();
  context.recogniser.reject();
  context.recogniser.choose("fertig");
  context.recogniser.choose("nicht-da");
  assert.deepEqual(context.spoken, [], "nothing that was not offered, no confirm on unknown");
  assert.equal(context.kind(), "unknown");
  const unknown = context.recogniser.state();
  context.recogniser.choose("hilfe");
  assert.deepEqual(context.spoken, [], "a candidate tap speaks nothing");
  assert.deepEqual(context.recogniser.state(), { kind: "confirm", conceptId: "hilfe", hands: "right", from: unknown });
  // The confirm view of the candidate has its own guard: the second tap of a double tap does nothing.
  context.recogniser.confirm();
  context.recogniser.reject();
  assert.equal(context.kind(), "confirm");
  context.time.advance(RECOGNISE_GUARD_MS);
  context.recogniser.reject();
  assert.equal(context.recogniser.state(), unknown, "'Nein' goes back to the candidates");
  assert.deepEqual(context.spoken, []);
  context.time.advance(RECOGNISE_GUARD_MS);
  context.recogniser.choose("pause");
  context.time.advance(RECOGNISE_GUARD_MS);
  context.recogniser.confirm();
  context.recogniser.confirm();
  assert.deepEqual(context.spoken, ["pause"]);
  assert.equal(context.kind(), "idle");

  const back = setup({ outcome });
  await attempt(back);
  back.time.advance(RECOGNISE_GUARD_MS);
  back.recogniser.back();
  assert.deepEqual(back.spoken, []);
});

test("a match for a concept that is not on the board is never confirmed", async () => {
  const context = setup({ outcome: { kind: "match", conceptId: "nicht-da", hands: "right" } });
  await attempt(context);
  assert.deepEqual(context.recogniser.state(), { kind: "unknown", reason: "too_far", candidates: [], hands: "right" });
});

test("an unusable recording is refused with its reason; 'Nochmal' records again after the guard", async () => {
  let count = 0;
  const context = setup({ outcome: () => (count++ === 0 ? { kind: "unusable", reason: "hands_unclear" } : MATCH) });
  await attempt(context);
  assert.deepEqual(context.recogniser.state(), { kind: "unusable", reason: "hands_unclear" });
  assert.equal(context.camera.running, false);
  context.recogniser.start();
  assert.equal(context.kind(), "unusable", "'Nochmal' right after the view appeared");
  context.time.advance(RECOGNISE_GUARD_MS);
  context.recogniser.start();
  await settle();
  assert.equal(context.kind(), "countdown");
  assert.equal(context.camera.log.cameraRequests, 2);
  for (const reason of ["no_frames", "bad_timestamps", "bad_landmarks", "no_hands", "too_short", "hands_unclear", "hand_lost"]) {
    assert.ok(RECOGNISE_TEXT.unusable[reason].length > 0 && RECOGNISE_TEXT.unusable[reason].length <= 40, reason);
  }
});

test("camera problems: no bridge, a refused camera, a camera that fails while recording; the camera is off and nothing is spoken", async () => {
  const none = setup({ bridge: () => null, outcome: MATCH });
  none.recogniser.start();
  assert.deepEqual(none.recogniser.state(), { kind: "problem", line: RECOGNISE_TEXT.noCamera });

  const refused = setup({ camera: fakeCamera({ cameraError: "NotAllowedError" }), outcome: MATCH });
  refused.recogniser.start();
  await settle();
  assert.deepEqual(refused.recogniser.state(), { kind: "problem", line: RECOGNISE_TEXT.problems.denied });
  assert.equal(refused.camera.log.trackerClosed, 1);

  const failing = setup({ outcome: MATCH });
  await toRecording(failing);
  await failing.camera.feed(MOVES_RIGHT(0));
  failing.camera.fail();
  await settle();
  assert.deepEqual(failing.recogniser.state(), { kind: "problem", line: RECOGNISE_TEXT.problems.busy });
  assert.equal(failing.camera.log.trackerClosed, 1);
  assert.equal(failing.time.pending(), 0);
  assert.deepEqual([...none.spoken, ...refused.spoken, ...failing.spoken], []);
});

test("the attempt ends when the board is no longer on screen (the caregiver area opened), at the next frame or tick", async () => {
  let shown = true;
  const context = setup({ outcome: MATCH, stillShown: () => shown });
  await toRecording(context);
  shown = false;
  await context.camera.feed(MOVES_RIGHT(0));
  assert.equal(context.kind(), "idle");
  assert.equal(context.camera.running, false);
  assert.deepEqual(context.analysed, []);

  let visible = true;
  const ticking = setup({ outcome: MATCH, stillShown: () => visible });
  ticking.recogniser.start();
  await settle();
  visible = false;
  ticking.time.advance(1000);
  assert.equal(ticking.kind(), "idle");
  assert.equal(ticking.camera.running, false);
});

test("dispose (the board is replaced) stops the camera at every step and draws nothing", async () => {
  for (const step of ["starting", "countdown", "recording", "confirm"]) {
    const camera = fakeCamera({ holdTracker: step === "starting" });
    const context = setup({ camera, outcome: MATCH });
    context.recogniser.start();
    await settle();
    if (step === "countdown" || step === "recording" || step === "confirm") assert.equal(context.kind(), "countdown");
    if (step === "recording" || step === "confirm") context.time.advance(RECOGNISE_COUNTDOWN_S * 1000);
    if (step === "confirm") {
      context.time.advance(RECOGNISE_GUARD_MS);
      context.recogniser.finish();
    }
    const drawn = context.states.length;
    context.recogniser.dispose();
    camera.releaseTracker();
    await settle();
    assert.equal(context.camera.running, false, step);
    assert.equal(context.states.length, drawn, `${step}: drawn after dispose`);
    assert.equal(context.time.pending(), 0, step);
    context.recogniser.start();
    context.recogniser.confirm(context.time.now() + 10_000);
    await settle();
    assert.equal(camera.log.cameraRequests, step === "starting" ? 0 : 1, step);
    assert.deepEqual(context.spoken, [], step);
  }
});

test("the real analysis: one-hand and two-hand attempts are matched against examples of the same kind", () => {
  const examples = [
    example("trinken", MOVES_RIGHT), example("trinken", MOVES_RIGHT, 0.002),
    example("hilfe", MOVES_UP), example("hilfe", MOVES_UP, 0.002),
    example("mehr", BOTH_APART), example("mehr", BOTH_APART, 0.002),
  ];
  assert.deepEqual(analyseAttempt(frames(MOVES_RIGHT, 20, 0.001), examples), { kind: "match", conceptId: "trinken", hands: "right" });
  assert.deepEqual(analyseAttempt(frames(MOVES_UP, 20, 0.001), examples), { kind: "match", conceptId: "hilfe", hands: "right" });
  assert.deepEqual(analyseAttempt(frames(BOTH_APART, 20, 0.001), examples), { kind: "match", conceptId: "mehr", hands: "both" });
  // A two-hand attempt against one-hand examples only: nothing comparable, no candidate.
  const oneHand = examples.filter((entry) => entry.conceptId !== "mehr");
  assert.deepEqual(analyseAttempt(frames(BOTH_APART, 20, 0.001), oneHand), { kind: "unknown", reason: "other_hands", candidates: [], hands: "both" });
  // A one-hand attempt against two-hand examples only: the same.
  assert.equal(analyseAttempt(frames(MOVES_RIGHT), examples.filter((entry) => entry.conceptId === "mehr")).reason, "other_hands");
  // A movement that was not taught: unknown, with the taught concepts of its kind as candidates.
  const other = analyseAttempt(frames((i) => [trackerHand(0.7 - i * 0.012, 0.3 + i * 0.012, "Right")]), examples);
  assert.equal(other.kind, "unknown");
  assert.deepEqual([...other.candidates].sort(), ["hilfe", "trinken"]);
  // Too few frames: refused.
  assert.deepEqual(analyseAttempt(frames(MOVES_RIGHT, 2), examples), { kind: "unusable", reason: "too_short" });
  assert.deepEqual(analyseAttempt([], examples), { kind: "unusable", reason: "no_frames" });
});

test("the controller with the real analysis: the profile's examples decide, examples of concepts not on the board are dropped", async () => {
  const examples = [example("trinken", MOVES_RIGHT), example("trinken", MOVES_RIGHT, 0.002), example("hilfe", MOVES_UP), example("hilfe", MOVES_UP, 0.002)];
  const context = setup({ examples });
  await attempt(context, MOVES_UP);
  assert.deepEqual(context.recogniser.state(), { kind: "confirm", conceptId: "hilfe", hands: "right" });
  // "hilfe" not on this board: its examples are not used, so the same movement is not "hilfe".
  const without = setup({ examples, onBoard: new Set(["trinken"]) });
  await attempt(without, MOVES_UP);
  // Only the examples of "trinken" are compared. With these crude synthetic hands the rising movement is
  // then taken for "trinken" (the closest one left, within its limit): exactly why the child confirms.
  // With the examples of "hilfe" compared, it would be "hilfe" and, being off the board, unknown.
  assert.deepEqual(without.recogniser.state(), { kind: "confirm", conceptId: "trinken", hands: "right" });
});

// --- The view, on a fake document, with the real board ---

function fakeElement(tagName) {
  return {
    tagName, textContent: "", className: "", children: [], dataset: {}, attributes: {}, listeners: {}, hidden: false,
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] ?? null; },
    addEventListener(name, handler) { (this.listeners[name] ??= []).push(handler); },
    removeEventListener(name, handler) { this.listeners[name] = (this.listeners[name] ?? []).filter((other) => other !== handler); },
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) {
      // As in the DOM: every child is taken out, then the nodes are put in, also those that were already there.
      if (this.moved !== undefined) this.moved.push(...this.children.map((child) => ["out", child]), ...nodes.map((node) => ["in", node]));
      this.children = nodes;
    },
    removeChild(node) { this.children = this.children.filter((child) => child !== node); this.moved?.push(["out", node]); return node; },
    insertBefore(node, before) {
      this.children = this.children.filter((child) => child !== node);
      const at = before === null ? this.children.length : this.children.indexOf(before);
      this.children.splice(at, 0, node);
      this.moved?.push(["in", node]);
      return node;
    },
    dispatch(name, event = {}) { for (const handler of [...(this.listeners[name] ?? [])]) handler({ preventDefault() {}, ...event }); },
    click() { this.dispatch("click"); },
    focus() { globalThis.document.activeElement = this; },
  };
}
const tree = (node) => [node, ...node.children.flatMap(tree)];
const textOf = (node) => tree(node).map((element) => element.textContent).filter(Boolean).join(" ");
const visible = (root) => root.children.filter((child) => !child.hidden);
const hasClass = (element, name) => element.className.split(" ").includes(name);

function installDocument() {
  const previous = { document: globalThis.document, window: globalThis.window, SpeechSynthesisUtterance: globalThis.SpeechSynthesisUtterance };
  const speech = { spoken: [], utterances: [] };
  const doc = fakeElement("#document");
  doc.createElement = fakeElement;
  doc.visibilityState = "visible";
  const win = fakeElement("#window");
  win.speechSynthesis = {
    cancel() {},
    getVoices: () => [{ lang: "de-DE", localService: true }],
    addEventListener() {},
    removeEventListener() {},
    speak(utterance) { speech.utterances.push(utterance); speech.spoken.push(utterance.text); },
  };
  globalThis.document = doc;
  globalThis.window = win;
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  return {
    doc, win, speech,
    restore() {
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete globalThis[name];
        else globalThis[name] = value;
      }
    },
  };
}

const ENTRIES = [
  { id: "trinken", labelDe: "Trinken", speechDe: "Ich möchte trinken.", symbolPath: "./icons/trinken.svg", source: "catalogue" },
  { id: "hilfe", labelDe: "Hilfe", speechDe: "Ich brauche Hilfe.", symbolPath: "./icons/hilfe.svg", source: "catalogue" },
  { id: "ball", labelDe: "Ball", speechDe: "Ich möchte mit dem Ball spielen.", symbolPath: null, source: "custom" },
];
const VIEW = { kind: "profile", profileId: "0".repeat(32), displayName: "Mia", problems: [], entries: ENTRIES };

/** A `localStorage` stand-in for the gesture view's own camera choice (card NG-49). */
function memoryStorage(entries = []) {
  const items = new Map(entries);
  return { items, getItem: (key) => items.get(key) ?? null, setItem: (key, value) => { items.set(key, String(value)); } };
}

async function withView(callback, { examples = [example("trinken", MOVES_RIGHT), example("trinken", MOVES_RIGHT, 0.002), example("ball", MOVES_UP), example("ball", MOVES_UP, 0.002)], camera: cameraOptions = {}, choice = memoryStorage(), continuous = false, voice = true, demos } = {}) {
  const fakes = installDocument();
  try {
    const time = fakeTime();
    const camera = fakeCamera(cameraOptions);
    const root = fakeElement("section");
    let open = () => undefined;
    const board = mountBoard(root, VIEW, { now: time.now, gesture: { onStart: () => open() } });
    const said = [];
    const lateFailures = [];
    const current = { voice };
    const attached = attachRecognise({ root, board, entries: ENTRIES, examples, capture: camera.bridge, setTimer: time.setTimer, now: time.now, storage: () => choice, continuous, ...(demos === undefined ? {} : { demos }), sayText: (text, failed, ended) => {
      if (current.voice === "ends") { said.push(text); ended(); return "requested"; }
      said.push(text);
      if (current.voice === "fails") failed();
      // As on a device: the failure comes after the call, from the engine.
      if (current.voice === "fails later") { lateFailures.push(failed); return "requested"; }
      return typeof current.voice === "string" && current.voice !== "fails" ? current.voice : current.voice !== false;
    } });
    open = attached.open;
    const panel = () => root.children.find((child) => hasClass(child, "recognise")) ?? null;
    const buttonNamed = (text) => tree(panel() ?? root).find((element) => element.tagName === "button" && (element.textContent === text || element.attributes["aria-label"] === text));
    const tile = (label) => root.children.find((child) => hasClass(child, "concept-board")).children.find((element) => element.attributes["aria-label"] === label);
    const gestureButton = () => root.children.find((child) => hasClass(child, "gesture-start"));
    await callback({ ...fakes, setVoice: (next) => { current.voice = next; }, said, lateFailures, choice, time, camera, root, board, attached, panel, buttonNamed, tile, gestureButton, sentence: () => root.children[1].children[0].textContent });
  } finally {
    fakes.restore();
  }
}

/** Taps the board's gesture control and runs the countdown; frames are kept afterwards. */
async function viewToRecording(context) {
  context.gestureButton().click();
  await settle();
  context.time.advance(RECOGNISE_COUNTDOWN_S * 1000);
  assert.equal(context.panel().dataset.state, "recording");
}

test("view: the gesture view covers the board in its own frame; 'Ja, sagen' speaks through the board's tile path and sentence bar", async () => {
  await withView(async (context) => {
    const { root, panel, buttonNamed, time, camera, speech } = context;
    assert.equal(context.gestureButton().attributes["aria-label"], GESTURE_LABEL);
    context.gestureButton().click();
    assert.ok(panel() !== null);
    assert.deepEqual(visible(root), [panel()], "only the gesture view is visible");
    assert.equal(textOf(panel()).includes(RECOGNISE_TEXT.back), true);
    assert.equal(panel().attributes["aria-label"], "Gebärde");
    await settle();
    assert.equal(panel().dataset.state, "countdown");
    assert.match(textOf(panel()), /Gleich geht’s los: 3/);
    time.advance(1000);
    assert.match(textOf(panel()), /Gleich geht’s los: 3 … 2/);
    time.advance(2000);
    assert.match(textOf(panel()), /Jetzt die Gebärde machen\./);
    const back = buttonNamed(RECOGNISE_TEXT.back);
    await camera.feedAll(MOVES_RIGHT);
    time.advance(RECOGNISE_GUARD_MS);
    buttonNamed("Stopp").click();
    assert.equal(panel().dataset.state, "confirm");
    assert.equal(panel().dataset.concept, "trinken");
    assert.equal(buttonNamed(RECOGNISE_TEXT.back), back, "the way back stays the same button at the same place");
    const shown = tree(panel()).find((element) => hasClass(element, "recognise-concept"));
    assert.equal(shown.children[0].tagName, "img", "symbol first");
    assert.equal(shown.children[0].src, "./icons/trinken.svg");
    assert.equal(shown.children[1].textContent, "Trinken");
    assert.deepEqual(speech.spoken, [], "nothing spoken before 'Ja, sagen'");
    assert.equal(camera.running, false);
    // Symbols for a child who does not read: a cross on "Nein", a check mark and the tile's picture on "Ja, sagen"; "Nein" left, "Ja, sagen" right.
    const actionsRow = tree(panel()).find((element) => hasClass(element, "recognise-actions"));
    assert.deepEqual(actionsRow.children.map((element) => element.attributes["aria-label"]), ["Nein", "Ja, sagen"]);
    const [noButton, yesButton] = actionsRow.children;
    assert.deepEqual(noButton.children.map((element) => element.textContent || element.tagName), ["✗", "Nein"]);
    assert.deepEqual(yesButton.children.map((element) => element.textContent || element.tagName), ["✓", "img", "Ja, sagen"]);
    assert.equal(yesButton.children[1].src, "./icons/trinken.svg");
    assert.equal(yesButton.children[0].attributes["aria-hidden"], "true");
    time.advance(RECOGNISE_GUARD_MS);
    const yes = buttonNamed("Ja, sagen");
    yes.click();
    yes.click();
    assert.deepEqual(speech.spoken, ["Ich möchte trinken."]);
    assert.equal(context.sentence(), "Ich möchte trinken.", "the sentence bar shows it, as after a tap on the tile");
    assert.equal(context.tile("Trinken").attributes["aria-pressed"], "true");
    assert.equal(panel(), null);
    assert.ok(visible(root).length === root.children.length, "the whole board is back");
  });
});

test("view: 'Nein' and 'Zurück zur Tafel' return to the board without speaking; the board then shields presses briefly", async () => {
  await withView(async (context) => {
    const { root, panel, buttonNamed, time, camera, speech } = context;
    await viewToRecording(context);
    await camera.feedAll(MOVES_RIGHT);
    time.advance(RECOGNISE_GUARD_MS);
    buttonNamed("Stopp").click();
    time.advance(RECOGNISE_GUARD_MS);
    buttonNamed("Nein").click();
    assert.equal(panel(), null);
    assert.deepEqual(speech.spoken, []);
    // A tile where "Nein" was: the second tap of a double tap does not speak.
    context.tile("Hilfe").click();
    context.gestureButton().click();
    assert.deepEqual(speech.spoken, []);
    assert.equal(panel(), null);
    time.advance(BOARD_SHIELD_MS);
    context.tile("Hilfe").click();
    assert.deepEqual(speech.spoken, ["Ich brauche Hilfe."]);
    // "Gebärde" stays shielded longer: it must not start the camera again from a slow double tap.
    context.gestureButton().click();
    assert.equal(panel(), null);
    time.advance(GESTURE_SHIELD_MS - BOARD_SHIELD_MS);

    // "Zurück zur Tafel" from the countdown.
    context.gestureButton().click();
    await settle();
    assert.equal(panel().dataset.state, "countdown");
    buttonNamed(RECOGNISE_TEXT.back).click();
    assert.equal(panel(), null);
    assert.equal(camera.running, false);
    assert.equal(root.children.every((child) => !child.hidden), true);
    assert.deepEqual(speech.spoken, ["Ich brauche Hilfe."]);
    // A second tap on "Zurück" a second later lands on "Gebärde": nothing starts.
    time.advance(1000);
    context.gestureButton().click();
    await settle();
    assert.equal(panel(), null);
    assert.equal(camera.log.cameraRequests, 2);
    time.advance(GESTURE_SHIELD_MS - 1000);
    context.gestureButton().click();
    await settle();
    assert.equal(panel().dataset.state, "countdown");
  });
});

test("view: unknown says so, speaks nothing, and offers candidate tiles; a candidate opens the confirm view, only 'Ja, sagen' speaks", async () => {
  await withView(async (context) => {
    const { panel, buttonNamed, time, camera, speech } = context;
    await viewToRecording(context);
    // Not taught: unknown, with the taught concepts of its kind as candidates.
    await camera.feedAll((i) => [trackerHand(0.7 - i * 0.012, 0.3 + i * 0.012, "Right")]);
    time.advance(RECOGNISE_GUARD_MS);
    buttonNamed("Stopp").click();
    assert.equal(panel().dataset.state, "unknown");
    assert.match(textOf(panel()), /Das habe ich nicht verstanden\./);
    assert.deepEqual(speech.spoken, []);
    const candidates = tree(panel()).filter((element) => hasClass(element, "recognise-candidate"));
    assert.ok(candidates.length >= 1 && candidates.length <= 3);
    assert.ok(candidates.every((candidate) => hasClass(candidate, "concept")), "they look like tiles");
    const ball = candidates.find((candidate) => candidate.dataset.concept === "ball");
    assert.ok(ball !== undefined && hasClass(ball, "concept-text"), "a concept without a picture is a text tile, as on the board");
    ball.click();
    assert.deepEqual(speech.spoken, [], "a candidate pressed too soon after the view appeared");
    // A press that began within the guard and ends after it does not count either.
    panel().dispatch("pointerdown");
    time.advance(RECOGNISE_GUARD_MS);
    ball.click();
    assert.deepEqual(speech.spoken, []);
    panel().dispatch("pointerdown");
    time.advance(10);
    ball.click();
    assert.deepEqual(speech.spoken, [], "a candidate tap speaks nothing");
    assert.equal(panel().dataset.state, "confirm");
    assert.equal(panel().dataset.concept, "ball");
    assert.equal(panel().dataset.from, "candidates");
    assert.match(textOf(panel()), /Meinst du das\?/);
    time.advance(RECOGNISE_GUARD_MS);
    buttonNamed("Nein").click();
    assert.equal(panel().dataset.state, "unknown", "'Nein' returns to the candidates");
    assert.deepEqual(speech.spoken, []);
    time.advance(RECOGNISE_GUARD_MS);
    tree(panel()).find((element) => element.dataset.concept === "ball").click();
    time.advance(RECOGNISE_GUARD_MS);
    buttonNamed("Ja, sagen").click();
    assert.deepEqual(speech.spoken, ["Ich möchte mit dem Ball spielen."]);
    assert.equal(panel(), null);
    assert.equal(context.sentence(), "Ich möchte mit dem Ball spielen.");
  });
});

test("view: an unusable recording shows its reason, 'Nochmal' and the way back; the camera is off", async () => {
  await withView(async (context) => {
    const { panel, buttonNamed, time, camera, speech } = context;
    await viewToRecording(context);
    await camera.feed(MOVES_RIGHT(0));
    time.advance(RECOGNISE_GUARD_MS);
    buttonNamed("Stopp").click();
    assert.equal(panel().dataset.state, "unusable");
    assert.equal(panel().dataset.reason, "too_short");
    assert.match(textOf(panel()), /Das war zu kurz\./);
    assert.ok(buttonNamed("Nochmal") !== undefined && buttonNamed(RECOGNISE_TEXT.back) !== undefined);
    assert.equal(camera.running, false);
    time.advance(RECOGNISE_GUARD_MS);
    buttonNamed("Nochmal").click();
    await settle();
    assert.equal(panel().dataset.state, "countdown");
    assert.equal(camera.log.cameraRequests, 2);
    buttonNamed(RECOGNISE_TEXT.back).click();
    assert.equal(camera.running, false);
    assert.deepEqual(speech.spoken, []);
  });
});

test("view: hiding the page, pagehide and a hidden board region end the attempt and stop the camera", async () => {
  for (const how of ["visibilitychange", "pagehide", "region hidden"]) {
    await withView(async (context) => {
      const { root, panel, time, camera, doc, win } = context;
      await viewToRecording(context);
      if (how === "visibilitychange") {
        doc.visibilityState = "hidden";
        doc.dispatch("visibilitychange");
      } else if (how === "pagehide") {
        win.dispatch("pagehide");
      } else {
        root.hidden = true;
        await camera.feed(MOVES_RIGHT(0));
      }
      assert.equal(panel(), null, how);
      assert.equal(camera.running, false, how);
      time.advance(RECOGNISE_MAX_RECORDING_MS);
      assert.equal(panel(), null, how);
    });
  }
});

test("view: dispose stops the camera and removes the page listeners", async () => {
  await withView(async (context) => {
    const { doc, win, camera, attached } = context;
    await viewToRecording(context);
    assert.equal(doc.listeners.visibilitychange.length, 1);
    attached.dispose();
    assert.equal(camera.running, false);
    assert.equal(doc.listeners.visibilitychange.length, 0);
    assert.equal(win.listeners.pagehide.length, 0);
  });
});


// --- Front or back camera (card NG-43) ---

/** A `localStorage` stand-in holding the device's camera choice. */
function choiceStorage(facing) {
  const items = new Map(facing === undefined ? [] : [[CAMERA_FACING_KEY, facing]]);
  return { items, getItem: (key) => items.get(key) ?? null, setItem: (key, value) => { items.set(key, String(value)); } };
}

test("camera: the child's view always asks for the front camera, also when 'hinten' is stored for teaching and the camera test", async () => {
  for (const stored of [undefined, "user", "environment"]) {
    const context = setup({ outcome: MATCH, camera: fakeCamera({ storage: choiceStorage(stored) }) });
    await attempt(context);
    assert.deepEqual(context.camera.log.facings, ["user"], "the view names the front camera itself");
    assert.deepEqual(context.camera.log.asked, ["user"], `stored: ${stored}`);
    assert.equal(context.camera.running, false, "stopped after the attempt, as before");
    assert.equal(context.kind(), "confirm");
  }
  // Teaching and the camera test still follow the stored choice through the same bridge (no facing named).
  const camera = fakeCamera({ storage: choiceStorage("environment") });
  const started = await camera.bridge.start({}, {});
  started.session.stop();
  assert.deepEqual(camera.log.asked, [{ exact: "environment" }]);
});

test("camera: a front camera that does not open is a problem in the child's view; the back camera is never tried there", async () => {
  for (const cameraError of ["NotReadableError", "NotFoundError"]) {
    const context = setup({ outcome: MATCH, camera: fakeCamera({ storage: choiceStorage("environment"), cameraError }) });
    context.recogniser.start();
    await settle();
    assert.equal(context.kind(), "problem");
    assert.equal(context.recogniser.state().line, RECOGNISE_TEXT.problems[cameraError === "NotFoundError" ? "no_camera" : "busy"]);
    assert.deepEqual(context.camera.log.asked, ["user"], "one request, for the front camera");
    assert.equal(context.camera.log.trackerClosed, 1);
  }
});

test("camera: examples taught with the back camera are recognised in the child's view, which uses the front camera", async () => {
  // Both cameras look at the child and deliver unflipped frames, so the tracker answers the same
  // (test/capture.test.mjs, "handedness"); nothing on the way from the camera to the matcher depends on the camera.
  const taughtBy = async (stored, hands, wobble) => {
    const camera = fakeCamera({ storage: choiceStorage(stored) });
    const started = await camera.bridge.start({}, { record: true });
    for (let i = 0; i < 20; i += 1) await camera.feed(hands(i).map((hand) => ({ ...hand, landmarks: hand.landmarks.map((point) => ({ x: point.x + wobble * Math.sin(i), y: point.y })) })));
    const recording = sequenceFromRecording(started.session.stop());
    assert.ok(recording.ok);
    assert.deepEqual(camera.log.asked, [stored === "environment" ? { exact: "environment" } : "user"]);
    return recording.sequence;
  };
  const examples = [];
  for (const [conceptId, hands] of [["trinken", MOVES_RIGHT], ["hilfe", MOVES_UP]]) {
    for (const wobble of [0, 0.002]) examples.push({ conceptId, sequence: await taughtBy("environment", hands, wobble) });
  }
  const context = setup({ examples, camera: fakeCamera({ storage: choiceStorage("environment") }) });
  await attempt(context, MOVES_RIGHT);
  assert.deepEqual(context.camera.log.asked, ["user"]);
  assert.deepEqual(context.recogniser.state(), { kind: "confirm", conceptId: "trinken", hands: "right" });
});

/** What the view shows, for comparing layouts: tags, classes, texts and the attributes that matter, in order. */
const shape = (node) => ({
  tag: node.tagName, className: node.className, text: node.textContent, hidden: node.hidden,
  label: node.attributes?.["aria-label"] ?? null, children: node.children.map(shape),
});

test("view: the gesture view ignores teaching's stored camera and draws every state the same whatever it is", async () => {
  const drawn = {};
  for (const stored of ["user", "environment"]) {
    drawn[stored] = [];
    await withView(async (context) => {
      const { panel, buttonNamed, time, camera } = context;
      const snap = () => drawn[stored].push(shape(context.root));
      context.gestureButton().click();
      snap();
      await settle();
      snap();
      // Card NG-49 revises NG-43: the view has its own switch, which starts at "vorne" whatever teaching stored.
      assert.equal(tree(panel()).find((element) => hasClass(element, "recognise-camera")).dataset.facing, "user");
      assert.equal(tree(panel()).some((element) => hasClass(element, "camera-choice")), false, "not teaching's camera choice");
      time.advance(1000);
      snap();
      time.advance(2000);
      snap();
      await camera.feedAll(MOVES_RIGHT);
      time.advance(RECOGNISE_GUARD_MS);
      buttonNamed("Stopp").click();
      snap();
      time.advance(RECOGNISE_GUARD_MS);
      buttonNamed("Nein").click();
      snap();
      time.advance(GESTURE_SHIELD_MS);
      context.gestureButton().click();
      await settle();
      time.advance(3000);
      await camera.feedAll(MOVES_UP);
      time.advance(RECOGNISE_GUARD_MS);
      buttonNamed("Stopp").click();
      snap();
      assert.deepEqual(camera.log.asked, ["user", "user"], "the front camera whatever is stored");
    }, { camera: { storage: choiceStorage(stored) } });
  }
  assert.equal(drawn.user.length, 7);
  assert.deepEqual(drawn.environment, drawn.user);
});

// --- The live preview in the gesture view (card NG-44) ---

/** A bridge's `createPreview` that records what the capture asks of it; its element is a fake element. */
function recordingPreviews({ failShow = false } = {}) {
  const made = [];
  const createPreview = (doc) => {
    const preview = {
      element: doc.createElement("div"), shown: [], drawn: [], closed: 0,
      show(stream, facing) {
        if (failShow) throw new Error("no picture");
        this.shown.push(facing);
      },
      draw(frame) { this.drawn.push(frame); },
      close() { this.closed += 1; },
      videoSet: [],
      setVideo(on) { this.videoSet.push(on); },
    };
    preview.element.className = "capture-preview";
    made.push(preview);
    return preview;
  };
  return { made, createPreview };
}
const slotOf = (panel) => tree(panel).find((element) => hasClass(element, "recognise-preview")) ?? null;

test("preview: the gesture view shows the live preview of the front camera during the countdown and the recording, with every tracked frame", async () => {
  await withView(async (context) => {
    const { panel, buttonNamed, time, camera } = context;
    const previews = recordingPreviews();
    camera.bridge.createPreview = previews.createPreview;
    context.gestureButton().click();
    assert.equal(slotOf(panel()), null, "no picture while the tracker loads and the camera is asked for");
    await settle();
    assert.equal(panel().dataset.state, "countdown");
    assert.equal(previews.made.length, 1, "one preview per camera start");
    const [preview] = previews.made;
    assert.deepEqual(preview.shown, ["user"], "the front camera: the picture is mirrored");
    const slot = slotOf(panel());
    assert.deepEqual(slot.children.map((element) => element.className), ["capture-preview", "recognise-count", "recognise-picture"], "the count large over the picture, the picture toggle in its corner (card NG-52)");
    assert.equal(slot.children[0], preview.element);
    assert.equal(slot.children[1].textContent, "3");
    const main = tree(panel()).find((element) => hasClass(element, "recognise-main"));
    assert.deepEqual(main.children.map((element) => element.className), ["recognise-line", "recognise-preview", "recognise-feedback"], "the line above the picture, the feedback row (card NG-45) below it");
    time.advance(1000);
    assert.equal(slotOf(panel()), slot);
    assert.deepEqual(slot.children.map((element) => element.textContent), ["", "2", ""]);
    await camera.feed(MOVES_RIGHT(0));
    assert.equal(preview.drawn.length, 1, "frames of the countdown are drawn, not kept");
    time.advance((RECOGNISE_COUNTDOWN_S - 1) * 1000);
    assert.equal(panel().dataset.state, "recording");
    assert.equal(slotOf(panel()), slot, "the same box in the recording: the picture does not jump");
    assert.deepEqual(slot.children.map((element) => element.className), ["capture-preview", "recognise-picture"]);
    assert.equal(slot.children[0], preview.element);
    await camera.feedAll(MOVES_RIGHT);
    assert.equal(preview.drawn.length, 21);
    assert.equal(preview.drawn.at(-1).hands[0].label, "Right", "the tracker's own frame, as in teaching");
    time.advance(RECOGNISE_GUARD_MS);
    buttonNamed("Stopp").click();
    assert.equal(panel().dataset.state, "confirm");
    assert.equal(slotOf(panel()), null, "no picture with the answer");
    assert.deepEqual(slot.children, [], "the box is emptied");
    assert.ok(preview.closed >= 1, "the preview is closed with the camera");
    assert.equal(camera.running, false);
    // "Nein", then a new attempt: a new preview.
    time.advance(RECOGNISE_GUARD_MS);
    buttonNamed("Nein").click();
    time.advance(GESTURE_SHIELD_MS);
    context.gestureButton().click();
    await settle();
    assert.equal(previews.made.length, 2);
    assert.equal(slotOf(panel()).children[0], previews.made[1].element);
  });
});

test("preview: every way out closes the preview and takes it off the screen", async () => {
  for (const way of ["back-countdown", "back-recording", "hidden-page", "pagehide", "board-hidden", "dispose", "camera-lost"]) {
    await withView(async (context) => {
      const { panel, buttonNamed, time, camera, doc, win, root } = context;
      const previews = recordingPreviews();
      camera.bridge.createPreview = previews.createPreview;
      context.gestureButton().click();
      await settle();
      if (way !== "back-countdown") time.advance(RECOGNISE_COUNTDOWN_S * 1000);
      const [preview] = previews.made;
      const slot = slotOf(panel());
      assert.equal(slot.children[0], preview.element);
      if (way === "back-countdown" || way === "back-recording") buttonNamed(RECOGNISE_TEXT.back).click();
      else if (way === "hidden-page") { doc.visibilityState = "hidden"; doc.dispatch("visibilitychange"); }
      else if (way === "pagehide") win.dispatch("pagehide");
      else if (way === "board-hidden") { root.hidden = true; await camera.feed(MOVES_RIGHT(0)); }
      else if (way === "dispose") context.attached.dispose();
      else { camera.fail(); await settle(); }
      assert.equal(camera.running, false, way);
      assert.ok(preview.closed >= 1, `${way}: closed`);
      if (way !== "dispose") assert.deepEqual(slot.children, [], `${way}: the box is emptied`);
      if (way === "camera-lost") {
        assert.equal(panel().dataset.state, "problem");
        assert.equal(slotOf(panel()), null);
      }
    });
  }
});

test("preview: a bridge without one, or a preview that fails, leaves the gesture view working as before", async () => {
  // Without createPreview (an older bridge): no box at all.
  await withView(async (context) => {
    const { panel, buttonNamed, time, camera } = context;
    assert.equal(camera.bridge.createPreview, undefined);
    await viewToRecording(context);
    assert.equal(slotOf(panel()), null);
    await camera.feedAll(MOVES_RIGHT);
    time.advance(RECOGNISE_GUARD_MS);
    buttonNamed("Stopp").click();
    assert.equal(panel().dataset.state, "confirm");
  });
  // createPreview that throws, and a preview whose show throws: the attempt is recognised all the same.
  for (const failure of ["create", "show"]) {
    await withView(async (context) => {
      const { panel, buttonNamed, time, camera } = context;
      const previews = recordingPreviews({ failShow: failure === "show" });
      camera.bridge.createPreview = failure === "create" ? () => { throw new Error("no canvas"); } : previews.createPreview;
      await viewToRecording(context);
      await camera.feedAll(MOVES_RIGHT);
      time.advance(RECOGNISE_GUARD_MS);
      buttonNamed("Stopp").click();
      assert.equal(panel().dataset.state, "confirm", failure);
      assert.equal(panel().dataset.concept, "trinken");
      assert.equal(camera.running, false);
    });
  }
  // Card NG-45: a preview that cannot show, or a later start whose preview cannot be made, leaves no
  // empty box behind: the count is in its own line, as without a preview.
  for (const failure of ["show", "create-after-success"]) {
    await withView(async (context) => {
      const { panel, buttonNamed, time, camera } = context;
      const previews = recordingPreviews({ failShow: failure === "show" });
      camera.bridge.createPreview = previews.createPreview;
      if (failure === "create-after-success") {
        await viewToRecording(context);
        assert.ok(slotOf(panel()) !== null, "the first start has its picture");
        buttonNamed(RECOGNISE_TEXT.back).click();
        camera.bridge.createPreview = () => { throw new Error("no canvas"); };
        time.advance(GESTURE_SHIELD_MS);
      }
      context.gestureButton().click();
      await settle();
      assert.equal(panel().dataset.state, "countdown", failure);
      assert.equal(slotOf(panel()), null, `${failure}: no empty picture box`);
      const main = tree(panel()).find((element) => hasClass(element, "recognise-main"));
      assert.deepEqual(main.children.map((element) => element.className), ["recognise-line", "recognise-count", "recognise-feedback"], failure);
      if (failure === "show") assert.ok(previews.made[0].closed >= 1, "the failed preview is closed");
    });
  }
});

test("preview: the controller passes one preview per start to the capture and closes it when the start is cancelled before the camera opened", async () => {
  const camera = fakeCamera({ holdTracker: true });
  const made = [];
  const context = setup({ camera, outcome: MATCH });
  const recogniser = createRecogniser({
    examples: [], onBoard: ON_BOARD, bridge: () => camera.bridge, host: () => ({}), setTimer: context.time.setTimer, now: context.time.now,
    speak: () => undefined, onChange: () => undefined,
    preview: () => { const sink = { closed: 0, show() {}, draw() {}, close() { this.closed += 1; } }; made.push(sink); return sink; },
  });
  recogniser.start();
  await settle();
  assert.equal(made.length, 1);
  recogniser.back();
  await settle();
  assert.equal(camera.log.cameraRequests, 0);
  assert.equal(made[0].closed >= 1, true, "closed although it never showed");
});

// --- Feedback without reading: hands seen and time left (card NG-45) ---

test("hands seen: none, one or two usable hands of a tracked frame, as the preview sides them", () => {
  assert.equal(handsSeen(frames(() => [], 1)[0]), 0);
  assert.equal(handsSeen(frames(MOVES_RIGHT, 1)[0]), 1);
  assert.equal(handsSeen(frames(BOTH_APART, 1)[0]), 2);
  assert.equal(handsSeen({ timestampMs: 0, imageWidth: 0, imageHeight: 0, hands: [], pose: null }), 0, "a broken frame counts as none");
  assert.equal(RECOGNISE_SECONDS, 5);
});

test("controller: hands seen on every frame of the countdown and the recording; the seconds left once a second, without a redraw", async () => {
  const seen = [];
  const left = [];
  const camera = fakeCamera();
  const time = fakeTime();
  const states = [];
  const recogniser = createRecogniser({
    examples: [], onBoard: ON_BOARD, bridge: () => camera.bridge, host: () => ({}), setTimer: time.setTimer, now: time.now,
    speak: () => undefined, onChange: (state) => states.push(state.kind), analyse: () => MATCH,
    onSeen: (hands) => seen.push(hands), onTimeLeft: (seconds) => left.push(seconds),
  });
  recogniser.start();
  await settle();
  await camera.feed([]);
  await camera.feed(MOVES_RIGHT(0));
  time.advance(RECOGNISE_COUNTDOWN_S * 1000);
  assert.deepEqual(left, [5], "the whole time when the recording starts");
  await camera.feed(BOTH_APART(0));
  assert.deepEqual(seen, [0, 1, 2]);
  const drawn = states.length;
  time.advance(1000);
  time.advance(1000);
  assert.deepEqual(left, [5, 4, 3]);
  assert.equal(states.length, drawn, "the seconds are no redraw");
  // The press guard counts from the recording's start, not from a tick: "Stopp" works now.
  recogniser.finish();
  assert.equal(recogniser.state().kind, "confirm");
  assert.equal(time.pending(), 0, "no tick left after the recording");
  await camera.feed(MOVES_RIGHT(1));
  assert.deepEqual(seen, [0, 1, 2], "nothing after the camera stopped");
  // Up to the time limit: 5 … 1, then the answer.
  const full = setup({ outcome: MATCH });
  const ticks = [];
  const limited = createRecogniser({
    examples: [], onBoard: ON_BOARD, bridge: () => full.camera.bridge, host: () => ({}), setTimer: full.time.setTimer, now: full.time.now,
    speak: () => undefined, onChange: () => undefined, analyse: () => MATCH, onTimeLeft: (seconds) => ticks.push(seconds),
  });
  limited.start();
  await settle();
  full.time.advance(RECOGNISE_COUNTDOWN_S * 1000 + RECOGNISE_MAX_RECORDING_MS);
  assert.deepEqual(ticks, [5, 4, 3, 2, 1]);
  assert.equal(limited.state().kind, "confirm");
  assert.equal(full.time.pending(), 0);
});

const feedbackOf = (panel) => tree(panel).find((element) => hasClass(element, "recognise-feedback")) ?? null;
const litCount = (box, name) => tree(box).filter((element) => hasClass(element, name) && element.dataset.lit === "true").length;

test("view: under the picture, hand symbols light up for the hands seen and one dot per second goes out while recording", async () => {
  await withView(async (context) => {
    const { panel, buttonNamed, time, camera } = context;
    context.gestureButton().click();
    await settle();
    const feedback = feedbackOf(panel());
    assert.ok(feedback !== null, "shown in the countdown");
    const main = tree(panel()).find((element) => hasClass(element, "recognise-main"));
    assert.equal(main.children.at(-1), feedback, "below the picture and the count");
    assert.equal(feedback.dataset.seen, "0");
    assert.equal(panel().dataset.seen, "0", "the frame is orange without a hand");
    assert.match(textOf(feedback), /Keine Hand im Bild/);
    assert.equal(litCount(feedback, "recognise-seen-hand"), 0);
    assert.equal(litCount(feedback, "recognise-time-dot"), RECOGNISE_SECONDS, "the whole time ahead");
    await camera.feed(MOVES_RIGHT(0));
    assert.equal(panel().dataset.seen, "1");
    assert.equal(litCount(feedback, "recognise-seen-hand"), 1);
    assert.match(textOf(feedback), /Eine Hand im Bild/);
    time.advance(1000);
    assert.equal(feedbackOf(panel()), feedback, "the same row on the next tick");
    assert.equal(litCount(feedback, "recognise-seen-hand"), 1, "kept through a redraw");
    time.advance((RECOGNISE_COUNTDOWN_S - 1) * 1000);
    assert.equal(panel().dataset.state, "recording");
    assert.equal(feedbackOf(panel()), feedback, "the same row in the recording: nothing moves");
    await camera.feed(BOTH_APART(0));
    assert.equal(litCount(feedback, "recognise-seen-hand"), 2);
    assert.match(textOf(feedback), /Zwei Hände im Bild/);
    const time5 = tree(feedback).find((element) => hasClass(element, "recognise-time"));
    assert.equal(time5.attributes["aria-label"], "Noch 5 Sekunden");
    time.advance(2000);
    assert.equal(litCount(feedback, "recognise-time-dot"), 3);
    assert.equal(time5.attributes["aria-label"], "Noch 3 Sekunden");
    await camera.feed([]);
    assert.equal(panel().dataset.seen, "2", "a hand gone for one frame does not change the signal (card NG-46)");
    time.advance(SEEN_HOLD_MS);
    await camera.feed([]);
    assert.equal(panel().dataset.seen, "0", "orange again when the hands stay out of the picture");
    time.advance(RECOGNISE_GUARD_MS);
    buttonNamed("Stopp").click();
    assert.equal(panel().dataset.state, "unusable", "three frames are too few: an answer all the same");
    assert.equal(feedbackOf(panel()), null, "no row with the answer");
    assert.equal(panel().dataset.seen, undefined);
    // A new attempt starts with nothing seen and the whole time.
    time.advance(RECOGNISE_GUARD_MS);
    buttonNamed("Nochmal").click();
    await settle();
    assert.equal(feedbackOf(panel()).dataset.seen, "0");
    assert.equal(litCount(feedback, "recognise-time-dot"), RECOGNISE_SECONDS);
  });
});

test("the stylesheet: the feedback row is orange without a hand and green with one, the dots change without motion", async () => {
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  const rule = (selector) => css.split("\n").find((line) => line.startsWith(`${selector} {`)) ?? "";
  assert.match(rule(".recognise-feedback"), /border: 3px solid #b35400/);
  assert.match(rule('.recognise-feedback[data-seen="1"], .recognise-feedback[data-seen="2"]'), /border-color: #1d6b40/);
  assert.match(rule(".recognise[data-seen] .recognise-preview::after"), /border: 6px solid #b35400/);
  assert.match(rule('.recognise[data-seen="1"] .recognise-preview::after, .recognise[data-seen="2"] .recognise-preview::after'), /border-color: #1d6b40/);
  assert.match(rule('.recognise-time-dot[data-lit="true"]'), /background: #4b2a7a/);
  assert.doesNotMatch(css.split("\n").filter((line) => line.includes("recognise-time") || line.includes("recognise-seen") || line.includes("recognise-feedback")).join("\n"), /transition|animation|transform/);
});

// --- A steady signal (card NG-46) ---

test("steady signal: a lower hand count shows only after it held for SEEN_HOLD_MS, a higher one at once", async () => {
  const seen = [];
  const camera = fakeCamera();
  const time = fakeTime();
  const recogniser = createRecogniser({
    examples: [], onBoard: ON_BOARD, bridge: () => camera.bridge, host: () => ({}), setTimer: time.setTimer, now: time.now,
    speak: () => undefined, onChange: () => undefined, analyse: () => MATCH, onSeen: (hands) => seen.push(hands),
  });
  recogniser.start();
  await settle();
  assert.equal(SEEN_HOLD_MS, 300);
  await camera.feed(MOVES_RIGHT(0));
  assert.deepEqual(seen, [1], "a hand shows at once");
  // The tracker loses the hand for single frames: the signal stays.
  for (let i = 0; i < 3; i += 1) {
    await camera.feed([]);
    time.advance(SEEN_HOLD_MS / 3 - 1);
  }
  await camera.feed(MOVES_RIGHT(1));
  assert.deepEqual(seen, [1, 1, 1, 1, 1], "no flicker while the hand comes back within the hold");
  // Two hands: at once. One drops for good: shown after the hold.
  await camera.feed(BOTH_APART(0));
  await camera.feed(MOVES_RIGHT(2));
  time.advance(SEEN_HOLD_MS - 1);
  await camera.feed(MOVES_RIGHT(3));
  assert.equal(seen.at(-1), 2, "still two just before the hold is over");
  time.advance(1);
  await camera.feed(MOVES_RIGHT(4));
  assert.equal(seen.at(-1), 1, "one after the hold");
  // From two hands to one: a single empty frame just as the hold ends never shows "no hand".
  await camera.feed(BOTH_APART(1));
  assert.equal(seen.at(-1), 2);
  const from = seen.length;
  await camera.feed(MOVES_RIGHT(5));
  time.advance(SEEN_HOLD_MS);
  await camera.feed([]);
  await camera.feed(MOVES_RIGHT(6));
  assert.deepEqual(seen.slice(from), [2, 1, 1], "two, then one, and no zero in between");
  // That empty frame started its own hold: it shows only if the hand stays away.
  time.advance(SEEN_HOLD_MS);
  await camera.feed([]);
  assert.equal(seen.at(-1), 1, "one empty frame after a hand frame starts a new hold");
  time.advance(SEEN_HOLD_MS);
  await camera.feed([]);
  assert.equal(seen.at(-1), 0, "no hand once the hand stayed away for the hold");
  // A new start begins at none, whatever was shown before.
  recogniser.back();
  recogniser.start();
  await settle();
  await camera.feed([]);
  assert.equal(seen.at(-1), 0);
});

test("seconds left come from the recording's deadline: a late timer shows the right count", async () => {
  const left = [];
  const camera = fakeCamera();
  const time = fakeTime();
  let late = 0;
  // A timer that fires `late` ms after it was due, as a busy browser can.
  const lateTimer = (callback, milliseconds) => time.setTimer(callback, milliseconds + late);
  const recogniser = createRecogniser({
    examples: [], onBoard: ON_BOARD, bridge: () => camera.bridge, host: () => ({}), setTimer: lateTimer, now: time.now,
    speak: () => undefined, onChange: () => undefined, analyse: () => MATCH, onTimeLeft: (seconds) => left.push(seconds),
  });
  recogniser.start();
  await settle();
  time.advance(RECOGNISE_COUNTDOWN_S * 1000);
  assert.equal(recogniser.state().kind, "recording");
  assert.deepEqual(left, [5]);
  late = 900;
  time.advance(1900);
  // The first tick was set before the timers turned late: it comes at 1 s and shows 4. The next one,
  // due at 2 s, comes at 2.9 s and shows 3; it wakes the one after for 3 s, which comes at 3.9 s
  // and shows 2. One second per callback would show 3 at 2.9 s as well, but nothing at 3.9 s: its
  // next callback, set 1 s after 2.9 s, comes only at 4.8 s (card NG-48).
  assert.deepEqual(left, [5, 4]);
  time.advance(1000);
  assert.deepEqual(left, [5, 4, 3], "never behind the time actually left");
  time.advance(1000);
  assert.deepEqual(left, [5, 4, 3, 2], "a count per callback would still show [5, 4, 3] here");
  recogniser.finish();
  assert.equal(time.pending(), 0, "no tick left after the recording");
});

// --- Heard, not only seen (card NG-47) ---

test("view: the hands-seen words are a polite status region, rewritten only when the shown count changes", async () => {
  await withView(async (context) => {
    const { panel, time, camera } = context;
    context.gestureButton().click();
    await settle();
    const feedback = feedbackOf(panel());
    const words = tree(feedback).find((element) => hasClass(element, "recognise-seen-text"));
    assert.equal(words.attributes.role, "status");
    assert.equal(words.attributes["aria-live"], "polite");
    assert.equal(words.attributes["aria-atomic"], "true");
    const time5 = tree(feedback).find((element) => hasClass(element, "recognise-time"));
    assert.equal(time5.attributes["aria-live"], undefined, "the seconds are not announced");
    assert.equal(time5.attributes.role, "img");
    // Count every write to the words: equal text must not be written again (it can be read out again).
    const writes = [];
    let text = words.textContent;
    Object.defineProperty(words, "textContent", { get: () => text, set: (value) => { writes.push(value); text = value; } });
    await camera.feed(MOVES_RIGHT(0));
    await camera.feed(MOVES_RIGHT(1));
    time.advance(1000);
    await camera.feed(MOVES_RIGHT(2));
    time.advance((RECOGNISE_COUNTDOWN_S - 1) * 1000);
    assert.equal(panel().dataset.state, "recording");
    await camera.feed(MOVES_RIGHT(3));
    await camera.feed([]);
    await camera.feed(MOVES_RIGHT(4));
    assert.deepEqual(writes, ["Eine Hand im Bild"], "one announcement for a hand that stays, none for a frame without it");
    await camera.feed(BOTH_APART(0));
    time.advance(SEEN_HOLD_MS);
    await camera.feed([]);
    time.advance(SEEN_HOLD_MS);
    await camera.feed([]);
    assert.deepEqual(writes, ["Eine Hand im Bild", "Zwei H\u00e4nde im Bild", "Keine Hand im Bild"]);
    assert.equal(tree(feedbackOf(panel())).find((element) => hasClass(element, "recognise-seen-text")), words, "the same region throughout");
  });
});

test("view: the hands-seen region and the picture stay in the page from the countdown into the recording, never taken out and in again", async () => {
  await withView(async (context) => {
    const { panel, time, camera, buttonNamed } = context;
    const previews = recordingPreviews();
    camera.bridge.createPreview = previews.createPreview;
    context.gestureButton().click();
    await settle();
    const main = tree(panel()).find((element) => hasClass(element, "recognise-main"));
    const feedback = feedbackOf(panel());
    const slot = slotOf(panel());
    main.moved = [];
    slot.moved = [];
    for (let second = 1; second < RECOGNISE_COUNTDOWN_S; second += 1) time.advance(1000);
    time.advance(1000);
    assert.equal(panel().dataset.state, "recording");
    await camera.feed(MOVES_RIGHT(0));
    assert.deepEqual(main.moved.filter(([, node]) => node === feedback || node === slot), [], "no removal or insertion of the region or the picture box");
    assert.ok(main.moved.some(([kind, node]) => kind === "in" && hasClass(node, "recognise-line")), "the line is new on each draw: that is how the countdown is spoken");
    assert.deepEqual(slot.moved.filter(([, node]) => node === previews.made[0].element), [], "the picture stays in its box");
    assert.deepEqual(slot.children.map((element) => element.className), ["capture-preview", "recognise-picture"], "only the picture and its toggle in the recording, the count is gone");
    assert.deepEqual(main.children.map((element) => element.className), ["recognise-line", "recognise-preview", "recognise-feedback"]);
    // With the answer the row goes: out of the page, nothing more to announce.
    await camera.feedAll(MOVES_RIGHT);
    time.advance(RECOGNISE_GUARD_MS);
    buttonNamed("Stopp").click();
    assert.ok(main.moved.some(([kind, node]) => kind === "out" && node === feedback));
    assert.equal(main.children.includes(feedback), false);
  });
});

// --- The focus stays in the view (card NG-48) ---

test("view: when the focused button goes with a redraw, the focus moves to the new state's first button or the way back", async () => {
  await withView(async (context) => {
    const { panel, buttonNamed, time, camera, doc } = context;
    // An unusable recording, then "Nochmal" by keyboard: the button goes, the focus goes to "Zurück zur Tafel".
    await viewToRecording(context);
    assert.equal(doc.activeElement, buttonNamed(RECOGNISE_TEXT.back), "the view opens with the focus on the way back");
    await camera.feed(MOVES_RIGHT(0));
    time.advance(RECOGNISE_GUARD_MS);
    buttonNamed("Stopp").focus();
    buttonNamed("Stopp").click();
    assert.equal(panel().dataset.state, "unusable");
    assert.equal(doc.activeElement, buttonNamed("Nochmal"), "from 'Stopp' to the answer's first button");
    time.advance(RECOGNISE_GUARD_MS);
    buttonNamed("Nochmal").click();
    assert.equal(panel().dataset.state, "starting");
    assert.equal(doc.activeElement, buttonNamed(RECOGNISE_TEXT.back), "no button while the camera starts: the way back");
    await settle();
    time.advance(RECOGNISE_COUNTDOWN_S * 1000);
    assert.equal(panel().dataset.state, "recording");
    assert.equal(doc.activeElement, buttonNamed(RECOGNISE_TEXT.back), "focus that was not lost is not moved");
    // Not taught: unknown with candidates. A candidate by keyboard, then "Nein": back to the first candidate.
    await camera.feedAll((i) => [trackerHand(0.7 - i * 0.012, 0.3 + i * 0.012, "Right")]);
    time.advance(RECOGNISE_GUARD_MS);
    buttonNamed("Stopp").focus();
    buttonNamed("Stopp").click();
    assert.equal(panel().dataset.state, "unknown");
    const candidates = () => tree(panel()).filter((element) => hasClass(element, "recognise-candidate"));
    assert.equal(doc.activeElement, candidates()[0], "no button on unknown: the first candidate");
    time.advance(RECOGNISE_GUARD_MS);
    const ball = candidates().find((candidate) => candidate.dataset.concept === "ball");
    ball.focus();
    ball.click();
    assert.equal(panel().dataset.state, "confirm");
    assert.equal(doc.activeElement, buttonNamed("Nein"));
    time.advance(RECOGNISE_GUARD_MS);
    buttonNamed("Nein").click();
    assert.equal(panel().dataset.state, "unknown");
    assert.equal(doc.activeElement, candidates()[0]);
    // Focus outside the view's buttons (here on the way back) stays where it is through a redraw.
    buttonNamed(RECOGNISE_TEXT.back).focus();
    time.advance(RECOGNISE_GUARD_MS);
    candidates()[0].click();
    assert.equal(doc.activeElement, buttonNamed(RECOGNISE_TEXT.back));
  });
});

// --- Front or back camera in the gesture view, and no camera picture (card NG-49) ---

test("controller: the camera asked for comes from the view's choice; a switch restarts the attempt with the other camera and keeps nothing", async () => {
  let facing = "user";
  const context = setup({ outcome: MATCH });
  const recogniser = createRecogniser({
    examples: [], onBoard: ON_BOARD, bridge: () => context.camera.bridge, host: () => ({}), setTimer: context.time.setTimer, now: context.time.now,
    speak: () => undefined, onChange: () => undefined, analyse: (frames) => { context.analysed.push(frames); return MATCH; }, facing: () => facing,
  });
  const flip = () => { facing = facing === "user" ? "environment" : "user"; };
  assert.equal(recogniser.switchCamera(flip), false, "nothing to switch while idle");
  assert.equal(facing, "user");
  recogniser.start();
  await settle();
  assert.deepEqual(context.camera.log.asked, ["user"]);
  assert.equal(recogniser.state().kind, "countdown");
  // Right after the camera was asked for: the second tap of "Gebärde" must not switch.
  assert.equal(recogniser.switchCamera(flip), false);
  context.time.advance(RECOGNISE_GUARD_MS);
  assert.equal(recogniser.switchCamera(flip), true);
  assert.equal(facing, "environment");
  assert.equal(context.camera.log.tracksStopped, 1, "the front camera is off");
  await settle();
  assert.deepEqual(context.camera.log.asked, ["user", { exact: "environment" }]);
  assert.equal(recogniser.state().kind, "countdown", "a new countdown with the other camera");
  // Switching while recording drops the frames: nothing is compared.
  context.time.advance(RECOGNISE_COUNTDOWN_S * 1000);
  assert.equal(recogniser.state().kind, "recording");
  await context.camera.feedAll(MOVES_RIGHT, 5);
  assert.equal(recogniser.switchCamera(flip), true);
  await settle();
  assert.deepEqual(context.analysed, [], "the recording of the old camera is not compared");
  assert.equal(recogniser.state().kind, "countdown");
  assert.deepEqual(context.camera.log.asked.at(-1), "user");
  // Not on an answer: there the camera is off and the switch is not shown.
  context.time.advance(RECOGNISE_COUNTDOWN_S * 1000);
  await context.camera.feedAll(MOVES_RIGHT);
  context.time.advance(RECOGNISE_GUARD_MS);
  recogniser.finish();
  assert.equal(recogniser.state().kind, "confirm");
  context.time.advance(RECOGNISE_GUARD_MS);
  assert.equal(recogniser.switchCamera(flip), false);
  assert.equal(facing, "user");
});

const cameraSwitch = (panel) => tree(panel).find((element) => hasClass(element, "recognise-camera"));

test("view: the camera switch is next to the way back while the camera starts or runs; a tap there films with the other camera and is remembered apart from teaching's choice", async () => {
  const choice = memoryStorage();
  await withView(async (context) => {
    const { panel, buttonNamed, time, camera } = context;
    context.gestureButton().click();
    const top = tree(panel()).find((element) => hasClass(element, "recognise-top"));
    const switcher = cameraSwitch(panel());
    assert.deepEqual(top.children, [buttonNamed(RECOGNISE_TEXT.back), switcher], "next to the way back");
    assert.equal(switcher.tagName, "button");
    assert.equal(switcher.hidden, false, "shown while the camera starts");
    assert.equal(textOf(switcher), "⇄ Kamera: vorne");
    assert.equal(switcher.attributes["aria-label"], "Kamera wechseln, jetzt vorne");
    await settle();
    assert.deepEqual(camera.log.asked, ["user"], "the front camera by default");
    time.advance(RECOGNISE_GUARD_MS);
    switcher.click();
    assert.equal(textOf(switcher), "⇄ Kamera: hinten");
    assert.equal(switcher.attributes["aria-label"], "Kamera wechseln, jetzt hinten");
    assert.equal(choice.items.get(RECOGNISE_FACING_KEY), "environment", "remembered on the device");
    await settle();
    assert.deepEqual(camera.log.asked, ["user", { exact: "environment" }]);
    assert.equal(panel().dataset.state, "countdown");
    assert.equal(cameraSwitch(panel()), switcher, "the same button at the same place");
    time.advance(RECOGNISE_COUNTDOWN_S * 1000);
    assert.equal(switcher.hidden, false, "also while recording");
    await camera.feedAll(MOVES_RIGHT);
    time.advance(RECOGNISE_GUARD_MS);
    buttonNamed("Stopp").click();
    assert.equal(panel().dataset.state, "confirm");
    assert.equal(switcher.hidden, true, "not with the answer: the camera is off");
    // The next attempt starts with the chosen camera.
    time.advance(RECOGNISE_GUARD_MS);
    buttonNamed("Nein").click();
    time.advance(GESTURE_SHIELD_MS);
    context.gestureButton().click();
    await settle();
    assert.deepEqual(camera.log.asked.at(-1), { exact: "environment" });
  }, { choice });
  // A new view on the same device starts with the remembered camera.
  await withView(async (context) => {
    context.gestureButton().click();
    await settle();
    assert.deepEqual(context.camera.log.asked, [{ exact: "environment" }]);
    assert.equal(cameraSwitch(context.panel()).dataset.facing, "environment");
  }, { choice });
});

test("view: a back camera that does not open says so and keeps the switch; a tap there goes back to the front camera", async () => {
  await withView(async (context) => {
    const { panel, time, camera } = context;
    context.gestureButton().click();
    await settle();
    assert.equal(panel().dataset.state, "problem");
    assert.match(textOf(panel()), /Die Kamera hinten geht gerade nicht\./);
    assert.deepEqual(camera.log.asked, [{ exact: "environment" }], "the front camera is not taken in its place");
    const switcher = cameraSwitch(panel());
    assert.equal(switcher.hidden, false, "the switch stays");
    time.advance(RECOGNISE_GUARD_MS);
    switcher.click();
    await settle();
    assert.deepEqual(camera.log.asked, [{ exact: "environment" }, "user"]);
    assert.equal(panel().dataset.state, "countdown");
  }, { camera: { noBackCamera: true }, choice: memoryStorage([[RECOGNISE_FACING_KEY, "environment"]]) });
});

test("view: the gesture view asks the bridge for a preview with the camera picture, or without it after 'Bild aus' was stored (cards NG-49, NG-52)", async () => {
  await withView(async (context) => {
    const { panel, camera } = context;
    const asked = [];
    const previews = recordingPreviews();
    camera.bridge.createPreview = (doc, options) => { asked.push(options); return previews.createPreview(doc); };
    context.gestureButton().click();
    await settle();
    assert.deepEqual(asked, [{ video: true }], "the picture is on by default (card NG-52)");
    assert.equal(slotOf(panel()).children[0], previews.made[0].element);
  });
  await withView(async (context) => {
    const asked = [];
    const previews = recordingPreviews();
    context.camera.bridge.createPreview = (doc, options) => { asked.push(options); return previews.createPreview(doc); };
    context.gestureButton().click();
    await settle();
    assert.deepEqual(asked, [{ video: false }], "points only after 'Bild aus' was chosen on this device");
  }, { choice: memoryStorage([[RECOGNISE_PICTURE_KEY, "off"]]) });
});

test("view: one device storage for teaching and the gesture view: teaching's 'hinten' is never read here, and the switch never writes teaching's key", async () => {
  assert.equal(RECOGNISE_FACING_KEY, "amysecho-recognise-facing");
  assert.notEqual(RECOGNISE_FACING_KEY, CAMERA_FACING_KEY);
  const device = choiceStorage("environment");
  await withView(async (context) => {
    const { panel, time, camera } = context;
    context.gestureButton().click();
    await settle();
    assert.deepEqual(camera.log.asked, ["user"], "teaching's 'hinten' on the same storage is not this view's choice");
    assert.equal(cameraSwitch(panel()).dataset.facing, "user");
    time.advance(RECOGNISE_GUARD_MS);
    cameraSwitch(panel()).click();
    await settle();
    assert.equal(device.items.get(RECOGNISE_FACING_KEY), "environment");
    time.advance(RECOGNISE_GUARD_MS);
    cameraSwitch(panel()).click();
    await settle();
    assert.equal(device.items.get(RECOGNISE_FACING_KEY), "user");
    assert.equal(device.items.get(CAMERA_FACING_KEY), "environment", "teaching's choice is left as it was");
    assert.deepEqual(camera.log.asked, ["user", { exact: "environment" }, "user"]);
  }, { camera: { storage: device }, choice: device });
});

test("view: when the camera switch has the focus and hides with the answer, the focus moves to the answer's first button", async () => {
  await withView(async (context) => {
    const { panel, time, camera, doc, buttonNamed } = context;
    await viewToRecording(context);
    await camera.feedAll(MOVES_RIGHT);
    cameraSwitch(panel()).focus();
    // The recording ends at its deadline; the switch is hidden with the answer.
    time.advance(RECOGNISE_MAX_RECORDING_MS);
    assert.equal(panel().dataset.state, "confirm");
    assert.equal(cameraSwitch(panel()).hidden, true);
    assert.equal(doc.activeElement, buttonNamed("Nein"), "not dropped to the page");
  });
});

// --- Camera picture on or off (card NG-52) ---

const pictureToggle = (panel) => tree(panel).find((element) => hasClass(element, "recognise-picture"));

test("view: 'Bild aus' and 'Bild an' in the picture's corner switch the camera picture while the camera runs, without restarting it; remembered on the device", async () => {
  const choice = memoryStorage();
  await withView(async (context) => {
    const { panel, time, camera, buttonNamed } = context;
    const previews = recordingPreviews();
    camera.bridge.createPreview = previews.createPreview;
    context.gestureButton().click();
    await settle();
    const toggle = pictureToggle(panel());
    assert.equal(toggle.tagName, "button");
    assert.equal(slotOf(panel()).children.at(-1), toggle, "in the picture's box");
    assert.equal(textOf(toggle), "◐ Bild aus", "the words say what a tap does");
    assert.equal(toggle.attributes["aria-label"], "Kamerabild", "one name in both states: aria-pressed says which");
    assert.equal(toggle.attributes["aria-pressed"], "true");
    toggle.click();
    assert.deepEqual(previews.made[0].videoSet, [false]);
    assert.equal(textOf(toggle), "◐ Bild an");
    assert.equal(toggle.attributes["aria-label"], "Kamerabild");
    assert.equal(toggle.attributes["aria-pressed"], "false");
    assert.equal(choice.items.get(RECOGNISE_PICTURE_KEY), "off");
    assert.equal(panel().dataset.state, "countdown", "the countdown goes on");
    // Into the recording, then back on: the camera never restarts, no frame is lost.
    time.advance(RECOGNISE_COUNTDOWN_S * 1000);
    await camera.feedAll(MOVES_RIGHT, 10);
    assert.equal(pictureToggle(panel()), toggle, "the same toggle in the recording");
    toggle.click();
    await camera.feedAll((i) => MOVES_RIGHT(i + 10), 10);
    assert.deepEqual(previews.made[0].videoSet, [false, true]);
    assert.equal(choice.items.get(RECOGNISE_PICTURE_KEY), "on");
    assert.equal(camera.log.cameraRequests, 1, "one camera start for the whole attempt");
    time.advance(RECOGNISE_GUARD_MS);
    buttonNamed("Stopp").click();
    assert.equal(panel().dataset.state, "confirm");
    assert.equal(panel().dataset.concept, "trinken", "all frames compared");
    assert.equal(pictureToggle(panel()), undefined, "no toggle with the answer: no picture");
  }, { choice });
});

test("view: no picture toggle without a preview; a focused toggle that goes with the picture hands the focus on", async () => {
  await withView(async (context) => {
    const { panel } = context;
    await viewToRecording(context);
    assert.equal(pictureToggle(panel()), undefined, "an older bridge without a preview: nothing to switch");
  });
  await withView(async (context) => {
    const { panel, time, camera, doc, buttonNamed } = context;
    camera.bridge.createPreview = recordingPreviews().createPreview;
    await viewToRecording(context);
    await camera.feedAll(MOVES_RIGHT);
    pictureToggle(panel()).focus();
    time.advance(RECOGNISE_MAX_RECORDING_MS);
    assert.equal(panel().dataset.state, "confirm");
    assert.equal(doc.activeElement, buttonNamed("Nein"), "not dropped to the page");
  });
});

// --- Continuous recognition, recognised gestures stacked (card NG-54) ---

import { SEGMENT_GAP_MS, SEGMENT_MAX_MS } from "../dist/recognition/segment.js";

/** Frames without a hand for longer than the gap (the fake camera sends one every 100 ms): the gesture before is finished. */
const handsDown = async (camera) => { for (let i = 0; i <= SEGMENT_GAP_MS / 100 + 1; i += 1) await camera.feed([]); };
const takenTiles = (panel) => tree(panel).filter((element) => hasClass(element, "recognise-taken-tile"));

test("controller, continuous: no countdown; each gesture ends when the hands leave the picture and is compared alone; a match is stacked, nothing is spoken", async () => {
  const outcomes = ["trinken", "nicht-da", null, "mehr", "trinken"];
  const analysed = [];
  const context = setup();
  const recogniser = createRecogniser({
    examples: [], onBoard: ON_BOARD, bridge: () => context.camera.bridge, host: () => ({}), setTimer: context.time.setTimer, now: context.time.now,
    speak: (id) => context.spoken.push(id), onChange: () => undefined, continuous: () => true,
    analyse: (frames) => {
      analysed.push(frames.length);
      const id = outcomes[analysed.length - 1];
      return id === null ? { kind: "unknown", reason: "too_far", candidates: [], hands: "right" } : { kind: "match", conceptId: id, hands: "right" };
    },
  });
  recogniser.start();
  await settle();
  assert.deepEqual(recogniser.state(), { kind: "listening", taken: [], dropped: false });
  for (let gesture = 0; gesture < outcomes.length; gesture += 1) {
    await context.camera.feedAll(MOVES_RIGHT, 12);
    await handsDown(context.camera);
  }
  assert.deepEqual(analysed, [12, 12, 12, 12, 12], "each gesture compared alone, with its own frames only");
  // "nicht-da" is not on the board and the unknown one adds nothing; "trinken" again moves to the end.
  assert.deepEqual(recogniser.state(), { kind: "listening", taken: ["mehr", "trinken"], dropped: false });
  assert.deepEqual(context.spoken, []);
  assert.equal(context.camera.running, true, "the camera goes on");
  // With more than one gesture there is no sentence: "Ja, sagen" does nothing.
  context.time.advance(RECOGNISE_GUARD_MS);
  recogniser.confirm();
  assert.deepEqual(context.spoken, []);
  assert.equal(recogniser.state().kind, "listening");
  // At most MAX_TAKEN, the oldest goes first.
  const many = [...ON_BOARD, "eins", "zwei", "drei"];
  let next = 0;
  const wide = setup();
  const busy = createRecogniser({
    examples: [], onBoard: new Set(many), bridge: () => wide.camera.bridge, host: () => ({}), setTimer: wide.time.setTimer, now: wide.time.now,
    speak: () => undefined, onChange: () => undefined, continuous: () => true,
    analyse: () => ({ kind: "match", conceptId: many[next++], hands: "right" }),
  });
  busy.start();
  await settle();
  for (let gesture = 0; gesture < many.length; gesture += 1) {
    await wide.camera.feedAll(MOVES_RIGHT, 5);
    await handsDown(wide.camera);
  }
  assert.equal(MAX_TAKEN, 6);
  assert.deepEqual(busy.state().taken, many.slice(-MAX_TAKEN));
});

test("controller, continuous: 'Fertig' finishes the gesture still going on; a movement longer than SEGMENT_MAX_MS is let go and said so", async () => {
  const analysed = [];
  const context = setup();
  const recogniser = createRecogniser({
    examples: [], onBoard: ON_BOARD, bridge: () => context.camera.bridge, host: () => ({}), setTimer: context.time.setTimer, now: context.time.now,
    speak: () => undefined, onChange: () => undefined, continuous: () => true,
    analyse: (frames) => { analysed.push(frames.length); return { kind: "match", conceptId: "hilfe", hands: "right" }; },
  });
  recogniser.start();
  await settle();
  // The hands stay up: nothing is finished until "Fertig", which counts only after the press guard.
  await context.camera.feedAll(MOVES_RIGHT, 15);
  assert.deepEqual(analysed, []);
  recogniser.finish();
  assert.deepEqual(analysed, [], "'Fertig' right after the view appeared does nothing");
  context.time.advance(RECOGNISE_GUARD_MS);
  recogniser.finish();
  assert.deepEqual(analysed, [15]);
  assert.deepEqual(recogniser.state().taken, ["hilfe"]);
  // Somebody stays in view, moving, for longer than a gesture can last: let go, never compared.
  const long = SEGMENT_MAX_MS / 100 + 5;
  await context.camera.feedAll((i) => MOVES_RIGHT(i % 20), long);
  assert.equal(recogniser.state().dropped, true);
  assert.deepEqual(analysed, [15]);
  // What is left of that movement goes too, until the hands leave the picture; then a gesture is compared on its own again.
  await context.camera.feedAll((i) => MOVES_RIGHT(i % 20), 8);
  await handsDown(context.camera);
  assert.deepEqual(analysed, [15], "the rest of the long movement is not compared");
  await context.camera.feedAll(MOVES_RIGHT, 10);
  await handsDown(context.camera);
  assert.deepEqual(analysed, [15, 10]);
  assert.equal(recogniser.state().dropped, false);
});

test("view, continuous: the gesture view listens, stacks what it recognised, a tile says its word, one gesture offers its sentence", async () => {
  await withView(async (context) => {
    const { panel, time, camera, speech, said, buttonNamed } = context;
    context.gestureButton().click();
    await settle();
    assert.equal(panel().dataset.state, "listening");
    assert.match(textOf(panel()), /Gebärden machen\. Dazwischen die Hände kurz runter\./);
    assert.ok(buttonNamed("Fertig") !== undefined);
    assert.equal(tree(panel()).find((element) => hasClass(element, "recognise-time")).hidden, true, "no seconds: no time limit");
    await camera.feedAll(MOVES_RIGHT);
    await handsDown(camera);
    assert.deepEqual(takenTiles(panel()).map((tile) => tile.dataset.concept), ["trinken"]);
    assert.ok(buttonNamed("Ja, sagen") !== undefined, "one gesture: its sentence is offered");
    assert.deepEqual(speech.spoken, [], "nothing spoken without a tap");
    // A second gesture: two tiles, no sentence.
    await camera.feedAll(MOVES_UP);
    await handsDown(camera);
    const tiles = takenTiles(panel());
    assert.deepEqual(tiles.map((tile) => tile.dataset.concept), ["ball", "trinken"], "newest first: the top of the stack is always in view");
    assert.equal(buttonNamed("Ja, sagen"), undefined);
    assert.equal(tiles[0].attributes["aria-label"], "Ball");
    assert.equal(cameraSwitch(panel()).hidden, false, "the camera switch while listening");
    // The tile that just appeared is guarded; afterwards a tap says only the word, and the camera goes on.
    tiles[0].click();
    assert.deepEqual(said, []);
    time.advance(RECOGNISE_GUARD_MS);
    takenTiles(panel())[0].click();
    takenTiles(panel())[1].click();
    assert.deepEqual(said, ["Ball", "Trinken"]);
    assert.deepEqual(speech.spoken, [], "not the sentence");
    assert.equal(camera.running, true);
    assert.equal(panel().dataset.state, "listening");
  }, { continuous: true });
  await withView(async (context) => {
    const { panel, time, camera, speech, buttonNamed } = context;
    context.gestureButton().click();
    await settle();
    await camera.feedAll(MOVES_RIGHT);
    await handsDown(camera);
    time.advance(RECOGNISE_GUARD_MS);
    buttonNamed("Ja, sagen").click();
    assert.deepEqual(speech.spoken, ["Ich möchte trinken."], "the sentence, once, through the board");
    assert.equal(panel(), null);
    assert.equal(camera.running, false);
  }, { continuous: true });
});

test("view, continuous: a movement too long to be a gesture says so; 'Zurück' always stops the camera", async () => {
  await withView(async (context) => {
    const { panel, camera, buttonNamed } = context;
    context.gestureButton().click();
    await settle();
    await camera.feedAll((i) => MOVES_RIGHT(i % 20), SEGMENT_MAX_MS / 100 + 5);
    assert.match(textOf(panel()), /Das war zu lang\. Hände kurz runter, dann neu\./);
    buttonNamed(RECOGNISE_TEXT.back).click();
    assert.equal(panel(), null);
    assert.equal(camera.running, false);
  }, { continuous: true });
});

test("controller, continuous: whenever the hands leave right as a too-long movement is let go, the next gesture is still compared", async () => {
  for (const extra of [0, 1, 2, 3]) {
    const analysed = [];
    const context = setup();
    const recogniser = createRecogniser({
      examples: [], onBoard: ON_BOARD, bridge: () => context.camera.bridge, host: () => ({}), setTimer: context.time.setTimer, now: context.time.now,
      speak: () => undefined, onChange: () => undefined, continuous: () => true,
      analyse: (frames) => { analysed.push(frames.length); return { kind: "match", conceptId: "hilfe", hands: "right" }; },
    });
    recogniser.start();
    await settle();
    await context.camera.feedAll((i) => MOVES_RIGHT(i % 20), SEGMENT_MAX_MS / 100 + extra);
    await handsDown(context.camera);
    await context.camera.feedAll(MOVES_RIGHT, 10);
    await handsDown(context.camera);
    assert.equal(analysed.at(-1), 10, `${SEGMENT_MAX_MS / 100 + extra} frames up: ${analysed}`);
    assert.deepEqual(recogniser.state().taken, ["hilfe"]);
  }
});

test("view, continuous: a new tile moves the others, so a press right after it says nothing; the focused picture toggle keeps the focus", async () => {
  await withView(async (context) => {
    const { panel, time, camera, said, doc } = context;
    camera.bridge.createPreview = recordingPreviews().createPreview;
    context.gestureButton().click();
    await settle();
    await camera.feedAll(MOVES_RIGHT);
    await handsDown(camera);
    time.advance(RECOGNISE_GUARD_MS);
    pictureToggle(panel()).focus();
    const slot = slotOf(panel());
    slot.moved = [];
    await camera.feedAll(MOVES_UP);
    await handsDown(camera);
    assert.deepEqual(takenTiles(panel()).map((tile) => tile.dataset.concept), ["ball", "trinken"]);
    assert.deepEqual(slot.moved, [], "the picture and its toggle stay in place while listening");
    assert.equal(doc.activeElement, pictureToggle(panel()), "the focus stays on the toggle");
    // "Trinken" moved from the first place to the second: a press there now was aimed at it before.
    takenTiles(panel())[1].click();
    assert.deepEqual(said, [], "a press right after the tiles moved says nothing");
    time.advance(RECOGNISE_GUARD_MS);
    takenTiles(panel())[1].click();
    assert.deepEqual(said, ["Trinken"]);
  }, { continuous: true });
});

// --- The continuous view, follow-ups (card NG-55) ---

test("controller, continuous: the camera stops after RECOGNISE_IDLE_MS without a hand and the tiles stay; a hand restarts the wait; 'Weiter' listens again with them", async () => {
  assert.equal(RECOGNISE_IDLE_MS, 180_000);
  const context = setup();
  const recogniser = createRecogniser({
    examples: [], onBoard: ON_BOARD, bridge: () => context.camera.bridge, host: () => ({}), setTimer: context.time.setTimer, now: context.time.now,
    speak: () => undefined, onChange: () => undefined, continuous: () => true, analyse: () => MATCH,
  });
  recogniser.start();
  await settle();
  await context.camera.feedAll(MOVES_RIGHT, 10);
  await handsDown(context.camera);
  context.time.advance(RECOGNISE_IDLE_MS - 1000);
  await context.camera.feed(MOVES_RIGHT(0));
  context.time.advance(RECOGNISE_IDLE_MS - 1000);
  await context.camera.feed([]);
  assert.equal(recogniser.state().kind, "listening", "a hand was seen less than the idle time ago");
  context.time.advance(1001);
  await context.camera.feed([]);
  assert.deepEqual(recogniser.state(), { kind: "paused", taken: ["trinken"] }, "the child's message stays");
  assert.equal(context.camera.running, false);
  // "Weiter": listening again, with the tiles; a press right after the pause appeared does nothing.
  recogniser.start();
  assert.equal(recogniser.state().kind, "paused");
  context.time.advance(RECOGNISE_GUARD_MS);
  recogniser.start();
  await settle();
  assert.deepEqual(recogniser.state(), { kind: "listening", taken: ["trinken"], dropped: false });
  assert.equal(context.camera.running, true);
});

test("controller, continuous: a camera switch keeps the stacked tiles; a new start begins empty", async () => {
  let facing = "user";
  const context = setup();
  const recogniser = createRecogniser({
    examples: [], onBoard: ON_BOARD, bridge: () => context.camera.bridge, host: () => ({}), setTimer: context.time.setTimer, now: context.time.now,
    speak: () => undefined, onChange: () => undefined, continuous: () => true, analyse: () => MATCH, facing: () => facing,
  });
  recogniser.start();
  await settle();
  await context.camera.feedAll(MOVES_RIGHT, 10);
  await handsDown(context.camera);
  assert.deepEqual(recogniser.state().taken, ["trinken"]);
  context.time.advance(RECOGNISE_GUARD_MS);
  assert.equal(recogniser.switchCamera(() => { facing = "environment"; }), true);
  await settle();
  assert.deepEqual(recogniser.state(), { kind: "listening", taken: ["trinken"], dropped: false }, "kept over the switch");
  recogniser.back();
  recogniser.start();
  await settle();
  assert.deepEqual(recogniser.state().taken, [], "a new start begins empty");
});

test("controller, continuous: the 'zu lang' line goes once the hands have left the picture", async () => {
  const context = setup();
  const recogniser = createRecogniser({
    examples: [], onBoard: ON_BOARD, bridge: () => context.camera.bridge, host: () => ({}), setTimer: context.time.setTimer, now: context.time.now,
    speak: () => undefined, onChange: () => undefined, continuous: () => true, analyse: () => ({ kind: "unknown", reason: "too_far", candidates: [], hands: "right" }),
  });
  recogniser.start();
  await settle();
  await context.camera.feedAll((i) => MOVES_RIGHT(i % 20), SEGMENT_MAX_MS / 100 + 5);
  assert.equal(recogniser.state().dropped, true);
  await handsDown(context.camera);
  assert.equal(recogniser.state().dropped, false, "the hint was followed: gone, though nothing was taken");
});

test("view, continuous: a tile that cannot be said shows the board's line; a new tile ends it", async () => {
  const lines = {
    false: /Keine deutsche Stimme\. Hol eine Bezugsperson\./,
    fails: /Vorlesen ging nicht\. Bitte noch einmal tippen\./,
    unavailable: /Keine Stimme\. Bitte noch einmal tippen\./,
  };
  for (const voice of [false, "fails", "unavailable"]) {
    await withView(async (context) => {
      const { panel, time, camera } = context;
      context.gestureButton().click();
      await settle();
      await camera.feedAll(MOVES_RIGHT);
      await handsDown(camera);
      time.advance(RECOGNISE_GUARD_MS);
      takenTiles(panel())[0].click();
      assert.match(textOf(panel()), lines[String(voice)], String(voice));
      if (voice === "unavailable" || voice === "fails") {
        // A second time in a row: tapping again does not help.
        time.advance(RECOGNISE_GUARD_MS);
        takenTiles(panel())[0].click();
        assert.match(textOf(panel()), /Hol eine Bezugsperson\./, `${voice}, second tap`);
      }
      assert.equal(takenTiles(panel()).length, 1, "the tile stays");
      await camera.feedAll(MOVES_UP);
      await handsDown(camera);
      assert.doesNotMatch(textOf(panel()), /Stimme|Vorlesen/, "a new tile ends the line");
    }, { continuous: true, voice });
  }
});

test("view, continuous: hiding the page, pagehide, a hidden board region and dispose stop the camera while listening", async () => {
  for (const how of ["visibilitychange", "pagehide", "region hidden", "dispose"]) {
    await withView(async (context) => {
      const { root, panel, camera, doc, win, attached } = context;
      context.gestureButton().click();
      await settle();
      assert.equal(panel().dataset.state, "listening");
      if (how === "visibilitychange") {
        doc.visibilityState = "hidden";
        doc.dispatch("visibilitychange");
      } else if (how === "pagehide") {
        win.dispatch("pagehide");
      } else if (how === "region hidden") {
        root.hidden = true;
        await camera.feed(MOVES_RIGHT(0));
        // The caregiver area covers the board: the view ends (card NG-63: asserted, not only the camera).
        assert.equal(attached.recogniser.state().kind, "idle", how);
      } else {
        attached.dispose();
      }
      assert.equal(camera.running, false, how);
    }, { continuous: true });
  }
});

test("controller, continuous: tiles carried to a camera that fails stay in the pause, not in a later start; a second switch while starting keeps them", async () => {
  let facing = "user";
  const camera = fakeCamera({ noBackCamera: true });
  const context = setup({ camera });
  const recogniser = createRecogniser({
    examples: [], onBoard: ON_BOARD, bridge: () => camera.bridge, host: () => ({}), setTimer: context.time.setTimer, now: context.time.now,
    speak: () => undefined, onChange: () => undefined, continuous: () => true, analyse: () => MATCH, facing: () => facing,
  });
  recogniser.start();
  await settle();
  await camera.feedAll(MOVES_RIGHT, 10);
  await handsDown(camera);
  context.time.advance(RECOGNISE_GUARD_MS);
  recogniser.switchCamera(() => { facing = "environment"; });
  await settle();
  assert.deepEqual(recogniser.state(), { kind: "paused", taken: ["trinken"], line: RECOGNISE_TEXT.backCamera }, "no back camera: the tiles stay, and the line says why");
  // The switch back to the front camera from the pause listens again with them.
  context.time.advance(RECOGNISE_GUARD_MS);
  assert.equal(recogniser.switchCamera(() => { facing = "user"; }), true);
  await settle();
  assert.deepEqual(recogniser.state(), { kind: "listening", taken: ["trinken"], dropped: false });
  // "Zurück", then a new start: it begins empty.
  recogniser.back();
  facing = "user";
  recogniser.start();
  await settle();
  assert.deepEqual(recogniser.state().taken, [], "an unrelated start begins empty");
  // A second switch while the first restart still starts keeps the tiles.
  const slow = fakeCamera({ holdTracker: true });
  const other = setup({ camera: slow });
  let side = "user";
  const held = createRecogniser({
    examples: [], onBoard: ON_BOARD, bridge: () => slow.bridge, host: () => ({}), setTimer: other.time.setTimer, now: other.time.now,
    speak: () => undefined, onChange: () => undefined, continuous: () => true, analyse: () => MATCH, facing: () => side,
  });
  held.start();
  await settle();
  slow.releaseTracker();
  await settle();
  await slow.feedAll(MOVES_RIGHT, 10);
  await handsDown(slow);
  assert.deepEqual(held.state().taken, ["trinken"]);
  other.time.advance(RECOGNISE_GUARD_MS);
  held.switchCamera(() => { side = "environment"; });
  assert.equal(held.state().kind, "starting");
  other.time.advance(RECOGNISE_GUARD_MS);
  held.switchCamera(() => { side = "user"; });
  slow.releaseTracker();
  await settle();
  assert.deepEqual(held.state().taken, ["trinken"]);
});

test("view, continuous: after minutes without a hand the camera is off, the tiles stay and can be said; 'Weiter' listens again", async () => {
  await withView(async (context) => {
    const { panel, time, camera, said, buttonNamed, speech } = context;
    context.gestureButton().click();
    await settle();
    await camera.feedAll(MOVES_RIGHT);
    await handsDown(camera);
    time.advance(RECOGNISE_IDLE_MS + 1);
    await camera.feed([]);
    assert.equal(panel().dataset.state, "paused");
    assert.equal(camera.running, false);
    assert.match(textOf(panel()), /Die Kamera ist aus\. Weiter mit ▶\./);
    assert.deepEqual(takenTiles(panel()).map((tile) => tile.dataset.concept), ["trinken"], "the message stays");
    assert.equal(slotOf(panel()), null, "no picture: the camera is off");
    time.advance(RECOGNISE_GUARD_MS);
    takenTiles(panel())[0].click();
    assert.deepEqual(said, ["Trinken"], "a tile still says its word");
    buttonNamed("Ja, sagen").click();
    assert.deepEqual(speech.spoken, ["Ich möchte trinken."]);
    assert.equal(panel(), null);
  }, { continuous: true });
  await withView(async (context) => {
    const { panel, time, camera, buttonNamed } = context;
    context.gestureButton().click();
    await settle();
    await camera.feedAll(MOVES_RIGHT);
    await handsDown(camera);
    time.advance(RECOGNISE_IDLE_MS + 1);
    await camera.feed([]);
    assert.equal(panel().dataset.state, "paused");
    time.advance(RECOGNISE_GUARD_MS);
    buttonNamed("Weiter").click();
    await settle();
    assert.equal(panel().dataset.state, "listening");
    assert.deepEqual(takenTiles(panel()).map((tile) => tile.dataset.concept), ["trinken"], "'Weiter' keeps the tiles");
    assert.equal(camera.running, true);
  }, { continuous: true });
  // Card NG-63: with no tile there is nothing to keep: idle goes back to the board.
  await withView(async (context) => {
    const { panel, time, camera } = context;
    context.gestureButton().click();
    await settle();
    time.advance(RECOGNISE_IDLE_MS + 1);
    await camera.feed([]);
    assert.equal(panel(), null);
    assert.equal(camera.running, false);
  }, { continuous: true });
});

test("view, continuous: two voice failures in a row reported after the call, as on a device, end with 'Hol eine Bezugsperson'", async () => {
  await withView(async (context) => {
    const { panel, time, camera, lateFailures } = context;
    context.gestureButton().click();
    await settle();
    await camera.feedAll(MOVES_RIGHT);
    await handsDown(camera);
    time.advance(RECOGNISE_GUARD_MS);
    takenTiles(panel())[0].click();
    lateFailures.shift()();
    assert.match(textOf(panel()), /Vorlesen ging nicht\. Bitte noch einmal tippen\./);
    time.advance(RECOGNISE_GUARD_MS);
    takenTiles(panel())[0].click();
    assert.doesNotMatch(textOf(panel()), /Vorlesen/, "a new try clears the line while it is said");
    lateFailures.shift()();
    assert.match(textOf(panel()), /Vorlesen geht nicht\. Hol eine Bezugsperson\./, "the second failure in a row");
  }, { continuous: true, voice: "fails later" });
});

test("controller, continuous: 'Weiter' that cannot start the camera keeps the tiles in the pause; hiding the page pauses and keeps them", async () => {
  const camera = fakeCamera();
  const context = setup({ camera });
  const recogniser = createRecogniser({
    examples: [], onBoard: ON_BOARD, bridge: () => camera.bridge, host: () => ({}), setTimer: context.time.setTimer, now: context.time.now,
    speak: () => undefined, onChange: () => undefined, continuous: () => true, analyse: () => MATCH,
  });
  recogniser.start();
  await settle();
  await camera.feedAll(MOVES_RIGHT, 10);
  await handsDown(camera);
  // The page is hidden (a screen lock): the camera goes off, the message stays.
  recogniser.hide();
  assert.deepEqual(recogniser.state(), { kind: "paused", taken: ["trinken"] });
  assert.equal(camera.running, false);
  recogniser.hide();
  assert.equal(recogniser.state().kind, "paused", "hidden again: still paused");
  // "Weiter", but the camera is now refused: the tiles stay, with the reason.
  const refused = fakeCamera({ cameraError: "NotAllowedError" });
  camera.bridge.start = refused.bridge.start;
  context.time.advance(RECOGNISE_GUARD_MS);
  recogniser.start();
  await settle();
  assert.deepEqual(recogniser.state(), { kind: "paused", taken: ["trinken"], line: RECOGNISE_TEXT.problems.denied });
});

test("controller, continuous: the camera failing while listening pauses with the tiles of now; hiding while 'Weiter' starts keeps them", async () => {
  let outcome = "trinken";
  const camera = fakeCamera();
  const context = setup({ camera });
  const recogniser = createRecogniser({
    examples: [], onBoard: ON_BOARD, bridge: () => camera.bridge, host: () => ({}), setTimer: context.time.setTimer, now: context.time.now,
    speak: () => undefined, onChange: () => undefined, continuous: () => true, analyse: () => ({ kind: "match", conceptId: outcome, hands: "right" }),
  });
  recogniser.start();
  await settle();
  await camera.feedAll(MOVES_RIGHT, 10);
  await handsDown(camera);
  recogniser.hide();
  context.time.advance(RECOGNISE_GUARD_MS);
  recogniser.start();
  await settle();
  outcome = "hilfe";
  await camera.feedAll(MOVES_RIGHT, 10);
  await handsDown(camera);
  assert.deepEqual(recogniser.state().taken, ["trinken", "hilfe"]);
  camera.fail();
  await settle();
  assert.equal(recogniser.state().kind, "paused");
  assert.deepEqual(recogniser.state().taken, ["trinken", "hilfe"], "the tiles of now, not of the start");
  assert.ok(recogniser.state().line.length > 0, "the line says why");
  // A start without carried tiles that fails while listening keeps them too.
  const fresh = fakeCamera();
  const other = setup({ camera: fresh });
  const plain = createRecogniser({
    examples: [], onBoard: ON_BOARD, bridge: () => fresh.bridge, host: () => ({}), setTimer: other.time.setTimer, now: other.time.now,
    speak: () => undefined, onChange: () => undefined, continuous: () => true, analyse: () => MATCH,
  });
  plain.start();
  await settle();
  await fresh.feedAll(MOVES_RIGHT, 10);
  await handsDown(fresh);
  fresh.fail();
  await settle();
  assert.deepEqual(plain.state().taken, ["trinken"]);
  assert.equal(plain.state().kind, "paused");
  // Hidden while "Weiter" still starts the camera: paused with the tiles, camera off.
  const slow = fakeCamera({ holdTracker: true });
  const third = setup({ camera: slow });
  const held = createRecogniser({
    examples: [], onBoard: ON_BOARD, bridge: () => slow.bridge, host: () => ({}), setTimer: third.time.setTimer, now: third.time.now,
    speak: () => undefined, onChange: () => undefined, continuous: () => true, analyse: () => MATCH,
  });
  held.start();
  await settle();
  slow.releaseTracker();
  await settle();
  await slow.feedAll(MOVES_RIGHT, 10);
  await handsDown(slow);
  held.hide();
  third.time.advance(RECOGNISE_GUARD_MS);
  held.start();
  assert.equal(held.state().kind, "starting");
  held.hide();
  assert.deepEqual(held.state(), { kind: "paused", taken: ["trinken"] });
  assert.equal(slow.running, false);
});

test("view, continuous: a problem line in the pause names 'Weiter', the button there", async () => {
  await withView(async (context) => {
    const { panel, camera, doc } = context;
    context.gestureButton().click();
    await settle();
    await camera.feedAll(MOVES_RIGHT);
    await handsDown(camera);
    camera.fail();
    await settle();
    assert.equal(panel().dataset.state, "paused");
    assert.match(textOf(panel()), /Bitte „Weiter“ tippen\./);
    assert.doesNotMatch(textOf(panel()), /Nochmal/);
    doc.visibilityState = "hidden";
    doc.dispatch("visibilitychange");
    assert.equal(panel().dataset.state, "paused", "hiding the page keeps the pause");
  }, { continuous: true });
});

test("controller, continuous: without a camera bridge, or a cancelled start, the carried tiles stay in the pause; a carried tile still says its word", async () => {
  let available = true;
  const camera = fakeCamera();
  const context = setup({ camera });
  const words = [];
  const recogniser = createRecogniser({
    examples: [], onBoard: ON_BOARD, bridge: () => (available ? camera.bridge : null), host: () => ({}), setTimer: context.time.setTimer, now: context.time.now,
    speak: () => undefined, onChange: () => undefined, continuous: () => true, analyse: () => MATCH, sayWord: (id) => words.push(id),
  });
  recogniser.start();
  await settle();
  await camera.feedAll(MOVES_RIGHT, 10);
  await handsDown(camera);
  recogniser.hide();
  available = false;
  context.time.advance(RECOGNISE_GUARD_MS);
  recogniser.start();
  assert.deepEqual(recogniser.state(), { kind: "paused", taken: ["trinken"], line: RECOGNISE_TEXT.noCamera }, "no bridge: the tiles stay");
  // A start cancelled before the camera answered (no problem): the pause keeps the tiles.
  available = true;
  const held = fakeCamera({ holdTracker: true });
  camera.bridge.start = held.bridge.start;
  context.time.advance(RECOGNISE_GUARD_MS);
  recogniser.start();
  assert.equal(recogniser.state().kind, "starting");
  recogniser.hide();
  held.releaseTracker();
  await settle();
  assert.deepEqual(recogniser.state().taken, ["trinken"]);
  // A start that ends without a problem (a permission prompt dismissed): the pause keeps the tiles.
  camera.bridge.start = async () => ({ ok: false });
  context.time.advance(RECOGNISE_GUARD_MS);
  recogniser.start();
  await settle();
  assert.deepEqual(recogniser.state(), { kind: "paused", taken: ["trinken"] }, "refused without a problem");
  // Back to listening with the carried tile: its guard is kept, so a tap says its word.
  camera.bridge.start = fakeCamera().bridge.start;
  const again = fakeCamera();
  camera.bridge.start = again.bridge.start;
  context.time.advance(RECOGNISE_GUARD_MS);
  recogniser.start();
  await settle();
  assert.equal(recogniser.state().kind, "listening");
  context.time.advance(RECOGNISE_GUARD_MS);
  recogniser.sayWord("trinken");
  assert.deepEqual(words, ["trinken"], "a carried tile can be said after 'Weiter'");
});

test("view, continuous: a word said to its end resets the failures in a row", async () => {
  let mode = "fails later";
  await withView(async (context) => {
    const { panel, time, camera, lateFailures } = context;
    context.gestureButton().click();
    await settle();
    await camera.feedAll(MOVES_RIGHT);
    await handsDown(camera);
    time.advance(RECOGNISE_GUARD_MS);
    takenTiles(panel())[0].click();
    lateFailures.shift()();
    assert.match(textOf(panel()), /Vorlesen ging nicht/);
    context.setVoice("ends");
    time.advance(RECOGNISE_GUARD_MS);
    takenTiles(panel())[0].click();
    context.setVoice("fails later");
    time.advance(RECOGNISE_GUARD_MS);
    takenTiles(panel())[0].click();
    lateFailures.shift()();
    assert.match(textOf(panel()), /Vorlesen ging nicht\. Bitte noch einmal tippen\./, "after a word said to its end, a failure is the first again");
  }, { continuous: true, voice: mode });
});

test("view, continuous: the failures in a row go on across 'Weiter': the second one asks for a caregiver", async () => {
  await withView(async (context) => {
    const { panel, time, camera, lateFailures, buttonNamed, attached } = context;
    context.gestureButton().click();
    await settle();
    await camera.feedAll(MOVES_RIGHT);
    await handsDown(camera);
    time.advance(RECOGNISE_GUARD_MS);
    takenTiles(panel())[0].click();
    lateFailures.shift()();
    attached.recogniser.hide();
    time.advance(RECOGNISE_GUARD_MS);
    buttonNamed("Weiter").click();
    await settle();
    assert.equal(panel().dataset.state, "listening");
    time.advance(RECOGNISE_GUARD_MS);
    takenTiles(panel())[0].click();
    lateFailures.shift()();
    assert.match(textOf(panel()), /Vorlesen geht nicht\. Hol eine Bezugsperson\./);
  }, { continuous: true, voice: "fails later" });
});


// --- Vormachen (card NG-56): a caregiver's clip in the gesture view; the clips are a few made-up bytes ---

const CLIP = "data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYEC";
const BALL_CLIP = "data:video/mp4;base64,AAAAGGZ0eXBtcDQy";
/** Clips by concept; `loads` lists what was read. A load answers when `release` is called if `hold` is set. */
function demoClips(clips, { hold = false } = {}) {
  const loads = [];
  const waiting = [];
  return {
    loads,
    release: () => { for (const answer of waiting.splice(0)) answer(); },
    demos: {
      ids: Object.keys(clips),
      load: (id) => {
        loads.push(id);
        const value = clips[id];
        const answer = value instanceof Error ? Promise.reject(value) : Promise.resolve(value ?? null);
        if (!hold) return answer;
        return new Promise((resolve) => { waiting.push(() => resolve(answer)); });
      },
    },
  };
}
const demoBoxOf = (panel) => tree(panel).find((element) => hasClass(element, "recognise-demo"));
const demoOpener = (panel) => tree(panel).find((element) => hasClass(element, "recognise-demo-open"));
const demoVideoOf = (panel) => tree(demoBoxOf(panel)).find((element) => element.tagName === "video") ?? null;
const demoButtonsOf = (panel) => tree(demoBoxOf(panel)).filter((element) => element.tagName === "button").map((element) => element.attributes["aria-label"]);

test("view, Vormachen: no clip, no button; with clips the top offers 'Vormachen', which lists the concepts with a clip in board order", async () => {
  await withView(async (context) => {
    context.gestureButton().click();
    await settle();
    assert.equal(demoOpener(context.panel()), undefined);
    assert.equal(demoBoxOf(context.panel()).hidden, true);
  }, { continuous: true });
  // "ball" before "trinken" in the list given; the board order decides. An id not on the board is left out.
  const clips = demoClips({ ball: BALL_CLIP, trinken: CLIP, "nicht-da": CLIP });
  clips.demos.ids = ["ball", "nicht-da", "trinken"];
  await withView(async (context) => {
    const { panel, doc } = context;
    context.gestureButton().click();
    await settle();
    const opener = demoOpener(panel());
    assert.equal(opener.attributes["aria-label"], "Vormachen");
    assert.equal(textOf(opener), "▷ Vormachen");
    opener.click();
    const box = demoBoxOf(panel());
    assert.equal(box.hidden, false);
    assert.equal(panel().dataset.demo, "choose");
    assert.match(textOf(box), /Welche Gebärde vormachen\?/);
    const choices = tree(box).filter((element) => hasClass(element, "recognise-demo-choice"));
    assert.deepEqual(choices.map((tile) => tile.dataset.concept), ["trinken", "ball"], "board order (card NG-60)");
    assert.equal(doc.activeElement, choices[0]);
    assert.deepEqual(clips.loads, [], "nothing is read before a choice");
    // "Schließen": the box goes, the focus returns to "Vormachen", the view listens on.
    tree(box).find((element) => element.attributes["aria-label"] === "Schließen").click();
    assert.equal(box.hidden, true);
    assert.equal(panel().dataset.demo, undefined);
    assert.equal(doc.activeElement, opener);
    assert.equal(panel().dataset.state, "listening");
  }, { continuous: true, demos: clips.demos });
});

test("view, Vormachen: the chosen clip plays large and muted with 'Nochmal', 'Langsam' and 'Spiegeln'; imitating it stacks its tile while it plays", async () => {
  const clips = demoClips({ trinken: CLIP, ball: BALL_CLIP });
  const choice = memoryStorage();
  await withView(async (context) => {
    const { panel, camera, doc, buttonNamed } = context;
    context.gestureButton().click();
    await settle();
    demoOpener(panel()).click();
    tree(demoBoxOf(panel())).find((element) => element.dataset.concept === "trinken").click();
    assert.equal(panel().dataset.demo, "play");
    assert.match(textOf(demoBoxOf(panel())), /Der Clip wird geladen …/);
    await settle();
    assert.deepEqual(clips.loads, ["trinken"]);
    const video = demoVideoOf(panel());
    assert.equal(video.src, CLIP);
    assert.equal(video.muted, true);
    assert.equal(video.autoplay, true);
    assert.equal(video.playsInline, true);
    assert.equal(video.attributes["aria-label"], "Trinken vorgemacht");
    assert.equal(video.playbackRate, 1);
    assert.equal(video.dataset.mirrored, "false");
    assert.deepEqual(demoButtonsOf(panel()), ["Nochmal", "Langsam", "Spiegeln", "Schließen"]);
    assert.equal(doc.activeElement?.attributes["aria-label"], "Nochmal", "the focus moves from 'Schließen' to 'Nochmal' once the clip is there");
    // "Nochmal" starts the clip again.
    video.currentTime = 2.5;
    let played = 0;
    video.play = () => { played += 1; return Promise.resolve(); };
    tree(demoBoxOf(panel())).find((element) => element.attributes["aria-label"] === "Nochmal").click();
    assert.equal(video.currentTime, 0);
    assert.equal(played, 1);
    // "Langsam" and "Spiegeln" switch, say so, and are remembered.
    const slow = tree(demoBoxOf(panel())).find((element) => element.attributes["aria-label"] === "Langsam");
    const mirror = tree(demoBoxOf(panel())).find((element) => element.attributes["aria-label"] === "Spiegeln");
    assert.equal(slow.attributes["aria-pressed"], "false");
    slow.click();
    assert.equal(video.playbackRate, DEMO_SLOW_RATE);
    assert.equal(video.defaultPlaybackRate, DEMO_SLOW_RATE);
    assert.equal(slow.attributes["aria-pressed"], "true");
    mirror.click();
    assert.equal(video.dataset.mirrored, "true");
    assert.equal(mirror.attributes["aria-pressed"], "true");
    assert.equal(choice.items.get(RECOGNISE_DEMO_SLOW_KEY), "on");
    assert.equal(choice.items.get(RECOGNISE_DEMO_MIRROR_KEY), "on");
    // The child imitates while the clip is there: the view listens on and stacks the tile.
    await camera.feedAll(MOVES_RIGHT);
    await handsDown(camera);
    assert.deepEqual(takenTiles(panel()).map((tile) => tile.dataset.concept), ["trinken"]);
    assert.equal(demoVideoOf(panel()), video, "the clip stays while a tile is stacked");
    assert.equal(panel().dataset.state, "listening");
    assert.equal(camera.running, true);
    // Back to the board: the clip goes with the view.
    const box = demoBoxOf(panel());
    let paused = 0;
    video.pause = () => { paused += 1; };
    buttonNamed(RECOGNISE_TEXT.back).click();
    assert.equal(panel(), null);
    assert.equal(box.hidden, true);
    assert.deepEqual(box.children, []);
    assert.equal(paused, 1);
  }, { continuous: true, demos: clips.demos, choice });
  // A new view starts slow and mirrored, as chosen; with one clip "Vormachen" plays it at once.
  const one = demoClips({ ball: BALL_CLIP });
  await withView(async (context) => {
    const { panel } = context;
    context.gestureButton().click();
    await settle();
    demoOpener(panel()).click();
    await settle();
    const video = demoVideoOf(panel());
    assert.equal(video.src, BALL_CLIP);
    assert.equal(video.playbackRate, DEMO_SLOW_RATE);
    assert.equal(video.dataset.mirrored, "true");
  }, { continuous: true, demos: one.demos, choice });
});

test("view, Vormachen: a clip that cannot be read says so; a clip read after the box was closed is dropped", async () => {
  const clips = demoClips({ trinken: null, ball: new Error("read failed"), hilfe: "data:text/html;base64,PHNjcmlwdD4=" });
  await withView(async (context) => {
    const { panel } = context;
    context.gestureButton().click();
    await settle();
    for (const id of ["hilfe", "trinken", "ball"]) {
      demoOpener(panel()).click();
      tree(demoBoxOf(panel())).find((element) => element.dataset.concept === id).click();
      await settle();
      assert.match(textOf(demoBoxOf(panel())), /Dieser Clip kann gerade nicht abgespielt werden\./, id);
      assert.equal(demoVideoOf(panel()), null);
      assert.deepEqual(demoButtonsOf(panel()), ["Schließen"]);
      tree(demoBoxOf(panel())).find((element) => element.attributes["aria-label"] === "Schließen").click();
    }
  }, { continuous: true, demos: clips.demos });
  const slow = demoClips({ trinken: CLIP }, { hold: true });
  await withView(async (context) => {
    const { panel } = context;
    context.gestureButton().click();
    await settle();
    demoOpener(panel()).click();
    tree(demoBoxOf(panel())).find((element) => element.attributes["aria-label"] === "Schließen").click();
    slow.release();
    await settle();
    assert.equal(demoBoxOf(panel()).hidden, true);
    assert.equal(demoVideoOf(panel()), null);
  }, { continuous: true, demos: slow.demos });
});

test("view, Vormachen (card NG-59): a clip this browser cannot play says so instead of an empty box; the focus stays in the box", async () => {
  const clips = demoClips({ trinken: CLIP });
  await withView(async (context) => {
    const { panel, doc } = context;
    context.gestureButton().click();
    await settle();
    demoOpener(panel()).click();
    await settle();
    const video = demoVideoOf(panel());
    assert.equal(doc.activeElement?.attributes["aria-label"], "Nochmal");
    video.dispatch("error");
    assert.equal(demoVideoOf(panel()), null);
    assert.match(textOf(demoBoxOf(panel())), /Dieser Clip kann gerade nicht abgespielt werden\./);
    assert.deepEqual(demoButtonsOf(panel()), ["Schließen"]);
    assert.equal(doc.activeElement?.attributes["aria-label"], "Schließen");
    assert.equal(panel().dataset.state, "listening");
  }, { continuous: true, demos: clips.demos });
});

test("view, Vormachen (card NG-60): a tap on a demo control leaves no press time behind; a playback error keeps the status line in place", async () => {
  const clips = demoClips({ trinken: CLIP });
  await withView(async (context) => {
    const { panel, camera, time, speech, buttonNamed } = context;
    context.gestureButton().click();
    await settle();
    // A finger on "Vormachen", then on "Schließen".
    panel().dispatch("pointerdown");
    demoOpener(panel()).click();
    await settle();
    const line = tree(demoBoxOf(panel())).find((element) => hasClass(element, "recognise-demo-line"));
    demoVideoOf(panel()).dispatch("error");
    assert.ok(demoBoxOf(panel()).children.includes(line), "the same status line, not taken out and put back");
    assert.equal(line.textContent, "Dieser Clip kann gerade nicht abgespielt werden.");
    panel().dispatch("pointerdown");
    tree(demoBoxOf(panel())).find((element) => element.attributes["aria-label"] === "Schließen").click();
    // A gesture is recognised; after the guard a key press (no pointer) on "Ja, sagen" counts.
    await camera.feedAll(MOVES_RIGHT);
    await handsDown(camera);
    time.advance(RECOGNISE_GUARD_MS);
    buttonNamed("Ja, sagen").click();
    assert.deepEqual(speech.spoken, ["Ich möchte trinken."]);
  }, { continuous: true, demos: clips.demos });
});

// --- Card NG-63: the code points of NG-57 ---

test("view, continuous (card NG-63): a voice report of an earlier tile tap changes nothing; voice trouble counts carry across a camera switch", async () => {
  await withView(async (context) => {
    const { panel, time, camera, lateFailures } = context;
    context.gestureButton().click();
    await settle();
    await camera.feedAll(MOVES_RIGHT);
    await handsDown(camera);
    time.advance(RECOGNISE_GUARD_MS);
    takenTiles(panel())[0].click();
    time.advance(RECOGNISE_GUARD_MS);
    takenTiles(panel())[0].click();
    // The first word was stopped by the second tap; its report comes late and is stale.
    lateFailures.shift()();
    assert.doesNotMatch(textOf(panel()), /Vorlesen/, "a report of an earlier tap says nothing");
    lateFailures.shift()();
    assert.match(textOf(panel()), /Vorlesen ging nicht\. Bitte noch einmal tippen\./, "the latest tap's failure counts once");
    // A camera switch: the count carries on, as across "Weiter".
    cameraSwitch(panel()).click();
    await settle();
    assert.equal(panel().dataset.state, "listening");
    time.advance(RECOGNISE_GUARD_MS);
    takenTiles(panel())[0].click();
    lateFailures.shift()();
    assert.match(textOf(panel()), /Vorlesen geht nicht\. Hol eine Bezugsperson\./, "the second failure in a row, across the switch");
  }, { continuous: true, voice: "fails later" });
});

test("view, continuous (card NG-63): a tile's voice failing in the pause keeps the keyboard focus on that tile", async () => {
  await withView(async (context) => {
    const { panel, time, camera, doc } = context;
    context.gestureButton().click();
    await settle();
    await camera.feedAll(MOVES_RIGHT);
    await handsDown(camera);
    time.advance(RECOGNISE_IDLE_MS + 1);
    await camera.feed([]);
    assert.equal(panel().dataset.state, "paused");
    time.advance(RECOGNISE_GUARD_MS);
    const tile = takenTiles(panel())[0];
    tile.focus();
    tile.click();
    assert.match(textOf(panel()), /Vorlesen ging nicht/);
    assert.equal(doc.activeElement?.dataset.concept, "trinken", "not moved to 'Weiter'");
    assert.ok(hasClass(doc.activeElement, "recognise-taken-tile"));
  }, { continuous: true, voice: "fails" });
});

test("view, continuous (card NG-63): a hidden page noticed first through a frame pauses with the tiles", async () => {
  await withView(async (context) => {
    const { panel, camera, doc, attached } = context;
    context.gestureButton().click();
    await settle();
    await camera.feedAll(MOVES_RIGHT);
    await handsDown(camera);
    // The page is hidden, and a frame arrives before the visibilitychange event.
    doc.visibilityState = "hidden";
    await camera.feed(MOVES_RIGHT(0));
    assert.equal(attached.recogniser.state().kind, "paused");
    assert.deepEqual(attached.recogniser.state().taken, ["trinken"]);
    assert.equal(camera.running, false);
    assert.ok(panel() !== null);
  }, { continuous: true });
});

test("controller, continuous (card NG-63): idle also comes when no frame can be read", async () => {
  await withView(async (context) => {
    const { panel, time, camera, attached } = context;
    context.gestureButton().click();
    await settle();
    await camera.feedAll(MOVES_RIGHT);
    await handsDown(camera);
    time.advance(RECOGNISE_IDLE_MS + 1);
    // A hand without points: converting the frame throws, and that counts as a frame without a hand.
    await camera.feed([{ label: "Right", score: 0.9 }]);
    assert.equal(attached.recogniser.state().kind, "paused");
    assert.equal(camera.running, false);
    assert.ok(panel() !== null);
  }, { continuous: true });
});
