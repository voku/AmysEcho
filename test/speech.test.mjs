import assert from "node:assert/strict";
import test from "node:test";
import { hasLocalGermanVoice, onVoicesChanged, requestLocalGermanSpeech } from "../dist/speech.js";

class FakeUtterance {
  constructor(text) { this.text = text; this.lang = ""; this.voice = null; this.onerror = null; this.onend = null; }
}

function withFakeSpeech(voices, speakThrows, callback) {
  const previousWindow = globalThis.window;
  const previousUtterance = globalThis.SpeechSynthesisUtterance;
  const events = { canceled: 0, spoken: [] };
  globalThis.window = {
    speechSynthesis: {
      cancel() { events.canceled++; },
      getVoices() { return voices; },
      speak(utterance) {
        if (speakThrows) throw new Error("speaker disconnected");
        events.spoken.push(utterance);
      },
    },
  };
  globalThis.SpeechSynthesisUtterance = FakeUtterance;
  try { callback(events); }
  finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousUtterance === undefined) delete globalThis.SpeechSynthesisUtterance;
    else globalThis.SpeechSynthesisUtterance = previousUtterance;
  }
}

test("only an explicitly local German voice is eligible", () => {
  const voices = [
    { lang: "en-US", localService: true },
    { lang: "de-DE", localService: false },
    { lang: "de-DE", localService: true },
  ];
  withFakeSpeech(voices, false, (events) => {
    const result = requestLocalGermanSpeech("Ich brauche Hilfe.", () => {});
    assert.equal(result, "requested");
    assert.equal(events.canceled, 1);
    assert.equal(events.spoken.length, 1);
    assert.equal(events.spoken[0].text, "Ich brauche Hilfe.");
    assert.equal(events.spoken[0].voice, voices[2]);
  });
});

test("switching to unsupported speech cancels any previous utterance", () => {
  withFakeSpeech([{ lang: "de-DE", localService: false }], false, (events) => {
    assert.equal(requestLocalGermanSpeech("Pause", () => {}), "unavailable");
    assert.equal(events.canceled, 1);
    assert.equal(events.spoken.length, 0);
  });
});

test("speech engine failures do not raise uncaught errors", () => {
  withFakeSpeech([{ lang: "de-DE", localService: true }], true, (events) => {
    assert.equal(requestLocalGermanSpeech("Mehr", () => {}), "failed");
    assert.equal(events.canceled, 1);
    assert.equal(events.spoken.length, 0);
  });
});

test("asynchronous speech errors are observable", () => {
  withFakeSpeech([{ lang: "de-DE", localService: true }], false, (events) => {
    let errors = 0;
    assert.equal(requestLocalGermanSpeech("Fertig", () => { errors++; }), "requested");
    events.spoken[0].onerror();
    assert.equal(errors, 1);
  });
});

test("the end of an utterance is reported through the third argument, apart from errors, and is optional", () => {
  withFakeSpeech([{ lang: "de-DE", localService: true }], false, (events) => {
    let errors = 0;
    let ends = 0;
    assert.equal(requestLocalGermanSpeech("Fertig", () => { errors++; }, () => { ends++; }), "requested");
    events.spoken[0].onend();
    assert.deepEqual([errors, ends], [0, 1]);
    events.spoken[0].onerror();
    assert.deepEqual([errors, ends], [1, 1]);
    // A caller that passes two arguments, as before, still gets a working utterance.
    assert.equal(requestLocalGermanSpeech("Mehr", () => { errors++; }), "requested");
    events.spoken[1].onend();
    assert.deepEqual([errors, ends], [1, 1]);
  });
  // Nothing was handed to the engine: there is no end to report.
  withFakeSpeech([], false, () => {
    let ends = 0;
    assert.equal(requestLocalGermanSpeech("Pause", () => {}, () => { ends++; }), "unavailable");
    assert.equal(ends, 0);
  });
});

test("hasLocalGermanVoice asks the engine each time and never throws", () => {
  const voices = [{ lang: "de-DE", localService: false }, { lang: "en-GB", localService: true }];
  withFakeSpeech(voices, false, () => {
    assert.equal(hasLocalGermanVoice(), false);
    voices.push({ lang: "de_CH", localService: true });
    assert.equal(hasLocalGermanVoice(), true);
    globalThis.window.speechSynthesis.getVoices = () => { throw new Error("engine broke"); };
    assert.equal(hasLocalGermanVoice(), false);
    delete globalThis.window.speechSynthesis;
    assert.equal(hasLocalGermanVoice(), false);
  });
  // No window at all, as in Node.
  assert.equal(globalThis.window, undefined);
  assert.equal(hasLocalGermanVoice(), false);
});

test("onVoicesChanged listens for voiceschanged until its result is called, and is harmless without an engine or events", () => {
  withFakeSpeech([], false, () => {
    const engine = globalThis.window.speechSynthesis;
    // An engine without events.
    let calls = 0;
    onVoicesChanged(() => { calls++; })();
    const listeners = [];
    engine.addEventListener = (type, listener) => { listeners.push([type, listener]); };
    engine.removeEventListener = (type, listener) => {
      const index = listeners.findIndex((entry) => entry[0] === type && entry[1] === listener);
      if (index >= 0) listeners.splice(index, 1);
    };
    const stop = onVoicesChanged(() => { calls++; });
    assert.deepEqual(listeners.map((entry) => entry[0]), ["voiceschanged"]);
    listeners[0][1]();
    assert.equal(calls, 1);
    stop();
    assert.equal(listeners.length, 0);
    stop();
    engine.addEventListener = () => { throw new Error("engine broke"); };
    onVoicesChanged(() => { calls++; })();
    delete globalThis.window.speechSynthesis;
    onVoicesChanged(() => { calls++; })();
    assert.equal(calls, 1);
  });
  assert.equal(globalThis.window, undefined);
  onVoicesChanged(() => assert.fail("no engine, no event"))();
});
