import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { amyFirstHapticService, getHapticPatternForConfidence, getHapticPatternForGesture, gestureHapticFeedback, multiSensoryFeedback, getAmyHapticPreferences, updateAmyHapticPreferences, detectionHapticFeedback, partialGestureHapticFeedback, learningProgressHapticFeedback, streakAchievementHapticFeedback, encouragementHapticFeedback, triggerSpeakAndShow, childHaptic } from '../src/services/feedbackService';

// Use shared mocks for audio service and logger
const { audioService } = require('../src/services/audioService');
const { logger } = require('../src/utils/logger');

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy'
  },
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error'
  },
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock audioService
jest.mock('../src/services/audioService', () => ({
  audioService: {
    playSuccessFeedback: jest.fn(),
  },
}));

// Mock logger
jest.mock('../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

describe('FeedbackService', () => {
  let hapticService: typeof amyFirstHapticService;

  beforeEach(() => {
    // Reset the singleton instance for each test
    (amyFirstHapticService as any).preferences = (amyFirstHapticService as any).getDefaultPreferences();
    hapticService = amyFirstHapticService;

    // Reset all mocks
    jest.clearAllMocks();

    // Mock AsyncStorage
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

    // Mock audioService
    audioService.playSuccessFeedback.mockResolvedValue(undefined);

    // Mock Haptics
    (Haptics.impactAsync as jest.Mock).mockResolvedValue(undefined);
    (Haptics.notificationAsync as jest.Mock).mockResolvedValue(undefined);
  });

  describe('AmyFirstHapticService Singleton', () => {
    it('should return the same instance', () => {
      const instance1 = amyFirstHapticService;
      const instance2 = amyFirstHapticService;
      expect(instance1).toBe(instance2);
    });

    it('should initialize with default preferences', () => {
      const preferences = hapticService.getPreferences();
      expect(preferences.intensity).toBe('normal');
      expect(preferences.timeBasedAdjustments).toBe(true);
      expect(preferences.contextAwareness).toBe(true);
      expect(preferences.patterns.emergency.intensity).toBe('heavy');
      expect(preferences.patterns.success.intensity).toBe('medium');
    });
  });

  describe('Preference Management', () => {
    it('should load preferences from AsyncStorage', async () => {
      const storedPrefs = {
        intensity: 'gentle',
        timeBasedAdjustments: false
      };

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(storedPrefs));

      // Create new instance to trigger load
      const newService = new (hapticService.constructor as any)();
      await (newService as any).loadPreferences();

      const preferences = newService.getPreferences();
      expect(preferences.intensity).toBe('gentle');
      expect(preferences.timeBasedAdjustments).toBe(false);
      expect(preferences.contextAwareness).toBe(true); // Should keep default
    });

    it('should save preferences to AsyncStorage', async () => {
      const newPrefs = {
        intensity: 'strong',
        timeBasedAdjustments: false
      };

      await hapticService.savePreferences(newPrefs);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'amy_haptic_preferences',
        expect.stringContaining('"intensity":"strong"')
      );

      const preferences = hapticService.getPreferences();
      expect(preferences.intensity).toBe('strong');
      expect(preferences.timeBasedAdjustments).toBe(false);
    });

    it('should handle AsyncStorage errors gracefully', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage error'));

      const newService = new (hapticService.constructor as any)();
      await (newService as any).loadPreferences();

      expect(logger.warn).toHaveBeenCalledWith('Failed to load Amy haptic preferences:', expect.any(Error));
    });
  });

  describe('provideContextAwareFeedback', () => {
    it('should provide basic feedback for normal gestures', async () => {
      await hapticService.provideContextAwareFeedback('hello', 0.7);

      expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
    });

    it('should provide emergency feedback for emergency gestures', async () => {
      await hapticService.provideContextAwareFeedback('hilfe', 0.5);

      // Should call impact multiple times for emergency
      expect(Haptics.impactAsync).toHaveBeenCalledTimes(3);
      expect(Haptics.impactAsync).toHaveBeenCalledWith('heavy');
    });

    it('should provide celebratory feedback for positive gestures', async () => {
      await hapticService.provideContextAwareFeedback('danke', 0.8);

      // Should call impact twice for positive gestures
      expect(Haptics.impactAsync).toHaveBeenCalledTimes(2);
      expect(Haptics.impactAsync).toHaveBeenCalledWith('medium');
    });

    it('should adjust intensity based on confidence', async () => {
      // High confidence
      await hapticService.provideContextAwareFeedback('test', 0.9);
      expect(Haptics.impactAsync).toHaveBeenLastCalledWith('medium');

      // Reset mock
      (Haptics.impactAsync as jest.Mock).mockClear();

      // Low confidence
      await hapticService.provideContextAwareFeedback('test', 0.3);
      expect(Haptics.impactAsync).toHaveBeenLastCalledWith('light');
    });

    it('should apply context adjustments when enabled', async () => {
      const context = {
        timeOfDay: 'morning' as const,
        recentActivity: 15,
        patternMatch: true
      };

      await hapticService.provideContextAwareFeedback('test', 0.7, context);

      // Should be adjusted for morning (gentler) and pattern match (stronger)
      // Base would be light for 0.7 confidence, pattern match makes it medium, morning makes it light
      expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
    });

    it('should respect user intensity preferences', async () => {
      await hapticService.savePreferences({ intensity: 'gentle' });

      await hapticService.provideContextAwareFeedback('test', 0.9);

      // Should be reduced from medium to light due to gentle preference
      expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
    });

    it('should handle haptic failures gracefully', async () => {
      (Haptics.impactAsync as jest.Mock).mockRejectedValue(new Error('Haptic error'));

      // Should not throw, should fallback to basic feedback
      await expect(hapticService.provideContextAwareFeedback('test', 0.5)).resolves.not.toThrow();
    });
  });

  describe('provideMultiSensoryFeedback', () => {
    it('should combine haptic, audio, and visual feedback', async () => {
      const visualCallback = jest.fn();
      audioService.playSuccessFeedback.mockResolvedValue(undefined);

      await hapticService.provideMultiSensoryFeedback(
        'hello',
        0.8,
        { timeOfDay: 'afternoon' },
        {
          includeAudio: true,
          includeVisual: true,
          visualCallback
        }
      );

      expect(Haptics.impactAsync).toHaveBeenCalled();
      expect(audioService.playSuccessFeedback).toHaveBeenCalledWith('hello', 0.8);
      expect(visualCallback).toHaveBeenCalled();
    });

    it('should skip audio when disabled', async () => {

      await hapticService.provideMultiSensoryFeedback(
        'hello',
        0.8,
        undefined,
        { includeAudio: false }
      );

      expect(audioService.playSuccessFeedback).not.toHaveBeenCalled();
      expect(Haptics.impactAsync).toHaveBeenCalled();
    });

    it('should skip visual when disabled', async () => {
      const visualCallback = jest.fn();

      await hapticService.provideMultiSensoryFeedback(
        'hello',
        0.8,
        undefined,
        {
          includeVisual: false,
          visualCallback
        }
      );

      expect(visualCallback).not.toHaveBeenCalled();
      expect(Haptics.impactAsync).toHaveBeenCalled();
    });

    it('should handle individual feedback failures gracefully', async () => {
      const visualCallback = jest.fn().mockRejectedValue(new Error('Visual error'));
      audioService.playSuccessFeedback.mockRejectedValue(new Error('Audio error'));
      (Haptics.impactAsync as jest.Mock).mockRejectedValue(new Error('Haptic error'));

      // Should not throw despite all failures
      await expect(hapticService.provideMultiSensoryFeedback(
        'hello',
        0.8,
        undefined,
        {
          includeAudio: true,
          includeVisual: true,
          visualCallback
        }
      )).resolves.not.toThrow();
    });
  });

  describe('getHapticPatternForConfidence', () => {
    it('should return heavy pattern for high confidence', () => {
      const pattern = getHapticPatternForConfidence(0.9);
      expect(pattern.style).toBe('heavy');
      expect(pattern.intensity).toBe('heavy');
      expect(pattern.repeat).toBe(2);
    });

    it('should return medium pattern for medium confidence', () => {
      const pattern = getHapticPatternForConfidence(0.7);
      expect(pattern.style).toBe('medium');
      expect(pattern.intensity).toBe('medium');
      expect(pattern.repeat).toBeUndefined();
    });

    it('should return light pattern for low confidence', () => {
      const pattern = getHapticPatternForConfidence(0.4);
      expect(pattern.style).toBe('light');
      expect(pattern.intensity).toBe('light');
      expect(pattern.repeat).toBeUndefined();
    });

    it('should return light pattern for very low confidence', () => {
      const pattern = getHapticPatternForConfidence(0.1);
      expect(pattern.style).toBe('light');
      expect(pattern.intensity).toBe('light');
      expect(pattern.repeat).toBeUndefined();
    });
  });

  describe('getHapticPatternForGesture', () => {
    it('should return emergency pattern for emergency gestures', () => {
      const pattern = getHapticPatternForGesture('hilfe');
      expect(pattern.style).toBe('heavy');
      expect(pattern.intensity).toBe('heavy');
      expect(pattern.repeat).toBe(3);
    });

    it('should return celebratory pattern for positive gestures', () => {
      const pattern = getHapticPatternForGesture('danke');
      expect(pattern.style).toBe('medium');
      expect(pattern.intensity).toBe('medium');
      expect(pattern.repeat).toBe(2);
    });

    it('should return light pattern for communication gestures', () => {
      const pattern = getHapticPatternForGesture('ich');
      expect(pattern.style).toBe('light');
      expect(pattern.intensity).toBe('light');
      expect(pattern.repeat).toBe(1);
    });

    it('should return default pattern for unknown gestures', () => {
      const pattern = getHapticPatternForGesture('unknown');
      expect(pattern.style).toBe('light');
      expect(pattern.intensity).toBe('light');
      expect(pattern.repeat).toBeUndefined();
    });
  });

  describe('gestureHapticFeedback', () => {
    it('should delegate to AmyFirstHapticService', async () => {
      const spy = jest.spyOn(hapticService, 'provideContextAwareFeedback');

      await gestureHapticFeedback('test', 0.8, false, { timeOfDay: 'morning' });

      expect(spy).toHaveBeenCalledWith('test', 0.8, {
        timeOfDay: 'morning',
        isEmergency: false
      });
    });

    it('should handle emergency flag correctly', async () => {
      const spy = jest.spyOn(hapticService, 'provideContextAwareFeedback');

      await gestureHapticFeedback('test', 0.6, true);

      expect(spy).toHaveBeenCalledWith('test', 0.6, {
        isEmergency: true
      });
    });
  });

  describe('multiSensoryFeedback', () => {
    it('should delegate to AmyFirstHapticService', async () => {
      const spy = jest.spyOn(hapticService, 'provideMultiSensoryFeedback');

      await multiSensoryFeedback('test', 0.8, { timeOfDay: 'afternoon' }, {
        includeAudio: true,
        includeVisual: true,
        visualCallback: jest.fn()
      });

      expect(spy).toHaveBeenCalledWith('test', 0.8, { timeOfDay: 'afternoon' }, {
        includeAudio: true,
        includeVisual: true,
        visualCallback: expect.any(Function)
      });
    });
  });

  describe('Preference Functions', () => {
    it('should get Amy haptic preferences', () => {
      const preferences = getAmyHapticPreferences();
      expect(preferences).toBeDefined();
      expect(preferences.intensity).toBe('normal');
    });

    it('should update Amy haptic preferences', async () => {
      const spy = jest.spyOn(hapticService, 'savePreferences');

      await updateAmyHapticPreferences({ intensity: 'gentle' });

      expect(spy).toHaveBeenCalledWith({ intensity: 'gentle' });
    });
  });

  describe('Basic Haptic Functions', () => {
    describe('detectionHapticFeedback', () => {
      it('should provide light haptic feedback', async () => {
        await detectionHapticFeedback();
        expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
      });

      it('should handle haptic failures gracefully', async () => {
        (Haptics.impactAsync as jest.Mock).mockRejectedValue(new Error('Haptic error'));
        await expect(detectionHapticFeedback()).resolves.not.toThrow();
      });
    });

    describe('partialGestureHapticFeedback', () => {
      it('should provide medium feedback for high completion', async () => {
        await partialGestureHapticFeedback(0.9);
        expect(Haptics.impactAsync).toHaveBeenCalledWith('medium');
      });

      it('should provide light feedback for medium completion', async () => {
        await partialGestureHapticFeedback(0.6);
        expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
      });

      it('should provide no feedback for low completion', async () => {
        await partialGestureHapticFeedback(0.3);
        expect(Haptics.impactAsync).not.toHaveBeenCalled();
      });

      it('should handle haptic failures gracefully', async () => {
        (Haptics.impactAsync as jest.Mock).mockRejectedValue(new Error('Haptic error'));
        await expect(partialGestureHapticFeedback(0.8)).resolves.not.toThrow();
      });
    });

    describe('learningProgressHapticFeedback', () => {
      it('should provide celebratory feedback for significant improvement', async () => {
        await learningProgressHapticFeedback(0.3);
        expect(Haptics.impactAsync).toHaveBeenCalledTimes(2);
        expect(Haptics.impactAsync).toHaveBeenNthCalledWith(1, 'heavy');
        expect(Haptics.impactAsync).toHaveBeenNthCalledWith(2, 'medium');
      });

      it('should provide medium feedback for good improvement', async () => {
        await learningProgressHapticFeedback(0.15);
        expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
        expect(Haptics.impactAsync).toHaveBeenCalledWith('medium');
      });

      it('should provide light feedback for small improvement', async () => {
        await learningProgressHapticFeedback(0.05);
        expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
        expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
      });

      it('should handle haptic failures gracefully', async () => {
        (Haptics.impactAsync as jest.Mock).mockRejectedValue(new Error('Haptic error'));
        await expect(learningProgressHapticFeedback(0.2)).resolves.not.toThrow();
      });
    });

    describe('streakAchievementHapticFeedback', () => {
      it('should provide major celebration for high streaks', async () => {
        await streakAchievementHapticFeedback(15);
        expect(Haptics.impactAsync).toHaveBeenCalledTimes(3);
        expect(Haptics.impactAsync).toHaveBeenCalledWith('heavy');
      });

      it('should provide double pulse for good streaks', async () => {
        await streakAchievementHapticFeedback(7);
        expect(Haptics.impactAsync).toHaveBeenCalledTimes(2);
        expect(Haptics.impactAsync).toHaveBeenNthCalledWith(1, 'heavy');
        expect(Haptics.impactAsync).toHaveBeenNthCalledWith(2, 'medium');
      });

      it('should provide single pulse for small streaks', async () => {
        await streakAchievementHapticFeedback(3);
        expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
        expect(Haptics.impactAsync).toHaveBeenCalledWith('medium');
      });

      it('should handle haptic failures gracefully', async () => {
        (Haptics.impactAsync as jest.Mock).mockRejectedValue(new Error('Haptic error'));
        await expect(streakAchievementHapticFeedback(5)).resolves.not.toThrow();
      });
    });

    describe('encouragementHapticFeedback', () => {
      it('should provide gentle double pulse', async () => {
        await encouragementHapticFeedback();
        expect(Haptics.impactAsync).toHaveBeenCalledTimes(2);
        expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
      });

      it('should handle haptic failures gracefully', async () => {
        (Haptics.impactAsync as jest.Mock).mockRejectedValue(new Error('Haptic error'));
        await expect(encouragementHapticFeedback()).resolves.not.toThrow();
      });
    });
  });

  describe('triggerSpeakAndShow', () => {
    it('should trigger all feedback channels simultaneously', async () => {
      const showSymbol = jest.fn();
      audioService.playSuccessFeedback.mockResolvedValue(undefined);

      await triggerSpeakAndShow('Hello World', 0.9, showSymbol);

      expect(audioService.playSuccessFeedback).toHaveBeenCalledWith('Hello World', 0.9);
      expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
      expect(showSymbol).toHaveBeenCalled();
    });

    it('should handle individual channel failures gracefully', async () => {
      const showSymbol = jest.fn().mockImplementation(() => {
        throw new Error('Visual error');
      });
      audioService.playSuccessFeedback.mockRejectedValue(new Error('Audio error'));
      (Haptics.notificationAsync as jest.Mock).mockRejectedValue(new Error('Haptic error'));

      // Should not throw despite all failures
      await expect(triggerSpeakAndShow('Test', 0.5, showSymbol)).resolves.not.toThrow();
    });
  });

  describe('childHaptic', () => {
    it('should provide gentle haptic feedback', async () => {
      await childHaptic();
      expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
    });

    it('should handle haptic failures gracefully', async () => {
      (Haptics.impactAsync as jest.Mock).mockRejectedValue(new Error('Haptic error'));
      await expect(childHaptic()).resolves.not.toThrow();
    });
  });

  describe('Private Methods', () => {
    describe('adjustForPreferences', () => {
      it('should adjust intensity for gentle preference', () => {
        const pattern = {
          style: 'medium' as const,
          intensity: 'medium' as const,
          repeat: 1
        };

        (hapticService as any).preferences.intensity = 'gentle';
        const adjusted = (hapticService as any).adjustForPreferences(pattern);

        expect(adjusted.intensity).toBe('light');
        expect(adjusted.style).toBe('light');
      });

      it('should adjust intensity for strong preference', () => {
        const pattern = {
          style: 'light' as const,
          intensity: 'light' as const,
          repeat: 1
        };

        (hapticService as any).preferences.intensity = 'strong';
        const adjusted = (hapticService as any).adjustForPreferences(pattern);

        expect(adjusted.intensity).toBe('medium');
        expect(adjusted.style).toBe('medium');
      });

      it('should not adjust for normal preference', () => {
        const pattern = {
          style: 'medium' as const,
          intensity: 'medium' as const,
          repeat: 1
        };

        (hapticService as any).preferences.intensity = 'normal';
        const adjusted = (hapticService as any).adjustForPreferences(pattern);

        expect(adjusted.intensity).toBe('medium');
        expect(adjusted.style).toBe('medium');
      });
    });

    describe('executeHapticPattern', () => {
      it('should execute single pulse for non-repeating patterns', async () => {
        const pattern = {
          style: 'light' as const,
          intensity: 'light' as const,
          repeat: 1
        };

        await (hapticService as any).executeHapticPattern(pattern);

        expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
        expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
      });

      it('should execute multiple pulses for repeating patterns', async () => {
        const pattern = {
          style: 'medium' as const,
          intensity: 'medium' as const,
          repeat: 2,
          _allowRepeat: true
        };

        await (hapticService as any).executeHapticPattern(pattern);

        expect(Haptics.impactAsync).toHaveBeenCalledTimes(2);
        expect(Haptics.impactAsync).toHaveBeenCalledWith('medium');
      });

      it('should limit repetitions for medium intensity', async () => {
        const pattern = {
          style: 'medium' as const,
          intensity: 'medium' as const,
          repeat: 5,
          _allowRepeat: true
        };

        await (hapticService as any).executeHapticPattern(pattern);

        expect(Haptics.impactAsync).toHaveBeenCalledTimes(2); // Limited to 2 for medium
      });

      it('should add delays between repetitions', async () => {
        jest.useFakeTimers();

        const pattern = {
          style: 'heavy' as const,
          intensity: 'heavy' as const,
          repeat: 2,
          _allowRepeat: true
        };

        const executePromise = (hapticService as any).executeHapticPattern(pattern);

        // First call should happen immediately
        expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);

        // Advance timer to trigger second call
        await jest.advanceTimersByTimeAsync(120);

        await executePromise;

        expect(Haptics.impactAsync).toHaveBeenCalledTimes(2);

        jest.useRealTimers();
      });
    });
  });

  describe('Integration Scenarios', () => {
  });
});