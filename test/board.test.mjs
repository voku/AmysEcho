import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createApp } from "../dist/app.js";
import { createBoardHost, mountBoard, mountFailure, mountLoading } from "../dist/board.js";
import { CONCEPTS } from "../dist/concepts.js";
import {
  BoardDataError, MAX_LABEL_LENGTH, MAX_SPEECH_LENGTH, clearWording, isBoardConceptId, listCustomConcepts, normalizeWording,
  putCustomConcept, removeCustomConcept, resolveBoard, setBoardConcepts, setWording,
} from "../dist/board-data.js";
import { InjectedWriteError, MemoryBackend } from "../dist/profiles/memory-backend.js";
import { ProfileStore, UnknownProfileError } from "../dist/profiles/store.js";
import { STARTUP_WAIT_MS, fallbackCause, resolveStartupView, runStartup } from "../dist/startup.js";

const chr = (...codePoints) => String.fromCodePoint(...codePoints);

const openStore = async () => {
  const backend = new MemoryBackend();
  return { backend, store: await ProfileStore.open(backend) };
};

const rejectsWith = (promise, kind) => assert.rejects(promise, (error) => {
  assert.ok(error instanceof BoardDataError, `expected a BoardDataError, got ${error}`);
  assert.equal(error.kind, kind);
  return true;
});

const BALL = { labelDe: "Ball", speechDe: "Ich möchte mit dem Ball spielen." };

// --- A minimal document, as in bootstrap.test.mjs; no DOM library. ---

function fakeElement(tagName) {
  return {
    tagName, textContent: "", className: "", children: [], dataset: {}, handlers: {},
    hidden: false,
    setAttribute(name, value) { this[name] = value; },
    addEventListener(name, handler) { this.handlers[name] = handler; },
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = nodes; },
    click() { this.handlers.click?.(); },
  };
}

class FakeUtterance {
  constructor(text) { this.text = text; this.lang = ""; this.voice = null; this.onerror = null; }
}

/**
 * Puts a fake document, a fake local German voice and a console.warn recorder
 * in place. Returns what the fakes recorded and a function that restores the globals.
 */
function installFakes() {
  const previous = { document: globalThis.document, window: globalThis.window, SpeechSynthesisUtterance: globalThis.SpeechSynthesisUtterance };
  const previousWarn = console.warn;
  const speech = { cancelled: 0, utterances: [], spoken: [] };
  const warnings = [];
  globalThis.document = { createElement: fakeElement };
  globalThis.window = {
    speechSynthesis: {
      cancel() { speech.cancelled += 1; },
      getVoices: () => [{ lang: "de-DE", localService: true }],
      speak(utterance) { speech.utterances.push(utterance); speech.spoken.push(utterance.text); },
    },
  };
  globalThis.SpeechSynthesisUtterance = FakeUtterance;
  console.warn = (...parts) => { warnings.push(parts.join(" ")); };
  return {
    speech, warnings,
    restore() {
      console.warn = previousWarn;
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete globalThis[name];
        else globalThis[name] = value;
      }
    },
  };
}

/** The parts of whatever is mounted in `root` right now. */
function parts(root) {
  const byClass = (name) => root.children.filter((child) => child.className.split(" ").includes(name));
  const board = byClass("concept-board")[0] ?? null;
  return {
    board,
    buttons: board === null ? [] : board.children.filter((child) => child.tagName === "button"),
    labels: board === null ? [] : board.children.filter((child) => child.tagName === "button").map((button) => button.children.at(-1).textContent),
    /** The non-text marks of a board of examples: the class on the board and the badge on it. */
    examplesLook: board !== null && board.className.split(" ").includes("concept-board-examples"),
    badge: board === null ? null : board.children.find((child) => child.className === "examples-badge")?.textContent ?? null,
    notices: byClass("board-notice").map((notice) => notice.textContent),
    fallback: root.dataset.boardFallback ?? null,
    output: byClass("message")[0] ?? null,
    speechStatus: byClass("speech-status")[0] ?? null,
    retry: byClass("retry")[0] ?? null,
    text: root.children.map((child) => child.textContent).join("\n"),
  };
}

/** Mounts the view into a fake root, with a fake local German voice, and hands the parts to `callback`. */
function withMountedBoard(view, callback) {
  const fakes = installFakes();
  try {
    const root = fakeElement("main");
    const handle = mountBoard(root, view);
    callback({
      root, handle, speech: fakes.speech, warnings: fakes.warnings, spoken: fakes.speech.spoken,
      ...parts(root),
    });
  } finally {
    fakes.restore();
  }
}

/** A fake board region with a timer the test fires by hand. `mounts` holds what was shown, in order. */
function fakePage() {
  const root = fakeElement("section");
  const mounts = [];
  root.replaceChildren = (...nodes) => { root.children = nodes; mounts.push(parts(root)); };
  const timers = [];
  return {
    root, mounts, timers,
    setTimer(callback, milliseconds) {
      const timer = { callback, milliseconds, cancelled: false };
      timers.push(timer);
      return () => { timer.cancelled = true; };
    },
    /** What a real timer would do: run the callback unless it was cancelled. */
    fireTimer() { for (const timer of timers) if (!timer.cancelled) timer.callback(); },
    /** A timer whose cancellation came too late: the callback runs anyway. */
    forceTimer() { for (const timer of timers) timer.callback(); },
    now: () => parts(root),
  };
}

/** For `runStartup`: the real board host on a fake region, and a view promise the test settles. */
async function withStartup(callback) {
  const fakes = installFakes();
  try {
    const page = fakePage();
    const host = { ...createBoardHost(page.root), setTimer: page.setTimer };
    let answer;
    let fail;
    const view = new Promise((resolve, reject) => { answer = resolve; fail = reject; });
    await callback({ ...page, host, view, answer, fail, speech: fakes.speech, warnings: fakes.warnings });
  } finally {
    fakes.restore();
  }
}

/** For `createApp`: a fake region and the fakes; the test creates the app itself. */
async function withPage(callback) {
  const fakes = installFakes();
  try {
    await callback({ ...fakePage(), speech: fakes.speech, warnings: fakes.warnings });
  } finally {
    fakes.restore();
  }
}

/** Every string found in the element tree: text, class names, attributes, data attributes. */
function stringsIn(node) {
  const found = [];
  const visit = (value) => {
    if (typeof value === "string") found.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (typeof value === "object" && value !== null) for (const [key, inner] of Object.entries(value)) { found.push(key); visit(inner); }
  };
  visit(node);
  return found;
}

const MIA_VIEW = {
  kind: "profile", profileId: "0".repeat(32), displayName: "Mia", problems: [],
  entries: [{ id: "ball", labelDe: "Ball", speechDe: "Ich möchte mit dem Ball spielen.", symbolPath: null, source: "custom" }],
};
const EXAMPLE_LABELS = CONCEPTS.map((concept) => concept.labelDe);

// --- Board data ---

test("every catalogue concept id is an id the board data can address", () => {
  for (const concept of CONCEPTS) assert.ok(isBoardConceptId(concept.id), concept.id);
});

test("a board follows the profile's conceptIds order, with catalogue wording and symbols", async () => {
  const { store } = await openStore();
  const profile = await store.create("Mia", ["pause", "hilfe", "mehr"]);
  const board = await resolveBoard(store, profile.id, CONCEPTS);
  assert.deepEqual(board.entries.map((entry) => entry.id), ["pause", "hilfe", "mehr"]);
  assert.deepEqual(board.entries[0], { id: "pause", labelDe: "Pause", speechDe: "Ich brauche eine Pause.", symbolPath: "./icons/pause.svg", source: "catalogue" });
  assert.deepEqual(board.problems, []);
  assert.equal(board.profile.displayName, "Mia");

  await setBoardConcepts(store, profile.id, ["mehr", "pause"], CONCEPTS);
  assert.deepEqual((await resolveBoard(store, profile.id, CONCEPTS)).entries.map((entry) => entry.id), ["mehr", "pause"]);
});

test("two profiles with different sets and wording never show each other's concepts", async () => {
  const { backend, store } = await openStore();
  const a = await store.create("A", []);
  const b = await store.create("B", []);
  await putCustomConcept(store, a.id, "ball", BALL, CONCEPTS);
  await setWording(store, a.id, "hilfe", { labelDe: "Hilf mir", speechDe: "Mama, hilf mir bitte." }, CONCEPTS);
  await setBoardConcepts(store, a.id, ["ball", "hilfe"], CONCEPTS);
  await putCustomConcept(store, b.id, "schaukel", { labelDe: "Schaukel", speechDe: "Ich will schaukeln." }, CONCEPTS);
  await setBoardConcepts(store, b.id, ["hilfe", "trinken", "schaukel"], CONCEPTS);

  const boardA = await resolveBoard(store, a.id, CONCEPTS);
  const boardB = await resolveBoard(store, b.id, CONCEPTS);
  assert.deepEqual(boardA.entries.map((entry) => [entry.id, entry.labelDe]), [["ball", "Ball"], ["hilfe", "Hilf mir"]]);
  assert.deepEqual(boardB.entries.map((entry) => [entry.id, entry.labelDe]), [["hilfe", "Hilfe"], ["trinken", "Trinken"], ["schaukel", "Schaukel"]]);
  assert.equal(boardB.entries[0].speechDe, "Ich brauche Hilfe.");
  assert.deepEqual(boardA.problems, []);
  assert.deepEqual(boardB.problems, []);

  // A's custom concept does not exist for B: not as a board member, not in B's list, not in B's keys.
  await rejectsWith(setBoardConcepts(store, b.id, ["ball"], CONCEPTS), "unknown-concept");
  await rejectsWith(setWording(store, b.id, "ball", BALL, CONCEPTS), "unknown-concept");
  assert.deepEqual((await listCustomConcepts(store, b.id)).concepts.map((concept) => concept.id), ["schaukel"]);
  assert.deepEqual((await listCustomConcepts(store, a.id)).concepts, [{ id: "ball", ...BALL }]);
  const keysWithBall = Object.keys(backend.snapshot()).filter((key) => key.includes("ball"));
  assert.deepEqual(keysWithBall, [`profile/${a.id}/data/concept.ball`]);

  // Even an id on B's board that A defines is not resolved through A.
  await store.setConceptIds(b.id, ["ball"]);
  const leaked = await resolveBoard(store, b.id, CONCEPTS);
  assert.deepEqual(leaked.entries, []);
  assert.deepEqual(leaked.problems, [{ kind: "unknown-concept", conceptId: "ball" }]);

  // Both views render their own board only.
  await store.setConceptIds(b.id, ["hilfe", "trinken", "schaukel"]);
  for (const [profile, expected] of [[a, ["Ball", "Hilf mir"]], [b, ["Hilfe", "Trinken", "Schaukel"]]]) {
    await store.setActive(profile.id);
    withMountedBoard(await resolveStartupView(store, CONCEPTS), ({ labels, fallback }) => {
      assert.deepEqual(labels, expected);
      assert.equal(fallback, null);
    });
  }
});

test("a custom concept is stored in normal form, marked custom, and has no symbol", async () => {
  const { backend, store } = await openStore();
  const profile = await store.create("Mia", []);
  const decomposed = `  Mu${chr(0x0308)}tze `;
  const saved = await putCustomConcept(store, profile.id, "muetze", { labelDe: decomposed, speechDe: " Ich möchte meine Mütze. " }, CONCEPTS);
  assert.deepEqual(saved, { id: "muetze", labelDe: "Mütze", speechDe: "Ich möchte meine Mütze." });
  assert.deepEqual(backend.snapshot()[`profile/${profile.id}/data/concept.muetze`], { version: 1, labelDe: "Mütze", speechDe: "Ich möchte meine Mütze.", custom: true });
  // Not on the board until it is chosen.
  assert.deepEqual((await resolveBoard(store, profile.id, CONCEPTS)).entries, []);
  await setBoardConcepts(store, profile.id, ["muetze"], CONCEPTS);
  assert.deepEqual((await resolveBoard(store, profile.id, CONCEPTS)).entries, [
    { id: "muetze", labelDe: "Mütze", speechDe: "Ich möchte meine Mütze.", symbolPath: null, source: "custom" },
  ]);
  // Rewording keeps it a custom concept.
  await setWording(store, profile.id, "muetze", { labelDe: "Hut", speechDe: "Ich möchte meinen Hut." }, CONCEPTS);
  assert.deepEqual((await resolveBoard(store, profile.id, CONCEPTS)).entries[0], { id: "muetze", labelDe: "Hut", speechDe: "Ich möchte meinen Hut.", symbolPath: null, source: "custom" });
});

