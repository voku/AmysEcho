/**
 * Personalized Threshold Manager - Amy First
 * Dynamically adjusts confidence thresholds based on Amy's individual gesture patterns
 */

export interface GesturePerformance {
  gesture: string;
  totalAttempts: number;
  successfulAttempts: number;
  averageConfidence: number;
  /** Running sum of recorded confidence values within the personalization window. */
  confidenceSum: number;
  lastAttemptTime: number;
  successRate: number;
  personalizedThreshold: number;
}

export interface ThresholdAdjustment {
  gesture: string;
  originalThreshold: number;
  adjustedThreshold: number;
  reason: 'success_rate' | 'recent_performance' | 'learning_curve' | 'favorite_gesture';
}

export class PersonalizedThresholdManager {
  private gesturePerformance: Map<string, GesturePerformance> = new Map();
  private readonly PERFORMANCE_WINDOW = 50; // Track last 50 attempts per gesture
  private readonly MIN_ATTEMPTS_FOR_PERSONALIZATION = 10;
  private readonly MAX_THRESHOLD_ADJUSTMENT = 0.3; // Max 30% adjustment
  private readonly LEARNING_RATE = 0.1; // How quickly thresholds adapt
  private readonly BASE_THRESHOLD = 0.2; // Tuned for gentle onboarding of new gestures

  /**
   * Record a gesture attempt for personalization
   */
  recordAttempt(gesture: string, confidence: number, success: boolean): void {
    const performance = this.getOrCreatePerformance(gesture);

    // Update statistics
    performance.totalAttempts++;
    if (success) {
      performance.successfulAttempts++;
    }

    performance.confidenceSum += confidence;
    performance.averageConfidence = performance.totalAttempts > 0
      ? performance.confidenceSum / performance.totalAttempts
      : 0;

    performance.successRate = performance.totalAttempts > 0
      ? performance.successfulAttempts / performance.totalAttempts
      : 0;
    performance.lastAttemptTime = Date.now();

    // Calculate personalized threshold
    performance.personalizedThreshold = this.calculatePersonalizedThreshold(performance);

    this.gesturePerformance.set(gesture, performance);

    // Limit history size
    if (performance.totalAttempts > this.PERFORMANCE_WINDOW) {
      this.trimHistory(gesture);
    }
  }

  private getOrCreatePerformance(gesture: string): GesturePerformance {
    const existing = this.gesturePerformance.get(gesture);

    if (!existing) {
      const created: GesturePerformance = {
        gesture,
        totalAttempts: 0,
        successfulAttempts: 0,
        averageConfidence: 0,
        confidenceSum: 0,
        lastAttemptTime: Date.now(),
        successRate: 0,
        personalizedThreshold: this.BASE_THRESHOLD // Default MLP threshold tuned for onboarding
      };
      this.gesturePerformance.set(gesture, created);
      return created;
    }

    if (!Number.isFinite(existing.confidenceSum)) {
      const normalizedAverage = Number.isFinite(existing.averageConfidence)
        ? existing.averageConfidence
        : 0;
      const normalizedAttempts = Number.isFinite(existing.totalAttempts)
        ? existing.totalAttempts
        : 0;
      const legacySum = normalizedAverage * normalizedAttempts;
      existing.confidenceSum = Number.isFinite(legacySum) ? legacySum : 0;
    }

    if (!Number.isFinite(existing.totalAttempts) || existing.totalAttempts < 0) {
      const normalizedAttempts = Number.isFinite(existing.totalAttempts)
        ? existing.totalAttempts
        : 0;
      existing.totalAttempts = Math.max(0, Math.round(normalizedAttempts));
    }

    if (!Number.isFinite(existing.successfulAttempts) || existing.successfulAttempts < 0) {
      const normalizedSuccesses = Number.isFinite(existing.successfulAttempts)
        ? existing.successfulAttempts
        : 0;
      existing.successfulAttempts = Math.max(0, Math.round(normalizedSuccesses));
    }

    if (existing.successfulAttempts > existing.totalAttempts) {
      existing.successfulAttempts = existing.totalAttempts;
    }

    return existing;
  }

