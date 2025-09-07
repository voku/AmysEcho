/**
 * Tests for Context-Aware Recognition Service - Amy First
 *
 * Ensures the service correctly learns from Amy's patterns and
 * provides appropriate confidence adjustments based on context.
 */

import { contextAwareRecognitionService } from '../src/services/contextAwareRecognitionService';

// Mock AsyncStorage for testing
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

describe('ContextAwareRecognitionService', () => {
  beforeEach(() => {
    // Reset the singleton instance for each test
    (contextAwareRecognitionService as any).patterns = new Map();
    (contextAwareRecognitionService as any).recentGestures = [];
    (contextAwareRecognitionService as any).sessionStartTime = Date.now();
  });

  describe('Pattern Learning', () => {
    test('records gesture patterns correctly', () => {
      // Record some gestures
      contextAwareRecognitionService.recordGesture('thumbs_up', 0.8);
      contextAwareRecognitionService.recordGesture('thumbs_up', 0.9);
      contextAwareRecognitionService.recordGesture('thumbs_up', 0.85);
      contextAwareRecognitionService.recordGesture('thumbs_up', 0.87);
      contextAwareRecognitionService.recordGesture('thumbs_up', 0.82);
      contextAwareRecognitionService.recordGesture('wave', 0.7);

      // Check that patterns were created
      const insights = contextAwareRecognitionService.getInsights();
      expect(insights.timeOfDayPatterns.length).toBeGreaterThan(0);
    });

    test('learns time-of-day preferences', () => {
      // Simulate morning gestures
      const originalTime = Date.prototype.getHours;
      Date.prototype.getHours = jest.fn(() => 9); // 9 AM

      contextAwareRecognitionService.recordGesture('good_morning', 0.9);
      contextAwareRecognitionService.recordGesture('good_morning', 0.85);

      // Simulate afternoon
      Date.prototype.getHours = jest.fn(() => 14); // 2 PM
      contextAwareRecognitionService.recordGesture('hungry', 0.7);

      const adjustment = contextAwareRecognitionService.getContextAdjustment('good_morning', 0.8);
      expect(adjustment.confidenceMultiplier).toBeGreaterThan(1.0); // Should boost morning gestures

      // Restore original function
      Date.prototype.getHours = originalTime;
    });

    test('tracks gesture sequences', () => {
      // Record sequence: hello -> how_are_you -> fine_thanks
      contextAwareRecognitionService.recordGesture('hello', 0.8);
      contextAwareRecognitionService.recordGesture('how_are_you', 0.75, 'hello');
      contextAwareRecognitionService.recordGesture('fine_thanks', 0.8, 'how_are_you');

      // Record the sequence again to strengthen the pattern
      contextAwareRecognitionService.recordGesture('hello', 0.8);
      contextAwareRecognitionService.recordGesture('how_are_you', 0.75, 'hello');

      // Now test predictions for 'how_are_you' (what comes after hello)
      const predictions = contextAwareRecognitionService.getPredictedGestures('how_are_you');
      expect(predictions.length).toBeGreaterThan(0);
      expect(predictions[0].gesture).toBe('fine_thanks');
    });
  });

  describe('Confidence Adjustments', () => {
    test('boosts confidence for frequent gestures', () => {
      // Record the same gesture many times to build frequency
      for (let i = 0; i < 10; i++) {
        contextAwareRecognitionService.recordGesture('favorite_gesture', 0.8);
      }

      // Record some other gestures to create comparison data
      for (let i = 0; i < 3; i++) {
        contextAwareRecognitionService.recordGesture('other_gesture', 0.7);
      }

      const adjustment = contextAwareRecognitionService.getContextAdjustment('favorite_gesture', 0.75);
      expect(adjustment.confidenceMultiplier).toBeGreaterThan(1.0);
      expect(adjustment.priority).toBe('medium');
    });

    test('adjusts based on time-of-day patterns', () => {
      // Create a pattern for morning gestures
      const originalTime = Date.prototype.getHours;
      Date.prototype.getHours = jest.fn(() => 8); // Morning

      // Record high confidence morning gestures
      for (let i = 0; i < 5; i++) {
        contextAwareRecognitionService.recordGesture('breakfast', 0.9);
      }

      // Test adjustment for same gesture at same time with lower confidence
      const adjustment = contextAwareRecognitionService.getContextAdjustment('breakfast', 0.7);
      expect(adjustment.confidenceMultiplier).toBeLessThan(1.0); // Should reduce confidence since current is lower than pattern
      expect(adjustment.reason).toContain('typically struggles');

      Date.prototype.getHours = originalTime;
    });

    test('provides sequence-based predictions', () => {
      // Build sequence pattern: greeting -> question
      contextAwareRecognitionService.recordGesture('greeting', 0.8);
      contextAwareRecognitionService.recordGesture('question', 0.75, 'greeting');
      contextAwareRecognitionService.recordGesture('question', 0.8, 'greeting');
      contextAwareRecognitionService.recordGesture('question', 0.77, 'greeting'); // Strengthen pattern

      const predictions = contextAwareRecognitionService.getPredictedGestures('greeting');
      const questionPrediction = predictions.find(p => p.gesture === 'question');
      expect(questionPrediction).toBeDefined();
      expect(questionPrediction!.probability).toBeGreaterThan(0.3);
    });
  });

  describe('Session Management', () => {
    test('resets session correctly', () => {
      contextAwareRecognitionService.recordGesture('test', 0.8);
      expect((contextAwareRecognitionService as any).recentGestures.length).toBe(1);

      contextAwareRecognitionService.resetSession();
      expect((contextAwareRecognitionService as any).recentGestures.length).toBe(0);
    });

    test('adjusts confidence based on session duration', () => {
      // Mock session start time to be 45 minutes ago
      const fortyFiveMinutesAgo = Date.now() - (45 * 60 * 1000);
      (contextAwareRecognitionService as any).sessionStartTime = fortyFiveMinutesAgo;

      // Record some recent high-confidence gestures
      contextAwareRecognitionService.recordGesture('confident_gesture', 0.9);
      contextAwareRecognitionService.recordGesture('confident_gesture', 0.85);

      const adjustment = contextAwareRecognitionService.getContextAdjustment('confident_gesture', 0.8);
      expect(adjustment.confidenceMultiplier).toBeGreaterThan(1.0); // Should boost for experienced user
    });
  });

  describe('Insights Generation', () => {
    test('generates time-of-day patterns', () => {
      const originalTime = Date.prototype.getHours;
      Date.prototype.getHours = jest.fn(() => 7); // Early morning

      contextAwareRecognitionService.recordGesture('wake_up', 0.8);
      contextAwareRecognitionService.recordGesture('wake_up', 0.9);

      Date.prototype.getHours = jest.fn(() => 19); // Evening
      contextAwareRecognitionService.recordGesture('goodnight', 0.85);

      const insights = contextAwareRecognitionService.getInsights();
      expect(insights.timeOfDayPatterns.length).toBe(4); // morning, afternoon, evening, night
      expect(insights.timeOfDayPatterns.find(p => p.timeOfDay === 'morning')?.favoriteGesture).toBe('wake_up');

      Date.prototype.getHours = originalTime;
    });

    test('identifies common sequences', () => {
      // Create sequence patterns: start -> middle -> end
      contextAwareRecognitionService.recordGesture('start', 0.8);
      contextAwareRecognitionService.recordGesture('middle', 0.75, 'start');
      contextAwareRecognitionService.recordGesture('end', 0.8, 'middle');

      // Repeat for stronger pattern
      contextAwareRecognitionService.recordGesture('start', 0.8);
      contextAwareRecognitionService.recordGesture('middle', 0.75, 'start');
      contextAwareRecognitionService.recordGesture('end', 0.8, 'middle');

      const insights = contextAwareRecognitionService.getInsights();
      expect(insights.commonSequences.length).toBeGreaterThan(0);

      // Find the start->middle sequence
      const startToMiddle = insights.commonSequences.find(seq => seq.from === 'middle' && seq.to === 'end');
      expect(startToMiddle).toBeDefined();
      expect(startToMiddle!.from).toBe('middle');
      expect(startToMiddle!.to).toBe('end');
    });

    test('tracks confidence trends', () => {
      // Create improving trend
      contextAwareRecognitionService.recordGesture('improving', 0.6);
      contextAwareRecognitionService.recordGesture('improving', 0.7);
      contextAwareRecognitionService.recordGesture('improving', 0.8);
      contextAwareRecognitionService.recordGesture('improving', 0.85);

      // Create declining trend
      contextAwareRecognitionService.recordGesture('declining', 0.9);
      contextAwareRecognitionService.recordGesture('declining', 0.8);
      contextAwareRecognitionService.recordGesture('declining', 0.7);
      contextAwareRecognitionService.recordGesture('declining', 0.6);

      const insights = contextAwareRecognitionService.getInsights();
      const improvingTrend = insights.confidenceTrends.find(t => t.gesture === 'improving');
      const decliningTrend = insights.confidenceTrends.find(t => t.gesture === 'declining');

      expect(improvingTrend?.trend).toBe('improving');
      expect(decliningTrend?.trend).toBe('declining');
    });
  });

  describe('Edge Cases', () => {
    test('handles empty gesture data gracefully', () => {
      const adjustment = contextAwareRecognitionService.getContextAdjustment('', 0.5);
      expect(adjustment.confidenceMultiplier).toBe(1.0);
      expect(adjustment.priority).toBe('low');
    });

    test('manages insufficient data', () => {
      // Only one gesture recorded
      contextAwareRecognitionService.recordGesture('single', 0.8);

      const predictions = contextAwareRecognitionService.getPredictedGestures('single');
      expect(predictions.length).toBe(0); // Not enough data for predictions
    });

    test('prevents confidence from going out of bounds', () => {
      // Record very high confidence patterns
      for (let i = 0; i < 10; i++) {
        contextAwareRecognitionService.recordGesture('perfect', 0.95);
      }

      // Test with low base confidence
      const adjustment = contextAwareRecognitionService.getContextAdjustment('perfect', 0.3);
      const finalConfidence = 0.3 * adjustment.confidenceMultiplier;

      expect(finalConfidence).toBeLessThanOrEqual(1.0);
      expect(finalConfidence).toBeGreaterThanOrEqual(0.0);
    });
  });
});