test("a wording override applies to one catalogue concept and can be cleared again", async () => {
  const { backend, store } = await openStore();
  const profile = await store.create("Mia", ["hilfe", "mehr"]);
  await setWording(store, profile.id, "hilfe", { labelDe: "Hilf mir", speechDe: "Bitte hilf mir." }, CONCEPTS);
  assert.deepEqual(backend.snapshot()[`profile/${profile.id}/data/concept.hilfe`], { version: 1, labelDe: "Hilf mir", speechDe: "Bitte hilf mir." });
  let board = await resolveBoard(store, profile.id, CONCEPTS);
  assert.deepEqual(board.entries.map((entry) => [entry.labelDe, entry.speechDe, entry.symbolPath, entry.source]), [
    ["Hilf mir", "Bitte hilf mir.", "./icons/hilfe.svg", "catalogue"],
    ["Mehr", "Ich möchte mehr.", "./icons/mehr.svg", "catalogue"],
  ]);
  // Clearing on a board concept stores the current catalogue wording again; it does not leave the board without an entry.
  await clearWording(store, profile.id, "hilfe", CONCEPTS);
  await clearWording(store, profile.id, "hilfe", CONCEPTS); // clearing twice is fine
  board = await resolveBoard(store, profile.id, CONCEPTS);
  assert.equal(board.entries[0].labelDe, "Hilfe");
  assert.deepEqual(backend.snapshot()[`profile/${profile.id}/data/concept.hilfe`], { version: 1, labelDe: "Hilfe", speechDe: "Ich brauche Hilfe.", copied: true });
  // For a concept that is not on the board the entry is simply removed.
  await setWording(store, profile.id, "pause", { labelDe: "Ruhe", speechDe: "Ich will Ruhe." }, CONCEPTS);
  await clearWording(store, profile.id, "pause", CONCEPTS);
  await clearWording(store, profile.id, "trinken", CONCEPTS); // nothing there
  assert.deepEqual(await store.data(profile.id).names(), ["concept.hilfe"]);
});

test("an id without an entry that the catalogue does not have is skipped and reported, never shown as another concept", async () => {
  const { store } = await openStore();
  // Ids the store accepts but the board cannot resolve, one of them not even addressable as board data.
  const profile = await store.create("Mia", ["hilfe", "einhorn", "a.b_c", "x".repeat(64), "mehr"]);
  const board = await resolveBoard(store, profile.id, CONCEPTS);
  assert.deepEqual(board.entries.map((entry) => entry.id), ["hilfe", "mehr"]);
  assert.deepEqual(board.problems, [
    { kind: "unknown-concept", conceptId: "einhorn" },
    { kind: "unknown-concept", conceptId: "a.b_c" },
    { kind: "unknown-concept", conceptId: "x".repeat(64) },
  ]);
  await store.setActive(profile.id);
  withMountedBoard(await resolveStartupView(store, CONCEPTS), ({ labels, notices, text }) => {
    assert.deepEqual(labels, ["Hilfe", "Mehr"]);
    assert.doesNotMatch(text, /Einhorn|einhorn/);
    assert.equal(notices.length, 1);
    assert.match(notices[0], /Nicht alle Begriffe/);
  });
});

test("a damaged wording override falls back to the catalogue wording and is reported", async () => {
  const { store } = await openStore();
  const profile = await store.create("Mia", ["hilfe", "trinken", "pause", "mehr", "fertig"]);
  const data = store.data(profile.id);
  await data.set("concept.hilfe", { version: 1, labelDe: "", speechDe: "Leer." });
  await data.set("concept.trinken", { version: 2, labelDe: "Saft", speechDe: "Saft bitte.", color: "rot" });
  await data.set("concept.pause", { version: 1, labelDe: "Ruhe", speechDe: "Ruhe.", extra: 1 });
  await data.set("concept.mehr", "Mehr!");
  await data.set("concept.fertig", { version: 1, labelDe: " Fertig", speechDe: "Fertig." });
  const board = await resolveBoard(store, profile.id, CONCEPTS);
  assert.deepEqual(board.entries, CONCEPTS.map(({ id, labelDe, speechDe, symbolPath }) => ({ id, labelDe, speechDe, symbolPath, source: "catalogue" })));
  assert.deepEqual(board.problems, [
    { kind: "damaged-wording", conceptId: "hilfe", damage: "unreadable" },
    { kind: "damaged-wording", conceptId: "trinken", damage: "unsupported-version" },
    { kind: "damaged-wording", conceptId: "pause", damage: "unreadable" },
    { kind: "damaged-wording", conceptId: "mehr", damage: "unreadable" },
    { kind: "damaged-wording", conceptId: "fertig", damage: "unreadable" },
  ]);
  assert.deepEqual((await listCustomConcepts(store, profile.id)).unreadableIds, ["fertig", "hilfe", "mehr", "pause", "trinken"]);
  // The caregiver API can repair it: clear, or write a new wording.
  await clearWording(store, profile.id, "hilfe", CONCEPTS);
  await setWording(store, profile.id, "mehr", { labelDe: "Noch mal", speechDe: "Noch mal, bitte." }, CONCEPTS);
  const repaired = await resolveBoard(store, profile.id, CONCEPTS);
  assert.equal(repaired.entries[3].labelDe, "Noch mal");
  assert.deepEqual(repaired.problems.map((problem) => problem.conceptId), ["trinken", "pause", "fertig"]);
});

test("a damaged custom concept is skipped and reported, and can be removed", async () => {
  const { store } = await openStore();
  const profile = await store.create("Mia", []);
  await putCustomConcept(store, profile.id, "ball", BALL, CONCEPTS);
  await putCustomConcept(store, profile.id, "auto", { labelDe: "Auto", speechDe: "Auto fahren." }, CONCEPTS);
  await setBoardConcepts(store, profile.id, ["ball", "auto", "hilfe"], CONCEPTS);
  await store.data(profile.id).set("concept.ball", { version: 1, labelDe: "Ball", speechDe: `Ball${chr(0x202e)}`, custom: true });
  await store.data(profile.id).set("concept.auto", { version: 1, labelDe: "Auto", speechDe: "Auto fahren.", custom: "yes" });
  const board = await resolveBoard(store, profile.id, CONCEPTS);
  assert.deepEqual(board.entries.map((entry) => entry.id), ["hilfe"]);
  assert.deepEqual(board.problems, [
    { kind: "damaged-custom-concept", conceptId: "ball", damage: "unreadable" },
    { kind: "damaged-custom-concept", conceptId: "auto", damage: "unreadable" },
  ]);
  // A damaged custom concept cannot be chosen for a board.
  await rejectsWith(setBoardConcepts(store, profile.id, ["ball"], CONCEPTS), "unknown-concept");
  await removeCustomConcept(store, profile.id, "ball", CONCEPTS);
  await removeCustomConcept(store, profile.id, "auto", CONCEPTS);
  assert.deepEqual(await resolveBoard(store, profile.id, CONCEPTS).then(({ entries, problems }) => [entries.length, problems]), [1, []]);
  assert.deepEqual(await store.data(profile.id).names(), ["concept.hilfe"]);
});

test("a custom concept keeps its own wording when the catalogue later uses the same id", async () => {
  const { store } = await openStore();
  const profile = await store.create("Mia", []);
  await putCustomConcept(store, profile.id, "ball", BALL, CONCEPTS);
  await setBoardConcepts(store, profile.id, ["ball"], CONCEPTS);
  const grown = [...CONCEPTS, { id: "ball", labelDe: "Fussball", speechDe: "Fussball spielen.", symbolPath: "./icons/ball.svg" }];
  const board = await resolveBoard(store, profile.id, grown);
  assert.deepEqual(board.entries, [{ id: "ball", ...BALL, symbolPath: null, source: "custom" }]);
  assert.deepEqual(board.problems, [{ kind: "custom-shadows-catalogue", conceptId: "ball" }]);
  // It is still this profile's custom concept: clearing its wording is refused, removing it works.
  await rejectsWith(clearWording(store, profile.id, "ball", grown), "custom-concept");
  await removeCustomConcept(store, profile.id, "ball", grown);
  assert.deepEqual((await store.get(profile.id)).conceptIds, []);
});

test("removing a custom concept takes it off the board and out of the data, and leaves other entries alone", async () => {
  const { store } = await openStore();
  const profile = await store.create("Mia", []);
  await putCustomConcept(store, profile.id, "ball", BALL, CONCEPTS);
  await putCustomConcept(store, profile.id, "auto", { labelDe: "Auto", speechDe: "Auto fahren." }, CONCEPTS);
  await setBoardConcepts(store, profile.id, ["hilfe", "ball", "auto"], CONCEPTS);
  await store.data(profile.id).set("settings", { volume: 1 });
  await removeCustomConcept(store, profile.id, "ball", CONCEPTS);
  assert.deepEqual((await store.get(profile.id)).conceptIds, ["hilfe", "auto"]);
  assert.deepEqual(await store.data(profile.id).names(), ["concept.auto", "concept.hilfe", "settings"]);
  await rejectsWith(removeCustomConcept(store, profile.id, "hilfe", CONCEPTS), "catalogue-concept");
  assert.deepEqual((await store.get(profile.id)).conceptIds, ["hilfe", "auto"]);
});

test("a failure between the two writes of removeCustomConcept leaves a board that resolves", async () => {
  const { backend, store } = await openStore();
  const profile = await store.create("Mia", []);
  await putCustomConcept(store, profile.id, "ball", BALL, CONCEPTS);
  await setBoardConcepts(store, profile.id, ["hilfe", "ball"], CONCEPTS);

  // First write fails: nothing changed.
  const before = backend.snapshot();
  backend.failWrite(1);
  await assert.rejects(removeCustomConcept(store, profile.id, "ball", CONCEPTS), InjectedWriteError);
  assert.deepEqual(backend.snapshot(), before);

  // Second write fails: the id is off the board, the entry is still stored.
  backend.failWrite(2);
  await assert.rejects(removeCustomConcept(store, profile.id, "ball", CONCEPTS), InjectedWriteError);
  const board = await resolveBoard(store, profile.id, CONCEPTS);
  assert.deepEqual(board.entries.map((entry) => entry.id), ["hilfe"]);
  assert.deepEqual(board.problems, []);
  assert.deepEqual((await listCustomConcepts(store, profile.id)).concepts, [{ id: "ball", ...BALL }]);

  // Calling again finishes the removal.
  await removeCustomConcept(store, profile.id, "ball", CONCEPTS);
  assert.deepEqual(await store.data(profile.id).names(), ["concept.hilfe"]);
  assert.deepEqual((await resolveBoard(store, profile.id, CONCEPTS)).problems, []);
});

test("a failed single-write operation changes nothing", async () => {
  const { backend, store } = await openStore();
  const profile = await store.create("Mia", ["hilfe"]);
  await setWording(store, profile.id, "hilfe", { labelDe: "Hilf mir", speechDe: "Bitte hilf mir." }, CONCEPTS);
  const before = backend.snapshot();
  for (const operation of [
    () => putCustomConcept(store, profile.id, "ball", BALL, CONCEPTS),
    () => setWording(store, profile.id, "hilfe", { labelDe: "Anders", speechDe: "Anders." }, CONCEPTS),
    () => clearWording(store, profile.id, "hilfe", CONCEPTS),
    () => setBoardConcepts(store, profile.id, ["mehr", "hilfe"], CONCEPTS),
  ]) {
    backend.failWrite();
    await assert.rejects(operation(), InjectedWriteError);
    assert.deepEqual(backend.snapshot(), before);
  }
});

