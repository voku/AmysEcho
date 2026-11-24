// Recognising a gesture on the board (card NG-20, docs/recognise.md): the controller in Node
// with the real capture path (`startCapture`) on a fake camera and tracker, a clock and timers
// moved by hand, and the view on a fake document with the real board.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CAPTURE_BRIDGE_KEY, MAX_CANDIDATES, RECOGNISE_COUNTDOWN_S, RECOGNISE_GUARD_MS, RECOGNISE_MAX_RECORDING_MS, RECOGNISE_SECONDS, RECOGNISE_TEXT, SEEN_HOLD_MS,
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

async function withView(callback, { examples = [example("trinken", MOVES_RIGHT), example("trinken", MOVES_RIGHT, 0.002), example("ball", MOVES_UP), example("ball", MOVES_UP, 0.002)], camera: cameraOptions = {} } = {}) {
  const fakes = installDocument();
  try {
    const time = fakeTime();
    const camera = fakeCamera(cameraOptions);
    const root = fakeElement("section");
    let open = () => undefined;
    const board = mountBoard(root, VIEW, { now: time.now, gesture: { onStart: () => open() } });
    const attached = attachRecognise({ root, board, entries: ENTRIES, examples, capture: camera.bridge, setTimer: time.setTimer, now: time.now });
    open = attached.open;
    const panel = () => root.children.find((child) => hasClass(child, "recognise")) ?? null;
    const buttonNamed = (text) => tree(panel() ?? root).find((element) => element.tagName === "button" && (element.textContent === text || element.attributes["aria-label"] === text));
    const tile = (label) => root.children.find((child) => hasClass(child, "concept-board")).children.find((element) => element.attributes["aria-label"] === label);
    const gestureButton = () => root.children.find((child) => hasClass(child, "gesture-start"));
    await callback({ ...fakes, time, camera, root, board, attached, panel, buttonNamed, tile, gestureButton, sentence: () => root.children[1].children[0].textContent });
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

test("view: the gesture view has no camera control and draws every state the same whatever camera is stored", async () => {
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
      assert.equal(tree(panel()).some((element) => /Kamera:|vorne|hinten/.test(element.textContent)), false, "no camera choice on the child's screen");
      assert.equal(tree(panel()).some((element) => hasClass(element, "camera-choice")), false);
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
    assert.deepEqual(slot.children.map((element) => element.className), ["capture-preview", "recognise-count"], "the count large over the picture");
    assert.equal(slot.children[0], preview.element);
    assert.equal(slot.children[1].textContent, "3");
    const main = tree(panel()).find((element) => hasClass(element, "recognise-main"));
    assert.deepEqual(main.children.map((element) => element.className), ["recognise-line", "recognise-preview", "recognise-feedback"], "the line above the picture, the feedback row (card NG-45) below it");
    time.advance(1000);
    assert.equal(slotOf(panel()), slot);
    assert.deepEqual(slot.children.map((element) => element.textContent), ["", "2"]);
    await camera.feed(MOVES_RIGHT(0));
    assert.equal(preview.drawn.length, 1, "frames of the countdown are drawn, not kept");
    time.advance((RECOGNISE_COUNTDOWN_S - 1) * 1000);
    assert.equal(panel().dataset.state, "recording");
    assert.equal(slotOf(panel()), slot, "the same box in the recording: the picture does not jump");
    assert.deepEqual(slot.children, [preview.element]);
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
  // The first tick was due at 1 s and came at 1.9 s; the next one, due at 2 s, also came late.
  // Counting callbacks would show 4 and then 3 at 2.9 s; the deadline gives 4 at 1.9 s, and 3 at 2.9 s.
  assert.deepEqual(left, [5, 4]);
  time.advance(1000);
  assert.deepEqual(left, [5, 4, 3], "never behind the time actually left");
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
    for (let second = 1; second < RECOGNISE_COUNTDOWN_S; second += 1) time.advance(1000);
    time.advance(1000);
    assert.equal(panel().dataset.state, "recording");
    await camera.feed(MOVES_RIGHT(0));
    assert.deepEqual(main.moved.filter(([, node]) => node === feedback || node === slot), [], "no removal or insertion of the region or the picture box");
    assert.ok(main.moved.some(([kind, node]) => kind === "in" && hasClass(node, "recognise-line")), "the line is new on each draw: that is how the countdown is spoken");
    assert.deepEqual(main.children.map((element) => element.className), ["recognise-line", "recognise-preview", "recognise-feedback"]);
    // With the answer the row goes: out of the page, nothing more to announce.
    await camera.feedAll(MOVES_RIGHT);
    time.advance(RECOGNISE_GUARD_MS);
    buttonNamed("Stopp").click();
    assert.ok(main.moved.some(([kind, node]) => kind === "out" && node === feedback));
    assert.equal(main.children.includes(feedback), false);
  });
});
