import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createApp } from "../dist/app.js";
import { BOARD_COMFORT_MAX, CLOSE_WAIT_MS, HOLD_DURATION_MS, IDLE_CLOSE_MS, STORE_WAIT_MS, createHold, mountCaregiver } from "../dist/caregiver.js";
import { setBoardConcepts, setWording } from "../dist/board-data.js";
import { CONCEPTS } from "../dist/concepts.js";
import { MemoryBackend } from "../dist/profiles/memory-backend.js";
import { ProfileStore } from "../dist/profiles/store.js";

const chr = (...codePoints) => String.fromCodePoint(...codePoints);
const NOT_EDITABLE = "Dieser Begriff kann in dieser Version nicht bearbeitet werden.";

// --- A minimal document, as in board.test.mjs; no DOM library. All fixtures are synthetic. ---

/** Puts a fake document and speech engine in place; `focused.current` is the element that was focused last. */
function installFakes() {
  const previous = { document: globalThis.document, window: globalThis.window, SpeechSynthesisUtterance: globalThis.SpeechSynthesisUtterance };
  const previousWarn = console.warn;
  const speech = { cancelled: 0, spoken: [] };
  const focused = { current: null };
  const fakeElement = (tagName) => ({
    tagName, textContent: "", className: "", children: [], dataset: {}, handlers: {},
    hidden: false, disabled: false,
    setAttribute(name, value) { this[name] = value; },
    addEventListener(name, handler) { this.handlers[name] = handler; },
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = nodes; },
    focus() { focused.current = this; },
    /** Calls the handler as a browser would; a disabled control gets no events. */
    dispatch(name, event = {}) {
      if (this.disabled) return;
      this.handlers[name]?.({ preventDefault() {}, ...event });
    },
    click() { this.dispatch("click"); },
  });
  globalThis.document = { createElement: fakeElement };
  globalThis.window = {
    speechSynthesis: {
      cancel() { speech.cancelled += 1; },
      getVoices: () => [{ lang: "de-DE", localService: true }],
      speak(utterance) { speech.spoken.push(utterance.text); },
    },
  };
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
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
async function withArea(options, callback) {
  const fakes = installFakes();
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
    const page = { hide: () => undefined };
    const handle = mountCaregiver({
      app: counted, boardRegion, caregiverRegion, entry, catalogue: options.catalogue ?? CONCEPTS,
      setTimer: clock.setTimer, onPageHidden: (hidden) => { page.hide = hidden; },
    });
    const [opener, progress, hint] = entry.children;
    const area = {
      ...fakes, backend, seeded, app, boardRegion, caregiverRegion, entry, clock, handle, opener, progress, hint, page, refreshes, appTimers,
      /** Presses the opening control for the full duration and waits for the area to be drawn. */
      async holdOpen() {
        opener.dispatch("pointerdown", { button: 0 });
        clock.advance(HOLD_DURATION_MS);
        opener.dispatch("pointerup");
        await handle.settled();
      },
      /** Does something to a control and waits until the area has carried it out. */
      async act(action) {
        action();
        await handle.settled();
      },
      status: () => statusOf(caregiverRegion),
      afterClose: () => afterCloseOf(caregiverRegion),
      heading: () => headingOf(caregiverRegion),
      undo: () => buttonNamed(byClass(caregiverRegion, "caregiver-undo") ?? { children: [] }, "Rückgängig") ?? null,
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
            buttons: buttonsIn(row).map((element) => element.textContent),
          };
        })),
      concept(name) { return area.concepts().find((row) => row.name === name); },
      /** The names in "Auf der Tafel", in order. */
      onBoard: () => area.concepts().filter((row) => row.onBoard).map((row) => row.name),
      /** The names in "Weitere Begriffe", in order. */
      more: () => area.concepts().filter((row) => !row.onBoard).map((row) => row.name),
      async add(name) { await area.act(() => area.concept(name).add.click()); },
      async remove(name) { await area.act(() => area.concept(name).remove.click()); },
      nameInput: () => tree(caregiverRegion).find((element) => element.tagName === "input" && element.id === "caregiver-new-name"),
      createForm: () => byClass(caregiverRegion, "caregiver-create"),
      async create(name) {
        area.nameInput().value = name;
        await area.act(() => area.createForm().dispatch("submit"));
      },
      renameInput: () => tree(caregiverRegion).find((element) => element.tagName === "input" && element.id === "caregiver-rename-name") ?? null,
      /** Opens the rename field of a profile, types `to` and sends the form. */
      async rename(name, to) {
        await area.act(() => area.profile(name).rename.click());
        area.renameInput().value = to;
        await area.act(() => byClass(caregiverRegion, "caregiver-rename").dispatch("submit"));
      },
      key(key) {
        let prevented = 0;
        caregiverRegion.dispatch("keydown", { key, preventDefault() { prevented += 1; } });
        return prevented;
      },
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
const VOICE_HELP = "Spricht das Gerät nicht? Dann fehlt eine deutsche Stimme. Sie wird in den Einstellungen des Geräts bei „Sprachausgabe“ oder „Text-in-Sprache“ installiert.";
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
    const handle = mountCaregiver({ app, boardRegion, caregiverRegion, entry, catalogue: CONCEPTS, setTimer: () => () => undefined, onPageHidden: () => undefined });
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
  await withArea({}, async ({ holdOpen, create, status, profiles, store, nameInput, focused, caregiverRegion }) => {
    await holdOpen();
    const label = tree(caregiverRegion).find((element) => element.tagName === "label" && element.textContent === "Name für ein neues Profil");
    assert.equal(label.htmlFor, nameInput().id);
    await create("  Mia  ");
    assert.equal(status(), "Das Profil „Mia“ wurde angelegt. Es ist das erste Profil auf diesem Gerät und deshalb jetzt die aktive Tafel.");
    assert.deepEqual(profiles().map((profile) => [profile.name, profile.active]), [["Mia", true]]);
    const listing = await (await store()).list();
    assert.deepEqual(listing.profiles.map((profile) => [profile.displayName, profile.conceptIds]), [["Mia", []]]);
    assert.equal(await (await store()).getActive(), listing.profiles[0].id);
    // The field is empty again and has the focus.
    assert.equal(nameInput().value, "");
    assert.equal(focused.current, nameInput());
  });
});