test("setBoardConcepts rejects unknown, duplicate and malformed ids without changing the board", async () => {
  const { backend, store } = await openStore();
  const profile = await store.create("Mia", ["hilfe"]);
  await putCustomConcept(store, profile.id, "ball", BALL, CONCEPTS);
  const before = backend.snapshot();
  await rejectsWith(setBoardConcepts(store, profile.id, ["hilfe", "einhorn"], CONCEPTS), "unknown-concept");
  await rejectsWith(setBoardConcepts(store, profile.id, ["hilfe", "ball", "hilfe"], CONCEPTS), "duplicate-concept");
  await rejectsWith(setBoardConcepts(store, profile.id, ["Hilfe"], CONCEPTS), "invalid-concept-id");
  await rejectsWith(setBoardConcepts(store, profile.id, ["a.b"], CONCEPTS), "invalid-concept-id");
  await rejectsWith(setBoardConcepts(store, profile.id, [7], CONCEPTS), "invalid-concept-id");
  await rejectsWith(setBoardConcepts(store, profile.id, "hilfe", CONCEPTS), "invalid-concept-id");
  assert.deepEqual(backend.snapshot(), before);
  await assert.rejects(setBoardConcepts(store, "f".repeat(32), ["hilfe"], CONCEPTS), UnknownProfileError);
});

test("concept ids are validated on write and a custom id cannot take a catalogue id", async () => {
  const { backend, store } = await openStore();
  const profile = await store.create("Mia", []);
  const before = backend.snapshot();
  for (const bad of ["", "Ball", "ball spiel", "ball_1", "ball.1", "-ball", "bäll", "a/b", "__proto__", "x".repeat(41), 7, null, undefined]) {
    assert.equal(isBoardConceptId(bad), false, JSON.stringify(bad));
    await rejectsWith(putCustomConcept(store, profile.id, bad, BALL, CONCEPTS), "invalid-concept-id");
    await rejectsWith(setWording(store, profile.id, bad, BALL, CONCEPTS), "invalid-concept-id");
    await rejectsWith(clearWording(store, profile.id, bad, CONCEPTS), "invalid-concept-id");
    await rejectsWith(removeCustomConcept(store, profile.id, bad, CONCEPTS), "invalid-concept-id");
  }
  await rejectsWith(putCustomConcept(store, profile.id, "hilfe", BALL, CONCEPTS), "catalogue-collision");
  await rejectsWith(setWording(store, profile.id, "einhorn", BALL, CONCEPTS), "unknown-concept");
  assert.deepEqual(backend.snapshot(), before);
  for (const good of ["a", "ball-2", "0", "x".repeat(40)]) {
    assert.ok(isBoardConceptId(good), good);
    await putCustomConcept(store, profile.id, good, BALL, CONCEPTS);
  }
});

test("label and sentence are trimmed, NFC, length-limited and free of control and invisible characters", async () => {
  assert.deepEqual(normalizeWording({ labelDe: "  Ball \n", speechDe: `A${chr(0x030a)}` }), { labelDe: "Ball", speechDe: chr(0xc5) });
  assert.deepEqual(normalizeWording({ labelDe: "x".repeat(MAX_LABEL_LENGTH), speechDe: "🦊".repeat(MAX_SPEECH_LENGTH) }), {
    labelDe: "x".repeat(MAX_LABEL_LENGTH), speechDe: "🦊".repeat(MAX_SPEECH_LENGTH),
  });
  const badTexts = [
    "", "   ", "Ba\u0000ll", "Ba\nll", "Ba\u007fll", `Ba${chr(0x2028)}ll`, `Ba${chr(0x202e)}ll`, `${chr(0xfeff)}Ball`, `Ball${chr(0x200d)}`,
    "Ba\ud800ll", 7, null, undefined, ["Ball"],
  ];
  const { backend, store } = await openStore();
  const profile = await store.create("Mia", ["hilfe"]);
  const before = backend.snapshot();
  for (const bad of [...badTexts, "x".repeat(MAX_LABEL_LENGTH + 1)]) {
    assert.throws(() => normalizeWording({ labelDe: bad, speechDe: "Gut." }), BoardDataError, JSON.stringify(bad));
    await rejectsWith(putCustomConcept(store, profile.id, "ball", { labelDe: bad, speechDe: "Gut." }, CONCEPTS), "invalid-text");
    await rejectsWith(setWording(store, profile.id, "hilfe", { labelDe: bad, speechDe: "Gut." }, CONCEPTS), "invalid-text");
  }
  for (const bad of [...badTexts, "x".repeat(MAX_SPEECH_LENGTH + 1)]) {
    assert.throws(() => normalizeWording({ labelDe: "Gut", speechDe: bad }), BoardDataError, JSON.stringify(bad));
    await rejectsWith(putCustomConcept(store, profile.id, "ball", { labelDe: "Gut", speechDe: bad }, CONCEPTS), "invalid-text");
    await rejectsWith(setWording(store, profile.id, "hilfe", { labelDe: "Gut", speechDe: bad }, CONCEPTS), "invalid-text");
  }
  await rejectsWith(putCustomConcept(store, profile.id, "ball", null, CONCEPTS), "invalid-text");
  assert.deepEqual(backend.snapshot(), before);
  // A joiner between two visible characters is part of correct spelling and is kept.
  assert.equal(normalizeWording({ labelDe: `a${chr(0x200d)}b`, speechDe: "Gut." }).labelDe, `a${chr(0x200d)}b`);
});

// --- Startup view ---

test("startup: no profile at all shows the demo board", async () => {
  const { store } = await openStore();
  assert.deepEqual(await resolveStartupView(store, CONCEPTS), { kind: "demo", storage: "empty" });
});

test("startup: a readable active profile yields its board, also when it is empty", async () => {
  const { store } = await openStore();
  const mia = await store.create("Mia", ["mehr", "hilfe"]);
  await store.create("Ben", ["pause"]);
  await store.setActive(mia.id);
  const view = await resolveStartupView(store, CONCEPTS);
  assert.equal(view.kind, "profile");
  assert.equal(view.profileId, mia.id);
  assert.equal(view.displayName, "Mia");
  assert.deepEqual(view.entries.map((entry) => entry.id), ["mehr", "hilfe"]);
  assert.deepEqual(view.problems, []);

  await store.setConceptIds(mia.id, []);
  assert.deepEqual(await resolveStartupView(store, CONCEPTS), { kind: "profile", profileId: mia.id, displayName: "Mia", entries: [], problems: [] });
});

test("startup: readable profiles without an active one are listed, not opened", async () => {
  const { store } = await openStore();
  const mia = await store.create("Mia", ["hilfe"]);
  const view = await resolveStartupView(store, CONCEPTS);
  assert.deepEqual(view, { kind: "no-active", profiles: [{ id: mia.id, displayName: "Mia" }] });
});

test("startup: a damaged active profile is its own state, never the demo board or a new-device state", async () => {
  const { backend, store } = await openStore();
  const mia = await store.create("Mia", ["hilfe"]);
  await store.setActive(mia.id);
  await backend.write({ set: { [`profile/${mia.id}/meta`]: { version: 1, id: mia.id, displayName: "Mia" } } });
  assert.deepEqual(await resolveStartupView(store, CONCEPTS), { kind: "damaged", count: 1 });

  // Also when a readable profile exists next to it, and when a second entry is damaged.
  await store.create("Ben", ["pause"]);
  assert.deepEqual(await resolveStartupView(store, CONCEPTS), { kind: "damaged", count: 1 });
  await backend.write({ set: { "profile/zz/meta": {} } });
  assert.deepEqual(await resolveStartupView(store, CONCEPTS), { kind: "damaged", count: 2 });

  // The view was only read: nothing was repaired, replaced or deleted.
  assert.deepEqual(backend.snapshot()[`profile/${mia.id}/meta`], { version: 1, id: mia.id, displayName: "Mia" });
  assert.equal(backend.snapshot()["app/active-profile"], mia.id);
});

// --- Rendering ---

test("render: board problems leave a trace (count on the root, one console line each) without wording or names", async () => {
  const { store } = await openStore();
  const mia = await store.create("Geheimname", ["hilfe", "einhorn", "ball"]);
  await store.data(mia.id).set("concept.hilfe", { version: 2, labelDe: "Geheimwort", speechDe: "Geheimsatz." });
  await store.data(mia.id).set("concept.ball", { version: 1, labelDe: "", speechDe: "Geheimsatz.", custom: true });
  await store.setActive(mia.id);
  withMountedBoard(await resolveStartupView(store, CONCEPTS), ({ root, warnings, notices, labels }) => {
    assert.deepEqual(labels, ["Hilfe"]);
    assert.equal(root.dataset.boardProblems, "3");
    assert.deepEqual(warnings, [
      'Board problem: damaged-wording for concept "hilfe" (unsupported-version)',
      'Board problem: unknown-concept for concept "einhorn"',
      'Board problem: damaged-custom-concept for concept "ball" (unreadable)',
    ]);
    assert.doesNotMatch(warnings.join("\n"), /Geheim/);
    assert.equal(notices.length, 1);
    // A later board without problems, or one that is not a profile board, does not keep the old count.
    mountBoard(root, MIA_VIEW);
    assert.equal(root.dataset.boardProblems, "0");
    mountBoard(root, { kind: "damaged", count: 1 });
    assert.equal("boardProblems" in root.dataset, false);
    assert.equal(warnings.length, 3);
  });
});

test("render: a custom concept under a catalogue id is traced but shows no notice to the child", async () => {
  const { store } = await openStore();
  const mia = await store.create("Mia", []);
  await putCustomConcept(store, mia.id, "ball", BALL, CONCEPTS);
  await setBoardConcepts(store, mia.id, ["ball"], CONCEPTS);
  await store.setActive(mia.id);
  const grown = [...CONCEPTS, { id: "ball", labelDe: "Fussball", speechDe: "Fussball spielen.", symbolPath: "./icons/ball.svg" }];
  withMountedBoard(await resolveStartupView(store, grown), ({ root, warnings, notices, labels }) => {
    assert.deepEqual(labels, ["Ball"]);
    assert.deepEqual(notices, []);
    assert.equal(root.dataset.boardProblems, "1");
    assert.deepEqual(warnings, ['Board problem: custom-shadows-catalogue for concept "ball"']);
  });
});

test("render: mounting a board stops running speech first", () => {
  withMountedBoard({ kind: "demo", storage: "empty" }, ({ root, speech, buttons }) => {
    buttons[0].click();
    const before = speech.cancelled;
    mountBoard(root, MIA_VIEW);
    assert.equal(speech.cancelled, before + 1);
    mountBoard(root, { kind: "damaged", count: 1 });
    assert.equal(speech.cancelled, before + 2);
    // The waiting line is shown before any board and has nothing to stop.
    mountLoading(root);
    assert.equal(speech.cancelled, before + 2);
  });
});

test("render: a speech engine that throws on cancel does not stop a board from being mounted", () => {
  withMountedBoard({ kind: "demo", storage: "empty" }, ({ root }) => {
    globalThis.window.speechSynthesis.cancel = () => { throw new Error("engine broke"); };
    mountBoard(root, MIA_VIEW);
    assert.deepEqual(parts(root).labels, ["Ball"]);
  });
});

