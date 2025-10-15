import { database } from '../../db';
import { GestureDefinition } from '../../db/models';
import { loadUsageStats } from './usageTracker';
import { Q } from '@nozbe/watermelondb';
import { logger } from '../utils/logger';

// Enhanced interfaces for adaptive learning
export interface PerformanceMetrics {
  gesture: string;
  totalAttempts: number;
  successfulAttempts: number;
  averageConfidence: number;
  bestConfidence: number;
  recentPerformance: number[];
  learningRate: number;
  timeToMastery: number;
  difficultyLevel: 'beginner' | 'intermediate' | 'advanced' | 'master';
  lastPracticed: number;
  masteryThreshold: number;
}

export interface LearningPath {
  id: string;
  name: string;
  description: string;
  targetGestures: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedDuration: number;
  prerequisites: string[];
  progress: number;
  currentStage: number;
  totalStages: number;
  isActive: boolean;
  createdAt: number;
  completedAt?: number;
}

export interface AdaptiveRecommendation {
  type: 'practice' | 'review' | 'challenge';
  gesture?: string;
  reason: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  estimatedTime: number;
  expectedDifficulty: 'easy' | 'medium' | 'hard';
  confidence: number;
}

export interface PracticeSession {
  gestureId: string | null;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
}

export interface LearningProgressSummary {
  totalGesturesPracticed: number;
  masteredGestures: number;
  averageConfidence: number;
  learningRate: number;
  activePaths: LearningPath[];
  totalPracticeSessions: number;
  averageSessionDuration: number;
  recentPracticeSessions: PracticeSession[];
}

// Enhanced Adaptive Learning Service
class EnhancedAdaptiveLearningService {
  private performanceMetrics: Map<string, PerformanceMetrics> = new Map();
  private learningPaths: Map<string, LearningPath> = new Map();
  private practiceSessions: PracticeSession[] = [];

  // Difficulty thresholds
  private readonly DIFFICULTY_THRESHOLDS = {
    beginner: { minConfidence: 0, maxConfidence: 0.4, minAttempts: 0 },
    intermediate: { minConfidence: 0.4, maxConfidence: 0.7, minAttempts: 10 },
    advanced: { minConfidence: 0.7, maxConfidence: 0.9, minAttempts: 25 },
    master: { minConfidence: 0.9, maxConfidence: 1.0, minAttempts: 50 }
  };

  private readonly MAX_SESSIONS = 40;
  private readonly BREAK_SESSION_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
  private readonly BREAK_RECENT_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
  private readonly MIN_RECENT_SESSIONS_FOR_BREAK = 3;
  private readonly MIN_RECENT_DURATION_MS = 5 * 60 * 1000; // 5 minutes total

  // Learning path templates
  private readonly LEARNING_PATH_TEMPLATES = {
    basic_communication: {
      name: 'Basic Communication',
      description: 'Essential gestures for daily communication',
      targetGestures: ['hello', 'thank_you', 'please', 'yes', 'no'],
      difficulty: 'easy' as const,
      estimatedDuration: 15,
      prerequisites: []
    },
    emotional_expression: {
      name: 'Emotional Expression',
      description: 'Express feelings and emotions',
      targetGestures: ['happy', 'sad', 'angry', 'surprised', 'excited'],
      difficulty: 'medium' as const,
      estimatedDuration: 20,
      prerequisites: ['yes', 'no']
    },
    daily_activities: {
      name: 'Daily Activities',
      description: 'Gestures for daily routines and activities',
      targetGestures: ['eat', 'drink', 'sleep', 'play', 'bathroom'],
      difficulty: 'medium' as const,
      estimatedDuration: 25,
      prerequisites: ['please', 'thank_you']
    },
    advanced_communication: {
      name: 'Advanced Communication',
      description: 'Complex communication and social gestures',
      targetGestures: ['sorry', 'excuse_me', 'wait', 'finished', 'more'],
      difficulty: 'hard' as const,
      estimatedDuration: 30,
      prerequisites: ['hello', 'thank_you', 'please']
    }
  };

