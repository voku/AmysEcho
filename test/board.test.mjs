import assert from "node:assert/strict";
import test from "node:test";
import { createBoardHost, mountBoard, mountLoading } from "../dist/board.js";
import { CONCEPTS } from "../dist/concepts.js";
import {
  BoardDataError, MAX_LABEL_LENGTH, MAX_SPEECH_LENGTH, clearWording, isBoardConceptId, listCustomConcepts, normalizeWording,
  putCustomConcept, removeCustomConcept, resolveBoard, setBoardConcepts, setWording,
} from "../dist/board-data.js";
import { InjectedWriteError, MemoryBackend } from "../dist/profiles/memory-backend.js";
import { ProfileStore, UnknownProfileError } from "../dist/profiles/store.js";
import { STARTUP_WAIT_MS, loadStartupView, resolveStartupView, runStartup } from "../dist/startup.js";

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
    buttons: board === null ? [] : board.children,
    labels: board === null ? [] : board.children.map((button) => button.children.at(-1).textContent),
    notices: byClass("board-notice").map((notice) => notice.textContent),
    owner: byClass("board-owner")[0]?.textContent ?? null,
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

/**
 * A fake page for `runStartup`: the real board host on a fake root, with a
 * timer the test fires by hand. `mounts` holds what was shown, in order.
 */
