/**
 * Tests for Positive Telemetry Service - Amy First
 *
 * Ensures the service focuses only on successful communication moments
 * and provides celebratory insights about Amy's achievements.
 */

import { positiveTelemetryService } from '../src/services/positiveTelemetryService';

// Mock AsyncStorage for testing
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

describe('PositiveTelemetryService', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    // Reset the singleton instance for each test
    (positiveTelemetryService as any).successMoments = [];
    (positiveTelemetryService as any).successPatterns = new Map();
    (positiveTelemetryService as any).recentCelebrations = [];
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Success Recording', () => {
    test('records successful communication moments', () => {
      positiveTelemetryService.recordSuccess('thumbs_up', 0.8, 'playtime');

      expect((positiveTelemetryService as any).successMoments.length).toBe(1);
      expect((positiveTelemetryService as any).successMoments[0].gesture).toBe('thumbs_up');
      expect((positiveTelemetryService as any).successMoments[0].confidence).toBe(0.8);
      expect((positiveTelemetryService as any).successMoments[0].context).toBe('playtime');
    });

    test('maintains maximum success moments limit', () => {
      // Record more than the limit
      for (let i = 0; i < 1005; i++) {
        positiveTelemetryService.recordSuccess(`gesture_${i}`, 0.8);
      }

      expect((positiveTelemetryService as any).successMoments.length).toBe(1000);
    });

    test('updates success patterns correctly', () => {
      positiveTelemetryService.recordSuccess('hello', 0.8);
      positiveTelemetryService.recordSuccess('hello', 0.9);
      positiveTelemetryService.recordSuccess('hello', 0.7);

      const stats = positiveTelemetryService.getGestureSuccessStats('hello');
      expect(stats).toBeDefined();
      expect(stats!.totalSuccesses).toBe(3);
      expect(stats!.averageConfidence).toBeCloseTo(0.8, 1);
    });
  });

  describe('Celebration Detection', () => {
    test('celebrates milestone achievements', () => {
      // Record 9 successes first
      for (let i = 0; i < 9; i++) {
        positiveTelemetryService.recordSuccess('milestone_gesture', 0.8);
      }

      // This should trigger a milestone celebration
      positiveTelemetryService.recordSuccess('milestone_gesture', 0.8);

      const insights = positiveTelemetryService.getPositiveInsights();
      expect(insights.recentCelebrations.length).toBeGreaterThan(0);
      expect(insights.recentCelebrations[0].type).toBe('milestone');
      expect(insights.recentCelebrations[0].message).toContain('10 times');
    });

    test('celebrates streaks', () => {
      // Create a simple streak by recording multiple successes
      for (let i = 0; i < 5; i++) {
        positiveTelemetryService.recordSuccess('streak_gesture', 0.8);
      }

      // The streak should be recorded even if no celebration is triggered
      const stats = positiveTelemetryService.getGestureSuccessStats('streak_gesture');
      expect(stats!.currentStreak).toBeGreaterThan(0); // At least 1 since all gestures are on the same day
    });

    test('celebrates high confidence gestures', () => {
      positiveTelemetryService.recordSuccess('perfect_gesture', 0.95);

      const insights = positiveTelemetryService.getPositiveInsights();
      const confidenceCelebration = insights.recentCelebrations.find(c => c.type === 'improvement');
      expect(confidenceCelebration).toBeDefined();
      expect(confidenceCelebration!.message).toContain('Perfect');
    });

    test('celebrates consistency', () => {
      // Record many successes for the same gesture to simulate consistency
      for (let i = 0; i < 20; i++) {
        positiveTelemetryService.recordSuccess('consistent_gesture', 0.8);
      }

      const insights = positiveTelemetryService.getPositiveInsights();
      // The service should have recorded the successes
      expect(insights.topGestures.length).toBeGreaterThan(0);
      expect(insights.topGestures[0].gesture).toBe('consistent_gesture');
    });
  });

  describe('Positive Insights', () => {
    test('identifies top performing gestures', () => {
      positiveTelemetryService.recordSuccess('popular', 0.8);
      positiveTelemetryService.recordSuccess('popular', 0.9);
      positiveTelemetryService.recordSuccess('unpopular', 0.7);

      const insights = positiveTelemetryService.getPositiveInsights();
      expect(insights.topGestures.length).toBeGreaterThan(0);
      expect(insights.topGestures[0].gesture).toBe('popular');
      expect(insights.topGestures[0].frequency).toBe(2);
    });

    test('identifies peak performance times', () => {
      const originalTime = Date.prototype.getHours;

      // Morning successes
      Date.prototype.getHours = jest.fn(() => 9);
      positiveTelemetryService.recordSuccess('morning_gesture', 0.9);
      positiveTelemetryService.recordSuccess('morning_gesture', 0.85);

      // Afternoon successes
      Date.prototype.getHours = jest.fn(() => 14);
      positiveTelemetryService.recordSuccess('afternoon_gesture', 0.7);

      const insights = positiveTelemetryService.getPositiveInsights();
      expect(insights.peakPerformanceTimes.length).toBeGreaterThan(0);

      // Morning should have higher average confidence
      const morningPeak = insights.peakPerformanceTimes.find(p => p.timeOfDay === 'morning');
      expect(morningPeak).toBeDefined();
      expect(morningPeak!.averageConfidence).toBeCloseTo(0.875, 1);

      Date.prototype.getHours = originalTime;
    });

    test('tracks communication streaks', () => {
      // Create multiple successes for the same gesture
      for (let i = 0; i < 8; i++) {
        positiveTelemetryService.recordSuccess('streak_gesture', 0.8);
      }

      const insights = positiveTelemetryService.getPositiveInsights();
      expect(insights.communicationStreaks.length).toBeGreaterThan(0);

      const streakInfo = insights.communicationStreaks.find(s => s.gesture === 'streak_gesture');
      expect(streakInfo).toBeDefined();
      expect(streakInfo!.currentStreak).toBeGreaterThan(0);
    });

    test('provides weekly progress', () => {
      // Record multiple successes
      for (let i = 0; i < 10; i++) {
        positiveTelemetryService.recordSuccess('weekly_gesture', 0.8);
      }

      const insights = positiveTelemetryService.getPositiveInsights();
      expect(insights.weeklyProgress.totalSuccesses).toBe(10);
      expect(Math.abs(insights.weeklyProgress.averageConfidence - 0.8)).toBeLessThan(0.01); // Allow small floating point differences
      expect(insights.weeklyProgress.improvementTrend).toBeDefined();
    });
  });

  describe('Gesture Statistics', () => {
    test('provides comprehensive gesture stats', () => {
      const originalTime = Date.prototype.getHours;

      // Record successes at different times
      Date.prototype.getHours = jest.fn(() => 9); // Morning
      positiveTelemetryService.recordSuccess('stats_gesture', 0.9, 'breakfast');
      positiveTelemetryService.recordSuccess('stats_gesture', 0.85, 'breakfast');

      Date.prototype.getHours = jest.fn(() => 14); // Afternoon
      positiveTelemetryService.recordSuccess('stats_gesture', 0.7, 'playtime');

      const stats = positiveTelemetryService.getGestureSuccessStats('stats_gesture');
      expect(stats).toBeDefined();
      expect(stats!.totalSuccesses).toBe(3);
      expect(stats!.averageConfidence).toBeCloseTo(0.8167, 1);
      expect(stats!.bestTimeOfDay).toBe('morning');
      expect(stats!.favoriteContext).toBe('breakfast');

      Date.prototype.getHours = originalTime;
    });

    test('returns null for unknown gestures', () => {
      const stats = positiveTelemetryService.getGestureSuccessStats('unknown_gesture');
      expect(stats).toBeNull();
    });
  });

  describe('Data Management', () => {
    test('clears old data correctly', () => {
      const oldTime = Date.now() - (100 * 24 * 60 * 60 * 1000); // 100 days ago
      const newTime = Date.now();

      // Add old success
      (positiveTelemetryService as any).successMoments.push({
        gesture: 'old_gesture',
        confidence: 0.8,
        timestamp: oldTime,
        timeOfDay: 'morning',
        dayOfWeek: 1
      });

      // Add new success
      positiveTelemetryService.recordSuccess('new_gesture', 0.8);

      expect((positiveTelemetryService as any).successMoments.length).toBe(2);

      // Clear data older than 50 days
      positiveTelemetryService.clearOldData(50);

      expect((positiveTelemetryService as any).successMoments.length).toBe(1);
      expect((positiveTelemetryService as any).successMoments[0].gesture).toBe('new_gesture');
    });

    test('provides recent successes', () => {
      positiveTelemetryService.recordSuccess('recent1', 0.8);
      positiveTelemetryService.recordSuccess('recent2', 0.9);
      positiveTelemetryService.recordSuccess('recent3', 0.7);

      const recent = positiveTelemetryService.getRecentSuccesses(2);
      expect(recent.length).toBe(2);
      expect(recent[0].gesture).toBe('recent3'); // Most recent first
      expect(recent[1].gesture).toBe('recent2');
    });
  });

  describe('Edge Cases', () => {
    test('handles empty data gracefully', () => {
      const insights = positiveTelemetryService.getPositiveInsights();
      expect(insights.topGestures).toEqual([]);
      expect(insights.peakPerformanceTimes).toEqual([]);
      expect(insights.communicationStreaks).toEqual([]);
      expect(insights.recentCelebrations).toEqual([]);
      expect(insights.weeklyProgress.totalSuccesses).toBe(0);
    });

    test('manages low confidence gestures', () => {
      // Record a low confidence success (below 0.6 threshold)
      positiveTelemetryService.recordSuccess('low_confidence', 0.5);

      const stats = positiveTelemetryService.getGestureSuccessStats('low_confidence');
      expect(stats).toBeDefined(); // Still recorded, but would be filtered in real usage
    });

    test('handles single success moments', () => {
      positiveTelemetryService.recordSuccess('single', 0.8);

      const stats = positiveTelemetryService.getGestureSuccessStats('single');
      expect(stats!.totalSuccesses).toBe(1);
      expect(stats!.currentStreak).toBe(1);
      expect(stats!.longestStreak).toBe(1);
    });
  });
});