/**
 * Active Learning Service - Amy First
 * Intelligently identifies weak areas in gesture recognition and prompts for targeted data collection
 */

export interface UncertainSample {
  timestamp: number;
  gesture: string;
  confidence: number;
  landmarks: number[][][];
  context: {
    timeOfDay: number;
    activityLevel: 'high' | 'low' | 'normal';
    consecutiveFailures: number;
  };
}

export interface Misclassification {
  timestamp: number;
  intendedGesture: string;
  recognizedGesture: string;
  confidence: number;
  correctionSource: 'user' | 'auto';
  context: UncertainSample['context'];
}

export interface LearningPriority {
  gesture: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  reason: string;
  suggestedFrequency: number; // How often to prompt for this gesture
  lastPrompted: number;
  successRate: number;
  totalAttempts: number;
  recentFailures: number;
}

export interface PracticeSuggestion {
  shouldSuggest: boolean;
  gesture: string;
  reason: string;
  urgency: 'immediate' | 'soon' | 'when_convenient';
  expectedImprovement: number; // Expected accuracy improvement
  timeEstimate: number; // Minutes needed for practice
}

export class ActiveLearningService {
  private uncertainSamples: UncertainSample[] = [];
  private misclassifications: Misclassification[] = [];
  private learningPriorities: Map<string, LearningPriority> = new Map();
  private readonly MAX_SAMPLES = 1000;
  private readonly PROMPT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between prompts for same gesture
  private readonly ANALYSIS_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours for analysis

  /**
   * Record an uncertain recognition sample
   */
  recordUncertainSample(
    gesture: string,
    confidence: number,
    landmarks: number[][][],
    context: UncertainSample['context']
  ): void {
    const sample: UncertainSample = {
      timestamp: Date.now(),
      gesture,
      confidence,
      landmarks,
      context
    };

    this.uncertainSamples.push(sample);

    // Keep samples within limit
    if (this.uncertainSamples.length > this.MAX_SAMPLES) {
      this.uncertainSamples.shift();
    }

    // Update learning priorities
    this.updateLearningPriority(gesture, 'uncertain_sample');
  }

  /**
   * Record a misclassification (when user corrects recognition)
   */
  recordMisclassification(
    intendedGesture: string,
    recognizedGesture: string,
    confidence: number,
    correctionSource: 'user' | 'auto' = 'user',
    context: UncertainSample['context']
  ): void {
    const misclassification: Misclassification = {
      timestamp: Date.now(),
      intendedGesture,
      recognizedGesture,
      confidence,
      correctionSource,
      context
    };

    this.misclassifications.push(misclassification);

    // Update learning priorities for both gestures
    this.updateLearningPriority(intendedGesture, 'misclassified_intended');
    this.updateLearningPriority(recognizedGesture, 'misclassified_recognized');

    // Clean old data
    this.cleanOldData();
  }

  /**
   * Update learning priority for a gesture
   */
  private updateLearningPriority(
    gesture: string,
    reason: string
  ): void {
    const existing = this.learningPriorities.get(gesture);
    const now = Date.now();

    if (existing) {
      // Update existing priority
      existing.totalAttempts++;
      existing.successRate = this.calculateSuccessRate(gesture);
      existing.recentFailures = this.countRecentFailures(gesture);

      // Update priority level based on recent performance
      existing.priority = this.calculatePriorityLevel(existing);
      existing.lastPrompted = now; // Reset cooldown

    } else {
      // Create new priority
      const priority: LearningPriority = {
        gesture,
        priority: 'medium',
        reason,
        suggestedFrequency: 1, // Default: prompt once per session
        lastPrompted: 0,
        successRate: this.calculateSuccessRate(gesture),
        totalAttempts: 1,
        recentFailures: 1
      };

      this.learningPriorities.set(gesture, priority);
    }
  }

  /**
   * Calculate success rate for a gesture
   */
  private calculateSuccessRate(gesture: string): number {
    const recentMisclassifications = this.misclassifications
      .filter(m => m.intendedGesture === gesture &&
                   m.timestamp > Date.now() - this.ANALYSIS_WINDOW_MS);

    const recentUncertain = this.uncertainSamples
      .filter(s => s.gesture === gesture &&
                   s.timestamp > Date.now() - this.ANALYSIS_WINDOW_MS);

    const totalIssues = recentMisclassifications.length + recentUncertain.length;

    if (totalIssues === 0) return 1.0; // No issues = 100% success

    // Estimate total attempts (rough approximation)
    const estimatedTotalAttempts = totalIssues * 3; // Assume 3x more successful attempts
    return Math.max(0, 1 - (totalIssues / estimatedTotalAttempts));
  }

