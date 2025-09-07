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

export interface PracticeSession {
  id: string;
  gesture: string;
  difficulty: 'easy' | 'medium' | 'hard';
  startTime: number;
  endTime?: number;
  attempts: number;
  successes: number;
  averageConfidence: number;
  feedback: string[];
  duration: number;
  completed: boolean;
}

export interface AdaptiveRecommendation {
  type: 'practice' | 'review' | 'challenge' | 'break';
  gesture?: string;
  reason: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  estimatedTime: number;
  expectedDifficulty: 'easy' | 'medium' | 'hard';
  confidence: number;
}

// Enhanced Adaptive Learning Service
class EnhancedAdaptiveLearningService {
  private performanceMetrics: Map<string, PerformanceMetrics> = new Map();
  private learningPaths: Map<string, LearningPath> = new Map();
  private practiceSessions: PracticeSession[] = [];
  private readonly MAX_SESSIONS = 100;

  // Difficulty thresholds
  private readonly DIFFICULTY_THRESHOLDS = {
    beginner: { minConfidence: 0, maxConfidence: 0.4, minAttempts: 0 },
    intermediate: { minConfidence: 0.4, maxConfidence: 0.7, minAttempts: 10 },
    advanced: { minConfidence: 0.7, maxConfidence: 0.9, minAttempts: 25 },
    master: { minConfidence: 0.9, maxConfidence: 1.0, minAttempts: 50 }
  };

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
    confidence: number,
    duration?: number
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
      const recentAvg = metrics.recentPerformance.reduce((a, b) => a + b, 0) / metrics.recentPerformance.length;
      const olderAvg = metrics.averageConfidence;
      metrics.learningRate = recentAvg - olderAvg;
    }

    // Estimate time to mastery
    metrics.timeToMastery = this.estimateTimeToMastery(metrics);

    metrics.lastPracticed = Date.now();

    this.performanceMetrics.set(gesture, metrics);
  }

  /**
   * Get or create performance metrics for a gesture
   */
  private getOrCreateMetrics(gesture: string): PerformanceMetrics {
    if (!this.performanceMetrics.has(gesture)) {
      this.performanceMetrics.set(gesture, {
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
      });
    }
    return this.performanceMetrics.get(gesture)!;
  }

  /**
   * Calculate difficulty level based on performance
   */
  private calculateDifficultyLevel(metrics: PerformanceMetrics): 'beginner' | 'intermediate' | 'advanced' | 'master' {
    const successRate = metrics.successfulAttempts / Math.max(metrics.totalAttempts, 1);
    const avgConfidence = metrics.averageConfidence;

    if (avgConfidence >= 0.9 && successRate >= 0.9 && metrics.totalAttempts >= 50) {
      return 'master';
    } else if (avgConfidence >= 0.7 && successRate >= 0.7 && metrics.totalAttempts >= 25) {
      return 'advanced';
    } else if (avgConfidence >= 0.4 && metrics.totalAttempts >= 10) {
      return 'intermediate';
    } else {
      return 'beginner';
    }
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

  /**
   * Get adaptive recommendations for Amy
   */
  getAdaptiveRecommendations(
    recentActivity: string[] = [],
    availableTime: number = 10
  ): AdaptiveRecommendation[] {
    const recommendations: AdaptiveRecommendation[] = [];

    // 1. Practice struggling gestures
    const strugglingGestures = this.getStrugglingGestures();
    for (const gesture of strugglingGestures.slice(0, 2)) {
      recommendations.push({
        type: 'practice',
        gesture,
        reason: `${gesture} braucht noch etwas Übung`,
        priority: 'high',
        estimatedTime: 3,
        expectedDifficulty: 'easy',
        confidence: 0.8
      });
    }

    // 2. Review recently learned gestures
    const reviewCandidates = this.getReviewCandidates();
    if (reviewCandidates.length > 0 && recommendations.length < 3) {
      recommendations.push({
        type: 'review',
        gesture: reviewCandidates[0],
        reason: `${reviewCandidates[0]} wiederholen zur Festigung`,
        priority: 'medium',
        estimatedTime: 2,
        expectedDifficulty: 'easy',
        confidence: 0.7
      });
    }

    // 3. Challenge with advanced gestures (if doing well)
    const challengeCandidates = this.getChallengeCandidates();
    if (challengeCandidates.length > 0 && recommendations.length < 4) {
      recommendations.push({
        type: 'challenge',
        gesture: challengeCandidates[0],
        reason: `${challengeCandidates[0]} als neue Herausforderung`,
        priority: 'medium',
        estimatedTime: 5,
        expectedDifficulty: 'medium',
        confidence: 0.6
      });
    }

    // 4. Suggest break if overworked
    if (this.shouldSuggestBreak(recentActivity)) {
      recommendations.push({
        type: 'break',
        reason: 'Kurze Pause für bessere Konzentration',
        priority: 'medium',
        estimatedTime: 2,
        expectedDifficulty: 'easy',
        confidence: 0.9
      });
    }

    return recommendations
      .sort((a, b) => this.getPriorityWeight(b) - this.getPriorityWeight(a))
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
   * Check if Amy should take a break
   */
  private shouldSuggestBreak(recentActivity: string[]): boolean {
    const now = Date.now();
    const recentSessions = this.practiceSessions.filter(session =>
      session.startTime > (now - (60 * 60 * 1000))
    );
    return recentSessions.length >= 3;
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
  getLearningProgress(): {
    totalGesturesPracticed: number;
    masteredGestures: number;
    averageConfidence: number;
    learningRate: number;
    activePaths: LearningPath[];
    recentSessions: PracticeSession[];
  } {
    const allMetrics = Array.from(this.performanceMetrics.values());
    const masteredGestures = allMetrics.filter(m => m.difficultyLevel === 'master').length;
    const averageConfidence = allMetrics.length > 0
      ? allMetrics.reduce((sum, m) => sum + m.averageConfidence, 0) / allMetrics.length
      : 0;

    const learningRate = allMetrics.length > 0
      ? allMetrics.reduce((sum, m) => sum + m.learningRate, 0) / allMetrics.length
      : 0;

    const activePaths = Array.from(this.learningPaths.values()).filter(p => p.isActive);
    const recentSessions = this.practiceSessions.slice(-5);

    return {
      totalGesturesPracticed: allMetrics.length,
      masteredGestures,
      averageConfidence,
      learningRate,
      activePaths,
      recentSessions
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
      if (gestures.length > 0) {
        return gestures[0];
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
