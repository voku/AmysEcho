import assert from "node:assert/strict";
import test from "node:test";
import { requestLocalGermanSpeech } from "../dist/speech.js";

class FakeUtterance {
  constructor(text) { this.text = text; this.lang = ""; this.voice = null; this.onerror = null; }
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
