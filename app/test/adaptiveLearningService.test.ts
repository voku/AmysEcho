// Mock dependencies before importing the service
jest.mock('../db', () => ({
  database: {
    get: jest.fn(),
    write: jest.fn(),
  },
}));

jest.mock('@nozbe/watermelondb', () => ({
  Q: {
    where: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
  },
}));

jest.mock('../src/services/usageTracker', () => ({
  loadUsageStats: jest.fn(),
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
  },
}));

import { database } from '../db';
import { adaptiveLearningService, enhancedAdaptiveLearningService, recordInteraction } from '../src/services/adaptiveLearningService';

const { loadUsageStats } = require('../src/services/usageTracker');

describe('AdaptiveLearningService', () => {
  beforeEach(() => {
    // Clear all performance metrics before each test
    enhancedAdaptiveLearningService['performanceMetrics'].clear();
    enhancedAdaptiveLearningService['learningPaths'].clear();
    enhancedAdaptiveLearningService['practiceSessions'] = [];

    // Reset mocks
    (database.get as jest.Mock).mockReset();
    (database.write as jest.Mock).mockReset();
    (loadUsageStats as jest.Mock).mockReset();
  });

  describe('recordPracticeAttempt', () => {
    it('should record successful practice attempt correctly', () => {
      const gesture = 'hello';
      const success = true;
      const confidence = 0.8;

      adaptiveLearningService.recordPracticeAttempt(gesture, success, confidence);

      const metrics = enhancedAdaptiveLearningService['performanceMetrics'].get(gesture);
      expect(metrics).toBeDefined();
      expect(metrics?.totalAttempts).toBe(1);
      expect(metrics?.successfulAttempts).toBe(1);
      expect(metrics?.averageConfidence).toBe(0.8);
      expect(metrics?.bestConfidence).toBe(0.8);
      expect(metrics?.recentPerformance).toEqual([0.8]);
    });

    it('should record failed practice attempt correctly', () => {
      const gesture = 'hello';
      const success = false;
      const confidence = 0.3;

      adaptiveLearningService.recordPracticeAttempt(gesture, success, confidence);

      const metrics = enhancedAdaptiveLearningService['performanceMetrics'].get(gesture);
      expect(metrics).toBeDefined();
      expect(metrics?.totalAttempts).toBe(1);
      expect(metrics?.successfulAttempts).toBe(0);
      expect(metrics?.averageConfidence).toBe(0.3);
      expect(metrics?.recentPerformance).toEqual([0]);
    });

    it('should update metrics correctly with multiple attempts', () => {
      const gesture = 'hello';

      // First attempt: success
      adaptiveLearningService.recordPracticeAttempt(gesture, true, 0.8);
      // Second attempt: failure
      adaptiveLearningService.recordPracticeAttempt(gesture, false, 0.4);
      // Third attempt: success
      adaptiveLearningService.recordPracticeAttempt(gesture, true, 0.9);

      const metrics = enhancedAdaptiveLearningService['performanceMetrics'].get(gesture);
      expect(metrics?.totalAttempts).toBe(3);
      expect(metrics?.successfulAttempts).toBe(2);
      expect(metrics?.averageConfidence).toBeCloseTo(0.7, 1); // (0.8 + 0.4 + 0.9) / 3
      expect(metrics?.bestConfidence).toBe(0.9);
      expect(metrics?.recentPerformance).toEqual([0.8, 0, 0.9]);
    });

    it('should maintain only last 10 recent performances', () => {
      const gesture = 'hello';

      // Record 12 attempts
      for (let i = 0; i < 12; i++) {
        adaptiveLearningService.recordPracticeAttempt(gesture, true, 0.8);
      }

      const metrics = enhancedAdaptiveLearningService['performanceMetrics'].get(gesture);
      expect(metrics?.recentPerformance.length).toBe(10);
      expect(metrics?.totalAttempts).toBe(12);
    });

    it('should update difficulty level based on performance', () => {
      const gesture = 'hello';

      // Start as beginner
      adaptiveLearningService.recordPracticeAttempt(gesture, true, 0.2);
      let metrics = enhancedAdaptiveLearningService['performanceMetrics'].get(gesture);
      expect(metrics?.difficultyLevel).toBe('beginner');

      // Add more attempts to reach intermediate
      for (let i = 0; i < 15; i++) {
        adaptiveLearningService.recordPracticeAttempt(gesture, true, 0.6);
      }
      metrics = enhancedAdaptiveLearningService['performanceMetrics'].get(gesture);
      expect(metrics?.difficultyLevel).toBe('intermediate');

      // Add more attempts to reach advanced
      for (let i = 0; i < 20; i++) {
        adaptiveLearningService.recordPracticeAttempt(gesture, true, 0.8);
      }
      metrics = enhancedAdaptiveLearningService['performanceMetrics'].get(gesture);
      expect(metrics?.difficultyLevel).toBe('advanced');
    });

    it('should update last practiced timestamp', () => {
      const gesture = 'hello';
      const beforeTime = Date.now();

      adaptiveLearningService.recordPracticeAttempt(gesture, true, 0.8);

      const afterTime = Date.now();
      const metrics = enhancedAdaptiveLearningService['performanceMetrics'].get(gesture);
      expect(metrics?.lastPracticed).toBeGreaterThanOrEqual(beforeTime);
      expect(metrics?.lastPracticed).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('practice session tracking', () => {
    it('should track start and completion of practice sessions', () => {
      const nowSpy = jest.spyOn(Date, 'now');
      nowSpy.mockReturnValueOnce(1_000);
      adaptiveLearningService.startPracticeSession('hello');
      nowSpy.mockReturnValueOnce(1_000 + 60_000);
      adaptiveLearningService.completePracticeSession('hello');

      const sessions = adaptiveLearningService.getPracticeSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        gestureId: 'hello',
        startedAt: 1_000,
        completedAt: 1_000 + 60_000,
        durationMs: 60_000,
      });
      nowSpy.mockRestore();
    });

    it('should trim stored sessions to max limit', () => {
      const nowSpy = jest.spyOn(Date, 'now');
      let current = 5_000;
      nowSpy.mockImplementation(() => current);

      for (let i = 0; i < 45; i++) {
        current += 1_000;
        adaptiveLearningService.startPracticeSession(`gesture-${i}`);
        current += 500;
        adaptiveLearningService.completePracticeSession(`gesture-${i}`);
      }

      const sessions = adaptiveLearningService.getPracticeSessions();
      expect(sessions.length).toBeLessThanOrEqual(40);
      expect(sessions[0].gestureId).toBe('gesture-5');
      nowSpy.mockRestore();
    });

    it('should not persist a completion when no session was started', () => {
      const nowSpy = jest.spyOn(Date, 'now');
      nowSpy.mockReturnValueOnce(10_000);

      const completed = adaptiveLearningService.completePracticeSession('ghost');
      expect(completed.durationMs).toBe(0);
      expect(adaptiveLearningService.getPracticeSessions()).toHaveLength(0);

      nowSpy.mockRestore();
    });

    it('should suggest a break after multiple recent sessions', () => {
      const nowSpy = jest.spyOn(Date, 'now');
      const base = 1_000_000;
      let current = base;
      nowSpy.mockImplementation(() => current);

      const createSession = (gesture: string, startOffsetMinutes: number) => {
        current = base + startOffsetMinutes * 60_000;
        adaptiveLearningService.startPracticeSession(gesture);
        current += 3 * 60_000;
        adaptiveLearningService.completePracticeSession(gesture);
      };

      createSession('one', 0);
      createSession('two', 7);
      createSession('three', 15);

      current = base + 15 * 60_000 + (3 * 60_000) + 60_000;
      expect(adaptiveLearningService.shouldSuggestBreak()).toBe(true);

      nowSpy.mockRestore();
    });

    it('should not suggest a break when sessions are spread out', () => {
      const nowSpy = jest.spyOn(Date, 'now');
      const base = 2_000_000;
      let current = base;
      nowSpy.mockImplementation(() => current);

      adaptiveLearningService.startPracticeSession('one');
      current += 60_000;
      adaptiveLearningService.completePracticeSession('one');

      current = base + 2 * 60 * 60 * 1000;
      adaptiveLearningService.startPracticeSession('two');
      current += 60_000;
      adaptiveLearningService.completePracticeSession('two');

      expect(adaptiveLearningService.shouldSuggestBreak()).toBe(false);

      nowSpy.mockRestore();
    });
  });

  describe('getAdaptiveRecommendations', () => {
    beforeEach(() => {
      // Set up some test data
      enhancedAdaptiveLearningService.recordPracticeAttempt('struggling_gesture', false, 0.3);
      enhancedAdaptiveLearningService.recordPracticeAttempt('struggling_gesture', false, 0.2);
      enhancedAdaptiveLearningService.recordPracticeAttempt('struggling_gesture', false, 0.4);
      enhancedAdaptiveLearningService.recordPracticeAttempt('struggling_gesture', false, 0.3);
      enhancedAdaptiveLearningService.recordPracticeAttempt('struggling_gesture', false, 0.2);

      enhancedAdaptiveLearningService.recordPracticeAttempt('good_gesture', true, 0.8);
      for (let i = 0; i < 15; i++) {
        enhancedAdaptiveLearningService.recordPracticeAttempt('good_gesture', true, 0.8);
      }

      // Set last practiced to more than a day ago for review
      const metrics = enhancedAdaptiveLearningService['performanceMetrics'].get('good_gesture');
      if (metrics) {
        metrics.lastPracticed = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
      }
    });

    it('should recommend practicing struggling gestures with high priority', () => {
      const recommendations = adaptiveLearningService.getAdaptiveRecommendations();

      const strugglingRec = recommendations.find(r => r.gesture === 'struggling_gesture');
      expect(strugglingRec).toBeDefined();
      expect(strugglingRec?.type).toBe('practice');
      expect(strugglingRec?.priority).toBe('high');
      expect(strugglingRec?.reason).toContain('struggling_gesture');
    });

    it('should recommend reviewing well-learned gestures', () => {
      const recommendations = adaptiveLearningService.getAdaptiveRecommendations();

      const reviewRec = recommendations.find(r => r.type === 'review');
      expect(reviewRec).toBeDefined();
      expect(reviewRec?.gesture).toBe('good_gesture');
      expect(reviewRec?.priority).toBe('medium');
    });

    it('should recommend challenges for advanced gestures', () => {
      const recommendations = adaptiveLearningService.getAdaptiveRecommendations();

      const challengeRec = recommendations.find(r => r.type === 'challenge');
      expect(challengeRec).toBeDefined();
      expect(challengeRec?.gesture).toBe('good_gesture');
      expect(challengeRec?.priority).toBe('medium');
    });

    it('should respect available time limit', () => {
      const recommendations = adaptiveLearningService.getAdaptiveRecommendations([], 2);

      // All recommendations should have estimated time <= 2 minutes
      recommendations.forEach(rec => {
        expect(rec.estimatedTime).toBeLessThanOrEqual(2);
      });
    });

    it('should sort recommendations by priority and confidence', () => {
      const recommendations = adaptiveLearningService.getAdaptiveRecommendations();

      // Check that recommendations are sorted by priority weight
      for (let i = 0; i < recommendations.length - 1; i++) {
        const currentWeight = enhancedAdaptiveLearningService['getPriorityWeight'](recommendations[i]);
        const nextWeight = enhancedAdaptiveLearningService['getPriorityWeight'](recommendations[i + 1]);
        expect(currentWeight).toBeGreaterThanOrEqual(nextWeight);
      }
    });
  });

  describe('getLearningProgress', () => {
    it('should return correct learning progress summary', () => {
      // Add some test data
      enhancedAdaptiveLearningService.recordPracticeAttempt('gesture1', true, 0.8);
      enhancedAdaptiveLearningService.recordPracticeAttempt('gesture1', true, 0.9);
      enhancedAdaptiveLearningService.recordPracticeAttempt('gesture2', true, 0.95);
      for (let i = 0; i < 60; i++) {
        enhancedAdaptiveLearningService.recordPracticeAttempt('gesture2', true, 0.95);
      }

      const progress = adaptiveLearningService.getLearningProgress();

      expect(progress.totalGesturesPracticed).toBe(2);
      expect(progress.masteredGestures).toBe(1); // gesture2 should be master
      expect(progress.averageConfidence).toBeGreaterThan(0);
      expect(progress.activePaths).toBeDefined();
      expect(progress.totalPracticeSessions).toBe(0);
      expect(progress.averageSessionDuration).toBe(0);
      expect(progress.recentPracticeSessions).toEqual([]);
    });

    it('should handle empty performance metrics', () => {
      const progress = adaptiveLearningService.getLearningProgress();

      expect(progress.totalGesturesPracticed).toBe(0);
      expect(progress.masteredGestures).toBe(0);
      expect(progress.averageConfidence).toBe(0);
      expect(progress.learningRate).toBe(0);
      expect(progress.totalPracticeSessions).toBe(0);
      expect(progress.averageSessionDuration).toBe(0);
      expect(progress.recentPracticeSessions).toEqual([]);
    });

    it('should report recent practice sessions ordered by completion time', () => {
      const nowSpy = jest.spyOn(Date, 'now');
      let current = 100_000;
      nowSpy.mockImplementation(() => current);

      adaptiveLearningService.startPracticeSession('first');
      current += 1_000;
      adaptiveLearningService.startPracticeSession('second');
      current += 2_000;
      adaptiveLearningService.completePracticeSession('second');
      current += 2_000;
      adaptiveLearningService.completePracticeSession('first');

      const progress = adaptiveLearningService.getLearningProgress();
      expect(progress.recentPracticeSessions).toHaveLength(2);
      expect(progress.recentPracticeSessions[0].gestureId).toBe('first');
      expect(progress.recentPracticeSessions[1].gestureId).toBe('second');

      nowSpy.mockRestore();
    });
  });

  describe('Legacy Methods', () => {
    describe('getSuggestions', () => {
      it('should return suggestions based on usage stats', async () => {
        const mockVocabulary = [
          { id: 'gesture1', name: 'Gesture 1' },
          { id: 'gesture2', name: 'Gesture 2' },
          { id: 'gesture3', name: 'Gesture 3' },
        ];

        const mockUsageStats = {
          gesture2: 10,
          gesture1: 5,
          gesture3: 1,
        };

        (loadUsageStats as jest.Mock).mockResolvedValue(mockUsageStats);

        const suggestions = await adaptiveLearningService.getSuggestions(mockVocabulary, 'profile1');

        expect(suggestions).toHaveLength(3);
        expect(suggestions[0].id).toBe('gesture2'); // Most used
        expect(suggestions[1].id).toBe('gesture1'); // Second most used
        expect(suggestions[2].id).toBe('gesture3'); // Least used
      });

      it('should handle errors gracefully', async () => {
        (loadUsageStats as jest.Mock).mockRejectedValue(new Error('Database error'));

        const suggestions = await adaptiveLearningService.getSuggestions([], 'profile1');

        expect(suggestions).toEqual([]);
      });
    });

    describe('getWeakGesture', () => {
      it('should return gesture with health score below threshold', async () => {
        const mockGesture = {
          id: 'weak_gesture',
          healthScore: 50,
          minConfidenceThreshold: 0.5,
        };

        const mockFetch = jest.fn().mockResolvedValue([mockGesture]);
        const mockQueryResult = { fetch: mockFetch };
        const mockQuery = jest.fn().mockReturnValue(mockQueryResult);

        (database.get as jest.Mock).mockReturnValue({ query: mockQuery });

        const result = await adaptiveLearningService.getWeakGesture(70);

        expect(result).toEqual(mockGesture);
        expect(database.get).toHaveBeenCalledWith('gesture_definitions');
        expect(mockQuery).toHaveBeenCalled();
        expect(mockFetch).toHaveBeenCalled();
      });

      it('should return null when no weak gestures found', async () => {
        const mockQuery = jest.fn().mockReturnValue({
          fetch: jest.fn().mockResolvedValue([]),
        });

        (database.get as jest.Mock).mockReturnValue({
          query: mockQuery,
        });

        const result = await adaptiveLearningService.getWeakGesture(70);

        expect(result).toBeNull();
      });

      it('should handle database errors gracefully', async () => {
        (database.get as jest.Mock).mockImplementation(() => {
          throw new Error('Database error');
        });

        const result = await adaptiveLearningService.getWeakGesture(70);

        expect(result).toBeNull();
      });
    });

    describe('recordInteraction', () => {
      it('should update gesture health score on success', async () => {
        const mockGesture = {
          id: 'test_gesture',
          healthScore: 50,
          minConfidenceThreshold: 0.5,
          update: jest.fn().mockResolvedValue(undefined),
        };

        (database.get as jest.Mock).mockReturnValue({ find: jest.fn().mockResolvedValue(mockGesture) });
        (database.write as jest.Mock).mockImplementation(async (callback) => await callback());

        const result = await recordInteraction('test_gesture', true);

        expect(result).toBe(true);
        expect(mockGesture.update).toHaveBeenCalled();
        expect(database.write).toHaveBeenCalled();
      });

      it('should update gesture health score on failure', async () => {
        const mockGesture = {
          id: 'test_gesture',
          healthScore: 50,
          minConfidenceThreshold: 0.5,
          update: jest.fn().mockResolvedValue(undefined),
        };

        (database.get as jest.Mock).mockReturnValue({ find: jest.fn().mockResolvedValue(mockGesture) });
        (database.write as jest.Mock).mockImplementation(async (callback) => await callback());

        const result = await recordInteraction('test_gesture', false);

        expect(result).toBe(true);
        expect(mockGesture.update).toHaveBeenCalled();
        expect(database.write).toHaveBeenCalled();
      });

      it('should handle database errors gracefully', async () => {
        (database.write as jest.Mock).mockImplementation(() => {
          throw new Error('Database error');
        });

        const result = await recordInteraction('test_gesture', true);

        expect(result).toBe(false);
      });
    });
  });

  describe('Private Methods', () => {
    describe('calculateDifficultyLevel', () => {
      it('should return master for high performance', () => {
        const metrics = {
          gesture: 'test',
          totalAttempts: 60,
          successfulAttempts: 55,
          averageConfidence: 0.95,
          bestConfidence: 0.98,
          recentPerformance: [],
          learningRate: 0.1,
          timeToMastery: 0,
          difficultyLevel: 'beginner' as const,
          lastPracticed: Date.now(),
          masteryThreshold: 0.8,
        };

        const result = enhancedAdaptiveLearningService['calculateDifficultyLevel'](metrics);
        expect(result).toBe('master');
      });

      it('should return advanced for good performance', () => {
        const metrics = {
          gesture: 'test',
          totalAttempts: 30,
          successfulAttempts: 25,
          averageConfidence: 0.8,
          bestConfidence: 0.85,
          recentPerformance: [],
          learningRate: 0.05,
          timeToMastery: 10,
          difficultyLevel: 'beginner' as const,
          lastPracticed: Date.now(),
          masteryThreshold: 0.8,
        };

        const result = enhancedAdaptiveLearningService['calculateDifficultyLevel'](metrics);
        expect(result).toBe('advanced');
      });

      it('should return intermediate for moderate performance', () => {
        const metrics = {
          gesture: 'test',
          totalAttempts: 15,
          successfulAttempts: 10,
          averageConfidence: 0.5,
          bestConfidence: 0.6,
          recentPerformance: [],
          learningRate: 0.02,
          timeToMastery: 20,
          difficultyLevel: 'beginner' as const,
          lastPracticed: Date.now(),
          masteryThreshold: 0.8,
        };

        const result = enhancedAdaptiveLearningService['calculateDifficultyLevel'](metrics);
        expect(result).toBe('intermediate');
      });

      it('should return beginner for low performance', () => {
        const metrics = {
          gesture: 'test',
          totalAttempts: 5,
          successfulAttempts: 2,
          averageConfidence: 0.3,
          bestConfidence: 0.4,
          recentPerformance: [],
          learningRate: 0,
          timeToMastery: 50,
          difficultyLevel: 'beginner' as const,
          lastPracticed: Date.now(),
          masteryThreshold: 0.8,
        };

        const result = enhancedAdaptiveLearningService['calculateDifficultyLevel'](metrics);
        expect(result).toBe('beginner');
      });
    });

    describe('estimateTimeToMastery', () => {
      it('should return 0 for already mastered gestures', () => {
        const metrics = {
          gesture: 'test',
          totalAttempts: 50,
          successfulAttempts: 45,
          averageConfidence: 0.9,
          bestConfidence: 0.95,
          recentPerformance: [],
          learningRate: 0.1,
          timeToMastery: 0,
          difficultyLevel: 'master' as const,
          lastPracticed: Date.now(),
          masteryThreshold: 0.8,
        };

        const result = enhancedAdaptiveLearningService['estimateTimeToMastery'](metrics);
        expect(result).toBe(0);
      });

      it('should estimate time based on learning rate', () => {
        const metrics = {
          gesture: 'test',
          totalAttempts: 20,
          successfulAttempts: 10,
          averageConfidence: 0.5,
          bestConfidence: 0.6,
          recentPerformance: [],
          learningRate: 0.1,
          timeToMastery: 30,
          difficultyLevel: 'intermediate' as const,
          lastPracticed: Date.now(),
          masteryThreshold: 0.8,
        };

        const result = enhancedAdaptiveLearningService['estimateTimeToMastery'](metrics);
        expect(result).toBeGreaterThan(0);
        expect(result).toBeLessThanOrEqual(100);
      });
    });

    describe('getStrugglingGestures', () => {
      it('should return gestures with low success rate', () => {
        enhancedAdaptiveLearningService.recordPracticeAttempt('struggling1', false, 0.3);
        enhancedAdaptiveLearningService.recordPracticeAttempt('struggling1', false, 0.2);
        enhancedAdaptiveLearningService.recordPracticeAttempt('struggling1', false, 0.4);
        enhancedAdaptiveLearningService.recordPracticeAttempt('struggling1', false, 0.3);
        enhancedAdaptiveLearningService.recordPracticeAttempt('struggling1', false, 0.2);

        enhancedAdaptiveLearningService.recordPracticeAttempt('good_gesture', true, 0.8);
        enhancedAdaptiveLearningService.recordPracticeAttempt('good_gesture', true, 0.9);

        const struggling = enhancedAdaptiveLearningService['getStrugglingGestures']();
        expect(struggling).toContain('struggling1');
        expect(struggling).not.toContain('good_gesture');
      });

      it('should sort struggling gestures by success rate', () => {
        // Create two struggling gestures with different success rates
        enhancedAdaptiveLearningService.recordPracticeAttempt('very_struggling', false, 0.1);
        enhancedAdaptiveLearningService.recordPracticeAttempt('very_struggling', false, 0.1);
        enhancedAdaptiveLearningService.recordPracticeAttempt('very_struggling', false, 0.1);
        enhancedAdaptiveLearningService.recordPracticeAttempt('very_struggling', false, 0.1);
        enhancedAdaptiveLearningService.recordPracticeAttempt('very_struggling', false, 0.1);

        enhancedAdaptiveLearningService.recordPracticeAttempt('less_struggling', false, 0.4);
        enhancedAdaptiveLearningService.recordPracticeAttempt('less_struggling', false, 0.4);
        enhancedAdaptiveLearningService.recordPracticeAttempt('less_struggling', true, 0.6);
        enhancedAdaptiveLearningService.recordPracticeAttempt('less_struggling', false, 0.4);
        enhancedAdaptiveLearningService.recordPracticeAttempt('less_struggling', false, 0.4);

        const struggling = enhancedAdaptiveLearningService['getStrugglingGestures']();
        expect(struggling[0]).toBe('very_struggling'); // Worse success rate
        expect(struggling[1]).toBe('less_struggling'); // Better success rate
      });
    });

    describe('getReviewCandidates', () => {
      it('should return gestures that need review', () => {
        // Create a gesture that was practiced long ago but is well learned
        enhancedAdaptiveLearningService.recordPracticeAttempt('needs_review', true, 0.8);
        for (let i = 0; i < 15; i++) {
          enhancedAdaptiveLearningService.recordPracticeAttempt('needs_review', true, 0.8);
        }

        // Set last practiced to more than a day ago
        const metrics = enhancedAdaptiveLearningService['performanceMetrics'].get('needs_review');
        if (metrics) {
          metrics.lastPracticed = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
        }

        const reviewCandidates = enhancedAdaptiveLearningService['getReviewCandidates']();
        expect(reviewCandidates).toContain('needs_review');
      });

      it('should not return recently practiced gestures', () => {
        enhancedAdaptiveLearningService.recordPracticeAttempt('recent_gesture', true, 0.8);
        for (let i = 0; i < 15; i++) {
          enhancedAdaptiveLearningService.recordPracticeAttempt('recent_gesture', true, 0.8);
        }

        // Last practiced is recent (default)
        const reviewCandidates = enhancedAdaptiveLearningService['getReviewCandidates']();
        expect(reviewCandidates).not.toContain('recent_gesture');
      });
    });

    describe('getChallengeCandidates', () => {
      it('should return well-performing gestures that are not master level', () => {
        // Create a well-performing gesture that's not master
        enhancedAdaptiveLearningService.recordPracticeAttempt('challenge_ready', true, 0.8);
        for (let i = 0; i < 25; i++) {
          enhancedAdaptiveLearningService.recordPracticeAttempt('challenge_ready', true, 0.8);
        }

        // Create a master level gesture
        enhancedAdaptiveLearningService.recordPracticeAttempt('already_master', true, 0.95);
        for (let i = 0; i < 60; i++) {
          enhancedAdaptiveLearningService.recordPracticeAttempt('already_master', true, 0.95);
        }

        const challengeCandidates = enhancedAdaptiveLearningService['getChallengeCandidates']();
        expect(challengeCandidates).toContain('challenge_ready');
        expect(challengeCandidates).not.toContain('already_master');
      });
    });

  });
});