  /**
   * Count recent failures for a gesture
   */
  private countRecentFailures(gesture: string): number {
    const recentWindow = Date.now() - (60 * 60 * 1000); // Last hour

    const recentMisclassifications = this.misclassifications
      .filter(m => (m.intendedGesture === gesture || m.recognizedGesture === gesture) &&
                   m.timestamp > recentWindow);

    const recentUncertain = this.uncertainSamples
      .filter(s => s.gesture === gesture && s.timestamp > recentWindow);

    return recentMisclassifications.length + recentUncertain.length;
  }

  /**
   * Calculate priority level for a gesture
   */
  private calculatePriorityLevel(priority: LearningPriority): 'critical' | 'high' | 'medium' | 'low' {
    const { successRate, recentFailures, totalAttempts } = priority;

    // Critical: Very low success rate + recent failures + enough attempts to be significant
    if (successRate < 0.3 && recentFailures >= 3 && totalAttempts >= 5) {
      return 'critical';
    }

    // High: Low success rate or frequent recent failures
    if (successRate < 0.5 || recentFailures >= 5) {
      return 'high';
    }

    // Medium: Moderate issues or new gestures with some failures
    if (successRate < 0.7 || (totalAttempts < 10 && recentFailures >= 2)) {
      return 'medium';
    }

    // Low: Generally performing well
    return 'low';
  }

  /**
   * Get practice suggestion for current context
   */
  getPracticeSuggestion(
    currentActivity: 'high' | 'low' | 'normal'
  ): PracticeSuggestion {
    const now = Date.now();

    // Get eligible priorities (not on cooldown)
    const eligiblePriorities = Array.from(this.learningPriorities.values())
      .filter(p => now - p.lastPrompted > this.PROMPT_COOLDOWN_MS)
      .sort((a, b) => this.getPriorityWeight(b) - this.getPriorityWeight(a));

    if (eligiblePriorities.length === 0) {
      return {
        shouldSuggest: false,
        gesture: '',
        reason: 'no_priorities_due',
        urgency: 'when_convenient',
        expectedImprovement: 0,
        timeEstimate: 0
      };
    }

    const topPriority = eligiblePriorities[0]!;

    // Check if this is a good time for the suggested gesture
    const timeCompatibility = this.checkTimeCompatibility();
    const activityCompatibility = this.checkActivityCompatibility(topPriority.gesture, currentActivity);

    // Calculate expected improvement
    const expectedImprovement = Math.min(0.3, (1 - topPriority.successRate) * 0.5);

    // Determine urgency
    let urgency: 'immediate' | 'soon' | 'when_convenient' = 'when_convenient';
    if (topPriority.priority === 'critical') {
      urgency = 'immediate';
    } else if (topPriority.priority === 'high' && timeCompatibility && activityCompatibility) {
      urgency = 'soon';
    }

    return {
      shouldSuggest: true,
      gesture: topPriority.gesture,
      reason: this.getSuggestionReason(topPriority),
      urgency,
      expectedImprovement,
      timeEstimate: Math.max(2, Math.min(10, 5 - topPriority.successRate * 5)) // 2-10 minutes
    };
  }

  /**
   * Get priority weight for sorting
   */
  private getPriorityWeight(priority: LearningPriority): number {
    const priorityWeights = { critical: 4, high: 3, medium: 2, low: 1 };
    const recencyWeight = Math.max(0, 1 - ((Date.now() - priority.lastPrompted) / (24 * 60 * 60 * 1000))); // Decay over 24h

    return priorityWeights[priority.priority] + recencyWeight + (priority.recentFailures * 0.1);
  }

  /**
   * Check if current time is compatible with gesture practice
   */
  private checkTimeCompatibility(): boolean {
    // For now, assume all times are compatible
    // Could be enhanced with gesture-specific time preferences
    return true;
  }

  /**
   * Check if current activity level is compatible with gesture practice
   */
  private checkActivityCompatibility(_gesture: string, currentActivity: 'high' | 'low' | 'normal'): boolean {
    // High activity might not be ideal for focused practice
    if (currentActivity === 'high') {
      return false;
    }

    // Low activity is perfect for practice
    if (currentActivity === 'low') {
      return true;
    }

    // Normal activity is acceptable
    return true;
  }

