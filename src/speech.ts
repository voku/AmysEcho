/**
 * A reported local German voice is only a candidate. Offline playback must
 * still be proven on the target device with networking physically disabled.
 */
/**
 * What became of a request to speak.
 * - "requested": the utterance was handed to the engine.
 * - "unavailable": the engine's voice list is empty. That cannot be told
 *   apart from a list that has not loaded yet, so asking again may help.
 * - "no-voice": asking again cannot help as things are: there is no speech
 *   engine, or the voice list is there and holds no local German voice (a
 *   German voice that needs the network does not count).
 * - "failed": the engine threw.
 */
export type SpeechAttempt = "requested" | "unavailable" | "no-voice" | "failed";

const isLocalGerman = (voice: SpeechSynthesisVoice): boolean => voice.localService === true && /^de(?:[-_]|$)/i.test(voice.lang);

function speechEngine(): SpeechSynthesis | undefined {
  return typeof window === "undefined" ? undefined : window.speechSynthesis;
}

/**
 * Asks the engine for its voices and says whether a local German one is
 * there. Browsers fill the list in the background, and some only start doing
 * so when it is first asked for: calling this early (the board does, when it
 * is mounted) makes it more likely that the list is there at the first tap.
 * Never throws; false without an engine.
 */
export function hasLocalGermanVoice(): boolean {
  try {
    return speechEngine()?.getVoices().some(isLocalGerman) ?? false;
  } catch {
    return false;
  }
}

/**
 * Whether the engine says it is speaking or has something queued: "active"
 * when `speaking` or `pending` is true, "silent" when both are false,
 * "unknown" without an engine or when it does not have both properties as
 * booleans. What real engines report here is untested on devices.
 */
export function speechActivity(): "active" | "silent" | "unknown" {
  try {
    const engine = speechEngine();
    if (engine === undefined || typeof engine.speaking !== "boolean" || typeof engine.pending !== "boolean") return "unknown";
    return engine.speaking || engine.pending ? "active" : "silent";
  } catch {
    return "unknown";
  }
}

/**
 * Calls `listener` whenever the engine reports a changed voice list. Returns
 * a function that stops that. Does nothing, and returns a function that does
 * nothing, without an engine or without event support.
 */
export function onVoicesChanged(listener: () => void): () => void {
  try {
    const engine = speechEngine();
    if (engine === undefined || typeof engine.addEventListener !== "function") return () => undefined;
    engine.addEventListener("voiceschanged", listener);
    return () => {
      try {
        engine.removeEventListener("voiceschanged", listener);
      } catch {
        // Nothing to stop.
      }
    };
  } catch {
    return () => undefined;
  }
}

/**
 * Asks the engine to speak `text` with a local German voice, after stopping
 * whatever it speaks. "requested" means the utterance was handed over; then
 * `onFailure` is called if the engine reports an error for it and `onEnd`
 * when it reports that it has finished. An utterance that was stopped (the
 * errors "interrupted" and "canceled", as after `cancel()` from anywhere in
 * the page) is over, not broken: that is reported through `onEnd`. An utterance that a later request
 * cancels may report either, so callers must ignore reports for requests
 * that are no longer their latest. Whether every engine reports the end is
 * untested on real devices.
 */
export function requestLocalGermanSpeech(text: string, onFailure: () => void, onEnd: () => void = () => undefined): SpeechAttempt {
  if (typeof window === "undefined") {
    return "no-voice";
  }

  const engine = window.speechSynthesis;
  if (engine === undefined) {
    return "no-voice";
  }

  try {
    // A new message must stop the previous utterance, including when the next
    // concept has no supported voice. Never speak a stale, wrong intention.
    engine.cancel();

    if (typeof SpeechSynthesisUtterance === "undefined") {
      return "no-voice";
    }

    const voices = engine.getVoices();
    const localVoice = voices.find(isLocalGerman);
    if (localVoice === undefined) {
      return voices.length === 0 ? "unavailable" : "no-voice";
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = localVoice.lang;
    utterance.voice = localVoice;
    utterance.onerror = (event: { readonly error?: string } | undefined) => {
      if (event?.error === "interrupted" || event?.error === "canceled") onEnd();
      else onFailure();
    };
    utterance.onend = () => onEnd();
    engine.speak(utterance);
    return "requested";
  } catch {
    return "failed";
  }
}
