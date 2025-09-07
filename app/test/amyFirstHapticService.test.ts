/**
 * Tests for Amy First Haptic Service - Enhanced Multi-Sensory Feedback
 *
 * Ensures the service provides context-aware, personalized haptic feedback
 * that adapts to Amy's preferences and communication patterns.
 */

import { amyFirstHapticService } from '../src/services/feedbackService';

// Mock Haptics for testing
jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy'
  },
  impactAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: {
    Success: 'success',
    Error: 'error'
  },
  notificationAsync: jest.fn().mockResolvedValue(undefined)
}));

// Mock AsyncStorage for testing
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

// Mock audio service to avoid importing expo-audio in tests
jest.mock('../src/services/audioService', () => ({
  audioService: {
    playSuccessFeedback: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('AmyFirstHapticService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset service state
    (amyFirstHapticService as any).preferences = (amyFirstHapticService as any).getDefaultPreferences();
  });

  describe('Context-Aware Feedback', () => {
    test('provides basic feedback for simple gestures', async () => {
      const { impactAsync } = require('expo-haptics');

      await amyFirstHapticService.provideContextAwareFeedback('thumbs_up', 0.8);

      expect(impactAsync).toHaveBeenCalledWith('medium');
    });

    test('adapts feedback based on time of day', async () => {
      const { impactAsync } = require('expo-haptics');

      // Morning context - should be gentler
      await amyFirstHapticService.provideContextAwareFeedback('hello', 0.8, {
        timeOfDay: 'morning'
      });

      expect(impactAsync).toHaveBeenCalledWith('light');
    });

    test('provides emergency feedback for critical gestures', async () => {
      const { impactAsync } = require('expo-haptics');

      await amyFirstHapticService.provideContextAwareFeedback('hilfe', 0.8, {
        isEmergency: true
      });

      // Emergency should use heavy feedback with repeat
      expect(impactAsync).toHaveBeenCalledTimes(3);
      expect(impactAsync).toHaveBeenCalledWith('heavy');
    });

    test('adjusts feedback based on activity level', async () => {
      const { impactAsync } = require('expo-haptics');

      // High activity - should be gentler to avoid overwhelming
      await amyFirstHapticService.provideContextAwareFeedback('thumbs_up', 0.8, {
        recentActivity: 15 // High activity
      });

      expect(impactAsync).toHaveBeenCalledWith('light');
    });

    test('recognizes pattern matches and boosts feedback', async () => {
      const { impactAsync } = require('expo-haptics');

      await amyFirstHapticService.provideContextAwareFeedback('thumbs_up', 0.8, {
        patternMatch: true
      });

      // Pattern match should increase intensity
      expect(impactAsync).toHaveBeenCalledWith('heavy');
    });
  });

  describe('Multi-Sensory Feedback', () => {
    test('combines haptic with audio and visual feedback', async () => {
      const { impactAsync } = require('expo-haptics');
      const mockVisualCallback = jest.fn();

      await amyFirstHapticService.provideMultiSensoryFeedback('thumbs_up', 0.8, {}, {
        includeAudio: true,
        includeVisual: true,
        visualCallback: mockVisualCallback
      });

      expect(impactAsync).toHaveBeenCalled();
      expect(mockVisualCallback).toHaveBeenCalled();
    });

    test('respects feedback channel preferences', async () => {
      const { impactAsync } = require('expo-haptics');
      const mockVisualCallback = jest.fn();

      // Disable audio
      await amyFirstHapticService.provideMultiSensoryFeedback('thumbs_up', 0.8, {}, {
        includeAudio: false,
        includeVisual: true,
        visualCallback: mockVisualCallback
      });

      expect(impactAsync).toHaveBeenCalled();
      expect(mockVisualCallback).toHaveBeenCalled();
    });

    test('handles feedback failures gracefully', async () => {
      const { impactAsync } = require('expo-haptics');
      impactAsync.mockRejectedValue(new Error('Haptic failed'));

      // Should not throw despite haptic failure
      await expect(
        amyFirstHapticService.provideContextAwareFeedback('thumbs_up', 0.8)
      ).resolves.not.toThrow();
    });
  });

  describe('Amy Preferences', () => {
    test('applies gentle intensity preference', async () => {
      const { impactAsync } = require('expo-haptics');

      await amyFirstHapticService.savePreferences({ intensity: 'gentle' });
      await amyFirstHapticService.provideContextAwareFeedback('thumbs_up', 0.8);

      // Should use lighter feedback for gentle preference
      expect(impactAsync).toHaveBeenCalledWith('light');
    });

    test('applies strong intensity preference', async () => {
      const { impactAsync } = require('expo-haptics');

      await amyFirstHapticService.savePreferences({ intensity: 'strong' });
      await amyFirstHapticService.provideContextAwareFeedback('thumbs_up', 0.8);

      // Should use heavier feedback for strong preference
      expect(impactAsync).toHaveBeenCalledWith('heavy');
    });

    test('respects time-based adjustment settings', async () => {
      const { impactAsync } = require('expo-haptics');

      await amyFirstHapticService.savePreferences({
        timeBasedAdjustments: false,
        intensity: 'normal'
      });

      // Even in morning, should not adjust if time-based is disabled
      await amyFirstHapticService.provideContextAwareFeedback('thumbs_up', 0.8, {
        timeOfDay: 'morning'
      });

      expect(impactAsync).toHaveBeenCalledWith('medium'); // Normal intensity
    });

    test('respects context awareness settings', async () => {
      const { impactAsync } = require('expo-haptics');

      await amyFirstHapticService.savePreferences({
        contextAwareness: false
      });

      // Should ignore activity level if context awareness is disabled
      await amyFirstHapticService.provideContextAwareFeedback('thumbs_up', 0.8, {
        recentActivity: 20
      });

      expect(impactAsync).toHaveBeenCalledWith('medium'); // Normal intensity
    });
  });

  describe('Gesture-Specific Patterns', () => {
    test('provides celebratory feedback for positive gestures', async () => {
      const { impactAsync } = require('expo-haptics');

      await amyFirstHapticService.provideContextAwareFeedback('danke', 0.8);

      // Positive gestures should get repeated feedback
      expect(impactAsync).toHaveBeenCalledTimes(2);
    });

    test('provides gentle feedback for question gestures', async () => {
      const { impactAsync } = require('expo-haptics');

      await amyFirstHapticService.provideContextAwareFeedback('was', 0.8);

      expect(impactAsync).toHaveBeenCalledWith('light');
    });

    test('provides communication feedback for core gestures', async () => {
      const { impactAsync } = require('expo-haptics');

      await amyFirstHapticService.provideContextAwareFeedback('ich', 0.8);

      expect(impactAsync).toHaveBeenCalledWith('light');
    });
  });

  describe('Configuration Management', () => {
    test('loads default preferences', () => {
      const prefs = amyFirstHapticService.getPreferences();

      expect(prefs.intensity).toBe('normal');
      expect(prefs.timeBasedAdjustments).toBe(true);
      expect(prefs.contextAwareness).toBe(true);
    });

    test('updates preferences correctly', async () => {
      const newPrefs = {
        intensity: 'gentle' as const,
        timeBasedAdjustments: false
      };

      await amyFirstHapticService.savePreferences(newPrefs);

      const updatedPrefs = amyFirstHapticService.getPreferences();
      expect(updatedPrefs.intensity).toBe('gentle');
      expect(updatedPrefs.timeBasedAdjustments).toBe(false);
      expect(updatedPrefs.contextAwareness).toBe(true); // Unchanged
    });

    test('validates preference updates', async () => {
      // Should handle invalid preferences gracefully
      await expect(
        amyFirstHapticService.savePreferences({ intensity: 'invalid' as any })
      ).resolves.not.toThrow();
    });
  });

  describe('Performance and Reliability', () => {
    test('maintains performance with rapid feedback requests', async () => {
      const { impactAsync } = require('expo-haptics');
      const startTime = Date.now();

      // Simulate rapid feedback requests
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          amyFirstHapticService.provideContextAwareFeedback('thumbs_up', 0.8)
        );
      }

      await Promise.all(promises);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(impactAsync).toHaveBeenCalledTimes(20); // Updated for enhanced haptic system
    });

    test('handles concurrent multi-sensory requests', async () => {
      const { impactAsync } = require('expo-haptics');
      const mockVisualCallback = jest.fn();

      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          amyFirstHapticService.provideMultiSensoryFeedback('thumbs_up', 0.8, {}, {
            includeAudio: true,
            includeVisual: true,
            visualCallback: mockVisualCallback
          })
        );
      }

      await Promise.all(promises);

      expect(impactAsync).toHaveBeenCalledTimes(10); // Updated for enhanced haptic system
      expect(mockVisualCallback).toHaveBeenCalledTimes(5);
    });
  });
});