  /**
   * Record a practice attempt for adaptive learning
   */
  recordPracticeAttempt(
    gesture: string,
    success: boolean,
    confidence: number
  ): void {
    const metrics = this.getOrCreateMetrics(gesture);

    metrics.totalAttempts++;
    if (success) {
      metrics.successfulAttempts++;
    }

    // Update recent performance (keep last 10 attempts)
    metrics.recentPerformance.push(success ? confidence : 0);
    if (metrics.recentPerformance.length > 10) {
      metrics.recentPerformance.shift();
    }

    // Update average confidence
    const totalConfidence = metrics.averageConfidence * (metrics.totalAttempts - 1) + confidence;
    metrics.averageConfidence = totalConfidence / metrics.totalAttempts;

    // Update best confidence
    metrics.bestConfidence = Math.max(metrics.bestConfidence, confidence);

    // Update difficulty level
    metrics.difficultyLevel = this.calculateDifficultyLevel(metrics);

    // Update learning rate (simplified)
    if (metrics.totalAttempts > 5) {
      const recentTotal = metrics.recentPerformance.reduce((a, b) => a + b, 0);
      const recentAvg = metrics.recentPerformance.length > 0
        ? recentTotal / metrics.recentPerformance.length
        : 0;
      const olderAvg = metrics.averageConfidence;
      metrics.learningRate = recentAvg - olderAvg;
    }

    // Estimate time to mastery
    metrics.timeToMastery = this.estimateTimeToMastery(metrics);

    metrics.lastPracticed = Date.now();

    this.performanceMetrics.set(gesture, metrics);
  }

  startPracticeSession(gestureId: string | null = null): PracticeSession {
    const startedAt = Date.now();
    const session: PracticeSession = {
      gestureId,
      startedAt,
    };
    this.practiceSessions.push(session);
    this.trimPracticeSessions();
    return session;
  }

  completePracticeSession(gestureId: string | null = null): PracticeSession {
    const now = Date.now();

    for (let index = this.practiceSessions.length - 1; index >= 0; index--) {
      const session = this.practiceSessions[index];
      if (!session || session.completedAt) {
        continue;
      }
      if (gestureId && session.gestureId !== gestureId) {
        continue;
      }

      session.completedAt = now;
      session.durationMs = Math.max(0, now - session.startedAt);
      this.trimPracticeSessions();
      return session;
    }

    return {
      gestureId,
      startedAt: now,
      completedAt: now,
      durationMs: 0,
    };
  }

  getPracticeSessions(): PracticeSession[] {
    return [...this.practiceSessions];
  }

  shouldSuggestBreak(): boolean {
    const now = Date.now();
    const completedSessions = this.practiceSessions
      .filter(
        (session): session is PracticeSession & { completedAt: number } =>
          typeof session.completedAt === 'number' && session.completedAt <= now,
      )
      .sort((a, b) => a.completedAt - b.completedAt);

    if (completedSessions.length < this.MIN_RECENT_SESSIONS_FOR_BREAK) {
      return false;
    }

    const recentSessions = completedSessions.filter(
      (session) => now - session.completedAt <= this.BREAK_SESSION_WINDOW_MS,
    );

    if (recentSessions.length < this.MIN_RECENT_SESSIONS_FOR_BREAK) {
      return false;
    }

    const lastSessions = recentSessions.slice(-this.MIN_RECENT_SESSIONS_FOR_BREAK);
    const firstSession = lastSessions[0];
    const lastSession = lastSessions[lastSessions.length - 1];
    if (!firstSession || !lastSession) {
      return false;
    }
    const cumulativeDuration = lastSessions.reduce(
      (sum, session) =>
        sum + (session.durationMs ?? Math.max(0, session.completedAt - session.startedAt)),
      0,
    );

    const span = lastSession.completedAt - firstSession.startedAt;
    const lastCompletedAt = lastSession.completedAt;

    const withinWindow = span <= this.BREAK_SESSION_WINDOW_MS;
    const recentlyFinished = now - lastCompletedAt <= this.BREAK_RECENT_THRESHOLD_MS;
    const enoughPracticeTime = cumulativeDuration >= this.MIN_RECENT_DURATION_MS;

    return withinWindow && recentlyFinished && enoughPracticeTime;
  }

  /**
   * Get or create performance metrics for a gesture
   */
  private getOrCreateMetrics(gesture: string): PerformanceMetrics {
    const existing = this.performanceMetrics.get(gesture);
    if (existing) {
      return existing;
    }

    const created: PerformanceMetrics = {
        gesture,
        totalAttempts: 0,
        successfulAttempts: 0,
        averageConfidence: 0,
        bestConfidence: 0,
        recentPerformance: [],
        learningRate: 0,
        timeToMastery: 50,
        difficultyLevel: 'beginner',
        lastPracticed: 0,
        masteryThreshold: 0.8
    };
    this.performanceMetrics.set(gesture, created);
    return created;
  }

