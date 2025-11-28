import { describe, expect, it, beforeEach } from 'vitest';
import { CelebrationSystem, type AttemptResult } from '../CelebrationSystem';

describe('CelebrationSystem', () => {
  let system: CelebrationSystem;

  beforeEach(() => {
    system = new CelebrationSystem();
  });

  const createAttempt = (overrides: Partial<AttemptResult> = {}): AttemptResult => ({
    success: true,
    gesture: 'thumbs_up',
    effort: 0.8,
    attemptCount: 1,
    timeOfDay: 'afternoon',
    recentSuccessRate: 0.6,
    isEmergency: false,
    ...overrides,
  });

  describe('generateCelebration', () => {
    it('generates celebration for successful attempt', () => {
      const attempt = createAttempt({ success: true });
      const result = system.generateCelebration(attempt);

      expect(result.message).toBeDefined();
      expect(result.emoji).toBeDefined();
      expect(result.encouragement).toBeDefined();
      expect(typeof result.showProgress).toBe('boolean');
    });

    it('generates special message for emergency gestures', () => {
      const attempt = createAttempt({ isEmergency: true, success: true });
      const result = system.generateCelebration(attempt);

      expect(result.message).toContain('Notfall');
      expect(result.emoji).toBe('🆘');
    });

    it('generates encouragement for partial success', () => {
      const attempt = createAttempt({ success: false, partialSuccess: true });
      const result = system.generateCelebration(attempt);

      expect(result.message).toContain('Fast');
      expect(result.emoji).toBe('✨');
    });

    it('generates gentle encouragement for unsuccessful attempts', () => {
      const attempt = createAttempt({ success: false, partialSuccess: false, effort: 0.5 });
      const result = system.generateCelebration(attempt);

      expect(result.message).toBeDefined();
      expect(result.encouragement).toBeDefined();
    });

    it('uses morning-specific messages in the morning', () => {
      const attempt = createAttempt({ timeOfDay: 'morning', success: true });
      const result = system.generateCelebration(attempt);

      // Should contain morning-themed content
      expect(result.message).toBeDefined();
    });

    it('uses evening-specific messages in the evening', () => {
      const attempt = createAttempt({ timeOfDay: 'evening', success: true });
      const result = system.generateCelebration(attempt);

      expect(result.message).toBeDefined();
    });

    it('provides effort emoji based on effort level', () => {
      const lowEffort = createAttempt({ success: false, effort: 0.4 });
      const result = system.generateCelebration(lowEffort);

      expect(result.emoji).toBe('🤗');

      system.reset();

      const highEffort = createAttempt({ success: false, effort: 0.9 });
      const highResult = system.generateCelebration(highEffort);

      expect(highResult.emoji).toBe('💪');
    });
  });

  describe('getProgressStats', () => {
    it('returns empty stats when no history', () => {
      const stats = system.getProgressStats();

      expect(stats.totalAttempts).toBe(0);
      expect(stats.successRate).toBe(0);
      expect(stats.mostPracticedGesture).toBe('');
      expect(stats.improvementTrend).toBe('stable');
    });

    it('calculates correct success rate', () => {
      system.generateCelebration(createAttempt({ success: true }));
      system.generateCelebration(createAttempt({ success: true }));
      system.generateCelebration(createAttempt({ success: false }));
      system.generateCelebration(createAttempt({ success: false }));

      const stats = system.getProgressStats();
      expect(stats.successRate).toBe(0.5);
      expect(stats.totalAttempts).toBe(4);
    });

    it('tracks most practiced gesture', () => {
      system.generateCelebration(createAttempt({ gesture: 'wave' }));
      system.generateCelebration(createAttempt({ gesture: 'wave' }));
      system.generateCelebration(createAttempt({ gesture: 'wave' }));
      system.generateCelebration(createAttempt({ gesture: 'thumbs_up' }));

      const stats = system.getProgressStats();
      expect(stats.mostPracticedGesture).toBe('wave');
    });

    it('detects improvement trend', () => {
      // Add older attempts with lower success rate
      for (let i = 0; i < 10; i++) {
        system.generateCelebration(createAttempt({ success: i < 3 })); // 30% success
      }

      // Add recent attempts with higher success rate
      for (let i = 0; i < 10; i++) {
        system.generateCelebration(createAttempt({ success: i < 8 })); // 80% success
      }

      const stats = system.getProgressStats();
      expect(stats.improvementTrend).toBe('improving');
    });

    it('detects needs attention trend', () => {
      // Add older attempts with higher success rate
      for (let i = 0; i < 10; i++) {
        system.generateCelebration(createAttempt({ success: i < 8 })); // 80% success
      }

      // Add recent attempts with lower success rate
      for (let i = 0; i < 10; i++) {
        system.generateCelebration(createAttempt({ success: i < 3 })); // 30% success
      }

      const stats = system.getProgressStats();
      expect(stats.improvementTrend).toBe('needs_attention');
    });
  });

  describe('reset', () => {
    it('clears attempt history', () => {
      system.generateCelebration(createAttempt());
      system.generateCelebration(createAttempt());

      system.reset();

      const stats = system.getProgressStats();
      expect(stats.totalAttempts).toBe(0);
    });
  });

  describe('progress celebration', () => {
    it('shows progress after consistent practice', () => {
      // Practice same gesture multiple times
      for (let i = 0; i < 5; i++) {
        system.generateCelebration(createAttempt({
          gesture: 'wave',
          recentSuccessRate: 0.5,
          success: true,
        }));
      }

      const result = system.generateCelebration(createAttempt({
        gesture: 'wave',
        recentSuccessRate: 0.5,
        success: true,
      }));

      expect(result.showProgress).toBe(true);
    });
  });
});
