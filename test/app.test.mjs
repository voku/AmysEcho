// The app controller and recognising a gesture (card NG-20): which board gets the "Gebärde"
// control, that the examples are read again on every refresh, and that a refresh ends the camera.
// The board itself is tested in board.test.mjs, the gesture view in recognise.test.mjs.
import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../dist/app.js";
import { putCustomConcept, setBoardConcepts } from "../dist/board-data.js";
import { CAPTURE_TEXT, nextShoulders, startCapture } from "../dist/capture/capture.js";
import { CONCEPTS } from "../dist/concepts.js";
import { deleteExamples, saveExample, sequenceFromRecording } from "../dist/recognition/examples.js";
import { setDemoClip } from "../dist/demo-clips.js";
import { HAND_POINTS } from "../dist/recognition/features.js";
import { MemoryBackend } from "../dist/profiles/memory-backend.js";
import { ProfileStore } from "../dist/profiles/store.js";

const turn = () => new Promise((resolve) => setImmediate(resolve));
const settle = async () => { for (let i = 0; i < 30; i += 1) await turn(); };

function fakeElement(tagName) {
  return {
    tagName, textContent: "", className: "", children: [], dataset: {}, attributes: {}, listeners: {}, hidden: false,
    setAttribute(name, value) { this.attributes[name] = String(value); },
    addEventListener(name, handler) { (this.listeners[name] ??= []).push(handler); },
    removeEventListener(name, handler) { this.listeners[name] = (this.listeners[name] ?? []).filter((other) => other !== handler); },
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = nodes; },
    removeChild(node) { this.children = this.children.filter((child) => child !== node); return node; },
    insertBefore(node, before) {
      this.children = this.children.filter((child) => child !== node);
      this.children.splice(before === null ? this.children.length : this.children.indexOf(before), 0, node);
      return node;
    },
    click() { for (const handler of [...(this.listeners.click ?? [])]) handler({ preventDefault() {} }); },
  };
}
const hasClass = (element, name) => element.className.split(" ").includes(name);

async function withPage(callback) {
  const previous = { document: globalThis.document, window: globalThis.window, SpeechSynthesisUtterance: globalThis.SpeechSynthesisUtterance };
  const spoken = [];
  const doc = fakeElement("#document");
  doc.createElement = fakeElement;
  doc.visibilityState = "visible";
  const win = fakeElement("#window");
  win.speechSynthesis = {
    cancel() {}, getVoices: () => [{ lang: "de-DE", localService: true }], addEventListener() {}, removeEventListener() {},
    speak(utterance) { spoken.push(utterance.text); },
  };
  globalThis.document = doc;
  globalThis.window = win;
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  try {
    const root = fakeElement("section");
    const page = {
      root, spoken, doc,
      gestureControl: () => root.children.find((child) => hasClass(child, "gesture-start")) ?? null,
      panel: () => root.children.find((child) => hasClass(child, "recognise")) ?? null,
      labels: () => (root.children.find((child) => hasClass(child, "concept-board"))?.children ?? [])
        .filter((child) => child.tagName === "button").map((button) => button.attributes["aria-label"]),
    };
    await callback(page);
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  }
}

/** A made-up tracker hand (no child data). */
function trackerHand(x, y, label) {
  const landmarks = Array.from({ length: HAND_POINTS }, (_, index) => {
    if (index === 0) return { x, y };
    const finger = Math.floor((index - 1) / 4);
    return { x: x + (finger - 2) * 0.02, y: y - ((index - 1) % 4 + 1) * 0.024 };
  });
  return { landmarks, label, score: 0.95 };
}
const POSE = Array.from({ length: 33 }, (_, index) => ({ x: index === 11 ? 0.62 : index === 12 ? 0.38 : 0.5, y: 0.55, visibility: 0.99 }));
const SEQUENCE = (() => {
  const recording = sequenceFromRecording(Array.from({ length: 20 }, (_, i) => ({
    timestampMs: i * 100, imageWidth: 640, imageHeight: 480, poseRan: i % 5 === 0, pose: i % 5 === 0 ? POSE : null,
    hands: [trackerHand(0.3 + i * 0.012, 0.5, "Right")],
  })));
  assert.ok(recording.ok);
  return recording.sequence;
})();
const FACTS = { capturedAt: new Date("2026-11-23T10:00:00Z"), frames: 20, durationMs: 1900 };