  /**
   * Calculate difficulty level based on performance
   */
  private calculateDifficultyLevel(metrics: PerformanceMetrics): 'beginner' | 'intermediate' | 'advanced' | 'master' {
    const successRate = metrics.successfulAttempts / Math.max(metrics.totalAttempts, 1);
    const avgConfidence = metrics.averageConfidence;

    const orderedThresholds = Object.entries(this.DIFFICULTY_THRESHOLDS)
      .map(([level, threshold]) => ({
        level: level as 'beginner' | 'intermediate' | 'advanced' | 'master',
        threshold,
      }))
      .sort((a, b) => b.threshold.minConfidence - a.threshold.minConfidence);

    for (const { level, threshold } of orderedThresholds) {
      if (
        avgConfidence >= threshold.minConfidence &&
        avgConfidence < threshold.maxConfidence + Number.EPSILON &&
        metrics.totalAttempts >= threshold.minAttempts &&
        (level === 'master' ? successRate >= 0.9 : true)
      ) {
        return level;
      }
    }

    return 'beginner';
  }

  /**
   * Estimate time to mastery (simplified)
   */
  private estimateTimeToMastery(metrics: PerformanceMetrics): number {
    const successRate = metrics.successfulAttempts / Math.max(metrics.totalAttempts, 1);
    const remainingToMastery = Math.max(0, metrics.masteryThreshold - successRate);

    if (remainingToMastery <= 0) return 0;

    const estimatedAdditionalAttempts = remainingToMastery / Math.max(metrics.learningRate, 0.01);
    return Math.min(estimatedAdditionalAttempts, 100);
  }

  private trimPracticeSessions(): void {
    if (this.practiceSessions.length > this.MAX_SESSIONS) {
      this.practiceSessions = this.practiceSessions.slice(-this.MAX_SESSIONS);
    }
  }

  /**
   * Get adaptive recommendations for Amy
   */
  getAdaptiveRecommendations(
    recentActivity: string[] = [],
    availableTime: number = 10
  ): AdaptiveRecommendation[] {
    const recommendations: AdaptiveRecommendation[] = [];
    const toExpectedDifficulty = (
      level: 'beginner' | 'intermediate' | 'advanced' | 'master',
    ): 'easy' | 'medium' | 'hard' =>
      level === 'beginner' ? 'easy' : level === 'intermediate' ? 'medium' : 'hard';

    // 1. Practice struggling gestures
    const strugglingGestures = this.getStrugglingGestures();
    for (const gesture of strugglingGestures.slice(0, 2)) {
      if (recentActivity.includes(gesture)) {
        continue;
      }
      const metrics = this.performanceMetrics.get(gesture);
      const level = metrics ? this.calculateDifficultyLevel(metrics) : 'beginner';
      recommendations.push({
        type: 'practice',
        gesture,
        reason: `${gesture} braucht noch etwas Übung`,
        priority: 'high',
        estimatedTime: 3,
        expectedDifficulty: toExpectedDifficulty(level),
        confidence: Math.min(0.9, (metrics?.averageConfidence ?? 0.6) + 0.2)
      });
    }

    // 2. Review recently learned gestures
    const reviewCandidates = this.getReviewCandidates();
    const [firstReview] = reviewCandidates;
    if (firstReview && recommendations.length < 3) {
      const reviewMetrics = this.performanceMetrics.get(firstReview);
      const level = reviewMetrics ? this.calculateDifficultyLevel(reviewMetrics) : 'intermediate';
      recommendations.push({
        type: 'review',
        gesture: firstReview,
        reason: `${firstReview} wiederholen zur Festigung`,
        priority: 'medium',
        estimatedTime: 2,
        expectedDifficulty: toExpectedDifficulty(level),
        confidence: Math.max(0.6, reviewMetrics?.averageConfidence ?? 0.6)
      });
    }

    // 3. Challenge with advanced gestures (if doing well)
    const challengeCandidates = this.getChallengeCandidates();
    const [firstChallenge] = challengeCandidates;
    if (firstChallenge && recommendations.length < 4) {
      const challengeMetrics = this.performanceMetrics.get(firstChallenge);
      const level = challengeMetrics ? this.calculateDifficultyLevel(challengeMetrics) : 'advanced';
      recommendations.push({
        type: 'challenge',
        gesture: firstChallenge,
        reason: `${firstChallenge} als neue Herausforderung`,
        priority: 'medium',
        estimatedTime: 5,
        expectedDifficulty: toExpectedDifficulty(level),
        confidence: Math.max(0.5, challengeMetrics?.averageConfidence ?? 0.6)
      });
    }

    if (recommendations.length < 3) {
      const pathTemplates = Object.values(this.LEARNING_PATH_TEMPLATES);
      for (const template of pathTemplates) {
        if (template.estimatedDuration > availableTime) {
          continue;
        }
        const nextGesture = template.targetGestures.find(gesture => !recentActivity.includes(gesture));
        if (!nextGesture) {
          continue;
        }
        const metrics = this.performanceMetrics.get(nextGesture);
        const level = metrics ? this.calculateDifficultyLevel(metrics) : 'beginner';
        recommendations.push({
          type: 'practice',
          gesture: nextGesture,
          reason: `${template.name}: ${template.description}`,
          priority: 'medium',
          estimatedTime: template.estimatedDuration,
          expectedDifficulty: toExpectedDifficulty(level),
          confidence: Math.max(0.5, metrics?.averageConfidence ?? 0.5),
        });
        if (recommendations.length >= 3) {
          break;
        }
      }
    }

    return recommendations
      .sort((a: AdaptiveRecommendation, b: AdaptiveRecommendation) => this.getPriorityWeight(b) - this.getPriorityWeight(a))
      .filter(rec => rec.estimatedTime <= availableTime)
      .slice(0, 3);
  }