test("render: a speech error from an earlier attempt or an earlier board does not touch the current status line", () => {
  withMountedBoard(MIA_VIEW, ({ root, speech, buttons, speechStatus, handle }) => {
    assert.equal(handle.hasSelection(), false);
    buttons[0].click();
    buttons[0].click(); // the same concept again: the engine reports an error for the first utterance
    assert.equal(handle.hasSelection(), true);
    const [first, second] = speech.utterances;
    first.onerror();
    assert.match(speechStatus.textContent, /Lokale deutsche Stimme angefordert/);
    second.onerror();
    assert.match(speechStatus.textContent, /Sprachausgabe fehlgeschlagen/);

    // A new board: an error for an utterance of the old board changes nothing on it.
    mountBoard(root, { kind: "demo", storage: "empty" });
    const fresh = parts(root);
    fresh.buttons[0].click();
    second.onerror();
    first.onerror();
    assert.match(fresh.speechStatus.textContent, /Lokale deutsche Stimme angefordert/);
    assert.equal(fresh.output.textContent, "Ich brauche Hilfe.");
  });
});

// --- Start-up sequence ---

test("an over-long stored label or sentence is refused by length, before any normalisation", async () => {
  const { store } = await openStore();
  const profile = await store.create("Mia", ["hilfe", "mehr", "ball", "pause"]);
  const data = store.data(profile.id);
  const long = "x".repeat(50_000);
  await data.set("concept.hilfe", { version: 1, labelDe: long, speechDe: "Kurz." });
  await data.set("concept.mehr", { version: 1, labelDe: "Mehr", speechDe: long });
  await data.set("concept.ball", { version: 1, labelDe: long, speechDe: long, custom: true });
  // The longest text that can be valid: two UTF-16 units per counted character.
  await data.set("concept.pause", { version: 1, labelDe: "🦊".repeat(MAX_LABEL_LENGTH), speechDe: "🦊".repeat(MAX_SPEECH_LENGTH) });

  const original = String.prototype.normalize;
  const normalized = [];
  String.prototype.normalize = function normalize(...forms) {
    normalized.push(this.length);
    return original.apply(this, forms);
  };
  let board;
  let listing;
  try {
    board = await resolveBoard(store, profile.id, CONCEPTS);
    listing = await listCustomConcepts(store, profile.id);
  } finally {
    String.prototype.normalize = original;
  }
  assert.deepEqual(board.problems, [
    { kind: "damaged-wording", conceptId: "hilfe", damage: "unreadable" },
    { kind: "damaged-wording", conceptId: "mehr", damage: "unreadable" },
    { kind: "damaged-custom-concept", conceptId: "ball", damage: "unreadable" },
  ]);
  assert.equal(board.entries.at(-1).labelDe, "🦊".repeat(MAX_LABEL_LENGTH));
  assert.deepEqual(listing.unreadableIds, ["ball", "hilfe", "mehr"]);
  assert.ok(normalized.length > 0, "the valid entry was normalised");
  assert.ok(Math.max(...normalized) <= 2 * MAX_SPEECH_LENGTH, `normalize saw a string of ${Math.max(...normalized)} units`);
});

// --- Wording is copied when a concept is chosen ---

const withCatalogue = (changes, dropped = []) => CONCEPTS
  .filter((concept) => !dropped.includes(concept.id))
  .map((concept) => ({ ...concept, ...(changes[concept.id] ?? {}) }));

test("choosing a catalogue concept stores its wording: a later catalogue with another sentence does not change the board", async () => {
  const { backend, store } = await openStore();
  const mia = await store.create("Mia", []);
  const ben = await store.create("Ben", ["hilfe"]); // a board from before wording was copied: no entry
  await setBoardConcepts(store, mia.id, ["hilfe", "mehr"], CONCEPTS);
  assert.deepEqual(backend.snapshot()[`profile/${mia.id}/data/concept.hilfe`], { version: 1, labelDe: "Hilfe", speechDe: "Ich brauche Hilfe.", copied: true });
  assert.deepEqual(await store.data(mia.id).names(), ["concept.hilfe", "concept.mehr"]);

  const later = withCatalogue({ hilfe: { labelDe: "Helfen", speechDe: "Kannst du mir helfen?", symbolPath: "./icons/helfen.svg" } });
  const board = await resolveBoard(store, mia.id, later);
  // Wording as chosen; the symbol is the current catalogue's.
  assert.deepEqual(board.entries[0], { id: "hilfe", labelDe: "Hilfe", speechDe: "Ich brauche Hilfe.", symbolPath: "./icons/helfen.svg", source: "catalogue" });
  assert.deepEqual(board.problems, []);

  // Per profile: the copy is Mia's. Ben's old board has no entry and follows the catalogue, as before.
  assert.equal((await resolveBoard(store, ben.id, later)).entries[0].speechDe, "Kannst du mir helfen?");
  assert.deepEqual(await store.data(ben.id).names(), []);
  assert.deepEqual(Object.keys(backend.snapshot()).filter((key) => key.includes("/data/")), [`profile/${mia.id}/data/concept.hilfe`, `profile/${mia.id}/data/concept.mehr`]);

  // Choosing again with the later catalogue does not overwrite what is stored; a newly chosen concept gets the wording of that moment.
  await setBoardConcepts(store, mia.id, ["mehr", "hilfe", "pause"], withCatalogue({ hilfe: { speechDe: "Kannst du mir helfen?" }, pause: { speechDe: "Pause, bitte." } }));
  const again = await resolveBoard(store, mia.id, CONCEPTS);
  assert.deepEqual(again.entries.map((entry) => entry.speechDe), ["Ich möchte mehr.", "Ich brauche Hilfe.", "Pause, bitte."]);
  // Ben's board is pinned from the moment its concepts are chosen through the API.
  await setBoardConcepts(store, ben.id, ["hilfe"], later);
  assert.equal((await resolveBoard(store, ben.id, CONCEPTS)).entries[0].speechDe, "Kannst du mir helfen?");
});

test("a caregiver's own wording is kept when concepts are chosen, and clearing it returns to the current catalogue wording", async () => {
  const { store } = await openStore();
  const mia = await store.create("Mia", []);
  await setWording(store, mia.id, "hilfe", { labelDe: "Hilf mir", speechDe: "Bitte hilf mir." }, CONCEPTS);
  await setBoardConcepts(store, mia.id, ["hilfe"], CONCEPTS);
  assert.equal((await resolveBoard(store, mia.id, CONCEPTS)).entries[0].speechDe, "Bitte hilf mir.");
  const later = withCatalogue({ hilfe: { speechDe: "Kannst du mir helfen?" } });
  await clearWording(store, mia.id, "hilfe", later);
  assert.deepEqual(await store.data(mia.id).get("concept.hilfe"), { version: 1, labelDe: "Hilfe", speechDe: "Kannst du mir helfen?", copied: true });
  // Stored again, so it is pinned again.
  assert.equal((await resolveBoard(store, mia.id, CONCEPTS)).entries[0].speechDe, "Kannst du mir helfen?");
});

test("a concept the catalogue dropped is still shown and spoken from its stored wording, as text", async () => {
  const { store } = await openStore();
  const mia = await store.create("Mia", []);
  await setBoardConcepts(store, mia.id, ["hilfe", "pause"], CONCEPTS);
  await store.setActive(mia.id);
  const later = withCatalogue({}, ["pause"]);
  const board = await resolveBoard(store, mia.id, later);
  assert.deepEqual(board.entries[1], { id: "pause", labelDe: "Pause", speechDe: "Ich brauche eine Pause.", symbolPath: null, source: "retired" });
  assert.deepEqual(board.problems, []);
  withMountedBoard(await resolveStartupView(store, later), ({ root, labels, buttons, notices, output, spoken, warnings }) => {
    assert.deepEqual(labels, ["Hilfe", "Pause"]);
    assert.deepEqual(notices, []);
    assert.equal(root.dataset.boardProblems, "0");
    assert.deepEqual(warnings, []);
    assert.deepEqual(buttons[1].children.map((child) => child.tagName), ["span"]);
    buttons[1].click();
    assert.equal(output.textContent, "Ich brauche eine Pause.");
    assert.deepEqual(spoken, ["Ich brauche eine Pause."]);
  });

  // It stays a member of the board: it can be chosen again and reworded, with the catalogue that no longer has it.
  await setBoardConcepts(store, mia.id, ["pause", "hilfe"], later);
  await setWording(store, mia.id, "pause", { labelDe: "Ruhe", speechDe: "Ich will Ruhe." }, later);
  assert.deepEqual((await resolveBoard(store, mia.id, later)).entries[0], { id: "pause", labelDe: "Ruhe", speechDe: "Ich will Ruhe.", symbolPath: null, source: "retired" });
  // Its wording is all there is of it: it cannot be cleared, only removed.
  await rejectsWith(clearWording(store, mia.id, "pause", later), "retired-concept");
  assert.deepEqual((await store.get(mia.id)).conceptIds, ["pause", "hilfe"]);
  await removeCustomConcept(store, mia.id, "pause", later);
  assert.deepEqual((await store.get(mia.id)).conceptIds, ["hilfe"]);
  assert.deepEqual(await store.data(mia.id).names(), ["concept.hilfe"]);
});

test("setBoardConcepts: under an id the catalogue does not have, a readable entry is choosable with or without the custom flag; no entry or an unreadable one is refused", async () => {
  const { backend, store } = await openStore();
  const mia = await store.create("Mia", []);
  const data = store.data(mia.id);
  await putCustomConcept(store, mia.id, "ball", BALL, CONCEPTS);
  // No `custom`: the stored wording of a concept an earlier catalogue had.
  await data.set("concept.einhorn", { version: 1, labelDe: "Einhorn", speechDe: "Ein Einhorn." });
  await data.set("concept.kaputt", { version: 1, labelDe: "", speechDe: "Leer." });
  await data.set("concept.neuer", { version: 2, labelDe: "Neu", speechDe: "Neu." });
  const before = backend.snapshot();
  for (const refused of ["fehlt", "kaputt", "neuer"]) {
    await rejectsWith(setBoardConcepts(store, mia.id, ["hilfe", "ball", refused], CONCEPTS), "unknown-concept");
    await rejectsWith(setWording(store, mia.id, refused, BALL, CONCEPTS), "unknown-concept");
  }
  // A refusal comes before the first write: "hilfe" was not copied either.
  assert.deepEqual(backend.snapshot(), before);

  await setBoardConcepts(store, mia.id, ["einhorn", "ball"], CONCEPTS);
  const board = await resolveBoard(store, mia.id, CONCEPTS);
  assert.deepEqual(board.entries, [
    { id: "einhorn", labelDe: "Einhorn", speechDe: "Ein Einhorn.", symbolPath: null, source: "retired" },
    { id: "ball", ...BALL, symbolPath: null, source: "custom" },
  ]);
  assert.deepEqual(board.problems, []);
  // Only custom concepts are listed as such.
  assert.deepEqual((await listCustomConcepts(store, mia.id)).concepts.map((concept) => concept.id), ["ball"]);
  // When the catalogue has the id (again), the stored wording stays and the symbol comes back.
  const grown = [...CONCEPTS, { id: "einhorn", labelDe: "Pferd", speechDe: "Ein Pferd.", symbolPath: "./icons/einhorn.svg" }];
  assert.deepEqual((await resolveBoard(store, mia.id, grown)).entries[0], { id: "einhorn", labelDe: "Einhorn", speechDe: "Ein Einhorn.", symbolPath: "./icons/einhorn.svg", source: "catalogue" });
});