async function withStartup(callback) {
  const fakes = installFakes();
  try {
    const root = fakeElement("main");
    const mounts = [];
    root.replaceChildren = (...nodes) => { root.children = nodes; mounts.push(parts(root)); };
    const timers = [];
    const host = {
      ...createBoardHost(root),
      setTimer(callback, milliseconds) {
        const timer = { callback, milliseconds, cancelled: false };
        timers.push(timer);
        return () => { timer.cancelled = true; };
      },
    };
    let answer;
    let fail;
    const view = new Promise((resolve, reject) => { answer = resolve; fail = reject; });
    await callback({
      root, host, mounts, timers, view, answer, fail, speech: fakes.speech,
      /** What a real timer would do: run the callback unless it was cancelled. */
      fireTimer() { for (const timer of timers) if (!timer.cancelled) timer.callback(); },
      now: () => parts(root),
    });
  } finally {
    fakes.restore();
  }
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
    withMountedBoard(await resolveStartupView(store, CONCEPTS), ({ labels, owner }) => {
      assert.deepEqual(labels, expected);
      assert.equal(owner, `Profil: ${profile.displayName}`);
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
  await clearWording(store, profile.id, "hilfe");
  await clearWording(store, profile.id, "hilfe"); // clearing nothing is fine
  board = await resolveBoard(store, profile.id, CONCEPTS);
  assert.equal(board.entries[0].labelDe, "Hilfe");
  assert.deepEqual(await store.data(profile.id).names(), []);
});

test("an id that is neither catalogue nor custom is skipped and reported, never shown as another concept", async () => {
  const { store } = await openStore();
  // Ids the store accepts but the board cannot resolve, one of them not even addressable as board data.
  const profile = await store.create("Mia", ["hilfe", "einhorn", "a.b_c", "x".repeat(64), "mehr"]);
  // Wording without `custom` for an id the catalogue does not have is not a concept either.
  await store.data(profile.id).set("concept.einhorn", { version: 1, labelDe: "Einhorn", speechDe: "Ein Einhorn." });
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
  await clearWording(store, profile.id, "hilfe");
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
  assert.deepEqual(await store.data(profile.id).names(), []);
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
  await rejectsWith(clearWording(store, profile.id, "ball"), "custom-concept");
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
  assert.deepEqual(await store.data(profile.id).names(), ["concept.auto", "settings"]);
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
  assert.deepEqual(await store.data(profile.id).names(), []);
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
    () => clearWording(store, profile.id, "hilfe"),
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
    await rejectsWith(clearWording(store, profile.id, bad), "invalid-concept-id");
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

test("startup: storage that cannot be opened or read yields the demo board marked unavailable", async () => {
  const reported = [];
  const unavailable = { kind: "demo", storage: "unavailable" };
  assert.deepEqual(await loadStartupView(() => Promise.reject(new Error("no storage")), CONCEPTS, (error) => reported.push(error.message)), unavailable);
  assert.deepEqual(await loadStartupView(() => { throw new Error("thrown at once"); }, CONCEPTS, (error) => reported.push(error.message)), unavailable);
  assert.deepEqual(reported, ["no storage", "thrown at once"]);

  // An unknown storage layout: the store refuses to open.
  const foreign = new MemoryBackend();
  await foreign.write({ set: { "app/schema": 99 } });
  assert.deepEqual(await loadStartupView(async () => foreign, CONCEPTS), unavailable);
  assert.deepEqual(foreign.snapshot(), { "app/schema": 99 });

  // A backend that opens and then fails on reads.
  const failing = { get: async () => 1, keys: () => Promise.reject(new Error("read failed")), write: async () => undefined };
  assert.deepEqual(await loadStartupView(async () => failing, CONCEPTS), unavailable);

  // A reporter that throws does not turn into a rejection.
  assert.deepEqual(await loadStartupView(() => Promise.reject(new Error("x")), CONCEPTS, () => { throw new Error("reporter broke"); }), unavailable);
});

test("startup: working storage is opened and resolved through loadStartupView", async () => {
  const { backend, store } = await openStore();
  assert.deepEqual(await loadStartupView(async () => backend, CONCEPTS), { kind: "demo", storage: "empty" });
  const mia = await store.create("Mia", ["hilfe"]);
  await store.setActive(mia.id);
  const view = await loadStartupView(async () => backend, CONCEPTS, (error) => assert.fail(String(error)));
  assert.equal(view.kind, "profile");
  assert.equal(view.displayName, "Mia");
});

// --- Rendering ---

test("render: the demo view shows the example concepts with the not-approved notice", () => {
  withMountedBoard({ kind: "demo", storage: "empty" }, ({ labels, notices, owner, buttons, output, spoken }) => {
    assert.deepEqual(labels, CONCEPTS.map((concept) => concept.labelDe));
    assert.equal(notices.length, 1);
    assert.match(notices[0], /Beispielen.*noch nicht freigegeben/);
    assert.equal(owner, null);
    assert.equal(buttons[0].children[0].tagName, "img");
    assert.equal(buttons[0].children[0].src, "./icons/hilfe.svg");
    buttons[2].click();
    assert.equal(output.textContent, "Ich brauche eine Pause.");
    assert.deepEqual(spoken, ["Ich brauche eine Pause."]);
  });
});

test("render: unavailable storage keeps a working demo board and says so calmly", () => {
  withMountedBoard({ kind: "demo", storage: "unavailable" }, ({ labels, notices, buttons, output }) => {
    assert.equal(labels.length, CONCEPTS.length);
    assert.equal(notices.length, 2);
    assert.match(notices[0], /noch nicht freigegeben/);
    assert.match(notices[1], /Speicher.*nicht erreichbar/);
    buttons[0].click();
    assert.equal(output.textContent, "Ich brauche Hilfe.");
  });
});

test("render: a profile board shows the display name, and a custom concept is a text-only button that speaks its sentence", async () => {
  const { store } = await openStore();
  const mia = await store.create("Mia", []);
  await putCustomConcept(store, mia.id, "ball", BALL, CONCEPTS);
  await setBoardConcepts(store, mia.id, ["trinken", "ball"], CONCEPTS);
  await store.setActive(mia.id);
  withMountedBoard(await resolveStartupView(store, CONCEPTS), ({ board, buttons, labels, notices, owner, output, speechStatus, retry, spoken }) => {
    assert.equal(owner, "Profil: Mia");
    assert.deepEqual(notices, []);
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

test("render: a profile without concepts says so and shows no board and no example concepts", () => {
  withMountedBoard({ kind: "profile", profileId: "0".repeat(32), displayName: "Mia", entries: [], problems: [] }, ({ board, notices, owner, output, retry, text }) => {
    assert.equal(owner, "Profil: Mia");
    assert.deepEqual(notices, ["Für dieses Profil sind noch keine Begriffe ausgewählt."]);
    assert.equal(board, null);
    assert.equal(output, null);
    assert.equal(retry, null);
    assert.doesNotMatch(text, /Hilfe|Testoberfläche/);
  });
});

test("render: damaged and no-active states show a calm message and neither example concepts nor instructions to delete", () => {
  const states = [
    [{ kind: "damaged", count: 1 }, /^Ein gespeichertes Profil kann gerade nicht gelesen werden\./],
    [{ kind: "damaged", count: 3 }, /^3 gespeicherte Profile können gerade nicht gelesen werden\./],
    [{ kind: "no-active", profiles: [{ id: "0".repeat(32), displayName: "Mia" }] }, /^Es ist noch kein Profil ausgewählt\./],
  ];
  for (const [view, expected] of states) {
    withMountedBoard(view, ({ root, board, notices, text }) => {
      assert.equal(root.children[0].tagName, "h1");
      assert.equal(notices.length, 1);
      assert.match(notices[0], expected);
      assert.equal(board, null);
      assert.doesNotMatch(text, /Hilfe|Testoberfläche|Beispiel/);
      assert.doesNotMatch(text, /lösch|entfern|IndexedDB|Datenbank|Fehlercode|error/i);
    });
  }
});

test("render: mounting again replaces the earlier board completely", () => {
  withMountedBoard({ kind: "demo", storage: "empty" }, ({ root }) => {
    assert.equal(root.children.length, 6);
    mountBoard(root, { kind: "damaged", count: 1 });
    assert.deepEqual(root.children.map((child) => child.tagName), ["h1", "p"]);
  });
});

test("render: a profile board on which no concept could be loaded says that, not that none was chosen", async () => {
  const { store } = await openStore();
  const mia = await store.create("Mia", ["einhorn", "drache"]);
  await store.setActive(mia.id);
  withMountedBoard(await resolveStartupView(store, CONCEPTS), ({ board, notices, owner, text }) => {
    assert.equal(owner, "Profil: Mia");
    assert.deepEqual(notices, ["Die Begriffe dieser Tafel konnten nicht geladen werden. Bitte gib einer Bezugsperson Bescheid."]);
    assert.equal(board, null);
    assert.doesNotMatch(text, /noch keine Begriffe ausgewählt|Nicht alle Begriffe/);
  });
});

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

test("start: storage answers in time: a waiting line without buttons, then exactly one board, never the examples", async () => {
  await withStartup(async ({ root, host, mounts, timers, view, answer, fireTimer, now }) => {
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
    assert.equal(mounts.length, 2);
    assert.deepEqual(mounts.map((mount) => mount.labels), [[], ["Ball"]]);
  });
});

test("start: every resolved view is mounted once and named in data-startup", async () => {
  for (const [resolved, state] of [
    [{ kind: "demo", storage: "empty" }, "demo-empty"],
    [{ kind: "demo", storage: "unavailable" }, "demo-unavailable"],
    [{ kind: "damaged", count: 1 }, "damaged"],
    [{ kind: "no-active", profiles: [] }, "no-active"],
  ]) {
    await withStartup(async ({ root, host, mounts, view, answer }) => {
      const done = runStartup(view, host);
      answer(resolved);
      await done;
      assert.equal(root.dataset.startup, state);
      assert.equal(mounts.length, 2);
    });
  }
});

test("start: storage is slow: after the bound the examples are shown with the storage notice and work", async () => {
  await withStartup(async ({ root, host, mounts, fireTimer, view, now }) => {
    void runStartup(view, host);
    assert.equal(now().board, null);
    fireTimer();
    assert.equal(root.dataset.startup, "demo-timeout");
    assert.deepEqual(now().labels, EXAMPLE_LABELS);
    assert.match(now().notices[0], /noch nicht freigegeben/);
    assert.match(now().notices[1], /Speicher.*nicht erreichbar/);
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

test("start: a late answer replaces the fallback board when nothing was selected on it", async () => {
  await withStartup(async ({ root, host, mounts, fireTimer, view, answer, now }) => {
    const done = runStartup(view, host);
    fireTimer();
    assert.deepEqual(now().labels, EXAMPLE_LABELS);
    answer(MIA_VIEW);
    await done;
    assert.deepEqual(now().labels, ["Ball"]);
    assert.equal(now().owner, "Profil: Mia");
    assert.equal(root.dataset.startup, "profile");
    assert.equal(root.dataset.startupLate, "replaced");
    assert.equal(mounts.length, 3);
  });
});

test("start: a late answer never replaces a board the child has already used", async () => {
  await withStartup(async ({ root, host, mounts, fireTimer, view, answer, now, speech }) => {
    const done = runStartup(view, host);
    fireTimer();
    now().buttons[0].click();
    const cancelled = speech.cancelled;
    answer(MIA_VIEW);
    await done;
    assert.deepEqual(now().labels, EXAMPLE_LABELS);
    assert.equal(now().output.textContent, "Ich brauche Hilfe.");
    assert.equal(now().owner, null);
    assert.equal(root.dataset.startup, "demo-timeout");
    assert.equal(root.dataset.startupLate, "kept");
    assert.equal(mounts.length, 2);
    // The sentence that is being spoken is not cut off either.
    assert.equal(speech.cancelled, cancelled);
  });
});

test("start: a failing view promise or a view that cannot be rendered ends on the examples with the notice", async () => {
  await withStartup(async ({ root, host, view, fail, now }) => {
    const done = runStartup(view, host);
    fail(new Error("storage broke"));
    await done;
    assert.equal(root.dataset.startup, "demo-unavailable");
    assert.deepEqual(now().labels, EXAMPLE_LABELS);
  });
  await withStartup(async ({ root, host, view, answer, now }) => {
    const done = runStartup(view, host);
    answer({ kind: "profile", profileId: "0".repeat(32), displayName: "Mia", problems: [], entries: [null] });
    await done;
    assert.equal(root.dataset.startup, "failed");
    assert.deepEqual(now().labels, EXAMPLE_LABELS);
    assert.equal(now().notices.length, 2);
  });
});

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