  /**
   * Get gestures Amy is struggling with
   */
  private getStrugglingGestures(): string[] {
    return Array.from(this.performanceMetrics.values())
      .filter(metrics => {
        const successRate = metrics.successfulAttempts / Math.max(metrics.totalAttempts, 1);
        return successRate < 0.6 && metrics.totalAttempts >= 5;
      })
      .sort((a, b) => {
        const aRate = a.successfulAttempts / Math.max(a.totalAttempts, 1);
        const bRate = b.successfulAttempts / Math.max(b.totalAttempts, 1);
        return aRate - bRate;
      })
      .map(metrics => metrics.gesture);
  }

  /**
   * Get gestures that should be reviewed
   */
  private getReviewCandidates(): string[] {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);

    return Array.from(this.performanceMetrics.values())
      .filter(metrics => {
        const successRate = metrics.successfulAttempts / Math.max(metrics.totalAttempts, 1);
        return successRate >= 0.7 && metrics.lastPracticed < oneDayAgo && metrics.totalAttempts >= 10;
      })
      .sort((a, b) => a.lastPracticed - b.lastPracticed)
      .map(metrics => metrics.gesture);
  }

  /**
   * Get gestures that could be a good challenge
   */
  private getChallengeCandidates(): string[] {
    return Array.from(this.performanceMetrics.values())
      .filter(metrics => {
        const successRate = metrics.successfulAttempts / Math.max(metrics.totalAttempts, 1);
        return successRate >= 0.8 && metrics.difficultyLevel !== 'master';
      })
      .sort((a, b) => b.averageConfidence - a.averageConfidence)
      .map(metrics => metrics.gesture);
  }

  /**
   * Get priority weight for sorting recommendations
   */
  private getPriorityWeight(rec: AdaptiveRecommendation): number {
    const priorityWeights = { urgent: 4, high: 3, medium: 2, low: 1 };
    return priorityWeights[rec.priority] * rec.confidence;
  }

  /**
   * Get learning progress summary
   */
  getLearningProgress(): LearningProgressSummary {
    const completedSessions = this.practiceSessions
      .filter(
        (session): session is PracticeSession & { completedAt: number } =>
          typeof session.completedAt === 'number',
      )
      .sort((a, b) => a.completedAt - b.completedAt);
    const uniqueGestures = new Set(
      completedSessions
        .map((session) => session.gestureId)
        .filter((gestureId): gestureId is string => Boolean(gestureId)),
    );
    const totalPracticeSessions = completedSessions.length;
    const totalPracticeDuration = completedSessions.reduce(
      (sum, session) =>
        sum + (session.durationMs ?? Math.max(0, session.completedAt - session.startedAt)),
      0,
    );

    const allMetrics = Array.from(this.performanceMetrics.values());
    const masteredGestures = allMetrics.filter((m) => m.difficultyLevel === 'master').length;
    const averageConfidence = allMetrics.length > 0
      ? allMetrics.reduce((sum, m) => sum + m.averageConfidence, 0) / allMetrics.length
      : 0;

    let learningRate = 0;
    if (totalPracticeSessions >= 2) {
      const first = completedSessions[0]!;
      const last = completedSessions[completedSessions.length - 1]!;
      const spanMs = last.completedAt - first.startedAt;
      if (spanMs > 0) {
        learningRate = (totalPracticeSessions / (spanMs / (60 * 60 * 1000)));
      }
    }

    const activePaths = Array.from(this.learningPaths.values()).filter((p) => p.isActive);

    return {
      totalGesturesPracticed: uniqueGestures.size || allMetrics.length,
      masteredGestures,
      averageConfidence,
      learningRate,
      activePaths,
      totalPracticeSessions,
      averageSessionDuration: totalPracticeSessions > 0
        ? totalPracticeDuration / totalPracticeSessions
        : 0,
      recentPracticeSessions: completedSessions.slice(-5).reverse(),
    };
  }

  // Legacy methods for backward compatibility
  async getSuggestions(vocabulary: any[], profileId: string): Promise<any[]> {
    try {
      const usage = await loadUsageStats(profileId);
      const ranked = Object.entries(usage)
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id);
      const suggestions: any[] = [];
      for (const id of ranked) {
        const sym = vocabulary.find((s) => s.id === id);
        if (sym) suggestions.push(sym);
        if (suggestions.length >= 3) break;
      }
      return suggestions;
    } catch {
      return [];
    }
  }

  async getWeakGesture(threshold: number = 70): Promise<GestureDefinition | null> {
    try {
      const gestures = await database.get<GestureDefinition>('gesture_definitions')
        .query(
          Q.where('health_score', Q.lt(threshold))
        )
        .fetch();
      const [firstGesture] = gestures;
      if (firstGesture) {
        return firstGesture;
      }
      return null;
    } catch (error) {
      logger.error('Error fetching weak gesture:', error);
      return null;
    }
  }
}