test("a write that fails during setBoardConcepts leaves the earlier board, and that board resolves", async () => {
  // Three wordings to copy, then the concept ids: four writes.
  const next = ["mehr", "ball", "pause", "hilfe", "fertig"];
  const seed = async () => {
    const { backend, store } = await openStore();
    const mia = await store.create("Mia", []);
    await putCustomConcept(store, mia.id, "ball", BALL, CONCEPTS);
    await setBoardConcepts(store, mia.id, ["hilfe", "ball"], CONCEPTS);
    return { backend, store, mia, earlier: await resolveBoard(store, mia.id, CONCEPTS) };
  };
  for (const failing of [1, 2, 3, 4]) {
    const { backend, store, mia, earlier } = await seed();
    backend.failWrite(failing);
    await assert.rejects(setBoardConcepts(store, mia.id, next, CONCEPTS), InjectedWriteError, `write ${failing}`);
    const board = await resolveBoard(store, mia.id, CONCEPTS);
    assert.deepEqual(board.entries, earlier.entries, `after a failure of write ${failing}`);
    assert.deepEqual(board.problems, []);
    assert.equal((await store.data(mia.id).names()).length, 2 + failing - 1, "wordings copied before the failure stay");
    // Calling again finishes the job.
    await setBoardConcepts(store, mia.id, next, CONCEPTS);
    const done = await resolveBoard(store, mia.id, CONCEPTS);
    assert.deepEqual(done.entries.map((entry) => entry.id), next);
    assert.deepEqual(done.problems, []);
    assert.deepEqual(await store.data(mia.id).names(), ["concept.ball", "concept.fertig", "concept.hilfe", "concept.mehr", "concept.pause"]);
  }
  // There is no fifth write.
  const { backend, store, mia } = await seed();
  backend.failWrite(5);
  await setBoardConcepts(store, mia.id, next, CONCEPTS);
  assert.deepEqual((await store.get(mia.id)).conceptIds, next);
});

// --- Start-up view: the active-profile pointer ---

test("startup: an active-profile pointer that is junk or names no stored profile counts as no active profile", async () => {
  for (const pointer of ["junk", 7, null, { id: "x" }, "f".repeat(32), ""]) {
    const { backend, store } = await openStore();
    await backend.write({ set: { "app/active-profile": pointer } });
    assert.deepEqual(await resolveStartupView(store, CONCEPTS), { kind: "demo", storage: "empty" }, JSON.stringify(pointer));
    const mia = await store.create("Mia", ["hilfe"]);
    assert.deepEqual(await resolveStartupView(store, CONCEPTS), { kind: "no-active", profiles: [{ id: mia.id, displayName: "Mia" }] }, JSON.stringify(pointer));
    // Reading did not repair or remove the pointer.
    assert.deepEqual(backend.snapshot()["app/active-profile"], pointer);
  }
});

// --- Rendering: examples, fallback, own board ---

test("render: a device without profiles shows the example concepts with the not-approved line and no fallback cause", () => {
  withMountedBoard({ kind: "demo", storage: "empty" }, ({ root, labels, notices, fallback, buttons, output, spoken }) => {
    assert.deepEqual(labels, EXAMPLE_LABELS);
    assert.deepEqual(notices, ["Testoberfläche mit Beispielen. Die Begriffe sind noch nicht freigegeben."]);
    assert.equal(fallback, null);
    assert.equal("boardFallback" in root.dataset, false);
    assert.equal(buttons[0].children[0].tagName, "img");
    assert.equal(buttons[0].children[0].src, "./icons/hilfe.svg");
    buttons[2].click();
    assert.equal(output.textContent, "Ich brauche eine Pause.");
    assert.deepEqual(spoken, ["Ich brauche eine Pause."]);
  });
});

test("render: when the own board cannot be shown, the examples stand in, tappable, under one sentence that says so and why", () => {
  const empty = { kind: "profile", profileId: "0".repeat(32), displayName: "Mia", entries: [], problems: [] };
  const cases = [
    [{ kind: "demo", storage: "unavailable" }, "storage-unavailable", /^Der Speicher dieses Geräts ist gerade nicht erreichbar\. Deshalb werden hier Beispiele gezeigt\.$/],
    [{ kind: "damaged", count: 2 }, "damaged", /^Die eigene Tafel kann gerade nicht geladen werden\. Deshalb werden Beispiele gezeigt\. Bitte gib einer Bezugsperson Bescheid\.$/],
    [{ kind: "no-active", profiles: [{ id: "0".repeat(32), displayName: "Mia" }] }, "no-active", /^Es ist noch keine eigene Tafel ausgewählt\. Bis dahin werden Beispiele gezeigt\./],
    [empty, "empty-profile", /^Für die eigene Tafel sind noch keine Begriffe ausgewählt\. Bis dahin werden Beispiele gezeigt\.$/],
    [{ ...empty, problems: [{ kind: "unknown-concept", conceptId: "einhorn" }] }, "unloadable-profile", /^Die Begriffe der eigenen Tafel konnten nicht geladen werden\. Deshalb werden Beispiele gezeigt\./],
    [{ kind: "fallback", cause: "timeout" }, "timeout", /^Das Laden dauert gerade länger\. Deshalb werden Beispiele gezeigt\.$/],
    [{ kind: "fallback", cause: "timeout-kept" }, "timeout-kept", /Beispiele gezeigt\. Die eigene Tafel ist bereit und erscheint, wenn die Seite neu geladen wird\.$/],
    [{ kind: "fallback", cause: "render-failed" }, "render-failed", /^Die eigene Tafel kann gerade nicht angezeigt werden\. Deshalb werden Beispiele gezeigt\./],
    [{ kind: "fallback", cause: "refresh-timeout" }, "refresh-timeout", /^Die Tafel konnte gerade nicht neu geladen werden\. Deshalb werden Beispiele gezeigt\./],
  ];
  const sentences = new Set();
  for (const [view, cause, sentence] of cases) {
    assert.equal(fallbackCause(view), cause);
    withMountedBoard(view, ({ root, labels, notices, fallback, buttons, output, retry, text, spoken }) => {
      assert.equal(fallback, cause);
      assert.deepEqual(labels, EXAMPLE_LABELS, cause);
      assert.equal(notices.length, 1, cause);
      assert.match(notices[0], sentence);
      assert.match(notices[0], /Beispiele/);
      // Only the two causes that end by themselves may say "until then".
      if (!["no-active", "empty-profile"].includes(cause)) assert.doesNotMatch(notices[0], /Bis dahin/);
      // The timeout sentence also stands on a device without profiles: it must not promise an own board.
      if (cause === "timeout") assert.doesNotMatch(notices[0], /eigene/);
      sentences.add(notices[0]);
      assert.equal(root.children[0].tagName, "h1");
      assert.doesNotMatch(text, /lösch|entfern|IndexedDB|Datenbank|Fehlercode|error|Profil|Mia/i);
      buttons[0].click();
      assert.equal(output.textContent, "Ich brauche Hilfe.");
      assert.deepEqual(spoken, ["Ich brauche Hilfe."]);
      assert.equal(retry.hidden, false);
      // The trace for the caregiver is there for a profile whose concepts could not be loaded.
      assert.equal(root.dataset.boardProblems, view.kind === "profile" ? String(view.problems.length) : undefined);
    });
  }
  assert.equal(sentences.size, cases.length, "every cause has its own sentence");
  assert.equal(fallbackCause({ kind: "demo", storage: "empty" }), null);
  assert.equal(fallbackCause(MIA_VIEW), null);
});

test("render: a profile's own board shows its concepts; a custom concept is a text-only button that speaks its sentence", async () => {
  const { store } = await openStore();
  const mia = await store.create("Mia", []);
  await putCustomConcept(store, mia.id, "ball", BALL, CONCEPTS);
  await setBoardConcepts(store, mia.id, ["trinken", "ball"], CONCEPTS);
  await store.setActive(mia.id);
  withMountedBoard(await resolveStartupView(store, CONCEPTS), ({ board, buttons, labels, notices, fallback, output, speechStatus, retry, spoken }) => {
    assert.deepEqual(notices, []);
    assert.equal(fallback, null);
    assert.deepEqual(labels, ["Trinken", "Ball"]);
    assert.equal(board.role, "group");
    assert.equal(board["aria-label"], "Kommunikationsbegriffe");
    for (const region of [output, speechStatus]) {
      assert.equal(region.role, "status");
      assert.equal(region["aria-live"], "polite");
    }
    assert.equal(retry.hidden, true);

    const [withSymbol, textOnly] = buttons;
    assert.deepEqual(withSymbol.children.map((child) => child.tagName), ["img", "span"]);
    assert.equal(withSymbol.className, "concept");
    // No image element at all for a concept without a symbol.
    assert.deepEqual(textOnly.children.map((child) => child.tagName), ["span"]);
    assert.equal(textOnly.className, "concept concept-text");
    assert.equal(textOnly.tagName, "button");
    assert.equal(textOnly["aria-label"], "Ball");

    textOnly.click();
    assert.equal(output.textContent, BALL.speechDe);
    assert.deepEqual(spoken, [BALL.speechDe]);
    assert.match(speechStatus.textContent, /Lokale deutsche Stimme angefordert/);
    assert.equal(retry.hidden, false);
    retry.click();
    assert.deepEqual(spoken, [BALL.speechDe, BALL.speechDe]);
    withSymbol.click();
    assert.equal(output.textContent, "Ich möchte etwas trinken.");
    assert.equal(spoken.at(-1), "Ich möchte etwas trinken.");
  });
});

test("render: a profile board with at least one loadable concept stays the own board, with the problems line", async () => {
  const { store } = await openStore();
  const mia = await store.create("Mia", ["hilfe", "einhorn"]);
  await store.setActive(mia.id);
  withMountedBoard(await resolveStartupView(store, CONCEPTS), ({ labels, notices, fallback }) => {
    assert.deepEqual(labels, ["Hilfe"]);
    assert.equal(fallback, null);
    assert.deepEqual(notices, ["Nicht alle Begriffe dieser Tafel konnten so geladen werden, wie sie gespeichert sind."]);
  });
});

test("render: nothing that identifies the child is in the board region, neither as text nor in an attribute", async () => {
  const { store } = await openStore();
  const name = "Zoë Geheimname";
  const mia = await store.create(name, []);
  await setBoardConcepts(store, mia.id, ["hilfe"], CONCEPTS);
  await store.setActive(mia.id);
  const own = await resolveStartupView(store, CONCEPTS);
  assert.equal(own.displayName, name); // the view carries it for the caregiver area
  await store.setConceptIds(mia.id, []);
  const emptyBoard = await resolveStartupView(store, CONCEPTS);
  await store.setActive(null);
  const noActive = await resolveStartupView(store, CONCEPTS);
  assert.equal(noActive.profiles[0].displayName, name);
  for (const view of [own, emptyBoard, noActive]) {
    withMountedBoard(view, ({ root, buttons }) => {
      buttons[0].click();
      const strings = stringsIn(root).join("\n");
      assert.ok(strings.includes("Hilfe"), "the walk sees the board");
      assert.doesNotMatch(strings, /Geheimname|Zoë|Profil:/);
      assert.ok(!strings.includes(mia.id), "profile id in the board region");
    });
  }
});

test("render: the fallback sentence of a board of examples can change in place; an own board and a replaced board ignore it", () => {
  withMountedBoard({ kind: "fallback", cause: "timeout" }, ({ root, handle, buttons, output }) => {
    buttons[1].click();
    const mountedNodes = [...root.children];
    handle.restate({ kind: "fallback", cause: "timeout-kept" });
    assert.deepEqual(root.children, mountedNodes);
    assert.match(parts(root).notices[0], /erscheint, wenn die Seite neu geladen wird/);
    assert.equal(root.dataset.boardFallback, "timeout-kept");
    assert.equal(output.textContent, "Ich möchte etwas trinken.");
    assert.equal(handle.hasSelection(), true);
    handle.restate({ kind: "demo", storage: "empty" });
    assert.deepEqual(parts(root).notices, ["Testoberfläche mit Beispielen. Die Begriffe sind noch nicht freigegeben."]);
    assert.equal("boardFallback" in root.dataset, false);

    // A handle of a board that has been replaced must not write into the new one.
    const own = mountBoard(root, MIA_VIEW);
    handle.restate({ kind: "damaged", count: 1 });
    own.restate({ kind: "damaged", count: 1 });
    assert.deepEqual(parts(root).notices, []);
    assert.deepEqual(parts(root).labels, ["Ball"]);
    assert.equal("boardFallback" in root.dataset, false);
  });
});

