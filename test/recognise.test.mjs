// Recognising a gesture on the board (card NG-20, docs/recognise.md): the controller in Node
// with the real capture path (`startCapture`) on a fake camera and tracker, a clock and timers
// moved by hand, and the view on a fake document with the real board.
import assert from "node:assert/strict";
import test from "node:test";
import {
  CAPTURE_BRIDGE_KEY, MAX_CANDIDATES, RECOGNISE_COUNTDOWN_S, RECOGNISE_GUARD_MS, RECOGNISE_MAX_RECORDING_MS, RECOGNISE_TEXT,
  analyseAttempt, attachRecognise, createRecogniser,
} from "../dist/recognise/recognise.js";
import { BOARD_SHIELD_MS, GESTURE_LABEL, GESTURE_SHIELD_MS, mountBoard } from "../dist/board.js";
import { CAPTURE_BRIDGE_KEY as CAPTURE_MODULE_KEY, CAPTURE_TEXT, nextShoulders, startCapture } from "../dist/capture/capture.js";
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

/** `startCapture` with a fake tracker and camera; `feed` hands one frame in and waits until it is tracked. */
function fakeCamera({ cameraError = null, holdTracker = false } = {}) {
  const log = { trackerStarts: 0, cameraRequests: 0, tracksStopped: 0, trackerClosed: 0, sourceClosed: 0, hosts: [] };
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
    async getUserMedia() {
      log.cameraRequests += 1;
      if (cameraError !== null) throw Object.assign(new Error("camera"), { name: cameraError });
      return { getTracks: () => [{ stop() { log.tracksStopped += 1; } }] };
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
  const bridge = {
    start(host, options) {
      log.hosts.push(host);
      return startCapture(environment, options);
    },
    text: CAPTURE_TEXT,
    nextShoulders,
  };
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
    replaceChildren(...nodes) { this.children = nodes; },
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

async function withView(callback, { examples = [example("trinken", MOVES_RIGHT), example("trinken", MOVES_RIGHT, 0.002), example("ball", MOVES_UP), example("ball", MOVES_UP, 0.002)] } = {}) {
  const fakes = installDocument();
  try {
    const time = fakeTime();
    const camera = fakeCamera();
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
    assert.deepEqual(noButton.children.map((element) => element.textContent || element.tagName), ["\u2717", "Nein"]);
    assert.deepEqual(yesButton.children.map((element) => element.textContent || element.tagName), ["\u2713", "img", "Ja, sagen"]);
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