// Enhanced service instance
const enhancedAdaptiveLearningService = new EnhancedAdaptiveLearningService();

// Legacy export for backward compatibility
export const adaptiveLearningService = {
  // Enhanced methods
  recordPracticeAttempt: enhancedAdaptiveLearningService.recordPracticeAttempt.bind(enhancedAdaptiveLearningService),
  getAdaptiveRecommendations: enhancedAdaptiveLearningService.getAdaptiveRecommendations.bind(enhancedAdaptiveLearningService),
  getLearningProgress: enhancedAdaptiveLearningService.getLearningProgress.bind(enhancedAdaptiveLearningService),
  startPracticeSession: enhancedAdaptiveLearningService.startPracticeSession.bind(enhancedAdaptiveLearningService),
  completePracticeSession: enhancedAdaptiveLearningService.completePracticeSession.bind(enhancedAdaptiveLearningService),
  getPracticeSessions: enhancedAdaptiveLearningService.getPracticeSessions.bind(enhancedAdaptiveLearningService),
  shouldSuggestBreak: enhancedAdaptiveLearningService.shouldSuggestBreak.bind(enhancedAdaptiveLearningService),

  // Legacy methods
  getSuggestions: enhancedAdaptiveLearningService.getSuggestions.bind(enhancedAdaptiveLearningService),
  getWeakGesture: enhancedAdaptiveLearningService.getWeakGesture.bind(enhancedAdaptiveLearningService),
};

// Legacy function export
export async function recordInteraction(gestureId: string, wasSuccessful: boolean): Promise<boolean> {
  try {
    await database.write(async () => {
      const gestureDefinition = await database.get<GestureDefinition>('gesture_definitions').find(gestureId);
      let score = gestureDefinition.healthScore;
      let threshold = gestureDefinition.minConfidenceThreshold;
      if (wasSuccessful) {
        score = Math.min(100, score + 1);
        threshold = Math.max(0, threshold - 0.01);
      } else {
        score = Math.max(0, score - 5);
        threshold = Math.min(1, threshold + 0.02);
      }
      await gestureDefinition.update(g => {
        g.healthScore = score;
        g.minConfidenceThreshold = threshold;
      });
    });

    // Also record in enhanced service
    enhancedAdaptiveLearningService.recordPracticeAttempt(gestureId, wasSuccessful, 0.5);

    return true;
  } catch (error) {
    logger.error('Error recording interaction:', error);
    return false;
  }
}

// Export enhanced service for direct access
export { enhancedAdaptiveLearningService };
export default enhancedAdaptiveLearningService;