  /**
   * Get human-readable reason for suggestion
   */
  private getSuggestionReason(priority: LearningPriority): string {
    switch (priority.priority) {
      case 'critical':
        return `Amy hat Schwierigkeiten mit "${priority.gesture}". Übung würde sehr helfen!`;
      case 'high':
        return `Amy könnte "${priority.gesture}" besser lernen.`;
      case 'medium':
        return `"${priority.gesture}" könnte etwas Übung vertragen.`;
      case 'low':
        return `Möchtest du "${priority.gesture}" üben?`;
      default:
        return `Übungsvorschlag für "${priority.gesture}"`;
    }
  }

  /**
   * Mark a practice suggestion as shown (updates cooldown)
   */
  markSuggestionShown(gesture: string): void {
    const priority = this.learningPriorities.get(gesture);
    if (priority) {
      priority.lastPrompted = Date.now();
    }
  }

  /**
   * Record practice session results
   */
  recordPracticeResults(
    gesture: string,
    successRate: number
  ): void {
    const priority = this.learningPriorities.get(gesture);
    if (priority) {
      // Update success rate based on practice results
      const improvement = successRate - priority.successRate;
      if (improvement > 0) {
        priority.successRate = Math.min(1.0, priority.successRate + (improvement * 0.3)); // Gradual improvement
      }

      // Reduce recent failures if practice was successful
      if (successRate > 0.7) {
        priority.recentFailures = Math.max(0, priority.recentFailures - 1);
      }

      // Update priority level
      priority.priority = this.calculatePriorityLevel(priority);
    }
  }

  /**
   * Get learning analytics for caregivers
   */
  getLearningAnalytics(): {
    totalUncertainSamples: number;
    totalMisclassifications: number;
    topPriorityGestures: Array<{
      gesture: string;
      priority: string;
      successRate: number;
      recentFailures: number;
    }>;
    improvementAreas: string[];
    recommendedPracticeTime: number; // Minutes per day
  } {
    const topPriorities = Array.from(this.learningPriorities.values())
      .sort((a, b) => this.getPriorityWeight(b) - this.getPriorityWeight(a))
      .slice(0, 5)
      .map(p => ({
        gesture: p.gesture,
        priority: p.priority,
        successRate: p.successRate,
        recentFailures: p.recentFailures
      }));

    const improvementAreas = topPriorities
      .filter(p => p.successRate < 0.7)
      .map(p => p.gesture);

    // Estimate recommended practice time based on priorities
    const highPriorityCount = topPriorities.filter(p => p.priority === 'high' || p.priority === 'critical').length;
    const recommendedPracticeTime = Math.max(5, highPriorityCount * 3); // 3 minutes per high-priority gesture

    return {
      totalUncertainSamples: this.uncertainSamples.length,
      totalMisclassifications: this.misclassifications.length,
      topPriorityGestures: topPriorities,
      improvementAreas,
      recommendedPracticeTime
    };
  }

  /**
   * Clean old data to prevent memory bloat
   */
  private cleanOldData(): void {
    const cutoffTime = Date.now() - this.ANALYSIS_WINDOW_MS;

    this.uncertainSamples = this.uncertainSamples.filter(s => s.timestamp > cutoffTime);
    this.misclassifications = this.misclassifications.filter(m => m.timestamp > cutoffTime);
  }

  /**
   * Export learning data for persistence
   */
  exportLearningData(): {
    uncertainSamples: UncertainSample[];
    misclassifications: Misclassification[];
    learningPriorities: Record<string, LearningPriority>;
  } {
    return {
      uncertainSamples: this.uncertainSamples,
      misclassifications: this.misclassifications,
      learningPriorities: Object.fromEntries(this.learningPriorities)
    };
  }

  /**
   * Import learning data from persistence
   */
  importLearningData(data: {
    uncertainSamples: UncertainSample[];
    misclassifications: Misclassification[];
    learningPriorities: Record<string, LearningPriority>;
  }): void {
    this.uncertainSamples = data.uncertainSamples || [];
    this.misclassifications = data.misclassifications || [];
    this.learningPriorities = new Map(Object.entries(data.learningPriorities || {}));
  }

  /**
   * Reset all learning data
   */
  reset(): void {
    this.uncertainSamples = [];
    this.misclassifications = [];
    this.learningPriorities.clear();
  }
}

// Export singleton instance
export const activeLearningService: ActiveLearningService = new ActiveLearningService();
export default activeLearningService;