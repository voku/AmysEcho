/**
 * A reported local German voice is only a candidate. Offline playback must
 * still be proven on the target device with networking physically disabled.
 */
export type SpeechAttempt = "requested" | "unavailable" | "failed";

export function requestLocalGermanSpeech(text: string, onFailure: () => void): SpeechAttempt {
  if (typeof window === "undefined" || typeof SpeechSynthesisUtterance === "undefined") {
    return "unavailable";
  }

  const engine = window.speechSynthesis;
  if (engine === undefined) {
    return "unavailable";
  }

  const localVoice = engine.getVoices().find(
    (voice) => voice.localService === true && /^de(?:[-_]|$)/i.test(voice.lang),
  );
  if (localVoice === undefined) {
    return "unavailable";
  }

  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = localVoice.lang;
    utterance.voice = localVoice;
    utterance.onerror = () => onFailure();
    engine.cancel();
    engine.speak(utterance);
    return "requested";
  } catch {
    return "failed";
  }
}