test("render: mounting again replaces the earlier board completely, and the last-resort line claims no loading", () => {
  withMountedBoard({ kind: "damaged", count: 1 }, ({ root }) => {
    assert.equal(root.children.length, 6);
    mountBoard(root, MIA_VIEW);
    assert.deepEqual(parts(root).labels, ["Ball"]);
    assert.equal("boardFallback" in root.dataset, false);
    mountBoard(root, { kind: "no-active", profiles: [] });
    mountFailure(root);
    assert.deepEqual(root.children.map((child) => child.tagName), ["h1", "p"]);
    assert.match(root.children[1].textContent, /^Die Tafel kann gerade nicht angezeigt werden\./);
    assert.doesNotMatch(root.children[1].textContent, /geladen wird|lädt/);
    assert.equal("boardFallback" in root.dataset, false);
  });
});

// --- Start-up sequence ---

test("start: storage answers in time: a waiting line without buttons, then exactly one board, never the examples", async () => {
  await withStartup(async ({ root, host, mounts, timers, view, answer, fireTimer, forceTimer, now }) => {
    const done = runStartup(view, host);
    assert.equal(root.dataset.startup, "pending");
    assert.deepEqual(now().notices, ["Die Tafel wird geladen."]);
    assert.equal(now().board, null);
    assert.deepEqual(root.children.map((child) => child.tagName), ["h1", "p"]);
    assert.deepEqual(timers.map((timer) => timer.milliseconds), [STARTUP_WAIT_MS]);
    assert.ok(STARTUP_WAIT_MS >= 500 && STARTUP_WAIT_MS <= 3000);

    answer(MIA_VIEW);
    await done;
    assert.equal(root.dataset.startup, "profile");
    assert.equal("startupLate" in root.dataset, false);
    assert.deepEqual(now().labels, ["Ball"]);
    assert.equal(timers[0].cancelled, true);
    fireTimer();
    // Also when the timer fires although it was cancelled: storage has answered, the board stays.
    forceTimer();
    assert.equal(mounts.length, 2);
    assert.deepEqual(mounts.map((mount) => mount.labels), [[], ["Ball"]]);
    assert.equal(root.dataset.startup, "profile");
  });
});

test("start: every resolved view is mounted once and named in data-startup, with its fallback cause", async () => {
  for (const [resolved, state, cause] of [
    [{ kind: "demo", storage: "empty" }, "demo-empty", null],
    [{ kind: "demo", storage: "unavailable" }, "demo-unavailable", "storage-unavailable"],
    [{ kind: "damaged", count: 1 }, "damaged", "damaged"],
    [{ kind: "no-active", profiles: [] }, "no-active", "no-active"],
    [{ ...MIA_VIEW, entries: [] }, "profile", "empty-profile"],
  ]) {
    await withStartup(async ({ root, host, mounts, view, answer, now }) => {
      const done = runStartup(view, host);
      answer(resolved);
      await done;
      assert.equal(root.dataset.startup, state);
      assert.equal(now().fallback, cause);
      assert.deepEqual(now().labels, EXAMPLE_LABELS);
      assert.equal(mounts.length, 2);
    });
  }
});

test("start: storage is slow: after the bound the examples are shown with the still-loading sentence and work", async () => {
  await withStartup(async ({ root, host, mounts, fireTimer, view, now }) => {
    void runStartup(view, host);
    assert.equal(now().board, null);
    fireTimer();
    assert.equal(root.dataset.startup, "demo-timeout");
    assert.equal(now().fallback, "timeout");
    assert.deepEqual(now().labels, EXAMPLE_LABELS);
    assert.match(now().notices[0], /^Das Laden dauert gerade länger/);
    now().buttons[0].click();
    assert.equal(now().output.textContent, "Ich brauche Hilfe.");
    assert.equal(mounts.length, 2);
  });
});

test("start: storage never answers: the examples stay and the timer does not mount twice", async () => {
  await withStartup(async ({ root, host, mounts, fireTimer, view, now }) => {
    let settled = false;
    void runStartup(view, host).then(() => { settled = true; });
    fireTimer();
    fireTimer();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false);
    assert.equal(mounts.length, 2);
    assert.equal(root.dataset.startup, "demo-timeout");
    assert.deepEqual(now().labels, EXAMPLE_LABELS);
    now().buttons[4].click();
    assert.equal(now().output.textContent, "Ich bin fertig.");
  });
});

test("start: a late answer with an own board replaces the examples when nothing was selected on them", async () => {
  await withStartup(async ({ root, host, mounts, fireTimer, view, answer, now }) => {
    const done = runStartup(view, host);
    fireTimer();
    assert.deepEqual(now().labels, EXAMPLE_LABELS);
    answer(MIA_VIEW);
    await done;
    assert.deepEqual(now().labels, ["Ball"]);
    assert.equal(now().fallback, null);
    assert.equal(root.dataset.startup, "profile");
    assert.equal(root.dataset.startupLate, "replaced");
    assert.equal(mounts.length, 3);
  });
});

test("start: a late answer never replaces examples the child has already used; the line says a reload brings the own board", async () => {
  await withStartup(async ({ root, host, mounts, fireTimer, view, answer, now, speech }) => {
    const done = runStartup(view, host);
    fireTimer();
    now().buttons[0].click();
    const cancelled = speech.cancelled;
    answer(MIA_VIEW);
    await done;
    assert.deepEqual(now().labels, EXAMPLE_LABELS);
    assert.equal(now().output.textContent, "Ich brauche Hilfe.");
    assert.equal(root.dataset.startup, "demo-timeout");
    assert.equal(root.dataset.startupLate, "kept");
    assert.equal(now().fallback, "timeout-kept");
    assert.match(now().notices[0], /erscheint, wenn die Seite neu geladen wird/);
    assert.doesNotMatch(now().notices[0], /dauert gerade länger/);
    assert.equal(mounts.length, 2);
    // The sentence that is being spoken is not cut off either.
    assert.equal(speech.cancelled, cancelled);
  });
});

test("start: a late answer that shows examples too causes no re-mount: the sentence above them changes and its problems are traced", async () => {
  const unloadable = { ...MIA_VIEW, entries: [], problems: [{ kind: "unknown-concept", conceptId: "einhorn" }, { kind: "damaged-custom-concept", conceptId: "ball", damage: "unreadable" }] };
  for (const [resolved, state, cause, sentence, problems] of [
    [{ kind: "damaged", count: 1 }, "damaged", "damaged", /^Die eigene Tafel kann gerade nicht geladen werden/, undefined],
    [{ kind: "demo", storage: "unavailable" }, "demo-unavailable", "storage-unavailable", /^Der Speicher dieses Geräts/, undefined],
    [{ kind: "demo", storage: "empty" }, "demo-empty", null, /^Testoberfläche mit Beispielen/, undefined],
    [{ ...MIA_VIEW, entries: [] }, "profile", "empty-profile", /noch keine Begriffe ausgewählt/, "0"],
    [unloadable, "profile", "unloadable-profile", /konnten nicht geladen werden/, "2"],
  ]) {
    for (const select of [false, true]) {
      await withStartup(async ({ root, host, mounts, fireTimer, view, answer, now, speech, warnings }) => {
        const done = runStartup(view, host);
        fireTimer();
        if (select) now().buttons[3].click();
        const nodes = [...root.children];
        const cancelled = speech.cancelled;
        answer(resolved);
        await done;
        assert.equal(mounts.length, 2, "no re-mount");
        assert.deepEqual(root.children, nodes);
        assert.equal(speech.cancelled, cancelled);
        assert.equal(root.dataset.startup, state);
        assert.equal(root.dataset.startupLate, "same-board");
        assert.equal(now().fallback, cause);
        assert.equal(now().notices.length, 1);
        assert.match(now().notices[0], sentence);
        assert.equal(now().output.textContent, select ? "Ich möchte mehr." : "Wähle einen Begriff.");
        // The same trace as when the view is mounted directly.
        assert.equal(root.dataset.boardProblems, problems, String(cause));
        assert.deepEqual(warnings, problems === "2"
          ? ['Board problem: unknown-concept for concept "einhorn"', 'Board problem: damaged-custom-concept for concept "ball" (unreadable)']
          : []);
      });
    }
  }
});

test("start: a failing view promise or a view that cannot be drawn ends on the examples with the matching sentence", async () => {
  await withStartup(async ({ root, host, view, fail, now }) => {
    const done = runStartup(view, host);
    fail(new Error("storage broke"));
    await done;
    assert.equal(root.dataset.startup, "demo-unavailable");
    assert.equal(now().fallback, "storage-unavailable");
    assert.deepEqual(now().labels, EXAMPLE_LABELS);
  });
  await withStartup(async ({ root, host, view, answer, now }) => {
    const done = runStartup(view, host);
    answer({ kind: "profile", profileId: "0".repeat(32), displayName: "Mia", problems: [], entries: [null] });
    await done;
    assert.equal(root.dataset.startup, "failed");
    assert.equal(now().fallback, "render-failed");
    assert.match(now().notices[0], /kann gerade nicht angezeigt werden/);
    assert.deepEqual(now().labels, EXAMPLE_LABELS);
  });
});

test("start: a host that throws never makes runStartup throw and never leaves the waiting line for good", async () => {
  // The waiting line cannot be shown: start-up goes on and mounts the board.
  await withStartup(async ({ root, host, view, answer, now }) => {
    const done = runStartup(view, { ...host, showLoading() { throw new Error("no waiting line"); } });
    assert.deepEqual(root.children, []);
    answer(MIA_VIEW);
    await done;
    assert.deepEqual(now().labels, ["Ball"]);
    assert.equal(root.dataset.startup, "profile");
  });
  // No timer can be set: the answer is still mounted.
  await withStartup(async ({ root, host, view, answer, now }) => {
    const done = runStartup(view, { ...host, setTimer() { throw new Error("no timers"); } });
    answer(MIA_VIEW);
    await done;
    assert.deepEqual(now().labels, ["Ball"]);
    assert.equal(root.dataset.startup, "profile");
  });
  // The examples cannot be drawn when the bound passes: a plain line replaces the waiting line.
  await withStartup(async ({ root, host, view, answer, fireTimer, now }) => {
    let broken = true;
    const done = runStartup(view, { ...host, mount(mounted) { if (broken) throw new Error("cannot draw"); return host.mount(mounted); } });
    assert.deepEqual(now().notices, ["Die Tafel wird geladen."]);
    assert.doesNotThrow(fireTimer);
    assert.equal(root.dataset.startup, "unrenderable");
    assert.equal(now().notices.length, 1);
    assert.match(now().notices[0], /^Die Tafel kann gerade nicht angezeigt werden\. Bitte lade die Seite neu/);
    assert.equal(now().board, null);
    // A later answer still gets its board once drawing works again.
    broken = false;
    answer(MIA_VIEW);
    await done;
    assert.deepEqual(now().labels, ["Ball"]);
    assert.equal(root.dataset.startup, "profile");
    assert.equal(root.dataset.startupLate, "replaced");
  });
  // Neither a board nor the plain line can be drawn: still no exception, and the state says so.
  await withStartup(async ({ root, host, view, answer }) => {
    const data = {};
    const dead = { ...host, mount() { throw new Error("cannot draw"); }, showFailure() { throw new Error("cannot draw"); }, setData(name, value) { data[name] = value; } };
    const done = runStartup(view, dead);
    answer(MIA_VIEW);
    await done;
    assert.equal(data.startup, "unrenderable");
    assert.deepEqual(root.children.map((child) => child.tagName), ["h1", "p"]);
  });
});

// --- App controller ---