test("create: a second profile is stored but not made active, and the area says so", async () => {
  await withArea({ seed: createMia }, async ({ holdOpen, create, status, profiles, store, seeded }) => {
    await holdOpen();
    await create("Ben");
    assert.equal(status(), "Das Profil „Ben“ wurde angelegt. Es ist noch nicht die aktive Tafel.");
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
    assert.deepEqual(boardRows().map((row) => row.buttons), Array(3).fill(["nach oben", "nach unten", "Entfernen"]));
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
  await withArea({ seed }, async ({ holdOpen, act, profiles, add, texts, store, seeded, onBoard, focused }) => {
    await holdOpen();
    assert.equal(profiles()[1].edit["aria-pressed"], "true");
    assert.equal(profiles()[0].edit["aria-label"], "Tafel bearbeiten: Ben");
    await act(() => profiles()[0].edit.click());
    assert.ok(texts().includes("Tafel von „Ben“ bearbeiten"));
    assert.equal(profiles()[0].edit["aria-pressed"], "true");
    assert.equal(profiles()[1].edit["aria-pressed"], "false");
    assert.equal(focused.current, profiles()[0].edit);
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
const LOCKED_IDS = ["mein.ball", "neu", "geist", "alt", "ball"];

test("board editor: a mixed board shows editable rows with buttons and each kind of locked row at its real place, with its explanation and no buttons", async () => {
  await withArea({ seed: seedMixedBoard }, async ({ holdOpen, concepts }) => {
    await holdOpen();
    assert.deepEqual(concepts().map((row) => [row.name, row.onBoard, row.locked, row.note]), [
      ["Hilfe", true, false, null],
      ["Begriff „mein.ball“", true, true, NOT_EDITABLE],
      ["Begriff „neu“", true, true, NOT_EDITABLE],
      ["Trinken", true, false, null],
      ["Begriff „geist“", true, true, NOT_EDITABLE],
      ["Schaukel", true, true, `Dieser Begriff ist nicht mehr in der Auswahl. ${NOT_EDITABLE}`],
      ["Ball", true, true, NOT_EDITABLE],
      ["Pause", true, false, null],
      ["Mehr", false, false, null],
      ["Fertig", false, false, null],
    ]);
    // A locked row cannot be moved or taken off: it has no button at all.
    for (const row of concepts().filter((candidate) => candidate.locked)) assert.deepEqual(row.buttons, []);
    assert.deepEqual(concepts().filter((row) => row.onBoard && !row.locked).map((row) => row.buttons), Array(3).fill(["nach oben", "nach unten", "Entfernen"]));
    assert.equal(concepts().find((row) => row.name === "Schaukel").sentence, "Ich möchte schaukeln.");
    assert.equal(concepts().find((row) => row.name === "Ball").sentence, "Ich möchte mit dem Ball spielen.");
    // "nach oben" / "nach unten" end at the ends of the editable sequence, not of the list.
    const editable = concepts().filter((row) => row.onBoard && !row.locked);
    assert.deepEqual(editable.map((row) => [row.name, row.up.disabled, row.down.disabled]), [["Hilfe", true, false], ["Trinken", false, false], ["Pause", false, true]]);
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

    // Move: the two editable concepts trade places; every other id keeps its index.
    await act(() => concept("Pause").up.click());
    assert.deepEqual(await ids(), ["hilfe", "mein.ball", "neu", "pause", "geist", "alt", "ball", "trinken"]);
    await act(() => concept("Hilfe").down.click());
    assert.deepEqual(await ids(), ["pause", "mein.ball", "neu", "hilfe", "geist", "alt", "ball", "trinken"]);
    assert.deepEqual(lockedAt(await ids()), lockedBefore);
    // Add: at the end; nothing else moves.
    await add("Mehr");
    assert.deepEqual(await ids(), ["pause", "mein.ball", "neu", "hilfe", "geist", "alt", "ball", "trinken", "mehr"]);
    assert.deepEqual(lockedAt(await ids()), lockedBefore);
    // Remove: only that id leaves; the rest keeps its order, locked ids included.
    await remove("Hilfe");
    assert.deepEqual(await ids(), ["pause", "mein.ball", "neu", "geist", "alt", "ball", "trinken", "mehr"]);
    await remove("Pause");
    await remove("Trinken");
    await remove("Mehr");
    assert.deepEqual(await ids(), LOCKED_IDS);
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

    // Move: "Trinken" and "Pause" swap; every other row is where it was.
    await act(() => concept("Trinken").down.click());
    const afterMove = names();
    assert.deepEqual(afterMove.map((name, index) => (name === start[index] ? null : name)).filter((name) => name !== null), ["Pause", "Trinken"]);
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
    // Editable order: Hilfe, Trinken, Pause (locked rows between them).
    await remove("Hilfe");
    assert.equal(focused.current, concept("Trinken").remove);
    await remove("Pause");
    assert.equal(focused.current, concept("Trinken").remove);
    await remove("Trinken");
    const heading = tree(caregiverRegion).find((element) => element.tagName === "h3" && element.textContent === "Weitere Begriffe");
    assert.equal(heading.tabIndex, -1);
    assert.equal(focused.current, heading);
  });
  // From the middle it is the next row, not the previous one.
  await withArea({ seed: seedMixedBoard }, async ({ holdOpen, remove, concept, focused }) => {
    await holdOpen();
    await remove("Trinken");
    assert.equal(focused.current, concept("Pause").remove);
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
  await withArea({ seed }, async ({ holdOpen, add, remove, act, concept, onBoard, more, status, store, seeded, backend, handle, tiles, undo }) => {
    await holdOpen();
    const shown = () => [onBoard(), more()];
    const stored = [["Hilfe", "Pause"], ["Trinken", "Mehr", "Fertig"]];
    const failure = "Das konnte gerade nicht gespeichert werden. Bitte versuche es noch einmal. Die Tafel ist unverändert.";
    const ids = async () => (await (await store()).get(seeded.id)).conceptIds;

    // Adding: the first write (the wording) fails, then the second (the concept ids).
    for (const nth of [1, 2]) {
      backend.failWrite(nth);
      await add("Mehr");
      assert.equal(status(), failure, `write ${nth}`);
      assert.deepEqual(shown(), stored, `write ${nth}`);
      assert.deepEqual(await ids(), ["hilfe", "pause"], `write ${nth}`);
    }
    // Reordering and removing.
    backend.failWrite(1);
    await act(() => concept("Pause").up.click());
    assert.equal(status(), failure);
    assert.deepEqual(shown(), stored);
    backend.failWrite(1);
    await remove("Hilfe");
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
    const handle = mountCaregiver({ app, boardRegion, caregiverRegion, entry, catalogue: CONCEPTS, setTimer: options.setTimer ?? clock.setTimer, onPageHidden: (hidden) => { page.hide = hidden; } });
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
  + "Der Name und die ausgewählten Begriffe werden nur in diesem Browser auf diesem Gerät gespeichert. "
  + "Die App sendet nichts; die Tastatur des Geräts kann Eingaben aber selbst verarbeiten. "
  + "Ein Profil kann hier umbenannt und gelöscht werden; eine Sicherung gibt es noch nicht. "
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
    const handle = mountCaregiver({ app, boardRegion, caregiverRegion, entry, catalogue: CONCEPTS, setTimer: clock.setTimer, onPageHidden: () => undefined });
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
  ["a profile that is not the active one was deleted", async (region, handle) => {
    buttonNamed(region, "Löschen").click();
    await handle.settled();
    buttonNamed(region, "Endgültig löschen").click();
  }],
]) {
  test(`no-board state: after ${what}, a refresh that hangs leaves no board`, async () => {
    await withSlowRefresh(async (area) => {
      await change(area.caregiverRegion, area.handle);
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
  await withArea({ seed: createMia }, async ({ holdOpen, afterClose, add, remove, rename, handle, boardRegion, tiles, undo, act }) => {
    await holdOpen();
    assert.equal(afterClose(), AFTER_EMPTY);
    await add("Hilfe");
    assert.equal(afterClose(), "Nach dem Schließen: Tafel von „Mia“");
    await remove("Hilfe");
    assert.equal(afterClose(), AFTER_EMPTY);
    await act(() => undo().click());
    assert.equal(afterClose(), "Nach dem Schließen: Tafel von „Mia“");
    await rename("Mia", "Mia L");
    assert.equal(afterClose(), "Nach dem Schließen: Tafel von „Mia L“");
    await handle.close();
    assert.equal(boardRegion.dataset.startup, "profile");
    assert.equal(boardRegion.dataset.boardFallback, undefined);
    assert.deepEqual(tiles(), ["Hilfe"]);
  });
  // The other way round: the header says examples, and examples it is.
  await withArea({ seed: createMia }, async ({ holdOpen, afterClose, handle, boardRegion }) => {
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
    assert.deepEqual(buttonsIn(ben.item).map((element) => element.textContent), ["Als aktive Tafel verwenden", "Tafel bearbeiten", "Umbenennen", "Löschen"]);
    assert.deepEqual(buttonsIn(mia.item).map((element) => element.textContent), ["Tafel bearbeiten", "Umbenennen", "Löschen"]);
    assert.deepEqual([ben.active, mia.active], [false, true]);
    assert.deepEqual(buttonsIn(ben.item).map((element) => element["aria-label"]), ["Als aktive Tafel verwenden: Ben", "Tafel bearbeiten: Ben", "Umbenennen: Ben", "Löschen: Ben"]);
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

const DELETE_LOSS = "Alle ausgewählten Begriffe dieses Profils gehen verloren. Eine Sicherung gibt es noch nicht.";
const DELETE_ACTIVE = "Das Kind sieht danach Beispiele, bis eine andere Tafel aktiv ist.";

test("delete: 'Löschen' deletes nothing; the card becomes a confirmation with the name, what is lost and two buttons, and focus is on 'Abbrechen'", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, act, profile, profiles, backend, focused, button, caregiverRegion }) => {
    await holdOpen();
    const before = JSON.stringify(backend.snapshot());
    await act(() => profile("Ben").remove.click());
    assert.equal(JSON.stringify(backend.snapshot()), before);
    const [card, mia] = profiles();
    assert.equal(card.confirming, true);
    // Not the active profile: no sentence about what the child sees.
    assert.deepEqual(card.texts, ["Profil „Ben“ löschen?", DELETE_LOSS, "Endgültig löschen", "Abbrechen"]);
    assert.equal(focused.current, button("Abbrechen"));
    assert.ok(hasClass(button("Endgültig löschen"), "caregiver-danger"));
    assert.ok(!hasClass(button("Endgültig löschen"), "caregiver-primary"));
    // It is part of the page, not a dialog element, and the other card is as it was.
    assert.deepEqual(tree(caregiverRegion).filter((element) => element.tagName === "dialog"), []);
    assert.equal(mia.name, "Mia");
    assert.equal(mia.confirming, false);
  });
});

test("delete: the confirmation for the active profile also says what the child sees afterwards", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, act, profile, profiles }) => {
    await holdOpen();
    await act(() => profile("Mia").remove.click());
    assert.deepEqual(profiles()[1].texts, ["Profil „Mia“ löschen?", DELETE_LOSS, DELETE_ACTIVE, "Endgültig löschen", "Abbrechen"]);
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
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, act, profile, profiles, backend, button, status, store, seeded, afterClose, focused, caregiverRegion, handle, tiles }) => {
    await holdOpen();
    await (await store()).data(seeded.ben.id).set("concept.pause", { version: 1, labelDe: "Pause", speechDe: "Kurz ausruhen.", });
    await act(() => profile("Ben").remove.click());
    await act(() => button("Endgültig löschen").click());
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
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, act, profile, profiles, button, status, store, seeded, afterClose, texts, handle, boardRegion, tiles }) => {
    assert.deepEqual(tiles(), ["Hilfe"]);
    await holdOpen();
    await act(() => profile("Mia").remove.click());
    await act(() => button("Endgültig löschen").click());
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
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, act, profile, profiles, button, status, backend, focused, texts }) => {
    await holdOpen();
    await act(() => profile("Ben").remove.click());
    const before = JSON.stringify(backend.snapshot());
    backend.failWrite(1);
    await act(() => button("Endgültig löschen").click());
    assert.equal(status(), WRITE_FAILED);
    assert.equal(JSON.stringify(backend.snapshot()), before);
    assert.deepEqual(profiles().map((card) => [card.name, card.confirming]), [["Ben", false], ["Mia", false]]);
    assert.ok(!texts().some((text) => /wurde gelöscht/.test(text)));
    assert.equal(focused.current, profile("Ben").remove);
  });
});

test("delete: a profile that was removed meanwhile is answered in German", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, act, profile, profiles, button, status, store, seeded }) => {
    await holdOpen();
    await act(() => profile("Ben").remove.click());
    await (await store()).remove(seeded.ben.id);
    await act(() => button("Endgültig löschen").click());
    assert.equal(status(), PROFILE_GONE);
    assert.deepEqual(profiles().map((card) => card.name), ["Mia"]);
  });
});

test("delete: deleting the profile that is being edited leaves the editor on the active profile, not on a deleted one", async () => {
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, act, profile, button, texts }) => {
    await holdOpen();
    await act(() => profile("Ben").edit.click());
    assert.ok(texts().includes("Tafel von „Ben“ bearbeiten"));
    await act(() => profile("Ben").remove.click());
    await act(() => button("Endgültig löschen").click());
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
    const { holdOpen, act, profile, profiles, renameInput, button } = area;
    await holdOpen();
    const open = () => [renameInput() !== null, profiles().filter((card) => card.confirming).length];
    await act(() => profile("Ben").rename.click());
    assert.deepEqual(open(), [true, 0]);
    await act(() => profile("Mia").remove.click());
    assert.deepEqual(open(), [false, 1]);
    assert.equal(profile("Ben").name, "Ben");
    await act(() => profile("Ben").remove.click());
    assert.deepEqual(open(), [false, 1]);
    assert.equal(profiles()[0].confirming, true);
    assert.equal(profile("Mia").confirming, false);
    await act(() => profile("Mia").rename.click());
    assert.deepEqual(open(), [true, 0]);
    assert.equal(button("Endgültig löschen"), undefined);
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
  test(`profiles: ${what} cancels an open delete confirmation and an open rename field, and deletes or renames nothing`, async () => {
    for (const opener of ["remove", "rename"]) {
      await withArea({ seed: seedMiaAndBen }, async (area) => {
        const { holdOpen, act, profile, profiles, renameInput, store } = area;
        await holdOpen();
        await act(() => profile("Mia")[opener].click());
        assert.equal(profiles().some((card) => card.confirming) || renameInput() !== null, true, opener);
        await act(() => other(area));
        assert.equal(profiles().some((card) => card.confirming), false, opener);
        assert.equal(renameInput(), null, opener);
        assert.ok((await (await store()).list()).profiles.some((stored) => stored.displayName === "Mia"), opener);
      });
    }
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
  await withArea({ seed: seedMixedBoard }, async ({ holdOpen, remove, act, undo, store, seeded }) => {
    await holdOpen();
    await remove("Trinken");
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, MIXED_IDS.filter((id) => id !== "trinken"));
    await act(() => undo().click());
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, MIXED_IDS);
  });
  // The last id of the board goes back to the end.
  await withArea({ seed: seedWorded }, async ({ holdOpen, remove, act, undo, store, seeded }) => {
    await holdOpen();
    await remove("Fertig");
    await act(() => undo().click());
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, ["hilfe", "pause", "fertig"]);
  });
  // The board changed behind the area's back: the follower is gone, so the end it is; a concept added meanwhile stays.
  await withArea({ seed: seedWorded }, async ({ holdOpen, remove, act, undo, store, seeded }) => {
    await holdOpen();
    await remove("Hilfe");
    await (await store()).setConceptIds(seeded.id, ["fertig", "mehr"]);
    await act(() => undo().click());
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, ["fertig", "mehr", "hilfe"]);
  });
  // The follower moved: still before it.
  await withArea({ seed: seedWorded }, async ({ holdOpen, remove, act, undo, store, seeded }) => {
    await holdOpen();
    await remove("Hilfe");
    await (await store()).setConceptIds(seeded.id, ["fertig", "pause"]);
    await act(() => undo().click());
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, ["fertig", "hilfe", "pause"]);
  });
});

