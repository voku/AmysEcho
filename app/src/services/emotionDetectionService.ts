import AsyncStorage from '@react-native-async-storage/async-storage';

export type Emotion = 'happy' | 'excited' | 'calm' | 'frustrated';

export interface GestureMetrics {
  speed: number; // 0..1 normalized
  intensity: number; // 0..1 normalized
  pattern?: string;
}

/**
 * Simple heuristic-based emotion detection for Amy.
 * Uses gesture speed, intensity and repetition patterns
 * to infer Amy's likely emotional state.
 */
class EmotionDetectionService {
  private static instance: EmotionDetectionService;
  private readonly STORAGE_KEY = 'last_emotion_state';
  private lastEmotion: Emotion | null = null;

  private constructor() {
    this.loadLastEmotion();
  }

  static getInstance(): EmotionDetectionService {
    if (!EmotionDetectionService.instance) {
      EmotionDetectionService.instance = new EmotionDetectionService();
    }
    return EmotionDetectionService.instance;
  }

  /**
   * Detects emotion from gesture metrics. Current mood is used to soften
   * changes – if metrics are inconclusive we keep the current mood.
   */
  detectEmotion(metrics: GestureMetrics, currentMood?: Emotion | null): Emotion {
    let emotion: Emotion;

    if (metrics.pattern === 'repeated_fast') {
      emotion = 'frustrated';
    } else if (metrics.speed > 0.8 && metrics.intensity > 0.7) {
      emotion = 'excited';
    } else if (metrics.speed < 0.3 && metrics.intensity < 0.3) {
      emotion = 'calm';
    } else {
      emotion = 'happy';
    }

    // If detection disagrees with current mood but intensity is low,
    // keep the current mood to avoid unnecessary mood changes.
    if (currentMood && emotion !== currentMood && metrics.intensity < 0.5) {
      emotion = currentMood;
    }

    this.lastEmotion = emotion;
    this.saveLastEmotion();
    return emotion;
  }

  /**
   * Detect emotion and update MoodSelector via callback when mood changed.
   */
  detectAndUpdateMood(
    metrics: GestureMetrics,
    currentMood: Emotion | null,
    setMood: (mood: Emotion) => void
  ): Emotion {
    const detected = this.detectEmotion(metrics, currentMood);
    if (currentMood !== detected) {
      setMood(detected);
    }
    return detected;
  }

  getLastEmotion(): Emotion | null {
    return this.lastEmotion;
  }

  private async loadLastEmotion(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.lastEmotion = stored as Emotion;
      }
    } catch {
      // ignore load errors
    }
  }

  private saveLastEmotion(): void {
    if (!this.lastEmotion) return;
    try {
      const setItem = (AsyncStorage as any)?.setItem;
      if (typeof setItem === 'function') {
        const result = setItem(this.STORAGE_KEY, this.lastEmotion);
        if (result && typeof (result as any).catch === 'function') {
          (result as Promise<void>).catch(() => {});
        }
      }
    } catch {
      // ignore save errors
    }
  }
}

export const emotionDetectionService = EmotionDetectionService.getInstance();