test("app: one store for the page: start-up uses it, store() hands out the same instance, the backend is opened once", async () => {
  await withPage(async ({ root, setTimer, now, mounts }) => {
    const backend = new MemoryBackend();
    const seeded = await ProfileStore.open(backend);
    const mia = await seeded.create("Mia", []);
    await putCustomConcept(seeded, mia.id, "ball", BALL, CONCEPTS);
    await setBoardConcepts(seeded, mia.id, ["ball"], CONCEPTS);
    await seeded.setActive(mia.id);

    let opened = 0;
    const app = createApp(root, { openBackend: async () => { opened += 1; return backend; }, catalogue: CONCEPTS, setTimer, report: (error) => assert.fail(String(error)) });
    assert.deepEqual(now().notices, ["Die Tafel wird geladen."]);
    await app.started;
    assert.deepEqual(now().labels, ["Ball"]);
    assert.equal(root.dataset.startup, "profile");
    assert.equal(mounts.length, 2);

    const store = await app.store();
    assert.ok(store instanceof ProfileStore);
    assert.equal(await app.store(), store);
    assert.notEqual(store, seeded);
    assert.equal(await store.getActive(), mia.id);
    await app.refreshBoard();
    assert.equal(await app.store(), store);
    assert.equal(opened, 1);
  });
});

test("app: storage that cannot be opened or read: store() is null or the read is reported, and the examples say why", async () => {
  await withPage(async ({ root, setTimer, now }) => {
    for (const openBackend of [() => Promise.reject(new Error("no storage")), () => { throw new Error("thrown at once"); }]) {
      const reported = [];
      const app = createApp(root, { openBackend, catalogue: CONCEPTS, setTimer, report: (error) => reported.push(error.message) });
      await app.started;
      assert.equal(await app.store(), null);
      assert.equal(reported.length, 1);
      assert.equal(root.dataset.startup, "demo-unavailable");
      assert.equal(now().fallback, "storage-unavailable");
      assert.deepEqual(now().labels, EXAMPLE_LABELS);
      await app.refreshBoard();
      assert.equal(root.dataset.startup, "demo-unavailable");
      assert.equal(reported.length, 1);
    }

    // An unknown storage layout: the store refuses to open and writes nothing.
    const foreign = new MemoryBackend();
    await foreign.write({ set: { "app/schema": 99 } });
    const refused = createApp(root, { openBackend: async () => foreign, catalogue: CONCEPTS, setTimer });
    await refused.started;
    assert.equal(await refused.store(), null);
    assert.equal(root.dataset.startup, "demo-unavailable");
    assert.deepEqual(foreign.snapshot(), { "app/schema": 99 });

    // A backend that opens and then fails on reads: there is a store, the failed read is reported, the view is "unavailable".
    const failing = { get: async () => 1, keys: () => Promise.reject(new Error("read failed")), write: async () => undefined };
    const reads = [];
    const broken = createApp(root, { openBackend: async () => failing, catalogue: CONCEPTS, setTimer, report: (error) => reads.push(error.message) });
    await broken.started;
    assert.ok((await broken.store()) instanceof ProfileStore);
    assert.deepEqual(reads, ["read failed"]);
    assert.equal(root.dataset.startup, "demo-unavailable");
    assert.equal(now().fallback, "storage-unavailable");
    assert.deepEqual(now().labels, EXAMPLE_LABELS);

    // A reporter that throws is harmless.
    const quiet = createApp(root, { openBackend: async () => failing, catalogue: CONCEPTS, setTimer, report: () => { throw new Error("reporter broke"); } });
    await quiet.started;
    assert.equal(root.dataset.startup, "demo-unavailable");
  });
});

test("app: refreshBoard shows a profile change without a reload, replaces a board in use and stops running speech", async () => {
  await withPage(async ({ root, setTimer, now, mounts, speech }) => {
    const backend = new MemoryBackend();
    let opened = 0;
    const app = createApp(root, { openBackend: async () => { opened += 1; return backend; }, catalogue: CONCEPTS, setTimer });
    await app.started;
    assert.equal(root.dataset.startup, "demo-empty");
    assert.deepEqual(now().labels, EXAMPLE_LABELS);

    // What the caregiver area will do: change a profile through the app's store, then refresh.
    const store = await app.store();
    const mia = await store.create("Mia", []);
    await putCustomConcept(store, mia.id, "ball", BALL, CONCEPTS);
    await setBoardConcepts(store, mia.id, ["ball", "mehr"], CONCEPTS);
    await store.setActive(mia.id);
    assert.deepEqual(now().labels, EXAMPLE_LABELS, "nothing changes until the refresh");

    now().buttons[0].click(); // the board is in use and speaking
    const cancelled = speech.cancelled;
    await app.refreshBoard();
    assert.deepEqual(now().labels, ["Ball", "Mehr"]);
    assert.equal(now().output.textContent, "Wähle einen Begriff.");
    assert.equal(speech.cancelled, cancelled + 1);
    assert.equal(root.dataset.startup, "profile");
    assert.equal(mounts.length, 3);

    await store.setConceptIds(mia.id, []);
    await app.refreshBoard();
    assert.deepEqual(now().labels, EXAMPLE_LABELS);
    assert.equal(now().fallback, "empty-profile");
    assert.equal(opened, 1);
  });
});

test("app: refreshes asked for at the same time are carried out one after another, and the last one decides the board", async () => {
  await withPage(async ({ root, setTimer, now, mounts }) => {
    const inner = new MemoryBackend();
    // A backend that can hold back one read, so that an earlier refresh is still reading when a later one starts.
    let holdKey = null;
    let reached;
    let release;
    const backend = {
      keys: (prefix) => inner.keys(prefix),
      write: (batch) => inner.write(batch),
      async get(key) {
        if (key === holdKey) {
          holdKey = null;
          reached();
          await new Promise((resolve) => { release = resolve; });
        }
        return inner.get(key);
      },
    };
    const app = createApp(root, { openBackend: async () => backend, catalogue: CONCEPTS, setTimer });
    await app.started;
    const store = await app.store();
    const many = await store.create("A", []);
    await setBoardConcepts(store, many.id, ["hilfe", "trinken", "pause", "mehr", "fertig"], CONCEPTS);
    const one = await store.create("B", []);
    await setBoardConcepts(store, one.id, ["fertig"], CONCEPTS);
    await store.setActive(many.id);

    const order = [];
    const held = new Promise((resolve) => { reached = resolve; });
    holdKey = `profile/${many.id}/data/concept.hilfe`;
    const first = app.refreshBoard().then(() => order.push("first"));
    await held; // the first refresh is in the middle of reading the long board
    await inner.write({ set: { "app/active-profile": one.id } }); // meanwhile the active profile changes
    const second = app.refreshBoard().then(() => order.push("second"));
    const third = app.refreshBoard().then(() => order.push("third"));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(mounts.length, 2, "nothing is mounted while the first refresh reads");
    release();
    await Promise.all([first, second, third]);

    assert.deepEqual(order, ["first", "second", "third"]);
    assert.deepEqual(mounts.slice(2).map((mount) => mount.labels), [
      ["Hilfe", "Trinken", "Pause", "Mehr", "Fertig"], ["Fertig"], ["Fertig"],
    ]);
    assert.deepEqual(now().labels, ["Fertig"]);
  });
});

