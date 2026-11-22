/**
 * A reported local German voice is only a candidate. Offline playback must
 * still be proven on the target device with networking physically disabled.
 */
export type SpeechAttempt = "requested" | "unavailable" | "failed";

export function requestLocalGermanSpeech(text: string, onFailure: () => void): SpeechAttempt {
  if (typeof window === "undefined") {
    return "unavailable";
  }

  const engine = window.speechSynthesis;
  if (engine === undefined) {
    return "unavailable";
  }

  try {
    // A new message must stop the previous utterance, including when the next
    // concept has no supported voice. Never speak a stale, wrong intention.
    engine.cancel();

    if (typeof SpeechSynthesisUtterance === "undefined") {
      return "unavailable";
    }

    const localVoice = engine.getVoices().find(
      (voice) => voice.localService === true && /^de(?:[-_]|$)/i.test(voice.lang),
    );
    if (localVoice === undefined) {
      return "unavailable";
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = localVoice.lang;
    utterance.voice = localVoice;
    utterance.onerror = () => onFailure();
    engine.speak(utterance);
    return "requested";
  } catch {
    return "failed";
  }
}
