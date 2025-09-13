jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn().mockResolvedValue(undefined),
  },
}));
import { emotionDetectionService, Emotion, GestureMetrics } from '../src/services/emotionDetectionService';
const AsyncStorage = require('@react-native-async-storage/async-storage').default;

describe('EmotionDetectionService', () => {
  beforeEach(() => {
    (emotionDetectionService as any).lastEmotion = null;
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockClear().mockResolvedValue(undefined);
  });

  test('detects excited emotion for fast intense gestures', () => {
    const metrics: GestureMetrics = { speed: 0.9, intensity: 0.8 };
    const emotion = emotionDetectionService.detectEmotion(metrics);
    expect(emotion).toBe('excited');
    expect(AsyncStorage.setItem).toHaveBeenCalled();
  });

  test('detects calm emotion for slow gentle gestures', () => {
    const metrics: GestureMetrics = { speed: 0.2, intensity: 0.1 };
    const emotion = emotionDetectionService.detectEmotion(metrics);
    expect(emotion).toBe('calm');
  });

  test('detects frustration for repeated fast pattern', () => {
    const metrics: GestureMetrics = { speed: 0.5, intensity: 0.6, pattern: 'repeated_fast' };
    const emotion = emotionDetectionService.detectEmotion(metrics);
    expect(emotion).toBe('frustrated');
  });

  test('updates MoodSelector when emotion changes', () => {
    const metrics: GestureMetrics = { speed: 0.9, intensity: 0.9 };
    const setMood = jest.fn();
    emotionDetectionService.detectAndUpdateMood(metrics, 'happy', setMood);
    expect(setMood).toHaveBeenCalledWith('excited');
  });

  test('defaults to happy for neutral gestures', () => {
    const metrics: GestureMetrics = { speed: 0.5, intensity: 0.5 };
    const emotion = emotionDetectionService.detectEmotion(metrics);
    expect(emotion).toBe('happy');
  });

  test('keeps current mood when intensity low', () => {
    const metrics: GestureMetrics = { speed: 0.7, intensity: 0.4 };
    const emotion = emotionDetectionService.detectEmotion(metrics, 'calm');
    expect(emotion).toBe('calm');
  });

  test('does not update MoodSelector when mood unchanged', () => {
    const metrics: GestureMetrics = { speed: 0.5, intensity: 0.6 };
    const setMood = jest.fn();
    emotionDetectionService.detectAndUpdateMood(metrics, 'happy', setMood);
    expect(setMood).not.toHaveBeenCalled();
  });

  test('persists emotion only when changed', () => {
    const metrics: GestureMetrics = { speed: 0.5, intensity: 0.5 };
    emotionDetectionService.detectEmotion(metrics);
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
    emotionDetectionService.detectEmotion(metrics);
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
  });

  test('loads last emotion from storage', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('calm');
    await emotionDetectionService.init();
    expect(emotionDetectionService.getLastEmotion()).toBe('calm');
  });
});
