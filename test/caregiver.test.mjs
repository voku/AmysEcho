import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../dist/app.js";
import { CLOSE_WAIT_MS, HOLD_DURATION_MS, IDLE_CLOSE_MS, STORE_WAIT_MS, createHold, mountCaregiver } from "../dist/caregiver.js";
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
      status: () => caregiverRegion.children[1]?.textContent ?? null,
      texts: () => textsIn(caregiverRegion),
      button: (text) => buttonNamed(caregiverRegion, text),
      profiles: () => tree(caregiverRegion).filter((element) => element.className === "caregiver-profile").map((item) => ({
        name: item.children[0].textContent,
        active: item.children.some((child) => child.className === "caregiver-active" && child.textContent === "Aktive Tafel"),
        activate: buttonNamed(item, "Als aktive Tafel verwenden") ?? null,
        edit: buttonNamed(item, "Begriffe auswählen"),
      })),
      /** The rows of the concept list, top to bottom. */
      concepts: () => tree(caregiverRegion).filter((element) => element.tagName === "li" && element.className.split(" ")[0] === "caregiver-concept").map((row) => {
        const [checkbox, label] = row.children;
        const spans = label.children.filter((child) => child.tagName === "span");
        return {
          name: spans[0].textContent, sentence: spans[1]?.textContent ?? null,
          picture: label.children.find((child) => child.tagName === "img")?.src ?? null,
          checkbox, labelFor: label.htmlFor, checked: checkbox.checked, locked: checkbox.disabled,
          note: row.children.find((child) => child.tagName === "p")?.textContent ?? null,
          up: buttonNamed(row, "nach oben") ?? null, down: buttonNamed(row, "nach unten") ?? null,
        };
      }),
      concept(name) { return area.concepts().find((row) => row.name === name); },
      async toggle(name) {
        const row = area.concept(name);
        row.checkbox.checked = !row.checkbox.checked;
        await area.act(() => row.checkbox.dispatch("change"));
      },
      nameInput: () => tree(caregiverRegion).find((element) => element.tagName === "input" && element.type === "text"),
      async create(name) {
        area.nameInput().value = name;
        const form = tree(caregiverRegion).find((element) => element.tagName === "form");
        await area.act(() => form.dispatch("submit"));
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
    const [heading, status] = caregiverRegion.children;
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
    button("Schließen").click();
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

test("area: without storage it says so in one sentence and offers only reloading the board and closing", async () => {
  await withArea({ openBackend: async () => { throw new Error("no storage"); } }, async ({ holdOpen, texts, caregiverRegion, boardRegion, refreshes, button, status }) => {
    assert.equal(boardRegion.dataset.startup, "demo-unavailable");
    await holdOpen();
    assert.deepEqual(texts(), [
      "Für Bezugspersonen",
      "Der Speicher dieses Geräts ist gerade nicht erreichbar. Deshalb kann hier im Moment nichts geändert werden.",
      "Tafel neu laden", "Schließen",
    ]);
    // Nothing that could write: no field, no checkbox, no form, and only these two buttons.
    const tags = tree(caregiverRegion).map((element) => element.tagName);
    assert.deepEqual(tags.filter((tag) => ["input", "form", "select", "textarea"].includes(tag)), []);
    assert.deepEqual(buttonsIn(caregiverRegion).map((element) => element.textContent), ["Tafel neu laden", "Schließen"]);
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
    const status = () => caregiverRegion.children[1].textContent;
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
    assert.ok(!buttonsIn(caregiverRegion).some((element) => /lösch|entfern|reparier/i.test(element.textContent)));
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

test("concepts: the list shows the catalogue with label, sentence, picture and a labelled checkbox; the active profile is the one edited", async () => {
  await withArea({ seed: createMia }, async ({ holdOpen, concepts, texts }) => {
    await holdOpen();
    assert.ok(texts().includes("Begriffe für „Mia“"));
    const rows = concepts();
    assert.deepEqual(rows.map((row) => [row.name, row.sentence, row.picture, row.checked, row.locked]),
      CONCEPTS.map((concept) => [concept.labelDe, concept.speechDe, concept.symbolPath, false, false]));
    for (const row of rows) {
      assert.equal(row.checkbox.type, "checkbox");
      assert.equal(row.labelFor, row.checkbox.id);
      // Unchosen concepts have no place on the board, so nothing to move.
      assert.equal(row.up, null);
    }
    assert.equal(new Set(rows.map((row) => row.checkbox.id)).size, rows.length);
  });
});

test("concepts: choosing and ordering is saved at once and is on the child's board after closing, in order, without a reload", async () => {
  await withArea({ seed: createMia }, async ({ holdOpen, toggle, act, concept, concepts, status, store, seeded, handle, tiles, boardRegion, focused }) => {
    assert.equal(boardRegion.dataset.boardFallback, "empty-profile");
    await holdOpen();
    await toggle("Pause");
    assert.equal(status(), "Gespeichert: „Pause“ ist jetzt auf der Tafel.");
    assert.equal(focused.current, concept("Pause").checkbox);
    await toggle("Hilfe");
    await toggle("Fertig");
    const ids = async () => (await (await store()).get(seeded.id)).conceptIds;
    assert.deepEqual(await ids(), ["pause", "hilfe", "fertig"]);
    // Chosen concepts first, in board order; the others below, in catalogue order.
    assert.deepEqual(concepts().map((row) => [row.name, row.checked]), [["Pause", true], ["Hilfe", true], ["Fertig", true], ["Trinken", false], ["Mehr", false]]);
    // The ends of the order cannot move further.
    assert.deepEqual(concepts().slice(0, 3).map((row) => [row.up.disabled, row.down.disabled]), [[true, false], [false, false], [false, true]]);
    assert.equal(concept("Fertig").up["aria-label"], "Fertig nach oben");

    await act(() => concept("Fertig").up.click());
    assert.equal(status(), "Die Reihenfolge wurde gespeichert.");
    assert.deepEqual(await ids(), ["pause", "fertig", "hilfe"]);
    assert.equal(focused.current, concept("Fertig").up);
    await act(() => concept("Fertig").up.click());
    assert.deepEqual(await ids(), ["fertig", "pause", "hilfe"]);
    // At the top "nach oben" is disabled, so focus goes to the other button of the same row.
    assert.equal(focused.current, concept("Fertig").down);
    await act(() => concept("Pause").down.click());
    assert.deepEqual(await ids(), ["fertig", "hilfe", "pause"]);
    await toggle("Hilfe");
    assert.equal(status(), "Gespeichert: „Hilfe“ ist nicht mehr auf der Tafel.");
    assert.deepEqual(await ids(), ["fertig", "pause"]);
    assert.deepEqual(concepts().map((row) => [row.name, row.checked]), [["Fertig", true], ["Pause", true], ["Hilfe", false], ["Trinken", false], ["Mehr", false]]);

    await handle.close();
    assert.equal(boardRegion.dataset.startup, "profile");
    assert.equal(boardRegion.dataset.boardFallback, undefined);
    assert.deepEqual(tiles(), ["Fertig", "Pause"]);
  });
});

test("concepts: the wording is stored through setBoardConcepts, so the board keeps its sentence when the catalogue changes", async () => {
  await withArea({ seed: createMia }, async ({ holdOpen, toggle, backend, seeded }) => {
    await holdOpen();
    await toggle("Hilfe");
    assert.deepEqual(backend.snapshot()[`profile/${seeded.id}/data/concept.hilfe`], { version: 1, labelDe: "Hilfe", speechDe: "Ich brauche Hilfe.", copied: true });
  });
});

test("concepts: 'Begriffe auswählen' switches to another profile, and its changes do not touch the first", async () => {
  const seed = async (store) => {
    const mia = await createMia(store);
    await store.setConceptIds(mia.id, ["hilfe"]);
    const ben = await store.create("Ben", []);
    return { mia, ben };
  };
  await withArea({ seed }, async ({ holdOpen, act, profiles, toggle, texts, store, seeded, concepts }) => {
    await holdOpen();
    assert.equal(profiles()[1].edit["aria-pressed"], "true");
    await act(() => profiles()[0].edit.click());
    assert.ok(texts().includes("Begriffe für „Ben“"));
    assert.equal(profiles()[0].edit["aria-pressed"], "true");
    assert.ok(concepts().every((row) => !row.checked));
    await toggle("Mehr");
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

test("concepts: ids this version cannot edit are shown as disabled rows with one German line, retired ones with their stored label", async () => {
  await withArea({ seed: seedMixedBoard }, async ({ holdOpen, concepts }) => {
    await holdOpen();
    assert.deepEqual(concepts().map((row) => [row.name, row.checked, row.locked, row.note]), [
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
    const locked = concepts().filter((row) => row.locked);
    // A disabled row cannot be unchecked or moved: it has no handler and no buttons.
    for (const row of locked) {
      assert.equal(row.checkbox.handlers.change, undefined);
      assert.equal(row.up, null);
      assert.equal(row.down, null);
    }
    assert.equal(concepts().find((row) => row.name === "Schaukel").sentence, "Ich möchte schaukeln.");
  });
});

test("concepts: ids this version cannot edit survive reorder, add and remove of other concepts, in place and with their entries byte-identical", async () => {
  await withArea({ seed: seedMixedBoard }, async ({ holdOpen, toggle, act, concept, store, seeded, backend, handle, tiles }) => {
    const entries = () => JSON.stringify(["neu", "alt", "ball"].map((id) => backend.snapshot()[`profile/${seeded.id}/data/concept.${id}`]));
    const before = entries();
    const ids = async () => (await (await store()).get(seeded.id)).conceptIds;
    await holdOpen();

    // Reorder: the editable concepts trade places among themselves; every other id keeps its index.
    await act(() => concept("Pause").up.click());
    assert.deepEqual(await ids(), ["hilfe", "mein.ball", "neu", "pause", "geist", "alt", "ball", "trinken"]);
    await act(() => concept("Hilfe").down.click());
    assert.deepEqual(await ids(), ["pause", "mein.ball", "neu", "hilfe", "geist", "alt", "ball", "trinken"]);
    // Add: at the end.
    await toggle("Mehr");
    assert.deepEqual(await ids(), ["pause", "mein.ball", "neu", "hilfe", "geist", "alt", "ball", "trinken", "mehr"]);
    // Remove: the rest keeps its order.
    await toggle("Hilfe");
    assert.deepEqual(await ids(), ["pause", "mein.ball", "neu", "geist", "alt", "ball", "trinken", "mehr"]);
    await toggle("Pause");
    await toggle("Trinken");
    await toggle("Mehr");
    assert.deepEqual(await ids(), ["mein.ball", "neu", "geist", "alt", "ball"]);
    assert.equal(entries(), before);

    // The board shows what it can of them, as before.
    await handle.close();
    assert.deepEqual(tiles(), ["Schaukel", "Ball"]);
  });
});

test("concepts: a custom concept under a catalogue id is a disabled row, and the catalogue concept is not offered a second time", async () => {
  const seed = async (store) => {
    const mia = await store.create("Mia", ["hilfe", "pause"]);
    await store.setActive(mia.id);
    await store.data(mia.id).set("concept.hilfe", { version: 1, labelDe: "Hilf mir", speechDe: "Hilf mir bitte.", custom: true });
    return mia;
  };
  await withArea({ seed }, async ({ holdOpen, concepts, concept, act, store, seeded }) => {
    await holdOpen();
    assert.deepEqual(concepts().map((row) => [row.name, row.locked]), [["Hilf mir", true], ["Pause", false], ["Trinken", false], ["Mehr", false], ["Fertig", false]]);
    // The only editable concept has nowhere to move.
    assert.equal(concept("Pause").up.disabled, true);
    assert.equal(concept("Pause").down.disabled, true);
    await act(() => concept("Pause").up.click());
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, ["hilfe", "pause"]);
  });
});

test("concepts: a failed write shows the German error, claims no success, and the list still shows the stored state", async () => {
  const seed = async (store) => {
    const mia = await createMia(store);
    await store.setConceptIds(mia.id, ["hilfe", "pause"]);
    return mia;
  };
  await withArea({ seed }, async ({ holdOpen, toggle, act, concept, concepts, status, store, seeded, backend, handle, tiles }) => {
    await holdOpen();
    const shown = () => concepts().map((row) => [row.name, row.checked]);
    const stored = [["Hilfe", true], ["Pause", true], ["Trinken", false], ["Mehr", false], ["Fertig", false]];
    const failure = "Das konnte gerade nicht gespeichert werden. Bitte versuche es noch einmal. Die Tafel ist unverändert.";
    const ids = async () => (await (await store()).get(seeded.id)).conceptIds;

    // Adding: the first write (the wording) fails, then the second (the concept ids).
    for (const nth of [1, 2]) {
      backend.failWrite(nth);
      await toggle("Mehr");
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
    await toggle("Hilfe");
    assert.equal(status(), failure);
    assert.deepEqual(shown(), stored);
    assert.deepEqual(await ids(), ["hilfe", "pause"]);

    // Trying again works, and the board has it.
    await toggle("Mehr");
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
  await withArea({ backend, app }, async ({ holdOpen, toggle, status, concepts }) => {
    await holdOpen();
    await toggle("Hilfe");
    assert.equal(status(), "Der Platz für dieses Profil ist voll. Die Änderung wurde nicht gespeichert.");
    assert.ok(concepts().every((row) => !row.checked));
    assert.deepEqual((await store.get(mia.id)).conceptIds, []);
  });
});

test("concepts: a profile that was removed meanwhile is answered in German and leaves the list", async () => {
  await withArea({ seed: createMia }, async ({ holdOpen, toggle, status, store, seeded, profiles, texts }) => {
    await holdOpen();
    await (await store()).remove(seeded.id);
    await toggle("Hilfe");
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
  await withArea({ seed, catalogue }, async ({ holdOpen, concepts, toggle, store, seeded }) => {
    await holdOpen();
    assert.deepEqual(concepts().map((row) => [row.name, row.locked]), [["Hilfe", false], ["Pause", true], ["Trinken", false], ["Mehr", false], ["Fertig", false]]);
    assert.match(concepts()[1].note, /^Dieser Begriff ist nicht mehr in der Auswahl\./);
    await toggle("Hilfe");
    assert.deepEqual((await (await store()).get(seeded.id)).conceptIds, ["pause"]);
  });
});

// --- Privacy and reading problems ---

test("privacy: neither the board region nor the opening control ever carries a profile name or id", async () => {
  await withArea({}, async ({ holdOpen, create, toggle, act, profiles, handle, boardRegion, entry, store, caregiverRegion, backend }) => {
    const leaks = async () => {
      const listing = await (await store()).list();
      const secrets = listing.profiles.flatMap((profile) => [profile.displayName, profile.id]);
      return [...stringsIn(boardRegion), ...stringsIn(entry)].filter((text) => secrets.some((secret) => text.includes(secret)));
    };
    await holdOpen();
    await create("Mia Musterkind");
    await create("Ben Beispiel");
    await toggle("Hilfe");
    await toggle("Pause");
    assert.deepEqual(await leaks(), []);
    await act(() => profiles()[0].activate.click());
    backend.failWrite(1);
    await toggle("Mehr");
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
    assert.deepEqual(buttonsIn(caregiverRegion).map((element) => element.textContent), ["Tafel neu laden", "Schließen"]);
    assert.ok(!tree(caregiverRegion).some((element) => element.tagName === "input"));
  });
});

test("area: what was asked for before closing does not draw into the closed area, and the board is refreshed after it", async () => {
  await withArea({ seed: createMia }, async ({ holdOpen, concept, handle, caregiverRegion, tiles, button }) => {
    await holdOpen();
    const row = concept("Hilfe");
    row.checkbox.checked = true;
    row.checkbox.dispatch("change");
    button("Schließen").click();
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
  + "Bitte drücke „Tafel neu laden“, lade die Seite neu oder gib einer Bezugsperson Bescheid.";

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
    assert.equal(caregiverRegion.children[0].textContent, "Für Bezugspersonen");
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

test("auto-close: a hidden page closes the area the way 'Schließen' does, refresh included", async () => {
  await withArea({ seed: createMia }, async ({ holdOpen, toggle, page, handle, refreshes, boardRegion, caregiverRegion, tiles, opener, focused }) => {
    await holdOpen();
    await toggle("Pause");
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

const NAME_NOTICE = "Dies ist eine Testversion. Bitte trage noch keinen echten Namen ein; ein Spitzname genügt. "
  + "Der Name und die ausgewählten Begriffe werden nur in diesem Browser auf diesem Gerät gespeichert. "
  + "Die App selbst sendet nichts; die Tastatur des Geräts kann Eingaben aber selbst verarbeiten. "
  + "Diese Version kann ein einzelnes Profil noch nicht umbenennen oder löschen. "
  + "Wer die Website-Daten im Browser löscht, entfernt alle Profile auf diesem Gerät und die Offline-Kopie der App.";

test("create: next to the name field one paragraph says where the name is stored and that it cannot be renamed or deleted yet", async () => {
  await withArea({}, async ({ holdOpen, caregiverRegion, nameInput }) => {
    await holdOpen();
    const form = tree(caregiverRegion).find((element) => element.tagName === "form");
    const notice = form.children.find((child) => child.tagName === "p");
    assert.equal(notice.textContent, NAME_NOTICE);
    assert.equal(nameInput()["aria-describedby"], notice.id);
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
const ACTIVE_EMPTY = "Auf dieser Tafel ist noch kein Begriff, der gezeigt werden kann. Das Kind sieht Beispiele, bis mindestens ein Begriff angekreuzt ist.";
const NONE_ACTIVE = "Gerade ist keine Tafel aktiv. Das Kind sieht Beispiele, bis eine Tafel als aktive Tafel verwendet wird.";

test("active board: editing a profile that is not the active one is said in a line that stays, also after the next action", async () => {
  const seed = async (store) => {
    const mia = await createMia(store);
    await store.setConceptIds(mia.id, ["hilfe"]);
  };
  await withArea({ seed }, async ({ holdOpen, create, toggle, act, texts, status, profiles }) => {
    await holdOpen();
    assert.ok(!texts().includes(EDITED_NOT_ACTIVE));
    // A newly created profile is the one being edited, not the active one.
    await create("Ben");
    assert.ok(texts().includes("Begriffe für „Ben“"));
    assert.ok(texts().includes(EDITED_NOT_ACTIVE));
    await toggle("Mehr");
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
    assert.ok(texts().includes("Begriffe für „Ben“"));
    await handle.close();
    await holdOpen();
    assert.ok(texts().includes("Begriffe für „Mia“"));
    assert.ok(!texts().includes("Begriffe für „Ben“"));
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

test("active board: an active profile without a concept says that the child sees examples, until one is ticked", async () => {
  await withArea({ seed: createMia }, async ({ holdOpen, texts, toggle }) => {
    await holdOpen();
    assert.ok(texts().includes(ACTIVE_EMPTY));
    await toggle("Hilfe");
    assert.ok(!texts().includes(ACTIVE_EMPTY));
    await toggle("Hilfe");
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

test("concepts: one sentence says that changes are saved at once and that a newly ticked concept goes to the end", async () => {
  await withArea({ seed: createMia }, async ({ holdOpen, texts }) => {
    await holdOpen();
    assert.ok(texts().includes("Angekreuzte Begriffe sind auf der Tafel, in dieser Reihenfolge. Jede Änderung wird sofort gespeichert. "
      + "Ein Begriff, der neu angekreuzt wird, kommt ans Ende der Tafel."));
  });
});

// --- Small behaviours ---

test("create: a name that is typed but not sent yet survives the redraw after a tick, a move and an activation", async () => {
  const seed = async (store) => {
    const mia = await createMia(store);
    await store.setConceptIds(mia.id, ["hilfe", "pause"]);
    await store.create("Ben", []);
  };
  await withArea({ seed }, async ({ holdOpen, toggle, act, concept, profiles, nameInput }) => {
    await holdOpen();
    nameInput().value = "Cle";
    await toggle("Mehr");
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
      status: () => caregiverRegion.children[1].textContent,
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

test("area: a store that does not answer within the bound is shown as unreachable storage, with 'Tafel neu laden' and 'Schließen'", async () => {
  await withSlowRefresh(async ({ caregiverRegion, handle, clock }) => {
    assert.equal(STORE_WAIT_MS, 2500);
    assert.equal(handle.open(), true);
    await turn();
    assert.equal(caregiverRegion.children[1].textContent, "Der Speicher wird gelesen.");
    clock.advance(STORE_WAIT_MS - 1);
    await turn();
    assert.equal(caregiverRegion.children[1].textContent, "Der Speicher wird gelesen.");
    clock.advance(1);
    await handle.settled();
    assert.deepEqual(textsIn(caregiverRegion), [
      "Für Bezugspersonen",
      "Der Speicher dieses Geräts ist gerade nicht erreichbar. Deshalb kann hier im Moment nichts geändert werden.",
      "Tafel neu laden", "Schließen",
    ]);
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
    // Three ticks and a move at once, as fast fingers do: none waits for the one before.
    for (const name of ["Pause", "Hilfe", "Fertig"]) {
      const row = concept(name);
      row.checkbox.checked = true;
      row.checkbox.dispatch("change");
    }
    await handle.settled();
    assert.deepEqual(boards, [["pause"], ["pause", "hilfe"], ["pause", "hilfe", "fertig"]]);
    concept("Fertig").up.click();
    const row = concept("Mehr");
    row.checkbox.checked = true;
    row.checkbox.dispatch("change");
    await handle.settled();
    assert.deepEqual((await (await store()).get(mia.id)).conceptIds, ["pause", "fertig", "hilfe", "mehr"]);
    await handle.close();
    assert.deepEqual(tiles(), ["Pause", "Fertig", "Hilfe", "Mehr"]);
  });
});

test("opening control: a key-down that is only a repeat does not start a hold (Enter still held on 'Schließen' when focus comes back)", async () => {
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
  await withArea({ seed }, async ({ holdOpen, toggle, status, backend, seeded, concept }) => {
    await holdOpen();
    const before = JSON.stringify(backend.snapshot());
    await toggle("Hilfe");
    assert.equal(status(), "Auf eine Tafel passen höchstens 500 Begriffe. Es wurde nichts geändert.");
    assert.equal(JSON.stringify(backend.snapshot()), before, "also no wording was stored for the refused concept");
    assert.equal(concept("Hilfe").checked, false);
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
    // A tick whose write hangs; the area is closed, runs into the bound, and is opened again.
    holdWrites = true;
    const row = concept("Hilfe");
    row.checkbox.checked = true;
    row.checkbox.dispatch("change");
    await turn();
    const closing = handle.close();
    clock.advance(CLOSE_WAIT_MS);
    await closing;
    assert.equal(handle.open(), true);
    // Everything the new status line is ever told.
    const said = [];
    const status = caregiverRegion.children[1];
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
    assert.equal(concept("Hilfe").checked, true);
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
    buttonsIn(area.caregiverRegion).filter((element) => element.textContent === "Begriffe auswählen")[0].click();
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
  ["a concept was ticked", (region) => {
    const checkbox = tree(region).find((element) => element.tagName === "input" && element.type === "checkbox");
    checkbox.checked = true;
    checkbox.dispatch("change");
  }],
  ["a profile was created", (region) => {
    tree(region).find((element) => element.tagName === "input" && element.type === "text").value = "Cleo";
    tree(region).find((element) => element.tagName === "form").dispatch("submit");
  }],
]) {
  test(`no-board state: after ${what}, a refresh that hangs leaves no board`, async () => {
    await withSlowRefresh(async (area) => {
      change(area.caregiverRegion);
      await area.handle.settled();
      assert.match(area.caregiverRegion.children[1].textContent, /^Gespeichert|wurde angelegt/);
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
    assert.equal(area.caregiverRegion.children[1].textContent, "Das konnte gerade nicht gespeichert werden. Bitte versuche es noch einmal.");
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
    assert.equal(caregiverRegion.children[0].textContent, "Für Bezugspersonen");
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
  await withArea({ seed }, async ({ holdOpen, act, profiles, texts, toggle }) => {
    await holdOpen();
    await act(() => profiles()[0].edit.click());
    assert.ok(texts().includes("Begriffe für „Ben“"));
    assert.ok(texts().includes("Diese Tafel ist gerade nicht aktiv. Das Kind sieht Beispiele."));
    assert.ok(!texts().includes(EDITED_NOT_ACTIVE));
    // Once the active profile has a concept, the child sees that board.
    await act(() => profiles()[1].edit.click());
    await toggle("Pause");
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
    // A tick is under way; the form is sent behind it and the caregiver types on.
    const row = concept("Hilfe");
    row.checkbox.checked = true;
    row.checkbox.dispatch("change");
    const field = nameInput();
    field.value = "Ben";
    tree(caregiverRegion).find((element) => element.tagName === "form").dispatch("submit");
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
