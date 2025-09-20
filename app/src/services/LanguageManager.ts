// Simple language manager for German translations
class LanguageManagerClass {
  private language = 'de';
  private subscribers: (() => void)[] = [];

  subscribe(callback: () => void): () => void {
    this.subscribers.push(callback);
    return () => {
      const index = this.subscribers.indexOf(callback);
      if (index > -1) {
        this.subscribers.splice(index, 1);
      }
    };
  }

  getLanguage(): string {
    return this.language;
  }

  t(key: string): string {
    // Simple German translations
    const translations: Record<string, string> = {
      'mediapipe.tapToStart': 'Tippe, um die Kamera zu starten',
      'mediapipe.recognizerInitFailed': 'Ich bin gleich bereit. Versuch\'s nochmal!',
      'mediapipe.predictionError': 'Das hat nicht geklappt. Lass es uns nochmal versuchen!',
      'mediapipe.cameraError': 'Die Kamera braucht einen Moment. Lass uns weitermachen!',
      'mediapipe.webviewUnavailable': 'Ich brauche einen Moment. Lass uns gleich weitermachen!',
      'mediapipe.gestureProcessingError': 'Das hat nicht geklappt. Probier\'s einfach nochmal!',
    };
    return translations[key] || key;
  }
}

export const LanguageManager = new LanguageManagerClass();