function fakeCamera() {
  const log = { cameraRequests: 0, tracksStopped: 0 };
  const environment = {
    async startTracker() { return { async detect() { return { hands: [], pose: null }; }, close() {} }; },
    async getUserMedia() {
      log.cameraRequests += 1;
      return { getTracks: () => [{ stop() { log.tracksStopped += 1; } }] };
    },
    async openFrames() {
      let waiting = null;
      return { next: () => new Promise((resolve) => { waiting = resolve; }), close() { waiting?.(null); } };
    },
  };
  return {
    log,
    bridge: { start: (host, options) => startCapture(environment, options), text: CAPTURE_TEXT, nextShoulders },
    get running() { return log.cameraRequests > log.tracksStopped; },
  };
}

/** A store with the active profile Mia, board trinken and hilfe; examples as `examples` gives them. */
async function seed(examples = []) {
  const backend = new MemoryBackend();
  const store = await ProfileStore.open(backend);
  const mia = await store.create("Mia", []);
  await setBoardConcepts(store, mia.id, ["trinken", "hilfe"], CONCEPTS);
  await store.setActive(mia.id);
  for (const conceptId of examples) await saveExample(store, mia.id, conceptId, SEQUENCE, FACTS);
  return { backend, store, mia };
}

function start(page, backend, camera = fakeCamera(), reported = []) {
  const app = createApp(page.root, {
    openBackend: async () => backend, catalogue: CONCEPTS, capture: camera.bridge, now: () => 0,
    report: (error) => reported.push(error),
  });
  return { app, camera, reported };
}

test("app: a profile without examples gets the board exactly as before, with no gesture control", async () => {
  await withPage(async (page) => {
    const { backend } = await seed();
    const { app, reported } = start(page, backend);
    await app.started;
    assert.deepEqual(page.labels(), ["Trinken", "Hilfe"]);
    assert.equal(page.gestureControl(), null);
    assert.deepEqual(reported, []);
  });
});

test("app: examples only of a concept that is not on the board, or only damaged ones, give no gesture control", async () => {
  await withPage(async (page) => {
    const { backend, store, mia } = await seed();
    await putCustomConcept(store, mia.id, "ball", { labelDe: "Ball", speechDe: "Ball." }, CONCEPTS);
    await saveExample(store, mia.id, "ball", SEQUENCE, FACTS);
    await store.data(mia.id).set("gesture.trinken.0123456789ab", { version: 1, broken: true });
    const { app } = start(page, backend);
    await app.started;
    assert.deepEqual(page.labels(), ["Trinken", "Hilfe"]);
    assert.equal(page.gestureControl(), null);
  });
});

test("app: the examples board of a device without profiles has no gesture control", async () => {
  await withPage(async (page) => {
    const { app } = start(page, new MemoryBackend());
    await app.started;
    assert.equal(page.root.dataset.startup, "demo-empty");
    assert.equal(page.gestureControl(), null);
  });
});

test("app: with examples the control is there from the first mount; the camera starts only on its tap", async () => {
  await withPage(async (page) => {
    const { backend } = await seed(["trinken"]);
    const { app, camera } = start(page, backend);
    await app.started;
    assert.notEqual(page.gestureControl(), null);
    assert.deepEqual(page.labels(), ["Trinken", "Hilfe"]);
    assert.equal(camera.log.cameraRequests, 0);
    page.gestureControl().click();
    await settle();
    assert.equal(camera.log.cameraRequests, 1);
    // Card NG-54: the app's gesture view recognises continuously: no countdown.
    assert.equal(page.panel().dataset.state, "listening");
    assert.deepEqual(page.spoken, []);
    // Leaving now must stop everything.
    page.panel().children[0].children[0].click();
    assert.equal(camera.running, false);
    assert.equal(page.panel(), null);
  });
});

test("app: examples are read again on every refresh (after the caregiver area closes): taught, deleted, another profile", async () => {
  await withPage(async (page) => {
    const { backend } = await seed();
    const { app } = start(page, backend);
    await app.started;
    assert.equal(page.gestureControl(), null);
    const store = await app.store();
    const mia = await store.getActive();
    await saveExample(store, mia, "hilfe", SEQUENCE, FACTS);
    await app.refreshBoard();
    assert.notEqual(page.gestureControl(), null, "an example taught since");
    await deleteExamples(store, mia, "hilfe");
    await app.refreshBoard();
    assert.equal(page.gestureControl(), null, "the examples were deleted");
    await saveExample(store, mia, "trinken", SEQUENCE, FACTS);
    const lea = await store.create("Lea", []);
    await setBoardConcepts(store, lea.id, ["trinken"], CONCEPTS);
    await store.setActive(lea.id);
    await app.refreshBoard();
    assert.equal(page.gestureControl(), null, "another active profile without examples");
    await store.setActive(mia);
    await app.refreshBoard();
    assert.notEqual(page.gestureControl(), null);
    // The concept left the board: its examples do not count.
    await setBoardConcepts(store, mia, ["hilfe"], CONCEPTS);
    await app.refreshBoard();
    assert.deepEqual(page.labels(), ["Hilfe"]);
    assert.equal(page.gestureControl(), null);
  });
});

