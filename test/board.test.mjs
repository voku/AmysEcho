import assert from "node:assert/strict";
import test from "node:test";
import { mountBoard } from "../dist/board.js";
import { CONCEPTS } from "../dist/concepts.js";
import {
  BoardDataError, MAX_LABEL_LENGTH, MAX_SPEECH_LENGTH, clearWording, isBoardConceptId, listCustomConcepts, normalizeWording,
  putCustomConcept, removeCustomConcept, resolveBoard, setBoardConcepts, setWording,
} from "../dist/board-data.js";
import { InjectedWriteError, MemoryBackend } from "../dist/profiles/memory-backend.js";
import { ProfileStore, UnknownProfileError } from "../dist/profiles/store.js";
import { loadStartupView, resolveStartupView } from "../dist/startup.js";

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

/** Mounts the view into a fake root, with a fake local German voice, and hands the parts to `callback`. */
function withMountedBoard(view, callback) {
  const previous = { document: globalThis.document, window: globalThis.window, utterance: globalThis.SpeechSynthesisUtterance };
  const spoken = [];
  globalThis.document = { createElement: fakeElement };
  globalThis.window = {
    speechSynthesis: { cancel() {}, getVoices: () => [{ lang: "de-DE", localService: true }], speak(utterance) { spoken.push(utterance.text); } },
  };
  globalThis.SpeechSynthesisUtterance = FakeUtterance;
  try {
    const root = fakeElement("main");
    mountBoard(root, view);
    const byClass = (name) => root.children.filter((child) => child.className.split(" ").includes(name));
    const board = byClass("concept-board")[0] ?? null;
    callback({
      root, spoken, board,
      buttons: board === null ? [] : board.children,
      labels: board === null ? [] : board.children.map((button) => button.children.at(-1).textContent),
      notices: byClass("board-notice").map((notice) => notice.textContent),
      owner: byClass("board-owner")[0]?.textContent ?? null,
      output: byClass("message")[0] ?? null,
      speechStatus: byClass("speech-status")[0] ?? null,
      retry: byClass("retry")[0] ?? null,
      text: root.children.map((child) => child.textContent).join("\n"),
    });
  } finally {
    for (const [name, key] of [["document", "document"], ["window", "window"], ["SpeechSynthesisUtterance", "utterance"]]) {
      if (previous[key] === undefined) delete globalThis[name];
      else globalThis[name] = previous[key];
    }
  }
}

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
