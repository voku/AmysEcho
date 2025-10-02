import AsyncStorage from '@react-native-async-storage/async-storage';

export type Emotion = 'happy' | 'excited' | 'calm' | 'frustrated';

export interface GestureMetrics {
  speed: number; // 0..1 normalized
  intensity: number; // 0..1 normalized
  pattern?: string;
}

const SPEED_FAST_THRESHOLD = 0.8;
const INTENSITY_HIGH_THRESHOLD = 0.7;
const SPEED_SLOW_THRESHOLD = 0.3;
const INTENSITY_LOW_THRESHOLD = 0.3;
const INTENSITY_STABILITY_THRESHOLD = 0.5;
const VALID_EMOTIONS: Emotion[] = ['happy', 'excited', 'calm', 'frustrated'];

function isEmotion(value: unknown): value is Emotion {
  return VALID_EMOTIONS.includes(value as Emotion);
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

  private constructor() {}

  async init(): Promise<void> {
    await this.loadLastEmotion();
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
    } else if (metrics.speed > SPEED_FAST_THRESHOLD && metrics.intensity > INTENSITY_HIGH_THRESHOLD) {
      emotion = 'excited';
    } else if (metrics.speed < SPEED_SLOW_THRESHOLD && metrics.intensity < INTENSITY_LOW_THRESHOLD) {
      emotion = 'calm';
    } else {
      emotion = 'happy';
    }

    // If detection disagrees with current mood but intensity is low,
    // keep the current mood to avoid unnecessary mood changes.
    if (currentMood && emotion !== currentMood && metrics.intensity < INTENSITY_STABILITY_THRESHOLD) {
      emotion = currentMood;
    }

    if (this.lastEmotion !== emotion) {
      this.lastEmotion = emotion;
      this.saveLastEmotion();
    }
    return emotion;
  }

  /**
   * Detect emotion and notify a mood setter callback when the state changes.
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
      if (stored && this.lastEmotion === null && isEmotion(stored)) {
        this.lastEmotion = stored;
      }
    } catch (error) {
      console.error('EmotionDetectionService: Failed to load last emotion.', error);
    }
  }

  private saveLastEmotion(): void {
    if (!this.lastEmotion) return;
    AsyncStorage.setItem(this.STORAGE_KEY, this.lastEmotion).catch((error) => {
      console.error('EmotionDetectionService: Failed to save last emotion.', error);
    });
  }
}

export const emotionDetectionService = EmotionDetectionService.getInstance();