test("app: a refresh while the camera runs ends the attempt and stops the camera; nothing is spoken", async () => {
  await withPage(async (page) => {
    const { backend } = await seed(["trinken"]);
    const { app, camera } = start(page, backend);
    await app.started;
    page.gestureControl().click();
    await settle();
    assert.equal(camera.running, true);
    assert.equal(page.doc.listeners.visibilitychange.length, 1);
    await app.refreshBoard();
    assert.equal(camera.running, false);
    assert.equal(page.panel(), null);
    assert.notEqual(page.gestureControl(), null, "the new board has the control again");
    assert.equal(page.doc.listeners.visibilitychange.length, 1, "the old view's listener is gone");
    assert.deepEqual(page.spoken, []);
  });
});

test("app: a store whose example listing fails gives the board without the control, and the failure is reported", async () => {
  await withPage(async (page) => {
    const { backend } = await seed(["trinken"]);
    const realGet = backend.get.bind(backend);
    let failing = true;
    backend.get = async (key) => {
      const value = await realGet(key);
      if (failing && typeof key === "string" && key.includes("gesture.")) throw new Error("read failed");
      return value;
    };
    const { app, reported } = start(page, backend);
    await app.started;
    assert.deepEqual(page.labels(), ["Trinken", "Hilfe"]);
    assert.equal(page.gestureControl(), null);
    assert.ok(reported.length >= 1);
    failing = false;
    await app.refreshBoard();
    assert.notEqual(page.gestureControl(), null);
  });
});

// Card NG-56: a caregiver's demo clip of a concept on the board gives the gesture view "Vormachen";
// the clip is read only when it is played. The clip is a few made-up bytes.
const CLIP = "data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYEC";
const tree = (node) => [node, ...node.children.flatMap(tree)];

test("app: a demo clip of a concept on the board gives the gesture view 'Vormachen'; clips of other concepts or profiles do not; a clip is read when played", async () => {
  await withPage(async (page) => {
    const { backend, store, mia } = await seed(["trinken"]);
    const other = await store.create("Ben", []);
    await setDemoClip(store, other.id, "trinken", CLIP);
    await setDemoClip(store, mia.id, "ball", CLIP);
    const { app } = start(page, backend);
    await app.started;
    page.gestureControl().click();
    await settle();
    const opener = () => tree(page.panel()).find((element) => hasClass(element, "recognise-demo-open"));
    assert.equal(opener(), undefined, "no clip of a concept on Mia's board");
    page.panel().children[0].children[0].click();
    await setDemoClip(store, mia.id, "hilfe", CLIP);
    const reads = [];
    const realGet = backend.get.bind(backend);
    backend.get = async (key) => {
      if (typeof key === "string" && key.includes("/data/demo.")) reads.push(key.slice(key.lastIndexOf("/") + 1));
      return realGet(key);
    };
    await app.refreshBoard();
    assert.deepEqual(reads, [], "the clip is not read with the board");
    page.gestureControl().click();
    await settle();
    opener().click();
    await settle();
    assert.deepEqual(reads, ["demo.hilfe"]);
    const video = tree(page.panel()).find((element) => element.tagName === "video");
    assert.equal(video.src, CLIP);
    assert.equal(page.panel().dataset.state, "listening");
  });
});

test("app: clips that cannot be listed leave the gesture view without 'Vormachen', and the failure is reported", async () => {
  await withPage(async (page) => {
    const { backend, store, mia } = await seed(["trinken"]);
    await setDemoClip(store, mia.id, "trinken", CLIP);
    // A start reads the profile's data names twice: for the examples, then for the clips. The second read fails.
    const realKeys = backend.keys.bind(backend);
    let dataListings = 0;
    backend.keys = async (prefix) => {
      if (typeof prefix === "string" && prefix.endsWith("/data/")) {
        dataListings += 1;
        if (dataListings === 2) throw new Error("listing failed");
      }
      return realKeys(prefix);
    };
    const { app, reported } = start(page, backend);
    await app.started;
    assert.notEqual(page.gestureControl(), null);
    page.gestureControl().click();
    await settle();
    assert.equal(tree(page.panel()).find((element) => hasClass(element, "recognise-demo-open")), undefined);
    assert.ok(reported.some((error) => error.message === "listing failed"));
  });
});