test("undo: it is offered for the last removal only", async () => {
  await withArea({ seed: seedWorded }, async ({ holdOpen, remove, act, undo, store, seeded, caregiverRegion }) => {
    await holdOpen();
    await remove("Hilfe");
    await remove("Fertig");
    assert.equal(buttonsIn(byClass(caregiverRegion, "caregiver-undo")).length, 1);
    assert.equal(undo()["aria-label"], "Rückgängig: Fertig wieder auf die Tafel setzen");
    await act(() => undo().click());
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, ["pause", "fertig"]);
    assert.equal(undo(), null);
  });
});

for (const [what, next] of [
  ["adding a concept", async (area) => { await area.add("Mehr"); }],
  ["moving a concept", async (area) => { await area.act(() => area.concept("Fertig").up.click()); }],
  ["switching to another profile", async (area) => { await area.act(() => area.profile("Ben").edit.click()); }],
  ["creating a profile", async (area) => { await area.create("Cleo"); }],
  ["closing and opening again", async (area) => { await area.handle.close(); await area.holdOpen(); }],
]) {
  test(`undo: the offer goes away with ${what}`, async () => {
    const seed = async (store) => {
      const mia = await seedWorded(store);
      await store.create("Ben", []);
      return mia;
    };
    await withArea({ seed }, async (area) => {
      await area.holdOpen();
      await area.remove("Hilfe");
      assert.notEqual(area.undo(), null);
      await next(area);
      assert.equal(area.undo(), null);
      assert.equal(byClass(area.caregiverRegion, "caregiver-undo").hidden, true);
      assert.ok(!(await (await area.store()).get(area.seeded.id)).conceptIds.includes("hilfe"));
    });
  });
}