  /**
   * Get personalized threshold for a gesture
   */
  getPersonalizedThreshold(gesture: string, baseThreshold: number): ThresholdAdjustment {
    const performance = this.gesturePerformance.get(gesture);

    if (!performance || performance.totalAttempts < this.MIN_ATTEMPTS_FOR_PERSONALIZATION) {
      return {
        gesture,
        originalThreshold: baseThreshold,
        adjustedThreshold: baseThreshold,
        reason: 'success_rate'
      };
    }

    const adjustment = performance.personalizedThreshold - baseThreshold;
    const clampedAdjustment = Math.max(
      -this.MAX_THRESHOLD_ADJUSTMENT,
      Math.min(this.MAX_THRESHOLD_ADJUSTMENT, adjustment)
    );

    return {
      gesture,
      originalThreshold: baseThreshold,
      adjustedThreshold: baseThreshold + clampedAdjustment,
      reason: this.getAdjustmentReason(performance)
    };
  }

  /**
   * Get all personalized thresholds
   */
  getAllPersonalizedThresholds(baseThreshold: number): ThresholdAdjustment[] {
    const adjustments: ThresholdAdjustment[] = [];

    for (const [gesture, performance] of this.gesturePerformance) {
      if (performance.totalAttempts >= this.MIN_ATTEMPTS_FOR_PERSONALIZATION) {
        adjustments.push(this.getPersonalizedThreshold(gesture, baseThreshold));
      }
    }

    return adjustments;
  }

  /**
   * Get performance insights for Amy's dashboard
   */
  getPerformanceInsights(): {
    totalGestures: number;
    wellPerformingGestures: string[];
    needsPracticeGestures: string[];
    averageSuccessRate: number;
  } {
    const performances = Array.from(this.gesturePerformance.values());
    const totalGestures = performances.length;
    const wellPerformingGestures = performances
      .filter(p => p.successRate > 0.8 && p.totalAttempts >= this.MIN_ATTEMPTS_FOR_PERSONALIZATION)
      .map(p => p.gesture);

    const needsPracticeGestures = performances
      .filter(p => p.successRate < 0.6 && p.totalAttempts >= this.MIN_ATTEMPTS_FOR_PERSONALIZATION)
      .map(p => p.gesture);

    const averageSuccessRate = performances.length > 0
      ? performances.reduce((sum, p) => sum + p.successRate, 0) / performances.length
      : 0;

    return {
      totalGestures,
      wellPerformingGestures,
      needsPracticeGestures,
      averageSuccessRate
    };
  }

  /**
   * Reset performance data (for testing or fresh start)
   */
  reset(): void {
    this.gesturePerformance.clear();
  }

  /**
   * Export performance data for persistence
   */
  exportPerformanceData(): Record<string, GesturePerformance> {
    const data: Record<string, GesturePerformance> = {};
    for (const [gesture, performance] of this.gesturePerformance) {
      data[gesture] = { ...performance };
    }
    return data;
  }

