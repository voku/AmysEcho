/**
 * Tests for Adaptive Practice Timing Service - Amy First
 *
 * Ensures practice suggestions never interrupt Amy's communication
 * and learn from her natural patterns.
 */

import { adaptivePracticeTimingService } from '../src/services/adaptivePracticeTimingService';

// Mock AsyncStorage for testing
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

describe('AdaptivePracticeTimingService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Reset the singleton instance for each test
    (adaptivePracticeTimingService as any).currentSession = null;
    (adaptivePracticeTimingService as any).recentSessions = [];
    (adaptivePracticeTimingService as any).practiceOpportunities = new Map();
    (adaptivePracticeTimingService as any).lastPracticeSuggestion = 0;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Communication Session Tracking', () => {
    test('starts and tracks communication sessions', () => {
      adaptivePracticeTimingService.startCommunicationSession('high');

      // Record some gestures
      adaptivePracticeTimingService.recordGestureInSession();
      adaptivePracticeTimingService.recordGestureInSession();

      expect((adaptivePracticeTimingService as any).currentSession).toBeDefined();
      expect((adaptivePracticeTimingService as any).currentSession.gesturesCount).toBe(2);
      expect((adaptivePracticeTimingService as any).currentSession.energyLevel).toBe('high');
    });

    test('ends communication sessions and learns patterns', () => {
      adaptivePracticeTimingService.startCommunicationSession();

      // Simulate some activity
      for (let i = 0; i < 5; i++) {
        adaptivePracticeTimingService.recordGestureInSession();
      }

      adaptivePracticeTimingService.endCommunicationSession();

      expect((adaptivePracticeTimingService as any).currentSession).toBeNull();
      expect((adaptivePracticeTimingService as any).recentSessions.length).toBe(1);
      expect((adaptivePracticeTimingService as any).recentSessions[0].gesturesCount).toBe(5);
    });

    test('detects active communication correctly', () => {
      // Start a session
      adaptivePracticeTimingService.startCommunicationSession();
      adaptivePracticeTimingService.recordGestureInSession();

      // Should detect as active communication
      const decision = adaptivePracticeTimingService.shouldSuggestPractice();
      expect(decision.canSuggestPractice).toBe(false);
      expect(decision.reason).toContain('currently communicating');
    });
  });

  describe('Practice Timing Decisions', () => {
    test('prevents practice during active communication', () => {
      adaptivePracticeTimingService.startCommunicationSession();
      adaptivePracticeTimingService.recordGestureInSession();

      const decision = adaptivePracticeTimingService.shouldSuggestPractice();
      expect(decision.canSuggestPractice).toBe(false);
      expect(decision.priority).toBe('high');
    });

    test('respects minimum time between suggestions', () => {
      // Record a practice suggestion
      adaptivePracticeTimingService.recordPracticeSuggestion();

      const decision = adaptivePracticeTimingService.shouldSuggestPractice();
      expect(decision.canSuggestPractice).toBe(false);
      expect(decision.suggestedDelay).toBeDefined();
    });

    test('allows practice when appropriate', () => {
      // End any active session
      adaptivePracticeTimingService.endCommunicationSession();

      // Set last suggestion to be old enough
      (adaptivePracticeTimingService as any).lastPracticeSuggestion = Date.now() - (60 * 60 * 1000); // 1 hour ago

      const decision = adaptivePracticeTimingService.shouldSuggestPractice();
      expect(decision.canSuggestPractice).toBe(true);
    });

    test('learns from communication patterns', () => {
      // Simulate multiple sessions at the same time
      const originalTime = Date.prototype.getHours;
      Date.prototype.getHours = jest.fn(() => 14); // 2 PM - afternoon

      for (let i = 0; i < 3; i++) {
        adaptivePracticeTimingService.startCommunicationSession();
        for (let j = 0; j < 10; j++) {
          adaptivePracticeTimingService.recordGestureInSession();
        }
        // Wait a bit between sessions
        jest.advanceTimersByTime(1000);
        adaptivePracticeTimingService.endCommunicationSession();
      }

      // Check that afternoon is now marked as a busy time
      const insights = adaptivePracticeTimingService.getCommunicationInsights();
      const afternoonPeak = insights.peakCommunicationTimes.find(p => p.timeOfDay === 'afternoon');
      expect(afternoonPeak).toBeDefined();
      expect(afternoonPeak!.averageGestures).toBeGreaterThan(0);

      Date.prototype.getHours = originalTime;
    });
  });

  describe('Session Cleanup', () => {
    test('cleans up stale sessions', () => {
      adaptivePracticeTimingService.startCommunicationSession();
      adaptivePracticeTimingService.recordGestureInSession();

      // Simulate time passing (more than COMMUNICATION_TIMEOUT)
      jest.advanceTimersByTime(6 * 60 * 1000); // 6 minutes

      adaptivePracticeTimingService.cleanupStaleSessions();

      expect((adaptivePracticeTimingService as any).currentSession).toBeNull();
    });
  });

  describe('Communication Insights', () => {
    test('calculates peak communication times', () => {
      // Create sessions at different times
      const times = [
        { hour: 9, gestures: 5 },   // morning
        { hour: 14, gestures: 15 }, // afternoon - peak
        { hour: 19, gestures: 8 }   // evening
      ];

      times.forEach(({ hour, gestures }) => {
        const originalTime = Date.prototype.getHours;
        Date.prototype.getHours = jest.fn(() => hour);

        adaptivePracticeTimingService.startCommunicationSession();
        for (let i = 0; i < gestures; i++) {
          adaptivePracticeTimingService.recordGestureInSession();
        }
        adaptivePracticeTimingService.endCommunicationSession();

        Date.prototype.getHours = originalTime;
      });

      const insights = adaptivePracticeTimingService.getCommunicationInsights();
      expect(insights.peakCommunicationTimes.length).toBeGreaterThan(0);

      // Afternoon should be the peak
      const afternoonPeak = insights.peakCommunicationTimes.find(p => p.timeOfDay === 'afternoon');
      expect(afternoonPeak).toBeDefined();
      expect(afternoonPeak!.averageGestures).toBe(15);
    });

    test('calculates average session duration', () => {
      // Create sessions with different durations
      const durations = [5, 10, 15]; // minutes

      durations.forEach(duration => {
        adaptivePracticeTimingService.startCommunicationSession();
        adaptivePracticeTimingService.recordGestureInSession();

        // Advance time to simulate session duration
        jest.advanceTimersByTime(duration * 60 * 1000); // Convert minutes to milliseconds
        adaptivePracticeTimingService.endCommunicationSession();
      });

      const insights = adaptivePracticeTimingService.getCommunicationInsights();
      expect(Math.round(insights.averageSessionDuration)).toBe(10); // Average of 5, 10, 15
    });

    test('identifies preferred practice times', () => {
      // Simulate learning that mornings are good for practice
      const morningKey = 'morning_1'; // Monday morning
      (adaptivePracticeTimingService as any).practiceOpportunities.set(morningKey, {
        timeOfDay: 'morning',
        dayOfWeek: 1,
        confidence: 0.9,
        reason: 'Good practice time',
        lastSuggested: Date.now() - (24 * 60 * 60 * 1000) // 1 day ago
      });

      const insights = adaptivePracticeTimingService.getCommunicationInsights();
      expect(insights.preferredPracticeTimes.length).toBeGreaterThan(0);
      expect(insights.preferredPracticeTimes[0].timeOfDay).toBe('morning');
    });
  });

  describe('Edge Cases', () => {
    test('handles no communication history', () => {
      const insights = adaptivePracticeTimingService.getCommunicationInsights();
      expect(insights.averageSessionDuration).toBe(0);
      expect(insights.communicationFrequency).toBe(0);
    });

    test('prevents multiple concurrent sessions', () => {
      adaptivePracticeTimingService.startCommunicationSession();
      adaptivePracticeTimingService.startCommunicationSession(); // Should end previous

      expect((adaptivePracticeTimingService as any).recentSessions.length).toBe(1);
    });

    test('handles session end without start', () => {
      expect(() => {
        adaptivePracticeTimingService.endCommunicationSession();
      }).not.toThrow();
    });
  });
});