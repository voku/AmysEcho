import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createApp } from "../dist/app.js";
import { CAMERA_FACING_KEY, CAPTURE_BRIDGE_KEY, PictureRefusal, TEACH_COUNTDOWN_S, TEACH_MAX_RECORDING_MS, BOARD_COMFORT_MAX, CLOSE_WAIT_MS, DELETE_HOLD_MS, GUARD_MS, HOLD_SLOP_PX, SHIELD_GRACE_MS, HOLD_DURATION_MS, IDLE_CLOSE_MS, STORE_WAIT_MS, createHold, mountCaregiver } from "../dist/caregiver.js";
import { resolveBoard, setBoardConcepts, setWording } from "../dist/board-data.js";
import { CONCEPTS } from "../dist/concepts.js";
import { MemoryBackend } from "../dist/profiles/memory-backend.js";
import {
  CAMERA_FACING_KEY as CAPTURE_FACING_KEY, CAPTURE_BRIDGE_KEY as CAPTURE_MODULE_KEY, CAPTURE_TEXT, PREVIEW_COLOURS, captureBridge, createCapturePreview, loadCameraFacing, nextShoulders, startCapture,
} from "../dist/capture/capture.js";
import { HAND_POINTS } from "../dist/recognition/features.js";
import { DEMO_MAX_MS, DemoRecordingRefusal } from "../dist/demo-clips.js";
import { DEMO_STOP_WAIT_MS, MAX_BACKUP_FILE_BYTES } from "../dist/caregiver.js";
import { exportProfile, importProfile } from "../dist/profiles/backup.js";
import { listExamples } from "../dist/recognition/examples.js";
import { ProfileStore } from "../dist/profiles/store.js";

const chr = (...codePoints) => String.fromCodePoint(...codePoints);
const NOT_EDITABLE = "Dieser Begriff kann in dieser Version nicht bearbeitet werden.";
const LOCKED_PLACE = "Dieser Begriff kann hier nicht verschoben oder entfernt werden.";
const NEWER_ENTRY = "Diese Taste wurde mit einer neueren Version gespeichert. Bitte die App aktualisieren.";

// --- A minimal document, as in board.test.mjs; no DOM library. All fixtures are synthetic. ---

/** Puts a fake document and speech engine in place; `focused.current` is the element that was focused last. */
function installFakes(rect) {
  const previous = { document: globalThis.document, window: globalThis.window, SpeechSynthesisUtterance: globalThis.SpeechSynthesisUtterance, Image: globalThis.Image };
  const previousWarn = console.warn;
  const speech = { cancelled: 0, spoken: [] };
  const focused = { current: null };
  const fakeElement = (tagName) => {
    const created = {
      tagName, textContent: "", className: "", children: [], dataset: {}, handlers: {},
      hidden: false, disabled: false,
      setAttribute(name, value) { this[name] = value; },
      /** A third argument of `true` (or `{ capture: true }`) registers for the capture phase, as in a browser. */
      addEventListener(name, handler, options) {
        if (options === true || options?.capture === true) this.captureHandlers[name] = handler;
        else this.handlers[name] = handler;
      },
      append(...nodes) {
        for (const node of nodes) node.parent = this;
        this.children.push(...nodes);
      },
      replaceChildren(...nodes) {
        // What is taken out is detached: events on it no longer pass through its former ancestors.
        for (const node of this.children) node.parent = null;
        for (const node of nodes) node.parent = this;
        this.children = nodes;
      },
      focus() { focused.current = this; },
      /**
       * Calls the handlers as a browser would for the capture and target phases: first the capture
       * listeners of the ancestors, outermost first, then this element's own. A listener that stops
       * propagation ends it there. Nothing bubbles. A disabled control gets no events.
       */
      dispatch(name, event = {}) {
        if (this.disabled) return;
        let stopped = false;
        const full = { preventDefault() {}, target: this, ...event, stopPropagation() { stopped = true; } };
        const path = [];
        for (let node = this.parent; node; node = node.parent) path.unshift(node);
        for (const node of [...path, this]) {
          node.captureHandlers[name]?.(full);
          if (stopped) return;
        }
        this.handlers[name]?.(full);
      },
      click(event = {}) { this.dispatch("click", event); },
      // Geometry only where a test supplies it; without it the area must cope (as with any DOM that has none).
      ...(rect === undefined ? {} : { scrollTop: 0, getBoundingClientRect() { return rect(this); } }),
    };
    // Not enumerable: `stringsIn` walks every own property, and a parent would lead it in circles.
    Object.defineProperty(created, "parent", { value: null, writable: true, enumerable: false });
    Object.defineProperty(created, "captureHandlers", { value: {}, enumerable: false });
    return created;
  };
  // The document takes listeners like an element; `dispatch` calls them as for an event that nothing inside the page handled.
  globalThis.document = {
    createElement: fakeElement, handlers: {},
    addEventListener(name, handler) { this.handlers[name] = handler; },
    dispatch(name, event = {}) { this.handlers[name]?.({ preventDefault() {}, ...event }); },
  };
  globalThis.window = {
    speechSynthesis: {
      cancel() { speech.cancelled += 1; },
      getVoices: () => [{ lang: "de-DE", localService: true }],
      speak(utterance) { speech.spoken.push(utterance.text); },
    },
  };
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  // `new Image(width, height)` as the picture view uses it: an "img" element of the fake document.
  globalThis.Image = function Image(width, height) {
    const image = fakeElement("img");
    image.width = width;
    image.height = height;
    return image;
  };
  console.warn = () => undefined;
  return {
    speech, focused, fakeElement,
    restore() {
      console.warn = previousWarn;
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete globalThis[name];
        else globalThis[name] = value;
      }
    },
  };
}

/**
 * A time source for the press shield under which every press counts: each reading is a second
 * after the one before, so nothing is ever "pressed too soon after it appeared". Tests of the
 * shield itself pass their own.
 */
function alwaysAimed() {
  let time = 0;
  return () => { time += 1000; return time; };
}

/** Timers on a clock the test moves by hand. */
function fakeClock() {
  let now = 0;
  const timers = [];
  const waiting = () => timers.filter((timer) => !timer.cancelled && !timer.fired);
  return {
    setTimer(callback, milliseconds) {
      const timer = { at: now + milliseconds, callback, cancelled: false, fired: false };
      timers.push(timer);
      return () => { timer.cancelled = true; };
    },
    advance(milliseconds) {
      const end = now + milliseconds;
      for (;;) {
        const due = waiting().filter((timer) => timer.at <= end).sort((a, b) => a.at - b.at)[0];
        if (due === undefined) break;
        now = due.at;
        due.fired = true;
        due.callback();
      }
      now = end;
    },
    waiting: () => waiting().length,
  };
}

/** The element and everything below it. */
function tree(node) {
  return [node, ...node.children.flatMap(tree)];
}
const textsIn = (node) => tree(node).map((element) => element.textContent).filter((text) => text !== "");
const buttonsIn = (node) => tree(node).filter((element) => element.tagName === "button");
const buttonNamed = (node, text) => buttonsIn(node).find((element) => element.textContent === text);
const hasClass = (element, name) => element.className.split(" ").includes(name);
const byClass = (node, name) => tree(node).find((element) => hasClass(element, name));
/** The parts of the open area that stay at the top. */
const headingOf = (region) => tree(region).find((element) => element.tagName === "h1");
const statusElement = (region) => byClass(region, "caregiver-status");
const statusOf = (region) => statusElement(region)?.textContent ?? null;
const afterCloseOf = (region) => byClass(region, "caregiver-after-close")?.textContent ?? null;
/** Every button and field of the region, in document order: "nothing that writes" is said against this. */
/** Types the profile's name into an open delete confirmation (owner decision on card NG-13), as a caregiver would. */
function typeDeleteName(region) {
  const field = tree(region).find((element) => element.id === "caregiver-delete-name");
  field.value = field.dataset.expected;
  field.dispatch("input");
}
const DELETE_NAME = (name) => `Zum Bestätigen den Namen „${name}“ eingeben`;
const controlsIn = (node) => tree(node).filter((element) => ["button", "input", "form", "select", "textarea"].includes(element.tagName));

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

/**
 * A page with the real app on `backend` (or on what `openBackend` gives) and
 * the caregiver area mounted on it. `seed` fills the store before the app starts.
 */
/** A `localStorage` stand-in: a map, with `refuse` to make it throw as a blocked storage does. */
function memoryStorage({ refuse = false } = {}) {
  const items = new Map();
  return {
    items,
    getItem(key) { if (refuse) throw new DOMException("blocked", "SecurityError"); return items.has(key) ? items.get(key) : null; },
    setItem(key, value) { if (refuse) throw new DOMException("full", "QuotaExceededError"); items.set(key, String(value)); },
  };
}

async function withArea(options, callback) {
  const fakes = installFakes(options.rect);
  try {
    const backend = options.backend ?? new MemoryBackend();
    let seeded = null;
    if (options.seed !== undefined) seeded = await options.seed(await ProfileStore.open(backend), backend);
    const boardRegion = fakes.fakeElement("section");
    const caregiverRegion = fakes.fakeElement("section");
    caregiverRegion.hidden = true;
    const entry = fakes.fakeElement("footer");
    entry.hidden = true;
    const appTimers = [];
    const app = options.app ?? createApp(boardRegion, {
      openBackend: options.openBackend ?? (async () => backend),
      catalogue: CONCEPTS,
      setTimer: (timerCallback) => { appTimers.push(timerCallback); return () => undefined; },
    });
    if (options.app !== undefined) boardRegion.dataset.startup = "profile";
    else if (options.waitForStart !== false) await app.started;
    const refreshes = { count: 0 };
    const counted = { store: () => app.store(), refreshBoard: () => { refreshes.count += 1; return app.refreshBoard(); } };
    const clock = fakeClock();
    const cameraStorage = options.cameraStorage === undefined ? memoryStorage() : options.cameraStorage;
    const page = { hide: () => undefined };
    const handle = mountCaregiver({
      app: counted, boardRegion, caregiverRegion, entry, catalogue: options.catalogue ?? CONCEPTS,
      setTimer: clock.setTimer, onPageHidden: (hidden) => { page.hide = hidden; }, now: options.now ?? alwaysAimed(),
      ...(options.capture === undefined ? {} : { capture: options.capture }),
      ...(options.date === undefined ? {} : { date: options.date }),
      // The device's camera choice (card NG-43): a storage of the test's own, never the process's.
      cameraStorage: () => cameraStorage,
      ...(options.pictureFromFile === undefined ? {} : { pictureFromFile: options.pictureFromFile }),
      ...(options.openDemoCamera === undefined ? {} : { openDemoCamera: options.openDemoCamera }),
      ...(options.clipFromBlob === undefined ? {} : { clipFromBlob: options.clipFromBlob }),
      ...(options.saveFile === undefined ? {} : { saveFile: options.saveFile }),
      // Card NG-58: the fewest PBKDF2 rounds a backup file may have, so the tests stay fast.
      backupIterations: 100_000,
    });
    const [opener, progress, hint] = entry.children;
    const area = {
      ...fakes, backend, seeded, app, boardRegion, caregiverRegion, entry, clock, handle, opener, progress, hint, page, refreshes, appTimers, cameraStorage,
      /** Presses the opening control for the full duration and waits for the area to be drawn. */
      async holdOpen() {
        opener.dispatch("pointerdown", { button: 0 });
        clock.advance(HOLD_DURATION_MS);
        opener.dispatch("pointerup");
        await handle.settled();
      },
      /**
       * Does something to a control and waits until the area has carried it out. A profile's delete
       * confirmation that has just opened gets the profile's name typed (owner decision on card NG-13),
       * so that the tests of the hold test the hold; `typeDeleteName: false` leaves the field alone.
       */
      async act(action) {
        action();
        await handle.settled();
        if (options.typeDeleteName === false) return;
        const name = tree(caregiverRegion).find((element) => element.id === "caregiver-delete-name");
        if (name !== undefined && name.value === "" && !name.autoTyped) {
          name.autoTyped = true;
          name.value = name.dataset.expected;
          name.dispatch("input");
        }
      },
      status: () => statusOf(caregiverRegion),
      afterClose: () => afterCloseOf(caregiverRegion),
      heading: () => headingOf(caregiverRegion),
      /** The one undo button, or null. Its text names the concept it brings back. */
      undo: () => buttonsIn(byClass(caregiverRegion, "caregiver-undo") ?? { children: [] }).find((element) => element.textContent.startsWith("Rückgängig: ")) ?? null,
      texts: () => textsIn(caregiverRegion),
      button: (text) => buttonNamed(caregiverRegion, text),
      /** The profile cards, top to bottom. A card that shows a confirmation or a rename field has no name of its own. */
      profiles: () => tree(caregiverRegion).filter((element) => hasClass(element, "caregiver-profile")).map((item) => ({
        item,
        name: byClass(item, "caregiver-profile-name")?.textContent ?? null,
        active: tree(item).some((child) => child.className === "caregiver-active" && child.textContent === "Aktive Tafel"),
        activate: buttonNamed(item, "Als aktive Tafel verwenden") ?? null,
        edit: buttonNamed(item, "Tafel bearbeiten") ?? null,
        rename: buttonNamed(item, "Umbenennen") ?? null,
        remove: buttonNamed(item, "Löschen") ?? null,
        confirming: hasClass(item, "caregiver-confirm"),
        texts: textsIn(item),
      })),
      profile(name) { return area.profiles().find((card) => card.name === name); },
      /** The rows of both lists, top to bottom: first "Auf der Tafel", then "Weitere Begriffe". */
      concepts: () => tree(caregiverRegion).filter((element) => element.tagName === "ol" || element.tagName === "ul")
        .filter((list) => hasClass(list, "caregiver-concepts"))
        .flatMap((list) => list.children.map((row) => {
          const text = byClass(row, "caregiver-concept-text");
          const spans = text.children.filter((child) => child.tagName === "span");
          return {
            row, name: spans[0].textContent, sentence: spans[1]?.textContent ?? null,
            picture: text.children.find((child) => child.tagName === "img")?.src ?? null,
            onBoard: list.tagName === "ol", locked: hasClass(row, "caregiver-concept-locked"),
            note: row.children.find((child) => child.tagName === "p")?.textContent ?? null,
            up: buttonNamed(row, "nach oben") ?? null, down: buttonNamed(row, "nach unten") ?? null,
            remove: buttonNamed(row, "Entfernen") ?? null, add: buttonNamed(row, "Hinzufügen") ?? null,
            reword: buttonNamed(row, "Text ändern") ?? null,
            teach: buttonNamed(row, "Gebärde beibringen") ?? null,
            gesture: byClass(text, "caregiver-concept-gesture")?.textContent ?? null,
            buttons: buttonsIn(row).map((element) => element.textContent),
          };
        })),
      concept(name) { return area.concepts().find((row) => row.name === name); },
      /** The names in "Auf der Tafel", in order. */
      onBoard: () => area.concepts().filter((row) => row.onBoard).map((row) => row.name),
      /** The names in "Weitere Begriffe", in order. */
      more: () => area.concepts().filter((row) => !row.onBoard).map((row) => row.name),
      async add(name) { await area.act(() => area.concept(name).add.click()); },
      /** Takes a concept off and lets the guard time pass, so that the next "Entfernen" counts. */
      async remove(name) {
        await area.act(() => area.concept(name).remove.click());
        clock.advance(GUARD_MS);
      },
      /** The delete confirmation while it is the body of the area, or null. */
      confirmation() {
        const view = byClass(caregiverRegion, "caregiver-confirm");
        if (view === undefined) return null;
        return {
          view, texts: textsIn(view), confirm: buttonNamed(view, "Endgültig löschen"), cancel: buttonNamed(view, "Abbrechen"),
          hint: byClass(view, "caregiver-confirm-hint"), progress: byClass(view, "caregiver-delete-progress"),
        };
      },
      /** Holds "Endgültig löschen" for the full duration and lets go. */
      async confirmDelete() {
        // A profile's delete needs its name typed (owner decision on card NG-13); the confirmation names it.
        const name = tree(caregiverRegion).find((element) => element.id === "caregiver-delete-name");
        if (name !== undefined && name.value === "") {
          name.value = name.dataset.expected;
          name.dispatch("input");
        }
        const confirm = area.button("Endgültig löschen");
        confirm.dispatch("pointerdown", { button: 0 });
        clock.advance(DELETE_HOLD_MS);
        confirm.dispatch("pointerup");
        await handle.settled();
      },
      /** Presses "Rückgängig" and lets its guard time pass, so that the next press counts. */
      async takeBack() {
        await area.act(() => area.undo().click());
        clock.advance(GUARD_MS);
      },
      nameInput: () => tree(caregiverRegion).find((element) => element.tagName === "input" && element.id === "caregiver-new-name"),
      createForm: () => byClass(caregiverRegion, "caregiver-create"),
      async create(name) {
        area.nameInput().value = name;
        await area.act(() => area.createForm().dispatch("submit"));
      },
      /** The rewording of a concept while it is the body of the area, or null. */
      rewording() {
        const view = byClass(caregiverRegion, "caregiver-takeover");
        if (view === undefined) return null;
        const find = (id) => tree(view).find((element) => element.id === id) ?? null;
        return {
          view, texts: textsIn(view), form: byClass(view, "caregiver-reword") ?? null,
          label: find("caregiver-reword-label"), speech: find("caregiver-reword-speech"),
          cancel: buttonNamed(view, "Abbrechen"), reset: buttonNamed(view, "Text der App wiederherstellen") ?? null,
          confirmReset: buttonNamed(view, "Wiederherstellen") ?? null,
        };
      },
      /** Opens the rewording of a concept, types both texts and sends the form. */
      async reword(name, label, speech) {
        await area.act(() => area.concept(name).reword.click());
        const fields = area.rewording();
        fields.label.value = label;
        fields.speech.value = speech;
        await area.act(() => fields.form.dispatch("submit"));
      },
      renameInput: () => tree(caregiverRegion).find((element) => element.tagName === "input" && element.id === "caregiver-rename-name") ?? null,
      /** Opens the rename field of a profile, types `to` and sends the form. */
      async rename(name, to) {
        await area.act(() => area.profile(name).rename.click());
        area.renameInput().value = to;
        await area.act(() => byClass(caregiverRegion, "caregiver-rename").dispatch("submit"));
      },
      /** A key pressed inside the area; `target` is the element that has the focus, as the browser reports it. */
      key(key, target = fakes.focused.current) {
        let prevented = 0;
        caregiverRegion.dispatch("keydown", { key, target, preventDefault() { prevented += 1; } });
        return prevented;
      },
      editorHeading: () => tree(caregiverRegion).find((element) => element.tagName === "h2" && element.textContent.startsWith("Tafel von ")) ?? null,
      /** The labels of the tiles the child sees. */
      tiles() {
        const board = boardRegion.children.find((child) => child.className.split(" ")[0] === "concept-board");
        return board.children.filter((child) => child.tagName === "button").map((tile) => tile.children.at(-1).textContent);
      },
      async store() { return app.store(); },
    };
    await callback(area);
  } finally {
    fakes.restore();
  }
}

/** A backend on which the test can hold back every read from a chosen moment on. */
function gatedBackend() {
  const inner = new MemoryBackend();
  const gate = { held: false, release: () => undefined, onWrite: () => undefined };
  let waiting = Promise.resolve();
  gate.hold = () => { gate.held = true; waiting = new Promise((resolve) => { gate.release = () => { gate.held = false; resolve(); }; }); };
  const read = async () => { while (gate.held) await waiting; };
  return {
    inner, gate,
    backend: {
      get: async (key) => { await read(); return inner.get(key); },
      keys: async (prefix) => { await read(); return inner.keys(prefix); },
      write: async (batch) => { const answer = await inner.write(batch); gate.onWrite(batch); return answer; },
    },
  };
}

const createMia = async (store) => {
  const mia = await store.create("Mia", []);
  await store.setActive(mia.id);
  return mia;
};

// --- The hold, as a unit ---

/** A hold on a fake clock that records what it reports. */
function recordedHold(options = {}) {
  const clock = fakeClock();
  const seen = { progress: [], ends: [] };
  const hold = createHold({
    setTimer: clock.setTimer, ...options,
    onProgress: (elapsedMs, remainingSeconds) => seen.progress.push([elapsedMs, remainingSeconds]),
    onEnd: (reason) => seen.ends.push(reason),
  });
  return { clock, seen, hold };
}

test("hold: the duration is three seconds, and only a full hold completes", () => {
  assert.equal(HOLD_DURATION_MS, 3000);
  const { clock, seen, hold } = recordedHold();
  hold.press("pointer");
  assert.equal(hold.isHolding(), true);
  clock.advance(HOLD_DURATION_MS - 1);
  assert.deepEqual(seen.ends, []);
  clock.advance(1);
  assert.deepEqual(seen.ends, ["completed"]);
  assert.equal(hold.isHolding(), false);
  assert.equal(clock.waiting(), 0, "no timer is left running");
  // Letting go afterwards is not a second ending.
  hold.release("pointer");
  hold.cancel();
  assert.deepEqual(seen.ends, ["completed"]);
});

test("hold: the countdown starts at once and counts the remaining seconds, rounded up", () => {
  const { clock, seen, hold } = recordedHold();
  hold.press("pointer");
  assert.deepEqual(seen.progress, [[0, 3]]);
  const remainingAt = (elapsed) => seen.progress.find(([at]) => at === elapsed)?.[1];
  clock.advance(2999);
  assert.equal(remainingAt(900), 3);
  assert.equal(remainingAt(1000), 2);
  assert.equal(remainingAt(1900), 2);
  assert.equal(remainingAt(2000), 1);
  assert.equal(remainingAt(2900), 1);
  // Progress only ever grows within one hold.
  assert.deepEqual(seen.progress.map(([at]) => at), [...seen.progress.map(([at]) => at)].sort((a, b) => a - b));
});

test("hold: an early release ends it as released, a cancel as cancelled, and neither completes later", () => {
  const { clock, seen, hold } = recordedHold();
  hold.press("pointer");
  clock.advance(2900);
  hold.release("pointer");
  clock.advance(5000);
  assert.deepEqual(seen.ends, ["released"]);

  hold.press("pointer");
  clock.advance(2900);
  hold.cancel();
  clock.advance(5000);
  assert.deepEqual(seen.ends, ["released", "cancelled"]);
  assert.equal(clock.waiting(), 0);

  // Each hold starts from zero: time held earlier does not count.
  hold.press("pointer");
  clock.advance(2999);
  assert.deepEqual(seen.ends, ["released", "cancelled"]);
  clock.advance(1);
  assert.deepEqual(seen.ends, ["released", "cancelled", "completed"]);
});

test("hold: a second press while holding neither restarts nor shortens it, and a release from another source is ignored", () => {
  const { clock, seen, hold } = recordedHold();
  hold.press("key:Enter");
  clock.advance(1500);
  hold.press("key:Enter");
  hold.press("pointer");
  hold.release("pointer");
  hold.release("key: ");
  clock.advance(1499);
  assert.deepEqual(seen.ends, []);
  clock.advance(1);
  assert.deepEqual(seen.ends, ["completed"]);
});

test("hold: a timer that fires although it was cancelled does not count for a later hold", () => {
  const callbacks = [];
  const ends = [];
  const hold = createHold({ setTimer: (callback) => { callbacks.push(callback); return () => undefined; }, durationMs: 200, tickMs: 100, onProgress: () => undefined, onEnd: (reason) => ends.push(reason) });
  hold.press("pointer");
  hold.release("pointer");
  hold.press("pointer");
  // The first hold's timer, too late, and then one real tick of the second: 100 of 200 ms.
  callbacks[0]();
  callbacks[1]();
  assert.deepEqual(ends, ["released"]);
  callbacks.at(-1)();
  assert.deepEqual(ends, ["released", "completed"]);
});

// --- The opening control ---

test("opening control: holding the pointer for three seconds opens the area, with a countdown line and a progress bar", async () => {
  await withArea({}, async ({ opener, progress, hint, clock, handle, entry, caregiverRegion }) => {
    assert.equal(entry.hidden, false);
    assert.equal(opener.tagName, "button");
    assert.equal(opener.textContent, "Für Bezugspersonen");
    assert.equal(hint.role, "status");
    assert.equal(progress.hidden, true);
    assert.equal(hint.textContent, "");

    opener.dispatch("pointerdown", { button: 0 });
    assert.equal(hint.textContent, "Weiter halten … 3");
    assert.equal(progress.hidden, false);
    assert.equal(progress.max, 3000);
    assert.equal(progress.value, 0);
    clock.advance(999);
    assert.equal(hint.textContent, "Weiter halten … 3");
    clock.advance(1);
    assert.equal(hint.textContent, "Weiter halten … 2");
    assert.equal(progress.value, 1000);
    clock.advance(1000);
    assert.equal(hint.textContent, "Weiter halten … 1");
    clock.advance(999);
    assert.equal(progress.value, 2900);
    assert.equal(handle.isOpen(), false);
    assert.equal(caregiverRegion.hidden, true);
    clock.advance(1);
    assert.equal(handle.isOpen(), true);
    assert.equal(caregiverRegion.hidden, false);
    assert.equal(progress.hidden, true);
    assert.equal(hint.textContent, "");
  });
});

test("opening control: a short tap opens nothing and shows one line that says to hold", async () => {
  await withArea({}, async ({ opener, progress, hint, clock, handle, caregiverRegion }) => {
    opener.dispatch("pointerdown", { button: 0 });
    clock.advance(200);
    opener.dispatch("pointerup");
    clock.advance(10_000);
    assert.equal(handle.isOpen(), false);
    assert.deepEqual(caregiverRegion.children, []);
    assert.equal(hint.textContent, "Zum Öffnen bitte 3 Sekunden gedrückt halten.");
    assert.equal(progress.hidden, true);
    assert.equal(progress.value, 0);
    // There is no click handler: a tap, however it arrives, does not open.
    assert.equal(opener.handlers.click, undefined);
  });
});

test("opening control: releasing just before the end, leaving, a pointer cancel, losing focus and a hidden page all reset the hold", async () => {
  await withArea({}, async ({ opener, progress, hint, clock, handle, page }) => {
    const interruptions = {
      pointerup: () => opener.dispatch("pointerup"),
      pointerleave: () => opener.dispatch("pointerleave"),
      pointercancel: () => opener.dispatch("pointercancel"),
      blur: () => opener.dispatch("blur"),
      "page hidden": () => page.hide(),
    };
    for (const [name, interrupt] of Object.entries(interruptions)) {
      opener.dispatch("pointerdown", { button: 0 });
      clock.advance(2900);
      interrupt();
      clock.advance(10_000);
      assert.equal(handle.isOpen(), false, name);
      assert.equal(progress.hidden, true, name);
      assert.equal(progress.value, 0, name);
      // Only letting go is answered with the line; the rest resets without a word.
      assert.equal(hint.textContent, name === "pointerup" ? "Zum Öffnen bitte 3 Sekunden gedrückt halten." : "", name);
      assert.equal(clock.waiting(), 0, name);
    }
    // After all of that a full hold still needs the full three seconds.
    opener.dispatch("pointerdown", { button: 0 });
    clock.advance(2999);
    assert.equal(handle.isOpen(), false);
    clock.advance(1);
    assert.equal(handle.isOpen(), true);
  });
});

test("opening control: another mouse button does not start a hold", async () => {
  await withArea({}, async ({ opener, hint, clock, handle }) => {
    opener.dispatch("pointerdown", { button: 2 });
    assert.equal(hint.textContent, "");
    clock.advance(HOLD_DURATION_MS);
    assert.equal(handle.isOpen(), false);
  });
});

for (const key of ["Enter", " "]) {
  test(`opening control: holding ${key === " " ? "Space" : key} opens after the full duration; key repeat neither shortens nor restarts it`, async () => {
    await withArea({}, async ({ opener, hint, clock, handle }) => {
      let prevented = 0;
      const event = (repeat) => ({ key, repeat, preventDefault() { prevented += 1; } });
      opener.dispatch("keydown", event(false));
      assert.equal(prevented, 1, "the key must not also click or scroll");
      assert.equal(hint.textContent, "Weiter halten … 3");
      clock.advance(1500);
      // What a held key sends: repeats, and on some systems further key-downs without the repeat flag.
      opener.dispatch("keydown", event(true));
      opener.dispatch("keydown", event(false));
      assert.equal(hint.textContent, "Weiter halten … 2");
      clock.advance(1499);
      assert.equal(handle.isOpen(), false);
      clock.advance(1);
      assert.equal(handle.isOpen(), true);
    });
  });
}

test("opening control: releasing the key early resets; another key does nothing", async () => {
  await withArea({}, async ({ opener, hint, clock, handle }) => {
    opener.dispatch("keydown", { key: "a", repeat: false });
    assert.equal(hint.textContent, "");
    opener.dispatch("keydown", { key: "Enter", repeat: false });
    clock.advance(2000);
    // The release of a key that is not the held one does not end the hold.
    opener.dispatch("keyup", { key: " " });
    assert.equal(hint.textContent, "Weiter halten … 1");
    opener.dispatch("keyup", { key: "Enter" });
    clock.advance(5000);
    assert.equal(handle.isOpen(), false);
    assert.equal(hint.textContent, "Zum Öffnen bitte 3 Sekunden gedrückt halten.");
  });
});

test("opening control: the area never opens while the board is still starting", async () => {
  await withArea({ openBackend: () => new Promise(() => undefined), waitForStart: false }, async ({ opener, hint, clock, handle, boardRegion, caregiverRegion, appTimers }) => {
    assert.equal(boardRegion.dataset.startup, "pending");
    opener.dispatch("pointerdown", { button: 0 });
    clock.advance(HOLD_DURATION_MS);
    assert.equal(handle.isOpen(), false);
    assert.equal(handle.open(), false);
    assert.equal(caregiverRegion.hidden, true);
    assert.deepEqual(caregiverRegion.children, []);
    assert.equal(boardRegion.hidden, false);
    assert.equal(hint.textContent, "Die Tafel wird noch geladen. Bitte gleich noch einmal versuchen.");
    opener.dispatch("pointerup");

    // Once start-up has put a board on screen (here: its time-out), the same hold opens.
    for (const timer of appTimers) timer();
    assert.equal(boardRegion.dataset.startup, "demo-timeout");
    opener.dispatch("pointerdown", { button: 0 });
    clock.advance(HOLD_DURATION_MS);
    assert.equal(handle.isOpen(), true);
  });
});

// --- Opening and closing ---

test("area: opening hides the board and the opening control, stops speech and moves focus to the heading of a labelled region", async () => {
  await withArea({ seed: createMia }, async ({ holdOpen, boardRegion, caregiverRegion, entry, speech, focused, handle, texts }) => {
    const cancelledBefore = speech.cancelled;
    await holdOpen();
    assert.equal(handle.isOpen(), true);
    assert.equal(boardRegion.hidden, true);
    assert.equal(entry.hidden, true);
    assert.equal(caregiverRegion.hidden, false);
    assert.equal(speech.cancelled, cancelledBefore + 1);
    const heading = headingOf(caregiverRegion);
    const status = statusElement(caregiverRegion);
    assert.equal(heading.tagName, "h1");
    assert.equal(heading.textContent, "Für Bezugspersonen");
    assert.equal(heading.tabIndex, -1);
    assert.equal(focused.current, heading);
    assert.equal(status.role, "status");
    assert.equal(status["aria-live"], "polite");
    assert.ok(texts().includes("Mia"));
  });
});

test("area: closing hides and empties it, shows the board again, refreshes it from the same store and returns focus to the opening control", async () => {
  await withArea({ seed: createMia }, async ({ holdOpen, handle, boardRegion, caregiverRegion, entry, opener, focused, refreshes, button, tiles, app, seeded }) => {
    assert.equal(boardRegion.dataset.boardFallback, "empty-profile");
    await holdOpen();
    // Something changes behind the area's back, through the page's own store: closing must pick it up.
    const store = await app.store();
    await store.setConceptIds(seeded.id, ["fertig", "hilfe"]);
    assert.equal(refreshes.count, 0);
    button("Fertig").click();
    assert.equal(handle.isOpen(), false);
    await handle.close();
    assert.equal(caregiverRegion.hidden, true);
    assert.deepEqual(caregiverRegion.children, []);
    assert.equal(boardRegion.hidden, false);
    assert.equal(entry.hidden, false);
    assert.equal(focused.current, opener);
    assert.equal(refreshes.count, 1);
    assert.equal(boardRegion.dataset.startup, "profile");
    assert.deepEqual(tiles(), ["Fertig", "Hilfe"]);
    assert.equal(await app.store(), store);
  });
});

const RELOAD_HELP = "Zeigt die Tafel des Kindes nicht, was hier eingestellt ist? „Tafel neu laden“ liest sie noch einmal aus dem Speicher dieses Geräts.";
const VOICE_HELP = "Spricht das Gerät nicht? Dann ist es vielleicht stumm geschaltet, oder es fehlt eine deutsche Stimme. Sie wird in den Einstellungen des Geräts bei „Sprachausgabe“ oder „Text-in-Sprache“ installiert.";
const HELP_TEXTS = ["Hilfe bei Problemen", RELOAD_HELP, "Tafel neu laden", VOICE_HELP];
const NO_STORAGE_TEXTS = [
  "Für Bezugspersonen", "Nach dem Schließen: Beispiele – der Speicher ist nicht erreichbar.", "Fertig",
  "Der Speicher dieses Geräts ist gerade nicht erreichbar. Deshalb kann hier im Moment nichts geändert werden.",
  ...HELP_TEXTS,
];

test("area: without storage it says so, also in the header, and offers only closing and, in the opened help, reloading the board", async () => {
  await withArea({ openBackend: async () => { throw new Error("no storage"); } }, async ({ holdOpen, texts, caregiverRegion, boardRegion, refreshes, button, status }) => {
    assert.equal(boardRegion.dataset.startup, "demo-unavailable");
    await holdOpen();
    assert.deepEqual(texts(), NO_STORAGE_TEXTS);
    // Nothing that could write: no field, no form, and only these two buttons.
    assert.deepEqual(controlsIn(caregiverRegion).map((element) => element.textContent), ["Fertig", "Tafel neu laden"]);
    // "Tafel neu laden" is the retry here, so the help is open without a tap.
    assert.equal(byClass(caregiverRegion, "caregiver-help").open, true);
    button("Tafel neu laden").click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(refreshes.count, 1);
    // The refresh fell back to the examples, so it is not reported as a success.
    assert.equal(status(), "Der Speicher dieses Geräts ist gerade nicht erreichbar. Die Tafel zeigt deshalb Beispiele.");
  });
});

test("area: 'Tafel neu laden' refreshes the board, and says so in German when the refresh ran into its time-out", async () => {
  const fakes = installFakes();
  try {
    const boardRegion = fakes.fakeElement("section");
    boardRegion.dataset.startup = "profile";
    const caregiverRegion = fakes.fakeElement("section");
    const entry = fakes.fakeElement("footer");
    let refreshes = 0;
    let outcome = "refresh-timeout";
    const app = { store: async () => null, refreshBoard: async () => { refreshes += 1; boardRegion.dataset.startup = outcome; } };
    const handle = mountCaregiver({ app, boardRegion, caregiverRegion, entry, catalogue: CONCEPTS, setTimer: () => () => undefined, onPageHidden: () => undefined, now: alwaysAimed() });
    assert.equal(handle.open(), true);
    await handle.settled();
    const status = () => statusOf(caregiverRegion);
    buttonNamed(caregiverRegion, "Tafel neu laden").click();
    await handle.settled();
    assert.equal(refreshes, 1);
    assert.equal(status(), "Die Tafel konnte gerade nicht neu geladen werden. Bitte versuche es noch einmal.");
    // The retry.
    outcome = "profile";
    buttonNamed(caregiverRegion, "Tafel neu laden").click();
    await handle.settled();
    assert.equal(refreshes, 2);
    assert.equal(status(), "Die Tafel wurde neu geladen.");
  } finally {
    fakes.restore();
  }
});

// --- Profiles ---

test("profiles: the list shows every readable profile by name and marks the active one", async () => {
  const seed = async (store) => {
    const mia = await store.create("Mia", []);
    await store.create("Ben", []);
    await store.setActive(mia.id);
  };
  await withArea({ seed }, async ({ holdOpen, profiles, texts }) => {
    await holdOpen();
    const listed = profiles();
    assert.deepEqual(listed.map((profile) => [profile.name, profile.active]), [["Ben", false], ["Mia", true]]);
    // The active one has the marker instead of the button; the other has the button, named for its profile.
    assert.equal(listed[1].activate, null);
    assert.equal(listed[0].activate["aria-label"], "Als aktive Tafel verwenden: Ben");
    assert.ok(!texts().some((text) => /nicht gelesen/.test(text)));
  });
});

test("profiles: an empty device says that there is no profile yet", async () => {
  await withArea({}, async ({ holdOpen, texts, profiles, concepts }) => {
    await holdOpen();
    assert.ok(texts().includes("Auf diesem Gerät gibt es noch kein Profil."));
    assert.deepEqual(profiles(), []);
    assert.deepEqual(concepts(), []);
  });
});

test("profiles: damaged entries are counted in a calm note, are not listed, and nothing offers to delete or repair them", async () => {
  const seed = async (store, backend) => {
    const mia = await store.create("Mia", []);
    await store.setActive(mia.id);
    // One written by a newer app version, one that is simply unreadable.
    await backend.write({ set: {
      [`profile/${"a".repeat(32)}/meta`]: { version: 2, id: "a".repeat(32), displayName: "Neuer", conceptIds: [], extra: true },
      [`profile/${"b".repeat(32)}/meta`]: "kaputt",
    } });
  };
  await withArea({ seed }, async ({ holdOpen, texts, profiles, caregiverRegion, backend }) => {
    const before = JSON.stringify(backend.snapshot());
    await holdOpen();
    assert.ok(texts().includes("2 gespeicherte Profile können in dieser Version nicht gelesen werden. Sie bleiben unverändert gespeichert. Eine spätere Version hilft dabei."));
    assert.deepEqual(profiles().map((profile) => profile.name), ["Mia"]);
    assert.ok(!texts().some((text) => /Neuer|kaputt/.test(text)));
    // The only delete button belongs to the readable profile; nothing deletes or repairs a damaged entry.
    assert.deepEqual(buttonsIn(caregiverRegion).filter((element) => /lösch|reparier/i.test(element.textContent)).map((element) => element["aria-label"]), ["Löschen: Mia"]);
    assert.equal(JSON.stringify(backend.snapshot()), before, "showing the list writes nothing");
  });
});

test("profiles: one damaged entry is worded in the singular, and a damaged active profile is not shown as active", async () => {
  const seed = async (store, backend) => {
    const mia = await store.create("Mia", []);
    await store.setActive(mia.id);
    await store.create("Ben", []);
    await backend.write({ set: { [`profile/${mia.id}/meta`]: "kaputt" } });
  };
  await withArea({ seed }, async ({ holdOpen, texts, profiles }) => {
    await holdOpen();
    assert.ok(texts().includes("Ein gespeichertes Profil kann in dieser Version nicht gelesen werden. Es bleibt unverändert gespeichert. Eine spätere Version hilft dabei."));
    assert.deepEqual(profiles().map((profile) => [profile.name, profile.active]), [["Ben", false]]);
  });
});

test("create: the first profile on the device is stored without concepts, becomes the active board, and the area says so", async () => {
  await withArea({}, async ({ holdOpen, create, status, profiles, store, nameInput, focused, caregiverRegion, editorHeading }) => {
    await holdOpen();
    const label = tree(caregiverRegion).find((element) => element.tagName === "label" && element.textContent === "Name für ein neues Profil");
    assert.equal(label.htmlFor, nameInput().id);
    await create("  Mia  ");
    assert.equal(status(), "Das Profil „Mia“ ist angelegt und jetzt die aktive Tafel. Füge unten Begriffe hinzu.");
    assert.deepEqual(profiles().map((profile) => [profile.name, profile.active]), [["Mia", true]]);
    const listing = await (await store()).list();
    assert.deepEqual(listing.profiles.map((profile) => [profile.displayName, profile.conceptIds]), [["Mia", []]]);
    assert.equal(await (await store()).getActive(), listing.profiles[0].id);
    // The field is empty again. Focus is on the heading of the new board's editor: that is the next step.
    assert.equal(nameInput().value, "");
    assert.equal(editorHeading().textContent, "Tafel von „Mia“ bearbeiten");
    assert.equal(editorHeading().tabIndex, -1);
    assert.equal(focused.current, editorHeading());
  });
});

test("create: a second profile is stored but not made active, and the area says so", async () => {
  await withArea({ seed: createMia }, async ({ holdOpen, create, status, profiles, profile, store, seeded, focused, nameInput }) => {
    await holdOpen();
    await create("Ben");
    assert.equal(status(), "Das Profil „Ben“ wurde angelegt. Es ist noch nicht die aktive Tafel.");
    // Focus stays in the list, on the new card's first button, which is the one that makes it the active board.
    assert.equal(focused.current, profile("Ben").activate);
    assert.equal(nameInput().value, "");
    assert.deepEqual(profiles().map((profile) => [profile.name, profile.active]), [["Ben", false], ["Mia", true]]);
    assert.equal(await (await store()).getActive(), seeded.id);
  });
});

test("create: a profile next to damaged entries is not taken for the first one and is not made active", async () => {
  const seed = async (store, backend) => {
    await backend.write({ set: { [`profile/${"a".repeat(32)}/meta`]: "kaputt" } });
  };
  await withArea({ seed }, async ({ holdOpen, create, status, store }) => {
    await holdOpen();
    await create("Ben");
    assert.equal(status(), "Das Profil „Ben“ wurde angelegt. Es ist noch nicht die aktive Tafel.");
    assert.equal(await (await store()).getActive(), null);
  });
});

const NAME_REFUSALS = [
  ["an empty name", "", "Bitte gib einen Namen ein."],
  ["a name of spaces", "   ", "Bitte gib einen Namen ein."],
  ["a name that is too long", "x".repeat(41), "Der Name ist zu lang. Er darf höchstens 40 Zeichen haben."],
  ["a zero-width space", `Mi${chr(0x200b)}a`, "Der Name enthält unsichtbare Zeichen oder Steuerzeichen. Bitte tippe ihn neu ein."],
  ["a right-to-left override", `${chr(0x202e)}Mia`, "Der Name enthält unsichtbare Zeichen oder Steuerzeichen. Bitte tippe ihn neu ein."],
  ["a control character", "Mi\u0007a", "Der Name enthält unsichtbare Zeichen oder Steuerzeichen. Bitte tippe ihn neu ein."],
  // Counted in characters, not UTF-16 units: 41 emoji are too long, 30 emoji (60 units) are not.
  ["a name of 41 emoji", "😀".repeat(41), "Der Name ist zu lang. Er darf höchstens 40 Zeichen haben."],
  ["a name of 30 emoji with a zero-width space", `${"😀".repeat(30)}${chr(0x200b)}😀`, "Der Name enthält unsichtbare Zeichen oder Steuerzeichen. Bitte tippe ihn neu ein."],
];
for (const [what, input, sentence] of NAME_REFUSALS) {
  test(`create: ${what} is refused by the store and answered with one German sentence`, async () => {
    await withArea({}, async ({ holdOpen, create, status, profiles, backend, nameInput, texts }) => {
      await holdOpen();
      const before = JSON.stringify(backend.snapshot());
      await create(input);
      assert.equal(status(), sentence);
      assert.deepEqual(profiles(), []);
      assert.equal(JSON.stringify(backend.snapshot()), before);
      // What was typed stays in the field; no English and no error name reaches the screen.
      assert.equal(nameInput().value, input);
      assert.ok(!texts().some((text) => /displayName|Error|must|characters/.test(text)));
    });
  });
}

test("create: a name of exactly 40 characters, counted as characters and not as UTF-16 units, is accepted", async () => {
  await withArea({}, async ({ holdOpen, create, profiles }) => {
    await holdOpen();
    const name = "😀".repeat(40);
    await create(name);
    assert.deepEqual(profiles().map((profile) => profile.name), [name]);
  });
});

test("create: a failed write shows the German error, creates nothing and keeps the name in the field", async () => {
  await withArea({ seed: createMia }, async ({ holdOpen, create, status, profiles, backend, nameInput }) => {
    await holdOpen();
    backend.failWrite(1);
    await create("Ben");
    assert.equal(status(), "Das konnte gerade nicht gespeichert werden. Bitte versuche es noch einmal.");
    assert.deepEqual(profiles().map((profile) => profile.name), ["Mia"]);
    assert.equal(nameInput().value, "Ben");
    // Trying again works.
    await create("Ben");
    assert.deepEqual(profiles().map((profile) => profile.name), ["Ben", "Mia"]);
  });
});

test("activate: the button makes that profile the active board, the list follows the store, and the board shows it after closing", async () => {
  const seed = async (store) => {
    const mia = await createMia(store);
    const ben = await store.create("Ben", ["pause"]);
    await store.setConceptIds(mia.id, ["hilfe"]);
    return { mia, ben };
  };
  await withArea({ seed }, async ({ holdOpen, act, profiles, status, store, seeded, handle, tiles, focused }) => {
    assert.deepEqual(tiles(), ["Hilfe"]);
    await holdOpen();
    await act(() => profiles()[0].activate.click());
    assert.equal(status(), "„Ben“ ist jetzt die aktive Tafel.");
    assert.deepEqual(profiles().map((profile) => [profile.name, profile.active]), [["Ben", true], ["Mia", false]]);
    assert.equal(await (await store()).getActive(), seeded.ben.id);
    // The pressed button is gone; focus is on a control of the same profile, not lost.
    assert.equal(focused.current, profiles()[0].edit);
    await handle.close();
    assert.deepEqual(tiles(), ["Pause"]);
  });
});

test("activate: a failed write shows the German error and the list still marks the stored active profile", async () => {
  const seed = async (store) => {
    await createMia(store);
    await store.create("Ben", []);
  };
  await withArea({ seed }, async ({ holdOpen, act, profiles, status, backend }) => {
    await holdOpen();
    backend.failWrite(1);
    await act(() => profiles()[0].activate.click());
    assert.equal(status(), "Das konnte gerade nicht gespeichert werden. Bitte versuche es noch einmal.");
    assert.deepEqual(profiles().map((profile) => [profile.name, profile.active]), [["Ben", false], ["Mia", true]]);
  });
});

// --- Concepts ---

test("board editor: an empty board says so, and 'Weitere Begriffe' lists the catalogue with picture, label, sentence and one button each; the active profile is the one edited", async () => {
  await withArea({ seed: createMia }, async ({ holdOpen, concepts, texts, caregiverRegion }) => {
    await holdOpen();
    assert.ok(texts().includes("Tafel von „Mia“ bearbeiten"));
    const headings = tree(caregiverRegion).filter((element) => element.tagName === "h3").map((element) => element.textContent);
    assert.deepEqual(headings, ["Auf der Tafel", "Weitere Begriffe"]);
    assert.ok(texts().includes("Auf dieser Tafel ist noch kein Begriff."));
    const rows = concepts();
    assert.deepEqual(rows.map((row) => [row.name, row.sentence, row.picture, row.onBoard, row.locked]),
      CONCEPTS.map((concept) => [concept.labelDe, concept.speechDe, concept.symbolPath, false, false]));
    for (const row of rows) {
      // A concept that is not on the board has no place there, so nothing to move or remove.
      assert.deepEqual(row.buttons, ["Hinzufügen"]);
      assert.equal(row.add["aria-label"], `Hinzufügen: ${row.name}`);
    }
    // No checkbox is left: a row does not change its place under the finger by being ticked.
    assert.deepEqual(tree(caregiverRegion).filter((element) => element.tagName === "input" && element.type === "checkbox"), []);
  });
});

test("board editor: adding, moving and removing is saved at once and is on the child's board after closing, in order, without a reload", async () => {
  await withArea({ seed: createMia }, async ({ holdOpen, add, remove, act, concept, concepts, onBoard, more, status, store, seeded, handle, tiles, boardRegion, texts }) => {
    assert.equal(boardRegion.dataset.boardFallback, "empty-profile");
    await holdOpen();
    await add("Pause");
    assert.equal(status(), "Gespeichert: „Pause“ ist jetzt auf der Tafel.");
    await add("Hilfe");
    await add("Fertig");
    const ids = async () => (await (await store()).get(seeded.id)).conceptIds;
    assert.deepEqual(await ids(), ["pause", "hilfe", "fertig"]);
    // The board in board order; the others below, in catalogue order.
    assert.deepEqual(onBoard(), ["Pause", "Hilfe", "Fertig"]);
    assert.deepEqual(more(), ["Trinken", "Mehr"]);
    const boardRows = () => concepts().filter((row) => row.onBoard);
    assert.deepEqual(boardRows().map((row) => row.buttons), Array(3).fill(["nach oben", "nach unten", "Text ändern", "Bild wählen", "Gebärde beibringen", "Vormachen", "Entfernen"]));
    assert.deepEqual(boardRows().map((row) => [row.name, row.sentence, row.picture]), [
      ["Pause", "Ich brauche eine Pause.", "./icons/pause.svg"], ["Hilfe", "Ich brauche Hilfe.", "./icons/hilfe.svg"], ["Fertig", "Ich bin fertig.", "./icons/fertig.svg"],
    ]);
    // The ends of the order cannot move further.
    assert.deepEqual(boardRows().map((row) => [row.up.disabled, row.down.disabled]), [[true, false], [false, false], [false, true]]);
    assert.equal(concept("Fertig").up["aria-label"], "Fertig nach oben");
    assert.equal(concept("Fertig").remove["aria-label"], "Entfernen: Fertig");

    await act(() => concept("Fertig").up.click());
    assert.equal(status(), "Die Reihenfolge wurde gespeichert.");
    assert.deepEqual(await ids(), ["pause", "fertig", "hilfe"]);
    await act(() => concept("Fertig").up.click());
    assert.deepEqual(await ids(), ["fertig", "pause", "hilfe"]);
    await act(() => concept("Pause").down.click());
    assert.deepEqual(await ids(), ["fertig", "hilfe", "pause"]);
    await remove("Hilfe");
    assert.equal(status(), "„Hilfe“ wurde von der Tafel genommen.");
    assert.deepEqual(await ids(), ["fertig", "pause"]);
    assert.deepEqual(onBoard(), ["Fertig", "Pause"]);
    assert.deepEqual(more(), ["Hilfe", "Trinken", "Mehr"]);
    assert.ok(!texts().includes("Auf dieser Tafel ist noch kein Begriff."));

    await handle.close();
    assert.equal(boardRegion.dataset.startup, "profile");
    assert.equal(boardRegion.dataset.boardFallback, undefined);
    assert.deepEqual(tiles(), ["Fertig", "Pause"]);
  });
});

test("board editor: when every catalogue concept is on the board, 'Weitere Begriffe' says so", async () => {
  const seed = async (store) => {
    const mia = await createMia(store);
    await store.setConceptIds(mia.id, CONCEPTS.map((concept) => concept.id));
  };
  await withArea({ seed }, async ({ holdOpen, more, texts, remove }) => {
    await holdOpen();
    assert.deepEqual(more(), []);
    assert.ok(texts().includes("Alle Begriffe aus der Auswahl sind auf der Tafel."));
    await remove("Mehr");
    assert.deepEqual(more(), ["Mehr"]);
    assert.ok(!texts().includes("Alle Begriffe aus der Auswahl sind auf der Tafel."));
  });
});

test("concepts: the wording is stored through setBoardConcepts, so the board keeps its sentence when the catalogue changes", async () => {
  await withArea({ seed: createMia }, async ({ holdOpen, add, backend, seeded }) => {
    await holdOpen();
    await add("Hilfe");
    assert.deepEqual(backend.snapshot()[`profile/${seeded.id}/data/concept.hilfe`], { version: 1, labelDe: "Hilfe", speechDe: "Ich brauche Hilfe.", copied: true });
  });
});

test("board editor: 'Tafel bearbeiten' switches to another profile, and its changes do not touch the first", async () => {
  const seed = async (store) => {
    const mia = await createMia(store);
    await store.setConceptIds(mia.id, ["hilfe"]);
    const ben = await store.create("Ben", []);
    return { mia, ben };
  };
  await withArea({ seed }, async ({ holdOpen, act, profiles, add, texts, store, seeded, onBoard, focused, editorHeading, status }) => {
    await holdOpen();
    assert.equal(profiles()[1].edit["aria-pressed"], "true");
    assert.equal(profiles()[0].edit["aria-label"], "Tafel bearbeiten: Ben");
    await act(() => profiles()[0].edit.click());
    assert.ok(texts().includes("Tafel von „Ben“ bearbeiten"));
    assert.equal(profiles()[0].edit["aria-pressed"], "true");
    assert.equal(profiles()[1].edit["aria-pressed"], "false");
    // The editor is below the fold on a phone: focus goes to its heading, and the status line says what happened.
    assert.equal(focused.current, editorHeading());
    assert.equal(editorHeading().textContent, "Tafel von „Ben“ bearbeiten");
    assert.equal(status(), "Tafel von „Ben“ wird bearbeitet.");
    assert.deepEqual(onBoard(), []);
    await add("Mehr");
    assert.deepEqual((await (await store()).get(seeded.ben.id)).conceptIds, ["mehr"]);
    assert.deepEqual((await (await store()).get(seeded.mia.id)).conceptIds, ["hilfe"]);
  });
});

/** A board with every kind of id this screen cannot edit, between catalogue concepts. */
const seedMixedBoard = async (store) => {
  const mia = await store.create("Mia", ["hilfe", "mein.ball", "neu", "trinken", "geist", "alt", "ball", "pause"]);
  await store.setActive(mia.id);
  const data = store.data(mia.id);
  // Written by a newer app version: a shape this version does not know.
  await data.set("concept.neu", { version: 2, labelDe: "Neu", speechDe: "Etwas Neues.", custom: true, colour: "blau" });
  // The stored wording of a concept the catalogue has dropped, and a custom concept.
  await data.set("concept.alt", { version: 1, labelDe: "Schaukel", speechDe: "Ich möchte schaukeln.", copied: true });
  await data.set("concept.ball", { version: 1, labelDe: "Ball", speechDe: "Ich möchte mit dem Ball spielen.", custom: true });
  return mia;
};
const MIXED_IDS = ["hilfe", "mein.ball", "neu", "trinken", "geist", "alt", "ball", "pause"];
/** The ids that stay where they are: "ball" is an own concept and can be moved and taken off (card NG-34). */
const LOCKED_IDS = ["mein.ball", "neu", "geist", "alt"];

test("board editor: a mixed board shows editable rows with buttons and each kind of locked row at its real place, with its explanation and no buttons", async () => {
  await withArea({ seed: seedMixedBoard }, async ({ holdOpen, concepts }) => {
    await holdOpen();
    assert.deepEqual(concepts().map((row) => [row.name, row.onBoard, row.locked, row.note]), [
      ["Hilfe", true, false, null],
      ["Begriff „mein.ball“", true, true, NOT_EDITABLE],
      ["Begriff „neu“", true, true, NEWER_ENTRY],
      ["Trinken", true, false, null],
      ["Begriff „geist“", true, true, NOT_EDITABLE],
      ["Schaukel", true, true, `Dieser Begriff ist nicht mehr in der Auswahl. ${LOCKED_PLACE}`],
      ["Ball", true, false, null],
      ["Pause", true, false, null],
      ["Mehr", false, false, null],
      ["Fertig", false, false, null],
    ]);
    // A locked row cannot be moved or taken off. One that the board shows can be reworded and taught a gesture; one that it cannot show has no button at all.
    assert.deepEqual(concepts().filter((candidate) => candidate.locked).map((row) => [row.name, row.buttons]), [
      ["Begriff „mein.ball“", []], ["Begriff „neu“", []], ["Begriff „geist“", []], ["Schaukel", ["Text ändern", "Bild wählen", "Gebärde beibringen", "Vormachen"]],
    ]);
    assert.deepEqual(concepts().filter((row) => row.onBoard && !row.locked).map((row) => row.buttons), Array(4).fill(["nach oben", "nach unten", "Text ändern", "Bild wählen", "Gebärde beibringen", "Vormachen", "Entfernen"]));
    assert.equal(concepts().find((row) => row.name === "Schaukel").sentence, "Ich möchte schaukeln.");
    assert.equal(concepts().find((row) => row.name === "Ball").sentence, "Ich möchte mit dem Ball spielen.");
    // "nach oben" / "nach unten" end at the ends of the editable sequence, not of the list.
    const editable = concepts().filter((row) => row.onBoard && !row.locked);
    assert.deepEqual(editable.map((row) => [row.name, row.up.disabled, row.down.disabled]), [["Hilfe", true, false], ["Trinken", false, false], ["Ball", false, false], ["Pause", false, true]]);
  });
});

test("board editor: add and move write the full conceptIds with every locked id at its exact index; remove keeps every other id in order; their entries stay byte-identical", async () => {
  await withArea({ seed: seedMixedBoard }, async ({ holdOpen, add, remove, act, concept, store, seeded, backend, handle, tiles }) => {
    const entries = () => JSON.stringify(["neu", "alt", "ball"].map((id) => backend.snapshot()[`profile/${seeded.id}/data/concept.${id}`]));
    const before = entries();
    const ids = async () => (await (await store()).get(seeded.id)).conceptIds;
    const lockedAt = (list) => LOCKED_IDS.map((id) => list.indexOf(id));
    const lockedBefore = lockedAt(MIXED_IDS);
    await holdOpen();

    // Move: two editable concepts trade places (an own concept is one of them); every other id keeps its index.
    await act(() => concept("Pause").up.click());
    assert.deepEqual(await ids(), ["hilfe", "mein.ball", "neu", "trinken", "geist", "alt", "pause", "ball"]);
    await act(() => concept("Hilfe").down.click());
    assert.deepEqual(await ids(), ["trinken", "mein.ball", "neu", "hilfe", "geist", "alt", "pause", "ball"]);
    assert.deepEqual(lockedAt(await ids()), lockedBefore);
    // Add: at the end; nothing else moves.
    await add("Mehr");
    assert.deepEqual(await ids(), ["trinken", "mein.ball", "neu", "hilfe", "geist", "alt", "pause", "ball", "mehr"]);
    assert.deepEqual(lockedAt(await ids()), lockedBefore);
    // Remove: only that id leaves; the rest keeps its order, locked ids included.
    await remove("Hilfe");
    assert.deepEqual(await ids(), ["trinken", "mein.ball", "neu", "geist", "alt", "pause", "ball", "mehr"]);
    await remove("Pause");
    await remove("Trinken");
    await remove("Mehr");
    assert.deepEqual(await ids(), [...LOCKED_IDS, "ball"]);
    assert.equal(entries(), before);

    // The board shows what it can of them, as before.
    await handle.close();
    assert.deepEqual(tiles(), ["Schaukel", "Ball"]);
  });
});

test("board editor: on screen, an action changes the place of the acted row only (a move: of the two rows that swap)", async () => {
  await withArea({ seed: seedMixedBoard }, async ({ holdOpen, add, remove, act, concept, concepts }) => {
    await holdOpen();
    const names = () => concepts().map((row) => row.name);
    const start = names();
    assert.deepEqual(start, ["Hilfe", "Begriff „mein.ball“", "Begriff „neu“", "Trinken", "Begriff „geist“", "Schaukel", "Ball", "Pause", "Mehr", "Fertig"]);
    const without = (list, ...gone) => list.filter((name) => !gone.includes(name));

    // Move: "Trinken" and the own concept "Ball" swap; every other row is where it was.
    await act(() => concept("Trinken").down.click());
    const afterMove = names();
    assert.deepEqual(afterMove.map((name, index) => (name === start[index] ? null : name)).filter((name) => name !== null), ["Ball", "Trinken"]);
    // Remove: the row leaves the board list and appears in "Weitere Begriffe" at its catalogue place; the others keep their order.
    await remove("Hilfe");
    assert.deepEqual(without(names(), "Hilfe"), without(afterMove, "Hilfe"));
    assert.deepEqual(names().slice(-3), ["Hilfe", "Mehr", "Fertig"]);
    // Add: the row goes to the end of the board list; the others keep their order.
    const beforeAdd = names();
    await add("Fertig");
    assert.deepEqual(without(names(), "Fertig"), without(beforeAdd, "Fertig"));
    assert.deepEqual(concepts().filter((row) => row.onBoard).at(-1).name, "Fertig");
  });
});

test("focus: after a move it follows the moved row's same button, or the opposite one when that is now disabled", async () => {
  const seed = async (store) => {
    const mia = await createMia(store);
    await store.setConceptIds(mia.id, ["pause", "hilfe", "fertig"]);
  };
  await withArea({ seed }, async ({ holdOpen, act, concept, focused, onBoard }) => {
    await holdOpen();
    await act(() => concept("Fertig").up.click());
    assert.deepEqual(onBoard(), ["Pause", "Fertig", "Hilfe"]);
    assert.equal(focused.current, concept("Fertig").up);
    await act(() => concept("Fertig").up.click());
    // At the top "nach oben" is disabled, so focus goes to the other button of the same row.
    assert.equal(concept("Fertig").up.disabled, true);
    assert.equal(focused.current, concept("Fertig").down);
    await act(() => concept("Hilfe").up.click());
    await act(() => concept("Hilfe").down.click());
    assert.equal(concept("Hilfe").down.disabled, true);
    assert.equal(focused.current, concept("Hilfe").up);
  });
});

test("focus: after 'Entfernen' it goes to the next row's 'Entfernen', else the previous one, else the heading 'Weitere Begriffe'; locked rows are passed over", async () => {
  await withArea({ seed: seedMixedBoard }, async ({ holdOpen, remove, concept, focused, caregiverRegion }) => {
    await holdOpen();
    // Editable order: Hilfe, Trinken, Ball, Pause (locked rows between them).
    await remove("Hilfe");
    assert.equal(focused.current, concept("Trinken").remove);
    await remove("Pause");
    assert.equal(focused.current, concept("Ball").remove);
    await remove("Trinken");
    assert.equal(focused.current, concept("Ball").remove);
    await remove("Ball");
    const heading = tree(caregiverRegion).find((element) => element.tagName === "h3" && element.textContent === "Weitere Begriffe");
    assert.equal(heading.tabIndex, -1);
    assert.equal(focused.current, heading);
  });
  // From the middle it is the next row, not the previous one.
  await withArea({ seed: seedMixedBoard }, async ({ holdOpen, remove, concept, focused }) => {
    await holdOpen();
    await remove("Trinken");
    assert.equal(focused.current, concept("Ball").remove);
  });
});

test("focus: after 'Hinzufügen' it goes to the next 'Hinzufügen', else the previous one, else the new row", async () => {
  await withArea({ seed: createMia }, async ({ holdOpen, add, concept, focused }) => {
    await holdOpen();
    // Catalogue order: Hilfe, Trinken, Pause, Mehr, Fertig.
    await add("Trinken");
    assert.equal(focused.current, concept("Pause").add);
    await add("Fertig");
    assert.equal(focused.current, concept("Mehr").add);
    await add("Pause");
    await add("Mehr");
    assert.equal(focused.current, concept("Hilfe").add);
    await add("Hilfe");
    assert.equal(focused.current, concept("Hilfe").row);
    assert.equal(concept("Hilfe").row.tabIndex, -1);
  });
});

test("concepts: a custom concept under a catalogue id is a locked row, and the catalogue concept is not offered a second time", async () => {
  const seed = async (store) => {
    const mia = await store.create("Mia", ["hilfe", "pause"]);
    await store.setActive(mia.id);
    await store.data(mia.id).set("concept.hilfe", { version: 1, labelDe: "Hilf mir", speechDe: "Hilf mir bitte.", custom: true });
    return mia;
  };
  await withArea({ seed }, async ({ holdOpen, concepts, concept, act, store, seeded }) => {
    await holdOpen();
    assert.deepEqual(concepts().map((row) => [row.name, row.onBoard, row.locked]), [["Hilf mir", true, true], ["Pause", true, false], ["Trinken", false, false], ["Mehr", false, false], ["Fertig", false, false]]);
    // The only editable concept has nowhere to move.
    assert.equal(concept("Pause").up.disabled, true);
    assert.equal(concept("Pause").down.disabled, true);
    await act(() => concept("Pause").up.click());
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, ["hilfe", "pause"]);
  });
});

test("concepts: a failed write shows the German error, claims no success, offers no undo, and the lists still show the stored state", async () => {
  const seed = async (store) => {
    const mia = await createMia(store);
    await store.setConceptIds(mia.id, ["hilfe", "pause"]);
    return mia;
  };
  await withArea({ seed }, async ({ holdOpen, add, act, concept, onBoard, more, status, store, seeded, backend, handle, tiles, undo, focused }) => {
    await holdOpen();
    const shown = () => [onBoard(), more()];
    const stored = [["Hilfe", "Pause"], ["Trinken", "Mehr", "Fertig"]];
    const failure = "Das konnte gerade nicht gespeichert werden. Bitte versuche es noch einmal. Die Tafel ist unverändert.";
    const ids = async () => (await (await store()).get(seeded.id)).conceptIds;

    // Adding: the first write (the wording) fails, then the second (the concept ids).
    for (const nth of [1, 2]) {
      backend.failWrite(nth);
      await add("Mehr");
      // Focus stays on the button that was pressed, so that a second press adds the same concept.
      assert.equal(focused.current, concept("Mehr").add, `write ${nth}`);
      assert.equal(status(), failure, `write ${nth}`);
      assert.deepEqual(shown(), stored, `write ${nth}`);
      assert.deepEqual(await ids(), ["hilfe", "pause"], `write ${nth}`);
    }
    // Reordering and removing.
    backend.failWrite(1);
    await act(() => concept("Pause").up.click());
    assert.equal(status(), failure);
    assert.deepEqual(shown(), stored);
    assert.equal(focused.current, concept("Pause").up);
    backend.failWrite(1);
    await act(() => concept("Hilfe").remove.click());
    assert.equal(status(), failure);
    assert.deepEqual(shown(), stored);
    // Not on the neighbour's "Entfernen": a retry must take off the concept that was meant. And it counts at once.
    assert.equal(focused.current, concept("Hilfe").remove);
    assert.equal(concept("Hilfe").remove["aria-disabled"], "false");
    backend.failWrite(1);
    await act(() => focused.current.click());
    assert.equal(status(), failure);
    assert.deepEqual(shown(), stored);
    assert.equal(undo(), null, "nothing was removed, so nothing can be taken back");
    assert.deepEqual(await ids(), ["hilfe", "pause"]);

    // Trying again works, and the board has it.
    await add("Mehr");
    assert.equal(status(), "Gespeichert: „Mehr“ ist jetzt auf der Tafel.");
    await handle.close();
    assert.deepEqual(tiles(), ["Hilfe", "Pause", "Mehr"]);
  });
});

test("concepts: a profile that is full refuses a new concept with one German sentence", async () => {
  const backend = new MemoryBackend();
  // No data entry fits: storing the wording of a newly chosen concept is refused with ProfileSizeError.
  const store = await ProfileStore.open(backend, { limits: { maxDataNames: 0 } });
  const mia = await createMia(store);
  const app = { store: async () => store, refreshBoard: async () => undefined };
  await withArea({ backend, app }, async ({ holdOpen, add, status, onBoard }) => {
    await holdOpen();
    await add("Hilfe");
    assert.equal(status(), "Der Platz für dieses Profil ist voll. Die Änderung wurde nicht gespeichert.");
    assert.deepEqual(onBoard(), []);
    assert.deepEqual((await store.get(mia.id)).conceptIds, []);
  });
});

test("concepts: a profile that was removed meanwhile is answered in German and leaves the list", async () => {
  await withArea({ seed: createMia }, async ({ holdOpen, add, status, store, seeded, profiles, texts }) => {
    await holdOpen();
    await (await store()).remove(seeded.id);
    await add("Hilfe");
    assert.equal(status(), "Dieses Profil kann nicht gelesen werden oder ist nicht mehr gespeichert.");
    assert.deepEqual(profiles(), []);
    assert.ok(texts().includes("Auf diesem Gerät gibt es noch kein Profil."));
  });
});

test("concepts: with a changed catalogue, a dropped concept is a retired row and the board keeps it", async () => {
  const seed = async (store) => {
    const mia = await createMia(store);
    await store.setConceptIds(mia.id, ["hilfe", "pause"]);
    await store.data(mia.id).set("concept.pause", { version: 1, labelDe: "Pause", speechDe: "Ich brauche eine Pause.", copied: true });
    return mia;
  };
  const catalogue = CONCEPTS.filter((concept) => concept.id !== "pause");
  await withArea({ seed, catalogue }, async ({ holdOpen, concepts, remove, store, seeded }) => {
    await holdOpen();
    assert.deepEqual(concepts().map((row) => [row.name, row.locked]), [["Hilfe", false], ["Pause", true], ["Trinken", false], ["Mehr", false], ["Fertig", false]]);
    assert.match(concepts()[1].note, /^Dieser Begriff ist nicht mehr in der Auswahl\./);
    await remove("Hilfe");
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, ["pause"]);
  });
});

// --- Privacy and reading problems ---

test("privacy: neither the board region nor the opening control ever carries a profile name or id", async () => {
  await withArea({}, async ({ holdOpen, create, add, act, profiles, handle, boardRegion, entry, store, caregiverRegion, backend }) => {
    const leaks = async () => {
      const listing = await (await store()).list();
      const secrets = listing.profiles.flatMap((profile) => [profile.displayName, profile.id]);
      return [...stringsIn(boardRegion), ...stringsIn(entry)].filter((text) => secrets.some((secret) => text.includes(secret)));
    };
    await holdOpen();
    await create("Mia Musterkind");
    await create("Ben Beispiel");
    await add("Hilfe");
    await add("Pause");
    assert.deepEqual(await leaks(), []);
    await act(() => profiles()[0].activate.click());
    backend.failWrite(1);
    await add("Mehr");
    assert.deepEqual(await leaks(), []);
    // The name is in the caregiver region while it is open, and nowhere once it is closed.
    assert.ok(stringsIn(caregiverRegion).some((text) => text.includes("Mia Musterkind")));
    await handle.close();
    assert.equal((await (await store()).list()).profiles.length, 2);
    assert.deepEqual(await leaks(), []);
    assert.deepEqual(stringsIn(caregiverRegion).filter((text) => /Mia|Ben/.test(text)), []);
  });
});

test("area: when the profiles cannot be read it says so in German and offers nothing that writes", async () => {
  const inner = new MemoryBackend();
  let failing = false;
  const backend = {
    get: async (key) => { if (failing) throw new Error("read failed"); return inner.get(key); },
    keys: async (prefix) => { if (failing) throw new Error("read failed"); return inner.keys(prefix); },
    write: (batch) => inner.write(batch),
  };
  await withArea({ backend }, async ({ holdOpen, texts, caregiverRegion }) => {
    failing = true;
    await holdOpen();
    assert.ok(texts().includes("Die gespeicherten Profile können gerade nicht gelesen werden. Deshalb kann hier im Moment nichts geändert werden."));
    assert.deepEqual(controlsIn(caregiverRegion).map((element) => element.textContent), ["Fertig", "Tafel neu laden"]);
    assert.equal(afterCloseOf(caregiverRegion), "Nach dem Schließen: Beispiele – die Profile können gerade nicht gelesen werden.");
  });
});

test("area: what was asked for before closing does not draw into the closed area, and the board is refreshed after it", async () => {
  await withArea({ seed: createMia }, async ({ holdOpen, concept, handle, caregiverRegion, tiles, button }) => {
    await holdOpen();
    concept("Hilfe").add.click();
    button("Fertig").click();
    await handle.close();
    await handle.settled();
    assert.deepEqual(caregiverRegion.children, []);
    // The write that was under way finished first, so the board already has it.
    assert.deepEqual(tiles(), ["Hilfe"]);
  });
});

/**
 * The area on a fake app whose refreshes the test settles by hand
 * (`refresh.settle(n)`, counted from 0); the board region holds one "old" tile.
 * `options.store` is what `app.store()` gives (a function). By default it is a
 * real store with two profiles, and one of them is made the active board
 * right after opening (`write()`), so that the mounted board may be out of
 * date when the area closes; `options.write: false` leaves that out.
 */
async function withSlowRefresh(callback, options = {}) {
  const fakes = installFakes();
  try {
    const boardRegion = fakes.fakeElement("section");
    boardRegion.dataset.startup = "profile";
    const oldTile = fakes.fakeElement("button");
    oldTile.textContent = "Alte Tafel";
    boardRegion.children = [oldTile];
    const caregiverRegion = fakes.fakeElement("section");
    caregiverRegion.hidden = true;
    const entry = fakes.fakeElement("footer");
    const realStore = await ProfileStore.open(new MemoryBackend());
    await createMia(realStore);
    await realStore.create("Ben", []);
    const resolvers = [];
    const refresh = { get calls() { return resolvers.length; }, settle(index) { resolvers[index](); } };
    const app = {
      store: options.store ?? (async () => realStore),
      refreshBoard: () => new Promise((resolve) => { resolvers.push(resolve); }),
    };
    const clock = fakeClock();
    const page = { hide: () => undefined };
    const handle = mountCaregiver({ app, boardRegion, caregiverRegion, entry, catalogue: CONCEPTS, setTimer: options.setTimer ?? clock.setTimer, onPageHidden: (hidden) => { page.hide = hidden; }, now: options.now ?? alwaysAimed() });
    const [opener, , hint] = entry.children;
    /** Makes the profile that is not active the active one: a write that succeeds. */
    const write = async () => {
      buttonNamed(caregiverRegion, "Als aktive Tafel verwenden").click();
      await handle.settled();
    };
    Object.assign(fakes, { status: () => statusOf(caregiverRegion) });
    if (options.open !== false) {
      assert.equal(handle.open(), true);
      await handle.settled();
      if (options.store === undefined && options.write !== false) await write();
    }
    /** True when a tile of the board can be reached: the region is shown. */
    const boardReachable = () => !boardRegion.hidden;
    await callback({ ...fakes, boardRegion, caregiverRegion, entry, opener, hint, handle, clock, refresh, oldTile, boardReachable, page, write, realStore });
  } finally {
    fakes.restore();
  }
}
const turn = () => new Promise((resolve) => setImmediate(resolve));

test("closing: while the refresh is running the board stays hidden under a German waiting line, and the opening control cannot be used", async () => {
  await withSlowRefresh(async ({ boardRegion, caregiverRegion, entry, opener, handle, clock, refresh, focused, boardReachable }) => {
    let closed = false;
    void handle.close().then(() => { closed = true; });
    await turn();
    assert.equal(refresh.calls, 1);
    assert.equal(handle.isOpen(), false);
    // The previous board is still what the region holds, so it must not be reachable.
    assert.equal(boardReachable(), false);
    assert.equal(entry.hidden, true);
    assert.equal(caregiverRegion.hidden, false);
    assert.deepEqual(textsIn(caregiverRegion), ["Die Tafel wird geladen."]);
    assert.equal(caregiverRegion.children[0].role, "status");
    assert.deepEqual(buttonsIn(caregiverRegion), []);
    assert.notEqual(focused.current, opener);
    assert.equal(closed, false);
    // Neither the handle nor a hold opens the area again before the board is back.
    assert.equal(handle.open(), false);
    opener.dispatch("pointerdown", { button: 0 });
    clock.advance(CLOSE_WAIT_MS - 1);
    assert.equal(handle.isOpen(), false);
    assert.equal(boardReachable(), false);
    assert.equal(boardRegion.hidden, true);
  });
});

test("closing: once the refresh has settled the board is shown, the waiting line is gone and focus is on the opening control", async () => {
  await withSlowRefresh(async ({ boardRegion, caregiverRegion, entry, opener, handle, clock, refresh, focused, boardReachable }) => {
    const closing = handle.close();
    await turn();
    assert.equal(boardReachable(), false);
    // The app mounts the new board, then its refresh resolves.
    const newTile = { ...boardRegion.children[0], textContent: "Neue Tafel" };
    boardRegion.children = [newTile];
    refresh.settle(0);
    await closing;
    assert.equal(boardReachable(), true);
    assert.deepEqual(textsIn(boardRegion), ["Neue Tafel"]);
    assert.equal(caregiverRegion.hidden, true);
    assert.deepEqual(caregiverRegion.children, []);
    assert.equal(entry.hidden, false);
    assert.equal(focused.current, opener);
    assert.equal(clock.waiting(), 0, "the bound is not left running");
    // The area can be opened again now.
    assert.equal(handle.open(), true);
  });
});

const NO_BOARD_YET = "Die Tafel konnte noch nicht neu geladen werden. Deshalb wird gerade keine Tafel gezeigt. "
  + "Bitte drücke „Tafel neu laden“ oder gib einer Bezugsperson Bescheid.";

test("closing: when the refresh has not settled at the bound, no board is shown: a German line, 'Tafel neu laden' and the opening control instead", async () => {
  await withSlowRefresh(async ({ boardRegion, caregiverRegion, entry, opener, handle, clock, refresh, focused, boardReachable }) => {
    assert.equal(CLOSE_WAIT_MS, 2500);
    const closing = handle.close();
    await turn();
    clock.advance(CLOSE_WAIT_MS - 1);
    assert.equal(entry.hidden, true);
    assert.deepEqual(textsIn(caregiverRegion), ["Die Tafel wird geladen."]);
    clock.advance(1);
    // close() resolves at the bound although no board is there.
    await closing;
    // What the board region holds was mounted before the area was opened and may be another child's board.
    assert.equal(boardReachable(), false);
    assert.equal(boardRegion.hidden, true);
    assert.equal(caregiverRegion.hidden, false);
    assert.deepEqual(textsIn(caregiverRegion), [NO_BOARD_YET, "Tafel neu laden"]);
    assert.equal(caregiverRegion.children[0].role, "status");
    assert.equal(entry.hidden, false);
    assert.equal(focused.current, buttonNamed(caregiverRegion, "Tafel neu laden"));

    // The queued refresh answers after all: now the board is shown, by itself.
    refresh.settle(0);
    await turn();
    assert.equal(boardReachable(), true);
    assert.equal(caregiverRegion.hidden, true);
    assert.deepEqual(caregiverRegion.children, []);
    assert.equal(focused.current, opener);
  });
});

test("closing: 'Tafel neu laden' after the bound asks for a fresh refresh, shows the board when it answers, and returns to the line when it does not", async () => {
  await withSlowRefresh(async ({ boardRegion, caregiverRegion, entry, opener, handle, clock, refresh, focused }) => {
    const closing = handle.close();
    await turn();
    clock.advance(CLOSE_WAIT_MS);
    await closing;
    const retry = buttonNamed(caregiverRegion, "Tafel neu laden");
    retry.click();
    await turn();
    assert.equal(refresh.calls, 2);
    assert.equal(caregiverRegion.children[0].textContent, "Die Tafel wird geladen.");
    assert.equal(boardRegion.hidden, true);
    // Unanswered within the bound: the line is back, the board still hidden.
    clock.advance(CLOSE_WAIT_MS);
    await turn();
    assert.equal(caregiverRegion.children[0].textContent, NO_BOARD_YET);
    assert.equal(boardRegion.hidden, true);
    // A second try that is answered shows the board.
    retry.click();
    await turn();
    assert.equal(refresh.calls, 3);
    refresh.settle(2);
    await turn();
    assert.equal(boardRegion.hidden, false);
    assert.equal(caregiverRegion.hidden, true);
    assert.deepEqual(caregiverRegion.children, []);
    assert.equal(entry.hidden, false);
    assert.equal(focused.current, opener);
  });
});

test("closing: the area can be opened from the state without a board, and a late answer does not disturb it", async () => {
  await withSlowRefresh(async ({ boardRegion, caregiverRegion, handle, clock, refresh }) => {
    const closing = handle.close();
    await turn();
    clock.advance(CLOSE_WAIT_MS);
    await closing;
    assert.equal(handle.open(), true);
    await handle.settled();
    refresh.settle(0);
    await turn();
    assert.equal(handle.isOpen(), true);
    assert.equal(boardRegion.hidden, true);
    assert.equal(caregiverRegion.hidden, false);
    assert.equal(headingOf(caregiverRegion).textContent, "Für Bezugspersonen");
  });
});

for (const second of ["its own refresh", "its own bound"]) {
  test(`closing: the late refresh of an earlier closing does not show the board of a later closing, which ends with ${second}`, async () => {
    await withSlowRefresh(async ({ boardRegion, caregiverRegion, entry, opener, handle, clock, refresh, focused, write }) => {
      // Closing #1 runs into the bound; the area is opened and closed again.
      const first = handle.close();
      await turn();
      clock.advance(CLOSE_WAIT_MS);
      await first;
      assert.equal(handle.open(), true);
      await handle.settled();
      await write();
      let resolved = false;
      const secondClosing = handle.close();
      void secondClosing.then(() => { resolved = true; });
      await turn();
      assert.equal(refresh.calls, 2);

      // Refresh #1 answers now. It read the store before the second visit: it must not show the board.
      refresh.settle(0);
      await turn();
      assert.equal(boardRegion.hidden, true);
      assert.equal(entry.hidden, true);
      assert.deepEqual(textsIn(caregiverRegion), ["Die Tafel wird geladen."]);
      assert.equal(resolved, false);
      assert.equal(handle.open(), false);

      if (second === "its own refresh") {
        refresh.settle(1);
        await secondClosing;
        assert.equal(boardRegion.hidden, false);
        assert.equal(caregiverRegion.hidden, true);
        assert.deepEqual(caregiverRegion.children, []);
        assert.equal(focused.current, opener);
      } else {
        clock.advance(CLOSE_WAIT_MS);
        await secondClosing;
        assert.equal(boardRegion.hidden, true);
        assert.deepEqual(textsIn(caregiverRegion), [NO_BOARD_YET, "Tafel neu laden"]);
        assert.equal(entry.hidden, false);
      }
    });
  });
}

test("closing: the bound of an earlier closing, firing although it was cancelled, does not end the wait of a later closing", async () => {
  // Timers whose cancellation is ignored; the test fires them by hand.
  const timers = [];
  const setTimer = (callback, milliseconds) => { timers.push({ callback, milliseconds }); return () => undefined; };
  await withSlowRefresh(async ({ boardRegion, caregiverRegion, entry, handle, refresh }) => {
    const first = handle.close();
    await turn();
    const firstBound = timers.findLast((timer) => timer.milliseconds === CLOSE_WAIT_MS);
    refresh.settle(0);
    await first;
    assert.equal(boardRegion.hidden, false);
    assert.equal(handle.open(), true);
    await handle.settled();
    void handle.close();
    await turn();
    firstBound.callback();
    assert.equal(boardRegion.hidden, true);
    assert.equal(entry.hidden, true);
    assert.deepEqual(textsIn(caregiverRegion), ["Die Tafel wird geladen."]);
    assert.equal(handle.open(), false);
  }, { setTimer });
});

// --- The area does not stay open ---

test("auto-close: a hidden page closes the area the way 'Fertig' does, refresh included", async () => {
  await withArea({ seed: createMia }, async ({ holdOpen, add, page, handle, refreshes, boardRegion, caregiverRegion, tiles, opener, focused }) => {
    await holdOpen();
    await add("Pause");
    page.hide();
    assert.equal(handle.isOpen(), false);
    await handle.close();
    assert.equal(refreshes.count, 1);
    assert.equal(boardRegion.hidden, false);
    assert.equal(caregiverRegion.hidden, true);
    assert.deepEqual(caregiverRegion.children, []);
    assert.deepEqual(tiles(), ["Pause"]);
    assert.equal(focused.current, opener);
    // A hidden page with the area closed asks for nothing.
    page.hide();
    assert.equal(refreshes.count, 1);
  });
});

test("auto-close: two minutes without a pointer or key event inside the area close it", async () => {
  await withArea({ seed: createMia }, async ({ holdOpen, handle, clock, refreshes, boardRegion, caregiverRegion }) => {
    assert.equal(IDLE_CLOSE_MS, 120_000);
    await holdOpen();
    clock.advance(IDLE_CLOSE_MS - 1);
    assert.equal(handle.isOpen(), true);
    clock.advance(1);
    assert.equal(handle.isOpen(), false);
    await handle.close();
    assert.equal(refreshes.count, 1);
    assert.equal(boardRegion.hidden, false);
    assert.deepEqual(caregiverRegion.children, []);
  });
});

test("auto-close: a pointer, key or input event inside the area starts the two minutes again", async () => {
  await withArea({ seed: createMia }, async ({ holdOpen, handle, clock, caregiverRegion }) => {
    await holdOpen();
    for (const type of ["pointerdown", "keydown", "input"]) {
      clock.advance(IDLE_CLOSE_MS - 1);
      caregiverRegion.dispatch(type);
      assert.equal(handle.isOpen(), true, type);
    }
    clock.advance(IDLE_CLOSE_MS - 1);
    assert.equal(handle.isOpen(), true);
    clock.advance(1);
    assert.equal(handle.isOpen(), false);
  });
});

test("auto-close: the idle period of an earlier opening touches neither a hold in progress nor the next opening", async () => {
  await withArea({ seed: createMia }, async ({ holdOpen, handle, clock, opener, hint }) => {
    await holdOpen();
    await handle.close();
    // The idle period of that opening would end 1 s from now, in the middle of this hold.
    clock.advance(IDLE_CLOSE_MS - 1000);
    opener.dispatch("pointerdown", { button: 0 });
    clock.advance(1500);
    assert.equal(hint.textContent, "Weiter halten … 2");
    assert.equal(handle.isOpen(), false);
    clock.advance(1500);
    assert.equal(handle.isOpen(), true);
    await handle.settled();
    // And the new opening has its own full two minutes.
    clock.advance(IDLE_CLOSE_MS - 1);
    assert.equal(handle.isOpen(), true);
    clock.advance(1);
    assert.equal(handle.isOpen(), false);
  });
});

// --- Notices ---

const NAME_SHORT = "Wird nur in diesem Browser auf diesem Gerät gespeichert. Ein Vorname oder Spitzname genügt.";
const NAME_NOTICE = "Dies ist eine Testversion. Ein Vorname oder Spitzname genügt; bitte keinen Nachnamen. "
  + "Der Name, die ausgewählten Begriffe, eigene Texte dazu und beigebrachte Gebärden werden nur in diesem Browser auf diesem Gerät gespeichert. "
  + "Von einer Gebärde werden nur Zahlen zu Bewegung und Handform gespeichert, kein Bild und kein Video. "
  + "Ein Video wird nur als Vormachen-Clip gespeichert, den eine Bezugsperson von sich selbst aufnimmt. "
  + "Die App sendet nichts; die Tastatur des Geräts kann Eingaben aber selbst verarbeiten. "
  + "Ein Profil kann hier umbenannt und gelöscht werden; mit „Sicherung speichern“ kommt es mit Passwort in eine Datei, die auf einem anderen Gerät eingespielt werden kann. "
  + "Wer die Website-Daten im Browser löscht, entfernt alle Profile in diesem Browser und die Offline-Kopie der App. "
  + "Der Browser kann diese Daten auch von sich aus löschen.";

test("create: one short line describes the name field, and the full notice is behind 'Was wird gespeichert?'", async () => {
  await withArea({}, async ({ holdOpen, createForm, nameInput }) => {
    await holdOpen();
    const form = createForm();
    // Visible without a tap: the label, the field, the button and one short line.
    const short = form.children.find((child) => child.tagName === "p");
    assert.equal(short.textContent, NAME_SHORT);
    assert.equal(nameInput()["aria-describedby"], short.id);
    assert.deepEqual(form.children.map((child) => child.tagName), ["label", "input", "button", "p", "details"]);
    const details = form.children.at(-1);
    assert.deepEqual(textsIn(details), ["Was wird gespeichert?", NAME_NOTICE]);
    assert.equal(details.children[0].tagName, "summary");
    assert.notEqual(details.open, true);
    // The notice no longer says what is not true any more.
    assert.ok(!/noch nicht umbenennen/.test(NAME_NOTICE));
  });
});

test("create: the name field switches off autocomplete, spell checking, capitalisation and correction", async () => {
  await withArea({}, async ({ holdOpen, nameInput }) => {
    await holdOpen();
    const input = nameInput();
    assert.equal(input.autocomplete, "off");
    assert.equal(input.spellcheck, false);
    assert.equal(input.autocapitalize, "off");
    assert.equal(input.autocorrect, "off");
  });
});

const EDITED_NOT_ACTIVE = "Diese Tafel ist gerade nicht aktiv. Das Kind sieht eine andere Tafel.";
const ACTIVE_EMPTY = "Auf dieser Tafel ist noch kein Begriff, der gezeigt werden kann. Das Kind sieht Beispiele, bis mindestens ein Begriff hinzugefügt ist.";
const NONE_ACTIVE = "Gerade ist keine Tafel aktiv. Das Kind sieht Beispiele, bis eine Tafel als aktive Tafel verwendet wird.";

test("active board: editing a profile that is not the active one is said in a line that stays, also after the next action", async () => {
  const seed = async (store) => {
    const mia = await createMia(store);
    await store.setConceptIds(mia.id, ["hilfe"]);
  };
  await withArea({ seed }, async ({ holdOpen, create, add, act, texts, status, profiles }) => {
    await holdOpen();
    assert.ok(!texts().includes(EDITED_NOT_ACTIVE));
    // A newly created profile is the one being edited, not the active one.
    await create("Ben");
    assert.ok(texts().includes("Tafel von „Ben“ bearbeiten"));
    assert.ok(texts().includes(EDITED_NOT_ACTIVE));
    await add("Mehr");
    assert.equal(status(), "Gespeichert: „Mehr“ ist jetzt auf der Tafel.");
    assert.ok(texts().includes(EDITED_NOT_ACTIVE));
    // Made active, the line goes.
    await act(() => profiles()[0].activate.click());
    assert.ok(!texts().includes(EDITED_NOT_ACTIVE));
  });
});

test("active board: after closing and opening again the edited profile is the active one, not the one picked last time", async () => {
  const seed = async (store) => {
    await createMia(store);
    await store.create("Ben", []);
  };
  await withArea({ seed }, async ({ holdOpen, act, profiles, texts, handle }) => {
    await holdOpen();
    await act(() => profiles()[0].edit.click());
    assert.ok(texts().includes("Tafel von „Ben“ bearbeiten"));
    await handle.close();
    await holdOpen();
    assert.ok(texts().includes("Tafel von „Mia“ bearbeiten"));
    assert.ok(!texts().includes("Tafel von „Ben“ bearbeiten"));
    assert.ok(!texts().includes(EDITED_NOT_ACTIVE));
  });
});

test("active board: with profiles but none active, a line that stays says so, in the list and on the edited profile", async () => {
  const seed = async (store) => { await store.create("Mia", ["hilfe"]); };
  await withArea({ seed }, async ({ holdOpen, texts, act, profiles }) => {
    await holdOpen();
    assert.ok(texts().includes(NONE_ACTIVE));
    assert.ok(texts().includes("Diese Tafel ist gerade nicht aktiv. Das Kind sieht Beispiele."));
    await act(() => profiles()[0].activate.click());
    assert.ok(!texts().includes(NONE_ACTIVE));
    assert.ok(!texts().some((text) => text.startsWith("Diese Tafel ist gerade nicht aktiv.")));
  });
});

test("active board: no such line on a device without profiles", async () => {
  await withArea({}, async ({ holdOpen, texts }) => {
    await holdOpen();
    assert.ok(!texts().includes(NONE_ACTIVE));
  });
});

test("active board: an active profile without a concept says that the child sees examples, until one is added", async () => {
  await withArea({ seed: createMia }, async ({ holdOpen, texts, add, remove }) => {
    await holdOpen();
    assert.ok(texts().includes(ACTIVE_EMPTY));
    await add("Hilfe");
    assert.ok(!texts().includes(ACTIVE_EMPTY));
    await remove("Hilfe");
    assert.ok(texts().includes(ACTIVE_EMPTY));
  });
});

test("active board: the empty-board line is for the active profile only", async () => {
  const seed = async (store) => {
    const mia = await createMia(store);
    await store.setConceptIds(mia.id, ["hilfe"]);
    await store.create("Ben", []);
  };
  await withArea({ seed }, async ({ holdOpen, texts, act, profiles }) => {
    await holdOpen();
    await act(() => profiles()[0].edit.click());
    assert.ok(texts().includes(EDITED_NOT_ACTIVE));
    assert.ok(!texts().includes(ACTIVE_EMPTY));
  });
});

test("concepts: one sentence says that changes are saved at once, that an added concept goes to the end and how to reorder", async () => {
  await withArea({ seed: createMia }, async ({ holdOpen, texts }) => {
    await holdOpen();
    assert.ok(texts().includes("Jede Änderung wird sofort gespeichert. „Hinzufügen“ setzt einen Begriff ans Ende der Tafel. "
      + "Mit „nach oben“ und „nach unten“ änderst du die Reihenfolge."));
  });
});

// --- Small behaviours ---

test("create: a name that is typed but not sent yet survives the redraw after an add, a move and an activation", async () => {
  const seed = async (store) => {
    const mia = await createMia(store);
    await store.setConceptIds(mia.id, ["hilfe", "pause"]);
    await store.create("Ben", []);
  };
  await withArea({ seed }, async ({ holdOpen, add, act, concept, profiles, nameInput }) => {
    await holdOpen();
    nameInput().value = "Cle";
    await add("Mehr");
    assert.equal(nameInput().value, "Cle");
    nameInput().value = "Clem";
    await act(() => concept("Pause").up.click());
    assert.equal(nameInput().value, "Clem");
    nameInput().value = "Clemens";
    await act(() => profiles()[0].activate.click());
    assert.equal(nameInput().value, "Clemens");
  });
});

/** The area on a fake app whose refresh "mounts" what the test says, for the sentences of "Tafel neu laden". */
async function withReload(callback) {
  const fakes = installFakes();
  try {
    const boardRegion = fakes.fakeElement("section");
    boardRegion.dataset.startup = "profile";
    const caregiverRegion = fakes.fakeElement("section");
    const entry = fakes.fakeElement("footer");
    const next = { startup: "profile", fallback: null, hang: false, calls: 0 };
    const app = {
      store: async () => null,
      refreshBoard: () => {
        next.calls += 1;
        if (next.hang) return new Promise(() => undefined);
        boardRegion.dataset.startup = next.startup;
        if (next.fallback === null) delete boardRegion.dataset.boardFallback;
        else boardRegion.dataset.boardFallback = next.fallback;
        return Promise.resolve();
      },
    };
    const clock = fakeClock();
    const handle = mountCaregiver({ app, boardRegion, caregiverRegion, entry, catalogue: CONCEPTS, setTimer: clock.setTimer, onPageHidden: () => undefined, now: alwaysAimed() });
    assert.equal(handle.open(), true);
    await handle.settled();
    await callback({
      next, clock, handle, caregiverRegion,
      status: () => statusOf(caregiverRegion),
      reload: () => buttonNamed(caregiverRegion, "Tafel neu laden").click(),
    });
  } finally {
    fakes.restore();
  }
}

const RELOAD_OUTCOMES = [
  ["the profile's board", "profile", null, "Die Tafel wurde neu geladen."],
  ["the examples of an empty device", "demo-empty", null, "Die Tafel wurde neu geladen."],
  ["the refresh time-out", "refresh-timeout", "refresh-timeout", "Die Tafel konnte gerade nicht neu geladen werden. Bitte versuche es noch einmal."],
  ["storage that cannot be read", "demo-unavailable", "storage-unavailable", "Der Speicher dieses Geräts ist gerade nicht erreichbar. Die Tafel zeigt deshalb Beispiele."],
  ["storage that cannot be read, named by the start-up state alone", "demo-unavailable", null, "Der Speicher dieses Geräts ist gerade nicht erreichbar. Die Tafel zeigt deshalb Beispiele."],
  ["the storage-unavailable fallback under another state", "demo-timeout", "storage-unavailable", "Der Speicher dieses Geräts ist gerade nicht erreichbar. Die Tafel zeigt deshalb Beispiele."],
  ["a board that could not be drawn", "failed", "render-failed", "Die Tafel kann gerade nicht angezeigt werden. Bitte versuche es noch einmal."],
  ["no board at all", "unrenderable", null, "Die Tafel kann gerade nicht angezeigt werden. Bitte versuche es noch einmal."],
];
for (const [what, startup, fallback, sentence] of RELOAD_OUTCOMES) {
  test(`'Tafel neu laden': a refresh that ends with ${what} is answered with its own German sentence`, async () => {
    await withReload(async ({ next, handle, status, reload }) => {
      Object.assign(next, { startup, fallback });
      reload();
      await handle.settled();
      assert.equal(next.calls, 1);
      assert.equal(status(), sentence);
    });
  });
}

test("'Tafel neu laden': a refresh that does not answer within the bound is reported as failed, and later actions are not held up", async () => {
  await withReload(async ({ next, clock, handle, status, reload }) => {
    next.hang = true;
    reload();
    await turn();
    assert.equal(status(), "Die Tafel wird neu geladen.");
    clock.advance(CLOSE_WAIT_MS - 1);
    await turn();
    assert.equal(status(), "Die Tafel wird neu geladen.");
    clock.advance(1);
    await handle.settled();
    assert.equal(status(), "Die Tafel konnte gerade nicht neu geladen werden. Bitte versuche es noch einmal.");
    next.hang = false;
    reload();
    await handle.settled();
    assert.equal(status(), "Die Tafel wurde neu geladen.");
  });
});

test("area: a store that does not answer within the bound is shown as unreachable storage, with 'Fertig' and the opened help", async () => {
  await withSlowRefresh(async ({ caregiverRegion, handle, clock }) => {
    assert.equal(STORE_WAIT_MS, 2500);
    assert.equal(handle.open(), true);
    await turn();
    assert.equal(statusOf(caregiverRegion), "Der Speicher wird gelesen.");
    clock.advance(STORE_WAIT_MS - 1);
    await turn();
    assert.equal(statusOf(caregiverRegion), "Der Speicher wird gelesen.");
    clock.advance(1);
    await handle.settled();
    assert.deepEqual(textsIn(caregiverRegion), NO_STORAGE_TEXTS);
  }, { store: () => new Promise(() => undefined), open: false });
});

test("concepts: a full profile refuses a move as well, with a sentence that is true for a move", async () => {
  const backend = new MemoryBackend();
  const store = await ProfileStore.open(backend, { limits: { maxDataNames: 0 } });
  // A board made without stored wording: the first change wants to store it, and there is no room.
  const mia = await store.create("Mia", ["hilfe", "pause"]);
  await store.setActive(mia.id);
  const app = { store: async () => store, refreshBoard: async () => undefined };
  await withArea({ backend, app }, async ({ holdOpen, act, concept, status }) => {
    await holdOpen();
    await act(() => concept("Pause").up.click());
    assert.equal(status(), "Der Platz für dieses Profil ist voll. Die Änderung wurde nicht gespeichert.");
    assert.deepEqual((await store.get(mia.id)).conceptIds, ["hilfe", "pause"]);
  });
});

// --- Behaviour that had no test ---

test("concepts: actions asked for without waiting are carried out one after another, each built from the stored list", async () => {
  const inner = new MemoryBackend();
  const slow = () => new Promise((resolve) => setImmediate(resolve));
  const boards = [];
  const backend = {
    get: async (key) => { await slow(); return inner.get(key); },
    keys: async (prefix) => { await slow(); return inner.keys(prefix); },
    async write(batch) {
      await slow();
      for (const [key, value] of Object.entries(batch.set ?? {})) if (key.endsWith("/meta")) boards.push(value.conceptIds);
      return inner.write(batch);
    },
  };
  const seedStore = await ProfileStore.open(inner);
  const mia = await createMia(seedStore);
  await withArea({ backend }, async ({ holdOpen, concept, handle, store, tiles }) => {
    await holdOpen();
    boards.length = 0;
    // Three adds and a move at once, as fast fingers do: none waits for the one before.
    for (const name of ["Pause", "Hilfe", "Fertig"]) concept(name).add.click();
    await handle.settled();
    assert.deepEqual(boards, [["pause"], ["pause", "hilfe"], ["pause", "hilfe", "fertig"]]);
    concept("Fertig").up.click();
    concept("Mehr").add.click();
    await handle.settled();
    assert.deepEqual((await (await store()).get(mia.id)).conceptIds, ["pause", "fertig", "hilfe", "mehr"]);
    await handle.close();
    assert.deepEqual(tiles(), ["Pause", "Fertig", "Hilfe", "Mehr"]);
  });
});

test("opening control: a key-down that is only a repeat does not start a hold (Enter still held on 'Fertig' when focus comes back)", async () => {
  await withArea({}, async ({ opener, hint, progress, clock, handle }) => {
    for (const key of ["Enter", " "]) {
      let prevented = 0;
      opener.dispatch("keydown", { key, repeat: true, preventDefault() { prevented += 1; } });
      assert.equal(prevented, 1);
      assert.equal(hint.textContent, "");
      assert.equal(progress.hidden, true);
      clock.advance(HOLD_DURATION_MS);
      assert.equal(handle.isOpen(), false);
      assert.equal(clock.waiting(), 0);
    }
  });
});

test("opening control: its line is a polite live region, and a long press does not bring up the context menu", async () => {
  await withArea({}, async ({ opener, hint, progress }) => {
    assert.equal(hint.role, "status");
    assert.equal(hint["aria-live"], "polite");
    assert.equal(progress["aria-hidden"], "true");
    let prevented = 0;
    opener.dispatch("contextmenu", { preventDefault() { prevented += 1; } });
    assert.equal(prevented, 1);
  });
});

test("concepts: a board that already has the most concepts a profile may hold refuses one more in German and writes nothing", async () => {
  const seed = async (store) => {
    const mia = await store.create("Mia", Array.from({ length: 500 }, (unused, index) => `voll-${index}`));
    await store.setActive(mia.id);
    return mia;
  };
  await withArea({ seed }, async ({ holdOpen, add, status, backend, seeded, concept }) => {
    await holdOpen();
    const before = JSON.stringify(backend.snapshot());
    await add("Hilfe");
    assert.equal(status(), "Auf eine Tafel passen höchstens 500 Begriffe. Es wurde nichts geändert.");
    assert.equal(JSON.stringify(backend.snapshot()), before, "also no wording was stored for the refused concept");
    assert.equal(concept("Hilfe").onBoard, false);
    assert.equal(seeded.conceptIds.length, 500);
  });
});

test("area: the message of an action from an earlier opening is not shown in the next opening", async () => {
  const inner = new MemoryBackend();
  let release = null;
  let holdWrites = false;
  const backend = {
    get: (key) => inner.get(key),
    keys: (prefix) => inner.keys(prefix),
    async write(batch) {
      if (holdWrites) await new Promise((resolve) => { release = resolve; });
      return inner.write(batch);
    },
  };
  const store = await ProfileStore.open(backend);
  const mia = await createMia(store);
  const app = { store: async () => store, refreshBoard: async () => undefined };
  await withArea({ backend, app }, async ({ holdOpen, concept, handle, clock, caregiverRegion }) => {
    await holdOpen();
    // An add whose write hangs; the area is closed, runs into the bound, and is opened again.
    holdWrites = true;
    concept("Hilfe").add.click();
    await turn();
    const closing = handle.close();
    clock.advance(CLOSE_WAIT_MS);
    await closing;
    assert.equal(handle.open(), true);
    // Everything the new status line is ever told.
    const said = [];
    const status = statusElement(caregiverRegion);
    Object.defineProperty(status, "textContent", { get: () => said.at(-1) ?? "", set: (text) => { said.push(text); } });
    holdWrites = false;
    while (release !== null) {
      const go = release;
      release = null;
      go();
      await turn();
    }
    await handle.settled();
    assert.deepEqual((await store.get(mia.id)).conceptIds, ["hilfe"], "the action itself was carried out");
    assert.deepEqual(said.filter((text) => text !== ""), []);
    assert.equal(concept("Hilfe").onBoard, true);
  });
});

// --- When the state without a board applies ---

/** Closes, lets the bound pass without an answer of the refresh, and waits for close() to resolve. */
async function closeIntoBound({ handle, clock }) {
  const closing = handle.close();
  await turn();
  clock.advance(CLOSE_WAIT_MS);
  await closing;
}
const boardIsBack = ({ boardRegion, caregiverRegion, entry, opener, focused }) => {
  assert.equal(boardRegion.hidden, false);
  assert.equal(caregiverRegion.hidden, true);
  assert.deepEqual(caregiverRegion.children, []);
  assert.equal(entry.hidden, false);
  assert.equal(focused.current, opener);
};
const noBoard = ({ boardRegion, caregiverRegion, entry }) => {
  assert.equal(boardRegion.hidden, true);
  assert.deepEqual(textsIn(caregiverRegion), [NO_BOARD_YET, "Tafel neu laden"]);
  assert.equal(entry.hidden, false);
};

test("no-board state: storage that never answers at start-up, a hold and the idle close end on the examples board with a usable opening control", async () => {
  await withArea({ openBackend: () => new Promise(() => undefined), waitForStart: false }, async (area) => {
    const { opener, clock, handle, boardRegion, appTimers, tiles, refreshes } = area;
    for (const timer of appTimers) timer();
    assert.equal(boardRegion.dataset.startup, "demo-timeout");
    opener.dispatch("pointerdown", { button: 0 });
    clock.advance(HOLD_DURATION_MS);
    opener.dispatch("pointerup");
    assert.equal(handle.isOpen(), true);
    // The area waits for the store, gives up at its bound, and is then left alone.
    await turn();
    clock.advance(STORE_WAIT_MS);
    await handle.settled();
    clock.advance(IDLE_CLOSE_MS - STORE_WAIT_MS);
    assert.equal(handle.isOpen(), false);
    await turn();
    // The refresh queues behind a start-up that never finishes, so the bound decides.
    assert.equal(refreshes.count, 1);
    assert.equal(boardRegion.hidden, true);
    clock.advance(CLOSE_WAIT_MS);
    await handle.close();
    boardIsBack(area);
    assert.deepEqual(tiles(), CONCEPTS.map((concept) => concept.labelDe));
    // And the way in works again.
    opener.dispatch("pointerdown", { button: 0 });
    clock.advance(HOLD_DURATION_MS);
    assert.equal(handle.isOpen(), true);
  });
});

test("no-board state: without storage nothing can have changed, so the bound shows the mounted board", async () => {
  await withSlowRefresh(async (area) => {
    await closeIntoBound(area);
    boardIsBack(area);
  }, { store: async () => null });
});

test("no-board state: an opening in which nothing was written shows the previous board at the bound", async () => {
  await withSlowRefresh(async (area) => {
    // Looking around is not writing: another profile is picked for editing, nothing is saved.
    buttonsIn(area.caregiverRegion).filter((element) => element.textContent === "Tafel bearbeiten")[0].click();
    await area.handle.settled();
    await closeIntoBound(area);
    boardIsBack(area);
    assert.deepEqual(textsIn(area.boardRegion), ["Alte Tafel"]);
  }, { write: false });
});

test("no-board state: after another profile was made the active board, a refresh that hangs leaves no board, a line and the button", async () => {
  await withSlowRefresh(async (area) => {
    await closeIntoBound(area);
    noBoard(area);
  });
});

for (const [what, change] of [
  ["a concept was added", (region) => buttonNamed(region, "Hinzufügen").click()],
  ["a profile was created", (region) => {
    tree(region).find((element) => element.tagName === "input" && element.type === "text").value = "Cleo";
    tree(region).find((element) => element.tagName === "form").dispatch("submit");
  }],
  ["a profile was renamed", async (region, handle) => {
    buttonNamed(region, "Umbenennen").click();
    await handle.settled();
    tree(region).find((element) => element.id === "caregiver-rename-name").value = "Benno";
    byClass(region, "caregiver-rename").dispatch("submit");
  }],
  ["a profile that is not the active one was deleted", async (region, handle, clock) => {
    buttonNamed(region, "Löschen").click();
    await handle.settled();
    typeDeleteName(region);
    buttonNamed(region, "Endgültig löschen").dispatch("pointerdown", { button: 0 });
    clock.advance(DELETE_HOLD_MS);
    buttonNamed(region, "Endgültig löschen").dispatch("pointerup");
  }],
]) {
  test(`no-board state: after ${what}, a refresh that hangs leaves no board`, async () => {
    await withSlowRefresh(async (area) => {
      await change(area.caregiverRegion, area.handle, area.clock);
      await area.handle.settled();
      assert.match(area.status(), /^Gespeichert|wurde angelegt|heißt jetzt „Benno“|„Ben“ wurde gelöscht/);
      await closeIntoBound(area);
      noBoard(area);
    }, { write: false });
  });
}

for (const [what, mount] of [
  ["a fallback cause", (region) => { region.dataset.boardFallback = "no-active"; }],
  ["a demo start-up state", (region) => { region.dataset.startup = "demo-empty"; }],
]) {
  test(`no-board state: a board of examples (${what}) is shown at the bound also after a write`, async () => {
    await withSlowRefresh(async (area) => {
      mount(area.boardRegion);
      await closeIntoBound(area);
      boardIsBack(area);
    });
  });
}

test("no-board state: a write that failed does not count", async () => {
  const backend = new MemoryBackend();
  const store = await ProfileStore.open(backend);
  await createMia(store);
  await store.create("Ben", []);
  await withSlowRefresh(async (area) => {
    backend.failWrite(1);
    await area.write();
    assert.equal(area.status(), "Das konnte gerade nicht gespeichert werden. Bitte versuche es noch einmal.");
    await closeIntoBound(area);
    boardIsBack(area);
  }, { store: async () => store, write: false });
});

test("no-board state: a write that is still running when the bound passes counts as possibly done", async () => {
  const inner = new MemoryBackend();
  let holdWrites = false;
  const backend = {
    get: (key) => inner.get(key),
    keys: (prefix) => inner.keys(prefix),
    async write(batch) {
      if (holdWrites) await new Promise(() => undefined);
      return inner.write(batch);
    },
  };
  const store = await ProfileStore.open(backend);
  await createMia(store);
  await store.create("Ben", []);
  await withSlowRefresh(async (area) => {
    holdWrites = true;
    buttonNamed(area.caregiverRegion, "Als aktive Tafel verwenden").click();
    await turn();
    await closeIntoBound(area);
    noBoard(area);
    assert.equal(area.refresh.calls, 0, "the refresh waits behind the write");
  }, { store: async () => store, write: false });
});

test("no-board state: it lasts across an opening without a write, until a refresh has answered", async () => {
  await withSlowRefresh(async (area) => {
    const { handle, refresh } = area;
    await closeIntoBound(area);
    noBoard(area);
    // Opened and closed again without a change: the mounted board is still the one from before the write.
    assert.equal(handle.open(), true);
    await handle.settled();
    await closeIntoBound(area);
    noBoard(area);
    // A refresh that was asked for after the write answers: from now on the mounted board is current.
    refresh.settle(1);
    await turn();
    boardIsBack(area);
    assert.equal(handle.open(), true);
    await handle.settled();
    await closeIntoBound(area);
    boardIsBack(area);
  });
});

test("'Tafel neu laden' in the state without a board: the bound of a first attempt does not put the line back while a second attempt still waits", async () => {
  await withSlowRefresh(async (area) => {
    const { caregiverRegion, clock, boardRegion } = area;
    await closeIntoBound(area);
    const retry = buttonNamed(caregiverRegion, "Tafel neu laden");
    const line = () => caregiverRegion.children[0].textContent;
    retry.click();
    clock.advance(1000);
    retry.click();
    // The first attempt's bound passes here; the second one has a second left.
    clock.advance(CLOSE_WAIT_MS - 1000);
    await turn();
    assert.equal(line(), "Die Tafel wird geladen.");
    clock.advance(1000);
    await turn();
    assert.equal(line(), NO_BOARD_YET);
    assert.equal(boardRegion.hidden, true);
  });
});

test("auto-close: the idle timer of an earlier opening, firing although it was cancelled, does not close the next opening", async () => {
  const timers = [];
  const setTimer = (callback, milliseconds) => { timers.push({ callback, milliseconds }); return () => undefined; };
  await withSlowRefresh(async ({ handle, refresh, caregiverRegion }) => {
    const firstIdle = timers.find((timer) => timer.milliseconds === IDLE_CLOSE_MS);
    const closing = handle.close();
    await turn();
    refresh.settle(0);
    await closing;
    assert.equal(handle.open(), true);
    await handle.settled();
    firstIdle.callback();
    assert.equal(handle.isOpen(), true);
    assert.equal(headingOf(caregiverRegion).textContent, "Für Bezugspersonen");
    // The idle timer of this opening does close it.
    timers.findLast((timer) => timer.milliseconds === IDLE_CLOSE_MS).callback();
    assert.equal(handle.isOpen(), false);
  }, { setTimer });
});

// --- Precision ---

test("active board: while the active profile has nothing to show, the line on another edited profile says that the child sees examples", async () => {
  const seed = async (store) => {
    await createMia(store);
    await store.create("Ben", ["hilfe"]);
  };
  await withArea({ seed }, async ({ holdOpen, act, profiles, texts, add }) => {
    await holdOpen();
    await act(() => profiles()[0].edit.click());
    assert.ok(texts().includes("Tafel von „Ben“ bearbeiten"));
    assert.ok(texts().includes("Diese Tafel ist gerade nicht aktiv. Das Kind sieht Beispiele."));
    assert.ok(!texts().includes(EDITED_NOT_ACTIVE));
    // Once the active profile has a concept, the child sees that board.
    await act(() => profiles()[1].edit.click());
    await add("Pause");
    await act(() => profiles()[0].edit.click());
    assert.ok(texts().includes(EDITED_NOT_ACTIVE));
  });
});

test("create: the profile gets the name as it was when the form was sent, not what the field holds when its turn comes", async () => {
  const inner = new MemoryBackend();
  const slow = () => new Promise((resolve) => setImmediate(resolve));
  const backend = {
    get: async (key) => { await slow(); return inner.get(key); },
    keys: async (prefix) => { await slow(); return inner.keys(prefix); },
    write: async (batch) => { await slow(); return inner.write(batch); },
  };
  const seedStore = await ProfileStore.open(inner);
  await createMia(seedStore);
  await withArea({ backend }, async ({ holdOpen, concept, nameInput, caregiverRegion, handle, profiles }) => {
    await holdOpen();
    // An add is under way; the form is sent behind it and the caregiver types on.
    concept("Hilfe").add.click();
    const field = nameInput();
    field.value = "Ben";
    byClass(caregiverRegion, "caregiver-create").dispatch("submit");
    field.value = "Benjamin Blümchen";
    await handle.settled();
    assert.deepEqual(profiles().map((profile) => profile.name), ["Ben", "Mia"]);
  });
});

test("'Tafel neu laden': after a read that failed, a reload that works draws the area from the store again", async () => {
  const inner = new MemoryBackend();
  let failing = false;
  const backend = {
    get: async (key) => { if (failing) throw new Error("read failed"); return inner.get(key); },
    keys: async (prefix) => { if (failing) throw new Error("read failed"); return inner.keys(prefix); },
    write: (batch) => inner.write(batch),
  };
  const seedStore = await ProfileStore.open(inner);
  await createMia(seedStore);
  await withArea({ backend }, async ({ holdOpen, act, button, texts, status, profiles }) => {
    failing = true;
    await holdOpen();
    const unread = "Die gespeicherten Profile können gerade nicht gelesen werden. Deshalb kann hier im Moment nichts geändert werden.";
    assert.ok(texts().includes(unread));
    failing = false;
    await act(() => button("Tafel neu laden").click());
    assert.equal(status(), "Die Tafel wurde neu geladen.");
    assert.ok(!texts().includes(unread));
    assert.deepEqual(profiles().map((profile) => profile.name), ["Mia"]);
  });
});

test("profiles: with damaged entries only, the area does not say that there is no profile yet", async () => {
  const seed = async (store, backend) => {
    await backend.write({ set: { [`profile/${"a".repeat(32)}/meta`]: "kaputt" } });
  };
  await withArea({ seed }, async ({ holdOpen, texts }) => {
    await holdOpen();
    assert.ok(texts().includes("Ein gespeichertes Profil kann in dieser Version nicht gelesen werden. Es bleibt unverändert gespeichert. Eine spätere Version hilft dabei."));
    assert.ok(texts().includes("Kein gespeichertes Profil kann in dieser Version gelesen werden. Das Kind sieht Beispiele."));
    assert.ok(!texts().includes("Auf diesem Gerät gibt es noch kein Profil."));
  });
});

// --- The header that stays (card NG-31) ---

const AFTER_NONE = "Nach dem Schließen: Beispiele – es ist keine Tafel aktiv.";
const AFTER_EMPTY = "Nach dem Schließen: Beispiele – die aktive Tafel hat noch keinen Begriff.";
const WRITE_FAILED = "Das konnte gerade nicht gespeichert werden. Bitte versuche es noch einmal.";
const PROFILE_GONE = "Dieses Profil kann nicht gelesen werden oder ist nicht mehr gespeichert.";

/** Mia (active, board: Hilfe) and Ben (board: Pause). */
const seedMiaAndBen = async (store) => {
  const mia = await createMia(store);
  await store.setConceptIds(mia.id, ["hilfe"]);
  const ben = await store.create("Ben", ["pause"]);
  return { mia, ben };
};

test("header: the title, the line about the board after closing and 'Fertig' are one block at the top, with the status line directly under them", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, caregiverRegion, afterClose }) => {
    await holdOpen();
    assert.deepEqual(caregiverRegion.children.map((child) => child.className), ["caregiver-top", "caregiver-body", "caregiver-details caregiver-help"]);
    const [top] = caregiverRegion.children;
    assert.deepEqual(top.children.map((child) => [child.tagName, child.className]), [["header", "caregiver-header"], ["p", "caregiver-status"], ["div", "caregiver-undo"]]);
    const [header, status, undoBar] = top.children;
    assert.deepEqual(textsIn(header), ["Für Bezugspersonen", "Nach dem Schließen: Tafel von „Mia“", "Fertig"]);
    assert.equal(afterClose(), "Nach dem Schließen: Tafel von „Mia“");
    assert.equal(status.role, "status");
    assert.equal(undoBar.hidden, true);
    // "Schließen" at the bottom is gone; "Fertig" is the one way out by button.
    assert.equal(buttonNamed(caregiverRegion, "Schließen"), undefined);
    assert.ok(hasClass(buttonNamed(header, "Fertig"), "caregiver-primary"));
  });
});

test("header: without a profile, and with profiles of which none is active, it says examples and why", async () => {
  await withArea({}, async ({ holdOpen, afterClose, create, act, profiles }) => {
    await holdOpen();
    assert.equal(afterClose(), AFTER_NONE);
    // The first profile becomes active, but has nothing to show yet.
    await create("Mia");
    assert.equal(afterClose(), AFTER_EMPTY);
  });
  await withArea({ seed: async (store) => { await store.create("Mia", ["hilfe"]); } }, async ({ holdOpen, afterClose, act, profiles }) => {
    await holdOpen();
    assert.equal(afterClose(), AFTER_NONE);
    await act(() => profiles()[0].activate.click());
    assert.equal(afterClose(), "Nach dem Schließen: Tafel von „Mia“");
  });
});

test("header: it follows every action, and what it says is what the board shows after closing", async () => {
  await withArea({ seed: createMia }, async ({ holdOpen, takeBack, afterClose, add, remove, rename, handle, boardRegion, tiles, undo, act }) => {
    await holdOpen();
    assert.equal(afterClose(), AFTER_EMPTY);
    await add("Hilfe");
    assert.equal(afterClose(), "Nach dem Schließen: Tafel von „Mia“");
    await remove("Hilfe");
    assert.equal(afterClose(), AFTER_EMPTY);
    await takeBack();
    assert.equal(afterClose(), "Nach dem Schließen: Tafel von „Mia“");
    await rename("Mia", "Mia L");
    assert.equal(afterClose(), "Nach dem Schließen: Tafel von „Mia L“");
    await handle.close();
    assert.equal(boardRegion.dataset.startup, "profile");
    assert.equal(boardRegion.dataset.boardFallback, undefined);
    assert.deepEqual(tiles(), ["Hilfe"]);
  });
  // The other way round: the header says examples, and examples it is.
  await withArea({ seed: createMia }, async ({ holdOpen, takeBack, afterClose, handle, boardRegion }) => {
    await holdOpen();
    assert.equal(afterClose(), AFTER_EMPTY);
    await handle.close();
    assert.equal(boardRegion.dataset.boardFallback, "empty-profile");
  });
});

test("header: an active board whose ids all cannot be shown counts as a board without a concept", async () => {
  const seed = async (store) => {
    const mia = await store.create("Mia", ["geist"]);
    await store.setActive(mia.id);
  };
  await withArea({ seed }, async ({ holdOpen, afterClose }) => {
    await holdOpen();
    assert.equal(afterClose(), AFTER_EMPTY);
  });
});

// --- Leaving: "Fertig" and Escape ---

test("leaving: Escape closes the area the way 'Fertig' does; another key does not", async () => {
  await withArea({ seed: seedMiaAndBen }, async (area) => {
    const { holdOpen, key, handle, refreshes, boardRegion, caregiverRegion, opener, focused, tiles } = area;
    await holdOpen();
    assert.equal(key("Enter"), 0);
    assert.equal(key("Esc"), 0);
    assert.equal(handle.isOpen(), true);
    assert.equal(key("Escape"), 1);
    assert.equal(handle.isOpen(), false);
    await handle.close();
    assert.equal(refreshes.count, 1);
    assert.equal(boardRegion.hidden, false);
    assert.deepEqual(caregiverRegion.children, []);
    assert.equal(focused.current, opener);
    assert.deepEqual(tiles(), ["Hilfe"]);
    // With the area closed Escape does nothing.
    assert.equal(key("Escape"), 0);
    assert.equal(refreshes.count, 1);
  });
});

for (const [what, open, opened, back] of [
  ["a delete confirmation", (card) => card.remove, (area) => area.button("Endgültig löschen") !== undefined, (card) => card.remove],
  ["a rename field", (card) => card.rename, (area) => area.renameInput() !== null, (card) => card.rename],
]) {
  test(`leaving: with ${what} open, Escape cancels that first and closes the area only the second time`, async () => {
    await withArea({ seed: seedMiaAndBen }, async (area) => {
      const { holdOpen, act, key, handle, profile, focused, backend } = area;
      await holdOpen();
      const before = JSON.stringify(backend.snapshot());
      await act(() => open(profile("Ben")).click());
      assert.equal(opened(area), true);
      await act(() => { assert.equal(key("Escape"), 1); });
      assert.equal(handle.isOpen(), true);
      assert.equal(opened(area), false);
      assert.equal(focused.current, back(profile("Ben")));
      assert.equal(JSON.stringify(backend.snapshot()), before);
      key("Escape");
      assert.equal(handle.isOpen(), false);
    });
  });
}

test("leaving: Escape in the state without a board does nothing", async () => {
  await withSlowRefresh(async (area) => {
    await closeIntoBound(area);
    noBoard(area);
    area.caregiverRegion.dispatch("keydown", { key: "Escape" });
    await turn();
    noBoard(area);
    assert.equal(area.refresh.calls, 1);
  });
});

// --- Profile cards ---

test("profiles: each card has its name, the badge on the active one, and its actions as buttons named for the profile", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, profiles }) => {
    await holdOpen();
    const [ben, mia] = profiles();
    assert.deepEqual(buttonsIn(ben.item).map((element) => element.textContent), ["Als aktive Tafel verwenden", "Tafel bearbeiten", "Umbenennen", "Sicherung speichern", "Löschen"]);
    assert.deepEqual(buttonsIn(mia.item).map((element) => element.textContent), ["Tafel bearbeiten", "Umbenennen", "Sicherung speichern", "Löschen"]);
    assert.deepEqual([ben.active, mia.active], [false, true]);
    assert.deepEqual(buttonsIn(ben.item).map((element) => element["aria-label"]), ["Als aktive Tafel verwenden: Ben", "Tafel bearbeiten: Ben", "Umbenennen: Ben", "Sicherung speichern: Ben", "Löschen: Ben"]);
    // "Löschen" does not look like the primary button.
    assert.ok(hasClass(ben.remove, "caregiver-danger-quiet"));
    assert.ok(!hasClass(ben.remove, "caregiver-primary"));
  });
});

// --- Rename ---

test("rename: the name becomes a labelled field with 'Speichern' and 'Abbrechen'; saving goes through the store and the area shows the stored name", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, act, profile, profiles, renameInput, caregiverRegion, focused, status, store, seeded, texts, afterClose }) => {
    await holdOpen();
    await act(() => profile("Mia").rename.click());
    const input = renameInput();
    assert.equal(focused.current, input);
    assert.equal(input.value, "Mia");
    const form = byClass(caregiverRegion, "caregiver-rename");
    const label = form.children.find((child) => child.tagName === "label");
    assert.equal(label.textContent, "Neuer Name für „Mia“");
    assert.equal(label.htmlFor, input.id);
    assert.deepEqual(buttonsIn(form).map((element) => [element.textContent, element.type]), [["Speichern", "submit"], ["Abbrechen", "button"]]);
    // The same care as for the create field: nothing typed here goes to a spelling service.
    assert.deepEqual([input.autocomplete, input.spellcheck, input.autocapitalize, input.autocorrect], ["off", false, "off", "off"]);
    // While it is open the card has no other action, and nothing is written yet.
    assert.deepEqual(buttonsIn(profiles()[1].item).map((element) => element.textContent), ["Speichern", "Abbrechen"]);
    assert.equal((await (await store()).get(seeded.mia.id)).displayName, "Mia");

    input.value = "  Mia L ";
    await act(() => form.dispatch("submit"));
    assert.equal(status(), "Das Profil heißt jetzt „Mia L“.");
    assert.equal((await (await store()).get(seeded.mia.id)).displayName, "Mia L");
    assert.deepEqual(profiles().map((card) => [card.name, card.active]), [["Ben", false], ["Mia L", true]]);
    assert.equal(renameInput(), null);
    assert.ok(texts().includes("Tafel von „Mia L“ bearbeiten"));
    assert.equal(afterClose(), "Nach dem Schließen: Tafel von „Mia L“");
    assert.equal(focused.current, profile("Mia L").rename);
    // Renaming changes neither the board nor which one is active.
    assert.deepEqual((await (await store()).get(seeded.mia.id)).conceptIds, ["hilfe"]);
    assert.equal(await (await store()).getActive(), seeded.mia.id);
  });
});

for (const [what, input, sentence] of NAME_REFUSALS) {
  test(`rename: ${what} is refused by the store with the same German sentence as for create`, async () => {
    await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, rename, status, backend, renameInput, texts, focused, profiles }) => {
      await holdOpen();
      const before = JSON.stringify(backend.snapshot());
      await rename("Ben", input);
      assert.equal(status(), sentence);
      assert.equal(JSON.stringify(backend.snapshot()), before);
      // The field stays open with what was typed, and has the focus; nothing says that it was saved.
      assert.equal(renameInput().value, input);
      assert.equal(focused.current, renameInput());
      assert.ok(texts().includes("Neuer Name für „Ben“"));
      assert.ok(!texts().some((text) => /heißt jetzt|displayName|Error|must|characters/.test(text)));
      assert.deepEqual(profiles().map((card) => card.name), [null, "Mia"]);
    });
  });
}

test("rename: a failed write shows the German error, keeps the stored name and the typed text, and a second try works", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, act, status, backend, renameInput, caregiverRegion, store, seeded, texts, profiles }) => {
    await holdOpen();
    await act(() => profiles()[0].rename.click());
    backend.failWrite(1);
    renameInput().value = "Benno";
    await act(() => byClass(caregiverRegion, "caregiver-rename").dispatch("submit"));
    assert.equal(status(), WRITE_FAILED);
    assert.equal((await (await store()).get(seeded.ben.id)).displayName, "Ben");
    assert.equal(renameInput().value, "Benno");
    // Nothing on screen claims the new name: the label still names the stored one, and no card is called "Benno".
    assert.ok(texts().includes("Neuer Name für „Ben“"));
    assert.ok(!profiles().some((card) => card.name === "Benno"));
    await act(() => byClass(caregiverRegion, "caregiver-rename").dispatch("submit"));
    assert.equal(status(), "Das Profil heißt jetzt „Benno“.");
    assert.deepEqual(profiles().map((card) => card.name), ["Benno", "Mia"]);
  });
});

test("rename: 'Abbrechen' puts the card back, writes nothing and returns focus to 'Umbenennen'", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, act, profile, renameInput, button, backend, focused, profiles, status }) => {
    await holdOpen();
    const before = JSON.stringify(backend.snapshot());
    await act(() => profile("Ben").rename.click());
    renameInput().value = "Benno";
    await act(() => button("Abbrechen").click());
    assert.equal(renameInput(), null);
    assert.deepEqual(profiles().map((card) => card.name), ["Ben", "Mia"]);
    assert.equal(JSON.stringify(backend.snapshot()), before);
    assert.equal(focused.current, profile("Ben").rename);
    assert.equal(status(), "");
    // Opened again, the field starts from the stored name, not from what was typed and cancelled.
    await act(() => profile("Ben").rename.click());
    assert.equal(renameInput().value, "Ben");
  });
});

test("rename: a profile that was removed meanwhile is answered in German and leaves the list", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, act, profile, renameInput, caregiverRegion, status, store, seeded, profiles }) => {
    await holdOpen();
    await act(() => profile("Ben").rename.click());
    await (await store()).remove(seeded.ben.id);
    renameInput().value = "Benno";
    await act(() => byClass(caregiverRegion, "caregiver-rename").dispatch("submit"));
    assert.equal(status(), PROFILE_GONE);
    assert.deepEqual(profiles().map((card) => card.name), ["Mia"]);
    assert.equal(renameInput(), null);
  });
});

test("rename: the profile gets the name as it was when the form was sent, also when it waits behind another action", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, act, profile, renameInput, caregiverRegion, concept, handle, profiles }) => {
    await holdOpen();
    await act(() => profile("Mia").rename.click());
    const field = renameInput();
    field.value = "Mia L";
    byClass(caregiverRegion, "caregiver-rename").dispatch("submit");
    field.value = "Mia Langname";
    await handle.settled();
    assert.deepEqual(profiles().map((card) => card.name), ["Ben", "Mia L"]);
    assert.ok(concept("Hilfe").onBoard);
  });
});

// --- Delete ---

const DELETE_LOSS = "Alle ausgewählten Begriffe und beigebrachten Gebärden dieses Profils gehen verloren, außer sie stehen in einer Sicherung.";
const DELETE_ACTIVE = "Das Kind sieht danach Beispiele, bis eine andere Tafel aktiv ist.";
const DELETE_HOLD_HINT = "Zum Löschen 2 Sekunden gedrückt halten.";
const PLEASE_WAIT = "Bitte kurz warten.";

test("delete: 'Löschen' deletes nothing; the confirmation takes over the body: the name, what is lost, 'Abbrechen' first, and nothing else to press", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, act, profile, profiles, confirmation, backend, focused, button, caregiverRegion, nameInput, concepts }) => {
    await holdOpen();
    const before = JSON.stringify(backend.snapshot());
    await act(() => profile("Ben").remove.click());
    assert.equal(JSON.stringify(backend.snapshot()), before);
    const shown = confirmation();
    // Not the active profile: no sentence about what the child sees.
    // "Abbrechen" comes first; below "Endgültig löschen" is only its own line.
    assert.deepEqual(shown.texts, ["Profil „Ben“ löschen?", DELETE_LOSS, DELETE_NAME("Ben"), "Abbrechen", "Endgültig löschen", DELETE_HOLD_HINT]);
    // The name field has the focus (owner decision on card NG-13).
    assert.equal(focused.current.id, "caregiver-delete-name");
    assert.ok(hasClass(button("Endgültig löschen"), "caregiver-danger"));
    assert.ok(!hasClass(button("Endgültig löschen"), "caregiver-primary"));
    // It is the whole body: no card, no editor, no form, no help to hit by mistake, and nothing that a redraw could put under a finger.
    const body = byClass(caregiverRegion, "caregiver-body");
    assert.deepEqual(body.children, [shown.view]);
    assert.deepEqual(profiles(), []);
    assert.deepEqual(concepts(), []);
    assert.equal(nameInput(), undefined);
    assert.equal(byClass(caregiverRegion, "caregiver-help").hidden, true);
    assert.deepEqual(controlsIn(body).map((element) => element.textContent || element.id), ["caregiver-delete-name", "Abbrechen", "Endgültig löschen"]);
    // Part of the page, not a dialog element.
    assert.deepEqual(tree(caregiverRegion).filter((element) => element.tagName === "dialog"), []);
  });
});

test("delete: the confirmation for the active profile also says what the child sees afterwards", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, act, profile, confirmation }) => {
    await holdOpen();
    await act(() => profile("Mia").remove.click());
    assert.deepEqual(confirmation().texts, ["Profil „Mia“ löschen?", DELETE_LOSS, DELETE_ACTIVE, DELETE_NAME("Mia"), "Abbrechen", "Endgültig löschen", DELETE_HOLD_HINT]);
  });
});

test("delete: 'Abbrechen' brings the normal body back, with the help section and with what was typed into the create field", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, act, profile, profiles, confirmation, button, nameInput, caregiverRegion, focused, concept }) => {
    await holdOpen();
    nameInput().value = "Cle";
    await act(() => profile("Ben").remove.click());
    assert.notEqual(confirmation(), null);
    await act(() => button("Abbrechen").click());
    assert.equal(confirmation(), null);
    assert.deepEqual(profiles().map((card) => card.name), ["Ben", "Mia"]);
    assert.equal(focused.current, profile("Ben").remove);
    assert.equal(byClass(caregiverRegion, "caregiver-help").hidden, false);
    assert.equal(nameInput().value, "Cle");
    assert.ok(concept("Hilfe").onBoard);
  });
});

test("delete: 'Abbrechen' puts the card back, deletes nothing and returns focus to 'Löschen'", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, act, profile, profiles, backend, focused, button }) => {
    await holdOpen();
    const before = JSON.stringify(backend.snapshot());
    await act(() => profile("Ben").remove.click());
    await act(() => button("Abbrechen").click());
    assert.deepEqual(profiles().map((card) => [card.name, card.confirming]), [["Ben", false], ["Mia", false]]);
    assert.equal(JSON.stringify(backend.snapshot()), before);
    assert.equal(focused.current, profile("Ben").remove);
  });
});

test("delete: confirming removes a profile that is not the active one with everything stored for it; the active board stays", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, confirmDelete, act, profile, profiles, backend, button, status, store, seeded, afterClose, focused, caregiverRegion, handle, tiles }) => {
    await holdOpen();
    await (await store()).data(seeded.ben.id).set("concept.pause", { version: 1, labelDe: "Pause", speechDe: "Kurz ausruhen.", });
    await act(() => profile("Ben").remove.click());
    await confirmDelete();
    assert.equal(status(), "Das Profil „Ben“ wurde gelöscht.");
    assert.deepEqual(profiles().map((card) => [card.name, card.active]), [["Mia", true]]);
    assert.deepEqual(Object.keys(backend.snapshot()).filter((storageKey) => storageKey.includes(seeded.ben.id)), []);
    assert.equal(await (await store()).getActive(), seeded.mia.id);
    assert.equal(afterClose(), "Nach dem Schließen: Tafel von „Mia“");
    // The pressed button is gone with the card; focus is on the heading of the list.
    const heading = tree(caregiverRegion).find((element) => element.tagName === "h2" && element.textContent === "Profile");
    assert.equal(focused.current, heading);
    await handle.close();
    assert.deepEqual(tiles(), ["Hilfe"]);
  });
});

test("delete: after deleting the active profile nothing is made active; the area and the board say examples", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, confirmDelete, act, profile, profiles, button, status, store, seeded, afterClose, texts, handle, boardRegion, tiles }) => {
    assert.deepEqual(tiles(), ["Hilfe"]);
    await holdOpen();
    await act(() => profile("Mia").remove.click());
    await confirmDelete();
    assert.equal(status(), "Das Profil „Mia“ wurde gelöscht. Gerade ist keine Tafel aktiv.");
    // Ben is still there and could show "Pause", but which board the child gets is a caregiver's choice.
    assert.deepEqual(profiles().map((card) => [card.name, card.active]), [["Ben", false]]);
    assert.notEqual(profiles()[0].activate, null);
    assert.equal(await (await store()).getActive(), null);
    assert.deepEqual((await (await store()).list()).profiles.map((stored) => stored.id), [seeded.ben.id]);
    assert.equal(afterClose(), AFTER_NONE);
    assert.ok(texts().includes(NONE_ACTIVE));
    await handle.close();
    assert.equal(boardRegion.dataset.boardFallback, "no-active");
    assert.deepEqual(tiles(), CONCEPTS.map((concept) => concept.labelDe));
  });
});

test("delete: a failed write shows the German error, claims nothing, and the profile is still stored and listed", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, confirmDelete, act, profile, profiles, button, status, backend, focused, texts }) => {
    await holdOpen();
    await act(() => profile("Ben").remove.click());
    const before = JSON.stringify(backend.snapshot());
    backend.failWrite(1);
    await confirmDelete();
    assert.equal(status(), WRITE_FAILED);
    assert.equal(JSON.stringify(backend.snapshot()), before);
    assert.deepEqual(profiles().map((card) => [card.name, card.confirming]), [["Ben", false], ["Mia", false]]);
    assert.ok(!texts().some((text) => /wurde gelöscht/.test(text)));
    assert.equal(focused.current, profile("Ben").remove);
  });
});

test("delete: a profile that was removed meanwhile is answered in German", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, confirmDelete, act, profile, profiles, button, status, store, seeded }) => {
    await holdOpen();
    await act(() => profile("Ben").remove.click());
    await (await store()).remove(seeded.ben.id);
    await confirmDelete();
    assert.equal(status(), PROFILE_GONE);
    assert.deepEqual(profiles().map((card) => card.name), ["Mia"]);
  });
});

test("delete: deleting the profile that is being edited leaves the editor on the active profile, not on a deleted one", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, confirmDelete, act, profile, button, texts }) => {
    await holdOpen();
    await act(() => profile("Ben").edit.click());
    assert.ok(texts().includes("Tafel von „Ben“ bearbeiten"));
    await act(() => profile("Ben").remove.click());
    await confirmDelete();
    assert.ok(!texts().some((text) => text.includes("Ben") && !text.includes("wurde gelöscht")));
    assert.ok(texts().includes("Tafel von „Mia“ bearbeiten"));
  });
});

test("damaged entries: with rename and delete in the area, a damaged entry still gets neither", async () => {
  const seed = async (store, backend) => {
    await createMia(store);
    await backend.write({ set: { [`profile/${"a".repeat(32)}/meta`]: { version: 2, id: "a".repeat(32), displayName: "Neuer", conceptIds: [] }, [`profile/${"b".repeat(32)}/meta`]: "kaputt" } });
  };
  await withArea({ seed }, async ({ holdOpen, profiles, caregiverRegion, texts }) => {
    await holdOpen();
    assert.equal(profiles().length, 1);
    assert.deepEqual(buttonsIn(caregiverRegion).filter((element) => /Löschen|Umbenennen/.test(element.textContent)).map((element) => element["aria-label"]), ["Umbenennen: Mia", "Löschen: Mia"]);
    assert.ok(texts().includes("2 gespeicherte Profile können in dieser Version nicht gelesen werden. Sie bleiben unverändert gespeichert. Eine spätere Version hilft dabei."));
  });
});

// --- One thing open at a time ---

test("profiles: only one rename field or confirmation is open at a time; opening another closes the first", async () => {
  await withArea({ seed: seedMiaAndBen }, async (area) => {
    const { holdOpen, act, profile, renameInput, button, confirmation, texts } = area;
    await holdOpen();
    await act(() => profile("Ben").rename.click());
    assert.notEqual(renameInput(), null);
    assert.ok(texts().includes("Neuer Name für „Ben“"));
    // Another rename: the first field is gone.
    await act(() => profile("Mia").rename.click());
    assert.ok(texts().includes("Neuer Name für „Mia“"));
    assert.ok(!texts().includes("Neuer Name für „Ben“"));
    assert.equal(profile("Ben").name, "Ben");
    // A confirmation: no rename field under it, and none when it is left.
    await act(() => profile("Ben").remove.click());
    assert.notEqual(confirmation(), null);
    assert.equal(renameInput(), null);
    await act(() => button("Abbrechen").click());
    assert.equal(renameInput(), null);
    assert.equal(confirmation(), null);
  });
});

for (const [what, other] of [
  ["adding a concept", (area) => area.concept("Pause").add.click()],
  ["removing a concept", (area) => area.concept("Hilfe").remove.click()],
  ["making a profile the active board", (area) => area.profile("Ben").activate.click()],
  ["picking a profile for editing", (area) => area.profile("Ben").edit.click()],
  ["creating a profile", (area) => { area.nameInput().value = "Cleo"; area.createForm().dispatch("submit"); }],
  ["reloading the board", (area) => area.button("Tafel neu laden").click()],
]) {
  test(`profiles: ${what} cancels an open rename field and renames nothing`, async () => {
    await withArea({ seed: seedMiaAndBen }, async (area) => {
      const { holdOpen, act, profile, renameInput, store } = area;
      await holdOpen();
      await act(() => profile("Mia").rename.click());
      renameInput().value = "Mia X";
      await act(() => other(area));
      assert.equal(renameInput(), null);
      assert.ok((await (await store()).list()).profiles.some((stored) => stored.displayName === "Mia"));
    });
  });
}

// --- Undo of the last removal ---

/** Mia (active) with Hilfe, Pause and Fertig; "Pause" carries a caregiver's own wording. */
const seedWorded = async (store) => {
  const mia = await createMia(store);
  await setBoardConcepts(store, mia.id, ["hilfe", "pause", "fertig"], CONCEPTS);
  await setWording(store, mia.id, "pause", { labelDe: "Ausruhen", speechDe: "Ich will mich ausruhen." }, CONCEPTS);
  return mia;
};

test("undo: after 'Entfernen' the status area offers 'Rückgängig', which puts the concept back at its former place with the caregiver's own wording", async () => {
  await withArea({ seed: seedWorded }, async ({ holdOpen, remove, act, undo, status, store, seeded, backend, onBoard, concept, focused, caregiverRegion, handle, tiles }) => {
    await holdOpen();
    assert.equal(undo(), null);
    const ids = async () => (await (await store()).get(seeded.id)).conceptIds;
    const entry = () => backend.snapshot()[`profile/${seeded.id}/data/concept.pause`];
    const worded = entry();
    assert.deepEqual(worded, { version: 1, labelDe: "Ausruhen", speechDe: "Ich will mich ausruhen." });
    await remove("Ausruhen");
    assert.equal(status(), "„Ausruhen“ wurde von der Tafel genommen.");
    assert.deepEqual(await ids(), ["hilfe", "fertig"]);
    // The offer sits in the block at the top, next to the message, as a real button.
    const offer = undo();
    assert.equal(byClass(caregiverRegion, "caregiver-undo").hidden, false);
    assert.equal(offer["aria-label"], "Rückgängig: Ausruhen wieder auf die Tafel setzen");
    // Board data keeps a caregiver's wording when the concept leaves the board; off the board the row shows the catalogue wording.
    assert.deepEqual(entry(), worded);
    assert.equal(concept("Pause").onBoard, false);

    await act(() => offer.click());
    assert.deepEqual(await ids(), ["hilfe", "pause", "fertig"]);
    assert.deepEqual(onBoard(), ["Hilfe", "Ausruhen", "Fertig"]);
    assert.equal(concept("Ausruhen").sentence, "Ich will mich ausruhen.");
    assert.deepEqual(entry(), worded);
    assert.equal(status(), "„Ausruhen“ ist wieder auf der Tafel.");
    assert.equal(undo(), null);
    assert.equal(byClass(caregiverRegion, "caregiver-undo").hidden, true);
    assert.equal(focused.current, concept("Ausruhen").remove);
    await handle.close();
    assert.deepEqual(tiles(), ["Hilfe", "Ausruhen", "Fertig"]);
  });
});

test("undo: the place is built from the stored list at that moment: before the id that followed, or at the end when that id is gone", async () => {
  // Between locked ids: back to the exact former list.
  await withArea({ seed: seedMixedBoard }, async ({ holdOpen, takeBack, remove, act, undo, store, seeded }) => {
    await holdOpen();
    await remove("Trinken");
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, MIXED_IDS.filter((id) => id !== "trinken"));
    await takeBack();
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, MIXED_IDS);
  });
  // The last id of the board goes back to the end.
  await withArea({ seed: seedWorded }, async ({ holdOpen, takeBack, remove, act, undo, store, seeded }) => {
    await holdOpen();
    await remove("Fertig");
    await takeBack();
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, ["hilfe", "pause", "fertig"]);
  });
  // The board changed behind the area's back: the follower is gone, so the end it is; a concept added meanwhile stays.
  await withArea({ seed: seedWorded }, async ({ holdOpen, takeBack, remove, act, undo, store, seeded }) => {
    await holdOpen();
    await remove("Hilfe");
    await (await store()).setConceptIds(seeded.id, ["fertig", "mehr"]);
    await takeBack();
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, ["fertig", "mehr", "hilfe"]);
  });
  // The follower moved: still before it.
  await withArea({ seed: seedWorded }, async ({ holdOpen, takeBack, remove, act, undo, store, seeded }) => {
    await holdOpen();
    await remove("Hilfe");
    await (await store()).setConceptIds(seeded.id, ["fertig", "pause"]);
    await takeBack();
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, ["fertig", "hilfe", "pause"]);
  });
});

test("undo: every removal of this visit can be taken back, the latest first, and the button names the concept it brings back", async () => {
  await withArea({ seed: seedWorded }, async ({ holdOpen, takeBack, remove, act, undo, store, seeded, caregiverRegion, status, onBoard }) => {
    await holdOpen();
    const ids = async () => (await (await store()).get(seeded.id)).conceptIds;
    await remove("Hilfe");
    await remove("Fertig");
    assert.equal(status(), "„Fertig“ wurde von der Tafel genommen.");
    assert.equal(buttonsIn(byClass(caregiverRegion, "caregiver-undo")).length, 1);
    // Two are stacked: the button says that there is one more behind this one.
    assert.equal(undo().textContent, "Rückgängig: „Fertig“ (noch 1 weiterer)");
    assert.equal(undo()["aria-label"], "Rückgängig: Fertig wieder auf die Tafel setzen (noch 1 weiterer)");
    await takeBack();
    assert.deepEqual(await ids(), ["pause", "fertig"]);
    assert.equal(status(), "„Fertig“ ist wieder auf der Tafel.");
    // Still offered: the removal before that one.
    assert.equal(undo().textContent, "Rückgängig: „Hilfe“");
    await takeBack();
    assert.deepEqual(await ids(), ["hilfe", "pause", "fertig"]);
    assert.deepEqual(onBoard(), ["Hilfe", "Ausruhen", "Fertig"]);
    assert.equal(undo(), null);
    assert.equal(byClass(caregiverRegion, "caregiver-undo").hidden, true);
  });
});

test("undo: the offers stay across an add, a move, a rename and an activation; a concept added back by hand leaves the stack", async () => {
  const seed = async (store) => {
    const mia = await seedWorded(store);
    await store.create("Ben", []);
    return mia;
  };
  await withArea({ seed }, async ({ holdOpen, takeBack, remove, add, act, concept, profile, rename, undo, store, seeded }) => {
    await holdOpen();
    await remove("Hilfe");
    await remove("Fertig");
    await add("Mehr");
    assert.equal(undo().textContent, "Rückgängig: „Fertig“ (noch 1 weiterer)");
    await act(() => concept("Mehr").up.click());
    assert.equal(undo().textContent, "Rückgängig: „Fertig“ (noch 1 weiterer)");
    await rename("Mia", "Mia L");
    assert.equal(undo().textContent, "Rückgängig: „Fertig“ (noch 1 weiterer)");
    await act(() => profile("Ben").activate.click());
    assert.equal(undo().textContent, "Rückgängig: „Fertig“ (noch 1 weiterer)");
    // Put back by hand: nothing to take back for it any more; the earlier removal is still offered.
    await add("Fertig");
    assert.equal(undo().textContent, "Rückgängig: „Hilfe“");
    await takeBack();
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, ["mehr", "hilfe", "pause", "fertig"]);
    assert.equal(undo(), null);
  });
});

test("undo: deleting another profile leaves the offer; deleting the edited profile ends it", async () => {
  const seed = async (store) => {
    const mia = await seedWorded(store);
    await store.create("Ben", []);
    return mia;
  };
  await withArea({ seed }, async ({ holdOpen, remove, act, profile, confirmDelete, undo, status }) => {
    await holdOpen();
    await remove("Hilfe");
    await act(() => profile("Ben").remove.click());
    await confirmDelete();
    assert.equal(status(), "Das Profil „Ben“ wurde gelöscht.");
    assert.equal(undo().textContent, "Rückgängig: „Hilfe“");
    await act(() => profile("Mia").remove.click());
    await confirmDelete();
    assert.equal(undo(), null);
  });
});

for (const [what, next] of [
  ["switching to another profile", async (area) => { await area.act(() => area.profile("Ben").edit.click()); }],
  ["creating a profile, which becomes the edited one", async (area) => { await area.create("Cleo"); }],
  ["closing and opening again", async (area) => { await area.handle.close(); await area.holdOpen(); }],
]) {
  test(`undo: the offers go away with ${what}`, async () => {
    const seed = async (store) => {
      const mia = await seedWorded(store);
      await store.create("Ben", []);
      return mia;
    };
    await withArea({ seed }, async (area) => {
      await area.holdOpen();
      await area.remove("Hilfe");
      await area.remove("Fertig");
      assert.notEqual(area.undo(), null);
      await next(area);
      assert.equal(area.undo(), null);
      assert.equal(byClass(area.caregiverRegion, "caregiver-undo").hidden, true);
      // Also not back when the first profile is edited again.
      if (area.handle.isOpen() && area.profile("Mia").edit["aria-pressed"] !== "true") await area.act(() => area.profile("Mia").edit.click());
      assert.equal(area.undo(), null);
      assert.deepEqual((await (await area.store()).get(area.seeded.id)).conceptIds, ["pause"]);
    });
  });
}

test("undo: an action that fails leaves the offer, and an undo whose write fails can be tried again", async () => {
  await withArea({ seed: seedWorded }, async ({ holdOpen, takeBack, remove, add, act, undo, status, backend, store, seeded }) => {
    await holdOpen();
    await remove("Hilfe");
    backend.failWrite(1);
    await add("Mehr");
    assert.match(status(), /^Das konnte gerade nicht gespeichert werden/);
    assert.notEqual(undo(), null);
    backend.failWrite(1);
    await takeBack();
    assert.match(status(), /^Das konnte gerade nicht gespeichert werden/);
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, ["pause", "fertig"]);
    await takeBack();
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, ["hilfe", "pause", "fertig"]);
    assert.equal(undo(), null);
  });
});

test("undo: two presses without waiting put the concept back once", async () => {
  await withArea({ seed: seedWorded }, async ({ holdOpen, remove, undo, handle, store, seeded, status }) => {
    await holdOpen();
    await remove("Hilfe");
    const offer = undo();
    offer.click();
    offer.click();
    await handle.settled();
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, ["hilfe", "pause", "fertig"]);
    assert.equal(status(), "„Hilfe“ ist wieder auf der Tafel.");
    assert.equal(undo(), null);
  });
});

test("undo: when the concept is back on the board by other means, the offer writes nothing and goes away", async () => {
  await withArea({ seed: seedWorded }, async ({ holdOpen, takeBack, remove, act, undo, store, seeded, backend, onBoard }) => {
    await holdOpen();
    await remove("Hilfe");
    await (await store()).setConceptIds(seeded.id, ["pause", "hilfe", "fertig"]);
    const before = JSON.stringify(backend.snapshot());
    await takeBack();
    assert.equal(JSON.stringify(backend.snapshot()), before);
    assert.equal(undo(), null);
    assert.deepEqual(onBoard(), ["Ausruhen", "Hilfe", "Fertig"]);
  });
});

// --- The warning for a large board ---

test("board editor: more than 12 showable tiles get a warning line; 12 do not, and an id that cannot be shown does not count", async () => {
  assert.equal(BOARD_COMFORT_MAX, 12);
  const warning = "Mehr als 12 Begriffe: Auf einem Handy werden die Felder klein und die Tafel muss gescrollt werden.";
  const catalogue = Array.from({ length: 14 }, (unused, index) => ({ id: `wort-${index}`, labelDe: `Wort ${index}`, speechDe: `Satz ${index}.`, symbolPath: "./icons/mehr.svg" }));
  const seed = async (store) => {
    const mia = await createMia(store);
    // Twelve catalogue concepts and one id with nothing behind it: 13 ids, 12 tiles.
    await store.setConceptIds(mia.id, [...catalogue.slice(0, 12).map((concept) => concept.id), "geist"]);
    return mia;
  };
  await withArea({ seed, catalogue }, async ({ holdOpen, add, remove, texts, onBoard }) => {
    await holdOpen();
    assert.equal(onBoard().length, 13);
    assert.ok(!texts().includes(warning));
    await add("Wort 12");
    assert.ok(texts().includes(warning));
    await add("Wort 13");
    assert.ok(texts().includes(warning));
    await remove("Wort 0");
    assert.ok(texts().includes(warning));
    await remove("Wort 1");
    assert.ok(!texts().includes(warning));
  });
});

// --- Help ---

test("help: at the bottom, behind 'Hilfe bei Problemen', are 'Tafel neu laden' with one sentence and the text for a device that does not speak", async () => {
  await withArea({ seed: createMia }, async ({ holdOpen, act, caregiverRegion, status, refreshes, button }) => {
    await holdOpen();
    const help = caregiverRegion.children.at(-1);
    assert.equal(help.tagName, "details");
    assert.equal(help.children[0].tagName, "summary");
    assert.deepEqual(textsIn(help), HELP_TEXTS);
    // Closed until it is asked for, when the area could read the store.
    assert.notEqual(help.open, true);
    assert.equal(buttonsIn(caregiverRegion).filter((element) => element.textContent === "Tafel neu laden").length, 1);
    await act(() => button("Tafel neu laden").click());
    assert.equal(refreshes.count, 1);
    assert.equal(status(), "Die Tafel wurde neu geladen.");
    assert.notEqual(help.open, true);
  });
});

// --- Privacy and queueing with the new controls ---

test("privacy: after rename, delete and undo neither the board region nor the opening control carries a profile name, old or new, or an id", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, takeBack, confirmDelete, rename, remove, add, act, undo, profile, button, handle, boardRegion, entry, caregiverRegion, seeded }) => {
    const secrets = ["Mia", "Ben", "Musterkind", seeded.mia.id, seeded.ben.id];
    const leaks = () => [...stringsIn(boardRegion), ...stringsIn(entry)].filter((text) => secrets.some((secret) => text.includes(secret)));
    await holdOpen();
    await rename("Mia", "Mia Musterkind");
    assert.deepEqual(leaks(), []);
    await add("Pause");
    await remove("Hilfe");
    await takeBack();
    assert.deepEqual(leaks(), []);
    await act(() => profile("Ben").remove.click());
    assert.deepEqual(leaks(), []);
    await confirmDelete();
    assert.deepEqual(leaks(), []);
    assert.ok(stringsIn(caregiverRegion).some((text) => text.includes("Mia Musterkind")));
    await handle.close();
    assert.deepEqual(leaks(), []);
    assert.deepEqual(stringsIn(caregiverRegion).filter((text) => secrets.some((secret) => text.includes(secret))), []);
  });
});

test("queue: add, move, remove and undo asked for without waiting are carried out in order, each built from the stored list", async () => {
  const inner = new MemoryBackend();
  const slow = () => new Promise((resolve) => setImmediate(resolve));
  const boards = [];
  const backend = {
    get: async (key) => { await slow(); return inner.get(key); },
    keys: async (prefix) => { await slow(); return inner.keys(prefix); },
    async write(batch) {
      await slow();
      for (const [key, value] of Object.entries(batch.set ?? {})) if (key.endsWith("/meta")) boards.push(value.conceptIds);
      return inner.write(batch);
    },
  };
  const seedStore = await ProfileStore.open(inner);
  const mia = await createMia(seedStore);
  await seedStore.setConceptIds(mia.id, ["hilfe", "pause", "fertig"]);
  await withArea({ backend }, async ({ holdOpen, concept, handle, undo, store, tiles, clock }) => {
    await holdOpen();
    boards.length = 0;
    // All four from the same drawn screen: the later ones must not be built from what the screen showed.
    concept("Mehr").add.click();
    concept("Fertig").up.click();
    concept("Hilfe").remove.click();
    concept("Pause").down.click();
    await handle.settled();
    assert.deepEqual(boards, [
      ["hilfe", "pause", "fertig", "mehr"],
      ["hilfe", "fertig", "pause", "mehr"],
      ["fertig", "pause", "mehr"],
      ["fertig", "mehr", "pause"],
    ]);
    assert.equal(undo().textContent, "Rückgängig: „Hilfe“");
    // A removal and its undo, pressed as soon as it is there, with an add that waits behind the undo.
    clock.advance(GUARD_MS);
    concept("Mehr").remove.click();
    await handle.settled();
    undo().click();
    concept("Hilfe").add.click();
    await handle.settled();
    assert.deepEqual((await (await store()).get(mia.id)).conceptIds, ["fertig", "mehr", "pause", "hilfe"]);
    assert.equal(undo(), null);
    await handle.close();
    assert.deepEqual(tiles(), ["Fertig", "Mehr", "Pause", "Hilfe"]);
  });
});

// --- Layout, as far as the style sheet can be read ---

test("the stylesheet keeps the top block in place with a solid background, gives controls 44 px and their neighbours more than 8 px, and sets delete apart from 'Fertig'", async () => {
  const css = await readFile(new URL("../dist/styles.css", import.meta.url), "utf8");
  const rule = (selector) => css.split("\n").find((line) => line.startsWith(`${selector} {`)) ?? "";
  // The block at the top: sticky, opaque, with a line under it, clear of a notch.
  assert.match(rule(".caregiver-top"), /position: sticky; top: 0;/);
  assert.match(rule(".caregiver-top"), /padding: max\(\.6rem, env\(safe-area-inset-top\)\)/);
  assert.match(rule(".caregiver-top"), /border-bottom: 2px solid #[0-9a-f]{6}; background: #[0-9a-f]{6};/);
  // The region scrolls, and what gets the focus is not left under the block.
  assert.match(rule(".caregiver-region"), /overflow-y: auto; scroll-padding-top:/);
  // Targets and the room between them (.6rem is 9.6 px at the default text size).
  assert.match(rule(".caregiver-button, .caregiver-input"), /min-height: 44px;/);
  assert.match(rule(".caregiver-button"), /min-width: 44px;/);
  assert.match(rule(".caregiver-details summary"), /min-height: 44px;/);
  assert.match(rule(".caregiver-profile-actions, .caregiver-row-actions"), /flex-wrap: wrap; gap: \.6rem;/);
  assert.match(rule(".caregiver-create, .caregiver-rename, .caregiver-reword"), /gap: \.6rem;/);
  // Cards and rows are blocks; long names and sentences wrap instead of widening the page.
  for (const selector of [".caregiver-profile-name", ".caregiver-concept-name", ".caregiver-concept-sentence", ".caregiver-after-close", ".caregiver-status"]) {
    assert.match(rule(selector), /overflow-wrap: anywhere;/, selector);
  }
  // Destructive buttons do not share the look of the primary one.
  const background = (selector) => /background: (#[0-9a-f]{6}|white)/.exec(rule(selector))?.[1];
  assert.notEqual(background(".caregiver-danger"), undefined);
  assert.notEqual(background(".caregiver-danger"), background(".caregiver-primary"));
  assert.match(rule(".caregiver-danger-quiet"), /border-color: #a3261a;/);
  // A button in its guard time looks like a disabled one.
  assert.match(css, /^\.caregiver-button:disabled, \.caregiver-button\[aria-disabled="true"\] \{ border-color: #b7c4ca; background: white; color: #7b8a91;/m);
  // The heading that gets the focus on opening shows it.
  assert.match(rule(".caregiver-heading:focus"), /outline: 3px solid #cf681e;/);
  // A long message does not make the block at the top grow without bound: three lines, the full text stays in the element.
  assert.match(rule(".caregiver-status"), /-webkit-line-clamp: 3;.*overflow: hidden;/);
});

// --- Guards against a second tap (card NG-31, second round) ---

/** Mia (active) with all five catalogue concepts in the order of the review's finding. */
const seedFive = async (store) => {
  const mia = await createMia(store);
  await setBoardConcepts(store, mia.id, ["pause", "hilfe", "trinken", "mehr", "fertig"], CONCEPTS);
  return mia;
};

test("remove: after a removal every 'Entfernen' looks inactive and ignores presses for the guard time, so a second tap on the same spot takes nothing more off", async () => {
  await withArea({ seed: seedFive }, async ({ holdOpen, act, concept, concepts, onBoard, clock, focused, undo, status, store, seeded }) => {
    await holdOpen();
    const removeButtons = () => concepts().filter((row) => row.onBoard).map((row) => row.remove["aria-disabled"]);
    assert.deepEqual(removeButtons(), Array(5).fill("false"));
    await act(() => concept("Pause").remove.click());
    assert.deepEqual(onBoard(), ["Hilfe", "Trinken", "Mehr", "Fertig"]);
    assert.deepEqual(removeButtons(), Array(4).fill("true"));
    assert.equal(status(), "„Pause“ wurde von der Tafel genommen.");
    // Where "Pause" was is now "Hilfe", and its "Entfernen" has the focus: a second tap, or Enter again, lands there.
    assert.equal(focused.current, concept("Hilfe").remove);
    await act(() => focused.current.click());
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, ["hilfe", "trinken", "mehr", "fertig"]);
    // The grey buttons are explained where the eyes are; what was removed is still named on the undo button.
    assert.equal(status(), PLEASE_WAIT);
    assert.equal(undo().textContent, "Rückgängig: „Pause“");
    clock.advance(GUARD_MS - 1);
    assert.deepEqual(removeButtons(), Array(4).fill("true"));
    clock.advance(1);
    assert.deepEqual(removeButtons(), Array(4).fill("false"));
    await act(() => concept("Hilfe").remove.click());
    assert.deepEqual(onBoard(), ["Trinken", "Mehr", "Fertig"]);
    // The move buttons of a row are not held back.
    await act(() => concept("Fertig").up.click());
    assert.deepEqual(onBoard(), ["Trinken", "Fertig", "Mehr"]);
  });
});

test("remove: two presses before the first is carried out take one concept off, and what was said and what undo restores is that one", async () => {
  const inner = new MemoryBackend();
  const slow = () => new Promise((resolve) => setImmediate(resolve));
  const backend = {
    get: async (key) => { await slow(); return inner.get(key); },
    keys: async (prefix) => { await slow(); return inner.keys(prefix); },
    write: async (batch) => { await slow(); return inner.write(batch); },
  };
  const mia = await seedFive(await ProfileStore.open(inner));
  await withArea({ backend }, async ({ holdOpen, takeBack, act, concept, handle, undo, status, store }) => {
    await holdOpen();
    const ids = async () => (await (await store()).get(mia.id)).conceptIds;
    concept("Pause").remove.click();
    // From the press on, before anything is stored or drawn.
    assert.equal(concept("Hilfe").remove["aria-disabled"], "true");
    concept("Pause").remove.click();
    concept("Hilfe").remove.click();
    await handle.settled();
    assert.deepEqual(await ids(), ["hilfe", "trinken", "mehr", "fertig"]);
    assert.equal(status(), "„Pause“ wurde von der Tafel genommen.");
    await takeBack();
    assert.deepEqual(await ids(), ["pause", "hilfe", "trinken", "mehr", "fertig"]);
    assert.equal(undo(), null);
  });
});

test("remove: a guard that was started by an earlier removal does not end the guard of a later one early", async () => {
  await withArea({ seed: seedFive }, async ({ holdOpen, act, concept, clock, onBoard }) => {
    await holdOpen();
    await act(() => concept("Pause").remove.click());
    clock.advance(GUARD_MS);
    await act(() => concept("Hilfe").remove.click());
    clock.advance(GUARD_MS - 1);
    await act(() => concept("Trinken").remove.click());
    assert.deepEqual(onBoard(), ["Trinken", "Mehr", "Fertig"]);
  });
  // Timers whose cancellation is ignored, fired late by hand: the first guard's timer must not arm during the second guard.
  const timers = [];
  const fakes = installFakes();
  try {
    const store = await ProfileStore.open(new MemoryBackend());
    await seedFive(store);
    const boardRegion = fakes.fakeElement("section");
    boardRegion.dataset.startup = "profile";
    const caregiverRegion = fakes.fakeElement("section");
    const entry = fakes.fakeElement("footer");
    const handle = mountCaregiver({
      app: { store: async () => store, refreshBoard: async () => undefined }, boardRegion, caregiverRegion, entry, catalogue: CONCEPTS,
      setTimer: (callback, milliseconds) => { timers.push({ callback, milliseconds }); return () => undefined; }, onPageHidden: () => undefined, now: alwaysAimed(),
    });
    handle.open();
    await handle.settled();
    const removeOf = (label) => buttonsIn(caregiverRegion).find((element) => element["aria-label"] === `Entfernen: ${label}`);
    removeOf("Pause").click();
    await handle.settled();
    const first = timers.findLast((timer) => timer.milliseconds === GUARD_MS);
    first.callback();
    removeOf("Hilfe").click();
    await handle.settled();
    first.callback();
    assert.equal(removeOf("Trinken")["aria-disabled"], "true");
    removeOf("Trinken").click();
    await handle.settled();
    assert.notEqual(removeOf("Trinken"), undefined);
  } finally {
    fakes.restore();
  }
});

// --- Where the focus and the view go ---

test("first use: after the first profile is created, focus is on its editor; after a further one, on the new card", async () => {
  await withArea({}, async ({ holdOpen, create, focused, editorHeading, profile, status, afterClose }) => {
    await holdOpen();
    await create("Amy");
    assert.equal(focused.current, editorHeading());
    assert.equal(status(), "Das Profil „Amy“ ist angelegt und jetzt die aktive Tafel. Füge unten Begriffe hinzu.");
    assert.equal(afterClose(), AFTER_EMPTY);
    await create("Ben");
    assert.equal(focused.current, profile("Ben").activate);
    assert.equal(status(), "Das Profil „Ben“ wurde angelegt. Es ist noch nicht die aktive Tafel.");
    // A name that is refused: focus stays in the field.
    await create("");
    assert.equal(focused.current.id, "caregiver-new-name");
  });
});

/** Geometry for the fake DOM: the block at the top is 200 px high; everything else sits at `layout.at(element)` in the scrolled content. */
function fakeLayout() {
  const layout = { region: null, height: 5000, at: () => 1000 };
  layout.rect = (element) => {
    if (hasClass(element, "caregiver-top")) return { top: 0, bottom: 200 };
    if (element === layout.region) return { top: 0, bottom: layout.height };
    const top = layout.at(element) - (layout.region?.scrollTop ?? 0);
    return { top, bottom: top + 44 };
  };
  return layout;
}
const UNDER_BLOCK = 208;

test("view: a control that gets the focus under the block at the top is brought out from under it; one that is clear of it is left alone", async () => {
  const layout = fakeLayout();
  layout.at = (element) => (element.id === "caregiver-rename-name" ? 450 : hasClass(element, "caregiver-profile") ? 430 : 1000);
  await withArea({ seed: seedMiaAndBen, rect: layout.rect }, async ({ holdOpen, act, profile, renameInput, caregiverRegion, focused, button }) => {
    layout.region = caregiverRegion;
    await holdOpen();
    // The heading is part of the block: focusing it scrolls nothing.
    assert.equal(caregiverRegion.scrollTop, 0);
    caregiverRegion.scrollTop = 400;
    await act(() => profile("Ben").rename.click());
    assert.equal(focused.current, renameInput());
    // Its card was 30 px from the top of the region, behind a block of 200 px: the card's top comes to rest under the block.
    assert.equal(caregiverRegion.scrollTop, 222);
    assert.equal(layout.rect(renameInput()).top, UNDER_BLOCK + 20);
    // "Umbenennen" gets the focus back at 1000 px, well below the block: no scrolling.
    await act(() => button("Abbrechen").click());
    assert.equal(focused.current, profile("Ben").rename);
    assert.equal(caregiverRegion.scrollTop, 222);
    // A button without a card around it is brought out by its own top edge.
    layout.at = (element) => (element.textContent === "Tafel bearbeiten" ? 300 : 1000);
    await act(() => profile("Ben").activate.click());
    assert.equal(focused.current, profile("Ben").edit);
    assert.equal(caregiverRegion.scrollTop, 300 - UNDER_BLOCK);
    // Never scrolled past the start.
    caregiverRegion.scrollTop = 0;
    layout.at = () => 100;
    await act(() => profile("Ben").rename.click());
    assert.equal(caregiverRegion.scrollTop, 0);
  });
});

test("view: a rename field and a confirmation are brought out by their card, and the focused button is not left below the region", async () => {
  const layout = fakeLayout();
  // The card starts at 400, its field or "Abbrechen" 60 px further down.
  layout.at = (element) => (hasClass(element, "caregiver-profile") || hasClass(element, "caregiver-confirm") ? 400 : element.id === "caregiver-rename-name" || element.id === "caregiver-delete-name" || element.textContent === "Abbrechen" ? 460 : 1000);
  await withArea({ seed: seedMiaAndBen, rect: layout.rect }, async ({ holdOpen, act, profile, caregiverRegion, button, focused }) => {
    const nameField = () => tree(caregiverRegion).find((element) => element.id === "caregiver-delete-name");
    layout.region = caregiverRegion;
    await holdOpen();
    caregiverRegion.scrollTop = 300;
    // The card is at 100 px, behind the block; the field at 160 px as well. The card's top goes under the block's edge.
    await act(() => profile("Ben").rename.click());
    assert.equal(caregiverRegion.scrollTop, 400 - UNDER_BLOCK);
    await act(() => button("Abbrechen").click());
    // The confirmation is the whole body: it is brought to just under the block, also when it starts further down.
    caregiverRegion.scrollTop = 0;
    await act(() => profile("Ben").remove.click());
    // The focus is on the name field of the confirmation (owner decision on card NG-13).
    assert.equal(focused.current, nameField());
    assert.equal(caregiverRegion.scrollTop, 400 - UNDER_BLOCK);
    // A low window: the field (44 px high, at 268 px after that) would end below a region of 290 px. It is scrolled into it.
    await act(() => button("Abbrechen").click());
    layout.height = 290;
    caregiverRegion.scrollTop = 300;
    await act(() => profile("Ben").remove.click());
    assert.equal(layout.rect(nameField()).bottom, 290);
    assert.ok(layout.rect(nameField()).top >= UNDER_BLOCK);
  });
});

test("view: 'Tafel bearbeiten' and the first profile bring the editor heading to just under the block, also from below the fold", async () => {
  const layout = fakeLayout();
  layout.at = (element) => (element.tagName === "h2" && element.textContent.startsWith("Tafel von ") ? 900 : 1000);
  await withArea({ seed: seedMiaAndBen, rect: layout.rect }, async ({ holdOpen, act, profile, caregiverRegion, focused, editorHeading }) => {
    layout.region = caregiverRegion;
    await holdOpen();
    await act(() => profile("Ben").edit.click());
    assert.equal(focused.current, editorHeading());
    assert.equal(caregiverRegion.scrollTop, 900 - UNDER_BLOCK);
    assert.equal(layout.rect(editorHeading()).top, UNDER_BLOCK);
  });
  await withArea({ rect: layout.rect }, async ({ holdOpen, create, caregiverRegion, focused, editorHeading }) => {
    layout.region = caregiverRegion;
    await holdOpen();
    await create("Amy");
    assert.equal(focused.current, editorHeading());
    assert.equal(caregiverRegion.scrollTop, 900 - UNDER_BLOCK);
  });
});

// --- The status line does not linger ---

test("status: a press retires an earlier message without moving anything: the text keeps its place until the redraw for that press", async () => {
  const { inner, gate, backend } = gatedBackend();
  await seedMiaAndBen(await ProfileStore.open(inner));
  await withArea({ backend }, async (area) => {
    const { holdOpen, add, profile, concept, status, button, handle, rename } = area;
    await holdOpen();
    const message = "Gespeichert: „Pause“ ist jetzt auf der Tafel.";
    await add("Pause");
    assert.equal(status(), message);
    // Pressed while storage is slow: the line is as it was, so the next tap lands where it was aimed.
    gate.hold();
    profile("Ben").rename.click();
    for (let round = 0; round < 10; round += 1) await turn();
    assert.equal(status(), message, "opening a rename field");
    gate.release();
    await handle.settled();
    assert.equal(status(), "", "gone with the redraw");
    // A refusal in the rename field, then "Abbrechen".
    await rename("Mia", "");
    assert.equal(status(), "Bitte gib einen Namen ein.");
    gate.hold();
    button("Abbrechen").click();
    for (let round = 0; round < 10; round += 1) await turn();
    assert.equal(status(), "Bitte gib einen Namen ein.");
    gate.release();
    await handle.settled();
    assert.equal(status(), "");
    // An action with an answer of its own: the old message stays until the new one takes its place.
    await add("Mehr");
    gate.hold();
    concept("Pause").up.click();
    for (let round = 0; round < 10; round += 1) await turn();
    assert.equal(status(), "Gespeichert: „Mehr“ ist jetzt auf der Tafel.");
    gate.release();
    await handle.settled();
    assert.equal(status(), "Die Reihenfolge wurde gespeichert.");
    // A confirmation, and leaving it.
    profile("Ben").remove.click();
    await handle.settled();
    assert.equal(status(), "");
  });
});

test("status: scrolling the area by wheel or touch clears the message; the undo offer stays", async () => {
  for (const type of ["wheel", "touchmove"]) {
    await withArea({ seed: seedFive }, async ({ holdOpen, remove, status, undo, caregiverRegion }) => {
      await holdOpen();
      await remove("Pause");
      assert.equal(status(), "„Pause“ wurde von der Tafel genommen.");
      caregiverRegion.dispatch(type);
      assert.equal(status(), "", type);
      assert.equal(undo().textContent, "Rückgängig: „Pause“", type);
    });
  }
});

// --- Names ---

const nameTaken = (example) => `Diesen Namen gibt es schon. Bitte wähle einen anderen, zum Beispiel „${example}“.`;

for (const name of ["Mia", "mia", "  MIA ", `Mi${chr(0x61, 0x308)}`]) {
  test(`names: creating a profile with a name another profile has (${JSON.stringify(name)}) is refused in German`, async () => {
    const seed = async (store) => {
      await createMia(store);
      await store.create("Miä", []);
    };
    await withArea({ seed }, async ({ holdOpen, create, status, backend, nameInput, profiles, focused }) => {
      await holdOpen();
      const before = JSON.stringify(backend.snapshot());
      await create(name);
      // The way out is the typed name with a number, not a surname.
      assert.equal(status(), `Diesen Namen gibt es schon. Bitte wähle einen anderen, zum Beispiel „${name.normalize("NFC").trim()} 2“.`);
      assert.equal(JSON.stringify(backend.snapshot()), before);
      assert.equal(nameInput().value, name);
      assert.equal(focused.current, nameInput());
      assert.deepEqual(profiles().map((card) => card.name), ["Mia", "Miä"]);
    });
  });
}

test("names: renaming to the name of another profile is refused and the field stays open; the own name in another spelling is accepted", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, rename, status, backend, renameInput, profiles, store, seeded }) => {
    await holdOpen();
    const before = JSON.stringify(backend.snapshot());
    await rename("Ben", " mia");
    assert.equal(status(), nameTaken("mia 2"));
    assert.equal(JSON.stringify(backend.snapshot()), before);
    assert.equal(renameInput().value, " mia");
    await rename("Mia", "MIA");
    assert.equal(status(), "Das Profil heißt jetzt „MIA“.");
    assert.equal((await (await store()).get(seeded.mia.id)).displayName, "MIA");
    assert.deepEqual(profiles().map((card) => card.name), ["Ben", "MIA"]);
  });
});

test("names: stored profiles of one name are told apart by a suffix, in the area only, and can be renamed", async () => {
  const seed = async (store) => {
    const first = await store.create("Amy", ["hilfe"]);
    await store.create("amy", ["pause"]);
    const third = await store.create("Amy", []);
    // Sorted by name ("amy" before "Amy" in German order), then by id: the later of the two "Amy" is made active.
    const [, later] = [first, third].sort((x, y) => x.id.localeCompare(y.id));
    await store.setActive(later.id);
    return later;
  };
  await withArea({ seed }, async ({ holdOpen, act, profiles, profile, afterClose, texts, add, renameInput, rename, status, store, seeded, button, boardRegion, entry, handle }) => {
    await holdOpen();
    assert.deepEqual(profiles().map((card) => [card.name, card.active]), [["amy", false], ["Amy (2)", false], ["Amy (3)", true]]);
    // The stored names are untouched.
    const storedNames = async () => (await (await store()).list()).profiles.map((stored) => stored.displayName).sort();
    assert.deepEqual(await storedNames(), ["Amy", "Amy", "amy"]);
    // Everything that names a board uses the name with the suffix: buttons, the editor, the header, the confirmation, the messages.
    assert.equal(profile("Amy (3)").rename["aria-label"], "Umbenennen: Amy (3)");
    await add("Mehr");
    assert.equal(afterClose(), "Nach dem Schließen: Tafel von „Amy (3)“");
    assert.ok(texts().includes("Tafel von „Amy (3)“ bearbeiten"));
    await act(() => profile("Amy (2)").remove.click());
    assert.ok(texts().includes("Profil „Amy (2)“ löschen?"));
    await act(() => button("Abbrechen").click());
    await act(() => profile("Amy (2)").activate.click());
    assert.equal(status(), "„Amy (2)“ ist jetzt die aktive Tafel.");
    // The rename field starts from the stored name; keeping it is refused, another name is taken and the suffixes follow.
    await act(() => profile("Amy (3)").rename.click());
    assert.equal(renameInput().value, "Amy");
    assert.ok(texts().includes("Neuer Name für „Amy (3)“"));
    await act(() => button("Abbrechen").click());
    await rename("Amy (3)", "Amy");
    assert.equal(status(), nameTaken("Amy 2"));
    await act(() => button("Abbrechen").click());
    await rename("Amy (3)", "Ben");
    assert.equal(status(), "Das Profil heißt jetzt „Ben“.");
    assert.equal((await (await store()).get(seeded.id)).displayName, "Ben");
    assert.deepEqual(await storedNames(), ["Amy", "Ben", "amy"]);
    assert.deepEqual(profiles().map((card) => card.name), ["amy", "Amy (2)", "Ben"]);
    // The suffix is the area's: nothing of it reaches the board region or the opening control.
    await handle.close();
    assert.deepEqual([...stringsIn(boardRegion), ...stringsIn(entry)].filter((text) => /\(2\)|\(3\)/.test(text)), []);
  });
});

// --- Escape and typed text ---

test("leaving: Escape in a text field that holds text moves the focus out of the field and closes nothing; the next Escape closes", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, key, handle, nameInput, heading, focused }) => {
    await holdOpen();
    const field = nameInput();
    field.value = "Cle";
    field.focus();
    assert.equal(key("Escape"), 1);
    assert.equal(handle.isOpen(), true);
    assert.equal(nameInput().value, "Cle");
    assert.equal(focused.current, heading());
    assert.equal(key("Escape"), 1);
    assert.equal(handle.isOpen(), false);
  });
  // An empty field has nothing to lose: Escape closes at once.
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, key, handle, nameInput }) => {
    await holdOpen();
    nameInput().focus();
    key("Escape");
    assert.equal(handle.isOpen(), false);
  });
});

test("leaving: 'Löschen' and then Escape while an earlier write is still under way cancels the confirmation and does not close", async () => {
  const inner = new MemoryBackend();
  let release = null;
  let holdWrites = false;
  const backend = {
    get: (key) => inner.get(key),
    keys: (prefix) => inner.keys(prefix),
    async write(batch) {
      if (holdWrites) await new Promise((resolve) => { release = resolve; });
      return inner.write(batch);
    },
  };
  const store = await ProfileStore.open(backend);
  await seedMiaAndBen(store);
  const app = { store: async () => store, refreshBoard: async () => undefined };
  await withArea({ backend, app }, async ({ holdOpen, concept, profile, profiles, key, handle, button }) => {
    await holdOpen();
    holdWrites = true;
    concept("Pause").add.click();
    await turn();
    profile("Ben").remove.click();
    assert.equal(key("Escape"), 1);
    assert.equal(handle.isOpen(), true, "Escape belonged to the confirmation that was asked for");
    holdWrites = false;
    while (release !== null) {
      const go = release;
      release = null;
      go();
      await turn();
    }
    await handle.settled();
    assert.equal(handle.isOpen(), true);
    assert.equal(button("Endgültig löschen"), undefined);
    assert.deepEqual(profiles().map((card) => [card.name, card.confirming]), [["Ben", false], ["Mia", false]]);
    assert.ok(concept("Pause").onBoard);
  });
});

// --- Header reasons ---

test("header: with no readable active profile and a damaged entry, it says that a stored profile cannot be read, not that none is active", async () => {
  const seed = async (store, backend) => {
    const mia = await createMia(store);
    await store.create("Ben", ["hilfe"]);
    await backend.write({ set: { [`profile/${mia.id}/meta`]: "kaputt" } });
  };
  await withArea({ seed }, async ({ holdOpen, afterClose, handle, boardRegion }) => {
    await holdOpen();
    // The same words as the note in the body.
    assert.equal(afterClose(), "Nach dem Schließen: Beispiele – ein gespeichertes Profil kann in dieser Version nicht gelesen werden.");
    await handle.close();
    assert.equal(boardRegion.dataset.boardFallback, "damaged");
  });
});

test("header: an active profile whose board cannot be read is said so", async () => {
  const inner = new MemoryBackend();
  let failing = false;
  const backend = {
    get: async (key) => { if (failing && key.includes("/data/")) throw new Error("read failed"); return inner.get(key); },
    keys: (prefix) => inner.keys(prefix),
    write: (batch) => inner.write(batch),
  };
  const seedStore = await ProfileStore.open(inner);
  const mia = await createMia(seedStore);
  await setBoardConcepts(seedStore, mia.id, ["hilfe"], CONCEPTS);
  await withArea({ backend }, async ({ holdOpen, afterClose, texts }) => {
    failing = true;
    await holdOpen();
    assert.equal(afterClose(), "Nach dem Schließen: Beispiele – die aktive Tafel kann gerade nicht gelesen werden.");
    assert.ok(texts().includes("Die Begriffe dieses Profils können gerade nicht gelesen werden."));
  });
});

test("undo: a removal of an earlier visit is not offered again behind a removal of this visit", async () => {
  await withArea({ seed: seedFive }, async ({ holdOpen, takeBack, remove, act, undo, handle, store, seeded }) => {
    await holdOpen();
    await remove("Pause");
    await handle.close();
    await holdOpen();
    assert.equal(undo(), null);
    await remove("Hilfe");
    assert.equal(undo().textContent, "Rückgängig: „Hilfe“");
    await takeBack();
    assert.equal(undo(), null);
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, ["hilfe", "trinken", "mehr", "fertig"]);
  });
});

// --- Deleting is a hold and then a release (card NG-31, third and fourth round) ---

/** One tap on a button as a browser reports it: down, up after `heldMs`, and the click that follows. */
function tap(control, clock, heldMs = 60) {
  control.dispatch("pointerdown", { button: 0 });
  clock.advance(heldMs);
  control.dispatch("pointerup");
  control.click();
}
const RELEASE_TO_DELETE = "Loslassen zum Löschen. Zum Abbrechen den Finger wegziehen.";

for (const [what, gaps] of [
  ["three taps at 0, 400 and 900 ms", [400, 500]],
  ["a tap every 300 ms for five seconds", Array(17).fill(300)],
  ["a tap every 150 ms for five seconds", Array(34).fill(150)],
  ["taps that are each held for almost the full time", Array(6).fill(10)],
]) {
  test(`delete: ${what} on 'Endgültig löschen' delete nothing`, async () => {
    await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, act, profile, confirmation, clock, backend, handle }) => {
      assert.equal(DELETE_HOLD_MS, 2000);
      await holdOpen();
      const before = JSON.stringify(backend.snapshot());
      await act(() => profile("Ben").remove.click());
      const { confirm, hint, progress } = confirmation();
      // There is nothing a click could do.
      assert.equal(confirm.handlers.click, undefined);
      const heldMs = what.startsWith("taps that are each held") ? DELETE_HOLD_MS - 1 : 60;
      tap(confirm, clock, heldMs);
      for (const gap of gaps) {
        clock.advance(Math.max(0, gap - heldMs));
        tap(confirm, clock, heldMs);
        await handle.settled();
      }
      clock.advance(DELETE_HOLD_MS);
      await handle.settled();
      assert.equal(JSON.stringify(backend.snapshot()), before);
      assert.equal(confirmation().confirm, confirm, "the confirmation is still open, and was not drawn again");
      // What a tap gets is the line that says how.
      assert.equal(hint.textContent, DELETE_HOLD_HINT);
      assert.equal(progress.hidden, true);
    });
  });
}

test("delete: holding 'Endgültig löschen' for two seconds asks to let go, and the release deletes once; letting go at 1999 ms does not", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, act, profile, confirmation, clock, backend, handle, status, store, focused, caregiverRegion, profiles }) => {
    await holdOpen();
    const before = JSON.stringify(backend.snapshot());
    await act(() => profile("Ben").remove.click());
    const { confirm, hint, progress } = confirmation();
    assert.equal(hint.role, "status");
    assert.equal(confirm["aria-describedby"], hint.id);
    assert.equal(progress.max, DELETE_HOLD_MS);
    assert.equal(progress.hidden, true);

    confirm.dispatch("pointerdown", { button: 0 });
    assert.equal(hint.textContent, "Weiter halten … 2");
    assert.equal(progress.hidden, false);
    clock.advance(1000);
    assert.equal(hint.textContent, "Weiter halten … 1");
    assert.equal(progress.value, 1000);
    clock.advance(999);
    confirm.dispatch("pointerup");
    clock.advance(5000);
    await handle.settled();
    assert.equal(JSON.stringify(backend.snapshot()), before, "released one millisecond early");
    assert.equal(hint.textContent, DELETE_HOLD_HINT);
    assert.equal(progress.hidden, true);
    assert.equal(progress.value, 0);

    // A new hold starts from zero and needs the full time. Then nothing happens while the finger is down.
    confirm.dispatch("pointerdown", { button: 0 });
    clock.advance(DELETE_HOLD_MS - 1);
    assert.equal(hint.textContent, "Weiter halten … 1");
    clock.advance(1);
    assert.equal(hint.textContent, RELEASE_TO_DELETE);
    assert.equal(progress.hidden, false);
    assert.equal(progress.value, DELETE_HOLD_MS);
    clock.advance(10_000);
    await handle.settled();
    assert.equal(JSON.stringify(backend.snapshot()), before, "the finger is still down: what a redraw would put under it cannot be pressed by the lift");
    assert.equal(confirmation().confirm, confirm);
    // More key-downs or presses while it waits for the release change nothing.
    confirm.dispatch("pointerdown", { button: 0 });
    assert.equal(hint.textContent, RELEASE_TO_DELETE);

    confirm.dispatch("pointerup");
    assert.equal(hint.textContent, "Wird gelöscht …");
    // The click that follows the lift lands on a button without a click handler.
    confirm.click();
    await handle.settled();
    assert.equal(status(), "Das Profil „Ben“ wurde gelöscht.");
    assert.deepEqual((await (await store()).list()).profiles.map((stored) => stored.displayName), ["Mia"]);
    // The normal body is back, with the focus on the heading of the list.
    assert.equal(confirmation(), null);
    assert.deepEqual(profiles().map((card) => card.name), ["Mia"]);
    assert.equal(focused.current, tree(caregiverRegion).find((element) => element.tagName === "h2" && element.textContent === "Profile"));
    // Holding the button that is no longer on screen is not a second delete, and no second message.
    confirm.dispatch("pointerdown", { button: 0 });
    clock.advance(DELETE_HOLD_MS);
    confirm.dispatch("pointerup");
    await handle.settled();
    assert.equal(status(), "Das Profil „Ben“ wurde gelöscht.");
  });
});

test("delete: the pointer leaving, a pointer cancel, losing focus, another mouse button and a long-press menu do not let a hold complete, nor a completed one delete", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, act, profile, confirmation, clock, backend, handle }) => {
    await holdOpen();
    const before = JSON.stringify(backend.snapshot());
    await act(() => profile("Ben").remove.click());
    const { confirm, hint, progress } = confirmation();
    for (const interruption of ["pointerleave", "pointercancel", "blur"]) {
      // During the hold.
      confirm.dispatch("pointerdown", { button: 0 });
      clock.advance(DELETE_HOLD_MS - 100);
      confirm.dispatch(interruption);
      clock.advance(5000);
      confirm.dispatch("pointerup");
      await handle.settled();
      assert.equal(JSON.stringify(backend.snapshot()), before, interruption);
      assert.equal(hint.textContent, DELETE_HOLD_HINT, interruption);
      assert.equal(clock.waiting(), 1, `${interruption}: only the idle timer is left`);
      // After it is complete, before the release.
      confirm.dispatch("pointerdown", { button: 0 });
      clock.advance(DELETE_HOLD_MS);
      assert.equal(hint.textContent, RELEASE_TO_DELETE);
      confirm.dispatch(interruption);
      assert.equal(hint.textContent, DELETE_HOLD_HINT, interruption);
      assert.equal(progress.hidden, true, interruption);
      confirm.dispatch("pointerup");
      await handle.settled();
      assert.equal(JSON.stringify(backend.snapshot()), before, `${interruption} after completion`);
    }
    confirm.dispatch("pointerdown", { button: 2 });
    clock.advance(DELETE_HOLD_MS);
    confirm.dispatch("pointerup");
    await handle.settled();
    assert.equal(JSON.stringify(backend.snapshot()), before);
    let prevented = 0;
    confirm.dispatch("contextmenu", { preventDefault() { prevented += 1; } });
    assert.equal(prevented, 1);
  });
});

for (const [what, leave] of [
  ["Escape", (area) => area.key("Escape")],
  ["'Abbrechen'", (area) => area.button("Abbrechen").click()],
  ["another action, pressed on a button of the body that was there before", (area, stale) => stale.click()],
  ["'Rückgängig'", (area) => area.undo().click()],
  ["a hidden page", (area) => area.page.hide()],
]) {
  for (const stage of ["under way", "complete and waits for the release"]) {
    test(`delete: a hold that is ${stage} when ${what} comes deletes nothing, also on the button that is still drawn`, async () => {
      await withArea({ seed: seedMiaAndBen }, async (area) => {
        const { holdOpen, act, profile, concept, remove, confirmation, clock, handle, store } = area;
        await holdOpen();
        await remove("Hilfe");
        const stale = concept("Pause").add;
        await act(() => profile("Ben").remove.click());
        const { confirm, hint, progress } = confirmation();
        confirm.dispatch("pointerdown", { button: 0 });
        clock.advance(stage === "under way" ? DELETE_HOLD_MS - 1 : DELETE_HOLD_MS);
        assert.equal(progress.hidden, false);
        leave(area, stale);
        // The hold ends there and then: no countdown runs on, and nothing waits for a release.
        assert.equal(hint.textContent, DELETE_HOLD_HINT);
        assert.equal(progress.hidden, true);
        // The finger is still down, then lifts; and a whole new hold and release on the old button, before the body is drawn again.
        clock.advance(1);
        confirm.dispatch("pointerup");
        confirm.dispatch("pointerdown", { button: 0 });
        clock.advance(DELETE_HOLD_MS);
        confirm.dispatch("pointerup");
        await handle.settled();
        assert.deepEqual((await (await store()).list()).profiles.map((stored) => stored.displayName).sort(), ["Ben", "Mia"]);
      });
    });
  }
}

for (const key of ["Enter", " "]) {
  test(`delete: holding ${key === " " ? "Space" : key} on 'Endgültig löschen' and letting go deletes; key repeat neither shortens nor restarts it, and an early release resets`, async () => {
    await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, act, profile, confirmation, clock, handle, store }) => {
      await holdOpen();
      const names = async () => (await (await store()).list()).profiles.map((stored) => stored.displayName).sort();
      await act(() => profile("Ben").remove.click());
      const { confirm, hint } = confirmation();
      let prevented = 0;
      const event = (repeat) => ({ key, repeat, preventDefault() { prevented += 1; } });
      // A short press of the key: what a click would have been.
      confirm.dispatch("keydown", event(false));
      assert.equal(prevented, 1, "the key must not also click or scroll");
      clock.advance(300);
      confirm.dispatch("keyup", { key });
      clock.advance(5000);
      await handle.settled();
      assert.deepEqual(await names(), ["Ben", "Mia"]);
      assert.equal(hint.textContent, DELETE_HOLD_HINT);
      // Held, with what a held key sends.
      confirm.dispatch("keydown", event(false));
      clock.advance(1000);
      confirm.dispatch("keydown", event(true));
      confirm.dispatch("keydown", event(false));
      assert.equal(hint.textContent, "Weiter halten … 1");
      // The release of another key does not end it.
      confirm.dispatch("keyup", { key: "a" });
      clock.advance(999);
      assert.equal(hint.textContent, "Weiter halten … 1");
      clock.advance(1);
      assert.equal(hint.textContent, RELEASE_TO_DELETE);
      // Still held, with repeats, and the release of another hold key: nothing yet.
      confirm.dispatch("keydown", event(true));
      confirm.dispatch("keyup", { key: key === " " ? "Enter" : " " });
      await handle.settled();
      assert.deepEqual(await names(), ["Ben", "Mia"]);
      confirm.dispatch("keyup", { key });
      await handle.settled();
      assert.deepEqual(await names(), ["Mia"]);
    });
  });
}

test("delete: a second confirmation starts from zero; time held on an earlier one does not count", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, act, profile, button, confirmation, clock, handle, store }) => {
    await holdOpen();
    const names = async () => (await (await store()).list()).profiles.map((stored) => stored.displayName).sort();
    await act(() => profile("Ben").remove.click());
    button("Endgültig löschen").dispatch("pointerdown", { button: 0 });
    clock.advance(1500);
    await act(() => button("Abbrechen").click());
    await act(() => profile("Mia").remove.click());
    const { confirm, hint } = confirmation();
    confirm.dispatch("pointerdown", { button: 0 });
    clock.advance(DELETE_HOLD_MS - 1);
    assert.equal(hint.textContent, "Weiter halten … 1");
    confirm.dispatch("pointerup");
    await handle.settled();
    assert.deepEqual(await names(), ["Ben", "Mia"]);
    confirm.dispatch("pointerdown", { button: 0 });
    clock.advance(DELETE_HOLD_MS);
    confirm.dispatch("pointerup");
    await handle.settled();
    // And it is the profile of the second confirmation that goes.
    assert.deepEqual(await names(), ["Ben"]);
  });
});

// --- The guard of "Entfernen" and "Rückgängig" ---

test("remove: the guard time is counted from the redraw of the list, not from the end of the write", async () => {
  const { inner, gate, backend } = gatedBackend();
  const mia = await seedFive(await ProfileStore.open(inner));
  await withArea({ backend }, async ({ holdOpen, act, concept, onBoard, clock, handle, store }) => {
    await holdOpen();
    // The write goes through; reading the store for the new list is held back for longer than the guard time.
    gate.onWrite = (batch) => { if (Object.keys(batch.set ?? {}).some((key) => key.endsWith("/meta"))) gate.hold(); };
    concept("Pause").remove.click();
    for (let round = 0; round < 20; round += 1) await turn();
    assert.equal(gate.held, true);
    gate.onWrite = () => undefined;
    clock.advance(GUARD_MS * 2);
    assert.deepEqual(onBoard(), ["Pause", "Hilfe", "Trinken", "Mehr", "Fertig"], "the old list is still on screen");
    gate.release();
    await handle.settled();
    // Only now is "Hilfe" where "Pause" was; from now the guard time runs.
    assert.deepEqual(onBoard(), ["Hilfe", "Trinken", "Mehr", "Fertig"]);
    assert.equal(concept("Hilfe").remove["aria-disabled"], "true");
    await act(() => concept("Hilfe").remove.click());
    assert.deepEqual((await (await store()).get(mia.id)).conceptIds, ["hilfe", "trinken", "mehr", "fertig"]);
    clock.advance(GUARD_MS);
    assert.equal(concept("Hilfe").remove["aria-disabled"], "false");
  });
});

test("remove: a press that is ignored starts the guard time again, so steady tapping takes one concept off, and the status line says to wait", async () => {
  await withArea({ seed: seedFive }, async ({ holdOpen, act, concept, onBoard, clock, focused, status, undo }) => {
    await holdOpen();
    // 0, 400 and 900 ms on one spot: the third tap comes after the first guard time would have ended.
    await act(() => concept("Pause").remove.click());
    clock.advance(400);
    await act(() => focused.current.click());
    assert.equal(status(), PLEASE_WAIT);
    clock.advance(500);
    await act(() => focused.current.click());
    assert.deepEqual(onBoard(), ["Hilfe", "Trinken", "Mehr", "Fertig"]);
    // Every 300 ms for five seconds.
    for (let taps = 0; taps < 17; taps += 1) {
      clock.advance(300);
      await act(() => focused.current.click());
    }
    assert.deepEqual(onBoard(), ["Hilfe", "Trinken", "Mehr", "Fertig"]);
    assert.equal(undo().textContent, "Rückgängig: „Pause“");
    // The guard time after the last ignored press, in full.
    clock.advance(GUARD_MS - 1);
    assert.equal(concept("Hilfe").remove["aria-disabled"], "true");
    clock.advance(1);
    assert.equal(concept("Hilfe").remove["aria-disabled"], "false");
    await act(() => focused.current.click());
    assert.deepEqual(onBoard(), ["Trinken", "Mehr", "Fertig"]);
    assert.equal(status(), "„Hilfe“ wurde von der Tafel genommen.");
  });
});

test("remove: rows that are swapped in show the guard as it is at that moment, not as it was while they were built", async () => {
  const { inner, gate, backend } = gatedBackend();
  await seedFive(await ProfileStore.open(inner));
  await withArea({ backend }, async ({ holdOpen, act, concept, concepts, onBoard, clock, handle }) => {
    await holdOpen();
    await act(() => concept("Pause").remove.click());
    // A move redraws the list. Its rows are built during the guard time; then the reading of the header line is held back.
    let dataReads = Number.NEGATIVE_INFINITY;
    const get = backend.get;
    backend.get = async (key) => {
      if (key.endsWith("/data/concept.hilfe")) {
        dataReads += 1;
        // After the write: once for the rows, once for the header line.
        if (dataReads === 2) gate.hold();
      }
      return get(key);
    };
    gate.onWrite = (batch) => { if (Object.keys(batch.set ?? {}).some((key) => key.endsWith("/meta"))) dataReads = 0; };
    concept("Fertig").up.click();
    for (let round = 0; round < 40; round += 1) await turn();
    assert.equal(gate.held, true);
    clock.advance(GUARD_MS);
    gate.release();
    await handle.settled();
    assert.deepEqual(onBoard(), ["Hilfe", "Trinken", "Fertig", "Mehr"]);
    // The guard time is over: the new buttons must not look inactive, and they act.
    assert.deepEqual(concepts().filter((row) => row.onBoard).map((row) => row.remove["aria-disabled"]), Array(4).fill("false"));
    await act(() => concept("Hilfe").remove.click());
    assert.deepEqual(onBoard(), ["Trinken", "Fertig", "Mehr"]);
  });
});

test("undo: 'Rückgängig' has the same guard: a second tap on the spot does not take the next removal back, and the button says how many more there are", async () => {
  await withArea({ seed: seedFive }, async ({ holdOpen, remove, act, undo, onBoard, clock, status }) => {
    await holdOpen();
    await remove("Pause");
    await remove("Hilfe");
    await remove("Trinken");
    assert.equal(undo().textContent, "Rückgängig: „Trinken“ (noch 2 weitere)");
    assert.equal(undo()["aria-label"], "Rückgängig: Trinken wieder auf die Tafel setzen (noch 2 weitere)");
    assert.equal(undo()["aria-disabled"], "false");
    await act(() => undo().click());
    assert.deepEqual(onBoard(), ["Trinken", "Mehr", "Fertig"]);
    // The next one is where the finger is, and looks inactive.
    assert.equal(undo().textContent, "Rückgängig: „Hilfe“ (noch 1 weiterer)");
    assert.equal(undo()["aria-disabled"], "true");
    await act(() => undo().click());
    assert.deepEqual(onBoard(), ["Trinken", "Mehr", "Fertig"]);
    assert.equal(status(), PLEASE_WAIT);
    // An ignored press starts the time again here as well.
    clock.advance(GUARD_MS - 1);
    await act(() => undo().click());
    clock.advance(GUARD_MS - 1);
    assert.equal(undo()["aria-disabled"], "true");
    clock.advance(1);
    assert.equal(undo()["aria-disabled"], "false");
    await act(() => undo().click());
    assert.deepEqual(onBoard(), ["Hilfe", "Trinken", "Mehr", "Fertig"]);
    assert.equal(undo().textContent, "Rückgängig: „Pause“");
  });
});

test("undo: 'Entfernen' and 'Rückgängig' are guarded apart: a removal can be taken back at once, and a concept removed right after an undo", async () => {
  await withArea({ seed: seedFive }, async ({ holdOpen, act, concept, undo, onBoard }) => {
    await holdOpen();
    await act(() => concept("Pause").remove.click());
    assert.equal(undo()["aria-disabled"], "false");
    await act(() => undo().click());
    assert.deepEqual(onBoard(), ["Pause", "Hilfe", "Trinken", "Mehr", "Fertig"]);
  });
  await withArea({ seed: seedFive }, async ({ holdOpen, remove, act, concept, undo, onBoard }) => {
    await holdOpen();
    await remove("Pause");
    await act(() => undo().click());
    await act(() => concept("Mehr").remove.click());
    assert.deepEqual(onBoard(), ["Pause", "Hilfe", "Trinken", "Fertig"]);
  });
});

// --- Messages by kind ---

test("status: an error stays when the area is scrolled and goes with the next press; it is marked as an error", async () => {
  await withArea({ seed: seedFive }, async ({ holdOpen, act, concept, status, backend, caregiverRegion, remove, undo }) => {
    await holdOpen();
    const element = statusElement(caregiverRegion);
    backend.failWrite(1);
    await act(() => concept("Pause").remove.click());
    const failure = "Das konnte gerade nicht gespeichert werden. Bitte versuche es noch einmal. Die Tafel ist unverändert.";
    assert.equal(status(), failure);
    assert.ok(hasClass(element, "caregiver-status-error"));
    for (const type of ["wheel", "touchmove"]) {
      caregiverRegion.dispatch(type);
      assert.equal(status(), failure, type);
    }
    // The next press takes it away (with its redraw), and a success is not marked.
    await remove("Pause");
    assert.equal(status(), "„Pause“ wurde von der Tafel genommen.");
    assert.ok(!hasClass(element, "caregiver-status-error"));
    caregiverRegion.dispatch("wheel");
    assert.equal(status(), "");
    // A refused name is an error too; "Bitte kurz warten." is not.
    await act(() => concept("Hilfe").remove.click());
    await act(() => concept("Trinken").remove.click());
    assert.equal(status(), PLEASE_WAIT);
    caregiverRegion.dispatch("touchmove");
    assert.equal(status(), "");
    assert.notEqual(undo(), null);
  });
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, create, status, caregiverRegion }) => {
    await holdOpen();
    await create("Ben");
    caregiverRegion.dispatch("wheel");
    assert.equal(status(), nameTaken("Ben 2"));
    assert.ok(hasClass(statusElement(caregiverRegion), "caregiver-status-error"));
  });
});

// --- Names: the way out ---

test("names: the example in the refusal is the typed name with the first free number, and is left out when it would be too long", async () => {
  const long = "x".repeat(39);
  const seed = async (store) => {
    await store.create("Amy", []);
    await store.create("amy 2", []);
    await store.create(long, []);
  };
  await withArea({ seed }, async ({ holdOpen, create, status }) => {
    await holdOpen();
    await create(" AMY ");
    assert.equal(status(), nameTaken("AMY 3"));
    await create(long);
    assert.equal(status(), "Diesen Namen gibt es schon. Bitte wähle einen anderen.");
  });
});

// --- Escape from anywhere ---

test("leaving: Escape closes also when the focus is on nothing inside the area; with the area closed the key is left alone", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, act, profile, profiles, handle, refreshes }) => {
    const pressOnPage = () => {
      let prevented = 0;
      // What the document gets when the body has the focus.
      globalThis.document.dispatch("keydown", { key: "Escape", target: { tagName: "BODY" }, preventDefault() { prevented += 1; } });
      return prevented;
    };
    // Closed: the child's board is on screen, and the key is not touched.
    assert.equal(pressOnPage(), 0);
    assert.equal(handle.isOpen(), false);
    assert.equal(refreshes.count, 0);
    await holdOpen();
    // The innermost thing first, here as well.
    await act(() => profile("Ben").remove.click());
    await act(() => { assert.equal(pressOnPage(), 1); });
    assert.equal(handle.isOpen(), true);
    assert.equal(profiles().some((card) => card.confirming), false);
    assert.equal(pressOnPage(), 1);
    assert.equal(handle.isOpen(), false);
    await handle.close();
    assert.equal(refreshes.count, 1);
    assert.equal(pressOnPage(), 0);
  });
});

test("leaving: an Escape that bubbles from the area to the document is answered once", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, act, profile, profiles, handle, caregiverRegion }) => {
    await holdOpen();
    await act(() => profile("Ben").remove.click());
    // One event object, seen by the region and then by the document: it cancels the confirmation and does not also close.
    const event = { key: "Escape", target: caregiverRegion, preventDefault() {} };
    caregiverRegion.handlers.keydown(event);
    globalThis.document.handlers.keydown(event);
    await handle.settled();
    assert.equal(handle.isOpen(), true);
    assert.equal(profiles().some((card) => card.confirming), false);
  });
});

test("header: several damaged entries are counted in the header line as in the body", async () => {
  const seed = async (store, backend) => {
    await backend.write({ set: { [`profile/${"a".repeat(32)}/meta`]: "kaputt", [`profile/${"b".repeat(32)}/meta`]: "kaputt" } });
  };
  await withArea({ seed }, async ({ holdOpen, afterClose }) => {
    await holdOpen();
    assert.equal(afterClose(), "Nach dem Schließen: Beispiele – 2 gespeicherte Profile können in dieser Version nicht gelesen werden.");
  });
});

// --- The press shield: a press counts only on what was on screen when it began (card NG-31, fourth round) ---

/** A time the test moves by hand, for "when did the press begin" and "when was this put on screen". */
function wallClock() {
  const wall = { t: 100_000 };
  wall.now = () => wall.t;
  return wall;
}

test("shield: a click whose press began before the content under it was swapped does nothing, however late it comes; a new press counts", async () => {
  const wall = wallClock();
  await withArea({ seed: createMia, now: wall.now }, async ({ holdOpen, concept, handle, onBoard }) => {
    assert.equal(SHIELD_GRACE_MS, 300);
    await holdOpen();
    wall.t += 1000;
    // A finger goes down on "Hinzufügen" of "Hilfe" ...
    concept("Hilfe").add.dispatch("pointerdown", { pointerId: 7, button: 0 });
    // ... and before it lifts, the list is drawn again (here: an add by a click that has no press of its own).
    concept("Trinken").add.click();
    await handle.settled();
    assert.deepEqual(onBoard(), ["Trinken"]);
    // The lift: the click goes to whatever is there now. It is not what the finger went down on.
    let prevented = 0;
    for (const later of [0, 299, 300, 60_000]) {
      wall.t += later;
      concept("Hilfe").add.click({ pointerId: 7, detail: 1, preventDefault() { prevented += 1; } });
      concept("Pause").add.click({ pointerId: 7, detail: 1, preventDefault() { prevented += 1; } });
    }
    await handle.settled();
    assert.deepEqual(onBoard(), ["Trinken"]);
    assert.equal(prevented, 8, "the swallowed click is also kept from its default action");
    // A pointer whose press the area never saw (it went down on something that is gone) does not count either.
    concept("Pause").add.click({ pointerId: 99, detail: 1 });
    await handle.settled();
    assert.deepEqual(onBoard(), ["Trinken"]);
    // A press that begins now, on what is on screen now, counts.
    const button = concept("Pause").add;
    button.dispatch("pointerdown", { pointerId: 8, button: 0 });
    button.click({ pointerId: 8, detail: 1 });
    await handle.settled();
    assert.deepEqual(onBoard(), ["Trinken", "Pause"]);
  });
});

test("shield: a press that begins within the grace time after a swap does nothing: what has just appeared under a finger is not a target", async () => {
  const wall = wallClock();
  await withArea({ seed: createMia, now: wall.now }, async ({ holdOpen, concept, handle, onBoard }) => {
    await holdOpen();
    wall.t += 1000;
    concept("Trinken").add.click();
    await handle.settled();
    // A click without a press of its own (assistive technology) begins when it arrives.
    wall.t += SHIELD_GRACE_MS - 1;
    concept("Pause").add.click();
    await handle.settled();
    assert.deepEqual(onBoard(), ["Trinken"]);
    wall.t += 1;
    concept("Pause").add.click();
    await handle.settled();
    assert.deepEqual(onBoard(), ["Trinken", "Pause"]);
    // A pointer: it is the moment the finger goes down that counts, not the moment of the click.
    wall.t += SHIELD_GRACE_MS - 1;
    concept("Mehr").add.dispatch("pointerdown", { pointerId: 3, button: 0 });
    wall.t += 5000;
    concept("Mehr").add.click({ pointerId: 3, detail: 1 });
    await handle.settled();
    assert.deepEqual(onBoard(), ["Trinken", "Pause"]);
    concept("Mehr").add.dispatch("pointerdown", { pointerId: 4, button: 0 });
    concept("Mehr").add.click({ pointerId: 4, detail: 1 });
    await handle.settled();
    assert.deepEqual(onBoard(), ["Trinken", "Pause", "Mehr"]);
  });
});

test("shield: a key that is held across a swap activates nothing on the new content; let go and pressed again, it does", async () => {
  const wall = wallClock();
  await withArea({ seed: seedFive, now: wall.now }, async ({ holdOpen, concept, handle, onBoard, focused, clock }) => {
    await holdOpen();
    wall.t += 1000;
    // Enter goes down on "nach unten" of "Pause"; the browser clicks at once.
    const first = concept("Pause").down;
    first.dispatch("keydown", { key: "Enter", repeat: false });
    first.click();
    await handle.settled();
    assert.deepEqual(onBoard(), ["Hilfe", "Pause", "Trinken", "Mehr", "Fertig"]);
    // Still held: every repeat clicks the button that has the focus now. None of them counts, also much later.
    for (const later of [50, 400, 5000]) {
      wall.t += later;
      focused.current.dispatch("keydown", { key: "Enter", repeat: true });
      focused.current.click();
    }
    await handle.settled();
    assert.deepEqual(onBoard(), ["Hilfe", "Pause", "Trinken", "Mehr", "Fertig"]);
    // Released and pressed again.
    focused.current.dispatch("keyup", { key: "Enter" });
    wall.t += 100;
    focused.current.dispatch("keydown", { key: "Enter", repeat: false });
    focused.current.click();
    await handle.settled();
    assert.deepEqual(onBoard(), ["Hilfe", "Trinken", "Pause", "Mehr", "Fertig"]);
    focused.current.dispatch("keyup", { key: "Enter" });

    // Space clicks on the key-up: the press that counts is the key-down.
    wall.t += SHIELD_GRACE_MS - 1;
    const second = concept("Mehr").up;
    second.dispatch("keydown", { key: " ", repeat: false });
    wall.t += 1000;
    second.dispatch("keyup", { key: " " });
    second.click();
    await handle.settled();
    assert.deepEqual(onBoard(), ["Hilfe", "Trinken", "Pause", "Mehr", "Fertig"], "the key went down within the grace time");
    // Long after that key was let go, a click without a press of its own is judged by its own time.
    wall.t += 1000;
    concept("Mehr").up.click();
    await handle.settled();
    assert.deepEqual(onBoard(), ["Hilfe", "Trinken", "Mehr", "Pause", "Fertig"]);
    assert.equal(clock.waiting(), 1);
    // A key-down that was never followed by a repeat or a key-up (the window lost the focus) is not "still held" for good.
    wall.t += 1000;
    concept("Fertig").up.dispatch("keydown", { key: "Enter", repeat: false });
    concept("Fertig").up.click();
    await handle.settled();
    assert.deepEqual(onBoard(), ["Hilfe", "Trinken", "Mehr", "Fertig", "Pause"]);
    wall.t += 5000;
    concept("Fertig").up.click();
    await handle.settled();
    assert.deepEqual(onBoard(), ["Hilfe", "Trinken", "Fertig", "Mehr", "Pause"]);
  });
  // A repeat of a key that went down before the area had the focus: no press was seen, so it began before.
  await withArea({ seed: seedFive, now: wall.now }, async ({ holdOpen, concept, handle, onBoard }) => {
    await holdOpen();
    wall.t += 1000;
    concept("Pause").down.dispatch("keydown", { key: "Enter", repeat: true });
    concept("Pause").down.click();
    await handle.settled();
    assert.deepEqual(onBoard(), ["Pause", "Hilfe", "Trinken", "Mehr", "Fertig"]);
  });
});

test("shield: it does not eat Escape, other keys or typed text, and a form is sent once it has been on screen for the grace time", async () => {
  const wall = wallClock();
  await withArea({ seed: createMia, now: wall.now }, async ({ holdOpen, key, handle, nameInput, createForm, profiles, profile, renameInput, concept, caregiverRegion }) => {
    await holdOpen();
    // Right after the swap: a letter and Tab pass, a text field takes its input.
    let stopped = 0;
    for (const pressed of ["a", "Tab"]) caregiverRegion.dispatch("keydown", { key: pressed, target: nameInput(), stopPropagation() { stopped += 1; } });
    nameInput().value = "Ben";
    nameInput().dispatch("input");
    assert.equal(nameInput().value, "Ben");
    // Enter in the field sends the form; not while the form has only just appeared.
    createForm().dispatch("submit");
    await handle.settled();
    assert.deepEqual(profiles().map((card) => card.name), ["Mia"]);
    wall.t += SHIELD_GRACE_MS;
    createForm().dispatch("submit");
    await handle.settled();
    assert.deepEqual(profiles().map((card) => card.name), ["Ben", "Mia"]);
    // The same for the rename form.
    wall.t += 1000;
    profile("Ben").rename.click();
    await handle.settled();
    renameInput().value = "Benno";
    byClass(caregiverRegion, "caregiver-rename").dispatch("submit");
    await handle.settled();
    assert.deepEqual(profiles().map((card) => card.name), [null, "Mia"]);
    wall.t += SHIELD_GRACE_MS;
    byClass(caregiverRegion, "caregiver-rename").dispatch("submit");
    await handle.settled();
    assert.deepEqual(profiles().map((card) => card.name), ["Benno", "Mia"]);
    // Escape right after that redraw still closes.
    nameInput().value = "";
    assert.equal(key("Escape", concept("Hilfe").add), 1);
    assert.equal(handle.isOpen(), false);
  });
});

test("shield: a new undo button and a changed status line count as content that has just appeared", async () => {
  const wall = wallClock();
  await withArea({ seed: seedFive, now: wall.now }, async ({ holdOpen, concept, undo, handle, onBoard, clock, status }) => {
    await holdOpen();
    wall.t += 1000;
    concept("Pause").remove.click();
    await handle.settled();
    clock.advance(GUARD_MS);
    // The button "Rückgängig" appeared in the block at the top with this redraw.
    wall.t += SHIELD_GRACE_MS - 1;
    undo().click();
    await handle.settled();
    assert.deepEqual(onBoard(), ["Hilfe", "Trinken", "Mehr", "Fertig"]);
    wall.t += 1;
    undo().click();
    await handle.settled();
    assert.deepEqual(onBoard(), ["Pause", "Hilfe", "Trinken", "Mehr", "Fertig"]);
    // "Bitte kurz warten." changes the height of the block, and so the place of everything below it.
    clock.advance(GUARD_MS);
    wall.t += 1000;
    concept("Pause").remove.click();
    await handle.settled();
    wall.t += 1000;
    concept("Hilfe").remove.click();
    assert.equal(status(), PLEASE_WAIT);
    wall.t += SHIELD_GRACE_MS - 1;
    concept("Fertig").up.click();
    await handle.settled();
    assert.deepEqual(onBoard(), ["Hilfe", "Trinken", "Mehr", "Fertig"]);
    wall.t += 1;
    concept("Fertig").up.click();
    await handle.settled();
    assert.deepEqual(onBoard(), ["Hilfe", "Trinken", "Fertig", "Mehr"]);
  });
});

test("shield: a hold on 'Endgültig löschen' does not start while the confirmation has only just appeared", async () => {
  const wall = wallClock();
  await withArea({ seed: seedMiaAndBen, now: wall.now }, async ({ holdOpen, profile, confirmation, clock, handle, store, caregiverRegion }) => {
    await holdOpen();
    wall.t += 1000;
    profile("Ben").remove.click();
    await handle.settled();
    typeDeleteName(caregiverRegion);
    const { confirm, hint, progress } = confirmation();
    const names = async () => (await (await store()).list()).profiles.map((stored) => stored.displayName).sort();
    for (const start of [(control) => control.dispatch("pointerdown", { button: 0 }), (control) => control.dispatch("keydown", { key: "Enter", repeat: false })]) {
      wall.t = wall.t - (wall.t % 1) + 0;
      const appeared = wall.t;
      wall.t = appeared + SHIELD_GRACE_MS - 1;
      start(confirm);
      assert.equal(hint.textContent, DELETE_HOLD_HINT);
      assert.equal(progress.hidden, true);
      clock.advance(DELETE_HOLD_MS);
      confirm.dispatch("pointerup");
      confirm.dispatch("keyup", { key: "Enter" });
      await handle.settled();
      assert.deepEqual(await names(), ["Ben", "Mia"]);
      wall.t = appeared;
    }
    wall.t += SHIELD_GRACE_MS;
    confirm.dispatch("pointerdown", { button: 0 });
    assert.equal(hint.textContent, "Weiter halten … 2");
    clock.advance(DELETE_HOLD_MS);
    confirm.dispatch("pointerup");
    await handle.settled();
    assert.deepEqual(await names(), ["Mia"]);
  });
});

// --- A hold belongs to the button that is on screen ---

test("hold: a redraw that replaces 'Endgültig löschen' ends the hold on it; the button that is gone can neither finish nor start one", async () => {
  const { inner, gate, backend } = gatedBackend();
  await seedMiaAndBen(await ProfileStore.open(inner));
  await withArea({ backend }, async ({ holdOpen, concept, profile, confirmation, clock, handle, store, caregiverRegion }) => {
    await holdOpen();
    const names = async () => (await (await store()).list()).profiles.map((stored) => stored.displayName).sort();
    // After the next swap of the body, storage is held: the redraw behind it waits.
    const body = byClass(caregiverRegion, "caregiver-body");
    const swap = body.replaceChildren.bind(body);
    let holdNext = true;
    body.replaceChildren = (...nodes) => {
      swap(...nodes);
      if (holdNext) gate.hold();
      holdNext = false;
    };
    // A write is under way when "Löschen" is pressed: its redraw already shows the confirmation, and the redraw for "Löschen" follows.
    concept("Pause").add.click();
    profile("Ben").remove.click();
    for (let round = 0; round < 40; round += 1) await turn();
    assert.equal(gate.held, true);
    typeDeleteName(caregiverRegion);
    const first = confirmation();
    first.confirm.dispatch("pointerdown", { button: 0 });
    clock.advance(500);
    assert.equal(first.progress.hidden, false);
    gate.release();
    await handle.settled();
    const second = confirmation();
    assert.notEqual(second.confirm, first.confirm);
    // The hold ended when its button left the screen, not two seconds later.
    assert.equal(first.hint.textContent, DELETE_HOLD_HINT);
    assert.equal(first.progress.hidden, true);
    clock.advance(DELETE_HOLD_MS);
    first.confirm.dispatch("pointerup");
    await handle.settled();
    assert.deepEqual(await names(), ["Ben", "Mia"]);
    // The finger never lifted and presses on: the old button starts nothing, although the confirmation for Ben is open.
    first.confirm.dispatch("pointerdown", { button: 0 });
    assert.equal(first.progress.hidden, true);
    clock.advance(DELETE_HOLD_MS);
    first.confirm.dispatch("pointerup");
    await handle.settled();
    assert.deepEqual(await names(), ["Ben", "Mia"]);
    assert.equal(second.hint.textContent, DELETE_HOLD_HINT);
    assert.equal(second.progress.hidden, true);
    // The button that is on screen works.
    second.confirm.dispatch("pointerdown", { button: 0 });
    clock.advance(DELETE_HOLD_MS);
    second.confirm.dispatch("pointerup");
    await handle.settled();
    assert.deepEqual(await names(), ["Mia"]);
  });
});

/** The area on a store whose writes the test can hold; Mia (active, Hilfe) and Ben. A stale rename form of Mia is what queues a slow write while a confirmation is open. */
async function withHeldWrites(callback) {
  const inner = new MemoryBackend();
  const writes = { held: false, waiting: [] };
  const backend = {
    get: (key) => inner.get(key),
    keys: (prefix) => inner.keys(prefix),
    async write(batch) {
      if (writes.held) await new Promise((resolve) => { writes.waiting.push(resolve); });
      return inner.write(batch);
    },
  };
  writes.release = async () => {
    writes.held = false;
    while (writes.waiting.length > 0) {
      writes.waiting.shift()();
      await turn();
    }
  };
  const store = await ProfileStore.open(backend);
  await seedMiaAndBen(store);
  const app = { store: async () => store, refreshBoard: async () => undefined };
  await withArea({ backend, app }, async (area) => {
    const { holdOpen, act, profile, renameInput, button, caregiverRegion, confirmation, clock } = area;
    await holdOpen();
    await act(() => profile("Mia").rename.click());
    const staleForm = byClass(caregiverRegion, "caregiver-rename");
    renameInput().value = "Mia X";
    await act(() => button("Abbrechen").click());
    await act(() => profile("Ben").remove.click());
    writes.held = true;
    staleForm.dispatch("submit");
    await turn();
    const holdAndRelease = () => {
      const { confirm } = confirmation();
      confirm.dispatch("pointerdown", { button: 0 });
      clock.advance(DELETE_HOLD_MS);
      confirm.dispatch("pointerup");
    };
    const names = async () => (await store.list()).profiles.map((stored) => stored.displayName).sort();
    await callback({ ...area, writes, holdAndRelease, names });
  });
}

for (const [what, leave] of [["Escape", (area) => area.key("Escape")], ["'Abbrechen'", (area) => area.button("Abbrechen").click()]]) {
  test(`delete: a completed hold whose delete waits behind a slow write deletes nothing after ${what}`, async () => {
    await withHeldWrites(async (area) => {
      const { writes, holdAndRelease, names, handle, confirmation, status } = area;
      holdAndRelease();
      assert.equal(confirmation().hint.textContent, "Wird gelöscht …");
      leave(area);
      await writes.release();
      await handle.settled();
      // The write before it went through; the delete that was taken back did not.
      assert.deepEqual(await names(), ["Ben", "Mia X"]);
      assert.equal(confirmation(), null);
      assert.ok(!/gelöscht/.test(status()));
    });
  });
}

test("delete: two completed holds while the first delete still waits behind a slow write are one delete and one message", async () => {
  await withHeldWrites(async ({ writes, holdAndRelease, names, handle, status, caregiverRegion }) => {
    holdAndRelease();
    holdAndRelease();
    await writes.release();
    await handle.settled();
    assert.deepEqual(await names(), ["Mia X"]);
    assert.equal(status(), "Das Profil „Ben“ wurde gelöscht.");
    assert.ok(!hasClass(statusElement(caregiverRegion), "caregiver-status-error"));
  });
});

test("rename: a rename that was sent from a form that is gone does not close a confirmation that is open meanwhile", async () => {
  await withHeldWrites(async ({ writes, names, handle, confirmation }) => {
    await writes.release();
    await handle.settled();
    assert.deepEqual(await names(), ["Ben", "Mia X"]);
    assert.notEqual(confirmation(), null);
  });
});

// --- A hold needs the finger on the button ---

const BOX = { left: 100, right: 300, top: 500, bottom: 544 };
const INSIDE = { clientX: 200, clientY: 520 };
/** A point `distance` px outside the box, per side. */
const beyond = (distance) => [
  { clientX: BOX.left - distance, clientY: 520 }, { clientX: BOX.right + distance, clientY: 520 },
  { clientX: 200, clientY: BOX.top - distance }, { clientX: 200, clientY: BOX.bottom + distance },
];

test("hold: the opening control gives up the pointer capture and ends the hold when the pointer strays more than the tolerance from it", async () => {
  await withArea({ rect: () => BOX }, async ({ opener, hint, clock, handle }) => {
    assert.equal(HOLD_SLOP_PX, 8);
    const released = [];
    opener.releasePointerCapture = (id) => { released.push(id); };
    // A drift inside the tolerance, on every side: the hold goes on and opens.
    opener.dispatch("pointerdown", { button: 0, pointerId: 5, ...INSIDE });
    assert.deepEqual(released, [5], "without this a finger that slides off a touch screen is not reported as leaving");
    for (const point of beyond(HOLD_SLOP_PX)) {
      clock.advance(500);
      opener.dispatch("pointermove", { pointerId: 5, ...point });
    }
    assert.equal(hint.textContent, "Weiter halten … 1");
    clock.advance(HOLD_DURATION_MS - 2000);
    assert.equal(handle.isOpen(), true);
    await handle.close();
    // One pixel more, on each side: it ends without a word, and the lift is not "let go early".
    for (const point of beyond(HOLD_SLOP_PX + 1)) {
      opener.dispatch("pointerdown", { button: 0, pointerId: 6, ...INSIDE });
      clock.advance(HOLD_DURATION_MS - 100);
      opener.dispatch("pointermove", { pointerId: 6, ...point });
      assert.equal(hint.textContent, "");
      clock.advance(5000);
      opener.dispatch("pointerup", { pointerId: 6, ...point });
      assert.equal(handle.isOpen(), false);
      assert.equal(hint.textContent, "");
    }
    // A lift outside the button, without a move before it, is not a completed hold either.
    opener.dispatch("pointerdown", { button: 0, pointerId: 7, ...INSIDE });
    clock.advance(HOLD_DURATION_MS - 1);
    opener.dispatch("pointerup", { pointerId: 7, clientX: 200, clientY: 700 });
    clock.advance(5000);
    assert.equal(handle.isOpen(), false);
    assert.equal(hint.textContent, "");
    // A hold by key is not ended by a pointer that moves somewhere.
    opener.dispatch("keydown", { key: "Enter", repeat: false });
    opener.dispatch("pointermove", { pointerId: 8, clientX: 0, clientY: 0 });
    clock.advance(HOLD_DURATION_MS);
    assert.equal(handle.isOpen(), true);
  });
});

test("hold: 'Endgültig löschen' ends the hold when the finger slides off, and a lift outside the button after a completed hold deletes nothing", async () => {
  await withArea({ seed: seedMiaAndBen, rect: () => BOX }, async ({ holdOpen, act, profile, confirmation, clock, handle, store }) => {
    await holdOpen();
    const names = async () => (await (await store()).list()).profiles.map((stored) => stored.displayName).sort();
    await act(() => profile("Ben").remove.click());
    const { confirm, hint, progress } = confirmation();
    const released = [];
    confirm.releasePointerCapture = (id) => { released.push(id); };
    // Sliding off during the hold: below, above, to the side (onto "Abbrechen").
    for (const point of beyond(60)) {
      confirm.dispatch("pointerdown", { button: 0, pointerId: 1, ...INSIDE });
      clock.advance(1000);
      confirm.dispatch("pointermove", { pointerId: 1, ...point });
      assert.equal(hint.textContent, DELETE_HOLD_HINT);
      assert.equal(progress.hidden, true);
      clock.advance(2500);
      confirm.dispatch("pointerup", { pointerId: 1, ...point });
      await handle.settled();
      assert.deepEqual(await names(), ["Ben", "Mia"]);
    }
    assert.deepEqual(released, [1, 1, 1, 1]);
    // Completed, then the finger slides off before it lifts; and completed, then lifted outside.
    for (const leave of [(point) => confirm.dispatch("pointermove", { pointerId: 2, ...point }), () => undefined]) {
      confirm.dispatch("pointerdown", { button: 0, pointerId: 2, ...INSIDE });
      clock.advance(DELETE_HOLD_MS);
      assert.equal(hint.textContent, RELEASE_TO_DELETE);
      leave({ clientX: 200, clientY: BOX.bottom + 60 });
      confirm.dispatch("pointerup", { pointerId: 2, clientX: 200, clientY: BOX.bottom + 60 });
      assert.equal(hint.textContent, DELETE_HOLD_HINT);
      await handle.settled();
      assert.deepEqual(await names(), ["Ben", "Mia"]);
    }
    // A small drift, inside the tolerance, and the lift on the button: deleted.
    confirm.dispatch("pointerdown", { button: 0, pointerId: 3, ...INSIDE });
    clock.advance(1000);
    confirm.dispatch("pointermove", { pointerId: 3, clientX: 204, clientY: BOX.bottom + 6 });
    clock.advance(1000);
    assert.equal(hint.textContent, RELEASE_TO_DELETE);
    confirm.dispatch("pointerup", { pointerId: 3, clientX: 204, clientY: BOX.bottom + 6 });
    await handle.settled();
    assert.deepEqual(await names(), ["Mia"]);
  });
});

// --- The guards, once more ---

test("guard: when the wait is over, 'Bitte kurz warten.' gives the line back to the message it replaced, or clears it", async () => {
  await withArea({ seed: seedFive }, async ({ holdOpen, act, concept, clock, status, focused, takeBack, undo }) => {
    await holdOpen();
    await act(() => concept("Pause").remove.click());
    await act(() => focused.current.click());
    assert.equal(status(), PLEASE_WAIT);
    clock.advance(GUARD_MS);
    assert.equal(status(), "„Pause“ wurde von der Tafel genommen.");
    // The same for "Rückgängig"; and when the replaced message has gone meanwhile, the line is cleared.
    await act(() => concept("Hilfe").remove.click());
    clock.advance(GUARD_MS);
    await act(() => undo().click());
    await act(() => undo().click());
    assert.equal(status(), PLEASE_WAIT);
    clock.advance(GUARD_MS);
    assert.equal(status(), "„Hilfe“ ist wieder auf der Tafel.");
    await takeBack();
    assert.equal(undo(), null);
  });
  // An error that was replaced comes back as an error.
  await withArea({ seed: seedFive }, async ({ holdOpen, act, concept, clock, status, backend, caregiverRegion }) => {
    await holdOpen();
    await act(() => concept("Pause").remove.click());
    backend.failWrite(1);
    await act(() => concept("Fertig").up.click());
    assert.ok(hasClass(statusElement(caregiverRegion), "caregiver-status-error"));
    await act(() => concept("Hilfe").remove.click());
    assert.equal(status(), PLEASE_WAIT);
    assert.ok(!hasClass(statusElement(caregiverRegion), "caregiver-status-error"));
    clock.advance(GUARD_MS);
    assert.match(status(), /^Das konnte gerade nicht gespeichert werden/);
    assert.ok(hasClass(statusElement(caregiverRegion), "caregiver-status-error"));
  });
});

test("guard: a removal resets the guard of 'Rückgängig': undo, remove, undo in quick succession all count", async () => {
  await withArea({ seed: seedFive }, async ({ holdOpen, remove, act, concept, undo, onBoard }) => {
    await holdOpen();
    await remove("Pause");
    await act(() => undo().click());
    assert.deepEqual(onBoard(), ["Pause", "Hilfe", "Trinken", "Mehr", "Fertig"]);
    // The guard of "Rückgängig" would still run; the removal that follows can be taken back at once all the same.
    await act(() => concept("Mehr").remove.click());
    assert.equal(undo()["aria-disabled"], "false");
    await act(() => undo().click());
    assert.deepEqual(onBoard(), ["Pause", "Hilfe", "Trinken", "Mehr", "Fertig"]);
    assert.equal(undo(), null);
  });
});

test("guard: an undo whose write failed can be tried again at once", async () => {
  await withArea({ seed: seedFive }, async ({ holdOpen, remove, act, undo, onBoard, backend, status }) => {
    await holdOpen();
    await remove("Pause");
    backend.failWrite(1);
    await act(() => undo().click());
    assert.match(status(), /^Das konnte gerade nicht gespeichert werden/);
    assert.equal(undo()["aria-disabled"], "false");
    await act(() => undo().click());
    assert.deepEqual(onBoard(), ["Pause", "Hilfe", "Trinken", "Mehr", "Fertig"]);
  });
});

test("guard: the guards do not carry over to the next opening", async () => {
  await withArea({ seed: seedFive }, async ({ holdOpen, act, concept, concepts, handle, onBoard }) => {
    await holdOpen();
    await act(() => concept("Pause").remove.click());
    assert.equal(concept("Hilfe").remove["aria-disabled"], "true");
    await handle.close();
    // Opened again before the guard time of the last visit is over (no time passes on the test's clock).
    assert.equal(handle.open(), true);
    await handle.settled();
    assert.deepEqual(concepts().filter((row) => row.onBoard).map((row) => row.remove["aria-disabled"]), Array(4).fill("false"));
    await act(() => concept("Hilfe").remove.click());
    assert.deepEqual(onBoard(), ["Trinken", "Mehr", "Fertig"]);
  });
});

test("names: the example in the refusal may be exactly as long as a name may be", async () => {
  // 38 characters and " 2" are 40; 39 and " 2" are one too many.
  for (const [length, withExample] of [[38, true], [39, false]]) {
    const name = "x".repeat(length);
    await withArea({ seed: async (store) => { await store.create(name, []); } }, async ({ holdOpen, create, status }) => {
      await holdOpen();
      await create(name);
      assert.equal(status(), withExample ? nameTaken(`${name} 2`) : "Diesen Namen gibt es schon. Bitte wähle einen anderen.", `${length}`);
    });
  }
});

test("shield: 'Tafel neu laden' in the state without a board has only just appeared when the bound passes", async () => {
  const wall = wallClock();
  await withSlowRefresh(async (area) => {
    const { caregiverRegion, refresh, handle, write } = area;
    assert.equal(handle.open(), true);
    await handle.settled();
    wall.t += 1000;
    await write();
    wall.t += 1000;
    // The waiting line appears now; the button only when the bound passes, some time later.
    const closing = handle.close();
    await turn();
    wall.t += CLOSE_WAIT_MS;
    area.clock.advance(CLOSE_WAIT_MS);
    await closing;
    noBoard(area);
    const retry = buttonNamed(caregiverRegion, "Tafel neu laden");
    wall.t += SHIELD_GRACE_MS - 1;
    retry.click();
    await turn();
    assert.equal(refresh.calls, 1);
    wall.t += 1;
    retry.click();
    await turn();
    assert.equal(refresh.calls, 2);
    // The line became short ("wird geladen"), and long again when that attempt ran into its bound: both move the button.
    wall.t += SHIELD_GRACE_MS - 1;
    retry.click();
    await turn();
    assert.equal(refresh.calls, 2, "pressed too soon after the line changed");
    wall.t += CLOSE_WAIT_MS;
    area.clock.advance(CLOSE_WAIT_MS);
    await turn();
    assert.equal(caregiverRegion.children[0].textContent, NO_BOARD_YET);
    wall.t += SHIELD_GRACE_MS - 1;
    retry.click();
    await turn();
    assert.equal(refresh.calls, 2, "pressed too soon after the line came back");
    wall.t += 1;
    retry.click();
    await turn();
    assert.equal(refresh.calls, 3);
  }, { now: wall.now, open: false });
});

test("delete: a completed hold deletes only the profile whose confirmation is the open one, not the one that is still drawn", async () => {
  const { inner, gate, backend } = gatedBackend();
  await seedMiaAndBen(await ProfileStore.open(inner));
  await withArea({ backend }, async ({ holdOpen, act, profile, confirmation, clock, handle, store }) => {
    await holdOpen();
    const names = async () => (await (await store()).list()).profiles.map((stored) => stored.displayName).sort();
    const staleDeleteMia = profile("Mia").remove;
    await act(() => profile("Ben").remove.click());
    const { confirm } = confirmation();
    // "Löschen: Mia" is pressed (on a button from before), and its confirmation is not drawn yet: Ben's is still on screen.
    gate.hold();
    staleDeleteMia.click();
    confirm.dispatch("pointerdown", { button: 0 });
    clock.advance(DELETE_HOLD_MS);
    confirm.dispatch("pointerup");
    gate.release();
    await handle.settled();
    assert.deepEqual(await names(), ["Ben", "Mia"]);
    assert.deepEqual(confirmation().texts.slice(0, 1), ["Profil „Mia“ löschen?"]);
  });
});

// --- Fifth round ---

for (const stage of ["under way", "complete and waits for the release"]) {
  test(`delete: a second finger that goes down anywhere else ends a hold that is ${stage}; the first finger's lift deletes nothing`, async () => {
    await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, act, profile, confirmation, clock, handle, store }) => {
      await holdOpen();
      const names = async () => (await (await store()).list()).profiles.map((stored) => stored.displayName).sort();
      await act(() => profile("Ben").remove.click());
      const { confirm, cancel, hint, progress, view } = confirmation();
      for (const other of [cancel, view.children[0], view]) {
        confirm.dispatch("pointerdown", { button: 0, pointerId: 1 });
        clock.advance(stage === "under way" ? DELETE_HOLD_MS - 1 : DELETE_HOLD_MS);
        if (stage !== "under way") assert.equal(hint.textContent, RELEASE_TO_DELETE);
        other.dispatch("pointerdown", { button: 0, pointerId: 2 });
        assert.equal(hint.textContent, DELETE_HOLD_HINT);
        assert.equal(progress.hidden, true);
        clock.advance(DELETE_HOLD_MS);
        confirm.dispatch("pointerup", { pointerId: 1 });
        await handle.settled();
        assert.deepEqual(await names(), ["Ben", "Mia"]);
      }
    });
  });
}

test("delete: a pointer that goes down on 'Endgültig löschen' itself does not end its own hold", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, act, profile, confirmation, clock, handle, store }) => {
    await holdOpen();
    await act(() => profile("Ben").remove.click());
    const { confirm, hint } = confirmation();
    confirm.dispatch("pointerdown", { button: 0, pointerId: 1 });
    clock.advance(1000);
    confirm.dispatch("pointerdown", { button: 0, pointerId: 2 });
    assert.equal(hint.textContent, "Weiter halten … 1");
    clock.advance(1000);
    confirm.dispatch("pointerup", { pointerId: 1 });
    await handle.settled();
    assert.deepEqual((await (await store()).list()).profiles.map((stored) => stored.displayName), ["Mia"]);
  });
});

test("shield: the two summaries are not shielded, a button next to them is", async () => {
  const wall = wallClock();
  await withArea({ seed: createMia, now: wall.now }, async ({ holdOpen, concept, handle, onBoard, caregiverRegion, button, refreshes }) => {
    await holdOpen();
    wall.t += 1000;
    concept("Trinken").add.click();
    await handle.settled();
    // Right after that redraw: a summary still gets its click (the browser folds or unfolds it) ...
    const summaries = tree(caregiverRegion).filter((element) => element.tagName === "summary");
    assert.deepEqual(summaries.map((element) => element.textContent), ["Was wird gespeichert?", "Hilfe bei Problemen"]);
    let heard = 0;
    let prevented = 0;
    for (const summary of summaries) {
      summary.addEventListener("click", () => { heard += 1; });
      summary.click({ pointerId: 99, detail: 1, preventDefault() { prevented += 1; } });
      summary.click({ preventDefault() { prevented += 1; } });
    }
    assert.equal(heard, 4);
    assert.equal(prevented, 0);
    // ... and the button inside the help section does not act yet.
    button("Tafel neu laden").click();
    concept("Pause").add.click();
    await handle.settled();
    assert.equal(refreshes.count, 0);
    assert.deepEqual(onBoard(), ["Trinken"]);
    // Folding a section moves what is below it, so it counts as a swap: a press right after does nothing.
    for (const details of tree(caregiverRegion).filter((element) => element.tagName === "details")) {
      wall.t += 1000;
      details.dispatch("toggle", {});
      concept("Pause").add.click();
      await handle.settled();
      assert.deepEqual(onBoard(), ["Trinken"]);
    }
    wall.t += 1000;
    concept("Pause").add.click();
    await handle.settled();
    assert.deepEqual(onBoard(), ["Trinken", "Pause"]);
  });
});

test("shield: without an injected clock it runs on monotonic time, so a wall clock that is set back does not leave the buttons dead", async () => {
  const fakes = installFakes();
  const realDateNow = Date.now;
  const realPerformance = globalThis.performance;
  try {
    const store = await ProfileStore.open(new MemoryBackend());
    await createMia(store);
    const mount = () => {
      const boardRegion = fakes.fakeElement("section");
      boardRegion.dataset.startup = "profile";
      const caregiverRegion = fakes.fakeElement("section");
      const handle = mountCaregiver({
        app: { store: async () => store, refreshBoard: async () => undefined }, boardRegion, caregiverRegion, entry: fakes.fakeElement("footer"),
        catalogue: CONCEPTS, setTimer: () => () => undefined, onPageHidden: () => undefined,
      });
      return { handle, caregiverRegion };
    };
    const time = { monotonic: 5000, wall: 1_000_000 };
    Object.defineProperty(globalThis, "performance", { value: { now: () => time.monotonic }, configurable: true, writable: true });
    Date.now = () => time.wall;
    const first = mount();
    first.handle.open();
    await first.handle.settled();
    // Half a second later by the monotonic clock; the wall clock was set back by an hour meanwhile.
    time.monotonic += 500;
    time.wall -= 3_600_000;
    buttonNamed(first.caregiverRegion, "Hinzufügen").click();
    await first.handle.settled();
    assert.deepEqual((await store.list()).profiles[0].conceptIds, ["hilfe"]);
    // And it is that clock that the grace time is counted on.
    time.monotonic += SHIELD_GRACE_MS - 1;
    time.wall += 7_200_000;
    buttonNamed(first.caregiverRegion, "Hinzufügen").click();
    await first.handle.settled();
    assert.deepEqual((await store.list()).profiles[0].conceptIds, ["hilfe"]);
    // Where the platform has no such clock, the wall clock has to do.
    Object.defineProperty(globalThis, "performance", { value: undefined, configurable: true, writable: true });
    const second = mount();
    second.handle.open();
    await second.handle.settled();
    time.wall += SHIELD_GRACE_MS;
    buttonNamed(second.caregiverRegion, "Hinzufügen").click();
    await second.handle.settled();
    assert.deepEqual((await store.list()).profiles[0].conceptIds, ["hilfe", "trinken"]);
  } finally {
    Date.now = realDateNow;
    Object.defineProperty(globalThis, "performance", { value: realPerformance, configurable: true, writable: true });
    fakes.restore();
  }
});

test("the stylesheet reserves the height of the line under 'Endgültig löschen' on a narrow screen", async () => {
  const css = await readFile(new URL("../dist/styles.css", import.meta.url), "utf8");
  // Three lines of 1.4: the countdown is one line, the instruction up to three; the button above must not move when one replaces the other.
  assert.match(css, /^\.caregiver-confirm-hint \{[^}]*line-height: 1\.4;/m);
  assert.match(css, /@media \(max-width: 639px\) \{\n  \.caregiver-confirm-hint \{ min-height: 4\.2em; \}\n\}/);
});

// --- Rewording a concept (card NG-33) ---

/** Mia (active) with Hilfe, Trinken and Pause, each with the catalogue wording stored as a copy. */
const seedThree = async (store) => {
  const mia = await createMia(store);
  await setBoardConcepts(store, mia.id, ["hilfe", "trinken", "pause"], CONCEPTS);
  return mia;
};
const entryOf = (backend, profile, id) => backend.snapshot()[`profile/${profile.id}/data/concept.${id}`];

test("reword: 'Text ändern' is on every row of the board and on no row of 'Weitere Begriffe'; it opens fields that take over the body", async () => {
  await withArea({ seed: seedThree }, async ({ holdOpen, act, concepts, concept, rewording, caregiverRegion, focused, profiles }) => {
    await holdOpen();
    assert.deepEqual(concepts().map((row) => [row.onBoard, row.reword !== null]), [[true, true], [true, true], [true, true], [false, false], [false, false]]);
    assert.equal(concept("Trinken").reword["aria-label"], "Text ändern: Trinken");
    assert.equal(rewording(), null);
    await act(() => concept("Trinken").reword.click());
    const open = rewording();
    assert.deepEqual(open.texts, [
      "Text für „Trinken“ auf der Tafel von „Mia“", "Wort auf der Taste", "Gesprochener Satz",
      "Text der App: „Trinken“ – „Ich möchte etwas trinken.“", "Das Bild bleibt gleich.", "Speichern", "Abbrechen",
    ]);
    assert.equal(open.label.value, "Trinken");
    assert.equal(open.speech.value, "Ich möchte etwas trinken.");
    assert.equal(open.speech.tagName, "textarea");
    assert.equal(focused.current, open.label);
    for (const field of [open.label, open.speech]) {
      assert.equal(tree(open.view).find((element) => element.tagName === "label" && element.htmlFor === field.id) !== undefined, true);
      // No spelling service sees the text; capitals are left to the keyboard (German nouns, the start of a sentence).
      assert.deepEqual([field.autocomplete, field.spellcheck, field.autocapitalize, field.autocorrect], ["off", false, undefined, "off"]);
    }
    assert.equal(open.label.enterkeyhint, "next");
    // The whole body: no card, no list, no help; and no reset where the wording is the app's.
    assert.deepEqual(byClass(caregiverRegion, "caregiver-body").children, [open.view]);
    assert.deepEqual(profiles(), []);
    assert.equal(byClass(caregiverRegion, "caregiver-help").hidden, true);
    assert.equal(open.reset, null);
  });
});

test("reword: saving stores the wording through board data; the lists keep their order, and the child's board shows and speaks it after closing", async () => {
  await withArea({ seed: seedThree }, async ({ holdOpen, reword, concept, onBoard, more, status, store, seeded, backend, focused, rewording, handle, tiles, boardRegion, speech, caregiverRegion }) => {
    await holdOpen();
    const idsBefore = (await (await store()).get(seeded.id)).conceptIds;
    await reword("Trinken", "  Saft ", "Ich möchte Saft, bitte.");
    assert.equal(status(), "Gespeichert: neuer Text für „Saft“.");
    assert.ok(!hasClass(statusElement(caregiverRegion), "caregiver-status-error"));
    assert.deepEqual(entryOf(backend, seeded, "trinken"), { version: 1, labelDe: "Saft", speechDe: "Ich möchte Saft, bitte." });
    const board = await resolveBoard(await store(), seeded.id, CONCEPTS);
    assert.deepEqual(board.entries.map((entry) => [entry.id, entry.labelDe, entry.speechDe, entry.source]), [
      ["hilfe", "Hilfe", "Ich brauche Hilfe.", "catalogue"], ["trinken", "Saft", "Ich möchte Saft, bitte.", "catalogue"], ["pause", "Pause", "Ich brauche eine Pause.", "catalogue"],
    ]);
    // Back in the editor, drawn from the store: the row is where it was, with its picture, and has the focus on "Text ändern".
    assert.equal(rewording(), null);
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, idsBefore);
    assert.deepEqual(onBoard(), ["Hilfe", "Saft", "Pause"]);
    assert.deepEqual(more(), ["Mehr", "Fertig"]);
    assert.equal(concept("Saft").sentence, "Ich möchte Saft, bitte.");
    assert.equal(concept("Saft").picture, "./icons/trinken.svg");
    assert.equal(focused.current, concept("Saft").reword);
    await handle.close();
    assert.deepEqual(tiles(), ["Hilfe", "Saft", "Pause"]);
    const board2 = boardRegion.children.find((child) => child.className.split(" ")[0] === "concept-board");
    board2.children.filter((child) => child.tagName === "button")[1].click();
    assert.deepEqual(speech.spoken.slice(-1), ["Ich möchte Saft, bitte."]);
  });
});

test("reword: on a mixed board no id changes its place, the other entries stay byte-identical, and a custom and a retired concept can be reworded but not reset", async () => {
  await withArea({ seed: seedMixedBoard }, async ({ holdOpen, reword, act, concept, concepts, rewording, store, seeded, backend, handle, tiles }) => {
    await holdOpen();
    const others = () => JSON.stringify(["neu", "alt", "ball", "hilfe"].map((id) => entryOf(backend, seeded, id)));
    const before = others();
    const names = () => concepts().map((row) => row.name);
    const order = names();
    await reword("Trinken", "Saft", "Saft, bitte.");
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, MIXED_IDS);
    assert.equal(others(), before);
    assert.deepEqual(names(), order.map((name) => (name === "Trinken" ? "Saft" : name)));
    // A custom concept: stays custom, has no text of the app to show or to go back to.
    await act(() => concept("Ball").reword.click());
    assert.deepEqual(rewording().texts, ["Text für „Ball“ auf der Tafel von „Mia“", "Wort auf der Taste", "Gesprochener Satz", "Speichern", "Abbrechen"]);
    await act(() => rewording().cancel.click());
    await reword("Ball", "Fußball", "Ich möchte Fußball spielen.");
    assert.deepEqual(entryOf(backend, seeded, "ball"), { version: 1, labelDe: "Fußball", speechDe: "Ich möchte Fußball spielen.", custom: true });
    await act(() => concept("Fußball").reword.click());
    assert.equal(rewording().reset, null);
    await act(() => rewording().cancel.click());
    // A retired concept: the fields say that it is no longer in the selection.
    await act(() => concept("Schaukel").reword.click());
    assert.ok(rewording().texts.includes("Dieser Begriff ist nicht mehr in der Auswahl."));
    assert.equal(rewording().reset, null);
    await act(() => rewording().cancel.click());
    await reword("Schaukel", "Schaukeln", "Ich will schaukeln.");
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, MIXED_IDS);
    assert.deepEqual(names(), order.map((name) => ({ Trinken: "Saft", Ball: "Fußball", Schaukel: "Schaukeln" }[name] ?? name)));
    await handle.close();
    assert.deepEqual(tiles(), ["Hilfe", "Saft", "Schaukeln", "Fußball", "Pause"]);
  });
});

test("reword: saving text that is what is stored writes nothing, says nothing and returns to the row", async () => {
  await withArea({ seed: seedThree }, async ({ holdOpen, reword, concept, status, backend, focused, rewording }) => {
    await holdOpen();
    const before = JSON.stringify(backend.snapshot());
    await reword("Trinken", " Trinken", "Ich möchte etwas trinken.\n");
    assert.equal(JSON.stringify(backend.snapshot()), before);
    assert.equal(status(), "");
    assert.equal(rewording(), null);
    assert.equal(focused.current, concept("Trinken").reword);
  });
});

const REWORD_REFUSALS = [
  ["an empty word", "   ", "Satz.", "label", "Bitte gib ein Wort für die Taste ein."],
  ["an empty sentence", "Saft", " \n ", "speech", "Bitte gib einen Satz ein, den das Gerät sprechen soll."],
  ["a word of 41 characters", "x".repeat(41), "Satz.", "label", "Das Wort ist zu lang. Es darf höchstens 40 Zeichen haben."],
  ["a sentence of 201 characters", "Saft", "x".repeat(201), "speech", "Der Satz ist zu lang. Er darf höchstens 200 Zeichen haben."],
  ["a word of only invisible characters", `${chr(0x200b)}${chr(0xad)}`, "Satz.", "label", "Bitte gib ein Wort für die Taste ein."],
  ["a control character in the word", "Sa\u0007ft", "Satz.", "label", "Das Wort enthält unsichtbare Zeichen oder Steuerzeichen. Bitte tippe den Text neu ein."],
  ["a right-to-left override in the sentence", "Saft", `${chr(0x202e)}Satz.`, "speech", "Der Satz enthält unsichtbare Zeichen oder Steuerzeichen. Bitte tippe den Text neu ein."],
];
for (const [what, label, speech, field, sentence] of REWORD_REFUSALS) {
  test(`reword: ${what} is refused in German, as an error; the fields stay open with what was typed, and the focus is in the field`, async () => {
    await withArea({ seed: seedThree }, async ({ holdOpen, reword, status, backend, rewording, focused, texts, caregiverRegion }) => {
      await holdOpen();
      const before = JSON.stringify(backend.snapshot());
      await reword("Trinken", label, speech);
      assert.equal(status(), sentence);
      assert.ok(hasClass(statusElement(caregiverRegion), "caregiver-status-error"));
      assert.equal(JSON.stringify(backend.snapshot()), before);
      const open = rewording();
      assert.equal(open.label.value, label);
      assert.equal(open.speech.value, speech);
      assert.equal(focused.current, open[field]);
      assert.ok(!texts().some((text) => /labelDe|speechDe|Error|must|characters/.test(text)));
    });
  });
}

test("reword: 40 and 200 characters, counted as characters, are accepted", async () => {
  await withArea({ seed: seedThree }, async ({ holdOpen, reword, backend, seeded }) => {
    await holdOpen();
    await reword("Trinken", "😀".repeat(40), "ä".repeat(200));
    assert.deepEqual(entryOf(backend, seeded, "trinken"), { version: 1, labelDe: "😀".repeat(40), speechDe: "ä".repeat(200) });
  });
});

test("reword: a profile that is full refuses in German and says what frees room; a failed write says so; both keep the text", async () => {
  const backend = new MemoryBackend();
  const store = await ProfileStore.open(backend, { limits: { maxDataNames: 0 } });
  // A board made without stored wording: the first own wording needs room for an entry, and there is none.
  const mia = await store.create("Mia", ["trinken"]);
  await store.setActive(mia.id);
  const app = { store: async () => store, refreshBoard: async () => undefined };
  await withArea({ backend, app }, async ({ holdOpen, reword, status, rewording, caregiverRegion }) => {
    await holdOpen();
    await reword("Trinken", "Saft", "Saft, bitte.");
    assert.equal(status(), "Der Platz für dieses Profil ist voll. Der Text wurde nicht gespeichert. Entferne Begriffe oder kürze Texte, dann ist wieder Platz.");
    assert.ok(hasClass(statusElement(caregiverRegion), "caregiver-status-error"));
    assert.deepEqual([rewording().label.value, rewording().speech.value], ["Saft", "Saft, bitte."]);
  });
  await withArea({ seed: seedThree }, async ({ holdOpen, reword, act, status, rewording, backend, seeded, concept }) => {
    await holdOpen();
    const before = entryOf(backend, seeded, "trinken");
    backend.failWrite(1);
    await reword("Trinken", "Saft", "Saft, bitte.");
    assert.equal(status(), "Das konnte gerade nicht gespeichert werden. Bitte versuche es noch einmal. Der Text ist unverändert.");
    assert.deepEqual(entryOf(backend, seeded, "trinken"), before);
    assert.deepEqual([rewording().label.value, rewording().speech.value], ["Saft", "Saft, bitte."]);
    // A second try, without typing again, saves.
    await act(() => rewording().form.dispatch("submit"));
    assert.equal(status(), "Gespeichert: neuer Text für „Saft“.");
    assert.equal(concept("Saft").sentence, "Saft, bitte.");
  });
});

test("reword: what cannot be seen in pasted text is taken out before it is checked; line breaks and tabs become one space; an emoji sequence stays whole", async () => {
  await withArea({ seed: seedThree }, async ({ holdOpen, reword, backend, seeded, status }) => {
    await holdOpen();
    const family = `👨${chr(0x200d)}👩${chr(0x200d)}👧`;
    await reword("Trinken", `${chr(0xfeff)}Sa${chr(0xad)}ft${chr(0x200b)} ${chr(0x200d)}${family}${chr(0x2060)}`, "Ich\tmöchte \r\n Saft,\nbitte.\n");
    assert.deepEqual(entryOf(backend, seeded, "trinken"), { version: 1, labelDe: `Saft ${family}`, speechDe: "Ich möchte Saft, bitte." });
    assert.equal(status(), `Gespeichert: neuer Text für „Saft ${family}“.`);
  });
});

test("reword: 'Text der App wiederherstellen' is offered only for an own wording, shows what comes back, and resets with a second press", async () => {
  await withArea({ seed: seedThree }, async ({ holdOpen, reword, act, concept, rewording, focused, backend, seeded, status, onBoard, store }) => {
    await holdOpen();
    await reword("Trinken", "Saft", "Saft, bitte.");
    await act(() => concept("Saft").reword.click());
    const open = rewording();
    assert.notEqual(open.reset, null);
    assert.ok(open.texts.includes("Text der App: „Trinken“ – „Ich möchte etwas trinken.“"));
    // Typed, then the reset is looked at and left: the fields come back with what was typed.
    open.label.value = "Apfelsaft";
    const worded = entryOf(backend, seeded, "trinken");
    await act(() => open.reset.click());
    const second = rewording();
    assert.deepEqual(second.texts, [
      "Text der App für „Saft“ wiederherstellen?", "Danach steht auf der Taste „Trinken“, und das Gerät spricht „Ich möchte etwas trinken.“.",
      "Abbrechen", "Wiederherstellen",
    ]);
    assert.equal(focused.current, second.cancel);
    assert.deepEqual(entryOf(backend, seeded, "trinken"), worded, "the first press resets nothing");
    await act(() => second.cancel.click());
    assert.equal(rewording().label.value, "Apfelsaft");
    assert.equal(focused.current, rewording().reset);
    assert.deepEqual(entryOf(backend, seeded, "trinken"), worded);
    // And confirmed: twice pressed is one reset.
    await act(() => rewording().reset.click());
    rewording().confirmReset.click();
    await act(() => rewording().confirmReset.click());
    assert.deepEqual(entryOf(backend, seeded, "trinken"), { version: 1, labelDe: "Trinken", speechDe: "Ich möchte etwas trinken.", copied: true });
    assert.equal(status(), "„Trinken“ hat wieder den Text der App.");
    assert.equal(rewording(), null);
    assert.deepEqual(onBoard(), ["Hilfe", "Trinken", "Pause"]);
    assert.equal(focused.current, concept("Trinken").reword);
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, ["hilfe", "trinken", "pause"]);
    // Nothing to go back to any more.
    await act(() => concept("Trinken").reword.click());
    assert.equal(rewording().reset, null);
  });
});

test("reword: an entry that a newer app wrote has no 'Text ändern' and says that the app needs an update", async () => {
  const seed = async (store) => {
    const mia = await seedThree(store);
    await store.data(mia.id).set("concept.trinken", { version: 2, labelDe: "Saft", speechDe: "Saft.", tone: "freundlich" });
    return mia;
  };
  await withArea({ seed }, async ({ holdOpen, concept, concepts }) => {
    await holdOpen();
    // The board shows the app's text for it; it can still be moved and taken off.
    const row = concept("Trinken");
    // Teaching a gesture does not write the entry, so it stays.
    assert.deepEqual(row.buttons, ["nach oben", "nach unten", "Bild wählen", "Gebärde beibringen", "Vormachen", "Entfernen"]);
    assert.equal(row.note, NEWER_ENTRY);
    assert.deepEqual(concepts().filter((other) => other.onBoard && other.name !== "Trinken").map((other) => [other.reword !== null, other.note]), [[true, null], [true, null]]);
  });
});

test("reword: when the entry turns out to be a newer app's only at saving, that is said, nothing is overwritten and the text stays", async () => {
  await withArea({ seed: seedThree }, async ({ holdOpen, act, concept, rewording, status, store, seeded, backend, caregiverRegion }) => {
    await holdOpen();
    await act(() => concept("Trinken").reword.click());
    const newer = { version: 2, labelDe: "Saft", speechDe: "Saft.", tone: "freundlich" };
    await (await store()).data(seeded.id).set("concept.trinken", newer);
    rewording().label.value = "Wasser";
    rewording().speech.value = "Wasser, bitte.";
    await act(() => rewording().form.dispatch("submit"));
    assert.equal(status(), `${NEWER_ENTRY} Der Text wurde nicht geändert.`);
    assert.ok(hasClass(statusElement(caregiverRegion), "caregiver-status-error"));
    assert.deepEqual(entryOf(backend, seeded, "trinken"), newer);
    assert.deepEqual([rewording().label.value, rewording().speech.value], ["Wasser", "Wasser, bitte."]);
  });
});

test("reword: what is typed survives a redraw that an earlier action still had in the queue", async () => {
  const { inner, gate, backend } = gatedBackend();
  await seedThree(await ProfileStore.open(inner));
  await withArea({ backend }, async ({ holdOpen, concept, rewording, handle, caregiverRegion }) => {
    await holdOpen();
    const body = byClass(caregiverRegion, "caregiver-body");
    const swap = body.replaceChildren.bind(body);
    let holdNext = true;
    body.replaceChildren = (...nodes) => {
      swap(...nodes);
      if (holdNext) gate.hold();
      holdNext = false;
    };
    // A move is under way when "Text ändern" is pressed: its redraw already shows the fields, and the redraw for the press follows.
    concept("Pause").up.click();
    concept("Trinken").reword.click();
    for (let round = 0; round < 40; round += 1) await turn();
    const first = rewording();
    first.label.value = "Sa";
    first.label.dispatch("input");
    first.speech.value = "Saft, bi";
    first.speech.dispatch("input");
    gate.release();
    await handle.settled();
    const second = rewording();
    assert.notEqual(second.label, first.label);
    assert.deepEqual([second.label.value, second.speech.value], ["Sa", "Saft, bi"]);
  });
});

test("reword: Escape leaves the fields and drops what was typed, as for a rename; in the second step of a reset it goes back to the fields", async () => {
  await withArea({ seed: seedThree }, async ({ holdOpen, reword, act, concept, rewording, key, handle, backend, focused }) => {
    await holdOpen();
    await reword("Trinken", "Saft", "Saft, bitte.");
    const before = JSON.stringify(backend.snapshot());
    await act(() => concept("Saft").reword.click());
    rewording().label.value = "Wasser";
    await act(() => rewording().reset.click());
    await act(() => { assert.equal(key("Escape"), 1); });
    assert.equal(rewording().label.value, "Wasser");
    assert.equal(rewording().confirmReset, null);
    await act(() => { assert.equal(key("Escape", rewording().label), 1); });
    assert.equal(rewording(), null);
    assert.equal(handle.isOpen(), true);
    assert.equal(focused.current, concept("Saft").reword);
    assert.equal(JSON.stringify(backend.snapshot()), before);
    // Opened again, the fields start from what is stored.
    await act(() => concept("Saft").reword.click());
    assert.equal(rewording().label.value, "Saft");
    await act(() => rewording().cancel.click());
    key("Escape");
    assert.equal(handle.isOpen(), false);
  });
});

test("reword: 'Speichern' pressed twice is one write, and another action closes the fields without saving", async () => {
  const inner = new MemoryBackend();
  const slow = () => new Promise((resolve) => setImmediate(resolve));
  const dataWrites = [];
  const backend = {
    get: async (key) => { await slow(); return inner.get(key); },
    keys: async (prefix) => { await slow(); return inner.keys(prefix); },
    async write(batch) {
      await slow();
      for (const key of Object.keys(batch.set ?? {})) if (key.includes("/data/")) dataWrites.push(key);
      return inner.write(batch);
    },
  };
  await seedThree(await ProfileStore.open(inner));
  await withArea({ backend }, async ({ holdOpen, act, remove, concept, rewording, handle, status, undo, onBoard }) => {
    await holdOpen();
    await act(() => concept("Trinken").reword.click());
    dataWrites.length = 0;
    const fields = rewording();
    fields.label.value = "Saft";
    fields.speech.value = "Saft, bitte.";
    fields.form.dispatch("submit");
    fields.form.dispatch("submit");
    await handle.settled();
    assert.equal(dataWrites.length, 1);
    assert.equal(status(), "Gespeichert: neuer Text für „Saft“.");
    // The same for the second step of a reset.
    await act(() => concept("Saft").reword.click());
    await act(() => rewording().reset.click());
    dataWrites.length = 0;
    rewording().confirmReset.click();
    rewording().confirmReset.click();
    await handle.settled();
    assert.equal(dataWrites.length, 1);
    await act(() => concept("Trinken").reword.click());
    rewording().label.value = "Saft";
    await act(() => rewording().form.dispatch("submit"));
    // "Rückgängig" in the block at the top is the one other action on screen while the fields are open.
    await remove("Hilfe");
    await act(() => concept("Saft").reword.click());
    rewording().label.value = "Wasser";
    dataWrites.length = 0;
    await act(() => undo().click());
    assert.equal(rewording(), null);
    assert.deepEqual(onBoard(), ["Hilfe", "Saft", "Pause"]);
    assert.equal(dataWrites.filter((key) => key.endsWith("concept.trinken")).length, 0);
  });
});

test("reword: the form is not sent, and no button of it acts, while it has only just appeared", async () => {
  const wall = wallClock();
  await withArea({ seed: seedThree, now: wall.now }, async ({ holdOpen, reword, concept, rewording, handle, backend, seeded }) => {
    await holdOpen();
    wall.t += 1000;
    concept("Trinken").reword.click();
    await handle.settled();
    const fields = rewording();
    fields.label.value = "Saft";
    wall.t += SHIELD_GRACE_MS - 1;
    fields.form.dispatch("submit");
    fields.cancel.click();
    await handle.settled();
    assert.equal(rewording().label, fields.label, "neither sent nor left");
    assert.equal(entryOf(backend, seeded, "trinken").labelDe, "Trinken");
    wall.t += 1;
    fields.form.dispatch("submit");
    await handle.settled();
    assert.equal(entryOf(backend, seeded, "trinken").labelDe, "Saft");
    // The reset button and its second step are content that has just appeared as well.
    wall.t += 1000;
    concept("Saft").reword.click();
    await handle.settled();
    wall.t += 1000;
    rewording().reset.click();
    await handle.settled();
    wall.t += SHIELD_GRACE_MS - 1;
    rewording().confirmReset.click();
    await handle.settled();
    assert.equal(entryOf(backend, seeded, "trinken").labelDe, "Saft");
    wall.t += 1;
    rewording().confirmReset.click();
    await handle.settled();
    assert.equal(entryOf(backend, seeded, "trinken").labelDe, "Trinken");
  });
});

test("reword: a profile that is gone when the text is saved is answered in German; and neither the profile's name nor its id leaves the caregiver region", async () => {
  await withArea({ seed: seedThree }, async ({ holdOpen, act, concept, rewording, status, store, seeded, profiles }) => {
    await holdOpen();
    await act(() => concept("Trinken").reword.click());
    await (await store()).remove(seeded.id);
    rewording().label.value = "Saft";
    await act(() => rewording().form.dispatch("submit"));
    assert.equal(status(), PROFILE_GONE);
    assert.equal(rewording(), null);
    assert.deepEqual(profiles(), []);
  });
  await withArea({ seed: async (store) => { const mia = await seedThree(store); await store.rename(mia.id, "Mia Musterkind"); return mia; } }, async ({ holdOpen, reword, act, concept, rewording, handle, boardRegion, entry, caregiverRegion, seeded }) => {
    const leaks = () => [...stringsIn(boardRegion), ...stringsIn(entry)].filter((text) => text.includes("Musterkind") || text.includes(seeded.id));
    await holdOpen();
    await act(() => concept("Trinken").reword.click());
    assert.ok(stringsIn(caregiverRegion).some((text) => text.includes("Mia Musterkind")));
    assert.deepEqual(leaks(), []);
    await act(() => rewording().cancel.click());
    await reword("Hilfe", "Hilf mir", "Hilf mir bitte.");
    assert.equal(concept("Hilf mir").sentence, "Hilf mir bitte.");
    await handle.close();
    assert.deepEqual(leaks(), []);
    assert.deepEqual(stringsIn(caregiverRegion).filter((text) => text.includes("Musterkind")), []);
  });
});

test("reword: the fields are brought to just under the block at the top, also when the row was further down", async () => {
  const layout = fakeLayout();
  layout.at = (element) => (hasClass(element, "caregiver-takeover") ? 400 : 1000);
  await withArea({ seed: seedThree, rect: layout.rect }, async ({ holdOpen, act, concept, caregiverRegion, rewording, focused }) => {
    layout.region = caregiverRegion;
    await holdOpen();
    caregiverRegion.scrollTop = 0;
    await act(() => concept("Pause").reword.click());
    assert.equal(focused.current, rewording().label);
    assert.equal(caregiverRegion.scrollTop, 400 - UNDER_BLOCK);
  });
});

// --- Rewording, second build ---

/** The area on seedThree with writes the test can hold back. */
async function withHeldWording(callback) {
  const inner = new MemoryBackend();
  const writes = { held: false, waiting: [] };
  const backend = {
    get: (key) => inner.get(key),
    keys: (prefix) => inner.keys(prefix),
    async write(batch) {
      if (writes.held) await new Promise((resolve) => { writes.waiting.push(resolve); });
      return inner.write(batch);
    },
  };
  writes.release = async () => {
    writes.held = false;
    while (writes.waiting.length > 0) {
      writes.waiting.shift()();
      await turn();
    }
  };
  const store = await ProfileStore.open(backend);
  const mia = await seedThree(store);
  const app = { store: async () => store, refreshBoard: async () => undefined };
  await withArea({ backend, app }, (area) => callback({ ...area, writes, mia, entry: () => inner.snapshot()[`profile/${mia.id}/data/concept.trinken`] }));
}

test("reword: a save or reset that is left before its write began is dropped, and the buttons work afterwards", async () => {
  await withHeldWording(async ({ holdOpen, reword, act, concept, rewording, key, handle, entry, status }) => {
    await holdOpen();
    await reword("Trinken", "Saft", "Saft, bitte.");
    const worded = entry();
    // Reset, and Escape in the same breath: the queued reset has not begun.
    await act(() => concept("Saft").reword.click());
    await act(() => rewording().reset.click());
    rewording().confirmReset.click();
    key("Escape");
    await handle.settled();
    assert.deepEqual(entry(), worded);
    assert.equal(status(), "");
    assert.notEqual(rewording().form, null, "back at the fields");
    // Save, and "Abbrechen" in the same breath.
    rewording().label.value = "Wasser";
    rewording().form.dispatch("submit");
    rewording().cancel.click();
    await handle.settled();
    assert.deepEqual(entry(), worded);
    assert.equal(rewording(), null);
    // Nothing is left dead: a save and a reset go through.
    await reword("Saft", "Wasser", "Wasser, bitte.");
    assert.equal(entry().labelDe, "Wasser");
    await act(() => concept("Wasser").reword.click());
    await act(() => rewording().reset.click());
    await act(() => rewording().confirmReset.click());
    assert.equal(entry().copied, true);
  });
});

for (const [what, leave] of [["Escape", (area) => area.key("Escape")], ["'Abbrechen'", (area) => area.rewording().cancel.click()]]) {
  test(`reword: a save whose write has begun is carried out although ${what} follows, and the status line says that it was saved`, async () => {
    await withHeldWording(async (area) => {
      const { holdOpen, act, concept, rewording, handle, entry, status, writes, onBoard } = area;
      await holdOpen();
      await act(() => concept("Trinken").reword.click());
      rewording().label.value = "Saft";
      writes.held = true;
      rewording().form.dispatch("submit");
      for (let round = 0; round < 10; round += 1) await turn();
      assert.equal(writes.waiting.length, 1, "the write is under way");
      leave(area);
      await writes.release();
      await handle.settled();
      assert.equal(entry().labelDe, "Saft");
      assert.equal(status(), "Gespeichert: neuer Text für „Saft“.");
      assert.equal(rewording(), null);
      assert.deepEqual(onBoard(), ["Hilfe", "Saft", "Pause"]);
    });
  });
}

test("reword: while a save is under way the reset step does not open, and a reset whose write has begun is said to have happened", async () => {
  await withHeldWording(async ({ holdOpen, reword, act, concept, rewording, handle, entry, status, writes, key }) => {
    await holdOpen();
    await reword("Trinken", "Saft", "Saft, bitte.");
    await act(() => concept("Saft").reword.click());
    rewording().label.value = "Wasser";
    writes.held = true;
    rewording().form.dispatch("submit");
    for (let round = 0; round < 10; round += 1) await turn();
    rewording().reset.click();
    await turn();
    assert.equal(rewording().confirmReset, null);
    await writes.release();
    await handle.settled();
    assert.equal(entry().labelDe, "Wasser");
    assert.equal(rewording(), null);
    // A reset that has begun, then Escape: it is carried out, the fields do not come back, and "Speichern" is not dead next time.
    await act(() => concept("Wasser").reword.click());
    await act(() => rewording().reset.click());
    writes.held = true;
    rewording().confirmReset.click();
    for (let round = 0; round < 10; round += 1) await turn();
    key("Escape");
    await writes.release();
    await handle.settled();
    assert.equal(entry().copied, true);
    assert.equal(status(), "„Trinken“ hat wieder den Text der App.");
    assert.equal(rewording(), null);
    await reword("Trinken", "Tee", "Tee, bitte.");
    assert.equal(entry().labelDe, "Tee");
  });
});

test("reword: a custom concept whose entry turns out to be a newer app's at saving keeps the fields open with the text", async () => {
  await withArea({ seed: seedMixedBoard }, async ({ holdOpen, act, concept, rewording, status, store, seeded, backend, focused, opener }) => {
    await holdOpen();
    await act(() => concept("Ball").reword.click());
    const newer = { version: 2, labelDe: "Ball", speechDe: "Ball.", custom: true, colour: "rot" };
    await (await store()).data(seeded.id).set("concept.ball", newer);
    rewording().label.value = "Fußball";
    rewording().speech.value = "Fußball, bitte.";
    await act(() => rewording().form.dispatch("submit"));
    assert.equal(status(), `${NEWER_ENTRY} Der Text wurde nicht geändert.`);
    assert.deepEqual(entryOf(backend, seeded, "ball"), newer);
    assert.deepEqual([rewording().label.value, rewording().speech.value], ["Fußball", "Fußball, bitte."]);
    assert.ok(rewording().texts.includes("Text für „Ball“ auf der Tafel von „Mia“"));
    assert.equal(focused.current, rewording().label);
    assert.notEqual(focused.current, opener);
  });
});

test("reword: Enter in the first field goes on to the second and sends nothing; only 'Speichern' saves", async () => {
  await withArea({ seed: seedThree }, async ({ holdOpen, act, concept, rewording, focused, backend, handle }) => {
    await holdOpen();
    await act(() => concept("Trinken").reword.click());
    const before = JSON.stringify(backend.snapshot());
    const fields = rewording();
    fields.label.value = "Saft";
    let prevented = 0;
    fields.label.dispatch("keydown", { key: "Enter", preventDefault() { prevented += 1; } });
    await handle.settled();
    assert.equal(prevented, 1, "the browser must not send the form");
    assert.equal(focused.current, fields.speech);
    assert.equal(JSON.stringify(backend.snapshot()), before);
    // Another key is left alone. Enter while an input method composes sends nothing either, and the focus stays.
    fields.label.dispatch("keydown", { key: "a", preventDefault() { prevented += 1; } });
    assert.equal(prevented, 1);
    focused.current = fields.label;
    fields.label.dispatch("keydown", { key: "Enter", isComposing: true, preventDefault() { prevented += 1; } });
    assert.equal(prevented, 2);
    assert.equal(focused.current, fields.label);
    // In the sentence Enter is not taken over.
    assert.equal(fields.speech.handlers.keydown, undefined);
  });
});

test("reword: the line about the picture is there for a concept with a picture only", async () => {
  await withArea({ seed: seedMixedBoard }, async ({ holdOpen, act, concept, rewording }) => {
    await holdOpen();
    await act(() => concept("Trinken").reword.click());
    assert.ok(rewording().texts.includes("Das Bild bleibt gleich."));
    await act(() => rewording().cancel.click());
    await act(() => concept("Ball").reword.click());
    assert.ok(!rewording().texts.includes("Das Bild bleibt gleich."));
  });
});

test("reword: every kind of line break becomes a space, and the length is counted on the text as it is stored", async () => {
  await withArea({ seed: seedThree }, async ({ holdOpen, reword, backend, seeded, concept }) => {
    await holdOpen();
    await reword("Trinken", "Saft", `A${chr(0x2028)}B${chr(0x2029)}C\vD\fE${chr(0x85)}F`);
    assert.equal(entryOf(backend, seeded, "trinken").speechDe, "A B C D E F");
    // Forty letters typed as letter plus combining accent are forty characters once composed.
    await reword("Saft", `e${chr(0x301)}`.repeat(40), "Satz.");
    assert.equal(entryOf(backend, seeded, "trinken").labelDe, "é".repeat(40));
    assert.equal(concept("é".repeat(40)).sentence, "Satz.");
  });
});

test("reword: the app's text typed back by hand is the app's text again, stored as a copy", async () => {
  await withArea({ seed: seedThree }, async ({ holdOpen, reword, act, concept, rewording, backend, seeded, status }) => {
    await holdOpen();
    await reword("Trinken", "Saft", "Saft, bitte.");
    await reword("Saft", "Trinken ", "Ich möchte etwas trinken.");
    assert.deepEqual(entryOf(backend, seeded, "trinken"), { version: 1, labelDe: "Trinken", speechDe: "Ich möchte etwas trinken.", copied: true });
    assert.equal(status(), "„Trinken“ hat wieder den Text der App.");
    await act(() => concept("Trinken").reword.click());
    assert.equal(rewording().reset, null);
  });
});

test("leaving: Escape does nothing while an input method composes a character", async () => {
  await withArea({ seed: seedThree }, async ({ holdOpen, act, concept, rewording, caregiverRegion, handle }) => {
    await holdOpen();
    await act(() => concept("Trinken").reword.click());
    let prevented = 0;
    caregiverRegion.dispatch("keydown", { key: "Escape", isComposing: true, target: rewording().label, preventDefault() { prevented += 1; } });
    await handle.settled();
    assert.equal(prevented, 0);
    assert.notEqual(rewording(), null);
    assert.equal(handle.isOpen(), true);
  });
});

// --- Teaching a gesture (card NG-19) ---

const TEACH_INTRO = "Tippe auf „Kamera starten“. Tippe dann auf „Aufnahme starten“: Das Gerät zählt 3 Sekunden herunter, damit deine Hand aus dem Bild kommt. "
  + "Dann die Gebärde einmal machen und auf „Aufnahme beenden“ tippen. Nach 8 Sekunden endet die Aufnahme von selbst. "
  + "Am besten steht das Gerät fest, oder eine zweite Person hält es. "
  + "Am besten mindestens 3 Beispiele aufnehmen, so wie das Kind später vor dem Gerät sitzt. "
  + "Gespeichert werden nur Zahlen zu Bewegung und Handform, kein Bild und kein Video.";

/** A tracker hand: 21 normalised points around a wrist at (x, y); synthetic numbers. */
function trackerHand(x, y, label) {
  const landmarks = Array.from({ length: HAND_POINTS }, (_, index) => {
    if (index === 0) return { x, y };
    const finger = Math.floor((index - 1) / 4);
    return { x: x + (finger - 2) * 0.02, y: y - ((index - 1) % 4 + 1) * 0.024 };
  });
  return { landmarks, label, score: 0.95 };
}
const POSE = Array.from({ length: 33 }, (_, index) => ({ x: index === 11 ? 0.62 : index === 12 ? 0.38 : 0.5, y: 0.55, visibility: 0.99 }));

/**
 * The real `startCapture` with a fake tracker and camera: the test hands in each frame (the hands the
 * tracker "sees" in it) with `feed`. `holdTracker` keeps the tracker loading until `releaseTracker`.
 */
/**
 * `startCapture` on a fake camera and tracker. `noBackCamera`: a device with a front camera only, which
 * refuses an exact request for the back one (OverconstrainedError), as a phone or a laptop without one does.
 */
function fakeCamera({ cameraError = null, holdTracker = false, noBackCamera = false } = {}) {
  const log = { trackerStarts: 0, cameraRequests: 0, tracksStopped: 0, trackerClosed: 0, sourceClosed: 0, signals: [], hosts: [], streams: [], previews: [], constraints: [], facings: [] };
  let waiting = [];
  let queued = [];
  let t = 0;
  let release = () => undefined;
  const environment = {
    async startTracker(signal) {
      log.trackerStarts += 1;
      log.signals.push(signal);
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
      log.constraints.push(constraints);
      if (cameraError !== null) throw Object.assign(new Error("camera"), { name: cameraError });
      const back = constraints?.video?.facingMode?.exact === "environment";
      if (back && noBackCamera) throw Object.assign(new Error("camera"), { name: "OverconstrainedError" });
      const facingMode = back ? "environment" : "user";
      const stream = { getTracks: () => [{ stop() { log.tracksStopped += 1; }, getSettings: () => ({ facingMode }) }] };
      log.streams.push(stream);
      return stream;
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
      log.facings.push(options.facing);
      return startCapture(environment, options);
    },
    text: CAPTURE_TEXT,
    nextShoulders,
    // The capture module's own preview, on the fake document with what it uses of a video and a canvas.
    createPreview(doc) {
      const preview = createCapturePreview(mediaDocument(doc));
      log.previews.push(preview);
      return preview;
    },
  };
  return {
    bridge, log,
    releaseTracker: () => release(),
    /** One camera frame with these tracker hands, 100 ms after the one before; waits until it is tracked. */
    async feed(hands) {
      t += 100;
      const frame = { image: { hands, close() {} }, timestampMs: t, width: 640, height: 480 };
      const resolve = waiting.shift();
      if (resolve === undefined) queued.push(frame);
      else resolve(frame);
      for (let i = 0; i < 5; i += 1) await turn();
    },
    get running() { return log.cameraRequests > log.tracksStopped; },
    /** The camera stops delivering frames, as when another app takes it. */
    fail() {
      for (const resolve of waiting) resolve(null);
      waiting = [];
    },
  };
}

/**
 * The fake document with a video that plays and pauses and a canvas of 400 × 300 whose 2D
 * context records every call (`canvas.calls`, not enumerable).
 */
function mediaDocument(doc) {
  return {
    defaultView: { devicePixelRatio: 1 },
    createElement(tag) {
      const created = doc.createElement(tag);
      if (tag === "video") {
        Object.assign(created, { paused: true, play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; } });
      }
      if (tag === "canvas") {
        const calls = [];
        const context = new Proxy({}, {
          get: (target, name) => (name in target ? target[name] : (...args) => calls.push([name, ...args])),
          set: (target, name, value) => { target[name] = value; calls.push([`${String(name)}=`, value]); return true; },
        });
        Object.defineProperty(created, "calls", { value: calls, enumerable: false });
        Object.assign(created, { clientWidth: 400, clientHeight: 300, width: 300, height: 150, getContext: () => context });
      }
      return created;
    },
  };
}

/** A board of two concepts on the active profile Mia. */
const seedTeach = async (store) => {
  const mia = await createMia(store);
  await setBoardConcepts(store, mia.id, ["trinken", "hilfe"], CONCEPTS);
  return mia;
};

/** The teaching view while it is the body of the area, or null. */
function teachViewOf(region) {
  const view = byClass(region, "caregiver-teach");
  if (view === undefined) return null;
  return {
    view, texts: textsIn(view), heading: tree(view).find((element) => element.tagName === "h2"),
    // The camera choice (card NG-43) is its own row; `buttons` are the view's other buttons.
    buttons: buttonsIn(view).filter((element) => !hasClass(element, "camera-choice-button")).map((element) => element.textContent),
    facing: buttonsIn(view).filter((element) => hasClass(element, "camera-choice-button"))
      .map((element) => `${element.textContent}${element["aria-pressed"] === "true" ? "*" : ""}${element["aria-disabled"] === "true" ? " (aus)" : ""}`),
    result: byClass(view, "caregiver-teach-result")?.textContent ?? null,
    live: byClass(view, "caregiver-teach-live")?.textContent ?? null,
    camera: byClass(view, "caregiver-teach-camera")?.textContent ?? null,
    count: byClass(view, "caregiver-teach-count")?.textContent ?? null,
    note: byClass(view, "caregiver-teach-note")?.textContent ?? null,
    hint: byClass(view, "caregiver-teach-hint")?.textContent ?? null,
    examples: tree(view).filter((element) => hasClass(element, "caregiver-example-text")).map((element) => element.textContent),
  };
}

/** Waits until `condition` holds, letting the camera's promises and the area's queue run. */
async function untilTaught(handle, condition) {
  for (let i = 0; i < 200 && !condition(); i += 1) {
    await turn();
    await handle.settled();
  }
  assert.ok(condition(), "condition not reached");
}

/** Opens the teaching view of `name` and starts the camera; resolves when "Aufnahme starten" is there. */
async function teachWithCamera(area, camera, name = "Trinken") {
  await area.holdOpen();
  await area.act(() => area.concept(name).teach.click());
  await area.act(() => area.button("Kamera starten").click());
  await untilTaught(area.handle, () => area.button("Aufnahme starten") !== undefined);
}

/** "Aufnahme starten" and the countdown after it: resolves when frames are kept. */
async function startRecording(area) {
  await area.act(() => area.button("Aufnahme starten").click());
  area.clock.advance(TEACH_COUNTDOWN_S * 1000);
  await area.handle.settled();
  assert.notEqual(area.button("Aufnahme beenden"), undefined, "recording after the countdown");
}

/** Records `count` frames of `hands(i)` between "Aufnahme starten" (and its countdown) and "Aufnahme beenden". */
async function record(area, camera, count, hands) {
  await startRecording(area);
  for (let i = 0; i < count; i += 1) await camera.feed(hands(i));
  await area.act(() => area.button("Aufnahme beenden").click());
}
const rightHand = (i) => [trackerHand(0.3 + i * 0.01, 0.5, "Right")];
const bothHands = (i) => [trackerHand(0.3 + i * 0.01, 0.5, "Right"), trackerHand(0.7 - i * 0.01, 0.5, "Left")];

test("CAPTURE_BRIDGE_KEY is the same string in the caregiver area and the capture module", () => {
  assert.equal(CAPTURE_BRIDGE_KEY, CAPTURE_MODULE_KEY);
});

test("CAMERA_FACING_KEY (the remembered camera choice, card NG-43) is the same string in the caregiver area and the capture module", () => {
  assert.equal(CAMERA_FACING_KEY, CAPTURE_FACING_KEY);
});

test("teach: every tile on the board offers 'Gebärde beibringen'; it opens a view that takes over the body, names tile and profile, and starts no camera", async () => {
  const camera = fakeCamera();
  await withArea({ seed: seedTeach, capture: camera.bridge }, async (area) => {
    const { holdOpen, concept, caregiverRegion, focused, act } = area;
    await holdOpen();
    assert.deepEqual(area.onBoard(), ["Trinken", "Hilfe"]);
    for (const name of ["Trinken", "Hilfe"]) {
      assert.deepEqual(concept(name).buttons, ["nach oben", "nach unten", "Text ändern", "Bild wählen", "Gebärde beibringen", "Vormachen", "Entfernen"]);
      assert.equal(concept(name).teach["aria-label"], `Gebärde beibringen: ${name}`);
      assert.equal(concept(name).gesture, null);
    }
    // Concepts that are not on the board are not taught.
    assert.equal(concept("Pause").teach, null);
    await act(() => concept("Trinken").teach.click());
    const view = teachViewOf(caregiverRegion);
    assert.equal(view.heading.textContent, "Gebärde für „Trinken“ beibringen – Tafel von „Mia“");
    assert.equal(focused.current, view.heading);
    assert.ok(view.texts.includes(TEACH_INTRO));
    assert.equal(view.count, "Noch kein Beispiel gespeichert. Empfohlen sind mindestens 3.");
    assert.deepEqual(view.buttons, ["Kamera starten", "Zurück"]);
    // Nothing else of the area is there to be hit; the help section is hidden as with the other views that take over.
    assert.equal(area.profiles().length, 0);
    assert.equal(area.concepts().length, 0);
    assert.equal(byClass(caregiverRegion, "caregiver-help").hidden, true);
    assert.equal(camera.log.trackerStarts, 0);
    assert.equal(camera.log.cameraRequests, 0);
    // "Zurück" goes back to the button that opened it.
    await act(() => area.button("Zurück").click());
    assert.equal(teachViewOf(caregiverRegion), null);
    assert.equal(focused.current, concept("Trinken").teach);
  });
});

test("teach: the camera starts only on 'Kamera starten'; the live line shows hands and shoulders; a one-hand example is kept and stored as features only", async () => {
  const camera = fakeCamera();
  const date = () => new Date("2026-11-23T09:30:00.000Z");
  await withArea({ seed: seedTeach, capture: camera.bridge, date }, async (area) => {
    const { caregiverRegion, act, status, store, seeded, focused } = area;
    await teachWithCamera(area, camera);
    assert.equal(camera.log.cameraRequests, 1);
    // The hidden video element goes into the caregiver region, which is emptied when the area closes.
    assert.deepEqual(camera.log.hosts, [caregiverRegion]);
    assert.equal(focused.current, area.button("Aufnahme starten"));
    await camera.feed(rightHand(0));
    assert.equal(teachViewOf(caregiverRegion).live, "Eine Hand im Bild. Schultern zu sehen.");
    await camera.feed(bothHands(0));
    assert.equal(teachViewOf(caregiverRegion).live, "Zwei Hände im Bild. Schultern zu sehen.");

    await startRecording(area);
    let view = teachViewOf(caregiverRegion);
    assert.deepEqual(view.buttons, ["Aufnahme beenden", "Zurück"]);
    assert.equal(view.camera, "Die Aufnahme läuft. Jetzt die Gebärde machen.");
    for (let i = 0; i < 20; i += 1) await camera.feed(rightHand(i));
    await act(() => area.button("Aufnahme beenden").click());
    view = teachViewOf(caregiverRegion);
    assert.equal(view.result, "Die Aufnahme kann verwendet werden: Gebärde mit einer Hand (rechts). Behalten oder verwerfen?");
    assert.deepEqual(view.buttons, ["Behalten", "Verwerfen", "Zurück"]);
    // Nothing is stored before "Behalten".
    assert.equal((await listExamples(await store(), seeded.id)).examples.length, 0);
    await act(() => area.button("Behalten").click());
    assert.equal(teachViewOf(caregiverRegion).note, "Das Beispiel wurde gespeichert. Für diese Taste ist jetzt 1 Beispiel gespeichert.");
    assert.equal(status(), "");
    view = teachViewOf(caregiverRegion);
    assert.equal(view.count, "1 Beispiel gespeichert. Empfohlen sind mindestens 3.");
    assert.equal(view.examples.length, 1);
    assert.match(view.examples[0], /^Beispiel 1: mit einer Hand \(rechts\), \d\d\.\d\d\.2026, \d\d:\d\d Uhr$/);
    // The camera still runs: the next example can be recorded at once.
    assert.equal(focused.current, area.button("Aufnahme starten"));
    assert.equal(camera.running, true);
    const [example] = (await listExamples(await store(), seeded.id, "trinken")).examples;
    assert.equal(example.record.hands, "right");
    assert.equal(example.record.capturedAt, "2026-11-23T09:30:00.000Z");
    assert.equal(example.record.frames, 20);
    // What is stored: the record and nothing else. No image, no landmarks.
    const raw = await (await store()).data(seeded.id).get(example.name);
    assert.deepEqual(Object.keys(raw).sort(), ["anchor", "capturedAt", "conceptId", "decimals", "durationMs", "featureSchemaVersion", "frames", "hands", "steps", "version"]);
    assert.ok(!JSON.stringify(raw).includes("landmarks"));
  });
});

test("teach: a two-hand example is kept with both hands; 'Verwerfen' stores nothing; the row on the board shows the count", async () => {
  const camera = fakeCamera();
  await withArea({ seed: seedTeach, capture: camera.bridge }, async (area) => {
    const { caregiverRegion, act, status, store, seeded, concept } = area;
    await teachWithCamera(area, camera, "Hilfe");
    await record(area, camera, 20, bothHands);
    assert.equal(teachViewOf(caregiverRegion).result, "Die Aufnahme kann verwendet werden: Gebärde mit beiden Händen. Behalten oder verwerfen?");
    await act(() => area.button("Behalten").click());
    await record(area, camera, 20, rightHand);
    await act(() => area.button("Verwerfen").click());
    assert.equal(teachViewOf(caregiverRegion).note, "Die Aufnahme wurde verworfen. Es wurde nichts gespeichert.");
    assert.equal(teachViewOf(caregiverRegion).result, null);
    await record(area, camera, 25, bothHands);
    await act(() => area.button("Behalten").click());
    assert.equal(teachViewOf(caregiverRegion).note, "Das Beispiel wurde gespeichert. Für diese Taste sind jetzt 2 Beispiele gespeichert.");
    const listing = await listExamples(await store(), seeded.id, "hilfe");
    assert.deepEqual(listing.examples.map((example) => example.record.hands), ["both", "both"]);
    assert.ok(teachViewOf(caregiverRegion).examples.every((line) => line.includes("mit beiden Händen")));
    await act(() => area.button("Zurück").click());
    assert.equal(camera.running, false);
    assert.equal(concept("Hilfe").gesture, "Gebärde: 2 Beispiele");
    assert.equal(concept("Trinken").gesture, null);
  });
});

test("teach: a recording the matcher cannot use is refused in German with what to do, and nothing is stored", async () => {
  const camera = fakeCamera();
  await withArea({ seed: seedTeach, capture: camera.bridge }, async (area) => {
    const { caregiverRegion, store, seeded, focused } = area;
    await teachWithCamera(area, camera);
    const cases = [
      [15, () => [], "Diese Aufnahme kann nicht verwendet werden. Es war keine Hand zu sehen. Bitte so sitzen, dass die Hände gut im Bild sind, und noch einmal aufnehmen. Es wurde nichts gespeichert."],
      [0, rightHand, "Diese Aufnahme kann nicht verwendet werden. Von der Kamera kam kein Bild an. Bitte noch einmal aufnehmen. Es wurde nichts gespeichert."],
      [2, rightHand, "Diese Aufnahme kann nicht verwendet werden. Die Aufnahme war zu kurz. Bitte erst „Aufnahme starten“ tippen, dann die Gebärde machen und danach „Aufnahme beenden“ tippen. Es wurde nichts gespeichert."],
      [30, (i) => [trackerHand(0.3 + i * 0.005, 0.5, "Right"), ...(i < 10 ? [trackerHand(0.7, 0.5, "Left")] : [])], /^Diese Aufnahme kann nicht verwendet werden\. Es war nicht klar, ob die Gebärde mit einer oder mit beiden Händen gemacht wird/],
      [30, (i) => (i >= 10 && i < 20 ? [] : rightHand(i)), /Eine Hand war zwischendurch zu lange nicht zu sehen\./],
    ];
    for (const [count, hands, expected] of cases) {
      await record(area, camera, count, hands);
      const view = teachViewOf(caregiverRegion);
      if (typeof expected === "string") assert.equal(view.result, expected);
      else assert.match(view.result, expected);
      // No "Behalten": the next try is one tap away.
      assert.deepEqual(view.buttons, ["Aufnahme starten", "Zurück"]);
      assert.equal(focused.current, area.button("Aufnahme starten"));
    }
    assert.deepEqual(await (await store()).data(seeded.id).names(), ["concept.hilfe", "concept.trinken"]);
  });
});

test("teach: a recording stops by itself after the maximum time and is then judged as usual", async () => {
  const camera = fakeCamera();
  await withArea({ seed: seedTeach, capture: camera.bridge }, async (area) => {
    const { caregiverRegion, clock, handle } = area;
    await teachWithCamera(area, camera);
    assert.equal(TEACH_MAX_RECORDING_MS, 8000);
    await startRecording(area);
    for (let i = 0; i < 20; i += 1) await camera.feed(rightHand(i));
    clock.advance(TEACH_MAX_RECORDING_MS - 1);
    await handle.settled();
    assert.notEqual(area.button("Aufnahme beenden"), undefined);
    clock.advance(1);
    await handle.settled();
    assert.equal(teachViewOf(caregiverRegion).result, "Die Aufnahme hat nach 8 Sekunden von selbst geendet. Die Aufnahme kann verwendet werden: Gebärde mit einer Hand (rechts). Behalten oder verwerfen?");
    // A tap that stops it by hand cancels the timer: nothing happens at 8 s.
    await area.act(() => area.button("Verwerfen").click());
    await record(area, camera, 10, rightHand);
    const before = teachViewOf(caregiverRegion).result;
    clock.advance(TEACH_MAX_RECORDING_MS);
    await handle.settled();
    assert.equal(teachViewOf(caregiverRegion).result, before);
    assert.ok(!before.includes("von selbst"));
    // The time of a recording stopped by hand does not end the next one early.
    await area.act(() => area.button("Verwerfen").click());
    await startRecording(area);
    clock.advance(TEACH_MAX_RECORDING_MS - 1000);
    await area.act(() => area.button("Aufnahme beenden").click());
    await startRecording(area);
    clock.advance(2000);
    await handle.settled();
    assert.notEqual(area.button("Aufnahme beenden"), undefined);
    clock.advance(TEACH_MAX_RECORDING_MS - 2000);
    await handle.settled();
    assert.equal(area.button("Aufnahme beenden"), undefined);
  });
});

test("teach: leaving stops the camera on every way out: 'Zurück', Escape, 'Fertig', a hidden page and another action", async () => {
  const ways = {
    "Zurück": async (area) => area.act(() => area.button("Zurück").click()),
    Escape: async (area) => { area.key("Escape"); await area.handle.settled(); },
    "Fertig": async (area) => { area.button("Fertig").click(); await area.handle.settled(); },
    "hidden page": async (area) => { area.page.hide(); await area.handle.settled(); },
    "undo in the block at the top": async (area) => {
      area.undo().click();
      // At the press, not only when the queue redraws.
      assert.equal(area.camera.running, false);
      await area.handle.settled();
    },
  };
  for (const [name, leave] of Object.entries(ways)) {
    const camera = fakeCamera();
    await withArea({ seed: seedTeach, capture: camera.bridge }, async (area) => {
      area.camera = camera;
      await area.holdOpen();
      if (name.startsWith("undo")) {
        await area.remove("Hilfe");
        assert.notEqual(area.undo(), null);
      }
      await area.act(() => area.concept("Trinken").teach.click());
      await area.act(() => area.button("Kamera starten").click());
      await untilTaught(area.handle, () => area.button("Aufnahme starten") !== undefined);
      await startRecording(area);
      await camera.feed(rightHand(0));
      assert.equal(camera.running, true, name);
      const [preview] = camera.log.previews;
      assert.equal(preview.element.children.length, 2, name);
      await leave(area);
      assert.equal(camera.running, false, name);
      // The camera's picture goes with it: the video lets go of the stream and the box is emptied.
      assert.deepEqual(preview.element.children, [], name);
      assert.equal(preview.element.dataset.camera, "off", name);
      assert.equal(camera.log.trackerClosed, 1, name);
      assert.equal(camera.log.sourceClosed, 1, name);
      assert.equal(teachViewOf(area.caregiverRegion), null, name);
      assert.equal(camera.log.signals[0].aborted, true, name);
      // Nothing that was recorded is stored.
      assert.ok(!(await (await area.store()).data(area.seeded.id).names()).some((entry) => entry.startsWith("gesture.")), name);
    });
  }
});

test("teach: when the tile leaves the board meanwhile (another tab), the next redraw leaves the view and the camera stops", async () => {
  const camera = fakeCamera();
  await withArea({ seed: seedTeach, capture: camera.bridge }, async (area) => {
    await teachWithCamera(area, camera);
    await setBoardConcepts(await area.store(), area.seeded.id, ["hilfe"], CONCEPTS);
    assert.equal(camera.running, true);
    // The next press redraws the view from the store.
    await area.act(() => area.button("Aufnahme starten").click());
    assert.equal(teachViewOf(area.caregiverRegion), null);
    assert.equal(camera.running, false);
    assert.deepEqual(area.onBoard(), ["Hilfe"]);
  });
});

test("teach: leaving while the tracker still loads cancels the start: no camera is ever requested", async () => {
  const camera = fakeCamera({ holdTracker: true });
  await withArea({ seed: seedTeach, capture: camera.bridge }, async (area) => {
    await area.holdOpen();
    await area.act(() => area.concept("Trinken").teach.click());
    await area.act(() => area.button("Kamera starten").click());
    assert.equal(camera.log.trackerStarts, 1);
    let view = teachViewOf(area.caregiverRegion);
    assert.equal(view.camera, "Die Handerkennung wird vorbereitet …");
    // A second tap while it starts does nothing.
    assert.equal(area.button("Kamera starten")["aria-disabled"], "true");
    await area.act(() => area.button("Kamera starten").click());
    assert.equal(camera.log.trackerStarts, 1);
    await area.act(() => area.button("Zurück").click());
    assert.equal(camera.log.signals[0].aborted, true);
    camera.releaseTracker();
    for (let i = 0; i < 10; i += 1) await turn();
    assert.equal(camera.log.cameraRequests, 0);
    view = teachViewOf(area.caregiverRegion);
    assert.equal(view, null);
  });
});

test("teach: a camera that cannot start says why in German, and 'Kamera starten' is the retry; without the capture module it says so", async () => {
  const camera = fakeCamera({ cameraError: "NotAllowedError" });
  await withArea({ seed: seedTeach, capture: camera.bridge }, async (area) => {
    await area.holdOpen();
    await area.act(() => area.concept("Trinken").teach.click());
    await area.act(() => area.button("Kamera starten").click());
    await untilTaught(area.handle, () => teachViewOf(area.caregiverRegion).camera === CAPTURE_TEXT.problems.denied);
    assert.deepEqual(teachViewOf(area.caregiverRegion).buttons, ["Kamera starten", "Zurück"]);
    assert.equal(byClass(area.caregiverRegion, "caregiver-teach-camera").className, "caregiver-teach-camera caregiver-warning");
    assert.equal(camera.log.trackerClosed, 1);
    await area.act(() => area.button("Kamera starten").click());
    await untilTaught(area.handle, () => camera.log.cameraRequests === 2);
  });
  // No bridge: capture/capture.js did not load (it is a module of its own, so the board does not depend on it).
  await withArea({ seed: seedTeach, capture: null }, async (area) => {
    await area.holdOpen();
    await area.act(() => area.concept("Trinken").teach.click());
    await area.act(() => area.button("Kamera starten").click());
    assert.equal(teachViewOf(area.caregiverRegion).camera, "Die Kamera kann hier gerade nicht gestartet werden. Bitte die App neu öffnen. Die Tafel funktioniert auch ohne Kamera.");
  });
  // The default looks for the bridge under its global name.
  const found = fakeCamera();
  globalThis[CAPTURE_BRIDGE_KEY] = found.bridge;
  try {
    await withArea({ seed: seedTeach }, async (area) => {
      await area.holdOpen();
      await area.act(() => area.concept("Trinken").teach.click());
      await area.act(() => area.button("Kamera starten").click());
      await untilTaught(area.handle, () => found.log.cameraRequests === 1);
      await area.act(() => area.button("Zurück").click());
      assert.equal(found.running, false);
    });
  } finally {
    delete globalThis[CAPTURE_BRIDGE_KEY];
  }
});

test("teach: deleting an example or all of a tile takes over the body, has 'Abbrechen' first, and needs a hold and a release", async () => {
  const camera = fakeCamera();
  await withArea({ seed: seedTeach, capture: camera.bridge }, async (area) => {
    const { caregiverRegion, act, status, store, seeded, focused, confirmation, confirmDelete, key, handle } = area;
    await teachWithCamera(area, camera);
    for (const hands of [rightHand, bothHands, rightHand]) {
      await record(area, camera, 20, hands);
      await act(() => area.button("Behalten").click());
    }
    let view = teachViewOf(caregiverRegion);
    assert.equal(view.count, "3 Beispiele gespeichert.");
    const deletes = buttonsIn(view.view).filter((element) => element.textContent === "Löschen");
    assert.deepEqual(deletes.map((element) => element["aria-label"]), ["Beispiel 1 löschen", "Beispiel 2 löschen", "Beispiel 3 löschen"]);
    assert.notEqual(area.button("Alle Beispiele löschen"), undefined);

    // One: the camera stops, the confirmation is all there is.
    await act(() => deletes[1].click());
    assert.equal(camera.running, false);
    let confirm = confirmation();
    assert.deepEqual(confirm.texts.slice(0, 2), ["Beispiel 2 von „Trinken“ auf der Tafel von „Mia“ löschen?", "Das kann nicht rückgängig gemacht werden. Die Gebärde kann danach neu aufgenommen werden."]);
    assert.deepEqual(buttonsIn(confirm.view).map((element) => element.textContent), ["Abbrechen", "Endgültig löschen"]);
    assert.equal(focused.current, confirm.cancel);
    assert.equal(teachViewOf(caregiverRegion), null);
    // A tap deletes nothing.
    await act(() => confirm.confirm.click());
    assert.equal((await listExamples(await store(), seeded.id)).examples.length, 3);
    // Escape goes back to the teaching view, to the button that opened it.
    assert.equal(key("Escape"), 1);
    await handle.settled();
    assert.equal(focused.current["aria-label"], "Beispiel 2 löschen");
    const names = (await listExamples(await store(), seeded.id)).examples.map((example) => example.name);
    await act(() => buttonsIn(teachViewOf(caregiverRegion).view).find((element) => element["aria-label"] === "Beispiel 2 löschen").click());
    await confirmDelete();
    assert.equal(teachViewOf(caregiverRegion).note, "Beispiel 2 wurde gelöscht.");
    assert.deepEqual((await listExamples(await store(), seeded.id)).examples.map((example) => example.name), [names[0], names[2]]);
    view = teachViewOf(caregiverRegion);
    assert.equal(view.count, "2 Beispiele gespeichert. Empfohlen sind mindestens 3.");
    assert.equal(focused.current, view.heading);

    // All of the tile.
    await act(() => area.button("Alle Beispiele löschen").click());
    confirm = confirmation();
    assert.equal(confirm.texts[0], "Alle 2 Beispiele von „Trinken“ auf der Tafel von „Mia“ löschen?");
    await act(() => confirm.cancel.click());
    assert.equal(focused.current, area.button("Alle Beispiele löschen"));
    await act(() => area.button("Alle Beispiele löschen").click());
    await confirmDelete();
    assert.equal(teachViewOf(caregiverRegion).note, "2 Beispiele wurden gelöscht.");
    assert.equal(teachViewOf(caregiverRegion).count, "Noch kein Beispiel gespeichert. Empfohlen sind mindestens 3.");
    assert.deepEqual(await (await store()).data(seeded.id).names(), ["concept.hilfe", "concept.trinken"]);
  });
});

test("teach: nothing can be deleted while a recording runs or waits for 'Behalten'", async () => {
  const camera = fakeCamera();
  await withArea({ seed: seedTeach, capture: camera.bridge }, async (area) => {
    await teachWithCamera(area, camera);
    for (let n = 0; n < 2; n += 1) {
      await record(area, camera, 20, rightHand);
      await area.act(() => area.button("Behalten").click());
    }
    // Not during the countdown, and not while recording.
    await area.act(() => area.button("Aufnahme starten").click());
    assert.equal(area.button("Löschen"), undefined);
    assert.equal(area.button("Alle Beispiele löschen"), undefined);
    area.clock.advance(TEACH_COUNTDOWN_S * 1000);
    await area.handle.settled();
    assert.equal(area.button("Löschen"), undefined);
    for (let i = 0; i < 20; i += 1) await camera.feed(rightHand(i));
    await area.act(() => area.button("Aufnahme beenden").click());
    assert.equal(area.button("Löschen"), undefined);
    await area.act(() => area.button("Verwerfen").click());
    assert.notEqual(area.button("Löschen"), undefined);
  });
});

test("teach: the profile's size is read when the view opens; near or at the limit it is said before recording, and at the limit there is no camera", async () => {
  const record1 = 21 * 1024;
  for (const [fill, expected, camera] of [
    [0, null, true],
    [0.92, "Der Platz für dieses Profil ist fast voll. Es passen nur noch wenige Beispiele hinein. Lösche Beispiele, die nicht mehr gebraucht werden.", true],
    [0.99, "Der Platz für dieses Profil ist voll. Neue Beispiele können erst gespeichert werden, wenn Beispiele gelöscht sind.", false],
  ]) {
    const backend = new MemoryBackend();
    const limits = { maxBytes: 34 * 1024 + record1 * 20 };
    const seed = async () => {
      const store = await ProfileStore.open(backend, { limits });
      const mia = await seedTeach(store);
      if (fill > 0) await store.data(mia.id).set("filler", "x".repeat(Math.round(record1 * 20 * fill)));
      return mia;
    };
    let usageCalls = 0;
    await withArea({ seed, backend, capture: fakeCamera().bridge, app: {
      store: async () => {
        const store = await ProfileStore.open(backend, { limits });
        const usage = store.usage.bind(store);
        store.usage = (id) => { usageCalls += 1; return usage(id); };
        return store;
      },
      refreshBoard: async () => undefined,
    } }, async (area) => {
      await area.holdOpen();
      const beforeTeach = usageCalls;
      await area.act(() => area.concept("Trinken").teach.click());
      assert.equal(usageCalls, beforeTeach + 1, "usage is read once when the view opens");
      const view = teachViewOf(area.caregiverRegion);
      const warning = tree(view.view).find((element) => element.className === "caregiver-notice caregiver-warning")?.textContent ?? null;
      assert.equal(warning, expected);
      assert.equal(view.buttons.includes("Kamera starten"), camera);
      // Redraws do not read it again.
      await area.act(() => area.button("Zurück").click());
      assert.equal(usageCalls, beforeTeach + 1);
    });
  }
});

test("teach: a write the store refuses for size is reported in German, the recording is dropped, and it is not tried again", async () => {
  const camera = fakeCamera();
  const backend = new MemoryBackend();
  const writes = { count: 0 };
  const write = backend.write.bind(backend);
  backend.write = (batch) => { writes.count += 1; return write(batch); };
  const limits = { maxBytes: 34 * 1024 + 200 * 1024 };
  let opened = null;
  const app = {
    store: async () => (opened ??= await ProfileStore.open(backend, { limits })),
    refreshBoard: async () => undefined,
  };
  const seed = async () => seedTeach(await ProfileStore.open(backend, { limits }));
  await withArea({ seed, backend, capture: camera.bridge, app }, async (area) => {
    await teachWithCamera(area, camera);
    await record(area, camera, 20, bothHands);
    // Meanwhile something else fills the profile (another tab, say).
    await (await app.store()).data(area.seeded.id).set("filler", "x".repeat(190 * 1024));
    const before = writes.count;
    await area.act(() => area.button("Behalten").click());
    assert.equal(teachViewOf(area.caregiverRegion).note, "Das Profil ist voll. Das Beispiel wurde nicht gespeichert. Bitte nicht mehr gebrauchte Beispiele löschen.");
    assert.equal(byClass(area.caregiverRegion, "caregiver-teach-note").className, "caregiver-teach-note caregiver-warning");
    const view = teachViewOf(area.caregiverRegion);
    assert.equal(view.result, null);
    assert.deepEqual(view.buttons, ["Zurück"]);
    assert.equal(camera.running, false);
    // At most the store's own correction of its usage record; no second attempt, also not later.
    const after = writes.count;
    assert.ok(after - before <= 1);
    area.clock.advance(60_000);
    await area.handle.settled();
    for (let i = 0; i < 10; i += 1) await turn();
    assert.equal(writes.count, after);
    assert.ok(!(await (await app.store()).data(area.seeded.id).names()).some((name) => name.startsWith("gesture.")));
  });
});

test("teach: the press shield covers the view: a tap that lands on 'Abbrechen' or 'Aufnahme beenden' as it appears does nothing", async () => {
  const wall = wallClock();
  const camera = fakeCamera();
  await withArea({ seed: seedTeach, capture: camera.bridge, now: wall.now }, async (area) => {
    await area.holdOpen();
    wall.t += 1000;
    await area.act(() => area.concept("Trinken").teach.click());
    wall.t += 1000;
    await area.act(() => area.button("Kamera starten").click());
    await untilTaught(area.handle, () => area.button("Aufnahme starten") !== undefined);
    wall.t += 1000;
    await area.act(() => area.button("Aufnahme starten").click());
    // A second tap 100 ms later, where "Abbrechen" of the countdown now is: swallowed, the countdown goes on.
    wall.t += 100;
    await area.act(() => area.button("Abbrechen").click());
    assert.notEqual(area.button("Abbrechen"), undefined);
    area.clock.advance(TEACH_COUNTDOWN_S * 1000);
    await area.handle.settled();
    // The same when the recording begins and "Aufnahme beenden" appears under a finger.
    wall.t += 100;
    await area.act(() => area.button("Aufnahme beenden").click());
    assert.notEqual(area.button("Aufnahme beenden"), undefined);
    wall.t += 1000;
    await area.act(() => area.button("Aufnahme beenden").click());
    assert.notEqual(area.button("Aufnahme starten"), undefined);
  });
});

test("teach: the camera's picture shows in a fixed box above the live line while the camera runs, with the points of each frame; the box stays when it stops", async () => {
  const camera = fakeCamera();
  await withArea({ seed: seedTeach, capture: camera.bridge }, async (area) => {
    const box = () => byClass(byClass(area.caregiverRegion, "caregiver-teach"), "caregiver-teach-preview");
    await area.holdOpen();
    await area.act(() => area.concept("Trinken").teach.click());
    // Before the camera: the box is there, empty, so nothing moves when the picture comes.
    assert.deepEqual(box().children, []);
    assert.equal(camera.log.previews.length, 0, "no preview before the tap");
    await area.act(() => area.button("Kamera starten").click());
    await untilTaught(area.handle, () => area.button("Aufnahme starten") !== undefined);
    const [preview] = camera.log.previews;
    assert.deepEqual(box().children, [preview.element]);
    const [video, canvas] = preview.element.children;
    assert.equal(video.tagName, "video");
    assert.equal(video.className, "capture-preview-video");
    assert.equal(video.srcObject, camera.log.streams[0], "the camera's own stream, no other");
    assert.equal(video.paused, false);
    assert.equal(canvas.tagName, "canvas");
    // A frame with the child's right hand: drawn in the right hand's colour.
    await camera.feed(rightHand(0));
    assert.deepEqual(canvas.calls[0], ["clearRect", 0, 0, 400, 300]);
    assert.ok(canvas.calls.some(([name, value]) => name === "strokeStyle=" && value === PREVIEW_COLOURS.right));
    assert.ok(!canvas.calls.some(([name, value]) => name === "strokeStyle=" && value === PREVIEW_COLOURS.left));
    assert.equal(teachViewOf(area.caregiverRegion).live, "Eine Hand im Bild. Schultern zu sehen.");
    // No hand: the canvas is only cleared.
    canvas.calls.length = 0;
    await camera.feed([]);
    assert.deepEqual(canvas.calls, [["clearRect", 0, 0, 400, 300]]);
    // The same picture through countdown, recording and the result: each redraw puts it into the new box.
    await startRecording(area);
    assert.deepEqual(box().children, [preview.element]);
    for (let i = 0; i < 20; i += 1) await camera.feed(rightHand(i));
    await area.act(() => area.button("Aufnahme beenden").click());
    assert.deepEqual(teachViewOf(area.caregiverRegion).buttons, ["Behalten", "Verwerfen", "Zurück"]);
    assert.deepEqual(box().children, [preview.element]);
    assert.equal(preview.element.children[0], video, "the video is not made again");
    assert.equal(camera.log.previews.length, 1);
    await area.act(() => area.button("Verwerfen").click());
    assert.deepEqual(box().children, [preview.element]);
    // The camera fails: the picture goes, the box stays.
    camera.fail();
    await untilTaught(area.handle, () => area.button("Kamera starten") !== undefined);
    assert.deepEqual(preview.element.children, []);
    assert.equal(video.srcObject, null);
    assert.deepEqual(box().children, []);
    // A new start makes a new preview.
    await area.act(() => area.button("Kamera starten").click());
    await untilTaught(area.handle, () => area.button("Aufnahme starten") !== undefined);
    assert.equal(camera.log.previews.length, 2);
    assert.deepEqual(box().children, [camera.log.previews[1].element]);
  });
});

// ---------------------------------------------------------------------------
// The camera choice (card NG-43): "Kamera: vorne / hinten".

test("teach: the camera choice is a row of its own under the buttons, 'vorne' by default; 'hinten' is remembered on the device and asks for the back camera, mirror off", async () => {
  const camera = fakeCamera();
  await withArea({ seed: seedTeach, capture: camera.bridge }, async (area) => {
    await area.holdOpen();
    await area.act(() => area.concept("Trinken").teach.click());
    const choiceRow = () => byClass(byClass(area.caregiverRegion, "caregiver-teach-controls"), "camera-choice");
    assert.equal(choiceRow().role, "group");
    assert.equal(choiceRow()["aria-label"], "Kamera");
    assert.equal(choiceRow().children[0].textContent, "Kamera:");
    assert.deepEqual(teachViewOf(area.caregiverRegion).facing, ["vorne*", "hinten"]);
    // The buttons of the view are the same as without the choice; "Kamera starten" stays first in its row.
    assert.deepEqual(teachViewOf(area.caregiverRegion).buttons, ["Kamera starten", "Zurück"]);
    assert.equal(camera.log.cameraRequests, 0, "choosing is not starting");
    await area.act(() => area.button("hinten").click());
    assert.deepEqual(teachViewOf(area.caregiverRegion).facing, ["vorne", "hinten*"]);
    assert.equal(area.cameraStorage.items.get(CAMERA_FACING_KEY), "environment");
    assert.equal(camera.log.cameraRequests, 0);
    await area.act(() => area.button("Kamera starten").click());
    await untilTaught(area.handle, () => area.button("Aufnahme starten") !== undefined);
    assert.deepEqual(camera.log.facings, ["environment"]);
    assert.deepEqual(camera.log.constraints[0].video.facingMode, { exact: "environment" });
    // The back camera's picture is not mirrored; no fallback line.
    assert.equal(camera.log.previews[0].element.dataset.mirrored, "false");
    assert.equal(teachViewOf(area.caregiverRegion).camera, "");
    // During the countdown, the recording and while a recording waits, the choice cannot change.
    await area.act(() => area.button("Aufnahme starten").click());
    assert.deepEqual(teachViewOf(area.caregiverRegion).facing, ["vorne (aus)", "hinten* (aus)"]);
    await area.act(() => area.button("vorne").click());
    assert.equal(area.cameraStorage.items.get(CAMERA_FACING_KEY), "environment");
    assert.equal(camera.log.cameraRequests, 1);
    area.clock.advance(TEACH_COUNTDOWN_S * 1000);
    await area.handle.settled();
    for (let i = 0; i < 20; i += 1) await camera.feed(rightHand(i));
    await area.act(() => area.button("Aufnahme beenden").click());
    assert.deepEqual(teachViewOf(area.caregiverRegion).facing, ["vorne (aus)", "hinten* (aus)"]);
    await area.act(() => area.button("Verwerfen").click());
    // The camera runs and records nothing: "vorne" stops it and starts the front camera at once.
    await area.act(() => area.button("vorne").click());
    await untilTaught(area.handle, () => area.button("Aufnahme starten") !== undefined);
    assert.equal(camera.log.cameraRequests, 2);
    assert.equal(camera.log.tracksStopped, 1, "the back camera is stopped");
    assert.deepEqual(camera.log.facings, ["environment", "user"]);
    assert.deepEqual(camera.log.constraints[1].video.facingMode, "user");
    assert.equal(camera.log.previews[1].element.dataset.mirrored, "true");
    assert.equal(area.cameraStorage.items.get(CAMERA_FACING_KEY), "user");
    // Leaving stops it, as before.
    await area.act(() => area.button("Zurück").click());
    assert.equal(camera.running, false);
  });
});

test("teach: the choice is the device's, shared with the camera test and the child's gesture view; a blocked storage still holds it while the page is open", async () => {
  const camera = fakeCamera();
  const storage = memoryStorage();
  // Chosen earlier on this device (in the camera test, say): teaching opens with it.
  storage.setItem(CAMERA_FACING_KEY, "environment");
  await withArea({ seed: seedTeach, capture: camera.bridge, cameraStorage: storage }, async (area) => {
    await area.holdOpen();
    await area.act(() => area.concept("Trinken").teach.click());
    assert.deepEqual(teachViewOf(area.caregiverRegion).facing, ["vorne", "hinten*"]);
    await area.act(() => area.button("vorne").click());
  });
  // What teaching remembered is what the capture module reads, and what its bridge uses when a view
  // (the child's gesture view) passes no camera of its own.
  assert.equal(loadCameraFacing(storage), "user");
  storage.setItem(CAMERA_FACING_KEY, "environment");
  const asked = [];
  const bridge = captureBridge({}, {
    storage: () => storage,
    environment: () => ({
      startTracker: async () => ({ detect: async () => ({ hands: [], pose: null }), close() {} }),
      getUserMedia: async (constraints) => { asked.push(constraints.video.facingMode); throw Object.assign(new Error("x"), { name: "NotAllowedError" }); },
      openFrames: async () => { throw new Error("not reached"); },
    }),
  });
  await bridge.start({}, {});
  await bridge.start({}, { facing: "user" });
  assert.deepEqual(asked, [{ exact: "environment" }, "user"]);

  // A storage that refuses: the choice is held in the area, and the camera follows it.
  const blocked = fakeCamera();
  await withArea({ seed: seedTeach, capture: blocked.bridge, cameraStorage: memoryStorage({ refuse: true }) }, async (area) => {
    await area.holdOpen();
    await area.act(() => area.concept("Trinken").teach.click());
    assert.deepEqual(teachViewOf(area.caregiverRegion).facing, ["vorne*", "hinten"]);
    await area.act(() => area.button("hinten").click());
    assert.deepEqual(teachViewOf(area.caregiverRegion).facing, ["vorne", "hinten*"]);
    await area.act(() => area.button("Kamera starten").click());
    await untilTaught(area.handle, () => area.button("Aufnahme starten") !== undefined);
    assert.deepEqual(blocked.log.facings, ["environment"]);
  });
  // No storage at all (none in this browser): front by default.
  const none = fakeCamera();
  await withArea({ seed: seedTeach, capture: none.bridge, cameraStorage: null }, async (area) => {
    await teachWithCamera(area, none);
    assert.deepEqual(none.log.facings, ["user"]);
  });
});

test("teach: a device without a back camera says so in German, uses the front one (mirrored), and teaching goes on", async () => {
  const camera = fakeCamera({ noBackCamera: true });
  const storage = memoryStorage();
  storage.setItem(CAMERA_FACING_KEY, "environment");
  await withArea({ seed: seedTeach, capture: camera.bridge, cameraStorage: storage }, async (area) => {
    await teachWithCamera(area, camera);
    assert.deepEqual(camera.log.constraints.map((entry) => entry.video.facingMode), [{ exact: "environment" }, "user"]);
    const view = teachViewOf(area.caregiverRegion);
    assert.equal(view.camera, "Hintere Kamera nicht verfügbar. Es läuft die vordere.");
    // The choice stays "hinten": on another device it would be there.
    assert.deepEqual(view.facing, ["vorne", "hinten*"]);
    assert.equal(storage.items.get(CAMERA_FACING_KEY), "environment");
    assert.equal(camera.log.previews[0].element.dataset.mirrored, "true", "the front camera's picture is mirrored");
    // The countdown takes the line over; a recording is made as usual.
    await record(area, camera, 20, rightHand);
    assert.match(teachViewOf(area.caregiverRegion).result, /Gebärde mit einer Hand \(rechts\)/);
    await area.act(() => area.button("Zurück").click());
    // The refused request opened nothing; the one camera that opened is stopped.
    assert.equal(camera.log.streams.length, 1);
    assert.equal(camera.log.tracksStopped, 1);
  });
});

test("teach: a bridge without a preview still teaches with the live line; the box stays empty", async () => {
  const camera = fakeCamera();
  const { createPreview, ...older } = camera.bridge;
  assert.equal(typeof createPreview, "function");
  await withArea({ seed: seedTeach, capture: older }, async (area) => {
    await teachWithCamera(area, camera);
    await camera.feed(rightHand(0));
    assert.equal(teachViewOf(area.caregiverRegion).live, "Eine Hand im Bild. Schultern zu sehen.");
    assert.deepEqual(byClass(area.caregiverRegion, "caregiver-teach-preview").children, []);
  });
});

test("teach: the live line is written in place and does not count as a swap: a press during frames still counts", async () => {
  const wall = wallClock();
  const camera = fakeCamera();
  await withArea({ seed: seedTeach, capture: camera.bridge, now: wall.now }, async (area) => {
    await area.holdOpen();
    wall.t += 1000;
    await area.act(() => area.concept("Trinken").teach.click());
    wall.t += 1000;
    await area.act(() => area.button("Kamera starten").click());
    await untilTaught(area.handle, () => area.button("Aufnahme starten") !== undefined);
    wall.t += 1000;
    const startButton = area.button("Aufnahme starten");
    for (let i = 0; i < 5; i += 1) await camera.feed(i % 2 === 0 ? rightHand(i) : bothHands(i));
    await area.act(() => startButton.click());
    assert.notEqual(area.button("Abbrechen"), undefined);
  });
});

test("teach: a profile with examples says so before it is deleted, and deleting it removes them", async () => {
  const camera = fakeCamera();
  await withArea({ seed: seedTeach, capture: camera.bridge }, async (area) => {
    await teachWithCamera(area, camera);
    await record(area, camera, 20, rightHand);
    await area.act(() => area.button("Behalten").click());
    await area.act(() => area.button("Zurück").click());
    await area.act(() => area.profile("Mia").remove.click());
    assert.ok(area.confirmation().texts.includes("Alle ausgewählten Begriffe und beigebrachten Gebärden dieses Profils gehen verloren, außer sie stehen in einer Sicherung."));
    await area.confirmDelete();
    assert.deepEqual(Object.keys(area.backend.snapshot()).filter((entry) => entry.includes("gesture.")), []);
  });
});

// --- Second build of card NG-19: review findings ---

test("teach: a redraw that cannot read the store while the camera runs stops the camera; the notice is all that is left", async () => {
  const camera = fakeCamera();
  const backend = new MemoryBackend();
  const keys = backend.keys.bind(backend);
  let failing = false;
  backend.keys = (prefix) => (failing ? Promise.reject(new Error("read failed")) : keys(prefix));
  await withArea({ seed: seedTeach, backend, capture: camera.bridge }, async (area) => {
    await teachWithCamera(area, camera);
    await startRecording(area);
    for (let i = 0; i < 5; i += 1) await camera.feed(rightHand(i));
    failing = true;
    await area.act(() => area.button("Aufnahme beenden").click());
    assert.equal(teachViewOf(area.caregiverRegion), null);
    assert.ok(area.texts().includes("Die gespeicherten Profile können gerade nicht gelesen werden. Deshalb kann hier im Moment nichts geändert werden."));
    assert.equal(camera.running, false);
    assert.equal(camera.log.trackerClosed, 1);
    // Also during the countdown: its timer goes with the camera.
    failing = false;
    await area.act(() => area.button("Tafel neu laden").click());
    await area.act(() => area.concept("Trinken").teach.click());
    await area.act(() => area.button("Kamera starten").click());
    await untilTaught(area.handle, () => area.button("Aufnahme starten") !== undefined);
    failing = true;
    await area.act(() => area.button("Aufnahme starten").click());
    assert.equal(camera.running, false);
    area.clock.advance(TEACH_COUNTDOWN_S * 1000 + TEACH_MAX_RECORDING_MS);
    await area.handle.settled();
    assert.equal(teachViewOf(area.caregiverRegion), null);
  });
});

/** Three examples of "Trinken", recorded through the view; leaves the view open with the camera on. */
async function threeExamples(area, camera) {
  await teachWithCamera(area, camera);
  for (let n = 0; n < 3; n += 1) {
    await record(area, camera, 20, rightHand);
    await area.act(() => area.button("Behalten").click());
  }
}

test("teach: a delete that fails says what is true, read from the store: none, or some of all", async () => {
  const camera = fakeCamera();
  await withArea({ seed: seedTeach, capture: camera.bridge }, async (area) => {
    await threeExamples(area, camera);
    const stored = async () => (await listExamples(await area.store(), area.seeded.id, "trinken")).examples.length;
    // One example, the write fails: it is still there, and that is said.
    await area.act(() => buttonsIn(area.caregiverRegion).find((element) => element["aria-label"] === "Beispiel 2 löschen").click());
    area.backend.failWrite(1);
    await area.confirmDelete();
    assert.equal(teachViewOf(area.caregiverRegion).note, "Das konnte gerade nicht gespeichert werden. Bitte versuche es noch einmal. Beispiel 2 ist noch gespeichert.");
    assert.equal(await stored(), 3);
    // All of them, the second write fails: one was deleted, two are left.
    await area.act(() => area.button("Alle Beispiele löschen").click());
    area.backend.failWrite(2);
    await area.confirmDelete();
    assert.equal(teachViewOf(area.caregiverRegion).note, "Das Löschen wurde unterbrochen: 1 Beispiel wurde gelöscht, 2 sind noch gespeichert. Bitte noch einmal versuchen.");
    assert.equal(byClass(area.caregiverRegion, "caregiver-teach-note").className, "caregiver-teach-note caregiver-warning");
    assert.equal(await stored(), 2);
    assert.equal(teachViewOf(area.caregiverRegion).count, "2 Beispiele gespeichert. Empfohlen sind mindestens 3.");
  });
});

test("teach: when the examples cannot be read, the view does not claim a count", async () => {
  const backend = new MemoryBackend();
  const get = backend.get.bind(backend);
  let failing = false;
  backend.get = (key) => (failing && key.includes("/data/gesture.") ? Promise.reject(new Error("read failed")) : get(key));
  const camera = fakeCamera();
  await withArea({ seed: seedTeach, backend, capture: camera.bridge }, async (area) => {
    await teachWithCamera(area, camera);
    await record(area, camera, 20, rightHand);
    await area.act(() => area.button("Behalten").click());
    failing = true;
    await area.act(() => area.button("Zurück").click());
    await area.act(() => area.concept("Trinken").teach.click());
    const view = teachViewOf(area.caregiverRegion);
    assert.equal(view.count, null);
    assert.ok(view.texts.includes("Die gespeicherten Beispiele können gerade nicht gelesen werden."));
    assert.ok(!view.texts.some((text) => text.includes("Noch kein Beispiel")));
  });
});

test("teach: the row on the board and the view count the same entries; unusable ones are said apart in the view", async () => {
  const seed = async (store) => {
    const mia = await seedTeach(store);
    await store.data(mia.id).set("gesture.trinken.00000000000a", { version: 1, broken: true });
    return mia;
  };
  const camera = fakeCamera();
  await withArea({ seed, capture: camera.bridge }, async (area) => {
    await area.holdOpen();
    assert.equal(area.concept("Trinken").gesture, "Gebärde: 1 Beispiel");
    await area.act(() => area.concept("Trinken").teach.click());
    assert.equal(teachViewOf(area.caregiverRegion).count, "1 Beispiel gespeichert, davon 1 nicht verwendbar. Empfohlen sind mindestens 3.");
    await area.act(() => area.button("Kamera starten").click());
    await untilTaught(area.handle, () => area.button("Aufnahme starten") !== undefined);
    await record(area, camera, 20, rightHand);
    await area.act(() => area.button("Behalten").click());
    assert.equal(teachViewOf(area.caregiverRegion).count, "2 Beispiele gespeichert, davon 1 nicht verwendbar. Empfohlen sind mindestens 3.");
    await area.act(() => area.button("Zurück").click());
    assert.equal(area.concept("Trinken").gesture, "Gebärde: 2 Beispiele");
  });
});

test("teach: the controls stay one block right under the heading, with the preview box first, then the live line, and the main button first in its row, in every state", async () => {
  const camera = fakeCamera();
  await withArea({ seed: seedTeach, capture: camera.bridge }, async (area) => {
    const seen = [];
    const look = (state) => {
      const view = byClass(area.caregiverRegion, "caregiver-teach");
      const [heading, controls] = view.children;
      assert.equal(heading.tagName, "h2", state);
      assert.equal(controls.className, "caregiver-teach-controls", state);
      // The camera choice (card NG-43) is the last row, under the buttons: nothing above it moves because of it.
      assert.deepEqual(controls.children.map((child) => child.className.split(" ")[0]), ["caregiver-teach-preview", "caregiver-teach-live", "caregiver-teach-camera", "caregiver-profile-actions", "camera-choice"], state);
      const actions = controls.children[3].children.map((child) => child.textContent);
      assert.equal(actions.at(-1), "Zurück", state);
      seen.push(actions[0]);
      // Nothing about the teaching goes to the status line, which would move the block from above.
      assert.equal(area.status(), "", state);
    };
    await area.holdOpen();
    await area.act(() => area.concept("Trinken").teach.click());
    look("camera off");
    await area.act(() => area.button("Kamera starten").click());
    await untilTaught(area.handle, () => area.button("Aufnahme starten") !== undefined);
    for (let n = 0; n < 3; n += 1) {
      look(`ready ${n}`);
      await area.act(() => area.button("Aufnahme starten").click());
      look(`countdown ${n}`);
      area.clock.advance(TEACH_COUNTDOWN_S * 1000);
      await area.handle.settled();
      look(`recording ${n}`);
      for (let i = 0; i < 20; i += 1) await camera.feed(rightHand(i));
      await area.act(() => area.button("Aufnahme beenden").click());
      look(`result ${n}`);
      await area.act(() => area.button("Behalten").click());
    }
    look("after three");
    assert.deepEqual([...new Set(seen)], ["Kamera starten", "Aufnahme starten", "Abbrechen", "Aufnahme beenden", "Behalten"]);
  });
});

test("teach: after 'Aufnahme starten' a countdown runs; frames are kept only after it; 'Abbrechen' ends it and records nothing", async () => {
  const camera = fakeCamera();
  await withArea({ seed: seedTeach, capture: camera.bridge }, async (area) => {
    const { clock, handle, caregiverRegion } = area;
    await teachWithCamera(area, camera);
    assert.equal(TEACH_COUNTDOWN_S, 3);
    await area.act(() => area.button("Aufnahme starten").click());
    assert.equal(teachViewOf(caregiverRegion).camera, "Gleich geht’s los: 3");
    assert.deepEqual(teachViewOf(caregiverRegion).buttons.slice(0, 2), ["Abbrechen", "Zurück"]);
    // Frames during the countdown (the hand that tapped, leaving) are not kept.
    for (let i = 0; i < 20; i += 1) await camera.feed(rightHand(i));
    clock.advance(1000);
    await handle.settled();
    assert.equal(teachViewOf(caregiverRegion).camera, "Gleich geht’s los: 3 … 2");
    clock.advance(1000);
    await handle.settled();
    assert.equal(teachViewOf(caregiverRegion).camera, "Gleich geht’s los: 3 … 2 … 1");
    assert.equal(area.button("Aufnahme beenden"), undefined);
    clock.advance(1000);
    await handle.settled();
    assert.equal(teachViewOf(caregiverRegion).camera, "Die Aufnahme läuft. Jetzt die Gebärde machen.");
    await area.act(() => area.button("Aufnahme beenden").click());
    assert.match(teachViewOf(caregiverRegion).result, /Von der Kamera kam kein Bild an\./);
    // "Abbrechen": back to "Aufnahme starten", and the time passing starts nothing.
    await area.act(() => area.button("Aufnahme starten").click());
    await area.act(() => area.button("Abbrechen").click());
    assert.notEqual(area.button("Aufnahme starten"), undefined);
    clock.advance(TEACH_COUNTDOWN_S * 1000 + TEACH_MAX_RECORDING_MS);
    await handle.settled();
    assert.notEqual(area.button("Aufnahme starten"), undefined);
    assert.equal(camera.running, true);
  });
});

test("teach: the countdown ends with every way out ('Zurück', Escape, a hidden page): the camera stops and nothing starts later", async () => {
  const ways = {
    "Zurück": async (area) => area.act(() => area.button("Zurück").click()),
    Escape: async (area) => { area.key("Escape"); await area.handle.settled(); },
    "hidden page": async (area) => { area.page.hide(); await area.handle.settled(); },
  };
  for (const [name, leave] of Object.entries(ways)) {
    const camera = fakeCamera();
    await withArea({ seed: seedTeach, capture: camera.bridge }, async (area) => {
      await teachWithCamera(area, camera);
      await area.act(() => area.button("Aufnahme starten").click());
      area.clock.advance(1000);
      await leave(area);
      assert.equal(camera.running, false, name);
      area.clock.advance(TEACH_COUNTDOWN_S * 1000 + TEACH_MAX_RECORDING_MS);
      await area.handle.settled();
      assert.equal(area.button("Aufnahme beenden"), undefined, name);
      assert.equal(teachViewOf(area.caregiverRegion), null, name);
    });
  }
});

test("teach: a two-hand recording with one hand lying still gets a hint; what is stored is unchanged", async () => {
  const camera = fakeCamera();
  await withArea({ seed: seedTeach, capture: camera.bridge }, async (area) => {
    await teachWithCamera(area, camera);
    await record(area, camera, 20, (i) => [trackerHand(0.3 + i * 0.01, 0.5, "Right"), trackerHand(0.7, 0.5, "Left")]);
    const view = teachViewOf(area.caregiverRegion);
    assert.equal(view.result, "Die Aufnahme kann verwendet werden: Gebärde mit beiden Händen. Behalten oder verwerfen?");
    assert.equal(view.hint, "Eine Hand lag still im Bild. Wenn die Gebärde mit einer Hand gemacht wird, lieber ohne die zweite Hand im Bild aufnehmen.");
    await area.act(() => area.button("Behalten").click());
    const [example] = (await listExamples(await area.store(), area.seeded.id, "trinken")).examples;
    assert.equal(example.record.hands, "both");
    // Both hands moving: no hint.
    await record(area, camera, 20, bothHands);
    assert.equal(teachViewOf(area.caregiverRegion).hint, null);
  });
});

test("teach: a camera that fails during the countdown ends it: the problem is shown, and nothing starts later", async () => {
  const camera = fakeCamera();
  await withArea({ seed: seedTeach, capture: camera.bridge }, async (area) => {
    await teachWithCamera(area, camera);
    await area.act(() => area.button("Aufnahme starten").click());
    camera.fail();
    await untilTaught(area.handle, () => area.button("Kamera starten") !== undefined);
    assert.equal(teachViewOf(area.caregiverRegion).camera, CAPTURE_TEXT.problems.busy);
    area.clock.advance(TEACH_COUNTDOWN_S * 1000 + TEACH_MAX_RECORDING_MS);
    await area.handle.settled();
    assert.equal(teachViewOf(area.caregiverRegion).camera, CAPTURE_TEXT.problems.busy);
    assert.equal(area.button("Aufnahme beenden"), undefined);
  });
});

// --- Own concepts (card NG-34) ---

/** The fields of "Eigenen Begriff anlegen" while they are the body of the area, or null. */
const creating = (caregiverRegion) => {
  const view = byClass(caregiverRegion, "caregiver-takeover");
  if (view === undefined || byClass(view, "caregiver-new-concept") === undefined) return null;
  const find = (id) => tree(view).find((element) => element.id === id) ?? null;
  return {
    view, texts: textsIn(view), form: byClass(view, "caregiver-new-concept"),
    label: find("caregiver-new-concept-label"), speech: find("caregiver-new-concept-speech"), cancel: buttonNamed(view, "Abbrechen"),
  };
};
const createOwn = async ({ act, button, caregiverRegion }, label, speech) => {
  await act(() => button("Eigenen Begriff anlegen").click());
  const fields = creating(caregiverRegion);
  fields.label.value = label;
  fields.speech.value = speech;
  await act(() => fields.form.dispatch("submit"));
};
const ownEntries = (backend, profile) => Object.entries(backend.snapshot())
  .filter(([key, value]) => key.startsWith(`profile/${profile.id}/data/concept.`) && value.custom === true)
  .map(([key, value]) => [key.slice(`profile/${profile.id}/data/concept.`.length), value]);
const OWN_HEADING = "Eigene Begriffe, nicht auf der Tafel";

test("own concepts: 'Eigenen Begriff anlegen' takes over the body with a word and a sentence; saving puts a concept with a random id at the end of the board, and the child's board shows and speaks it", async () => {
  await withArea({ seed: seedThree }, async (area) => {
    const { holdOpen, act, button, caregiverRegion, focused, status, store, seeded, backend, handle, tiles, boardRegion, speech, concept, onBoard } = area;
    await holdOpen();
    await act(() => button("Eigenen Begriff anlegen").click());
    const open = creating(caregiverRegion);
    assert.deepEqual(open.texts, [
      "Eigener Begriff für die Tafel von „Mia“", "Wort auf der Taste", "Gesprochener Satz",
      "Der Begriff kommt ans Ende der Tafel. Danach kann ihm eine Gebärde beigebracht werden.", "Speichern", "Abbrechen",
    ]);
    assert.equal(focused.current, open.label);
    assert.deepEqual([open.label.value, open.speech.value, open.speech.tagName, open.label.spellcheck], ["", "", "textarea", false]);
    assert.deepEqual(byClass(caregiverRegion, "caregiver-body").children, [open.view]);
    open.label.value = "  Ball​ ";
    open.speech.value = "Ich möchte mit dem\nBall spielen.";
    await act(() => open.form.dispatch("submit"));
    assert.equal(status(), "Gespeichert: „Ball“ ist jetzt auf der Tafel.");
    assert.equal(creating(caregiverRegion), null);
    const own = ownEntries(backend, seeded);
    assert.equal(own.length, 1);
    const [id, entry] = own[0];
    // The id is generated, never taken from the label.
    assert.match(id, /^eigen-[0-9a-f]{8}$/);
    assert.deepEqual(entry, { version: 1, labelDe: "Ball", speechDe: "Ich möchte mit dem Ball spielen.", custom: true });
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, ["hilfe", "trinken", "pause", id]);
    assert.deepEqual(onBoard(), ["Hilfe", "Trinken", "Pause", "Ball"]);
    // A full row: it can be moved, reworded, taught a gesture and taken off.
    assert.deepEqual(concept("Ball").buttons, ["nach oben", "nach unten", "Text ändern", "Bild wählen", "Gebärde beibringen", "Vormachen", "Entfernen"]);
    assert.equal(concept("Ball").picture, null);
    assert.equal(focused.current, concept("Ball").row);
    await handle.close();
    assert.deepEqual(tiles(), ["Hilfe", "Trinken", "Pause", "Ball"]);
    const board = boardRegion.children.find((child) => child.className.split(" ")[0] === "concept-board");
    board.children.filter((child) => child.tagName === "button")[3].click();
    assert.deepEqual(speech.spoken.slice(-1), ["Ich möchte mit dem Ball spielen."]);
  });
});

test("own concepts: refusals are explained in German, nothing is written and the typed text stays; 'Abbrechen' writes nothing", async () => {
  await withArea({ seed: seedThree }, async (area) => {
    const { holdOpen, act, caregiverRegion, status, backend, focused, seeded } = area;
    await holdOpen();
    const before = JSON.stringify(backend.snapshot());
    await createOwn(area, "Ball", "   ");
    assert.equal(status(), "Bitte gib einen Satz ein, den das Gerät sprechen soll.");
    let open = creating(caregiverRegion);
    assert.equal(open.label.value, "Ball");
    assert.equal(focused.current, open.speech);
    open.label.value = "x".repeat(41);
    open.speech.value = "Satz.";
    await act(() => open.form.dispatch("submit"));
    assert.equal(status(), "Das Wort ist zu lang. Es darf höchstens 40 Zeichen haben.");
    open = creating(caregiverRegion);
    assert.equal(open.label.value, "x".repeat(41));
    assert.equal(focused.current, open.label);
    assert.equal(JSON.stringify(backend.snapshot()), before);
    await act(() => open.cancel.click());
    assert.equal(creating(caregiverRegion), null);
    assert.equal(focused.current, area.button("Eigenen Begriff anlegen"));
    assert.deepEqual(ownEntries(backend, seeded), []);
  });
});

test("own concepts: when the board write fails after the concept was stored, that is said and the concept can be added from the list of own concepts", async () => {
  await withArea({ seed: seedThree }, async (area) => {
    const { holdOpen, act, status, store, seeded, backend, concept, more, focused, caregiverRegion } = area;
    await holdOpen();
    // The first write stores the concept, the second (the board) fails.
    backend.failWrite(2);
    await createOwn(area, "Ball", "Ich möchte Ball spielen.");
    assert.equal(status(), "„Ball“ wurde angelegt, aber nicht auf die Tafel gesetzt. Der Begriff steht unten unter „Eigene Begriffe, nicht auf der Tafel“ und kann von dort hinzugefügt werden.");
    assert.ok(hasClass(statusElement(caregiverRegion), "caregiver-status-error"));
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, ["hilfe", "trinken", "pause"]);
    assert.deepEqual(more(), ["Mehr", "Fertig", "Ball"]);
    assert.ok(textsIn(caregiverRegion).includes(OWN_HEADING));
    assert.deepEqual(concept("Ball").buttons, ["Hinzufügen", "Endgültig löschen"]);
    assert.equal(focused.current, concept("Ball").add);
    await area.add("Ball");
    const [id] = ownEntries(backend, seeded)[0];
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, ["hilfe", "trinken", "pause", id]);
    assert.ok(!textsIn(caregiverRegion).includes(OWN_HEADING));
  });
});

test("own concepts: taken off the board, an own concept stays as an own concept, can be put back, and 'Rückgängig' works for it", async () => {
  await withArea({ seed: seedThree }, async (area) => {
    const { holdOpen, remove, act, concept, more, onBoard, store, seeded, backend, undo, takeBack } = area;
    await holdOpen();
    await createOwn(area, "Ball", "Ich möchte Ball spielen.");
    const [id] = ownEntries(backend, seeded)[0];
    await act(() => concept("Ball").up.click());
    assert.deepEqual(onBoard(), ["Hilfe", "Trinken", "Ball", "Pause"]);
    await remove("Ball");
    assert.deepEqual(onBoard(), ["Hilfe", "Trinken", "Pause"]);
    assert.deepEqual(more(), ["Mehr", "Fertig", "Ball"]);
    assert.equal(undo().textContent, "Rückgängig: „Ball“");
    await takeBack();
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, ["hilfe", "trinken", id, "pause"]);
    await remove("Ball");
    await area.add("Ball");
    assert.deepEqual(onBoard(), ["Hilfe", "Trinken", "Pause", "Ball"]);
    assert.equal(undo(), null);
  });
});

test("own concepts: 'Endgültig löschen' asks first; a hold deletes the concept and its gesture examples; 'Abbrechen' keeps everything", async () => {
  const seed = async (store) => {
    const mia = await createMia(store);
    await store.setConceptIds(mia.id, ["hilfe"]);
    const data = store.data(mia.id);
    await data.set("concept.eigen-0badc0de", { version: 1, labelDe: "Ball", speechDe: "Ich möchte Ball spielen.", custom: true });
    // A synthetic example record that this version cannot read: it goes with the concept all the same.
    await data.set("gesture.eigen-0badc0de.0123456789ab", { synthetic: true });
    await data.set("gesture.hilfe.0123456789ab", { synthetic: true });
    return mia;
  };
  await withArea({ seed }, async (area) => {
    const { holdOpen, act, concept, confirmation, confirmDelete, status, seeded, backend, focused, more, caregiverRegion } = area;
    await holdOpen();
    assert.deepEqual(more(), ["Trinken", "Pause", "Mehr", "Fertig", "Ball"]);
    const deleteOf = () => buttonNamed(concept("Ball").row, "Endgültig löschen");
    assert.equal(deleteOf()["aria-label"], "Endgültig löschen: Ball");
    await act(() => deleteOf().click());
    let view = confirmation();
    assert.deepEqual(view.texts.slice(0, 2), [
      "„Ball“ aus dem Profil „Mia“ endgültig löschen?",
      "Das Wort, der Satz, die beigebrachten Gebärden und der Vormachen-Clip dieses Begriffs werden gelöscht. Das kann nicht rückgängig gemacht werden.",
    ]);
    assert.equal(focused.current, view.cancel);
    // A tap deletes nothing: it has to be held.
    view.confirm.click();
    await area.handle.settled();
    assert.ok(backend.snapshot()[`profile/${seeded.id}/data/concept.eigen-0badc0de`] !== undefined);
    await act(() => view.cancel.click());
    assert.equal(confirmation(), null);
    assert.equal(focused.current, deleteOf());
    await act(() => focused.current.click());
    view = confirmation();
    await confirmDelete();
    assert.equal(status(), "„Ball“ wurde endgültig gelöscht.");
    const keys = Object.keys(backend.snapshot());
    assert.ok(!keys.some((key) => key.includes("eigen-0badc0de")), keys.join(", "));
    assert.ok(keys.includes(`profile/${seeded.id}/data/gesture.hilfe.0123456789ab`));
    assert.deepEqual(more(), ["Trinken", "Pause", "Mehr", "Fertig"]);
    assert.ok(!textsIn(caregiverRegion).includes(OWN_HEADING));
  });
});

test("own concepts: an entry a newer app wrote or one that cannot be read is never offered as an own concept to add or delete", async () => {
  const seed = async (store) => {
    const mia = await createMia(store);
    const data = store.data(mia.id);
    await data.set("concept.neu", { version: 2, labelDe: "Neu", speechDe: "Etwas Neues.", custom: true, colour: "blau" });
    await data.set("concept.kaputt", { version: 1, labelDe: "", speechDe: "x", custom: true });
    return mia;
  };
  await withArea({ seed }, async ({ holdOpen, more, caregiverRegion }) => {
    await holdOpen();
    assert.deepEqual(more(), ["Hilfe", "Trinken", "Pause", "Mehr", "Fertig"]);
    assert.ok(!textsIn(caregiverRegion).includes(OWN_HEADING));
    assert.equal(buttonNamed(caregiverRegion, "Endgültig löschen"), undefined);
  });
});

test("own concepts: a board at the limit of ids refuses a new concept before anything is written; ids that cannot be shown count", async () => {
  const seed = async (store) => {
    const mia = await createMia(store);
    const ids = Array.from({ length: 499 }, (_, at) => `geist-${at}`);
    await store.setConceptIds(mia.id, ["hilfe", ...ids]);
    return mia;
  };
  await withArea({ seed }, async (area) => {
    const { holdOpen, status, backend, seeded, caregiverRegion } = area;
    await holdOpen();
    const before = JSON.stringify(backend.snapshot());
    await createOwn(area, "Ball", "Ich möchte Ball spielen.");
    assert.equal(status(), "Auf eine Tafel passen höchstens 500 Begriffe. Es wurde nichts geändert.");
    assert.notEqual(creating(caregiverRegion), null);
    assert.equal(JSON.stringify(backend.snapshot()), before);
    assert.deepEqual(ownEntries(backend, seeded), []);
  });
});

// --- Own pictures (card NG-8673323346005092805); the picture data is synthetic ---

const PICTURE_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
/** Stands in for the canvas: a file named "refuse-<reason>" is refused, any other becomes PICTURE_PNG. */
const fakePicture = async (file) => {
  if (file.name.startsWith("refuse-")) throw new PictureRefusal(file.name.slice("refuse-".length));
  return PICTURE_PNG;
};
const pictureViewOf = (region) => {
  const view = byClass(region, "caregiver-picture");
  if (view === undefined) return null;
  return {
    view, texts: textsIn(view), file: byClass(view, "caregiver-picture-file"),
    images: tree(view).filter((element) => element.tagName === "img").map((element) => element.src),
    save: buttonNamed(view, "Speichern") ?? null, cancel: buttonNamed(view, "Abbrechen"),
    reset: buttonNamed(view, "Bild der App wiederherstellen") ?? buttonNamed(view, "Bild entfernen") ?? null,
  };
};
/** Chooses a file in the open picture view and waits until the view shows the result. */
const chooseFile = async (area, name) => {
  const view = pictureViewOf(area.caregiverRegion);
  view.file.files = [{ name, type: "image/png", size: 10 }];
  view.file.dispatch("change");
  await area.handle.settled();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await area.handle.settled();
};

test("pictures: 'Bild wählen' opens a view that takes over the body, shows the key's picture now and says that the picture stays on the device and needs the right to use it", async () => {
  await withArea({ seed: seedThree, pictureFromFile: fakePicture }, async (area) => {
    const { holdOpen, act, concept, caregiverRegion, focused } = area;
    await holdOpen();
    assert.equal(concept("Trinken").buttons.includes("Bild wählen"), true);
    await act(() => buttonNamed(concept("Trinken").row, "Bild wählen").click());
    const view = pictureViewOf(caregiverRegion);
    assert.deepEqual(view.texts, [
      "Bild für „Trinken“ – Tafel von „Mia“", "Jetzt auf der Taste:",
      "Das Bild wird nur in diesem Browser auf diesem Gerät gespeichert, in diesem Profil. Die App sendet es nicht.",
      "Bitte nur Bilder verwenden, die ihr verwenden dürft, zum Beispiel METACOM-Symbole aus eurer eigenen Lizenz oder eigene Zeichnungen und Fotos. Fotos, auf denen ein Kind zu erkennen ist, besser nicht verwenden.",
      "Bilddatei auswählen", "PNG, JPEG, WebP, GIF oder SVG. Das Bild wird auf höchstens 256 × 256 Pixel verkleinert.", "Abbrechen",
    ]);
    assert.deepEqual(view.images, ["./icons/trinken.svg"]);
    assert.equal(view.file.type, "file");
    assert.equal(view.file.accept, "image/png,image/jpeg,image/webp,image/gif,image/svg+xml");
    assert.equal(focused.current, view.file);
    assert.equal(view.save, null);
    assert.equal(view.reset, null);
    assert.deepEqual(byClass(caregiverRegion, "caregiver-body").children, [view.view]);
    await act(() => view.cancel.click());
    assert.equal(pictureViewOf(caregiverRegion), null);
    assert.equal(focused.current, buttonNamed(concept("Trinken").row, "Bild wählen"));
  });
});

test("pictures: a chosen file is shown and stored only on 'Speichern'; the child's board shows it; 'Bild der App wiederherstellen' takes it back", async () => {
  await withArea({ seed: seedThree, pictureFromFile: fakePicture }, async (area) => {
    const { holdOpen, act, concept, caregiverRegion, status, backend, seeded, handle, focused, boardRegion } = area;
    await holdOpen();
    await act(() => buttonNamed(concept("Trinken").row, "Bild wählen").click());
    const before = JSON.stringify(backend.snapshot());
    await chooseFile(area, "metacom-trinken.png");
    let view = pictureViewOf(caregiverRegion);
    assert.ok(view.texts.includes("Neues Bild:"));
    assert.deepEqual(view.images, ["./icons/trinken.svg", PICTURE_PNG]);
    assert.equal(focused.current, view.save);
    assert.equal(JSON.stringify(backend.snapshot()), before);
    await act(() => view.save.click());
    assert.equal(status(), "Gespeichert: neues Bild für „Trinken“.");
    assert.deepEqual(backend.snapshot()[`profile/${seeded.id}/data/symbol.trinken`], { version: 1, dataUrl: PICTURE_PNG });
    assert.equal(pictureViewOf(caregiverRegion), null);
    assert.equal(concept("Trinken").picture, PICTURE_PNG);
    assert.equal(focused.current, buttonNamed(concept("Trinken").row, "Bild wählen"));
    // The wording entry is untouched.
    assert.deepEqual(backend.snapshot()[`profile/${seeded.id}/data/concept.trinken`], { version: 1, labelDe: "Trinken", speechDe: "Ich möchte etwas trinken.", copied: true });
    await act(() => buttonNamed(concept("Trinken").row, "Bild wählen").click());
    view = pictureViewOf(caregiverRegion);
    assert.deepEqual(view.images, [PICTURE_PNG]);
    assert.equal(view.reset.textContent, "Bild der App wiederherstellen");
    await act(() => view.reset.click());
    assert.equal(status(), "„Trinken“ zeigt wieder das Bild der App.");
    assert.equal(backend.snapshot()[`profile/${seeded.id}/data/symbol.trinken`], undefined);
    assert.equal(concept("Trinken").picture, "./icons/trinken.svg");
    // And on the child's board after closing.
    await act(() => buttonNamed(concept("Pause").row, "Bild wählen").click());
    await chooseFile(area, "pause.png");
    await act(() => pictureViewOf(caregiverRegion).save.click());
    await handle.close();
    const board = boardRegion.children.find((child) => child.className.split(" ")[0] === "concept-board");
    const sources = board.children.filter((child) => child.tagName === "button").map((tile) => tile.children.find((child) => child.tagName === "img")?.src ?? null);
    assert.deepEqual(sources, ["./icons/hilfe.svg", "./icons/trinken.svg", PICTURE_PNG]);
  });
});

test("pictures: an own concept gets a picture and can lose it again ('Bild entfernen'); deleting it for good removes the picture", async () => {
  await withArea({ seed: seedThree, pictureFromFile: fakePicture }, async (area) => {
    const { holdOpen, act, concept, caregiverRegion, status, backend, seeded } = area;
    await holdOpen();
    await createOwn(area, "Ball", "Ich möchte Ball spielen.");
    const [id] = ownEntries(backend, seeded)[0];
    await act(() => buttonNamed(concept("Ball").row, "Bild wählen").click());
    assert.ok(pictureViewOf(caregiverRegion).texts.includes("Jetzt auf der Taste: kein Bild, nur das Wort."));
    await chooseFile(area, "ball.png");
    await act(() => pictureViewOf(caregiverRegion).save.click());
    assert.equal(concept("Ball").picture, PICTURE_PNG);
    await act(() => buttonNamed(concept("Ball").row, "Bild wählen").click());
    assert.equal(pictureViewOf(caregiverRegion).reset.textContent, "Bild entfernen");
    await act(() => pictureViewOf(caregiverRegion).cancel.click());
    await area.remove("Ball");
    assert.equal(concept("Ball").picture, null);
    await act(() => buttonNamed(concept("Ball").row, "Endgültig löschen").click());
    await area.confirmDelete();
    assert.equal(status(), "„Ball“ wurde endgültig gelöscht.");
    assert.ok(!Object.keys(backend.snapshot()).some((key) => key.includes(id)));
  });
});

test("pictures: a file that is not a picture, too large or unreadable is refused in German and nothing is stored", async () => {
  await withArea({ seed: seedThree, pictureFromFile: fakePicture }, async (area) => {
    const { holdOpen, act, concept, caregiverRegion, status, backend, focused } = area;
    await holdOpen();
    await act(() => buttonNamed(concept("Hilfe").row, "Bild wählen").click());
    const before = JSON.stringify(backend.snapshot());
    for (const [reason, line] of [
      ["type", "Diese Datei ist kein Bild, das die App lesen kann. Bitte ein PNG-, JPEG-, WebP-, GIF- oder SVG-Bild wählen."],
      ["size", "Die Datei ist zu groß. Bitte ein Bild mit höchstens 10 MB wählen."],
      ["unreadable", "Das Bild konnte nicht gelesen werden. Bitte ein anderes Bild wählen."],
      ["too-large", "Das Bild ist auch verkleinert noch zu groß. Bitte ein einfacheres Bild wählen."],
    ]) {
      await chooseFile(area, `refuse-${reason}`);
      assert.equal(status(), line);
      assert.ok(hasClass(statusElement(caregiverRegion), "caregiver-status-error"));
      assert.equal(pictureViewOf(caregiverRegion).save, null);
      assert.equal(focused.current, pictureViewOf(caregiverRegion).file);
    }
    assert.equal(JSON.stringify(backend.snapshot()), before);
  });
  // A converter that hands back something that is not a picture is refused as well.
  await withArea({ seed: seedThree, pictureFromFile: async () => "data:image/svg+xml,<svg/>" }, async (area) => {
    await area.holdOpen();
    await area.act(() => buttonNamed(area.concept("Hilfe").row, "Bild wählen").click());
    await chooseFile(area, "x.svg");
    assert.equal(area.status(), "Das Bild konnte nicht gelesen werden. Bitte ein anderes Bild wählen.");
    assert.equal(pictureViewOf(area.caregiverRegion).save, null);
  });
});

test("pictures: a picture that a newer app wrote offers no 'Bild wählen' and says that the app needs an update; a full profile refuses and keeps the view", async () => {
  const seed = async (store) => {
    const mia = await seedThree(store);
    await store.data(mia.id).set("symbol.pause", { version: 2, dataUrl: PICTURE_PNG, licence: "x" });
    return mia;
  };
  await withArea({ seed, pictureFromFile: fakePicture }, async (area) => {
    const { holdOpen, act, concept, caregiverRegion, status, backend, seeded } = area;
    await holdOpen();
    assert.equal(concept("Pause").buttons.includes("Bild wählen"), false);
    assert.equal(concept("Pause").row.children.filter((child) => child.tagName === "p").map((child) => child.textContent).includes("Das Bild dieser Taste wurde mit einer neueren Version gespeichert. Bitte die App aktualisieren."), true);
    assert.equal(concept("Pause").picture, "./icons/pause.svg");
    await act(() => buttonNamed(concept("Hilfe").row, "Bild wählen").click());
    await chooseFile(area, "hilfe.png");
    // The next write fails as a full profile would.
    const store = await area.store();
    const realData = store.data.bind(store);
    store.data = (id) => {
      const data = realData(id);
      return { ...data, set: async () => { throw new (await import("../dist/profiles/store.js")).ProfileSizeError("full"); } };
    };
    try {
      await act(() => pictureViewOf(caregiverRegion).save.click());
    } finally {
      store.data = realData;
    }
    assert.equal(status(), "Der Platz für dieses Profil ist voll. Das Bild wurde nicht gespeichert. Entferne Begriffe, Bilder oder Gebärden, dann ist wieder Platz.");
    assert.notEqual(pictureViewOf(caregiverRegion), null);
    assert.notEqual(pictureViewOf(caregiverRegion).save, null);
    assert.equal(backend.snapshot()[`profile/${seeded.id}/data/symbol.hilfe`], undefined);
  });
});

test("pictures: when a second file is chosen while the first is still being read, the later choice wins; leaving or closing meanwhile stores and shows nothing", async () => {
  const pending = new Map();
  const slowPicture = (file) => new Promise((resolve) => pending.set(file.name, () => resolve(file.name === "second.png" ? PICTURE_PNG : PICTURE_PNG.replace("iVBOR", "iVBOx"))));
  const settle = async (area) => {
    await area.handle.settled();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await area.handle.settled();
  };
  await withArea({ seed: seedThree, pictureFromFile: slowPicture }, async (area) => {
    const { holdOpen, act, concept, caregiverRegion, backend } = area;
    await holdOpen();
    await act(() => buttonNamed(concept("Hilfe").row, "Bild wählen").click());
    const pick = (name) => {
      const view = pictureViewOf(caregiverRegion);
      view.file.files = [{ name, type: "image/png", size: 10 }];
      view.file.dispatch("change");
    };
    pick("first.png");
    await area.handle.settled();
    assert.ok(pictureViewOf(caregiverRegion).texts.includes("Das Bild wird gelesen …"));
    pick("second.png");
    await area.handle.settled();
    pending.get("second.png")();
    await settle(area);
    pending.get("first.png")();
    await settle(area);
    assert.deepEqual(pictureViewOf(caregiverRegion).images.slice(-1), [PICTURE_PNG]);
    // Leaving while a file is read: its picture is dropped, nothing is stored.
    const before = JSON.stringify(backend.snapshot());
    await act(() => pictureViewOf(caregiverRegion).cancel.click());
    await act(() => buttonNamed(concept("Hilfe").row, "Bild wählen").click());
    await act(() => pictureViewOf(caregiverRegion).cancel.click());
    await act(() => buttonNamed(concept("Trinken").row, "Bild wählen").click());
    pick("third.png");
    await area.handle.settled();
    await act(() => pictureViewOf(caregiverRegion).cancel.click());
    pending.get("third.png")();
    await settle(area);
    assert.equal(pictureViewOf(caregiverRegion), null);
    assert.equal(JSON.stringify(backend.snapshot()), before);
    // And closing the area while one is read.
    await act(() => buttonNamed(concept("Pause").row, "Bild wählen").click());
    pick("fourth.png");
    await area.handle.settled();
    await area.handle.close();
    pending.get("fourth.png")();
    await settle(area);
    assert.equal(JSON.stringify(backend.snapshot()), before);
  });
});

test("pictures: an own concept under a catalogue id has no picture of the app to go back to", async () => {
  const seed = async (store) => {
    const mia = await store.create("Mia", ["hilfe"]);
    await store.setActive(mia.id);
    await store.data(mia.id).set("concept.hilfe", { version: 1, labelDe: "Hilf mir", speechDe: "Hilf mir bitte.", custom: true });
    await store.data(mia.id).set("symbol.hilfe", { version: 1, dataUrl: PICTURE_PNG });
    return mia;
  };
  await withArea({ seed, pictureFromFile: fakePicture }, async (area) => {
    await area.holdOpen();
    await area.act(() => buttonNamed(area.concept("Hilf mir").row, "Bild wählen").click());
    const view = pictureViewOf(area.caregiverRegion);
    assert.equal(view.reset.textContent, "Bild entfernen");
    await area.act(() => view.reset.click());
    assert.equal(area.status(), "„Hilf mir“ hat jetzt kein Bild.");
    assert.equal(area.concept("Hilf mir").picture, null);
  });
});

test("pictures: the previews are image elements, and a value that is no stored picture or bundled icon never becomes a preview's source", async () => {
  const catalogue = CONCEPTS.map((concept) => (concept.id === "pause" ? { ...concept, symbolPath: "javascript:alert(1)" } : concept));
  await withArea({ seed: seedThree, catalogue, pictureFromFile: fakePicture }, async (area) => {
    const { holdOpen, act, concept, caregiverRegion } = area;
    await holdOpen();
    await act(() => buttonNamed(concept("Trinken").row, "Bild wählen").click());
    let images = tree(pictureViewOf(caregiverRegion).view).filter((element) => element.tagName === "img");
    assert.deepEqual(images.map((image) => [image.src, image.width, image.height, image.alt, image.className]), [["./icons/trinken.svg", 96, 96, "", "caregiver-picture-preview"]]);
    await act(() => pictureViewOf(caregiverRegion).cancel.click());
    await act(() => buttonNamed(concept("Pause").row, "Bild wählen").click());
    const view = pictureViewOf(caregiverRegion);
    assert.deepEqual(view.images, []);
    assert.ok(view.texts.includes("Jetzt auf der Taste: kein Bild, nur das Wort."));
    await chooseFile(area, "pause.png");
    images = tree(pictureViewOf(caregiverRegion).view).filter((element) => element.tagName === "img");
    assert.deepEqual(images.map((image) => image.src), [PICTURE_PNG]);
  });
});

// --- How a recording fits, and replaying an example (card NG-4); the tracker data is synthetic ---

const fitOf = (region) => byClass(teachViewOf(region).view, "caregiver-teach-fit") ?? null;

test("teach: after a usable recording one line says how it fits the earlier examples; keeping stays possible", async () => {
  const camera = fakeCamera();
  await withArea({ seed: seedTeach, capture: camera.bridge }, async (area) => {
    const { caregiverRegion, act } = area;
    await teachWithCamera(area, camera, "Trinken");
    // The first example of a tile: nothing to compare with, no line.
    await record(area, camera, 20, rightHand);
    assert.equal(fitOf(caregiverRegion), null);
    await act(() => area.button("Behalten").click());
    // The same movement again fits.
    await record(area, camera, 20, rightHand);
    assert.equal(fitOf(caregiverRegion).textContent, "Die Aufnahme passt zu den bisherigen Beispielen für „Trinken“.");
    assert.ok(!hasClass(fitOf(caregiverRegion), "caregiver-warning"));
    await act(() => area.button("Behalten").click());
    // Both hands, where the earlier examples used one: said, as a warning, and "Behalten" is still there.
    await record(area, camera, 20, bothHands);
    const line = fitOf(caregiverRegion);
    assert.equal(line.textContent, "Die bisherigen Beispiele für „Trinken“ wurden mit einer Hand (rechts) gemacht, diese Aufnahme mit beiden Händen. Sie werden getrennt erkannt; am besten die Gebärde immer gleich machen.");
    assert.ok(hasClass(line, "caregiver-warning"));
    assert.deepEqual(teachViewOf(caregiverRegion).buttons.slice(0, 3), ["Behalten", "Verwerfen", "Zurück"]);
    await act(() => area.button("Verwerfen").click());
    assert.equal(fitOf(caregiverRegion), null);
  });
});

test("teach: a recording of another tile's gesture is said to resemble it, by that tile's label", async () => {
  const camera = fakeCamera();
  await withArea({ seed: seedTeach, capture: camera.bridge }, async (area) => {
    const { caregiverRegion, act } = area;
    await teachWithCamera(area, camera, "Hilfe");
    await record(area, camera, 20, rightHand);
    await act(() => area.button("Behalten").click());
    await act(() => area.button("Zurück").click());
    await act(() => area.concept("Trinken").teach.click());
    await act(() => area.button("Kamera starten").click());
    await untilTaught(area.handle, () => area.button("Aufnahme starten") !== undefined);
    await record(area, camera, 20, rightHand);
    assert.equal(fitOf(caregiverRegion).textContent, "Achtung: Die Aufnahme ähnelt der Gebärde für „Hilfe“. Wird sie behalten, können die beiden verwechselt werden.");
  });
});

test("teach: 'Abspielen' draws a stored example as a moving hand on a canvas, once, and 'Anhalten' or leaving stops it", async () => {
  const camera = fakeCamera();
  await withArea({ seed: seedTeach, capture: camera.bridge }, async (area) => {
    const { caregiverRegion, act, clock } = area;
    await teachWithCamera(area, camera, "Trinken");
    await record(area, camera, 20, rightHand);
    // Not while a recording waits for "Behalten".
    assert.equal(area.button("Abspielen"), undefined);
    await act(() => area.button("Behalten").click());
    const play = area.button("Abspielen");
    assert.equal(play["aria-label"], "Beispiel 1 abspielen");
    await act(() => play.click());
    const canvas = byClass(caregiverRegion, "caregiver-replay");
    assert.equal(canvas.tagName, "canvas");
    assert.equal(canvas.role, "img");
    assert.ok(textsIn(caregiverRegion).includes("So vergleicht die App die Gebärde: nur Bewegung und Handform, aus den gespeicherten Werten gezeichnet. Ein Video gibt es nicht."));
    // The fake canvas has no 2D context at first: nothing breaks. With one, the next steps are drawn.
    const calls = [];
    canvas.width = 240;
    canvas.height = 180;
    canvas.getContext = () => new Proxy({}, { get: (target, name) => (name in target ? target[name] : (...args) => calls.push(name)), set: (target, name, value) => { target[name] = value; return true; } });
    clock.advance(250);
    assert.ok(calls.includes("stroke") && calls.includes("arc") && calls.includes("clearRect"), calls.join(","));
    assert.equal(area.button("Anhalten")["aria-label"], "Beispiel 1 anhalten");
    await act(() => area.button("Anhalten").click());
    assert.equal(byClass(caregiverRegion, "caregiver-replay"), undefined);
    const drawn = calls.length;
    clock.advance(10_000);
    assert.equal(calls.length, drawn);
    // Played through: the last step stays on the canvas and the button offers to play again.
    await act(() => area.button("Abspielen").click());
    clock.advance(10_000);
    assert.notEqual(byClass(caregiverRegion, "caregiver-replay"), undefined);
    assert.equal(area.button("Anhalten"), undefined);
    assert.equal(area.button("Abspielen")["aria-label"], "Beispiel 1 abspielen");
    // One tap plays it again (Codex review of PR 1245: the tap used to stop it).
    await act(() => area.button("Abspielen").click());
    assert.notEqual(byClass(caregiverRegion, "caregiver-replay"), undefined);
    assert.equal(area.button("Anhalten")["aria-label"], "Beispiel 1 anhalten");
    await act(() => area.button("Anhalten").click());
    // Leaving the view stops a running replay too.
    await act(() => area.button("Abspielen").click());
    await act(() => area.button("Zurück").click());
    clock.advance(10_000);
    assert.equal(byClass(caregiverRegion, "caregiver-replay"), undefined);
  });
});

// --- Deleting a profile needs its name typed (owner decision on card NG-13, card NG-8673320459971200034) ---

test("delete: 'Endgültig löschen' does nothing until the profile's name is typed; a wrong name is said in German; the right one (spaces aside) lets the hold delete", async () => {
  await withArea({ seed: seedMiaAndBen, typeDeleteName: false }, async ({ holdOpen, act, profile, confirmation, caregiverRegion, focused, store, status, clock, handle }) => {
    await holdOpen();
    await act(() => profile("Ben").remove.click());
    const field = tree(caregiverRegion).find((element) => element.id === "caregiver-delete-name");
    assert.equal(focused.current, field);
    assert.deepEqual([field.autocomplete, field.spellcheck, field.autocapitalize, field.autocorrect], ["off", false, "off", "off"]);
    assert.equal(tree(caregiverRegion).find((element) => element.tagName === "label" && element.htmlFor === field.id).textContent, "Zum Bestätigen den Namen „Ben“ eingeben");
    const names = async () => (await (await store()).list()).profiles.map((stored) => stored.displayName).sort();
    const hold = async () => {
      const { confirm } = confirmation();
      confirm.dispatch("pointerdown", { button: 0 });
      clock.advance(DELETE_HOLD_MS);
      confirm.dispatch("pointerup");
      await handle.settled();
    };
    const type = (text) => {
      field.value = text;
      field.dispatch("input");
    };
    const refusal = "Der Name stimmt noch nicht. Bitte genau „Ben“ eingeben. Es wurde nichts gelöscht.";
    // Nothing typed: the button says it cannot act, and a full hold deletes nothing.
    assert.equal(confirmation().confirm["aria-disabled"], "true");
    await hold();
    assert.deepEqual(await names(), ["Ben", "Mia"]);
    assert.equal(confirmation().hint.textContent, refusal);
    // Another case or another name is not the name.
    for (const wrong of ["ben", "Be", "Mia", "Ben!"]) {
      type(wrong);
      assert.equal(confirmation().confirm["aria-disabled"], "true");
      await hold();
      assert.deepEqual(await names(), ["Ben", "Mia"]);
    }
    // The name, with spaces around it: the hold deletes.
    type("  Ben ");
    assert.equal(confirmation().confirm["aria-disabled"], "false");
    await hold();
    assert.deepEqual(await names(), ["Mia"]);
    assert.equal(status(), "Das Profil „Ben“ wurde gelöscht.");
  });
});

test("delete: Escape in the name field leaves the confirmation without deleting, back on 'Löschen'", async () => {
  await withArea({ seed: seedMiaAndBen, typeDeleteName: false }, async ({ holdOpen, act, profile, confirmation, caregiverRegion, store, handle, focused }) => {
    await holdOpen();
    await act(() => profile("Ben").remove.click());
    const field = () => tree(caregiverRegion).find((element) => element.id === "caregiver-delete-name");
    field().value = "Be";
    field().dispatch("input");
    caregiverRegion.dispatch("keydown", { key: "Escape", target: field() });
    await handle.settled();
    assert.equal(confirmation(), null);
    assert.deepEqual((await (await store()).list()).profiles.map((stored) => stored.displayName).sort(), ["Ben", "Mia"]);
    assert.equal(focused.current, buttonNamed(caregiverRegion, "Löschen"));
  });
});

// --- Picture view polish (card NG-8673317704447615766); the picture data is synthetic ---

test("pictures: choosing another file drops the earlier picture at once: no 'Speichern' while it is read, and none next to its refusal", async () => {
  const pending = new Map();
  const slow = (file) => new Promise((resolve, reject) => pending.set(file.name, { ok: () => resolve(PICTURE_PNG), refuse: () => reject(new PictureRefusal("pixels")) }));
  await withArea({ seed: seedThree, pictureFromFile: slow }, async (area) => {
    const { holdOpen, act, concept, caregiverRegion, status, backend } = area;
    await holdOpen();
    await act(() => buttonNamed(concept("Hilfe").row, "Bild wählen").click());
    const pick = async (name) => {
      const view = pictureViewOf(caregiverRegion);
      view.file.files = [{ name, type: "image/png", size: 10 }];
      view.file.dispatch("change");
      await area.handle.settled();
    };
    const settle = async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await area.handle.settled();
    };
    await pick("first.png");
    pending.get("first.png").ok();
    await settle();
    assert.notEqual(pictureViewOf(caregiverRegion).save, null);
    // A second file: while it is read there is nothing to save, and the earlier preview is gone.
    await pick("second.png");
    assert.equal(pictureViewOf(caregiverRegion).save, null);
    assert.deepEqual(pictureViewOf(caregiverRegion).images, ["./icons/hilfe.svg"]);
    assert.ok(pictureViewOf(caregiverRegion).texts.includes("Das Bild wird gelesen …"));
    // Refused (too many pixels): the refusal, and still nothing to save.
    pending.get("second.png").refuse();
    await settle();
    assert.equal(status(), "Das Bild ist zu groß (mehr als 40 Megapixel). Bitte ein kleineres Bild wählen, zum Beispiel einen Ausschnitt.");
    assert.equal(pictureViewOf(caregiverRegion).save, null);
    assert.deepEqual(pictureViewOf(caregiverRegion).images, ["./icons/hilfe.svg"]);
    assert.equal(Object.keys(backend.snapshot()).some((key) => key.includes("symbol.")), false);
  });
});

test("pictures: a caregiver row shows only a stored picture or a bundled icon", async () => {
  const catalogue = CONCEPTS.map((concept) => (concept.id === "pause" ? { ...concept, symbolPath: "javascript:alert(1)" } : concept));
  await withArea({ seed: seedThree, catalogue }, async ({ holdOpen, concept }) => {
    await holdOpen();
    assert.equal(concept("Pause").picture, null);
    assert.equal(concept("Hilfe").picture, "./icons/hilfe.svg");
  });
});

// --- Typed-name delete polish (card NG-8673319027843774136) ---

/** Mia and a profile whose name has an inner space and an emoji with its presentation mark. */
const seedNames = async (store) => {
  const mia = await createMia(store);
  const anna = await store.create("Anna Lena ❤️", []);
  return { mia, anna };
};

test("delete name: the line follows what is typed, a name changed during a hold is refused with the reason, and Enter and Space are refused too", async () => {
  await withArea({ seed: seedMiaAndBen, typeDeleteName: false }, async ({ holdOpen, act, profile, confirmation, caregiverRegion, store, clock, handle }) => {
    await holdOpen();
    await act(() => profile("Ben").remove.click());
    const field = tree(caregiverRegion).find((element) => element.id === "caregiver-delete-name");
    const type = (text) => { field.value = text; field.dispatch("input"); };
    const names = async () => (await (await store()).list()).profiles.map((stored) => stored.displayName).sort();
    const refusal = "Der Name stimmt noch nicht. Bitte genau „Ben“ eingeben. Es wurde nichts gelöscht.";
    // Enter and Space on the button are refused like a pointer.
    for (const key of ["Enter", " "]) {
      const { confirm } = confirmation();
      confirm.dispatch("keydown", { key, repeat: false });
      clock.advance(DELETE_HOLD_MS);
      confirm.dispatch("keyup", { key });
      await handle.settled();
      assert.deepEqual(await names(), ["Ben", "Mia"], `key ${JSON.stringify(key)}`);
      assert.equal(confirmation().hint.textContent, refusal);
    }
    // Typing the name puts the hint back at once.
    type("Ben");
    assert.equal(confirmation().hint.textContent, DELETE_HOLD_HINT);
    // Changed during a running hold: the release deletes nothing and says why.
    const { confirm } = confirmation();
    confirm.dispatch("pointerdown", { button: 0 });
    clock.advance(DELETE_HOLD_MS);
    type("Be");
    confirm.dispatch("pointerup");
    await handle.settled();
    assert.deepEqual(await names(), ["Ben", "Mia"]);
    assert.equal(confirmation().hint.textContent, refusal);
  });
});

test("delete name: inner spaces, a no-break space and the emoji mark U+FE0F do not matter; capitals and other characters do, with a hint", async () => {
  await withArea({ seed: seedNames, typeDeleteName: false }, async ({ holdOpen, act, profile, confirmation, caregiverRegion }) => {
    await holdOpen();
    await act(() => profile("Anna Lena ❤️").remove.click());
    const field = tree(caregiverRegion).find((element) => element.id === "caregiver-delete-name");
    const type = (text) => { field.value = text; field.dispatch("input"); };
    const armed = () => confirmation().confirm["aria-disabled"] === "false";
    for (const same of ["Anna Lena ❤️", "Anna  Lena ❤", "Anna Lena❤️".replace("Lena", "Lena "), " Anna Lena  ❤ "]) {
      type(same);
      assert.equal(armed(), true, JSON.stringify(same));
    }
    const refusalWith = (hint) => `Der Name stimmt noch nicht. Bitte genau „Anna Lena ❤️“ eingeben.${hint} Es wurde nichts gelöscht.`;
    const pressed = () => {
      const { confirm } = confirmation();
      confirm.dispatch("pointerdown", { button: 0 });
      confirm.dispatch("pointerup");
      return confirmation().hint.textContent;
    };
    for (const [wrong, hint] of [["AnnaLena ❤", " Achte auf die Leerzeichen."], ["anna lena ❤", " Achte auf große und kleine Buchstaben."], ["Anna Lena", ""], ["Anna Lena ♥", ""]]) {
      type(wrong);
      assert.equal(armed(), false, JSON.stringify(wrong));
      assert.equal(pressed(), refusalWith(hint), JSON.stringify(wrong));
    }
  });
});

test("delete name: the field describes itself with the title and what is lost; a long name wraps", async () => {
  await withArea({ seed: seedMiaAndBen, typeDeleteName: false }, async ({ holdOpen, act, profile, caregiverRegion }) => {
    await holdOpen();
    await act(() => profile("Mia").remove.click());
    const field = tree(caregiverRegion).find((element) => element.id === "caregiver-delete-name");
    const described = field["aria-describedby"].split(" ").map((id) => tree(caregiverRegion).find((element) => element.id === id).textContent);
    assert.deepEqual(described, ["Profil „Mia“ löschen?", DELETE_LOSS, DELETE_ACTIVE]);
  });
  const css = await readFile(new URL("../dist/styles.css", import.meta.url), "utf8");
  assert.match(css, /^\.caregiver-delete-name-label \{[^}]*overflow-wrap: anywhere;/m);
});

// --- Vormachen: a caregiver's own clip of a gesture (card NG-56); every clip here is a few made-up bytes ---

const CLIP = "data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYEC";
const OTHER_CLIP = "data:video/webm;codecs=vp9;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYEDAA==";
/**
 * A camera for demo clips: `log` counts what was asked of it. `error`: opening fails with it.
 * The recorder hands back a fake blob; `clips` are the data URLs the converter returns, in turn,
 * and a DemoRecordingRefusal reason in their place is thrown instead.
 */
function fakeDemo({ error = null, clips = [CLIP], holdStop = false, reports = undefined } = {}) {
  const log = { facings: [], opened: 0, started: 0, stopped: 0, closed: 0, converted: 0, endTrack: () => undefined, releaseStop: () => undefined };
  const queue = [...clips];
  return {
    log,
    openDemoCamera: async (facing) => {
      log.facings.push(facing);
      if (error !== null) throw error;
      log.opened += 1;
      const ended = [];
      log.endTrack = () => { for (const handler of ended) handler(); };
      const track = {
        addEventListener(name, handler) { if (name === "ended") ended.push(handler); },
        // What the camera reports about where it faces; undefined like a desktop webcam.
        getSettings: () => (reports === undefined ? {} : { facingMode: reports }),
      };
      return {
        stream: { id: "demo-stream", getTracks: () => [track] },
        start() { log.started += 1; },
        async stop() {
          log.stopped += 1;
          if (holdStop) await new Promise((resolve) => { log.releaseStop = resolve; });
          return { size: 64, type: "video/webm" };
        },
        close() { log.closed += 1; },
      };
    },
    clipFromBlob: async () => {
      log.converted += 1;
      const next = queue.length > 1 ? queue.shift() : queue[0];
      if (!next.startsWith("data:")) throw new DemoRecordingRefusal(next);
      return next;
    },
  };
}
const demoViewOf = (region) => {
  const view = byClass(region, "caregiver-demo");
  if (view === undefined) return null;
  const videos = tree(view).filter((element) => element.tagName === "video");
  return {
    view, texts: textsIn(view), videos,
    clips: videos.filter((video) => video.src !== undefined && video.src !== "").map((video) => video.src),
    live: videos.find((video) => hasClass(video, "caregiver-demo-live")) ?? null,
    camera: buttonNamed(view, "Kamera starten") ?? null, record: buttonNamed(view, "Aufnahme starten") ?? null,
    stop: buttonNamed(view, "Aufnahme beenden") ?? null, cancelCountdown: buttonNamed(view, "Abbrechen") ?? null,
    save: buttonNamed(view, "Speichern") ?? null, back: buttonNamed(view, "Zurück") ?? null, discard: buttonNamed(view, "Verwerfen") ?? null,
    remove: buttonNamed(view, "Clip löschen") ?? null,
    line: byClass(view, "caregiver-teach-camera")?.textContent ?? null,
  };
};
/** Waits for the area and for promises of the fake camera and converter. */
const settleDemo = async (area) => {
  for (let i = 0; i < 3; i += 1) {
    await area.handle.settled();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await area.handle.settled();
};
/** Opens the camera, counts down and records until the time is up; the new clip is then shown. */
const recordDemo = async (area) => {
  await area.act(() => demoViewOf(area.caregiverRegion).camera.click());
  await settleDemo(area);
  await area.act(() => demoViewOf(area.caregiverRegion).record.click());
  area.clock.advance(TEACH_COUNTDOWN_S * 1000);
  await settleDemo(area);
  area.clock.advance(DEMO_MAX_MS);
  await settleDemo(area);
};
const DEMO_TEXTS = [
  "Nimm dich selbst auf, wie du die Gebärde machst. Das Kind sieht den Clip in der Gebärden-Ansicht unter „Vormachen“ und kann ihn nachmachen. Die Aufnahme dauert höchstens 5 Sekunden.",
  "Bitte nur Erwachsene aufnehmen, nie das Kind.",
  "Der Clip wird ohne Ton nur in diesem Browser auf diesem Gerät gespeichert, in diesem Profil, und mit dem Profil gelöscht. Die App sendet ihn nicht.",
];

test("vormachen: every tile on the board offers 'Vormachen'; it opens a view that says what is kept and that only adults are recorded, and starts no camera", async () => {
  const demo = fakeDemo();
  await withArea({ seed: seedThree, ...demo }, async (area) => {
    const { holdOpen, act, concept, caregiverRegion, focused } = area;
    await holdOpen();
    const control = buttonNamed(concept("Trinken").row, "Vormachen");
    assert.equal(control["aria-label"], "Vormachen: Trinken");
    await act(() => control.click());
    const view = demoViewOf(caregiverRegion);
    assert.deepEqual(view.texts, [
      "Vormachen für „Trinken“ – Tafel von „Mia“", ...DEMO_TEXTS, "Für diesen Begriff gibt es noch keinen Clip.", "Kamera starten", "Zurück",
    ]);
    assert.deepEqual(byClass(caregiverRegion, "caregiver-body").children, [view.view]);
    assert.equal(focused.current, view.camera);
    assert.equal(view.remove, null);
    assert.equal(demo.log.facings.length, 0);
    await act(() => view.back.click());
    assert.equal(demoViewOf(caregiverRegion), null);
    assert.equal(focused.current, buttonNamed(concept("Trinken").row, "Vormachen"));
  });
});

test("vormachen: camera, countdown and a recording that ends by itself after DEMO_MAX_MS; the clip is stored only on 'Speichern', shown next time, and 'Clip löschen' deletes it", async () => {
  const demo = fakeDemo({ clips: [CLIP, OTHER_CLIP] });
  await withArea({ seed: seedThree, ...demo }, async (area) => {
    const { holdOpen, act, concept, caregiverRegion, status, backend, seeded, focused, clock } = area;
    await holdOpen();
    await act(() => buttonNamed(concept("Trinken").row, "Vormachen").click());
    const before = JSON.stringify(backend.snapshot());
    await act(() => demoViewOf(caregiverRegion).camera.click());
    await settleDemo(area);
    let view = demoViewOf(caregiverRegion);
    assert.deepEqual(demo.log.facings, ["user"]);
    assert.equal(view.line, "Die Kamera läuft. Tippe auf „Aufnahme starten“.");
    assert.equal(view.live.srcObject.id, "demo-stream");
    assert.equal(view.live.muted, true);
    assert.equal(view.live.dataset.mirrored, "true");
    assert.equal(focused.current, view.record);
    await act(() => view.record.click());
    assert.equal(demoViewOf(caregiverRegion).line, "Gleich geht’s los: 3");
    clock.advance(1000);
    assert.equal(demoViewOf(caregiverRegion).line, "Gleich geht’s los: 3 … 2");
    assert.equal(demo.log.started, 0);
    clock.advance((TEACH_COUNTDOWN_S - 1) * 1000);
    await settleDemo(area);
    view = demoViewOf(caregiverRegion);
    assert.equal(demo.log.started, 1);
    assert.equal(view.line, "Die Aufnahme läuft. Jetzt die Gebärde vormachen.");
    assert.equal(focused.current, view.stop);
    clock.advance(DEMO_MAX_MS - 1);
    assert.equal(demo.log.stopped, 0);
    clock.advance(1);
    await settleDemo(area);
    view = demoViewOf(caregiverRegion);
    assert.equal(demo.log.stopped, 1);
    assert.equal(demo.log.closed, 1);
    assert.equal(view.live, null);
    assert.ok(view.texts.includes("Neuer Clip:"));
    assert.deepEqual(view.clips, [CLIP]);
    assert.equal(view.videos[0].muted, true);
    assert.equal(focused.current, view.save);
    assert.equal(JSON.stringify(backend.snapshot()), before);
    // "Verwerfen" instead of "Zurück" while a clip waits.
    assert.notEqual(view.discard, null);
    await act(() => view.save.click());
    assert.equal(status(), "Gespeichert: Vormachen für „Trinken“.");
    assert.deepEqual(backend.snapshot()[`profile/${seeded.id}/data/demo.trinken`], { version: 1, dataUrl: CLIP });
    assert.equal(demoViewOf(caregiverRegion), null);
    assert.equal(focused.current, buttonNamed(concept("Trinken").row, "Vormachen"));
    // Opened again: the stored clip, and a new recording replaces it on "Speichern" only.
    await act(() => buttonNamed(concept("Trinken").row, "Vormachen").click());
    view = demoViewOf(caregiverRegion);
    assert.ok(view.texts.includes("Jetzt gespeichert:"));
    assert.deepEqual(view.clips, [CLIP]);
    await recordDemo(area);
    assert.deepEqual(demoViewOf(caregiverRegion).clips, [OTHER_CLIP]);
    await act(() => demoViewOf(caregiverRegion).save.click());
    assert.deepEqual(backend.snapshot()[`profile/${seeded.id}/data/demo.trinken`], { version: 1, dataUrl: OTHER_CLIP });
    await act(() => buttonNamed(concept("Trinken").row, "Vormachen").click());
    await act(() => demoViewOf(caregiverRegion).remove.click());
    assert.equal(status(), "Der Clip für „Trinken“ wurde gelöscht.");
    assert.equal(backend.snapshot()[`profile/${seeded.id}/data/demo.trinken`], undefined);
  });
});

test("vormachen: 'Aufnahme beenden' ends early; 'Abbrechen' in the countdown records nothing; leaving or closing stops the camera and drops the clip", async () => {
  const demo = fakeDemo();
  await withArea({ seed: seedThree, ...demo }, async (area) => {
    const { holdOpen, act, concept, caregiverRegion, backend, clock, handle } = area;
    await holdOpen();
    await act(() => buttonNamed(concept("Hilfe").row, "Vormachen").click());
    await act(() => demoViewOf(caregiverRegion).camera.click());
    await settleDemo(area);
    await act(() => demoViewOf(caregiverRegion).record.click());
    await act(() => demoViewOf(caregiverRegion).cancelCountdown.click());
    clock.advance(10_000);
    assert.equal(demo.log.started, 0);
    assert.notEqual(demoViewOf(caregiverRegion).record, null);
    await act(() => demoViewOf(caregiverRegion).record.click());
    clock.advance(TEACH_COUNTDOWN_S * 1000);
    await settleDemo(area);
    clock.advance(1000);
    await act(() => demoViewOf(caregiverRegion).stop.click());
    await settleDemo(area);
    assert.equal(demo.log.stopped, 1);
    assert.deepEqual(demoViewOf(caregiverRegion).clips, [CLIP]);
    // The time running out later changes nothing.
    clock.advance(DEMO_MAX_MS);
    await settleDemo(area);
    assert.equal(demo.log.stopped, 1);
    const before = JSON.stringify(backend.snapshot());
    await act(() => demoViewOf(caregiverRegion).discard.click());
    assert.equal(JSON.stringify(backend.snapshot()), before);
    // Leaving while the camera runs stops it.
    await act(() => buttonNamed(concept("Hilfe").row, "Vormachen").click());
    await act(() => demoViewOf(caregiverRegion).camera.click());
    await settleDemo(area);
    const closedBefore = demo.log.closed;
    await act(() => demoViewOf(caregiverRegion).back.click());
    assert.equal(demo.log.closed, closedBefore + 1);
    // Closing the area during a recording stops the camera; nothing is stored.
    await act(() => buttonNamed(concept("Hilfe").row, "Vormachen").click());
    await act(() => demoViewOf(caregiverRegion).camera.click());
    await settleDemo(area);
    await act(() => demoViewOf(caregiverRegion).record.click());
    clock.advance(TEACH_COUNTDOWN_S * 1000);
    await settleDemo(area);
    await handle.close();
    assert.equal(demo.log.closed, closedBefore + 2);
    clock.advance(DEMO_MAX_MS);
    await settleDemo(area);
    assert.equal(JSON.stringify(backend.snapshot()), before);
  });
  // A camera that answers only after the view was left is closed at once.
  let answer;
  const late = fakeDemo();
  const slow = { ...late, openDemoCamera: (facing) => new Promise((resolve) => { answer = () => resolve(late.openDemoCamera(facing)); }) };
  await withArea({ seed: seedThree, ...slow }, async (area) => {
    await area.holdOpen();
    await area.act(() => buttonNamed(area.concept("Hilfe").row, "Vormachen").click());
    await area.act(() => demoViewOf(area.caregiverRegion).camera.click());
    assert.equal(demoViewOf(area.caregiverRegion).line, "Die Kamera startet …");
    assert.equal(demoViewOf(area.caregiverRegion).camera, null);
    await area.act(() => demoViewOf(area.caregiverRegion).back.click());
    answer();
    await settleDemo(area);
    assert.equal(late.log.opened, 1);
    assert.equal(late.log.closed, 1);
    assert.equal(demoViewOf(area.caregiverRegion), null);
  });
});

test("vormachen: a camera that cannot open and a recording that cannot become a clip are said in German; nothing is stored", async () => {
  for (const [name, line] of [
    ["NotAllowedError", "Die Kamera ist nicht erlaubt. Du kannst sie in den Einstellungen des Browsers erlauben."],
    ["NotFoundError", "Es wurde keine Kamera gefunden."],
    ["NotReadableError", "Die Kamera kann gerade nicht starten. Vielleicht benutzt eine andere App sie. Bitte die andere App schließen und noch einmal versuchen."],
    ["TypeError", "Dieser Browser kann hier keine Clips aufnehmen. Die Tafel funktioniert auch ohne."],
  ]) {
    const error = new Error("camera");
    error.name = name;
    await withArea({ seed: seedThree, ...fakeDemo({ error }) }, async (area) => {
      await area.holdOpen();
      await area.act(() => buttonNamed(area.concept("Hilfe").row, "Vormachen").click());
      await area.act(() => demoViewOf(area.caregiverRegion).camera.click());
      await settleDemo(area);
      assert.equal(area.status(), line);
      assert.ok(hasClass(statusElement(area.caregiverRegion), "caregiver-status-error"));
      assert.equal(area.focused.current, demoViewOf(area.caregiverRegion).camera);
    });
  }
  const demo = fakeDemo({ clips: ["too-large", "unreadable", "data:video/ogg;base64,AAAA"] });
  await withArea({ seed: seedThree, ...demo }, async (area) => {
    await area.holdOpen();
    await area.act(() => buttonNamed(area.concept("Hilfe").row, "Vormachen").click());
    const before = JSON.stringify(area.backend.snapshot());
    for (const line of [
      "Der Clip ist zu groß geworden. Bitte kürzer aufnehmen.",
      "Die Aufnahme konnte nicht gelesen werden. Bitte noch einmal aufnehmen.",
      // A converter that hands back something that is not a clip.
      "Die Aufnahme konnte nicht gelesen werden. Bitte noch einmal aufnehmen.",
    ]) {
      await recordDemo(area);
      assert.equal(area.status(), line);
      const view = demoViewOf(area.caregiverRegion);
      assert.equal(view.save, null);
      assert.equal(view.live, null);
      assert.equal(area.focused.current, view.camera);
    }
    assert.equal(demo.log.closed, 3);
    assert.equal(JSON.stringify(area.backend.snapshot()), before);
  });
});

test("vormachen: the clip is part of the profile export (for a later backup screen, card NG-58); deleting an own concept for good deletes its clip", async () => {
  const demo = fakeDemo();
  await withArea({ seed: seedThree, ...demo }, async (area) => {
    const { holdOpen, act, concept, caregiverRegion, backend, seeded, status } = area;
    await holdOpen();
    await act(() => buttonNamed(concept("Trinken").row, "Vormachen").click());
    await recordDemo(area);
    await act(() => demoViewOf(caregiverRegion).save.click());
    const store = await area.store();
    const exported = await exportProfile(store, seeded.id);
    assert.deepEqual(exported.data["demo.trinken"], { version: 1, dataUrl: CLIP });
    const elsewhere = await ProfileStore.open(new MemoryBackend());
    const restored = await importProfile(elsewhere, JSON.parse(JSON.stringify(exported)));
    assert.deepEqual(await elsewhere.data(restored.id).get("demo.trinken"), { version: 1, dataUrl: CLIP });
    // An own concept: its clip goes with it.
    await createOwn(area, "Ball", "Ich möchte Ball spielen.");
    const [id] = ownEntries(backend, seeded)[0];
    await act(() => buttonNamed(concept("Ball").row, "Vormachen").click());
    await recordDemo(area);
    await act(() => demoViewOf(caregiverRegion).save.click());
    assert.ok(Object.keys(backend.snapshot()).some((key) => key.endsWith(`demo.${id}`)));
    await area.remove("Ball");
    await act(() => buttonNamed(concept("Ball").row, "Endgültig löschen").click());
    await area.confirmDelete();
    assert.equal(status(), "„Ball“ wurde endgültig gelöscht.");
    assert.ok(!Object.keys(backend.snapshot()).some((key) => key.includes(id)));
  });
});

test("vormachen: while a recording is being read nothing new can be recorded; a camera that goes away is said; a clip of a newer version is not offered a new recording", async () => {
  const demo = fakeDemo({ holdStop: true });
  await withArea({ seed: seedThree, ...demo }, async (area) => {
    const { holdOpen, act, concept, caregiverRegion, clock } = area;
    await holdOpen();
    await act(() => buttonNamed(concept("Hilfe").row, "Vormachen").click());
    await act(() => demoViewOf(caregiverRegion).camera.click());
    await settleDemo(area);
    await act(() => demoViewOf(caregiverRegion).record.click());
    clock.advance(TEACH_COUNTDOWN_S * 1000);
    await settleDemo(area);
    await act(() => demoViewOf(caregiverRegion).stop.click());
    await settleDemo(area);
    let view = demoViewOf(caregiverRegion);
    assert.equal(view.line, "Der Clip wird gelesen …");
    assert.equal(view.record, null, "no new recording while the last one is read");
    assert.equal(view.stop, null);
    assert.equal(view.camera, null);
    // Shorter than the wait for a recorder that never ends (card NG-60).
    clock.advance(DEMO_STOP_WAIT_MS - 1);
    assert.equal(demo.log.started, 1);
    demo.log.releaseStop();
    await settleDemo(area);
    view = demoViewOf(caregiverRegion);
    assert.deepEqual(view.clips, [CLIP]);
    assert.equal(demo.log.closed, 1);
    // A camera that ends by itself while it runs: the camera of the view stops and the line says so.
    await act(() => view.camera.click());
    await settleDemo(area);
    assert.notEqual(demoViewOf(caregiverRegion).record, null);
    demo.log.endTrack();
    await settleDemo(area);
    assert.equal(area.status(), "Die Kamera ist ausgegangen. Bitte noch einmal auf „Kamera starten“ tippen.");
    assert.equal(demo.log.closed, 2);
    assert.equal(demoViewOf(caregiverRegion).live, null);
    assert.equal(area.focused.current, demoViewOf(caregiverRegion).camera);
  });
  // A clip a newer version stored: said, and no recording offered that could not be saved.
  await withArea({ seed: async (store) => {
    const mia = await seedThree(store);
    await store.data(mia.id).set("demo.trinken", { version: 2, dataUrl: CLIP });
    return mia;
  }, ...fakeDemo() }, async (area) => {
    await area.holdOpen();
    await area.act(() => buttonNamed(area.concept("Trinken").row, "Vormachen").click());
    const view = demoViewOf(area.caregiverRegion);
    assert.ok(view.texts.includes("Der Clip dieses Begriffs wurde mit einer neueren Version gespeichert. Bitte die App aktualisieren."));
    assert.equal(view.camera, null);
    assert.notEqual(view.remove, null, "it can still be deleted");
  });
});

test("vormachen (card NG-59): a clip is always recorded with the front camera, whatever the device's camera choice; a clip this browser cannot play says so", async () => {
  const cameraStorage = memoryStorage();
  cameraStorage.setItem(CAPTURE_FACING_KEY, "environment");
  const demo = fakeDemo();
  await withArea({ seed: seedThree, cameraStorage, ...demo }, async (area) => {
    const { holdOpen, act, concept, caregiverRegion } = area;
    await holdOpen();
    await act(() => buttonNamed(concept("Trinken").row, "Vormachen").click());
    await act(() => demoViewOf(caregiverRegion).camera.click());
    await settleDemo(area);
    assert.deepEqual(demo.log.facings, ["user"], "never the back camera, which would point at the child");
    assert.equal(demoViewOf(caregiverRegion).live.dataset.mirrored, "true");
    assert.equal(cameraStorage.getItem(CAPTURE_FACING_KEY), "environment", "the device's choice for teaching stays");
    // A new clip that cannot be played here: the video goes, a line says so; it can still be discarded.
    await act(() => demoViewOf(caregiverRegion).record.click());
    area.clock.advance(TEACH_COUNTDOWN_S * 1000);
    await settleDemo(area);
    area.clock.advance(DEMO_MAX_MS);
    await settleDemo(area);
    // Since card NG-60 such a new clip is dropped, not kept for saving.
    demoViewOf(caregiverRegion).videos[0].dispatch("error");
    await settleDemo(area);
    assert.equal(area.status(), "Dieser Clip kann in diesem Browser nicht abgespielt werden und wurde verworfen. Bitte noch einmal aufnehmen.");
    assert.equal(demoViewOf(caregiverRegion).save, null);
  });
});

test("vormachen (card NG-60): after a failed save the buttons work again; a camera facing away is refused; an unplayable new clip cannot be saved; a recorder that never stops is given up", async () => {
  const demo = fakeDemo();
  await withArea({ seed: seedThree, ...demo }, async (area) => {
    const { holdOpen, act, concept, caregiverRegion, backend, seeded } = area;
    await holdOpen();
    await act(() => buttonNamed(concept("Trinken").row, "Vormachen").click());
    await recordDemo(area);
    backend.failWrite(1);
    await act(() => demoViewOf(caregiverRegion).save.click());
    let view = demoViewOf(caregiverRegion);
    assert.match(area.status(), /Der Clip ist unverändert\./);
    assert.equal(view.save.disabled, false, "'Speichern' can be tried again");
    assert.equal(view.camera.disabled, false);
    await act(() => view.save.click());
    assert.deepEqual(backend.snapshot()[`profile/${seeded.id}/data/demo.trinken`], { version: 1, dataUrl: CLIP });
    // A clip that cannot be deleted: "Clip löschen" works again too.
    await act(() => buttonNamed(concept("Trinken").row, "Vormachen").click());
    backend.failWrite(1);
    await act(() => demoViewOf(caregiverRegion).remove.click());
    view = demoViewOf(caregiverRegion);
    assert.equal(view.remove.disabled, false);
  });
  // A device whose only camera faces away: refused, nothing recorded.
  const away = fakeDemo({ reports: "environment" });
  await withArea({ seed: seedThree, ...away }, async (area) => {
    await area.holdOpen();
    await area.act(() => buttonNamed(area.concept("Hilfe").row, "Vormachen").click());
    await area.act(() => demoViewOf(area.caregiverRegion).camera.click());
    await settleDemo(area);
    assert.equal(area.status(), "Hier läuft nur eine Kamera, die vom Gerät weg zeigt. Vormachen wird mit der vorderen Kamera aufgenommen, damit nie das Kind im Bild ist.");
    assert.equal(away.log.closed, 1);
    assert.equal(demoViewOf(area.caregiverRegion).live, null);
    assert.equal(demoViewOf(area.caregiverRegion).record, null);
  });
  // A camera that says it faces the user is used.
  const front = fakeDemo({ reports: "user" });
  await withArea({ seed: seedThree, ...front }, async (area) => {
    await area.holdOpen();
    await area.act(() => buttonNamed(area.concept("Hilfe").row, "Vormachen").click());
    await area.act(() => demoViewOf(area.caregiverRegion).camera.click());
    await settleDemo(area);
    assert.notEqual(demoViewOf(area.caregiverRegion).record, null);
  });
  // A new clip this browser cannot play is dropped, not offered for saving.
  await withArea({ seed: seedThree, ...fakeDemo() }, async (area) => {
    await area.holdOpen();
    await area.act(() => buttonNamed(area.concept("Hilfe").row, "Vormachen").click());
    await recordDemo(area);
    demoViewOf(area.caregiverRegion).videos[0].dispatch("error");
    await settleDemo(area);
    const view = demoViewOf(area.caregiverRegion);
    assert.equal(area.status(), "Dieser Clip kann in diesem Browser nicht abgespielt werden und wurde verworfen. Bitte noch einmal aufnehmen.");
    assert.equal(view.save, null);
    assert.deepEqual(view.clips, []);
    assert.equal(area.focused.current, view.camera);
  });
  // A stored clip that cannot play: a status line.
  await withArea({ seed: async (store) => {
    const mia = await seedThree(store);
    await store.data(mia.id).set("demo.trinken", { version: 1, dataUrl: CLIP });
    return mia;
  }, ...fakeDemo() }, async (area) => {
    await area.holdOpen();
    await area.act(() => buttonNamed(area.concept("Trinken").row, "Vormachen").click());
    demoViewOf(area.caregiverRegion).videos[0].dispatch("error");
    // Card NG-63: the live region is there empty first, its text comes a moment later, so it is read out.
    const region = tree(demoViewOf(area.caregiverRegion).view).find((element) => element.role === "status" && element.tagName === "p");
    assert.equal(region.textContent, "");
    area.clock.advance(50);
    const line = tree(demoViewOf(area.caregiverRegion).view).find((element) => element.textContent.startsWith("Dieser Clip kann in diesem Browser nicht abgespielt werden. Er kann"));
    assert.equal(line, region);
    assert.equal(line.role, "status");
    assert.notEqual(demoViewOf(area.caregiverRegion).remove, null);
  });
  // A recorder that never hands over its recording: given up after DEMO_STOP_WAIT_MS.
  const stuck = fakeDemo({ holdStop: true });
  await withArea({ seed: seedThree, ...stuck }, async (area) => {
    const { act, caregiverRegion, clock } = area;
    await area.holdOpen();
    await act(() => buttonNamed(area.concept("Hilfe").row, "Vormachen").click());
    await act(() => demoViewOf(caregiverRegion).camera.click());
    await settleDemo(area);
    await act(() => demoViewOf(caregiverRegion).record.click());
    clock.advance(TEACH_COUNTDOWN_S * 1000);
    await settleDemo(area);
    await act(() => demoViewOf(caregiverRegion).stop.click());
    await settleDemo(area);
    assert.equal(demoViewOf(caregiverRegion).line, "Der Clip wird gelesen …");
    clock.advance(DEMO_STOP_WAIT_MS - 1);
    await settleDemo(area);
    assert.equal(demoViewOf(caregiverRegion).line, "Der Clip wird gelesen …");
    clock.advance(1);
    await settleDemo(area);
    const view = demoViewOf(caregiverRegion);
    assert.equal(area.status(), "Die Aufnahme konnte nicht gelesen werden. Bitte noch einmal aufnehmen.");
    assert.equal(stuck.log.closed, 1);
    assert.notEqual(view.camera, null);
    // The recorder answering late changes nothing.
    stuck.log.releaseStop();
    await settleDemo(area);
    assert.equal(demoViewOf(caregiverRegion).save, null);
  });
});

// --- Backup (card NG-58): a profile into a password-protected file and back; all data synthetic ---

const backupViewOf = (region) => {
  const view = byClass(region, "caregiver-backup");
  if (view === undefined) return null;
  const find = (id) => tree(view).find((element) => element.id === id) ?? null;
  return {
    view, texts: textsIn(view), form: byClass(view, "caregiver-backup-form") ?? null,
    password: find("caregiver-backup-password"), repeat: find("caregiver-backup-repeat"),
    file: find("caregiver-restore-file"), restorePassword: find("caregiver-restore-password"),
    save: buttonNamed(view, "Sicherung speichern") ?? null, go: buttonNamed(view, "Einspielen") ?? null, cancel: buttonNamed(view, "Abbrechen") ?? null,
    replace: buttonNamed(view, "Ersetzen") ?? null, copy: buttonNamed(view, "Als Kopie einspielen") ?? null,
  };
};
/** Waits for the area and for Web Crypto, which answers outside the area's queue. */
const settleCrypto = async (area) => {
  for (let i = 0; i < 6; i += 1) {
    await area.handle.settled();
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await area.handle.settled();
};
const BACKUP_PASSWORD = "Sonnenblume 42";

/** Saves a backup of `name` with `password` and returns the file the area handed over. */
async function saveBackupOf(area, saved, name, password = BACKUP_PASSWORD) {
  await area.act(() => buttonNamed(area.profile(name).item, "Sicherung speichern").click());
  const view = backupViewOf(area.caregiverRegion);
  view.password.value = password;
  view.repeat.value = password;
  await area.act(() => view.form.dispatch("submit"));
  await settleCrypto(area);
  return saved.at(-1);
}
/** Opens "Sicherung einspielen", chooses `file`, types `password` and sends the form. */
async function restoreBackupFile(area, file, password = BACKUP_PASSWORD) {
  await area.act(() => area.button("Sicherung einspielen").click());
  const view = backupViewOf(area.caregiverRegion);
  view.file.files = file === null ? [] : [file];
  view.restorePassword.value = password;
  await area.act(() => view.form.dispatch("submit"));
  await settleCrypto(area);
}

test("backup: 'Sicherung speichern' says what the file holds and that it is private; the password is typed twice and checked; the file is handed over, named without the child", async () => {
  const saved = [];
  await withArea({ seed: seedThree, saveFile: (file, name) => saved.push({ file, name }), date: () => new Date("2026-11-25T10:00:00Z") }, async (area) => {
    const { holdOpen, act, caregiverRegion, profile, focused } = area;
    await holdOpen();
    const control = buttonNamed(profile("Mia").item, "Sicherung speichern");
    assert.equal(control["aria-label"], "Sicherung speichern: Mia");
    await act(() => control.click());
    let view = backupViewOf(caregiverRegion);
    assert.deepEqual(view.texts, [
      "Sicherung von „Mia“",
      "Die Sicherung ist eine Datei mit allem, was zu dieser Tafel gehört: Name, Begriffe, eigene Texte und Bilder, beigebrachte Gebärden und die Vormachen-Clips der Bezugspersonen. Mit ihr kann die Tafel auf einem anderen Gerät eingespielt werden.",
      "Die Datei wird mit dem Passwort verschlüsselt. Bitte trotzdem sicher aufbewahren und nicht teilen. Ohne das Passwort kann niemand die Datei öffnen. Ein vergessenes Passwort kann nicht wiederhergestellt werden.",
      "Passwort (mindestens 8 Zeichen)", "Passwort wiederholen", "Sicherung speichern", "Abbrechen",
    ]);
    assert.equal(view.password.type, "password");
    assert.equal(view.password.autocomplete, "new-password");
    assert.equal(focused.current, view.password);
    // Too short, then two different passwords: said, nothing handed over.
    view.password.value = "kurz";
    view.repeat.value = "kurz";
    await act(() => view.form.dispatch("submit"));
    assert.equal(area.status(), "Das Passwort braucht mindestens 8 Zeichen.");
    view = backupViewOf(caregiverRegion);
    view.password.value = BACKUP_PASSWORD;
    view.repeat.value = `${BACKUP_PASSWORD}!`;
    await act(() => view.form.dispatch("submit"));
    assert.equal(area.status(), "Die beiden Passwörter sind nicht gleich.");
    assert.equal(saved.length, 0);
    await act(() => backupViewOf(caregiverRegion).cancel.click());
    const file = await saveBackupOf(area, saved, "Mia");
    assert.equal(file.name, "amys-echo-sicherung-2026-11-25.amysecho");
    assert.equal(area.status(), "Die Sicherung ist gespeichert: amys-echo-sicherung-2026-11-25.amysecho. Bitte die Datei und das Passwort gut aufheben.");
    const text = await file.file.text();
    assert.equal(JSON.parse(text).format, "amys-echo-backup");
    // Only the readable part counts: in the random ciphertext any short text can turn up by chance.
    const readable = JSON.stringify({ ...JSON.parse(text), data: "" });
    for (const secret of ["Mia", "Trinken", "trinken"]) assert.equal(readable.includes(secret), false, `"${secret}" is not readable in the file`);
    assert.equal(backupViewOf(caregiverRegion), null);
    assert.equal(focused.current, buttonNamed(profile("Mia").item, "Sicherung speichern"));
  });
});

test("backup: on a new device 'Sicherung einspielen' restores the board with its clip and makes it the active board; a wrong password, another file and no file are refused", async () => {
  const saved = [];
  let file = null;
  await withArea({ seed: async (store) => {
    const mia = await seedThree(store);
    await store.data(mia.id).set("demo.trinken", { version: 1, dataUrl: CLIP });
    return mia;
  }, saveFile: (blob, name) => saved.push({ file: blob, name }) }, async (area) => {
    await area.holdOpen();
    file = (await saveBackupOf(area, saved, "Mia")).file;
  });
  // A new device: no profile yet.
  await withArea({}, async (area) => {
    const { holdOpen, caregiverRegion, backend, focused } = area;
    await holdOpen();
    assert.notEqual(area.button("Sicherung einspielen"), undefined, "offered without any profile");
    await area.act(() => area.button("Sicherung einspielen").click());
    const view = backupViewOf(caregiverRegion);
    assert.deepEqual(view.texts, [
      "Sicherung einspielen",
      "Wähle eine Sicherungsdatei (.amysecho) und gib ihr Passwort ein. Die Tafel darin kommt auf dieses Gerät, mit allem, was in ihr gespeichert ist.",
      "Sicherungsdatei", "Passwort der Sicherung", "Einspielen", "Abbrechen",
    ]);
    assert.equal(view.file.type, "file");
    assert.equal(focused.current, view.file);
    await area.act(() => view.cancel.click());
    assert.equal(focused.current, area.button("Sicherung einspielen"));
    const before = JSON.stringify(backend.snapshot());
    for (const [input, password, line] of [
      [null, BACKUP_PASSWORD, "Bitte zuerst eine Sicherungsdatei wählen."],
      [file, "", "Bitte das Passwort der Sicherung eingeben."],
      [file, "falsches Passwort", "Das Passwort passt nicht zu dieser Datei, oder die Datei wurde verändert. Es wurde nichts eingespielt."],
      [new Blob(["{\"hello\":1}"]), BACKUP_PASSWORD, "Diese Datei ist keine Sicherung dieser App, oder sie stammt aus einer neueren Version. Es wurde nichts eingespielt."],
    ]) {
      await restoreBackupFile(area, input, password);
      assert.equal(area.status(), line);
      assert.ok(hasClass(statusElement(caregiverRegion), "caregiver-status-error"));
      assert.notEqual(backupViewOf(caregiverRegion), null, "the view stays");
      await area.act(() => backupViewOf(caregiverRegion).cancel.click());
    }
    assert.equal(JSON.stringify(backend.snapshot()), before);
    await restoreBackupFile(area, file);
    assert.equal(area.status(), "Eingespielt: Tafel von „Mia“. Sie ist jetzt die aktive Tafel.");
    assert.equal(backupViewOf(caregiverRegion), null);
    const store = await area.store();
    const active = await store.getActive();
    assert.equal((await store.get(active)).displayName, "Mia");
    assert.deepEqual(await store.data(active).get("demo.trinken"), { version: 1, dataUrl: CLIP });
    assert.deepEqual(area.onBoard(), ["Hilfe", "Trinken", "Pause"]);
  });
});

test("backup: a profile that is already on the device asks first; 'Als Kopie einspielen' keeps both, 'Ersetzen' puts the backup's state back", async () => {
  const saved = [];
  await withArea({ seed: seedThree, saveFile: (blob, name) => saved.push({ file: blob, name }) }, async (area) => {
    const { holdOpen, caregiverRegion, seeded } = area;
    await holdOpen();
    const { file } = await saveBackupOf(area, saved, "Mia");
    await area.remove("Pause");
    assert.deepEqual(area.onBoard(), ["Hilfe", "Trinken"]);
    await restoreBackupFile(area, file);
    let view = backupViewOf(caregiverRegion);
    assert.deepEqual(view.texts, [
      "Sicherung einspielen", "Die Tafel „Mia“ gibt es auf diesem Gerät schon.",
      "„Ersetzen“ überschreibt sie mit dem Stand der Sicherung. „Als Kopie einspielen“ behält beide.",
      "Als Kopie einspielen", "Ersetzen", "Abbrechen",
    ]);
    assert.equal(area.focused.current, view.copy, "never on 'Ersetzen': an Enter must not overwrite the profile");
    await area.act(() => view.copy.click());
    await settleCrypto(area);
    assert.equal(area.status(), "Eingespielt: Tafel von „Mia“.");
    assert.equal(area.profiles().length, 2, "both kept");
    const store = await area.store();
    assert.deepEqual((await store.get(seeded.id)).conceptIds, ["hilfe", "trinken"], "the one on the device is unchanged");
    // "Ersetzen": the backup's state replaces the one on the device.
    await restoreBackupFile(area, file);
    view = backupViewOf(caregiverRegion);
    await area.act(() => view.replace.click());
    await settleCrypto(area);
    assert.deepEqual((await store.get(seeded.id)).conceptIds, ["hilfe", "trinken", "pause"]);
    assert.equal(area.profiles().length, 2);
  });
});

test("backup: a save that fails is said and the view stays; a file over the size limit is refused before it is read; a save closed meanwhile hands nothing over", async () => {
  await withArea({ seed: seedThree, saveFile: () => { throw new Error("no download here"); } }, async (area) => {
    await area.holdOpen();
    await area.act(() => buttonNamed(area.profile("Mia").item, "Sicherung speichern").click());
    const view = backupViewOf(area.caregiverRegion);
    view.password.value = BACKUP_PASSWORD;
    view.repeat.value = BACKUP_PASSWORD;
    await area.act(() => view.form.dispatch("submit"));
    await settleCrypto(area);
    assert.equal(area.status(), "Die Sicherung konnte nicht erstellt werden. Bitte versuche es noch einmal.");
    assert.notEqual(backupViewOf(area.caregiverRegion), null);
    assert.equal(backupViewOf(area.caregiverRegion).save.disabled, false);
  });
  await withArea({ seed: seedThree }, async (area) => {
    await area.holdOpen();
    const before = JSON.stringify(area.backend.snapshot());
    let read = 0;
    const huge = { size: MAX_BACKUP_FILE_BYTES + 1, text: async () => { read += 1; return ""; } };
    await restoreBackupFile(area, huge);
    assert.equal(area.status(), "Diese Sicherung ist zu groß für dieses Gerät. Es wurde nichts eingespielt.");
    assert.equal(read, 0, "not read at all");
    assert.equal(JSON.stringify(area.backend.snapshot()), before);
  });
  const saved = [];
  await withArea({ seed: seedThree, saveFile: (file, name) => saved.push({ file, name }) }, async (area) => {
    await area.holdOpen();
    await area.act(() => buttonNamed(area.profile("Mia").item, "Sicherung speichern").click());
    const view = backupViewOf(area.caregiverRegion);
    view.password.value = BACKUP_PASSWORD;
    view.repeat.value = BACKUP_PASSWORD;
    view.form.dispatch("submit");
    await area.handle.close();
    await settleCrypto(area);
    assert.equal(saved.length, 0, "the area closed while the key was derived");
  });
});

test("backup: a restore left with 'Abbrechen' or by closing while the file is read writes nothing", async () => {
  const saved = [];
  let file = null;
  await withArea({ seed: seedThree, saveFile: (blob, name) => saved.push({ file: blob, name }) }, async (area) => {
    await area.holdOpen();
    file = (await saveBackupOf(area, saved, "Mia")).file;
  });
  for (const leave of ["cancel", "close"]) {
    await withArea({}, async (area) => {
      await area.holdOpen();
      const before = JSON.stringify(area.backend.snapshot());
      await area.act(() => area.button("Sicherung einspielen").click());
      const view = backupViewOf(area.caregiverRegion);
      view.file.files = [file];
      view.restorePassword.value = BACKUP_PASSWORD;
      // Sent, and left at once, while the key is still being derived.
      view.form.dispatch("submit");
      if (leave === "cancel") view.cancel.click();
      else await area.handle.close();
      await settleCrypto(area);
      assert.equal(JSON.stringify(area.backend.snapshot()), before, `${leave}: nothing written`);
      if (leave === "cancel") assert.notEqual(area.status(), "Eingespielt: Tafel von „Mia“. Sie ist jetzt die aktive Tafel.");
    });
  }
});

test("vormachen (card NG-63): a second unplayable recording in a row says this browser cannot play clips; a conversion that never ends is given up too", async () => {
  await withArea({ seed: seedThree, ...fakeDemo() }, async (area) => {
    await area.holdOpen();
    await area.act(() => buttonNamed(area.concept("Hilfe").row, "Vormachen").click());
    await recordDemo(area);
    demoViewOf(area.caregiverRegion).videos[0].dispatch("error");
    await settleDemo(area);
    assert.equal(area.status(), "Dieser Clip kann in diesem Browser nicht abgespielt werden und wurde verworfen. Bitte noch einmal aufnehmen.");
    await recordDemo(area);
    demoViewOf(area.caregiverRegion).videos[0].dispatch("error");
    await settleDemo(area);
    assert.equal(area.status(), "Dieser Browser kann seine eigenen Clips nicht abspielen. Bitte einen anderen Browser auf diesem Gerät versuchen; die Tafel funktioniert auch ohne Clip.");
  });
  // The recorder hands over, but reading the recording into a clip never ends.
  const stuck = { ...fakeDemo(), clipFromBlob: () => new Promise(() => undefined) };
  await withArea({ seed: seedThree, ...stuck }, async (area) => {
    const { act, caregiverRegion, clock } = area;
    await area.holdOpen();
    await act(() => buttonNamed(area.concept("Hilfe").row, "Vormachen").click());
    await recordDemo(area);
    assert.equal(demoViewOf(caregiverRegion).line, "Der Clip wird gelesen …");
    clock.advance(DEMO_STOP_WAIT_MS);
    await settleDemo(area);
    assert.equal(area.status(), "Die Aufnahme konnte nicht gelesen werden. Bitte noch einmal aufnehmen.");
    assert.notEqual(demoViewOf(caregiverRegion).camera, null);
  });
});
