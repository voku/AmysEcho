/**
 * Adaptive Learning Service for Webapp
 * 
 * Provides personalized learning recommendations based on Amy's practice patterns.
 * Tracks performance metrics and suggests appropriate practice activities.
 */

import { logger } from './logger';

// Interfaces for adaptive learning
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

const STORAGE_KEY = 'amysecho_adaptive_learning';

// Adaptive Learning Service
class AdaptiveLearningService {
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
  
  // LLM-optimized: Performance thresholds for recommendations
  private readonly STRUGGLING_SUCCESS_THRESHOLD = 0.6; // Below this = struggling
  private readonly REVIEW_SUCCESS_THRESHOLD = 0.7; // Above this = ready for review
  private readonly CHALLENGE_SUCCESS_THRESHOLD = 0.8; // Above this = ready for challenge
  private readonly MIN_ATTEMPTS_FOR_STRUGGLING = 5; // Minimum attempts to identify struggling
  private readonly MIN_ATTEMPTS_FOR_REVIEW = 10; // Minimum attempts before recommending review
  private readonly ADVANCED_SUCCESS_THRESHOLD = 0.9; // For practice recommendations
  private readonly INTERMEDIATE_SUCCESS_THRESHOLD = 0.7; // For practice recommendations

  // Learning path templates (German localized)
  private readonly LEARNING_PATH_TEMPLATES = {
    basic_communication: {
      name: 'Grundlegende Kommunikation',
      description: 'Wichtige Gesten für den Alltag',
      targetGestures: ['hallo', 'danke', 'bitte', 'ja', 'nein'],
      difficulty: 'easy' as const,
      estimatedDuration: 15,
      prerequisites: []
    },
    emotional_expression: {
      name: 'Gefühlsausdruck',
      description: 'Gefühle und Emotionen ausdrücken',
      targetGestures: ['freude', 'traurig', 'wut', 'überrascht', 'aufgeregt'],
      difficulty: 'medium' as const,
      estimatedDuration: 20,
      prerequisites: ['ja', 'nein']
    },
    daily_activities: {
      name: 'Tägliche Aktivitäten',
      description: 'Gesten für Routinen und Tagesabläufe',
      targetGestures: ['essen', 'trinken', 'schlafen', 'spielen', 'toilette'],
      difficulty: 'medium' as const,
      estimatedDuration: 25,
      prerequisites: ['bitte', 'danke']
    },
    advanced_communication: {
      name: 'Fortgeschrittene Kommunikation',
      description: 'Komplexe Gesten für soziale Situationen',
      targetGestures: ['entschuldigung', 'warten', 'fertig', 'mehr', 'hilfe'],
      difficulty: 'hard' as const,
      estimatedDuration: 30,
      prerequisites: ['hallo', 'danke', 'bitte']
    }
  };

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.metrics) {
          this.performanceMetrics = new Map(Object.entries(data.metrics));
        }
        if (data.paths) {
          this.learningPaths = new Map(Object.entries(data.paths));
        }
        if (data.sessions) {
          this.practiceSessions = data.sessions;
        }
      }
    } catch (error) {
      logger.warn('Failed to load adaptive learning data:', error);
    }
  }

  private saveToStorage(): void {
    try {
      const data = {
        metrics: Object.fromEntries(this.performanceMetrics),
        paths: Object.fromEntries(this.learningPaths),
        sessions: this.practiceSessions.slice(-this.MAX_SESSIONS)
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      logger.warn('Failed to save adaptive learning data:', error);
    }
  }

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
    this.saveToStorage();
  }

  startPracticeSession(gestureId: string | null = null): PracticeSession {
    const session: PracticeSession = {
      gestureId,
      startedAt: Date.now(),
    };
    this.practiceSessions.push(session);
    this.trimPracticeSessions();
    this.saveToStorage();
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
      this.saveToStorage();
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
        metrics.totalAttempts >= threshold.minAttempts &&
        (level === 'master'
          ? successRate >= this.ADVANCED_SUCCESS_THRESHOLD
          : level === 'advanced'
            ? successRate >= this.INTERMEDIATE_SUCCESS_THRESHOLD
            : true)
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

    // 4. Suggest from learning paths if needed
    if (recommendations.length < 3) {
      const pathTemplates = Object.entries(this.LEARNING_PATH_TEMPLATES);
      for (const [, template] of pathTemplates) {
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
        return successRate < this.STRUGGLING_SUCCESS_THRESHOLD && metrics.totalAttempts >= this.MIN_ATTEMPTS_FOR_STRUGGLING;
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
        return successRate >= this.REVIEW_SUCCESS_THRESHOLD && metrics.lastPracticed < oneDayAgo && metrics.totalAttempts >= this.MIN_ATTEMPTS_FOR_REVIEW;
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
        return successRate >= this.CHALLENGE_SUCCESS_THRESHOLD && metrics.difficultyLevel !== 'master';
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

  /**
   * Get performance metrics for a specific gesture
   */
  getGestureMetrics(gesture: string): PerformanceMetrics | undefined {
    return this.performanceMetrics.get(gesture);
  }

  /**
   * Get all performance metrics
   */
  getAllMetrics(): PerformanceMetrics[] {
    return Array.from(this.performanceMetrics.values());
  }

  /**
   * Clear all learning data
   */
  clearAllData(): void {
    this.performanceMetrics.clear();
    this.learningPaths.clear();
    this.practiceSessions = [];
    localStorage.removeItem(STORAGE_KEY);
  }
}

// Singleton instance
export const adaptiveLearningService = new AdaptiveLearningService();

// Default export
export default adaptiveLearningService;
