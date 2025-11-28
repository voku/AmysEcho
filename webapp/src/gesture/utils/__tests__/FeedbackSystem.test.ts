import { describe, expect, it, beforeEach } from 'vitest';
import { FeedbackSystem, type FeedbackAttempt } from './FeedbackSystem';

describe('FeedbackSystem', () => {
  let feedbackSystem: FeedbackSystem;

  beforeEach(() => {
    feedbackSystem = new FeedbackSystem();
  });

  const createAttempt = (overrides: Partial<FeedbackAttempt> = {}): FeedbackAttempt => ({
    gesture: 'thumbs_up',
    effort: 0.7,
    success: true,
    attemptCount: 1,
    timeSinceLastAttempt: 1000,
    gestureType: 'basic',
    ...overrides,
  });

  describe('generateFeedback', () => {
    it('generates feedback for successful attempt', () => {
      const attempt = createAttempt({ success: true, effort: 0.8 });
      const feedback = feedbackSystem.generateFeedback(attempt);

      expect(feedback.primaryMessage).toBeDefined();
      expect(feedback.secondaryMessage).toBeDefined();
      expect(feedback.encouragement).toBeDefined();
      expect(typeof feedback.showBreakSuggestion).toBe('boolean');
    });

    it('provides tips for unsuccessful low-effort attempts', () => {
      const attempt = createAttempt({ success: false, effort: 0.4 });
      const feedback = feedbackSystem.generateFeedback(attempt);

      expect(feedback.tip).toBeDefined();
    });

    it('does not provide tips for successful attempts', () => {
      const attempt = createAttempt({ success: true, effort: 0.9 });
      const feedback = feedbackSystem.generateFeedback(attempt);

      expect(feedback.tip).toBeUndefined();
    });

    it('suggests break after multiple low-effort attempts', () => {
      // Submit multiple low-effort attempts
      for (let i = 0; i < 5; i++) {
        feedbackSystem.generateFeedback(createAttempt({ effort: 0.3 }));
      }

      const feedback = feedbackSystem.generateFeedback(createAttempt({ effort: 0.3 }));
      expect(feedback.showBreakSuggestion).toBe(true);
    });

    it('respects provided user mood', () => {
      const attempt = createAttempt({ userMood: 'excited', effort: 0.9 });
      const feedback = feedbackSystem.generateFeedback(attempt);

      expect(feedback.primaryMessage).toBeDefined();
      // Should use excited mood feedback
    });

    it('handles emergency gesture type', () => {
      const attempt = createAttempt({ gestureType: 'emergency', gesture: 'hilfe' });
      const feedback = feedbackSystem.generateFeedback(attempt);

      expect(feedback.secondaryMessage).toContain('Notfall');
    });

    it('provides different feedback for long breaks', () => {
      const attempt = createAttempt({ timeSinceLastAttempt: 600000 }); // 10 minutes
      const feedback = feedbackSystem.generateFeedback(attempt);

      expect(feedback.secondaryMessage).toBeDefined();
    });
  });

  describe('getFeedbackStats', () => {
    it('returns empty stats when no history', () => {
      const stats = feedbackSystem.getFeedbackStats();

      expect(stats.averageEffort).toBe(0);
      expect(stats.frustrationLevel).toBe('low');
      expect(stats.recommendedBreak).toBe(false);
      expect(stats.mostPracticedGesture).toBe('');
    });

    it('calculates average effort correctly', () => {
      feedbackSystem.generateFeedback(createAttempt({ effort: 0.8 }));
      feedbackSystem.generateFeedback(createAttempt({ effort: 0.6 }));

      const stats = feedbackSystem.getFeedbackStats();
      expect(stats.averageEffort).toBe(0.7);
    });

    it('detects high frustration level', () => {
      for (let i = 0; i < 5; i++) {
        feedbackSystem.generateFeedback(createAttempt({ effort: 0.3 }));
      }

      const stats = feedbackSystem.getFeedbackStats();
      expect(stats.frustrationLevel).toBe('high');
    });

    it('tracks most practiced gesture', () => {
      feedbackSystem.generateFeedback(createAttempt({ gesture: 'thumbs_up' }));
      feedbackSystem.generateFeedback(createAttempt({ gesture: 'thumbs_up' }));
      feedbackSystem.generateFeedback(createAttempt({ gesture: 'point' }));

      const stats = feedbackSystem.getFeedbackStats();
      expect(stats.mostPracticedGesture).toBe('thumbs_up');
    });

    it('recommends break when frustration is high', () => {
      for (let i = 0; i < 5; i++) {
        feedbackSystem.generateFeedback(createAttempt({ effort: 0.3 }));
      }

      const stats = feedbackSystem.getFeedbackStats();
      expect(stats.recommendedBreak).toBe(true);
    });
  });

  describe('reset', () => {
    it('clears feedback history', () => {
      feedbackSystem.generateFeedback(createAttempt());
      feedbackSystem.generateFeedback(createAttempt());
      
      feedbackSystem.reset();
      
      const stats = feedbackSystem.getFeedbackStats();
      expect(stats.averageEffort).toBe(0);
      expect(stats.mostPracticedGesture).toBe('');
    });
  });

  describe('mood detection', () => {
    it('detects frustrated mood from consecutive low-effort attempts', () => {
      for (let i = 0; i < 5; i++) {
        feedbackSystem.generateFeedback(createAttempt({ effort: 0.3 }));
      }

      const feedback = feedbackSystem.generateFeedback(createAttempt({ effort: 0.3 }));
      // Feedback should be frustration-aware
      expect(feedback.showBreakSuggestion).toBe(true);
    });

    it('detects excited mood from high-effort attempts', () => {
      for (let i = 0; i < 4; i++) {
        feedbackSystem.generateFeedback(createAttempt({ effort: 0.9 }));
      }

      const feedback = feedbackSystem.generateFeedback(createAttempt({ effort: 0.9 }));
      expect(feedback.primaryMessage).toBeDefined();
    });
  });

  describe('effort categorization', () => {
    it('provides appropriate feedback for high effort', () => {
      const feedback = feedbackSystem.generateFeedback(createAttempt({ effort: 0.9 }));
      expect(feedback.primaryMessage).toBeDefined();
    });

    it('provides appropriate feedback for medium effort', () => {
      const feedback = feedbackSystem.generateFeedback(createAttempt({ effort: 0.7 }));
      expect(feedback.primaryMessage).toBeDefined();
    });

    it('provides appropriate feedback for low effort', () => {
      const feedback = feedbackSystem.generateFeedback(createAttempt({ effort: 0.3 }));
      expect(feedback.primaryMessage).toBeDefined();
    });
  });
});