/** A backend over `inner` whose reads the test can hold back or make fail. */
function controllableBackend(inner) {
  const control = {
    holdKey: null, reached: null, release: () => undefined,
    /** While set, every read rejects with this error. */
    failWith: null,
    /** Holds the next `get` of this key until `release()` is called; the returned promise resolves when it is held. */
    hold(key) {
      control.holdKey = key;
      return new Promise((resolve) => { control.reached = resolve; });
    },
  };
  const backend = {
    async keys(prefix) {
      if (control.failWith !== null) throw control.failWith;
      return inner.keys(prefix);
    },
    write: (batch) => inner.write(batch),
    async get(key) {
      if (control.failWith !== null) throw control.failWith;
      if (key === control.holdKey) {
        control.holdKey = null;
        control.reached();
        await new Promise((resolve) => { control.release = resolve; });
      }
      return inner.get(key);
    },
  };
  return { backend, control };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("app: a refresh asked for during start-up is carried out after start-up, and clears its late-answer marker", async () => {
  await withPage(async ({ root, setTimer, now, mounts }) => {
    const inner = new MemoryBackend();
    const seeded = await ProfileStore.open(inner);
    const many = await seeded.create("A", []);
    await setBoardConcepts(seeded, many.id, ["hilfe", "trinken", "pause", "mehr", "fertig"], CONCEPTS);
    const one = await seeded.create("B", []);
    await setBoardConcepts(seeded, one.id, ["fertig"], CONCEPTS);
    await seeded.setActive(many.id);

    // Start-up is held in the middle of reading the long board; meanwhile the active profile changes and a refresh is asked for.
    const { backend, control } = controllableBackend(inner);
    const held = control.hold(`profile/${many.id}/data/concept.hilfe`);
    const app = createApp(root, { openBackend: async () => backend, catalogue: CONCEPTS, setTimer });
    await held;
    await inner.write({ set: { "app/active-profile": one.id } });
    const refreshed = app.refreshBoard();
    await tick();
    assert.equal(mounts.length, 1, "only the waiting line so far");
    control.release();
    await refreshed;
    // Start-up mounted what it had read, then the refresh mounted the current state. Not the other way round.
    assert.deepEqual(mounts.map((mount) => mount.labels), [[], ["Hilfe", "Trinken", "Pause", "Mehr", "Fertig"], ["Fertig"]]);
    assert.deepEqual(now().labels, ["Fertig"]);
  });

  // The marker of a late start-up answer does not outlive a refresh.
  await withPage(async ({ root, setTimer, fireTimer, now }) => {
    let open;
    const app = createApp(root, { openBackend: () => new Promise((resolve) => { open = resolve; }), catalogue: CONCEPTS, setTimer });
    await tick();
    fireTimer();
    assert.equal(root.dataset.startup, "demo-timeout");
    now().buttons[0].click();
    open(new MemoryBackend());
    await app.started;
    assert.equal(root.dataset.startupLate, "same-board");
    await app.refreshBoard();
    assert.equal(root.dataset.startup, "demo-empty");
    assert.equal("startupLate" in root.dataset, false);
    assert.equal(now().output.textContent, "Wähle einen Begriff.");
  });
});

test("app: a read that fails during refreshBoard is reported and shows the examples with the storage sentence; the next refresh recovers", async () => {
  await withPage(async ({ root, setTimer, now }) => {
    const inner = new MemoryBackend();
    const { backend, control } = controllableBackend(inner);
    const reported = [];
    const app = createApp(root, { openBackend: async () => backend, catalogue: CONCEPTS, setTimer, report: (error) => reported.push(error.message) });
    await app.started;
    const store = await app.store();
    const mia = await store.create("Mia", []);
    await setBoardConcepts(store, mia.id, ["mehr"], CONCEPTS);
    await store.setActive(mia.id);
    await app.refreshBoard();
    assert.deepEqual(now().labels, ["Mehr"]);

    control.failWith = new Error("read failed");
    await app.refreshBoard();
    assert.deepEqual(reported, ["read failed"]);
    assert.equal(root.dataset.startup, "demo-unavailable");
    assert.equal(now().fallback, "storage-unavailable");
    assert.deepEqual(now().labels, EXAMPLE_LABELS);
    assert.equal(now().examplesLook, true);

    control.failWith = null;
    await app.refreshBoard();
    assert.deepEqual(now().labels, ["Mehr"]);
    assert.equal(root.dataset.startup, "profile");
    assert.equal(now().fallback, null);
    assert.equal(reported.length, 1);
  });
});

test("app: a refresh that storage does not answer in time takes the previous board off the screen, does not block later refreshes, and its late answer is dropped", async () => {
  await withPage(async ({ root, setTimer, fireTimer, timers, now, mounts }) => {
    const inner = new MemoryBackend();
    const { backend, control } = controllableBackend(inner);
    const app = createApp(root, { openBackend: async () => backend, catalogue: CONCEPTS, setTimer, waitMs: 700 });
    await app.started;
    const store = await app.store();
    const first = await store.create("A", []);
    await putCustomConcept(store, first.id, "ball", BALL, CONCEPTS);
    await setBoardConcepts(store, first.id, ["ball"], CONCEPTS);
    const second = await store.create("B", []);
    await setBoardConcepts(store, second.id, ["fertig"], CONCEPTS);
    await store.setActive(first.id);
    await app.refreshBoard();
    assert.deepEqual(now().labels, ["Ball"]);
    const before = mounts.length;

    // The next read hangs. The refresh is bounded like start-up.
    const held = control.hold("app/active-profile");
    let done = false;
    const hanging = app.refreshBoard().then(() => { done = true; });
    await held;
    assert.equal(done, false);
    assert.deepEqual(now().labels, ["Ball"]);
    assert.equal(timers.at(-1).milliseconds, 700);
    fireTimer();
    await hanging;
    // The previous profile's tiles are gone; the examples say why.
    assert.deepEqual(now().labels, EXAMPLE_LABELS);
    assert.equal(now().fallback, "refresh-timeout");
    assert.equal(root.dataset.startup, "refresh-timeout");
    assert.match(now().notices[0], /^Die Tafel konnte gerade nicht neu geladen werden\. Deshalb werden Beispiele gezeigt\./);
    assert.doesNotMatch(now().text, /Ball/);
    assert.equal(mounts.length, before + 1);

    // A later refresh is not blocked. While storage still hangs it waits for it; meanwhile the active profile changes.
    await inner.write({ set: { "app/active-profile": second.id } });
    const later = app.refreshBoard();
    await tick();
    assert.equal(mounts.length, before + 1);
    control.release(); // storage answers again: first the old read (profile A), then the new one (profile B)
    await later;
    // The late answer of the timed-out refresh was dropped: A's board was never mounted again.
    assert.deepEqual(mounts.slice(before).map((mount) => mount.labels), [EXAMPLE_LABELS, ["Fertig"]]);
    assert.deepEqual(now().labels, ["Fertig"]);
    assert.equal(root.dataset.startup, "profile");
    // A timer that fires after its refresh was answered changes nothing.
    for (const timer of timers) timer.callback();
    assert.deepEqual(now().labels, ["Fertig"]);
    assert.equal(mounts.length, before + 2);
  });
});

// --- Examples look different ---

test("render: every board of examples carries the examples class and a visible badge; a profile's own board carries neither", async () => {
  const empty = { kind: "profile", profileId: "0".repeat(32), displayName: "Mia", entries: [], problems: [] };
  const exampleViews = [
    { kind: "demo", storage: "empty" }, { kind: "demo", storage: "unavailable" }, { kind: "damaged", count: 1 }, { kind: "no-active", profiles: [] },
    empty, { ...empty, problems: [{ kind: "unknown-concept", conceptId: "einhorn" }] },
    { kind: "fallback", cause: "timeout" }, { kind: "fallback", cause: "timeout-kept" }, { kind: "fallback", cause: "render-failed" }, { kind: "fallback", cause: "refresh-timeout" },
  ];
  for (const view of exampleViews) {
    withMountedBoard(view, ({ board, examplesLook, badge, labels, buttons }) => {
      const name = JSON.stringify(view);
      assert.equal(examplesLook, true, name);
      assert.equal(board.className, "concept-board concept-board-examples");
      assert.equal(badge, "Beispiele", name);
      // The badge is on the board itself, before the tiles, and is not a tile.
      assert.equal(board.children[0].className, "examples-badge");
      assert.equal(board.children[0].tagName, "span");
      assert.deepEqual(labels, EXAMPLE_LABELS);
      assert.equal(buttons.length, EXAMPLE_LABELS.length);
      assert.match(board["aria-label"], /Beispiele/);
    });
  }
  // An own board that uses the very same catalogue concepts as the examples still looks like an own board.
  const { store } = await openStore();
  const mia = await store.create("Mia", []);
  await setBoardConcepts(store, mia.id, CONCEPTS.map((concept) => concept.id), CONCEPTS);
  await store.setActive(mia.id);
  for (const view of [MIA_VIEW, await resolveStartupView(store, CONCEPTS)]) {
    withMountedBoard(view, ({ board, examplesLook, badge, text }) => {
      assert.equal(examplesLook, false);
      assert.equal(board.className, "concept-board");
      assert.equal(badge, null);
      assert.equal(board["aria-label"], "Kommunikationsbegriffe");
      assert.doesNotMatch(text, /Beispiel/);
    });
  }
});

test("the stylesheet gives the examples board and its badge a look of their own", async () => {
  const css = await readFile(new URL("../dist/styles.css", import.meta.url), "utf8");
  const rule = (selector) => css.split("\n").find((line) => line.startsWith(`${selector} {`)) ?? "";
  assert.match(rule(".concept-board-examples"), /border:[^;]*dashed/);
  assert.match(rule(".concept-board-examples"), /background:/);
  assert.match(rule(".examples-badge"), /background:/);
  assert.match(rule(".examples-badge"), /grid-column: 1 \/ -1/);
});

// --- Copies are marked ---

test("stored entries: exactly three key sets are accepted; custom and copied never together, and only as true", async () => {
  const { store } = await openStore();
  const mia = await store.create("Mia", ["hilfe", "mehr", "pause", "trinken", "fertig"]);
  const data = store.data(mia.id);
  const wording = { version: 1, labelDe: "Wort", speechDe: "Ein Satz." };
  await data.set("concept.hilfe", { ...wording, copied: true });
  await data.set("concept.mehr", { ...wording });
  await data.set("concept.pause", { ...wording, copied: true, custom: true });
  await data.set("concept.trinken", { ...wording, copied: false });
  await data.set("concept.fertig", { ...wording, copied: "yes" });
  const board = await resolveBoard(store, mia.id, CONCEPTS);
  assert.deepEqual(board.entries.map((entry) => entry.labelDe), ["Wort", "Wort", "Pause", "Trinken", "Fertig"]);
  assert.deepEqual(board.problems, ["pause", "trinken", "fertig"].map((conceptId) => ({ kind: "damaged-wording", conceptId, damage: "unreadable" })));
});

test("only copy-on-choose and clearWording write the copied marker; a caregiver's wording and a custom concept never carry it", async () => {
  const { store } = await openStore();
  const mia = await store.create("Mia", []);
  const data = store.data(mia.id);
  await setBoardConcepts(store, mia.id, ["hilfe", "mehr"], CONCEPTS);
  assert.deepEqual(await data.get("concept.hilfe"), { version: 1, labelDe: "Hilfe", speechDe: "Ich brauche Hilfe.", copied: true });
  await setWording(store, mia.id, "hilfe", { labelDe: "Hilf mir", speechDe: "Bitte hilf mir." }, CONCEPTS);
  assert.deepEqual(await data.get("concept.hilfe"), { version: 1, labelDe: "Hilf mir", speechDe: "Bitte hilf mir." });
  await clearWording(store, mia.id, "hilfe", CONCEPTS);
  assert.deepEqual(await data.get("concept.hilfe"), { version: 1, labelDe: "Hilfe", speechDe: "Ich brauche Hilfe.", copied: true });
  await putCustomConcept(store, mia.id, "ball", BALL, CONCEPTS);
  await setWording(store, mia.id, "ball", { labelDe: "Bälle", speechDe: "Viele Bälle." }, CONCEPTS);
  await setBoardConcepts(store, mia.id, ["hilfe", "mehr", "ball"], CONCEPTS);
  assert.deepEqual(await data.get("concept.ball"), { version: 1, labelDe: "Bälle", speechDe: "Viele Bälle.", custom: true });
});

test("choosing a concept again refreshes a copy from the catalogue of that moment, but never a caregiver's wording and never a concept that stayed on the board", async () => {
  const { backend, store } = await openStore();
  const mia = await store.create("Mia", []);
  const data = store.data(mia.id);
  await setBoardConcepts(store, mia.id, ["hilfe", "mehr", "pause"], CONCEPTS);
  await setWording(store, mia.id, "pause", { labelDe: "Ruhe", speechDe: "Ich will Ruhe." }, CONCEPTS);
  const later = withCatalogue({
    hilfe: { speechDe: "Kannst du mir helfen?" }, mehr: { speechDe: "Noch mehr, bitte." }, pause: { speechDe: "Pause, bitte." },
  });

  // "mehr" and "pause" are taken off the board; "hilfe" stays.
  await setBoardConcepts(store, mia.id, ["hilfe"], later);
  assert.deepEqual(await data.get("concept.mehr"), { version: 1, labelDe: "Mehr", speechDe: "Ich möchte mehr.", copied: true }, "taking off does not touch the entry");

  // Chosen again: the copy is refreshed, the caregiver's wording is kept, the concept that stayed keeps its sentence.
  await setBoardConcepts(store, mia.id, ["pause", "hilfe", "mehr"], later);
  assert.deepEqual(await data.get("concept.mehr"), { version: 1, labelDe: "Mehr", speechDe: "Noch mehr, bitte.", copied: true });
  assert.deepEqual(await data.get("concept.pause"), { version: 1, labelDe: "Ruhe", speechDe: "Ich will Ruhe." });
  assert.deepEqual(await data.get("concept.hilfe"), { version: 1, labelDe: "Hilfe", speechDe: "Ich brauche Hilfe.", copied: true });
  assert.deepEqual((await resolveBoard(store, mia.id, later)).entries.map((entry) => entry.speechDe), ["Ich will Ruhe.", "Ich brauche Hilfe.", "Noch mehr, bitte."]);

  // Reordering with an unchanged set is one write, of the concept ids only: a second write would fail here.
  const before = backend.snapshot();
  backend.failWrite(2);
  await setBoardConcepts(store, mia.id, ["mehr", "hilfe", "pause"], later);
  const after = backend.snapshot();
  assert.deepEqual(after[`profile/${mia.id}/meta`].conceptIds, ["mehr", "hilfe", "pause"]);
  delete before[`profile/${mia.id}/meta`];
  delete after[`profile/${mia.id}/meta`];
  assert.deepEqual(after, before);

  // A copy left behind by a call that failed before it set the board is refreshed when the concept is chosen later.
  // Armed anew: the copy is write 1 and is stored, the concept ids are write 2 and fail.
  backend.failWrite(2);
  await assert.rejects(setBoardConcepts(store, mia.id, ["mehr", "hilfe", "pause", "fertig"], CONCEPTS), InjectedWriteError);
  assert.deepEqual(await data.get("concept.fertig"), { version: 1, labelDe: "Fertig", speechDe: "Ich bin fertig.", copied: true });
  assert.deepEqual((await store.get(mia.id)).conceptIds, ["mehr", "hilfe", "pause"]);
  await setBoardConcepts(store, mia.id, ["mehr", "hilfe", "pause", "fertig"], withCatalogue({ fertig: { speechDe: "Fertig!" } }));
  assert.equal((await resolveBoard(store, mia.id, CONCEPTS)).entries[3].speechDe, "Fertig!");
});

test("choosing replaces an unreadable entry under a catalogue id with a fresh copy", async () => {
  const { store } = await openStore();
  const mia = await store.create("Mia", ["hilfe", "mehr"]);
  const data = store.data(mia.id);
  await data.set("concept.hilfe", { version: 1, labelDe: "", speechDe: "Leer." });
  await data.set("concept.pause", { version: 7, labelDe: "Später", speechDe: "Von später." });
  assert.deepEqual((await resolveBoard(store, mia.id, CONCEPTS)).problems, [{ kind: "damaged-wording", conceptId: "hilfe", damage: "unreadable" }]);
  await setBoardConcepts(store, mia.id, ["hilfe", "mehr", "pause"], CONCEPTS);
  assert.deepEqual(await data.get("concept.hilfe"), { version: 1, labelDe: "Hilfe", speechDe: "Ich brauche Hilfe.", copied: true });
  assert.deepEqual(await data.get("concept.pause"), { version: 1, labelDe: "Pause", speechDe: "Ich brauche eine Pause.", copied: true });
  const board = await resolveBoard(store, mia.id, CONCEPTS);
  assert.deepEqual(board.problems, []);
  assert.deepEqual(board.entries.map((entry) => entry.labelDe), ["Hilfe", "Mehr", "Pause"]);
});