  /**
   * Import performance data from persistence
   */
  importPerformanceData(data: Record<string, GesturePerformance>): void {
    this.gesturePerformance.clear();
    for (const [gesture, performance] of Object.entries(data)) {
      const normalizedAverageRaw = Number.isFinite(performance.averageConfidence)
        ? performance.averageConfidence
        : 0;
      const normalizedAttemptsRaw = Number.isFinite(performance.totalAttempts)
        ? performance.totalAttempts
        : 0;
      const normalizedAttempts = Math.max(0, Math.round(normalizedAttemptsRaw));
      const normalizedConfidenceSumRaw = Number.isFinite(performance.confidenceSum)
        ? performance.confidenceSum
        : normalizedAverageRaw * normalizedAttempts;
      const safeConfidenceSumRaw = Number.isFinite(normalizedConfidenceSumRaw)
        ? normalizedConfidenceSumRaw
        : 0;
      const safeConfidenceSum = Math.max(0, safeConfidenceSumRaw);
      const normalizedSuccessfulAttemptsRaw = Number.isFinite(performance.successfulAttempts)
        ? performance.successfulAttempts
        : 0;
      const normalizedSuccessfulAttempts = Math.min(
        Math.max(0, Math.round(normalizedSuccessfulAttemptsRaw)),
        normalizedAttempts
      );
      const normalizedAverageConfidence = normalizedAttempts > 0
        ? safeConfidenceSum / normalizedAttempts
        : 0;
      const normalizedSuccessRate = normalizedAttempts > 0
        ? normalizedSuccessfulAttempts / normalizedAttempts
        : 0;

      const normalized: GesturePerformance = {
        ...performance,
        gesture,
        totalAttempts: normalizedAttempts,
        successfulAttempts: normalizedSuccessfulAttempts,
        confidenceSum: safeConfidenceSum,
        averageConfidence: normalizedAverageConfidence,
        successRate: normalizedSuccessRate,
        personalizedThreshold: performance.personalizedThreshold
      };

      normalized.personalizedThreshold = this.calculatePersonalizedThreshold(normalized);

      this.gesturePerformance.set(gesture, normalized);
    }
  }

  private calculatePersonalizedThreshold(performance: GesturePerformance): number {
    const { successRate, averageConfidence, totalAttempts } = performance;

    // Base threshold starts at the onboarding-friendly default (matching MLP baseline)
    let threshold = this.BASE_THRESHOLD;

    // Adjust based on success rate
    if (successRate > 0.8) {
      // High success rate - can be more strict
      threshold += 0.05;
    } else if (successRate < 0.5) {
      // Low success rate - be more lenient
      threshold -= 0.1;
    }

    // Adjust based on average confidence
    if (averageConfidence > 0.7) {
      threshold += 0.03;
    } else if (averageConfidence < 0.4) {
      threshold -= 0.05;
    }

    // Learning curve adjustment - be more lenient for newer gestures
    if (totalAttempts < 20) {
      threshold -= 0.05;
    }

    // Ensure threshold stays within reasonable bounds
    return Math.max(this.BASE_THRESHOLD, Math.min(0.6, threshold));
  }

  private getAdjustmentReason(performance: GesturePerformance): ThresholdAdjustment['reason'] {
    if (performance.successRate > 0.8) {
      return 'success_rate';
    } else if (performance.totalAttempts < 20) {
      return 'learning_curve';
    } else {
      return 'recent_performance';
    }
  }

  private trimHistory(gesture: string): void {
    // Approximate a sliding window by scaling aggregate statistics down to the configured window size
    const performance = this.gesturePerformance.get(gesture);
    if (!performance) {
      return;
    }

    if (performance.totalAttempts <= this.PERFORMANCE_WINDOW) {
      return;
    }

    const windowRatio = this.PERFORMANCE_WINDOW / performance.totalAttempts;

    const totalAttempts = this.PERFORMANCE_WINDOW;
    const successfulAttempts = Math.round(performance.successfulAttempts * windowRatio);
    const clampedSuccessfulAttempts = Math.min(
      Math.max(0, successfulAttempts),
      totalAttempts
    );
    const confidenceSum = performance.confidenceSum * windowRatio;
    const averageConfidence = totalAttempts > 0 ? confidenceSum / totalAttempts : 0;
    const successRate = totalAttempts > 0 ? clampedSuccessfulAttempts / totalAttempts : 0;

    const updatedPerformance: GesturePerformance = {
      ...performance,
      totalAttempts,
      successfulAttempts: clampedSuccessfulAttempts,
      confidenceSum,
      averageConfidence,
      successRate
    };
    updatedPerformance.personalizedThreshold = this.calculatePersonalizedThreshold(updatedPerformance);

    this.gesturePerformance.set(gesture, updatedPerformance);
  }
}
