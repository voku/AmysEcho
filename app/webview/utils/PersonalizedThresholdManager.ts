/**
 * Personalized Threshold Manager - Amy First
 * Dynamically adjusts confidence thresholds based on Amy's individual gesture patterns
 */

export interface GesturePerformance {
  gesture: string;
  totalAttempts: number;
  successfulAttempts: number;
  averageConfidence: number;
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

  /**
   * Record a gesture attempt for personalization
   */
  recordAttempt(gesture: string, confidence: number, success: boolean): void {
    let performance = this.gesturePerformance.get(gesture);

    if (!performance) {
      performance = {
        gesture,
        totalAttempts: 0,
        successfulAttempts: 0,
        averageConfidence: 0,
        confidenceSum: 0,
        lastAttemptTime: Date.now(),
        successRate: 0,
        personalizedThreshold: 0.4 // Default MLP threshold
      };
    } else if (!Number.isFinite(performance.confidenceSum)) {
      // Normalize legacy records that predate the confidence sum field
      performance.confidenceSum = performance.averageConfidence * performance.totalAttempts;
    }

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
      const normalized: GesturePerformance = {
        ...performance,
        confidenceSum: Number.isFinite(performance.confidenceSum)
          ? performance.confidenceSum
          : performance.averageConfidence * performance.totalAttempts
      };
      this.gesturePerformance.set(gesture, normalized);
    }
  }

  private calculatePersonalizedThreshold(performance: GesturePerformance): number {
    const { successRate, averageConfidence, totalAttempts } = performance;

    // Base threshold starts at 0.2 (default MLP threshold)
    let threshold = 0.2;

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
    return Math.max(0.2, Math.min(0.6, threshold));
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

    const updatedPerformance: GesturePerformance = { ...performance };
    const previousTotalAttempts = performance.totalAttempts;
    const previousSuccessRate = performance.successRate;
    const previousConfidenceSum = performance.confidenceSum;
    const windowRatio = previousTotalAttempts > 0
      ? this.PERFORMANCE_WINDOW / previousTotalAttempts
      : 0;

    // Scale attempts down while keeping ratios representative
    updatedPerformance.totalAttempts = this.PERFORMANCE_WINDOW;
    updatedPerformance.successfulAttempts = Math.round(previousSuccessRate * updatedPerformance.totalAttempts);
    updatedPerformance.successRate = updatedPerformance.totalAttempts > 0
      ? updatedPerformance.successfulAttempts / updatedPerformance.totalAttempts
      : 0;
    updatedPerformance.confidenceSum = previousConfidenceSum * windowRatio;
    updatedPerformance.averageConfidence = updatedPerformance.totalAttempts > 0
      ? updatedPerformance.confidenceSum / updatedPerformance.totalAttempts
      : 0;
    updatedPerformance.personalizedThreshold = this.calculatePersonalizedThreshold(updatedPerformance);

    this.gesturePerformance.set(gesture, updatedPerformance);
  }
}