test("undo: an action that fails leaves the offer, and an undo whose write fails can be tried again", async () => {
  await withArea({ seed: seedWorded }, async ({ holdOpen, remove, add, act, undo, status, backend, store, seeded }) => {
    await holdOpen();
    await remove("Hilfe");
    backend.failWrite(1);
    await add("Mehr");
    assert.match(status(), /^Das konnte gerade nicht gespeichert werden/);
    assert.notEqual(undo(), null);
    backend.failWrite(1);
    await act(() => undo().click());
    assert.match(status(), /^Das konnte gerade nicht gespeichert werden/);
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, ["pause", "fertig"]);
    await act(() => undo().click());
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
  await withArea({ seed: seedWorded }, async ({ holdOpen, remove, act, undo, store, seeded, backend, onBoard }) => {
    await holdOpen();
    await remove("Hilfe");
    await (await store()).setConceptIds(seeded.id, ["pause", "hilfe", "fertig"]);
    const before = JSON.stringify(backend.snapshot());
    await act(() => undo().click());
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
  await withArea({ seed: seedMiaAndBen }, async ({ holdOpen, rename, remove, add, act, undo, profile, button, handle, boardRegion, entry, caregiverRegion, seeded }) => {
    const secrets = ["Mia", "Ben", "Musterkind", seeded.mia.id, seeded.ben.id];
    const leaks = () => [...stringsIn(boardRegion), ...stringsIn(entry)].filter((text) => secrets.some((secret) => text.includes(secret)));
    await holdOpen();
    await rename("Mia", "Mia Musterkind");
    assert.deepEqual(leaks(), []);
    await add("Pause");
    await remove("Hilfe");
    await act(() => undo().click());
    assert.deepEqual(leaks(), []);
    await act(() => profile("Ben").remove.click());
    assert.deepEqual(leaks(), []);
    await act(() => button("Endgültig löschen").click());
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
  await withArea({ backend }, async ({ holdOpen, concept, handle, undo, store, tiles }) => {
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
    // The move after the removal was a successful action, so the removal can no longer be taken back.
    assert.equal(undo(), null);
    // A removal and its undo, pressed as soon as it is there, with an add in between that waits behind the undo.
    concept("Mehr").remove.click();
    await handle.settled();
    undo().click();
    concept("Hilfe").add.click();
    await handle.settled();
    assert.deepEqual((await (await store()).get(mia.id)).conceptIds, ["fertig", "mehr", "pause", "hilfe"]);
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
  assert.match(rule(".caregiver-create, .caregiver-rename"), /gap: \.6rem;/);
  // Cards and rows are blocks; long names and sentences wrap instead of widening the page.
  for (const selector of [".caregiver-profile-name", ".caregiver-concept-name", ".caregiver-concept-sentence", ".caregiver-after-close", ".caregiver-status"]) {
    assert.match(rule(selector), /overflow-wrap: anywhere;/, selector);
  }
  // Destructive buttons do not share the look of the primary one.
  const background = (selector) => /background: (#[0-9a-f]{6}|white)/.exec(rule(selector))?.[1];
  assert.notEqual(background(".caregiver-danger"), undefined);
  assert.notEqual(background(".caregiver-danger"), background(".caregiver-primary"));
  assert.match(rule(".caregiver-danger-quiet"), /border-color: #a3261a;/);
});
