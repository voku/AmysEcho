/**
 * Enhanced Haptic Feedback Manager - Amy First
 * Provides immediate feedback for every hand movement detection
 */

export interface HapticPattern {
  type: 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'custom';
  intensity: number; // 0-1
  duration?: number; // milliseconds
  repeat?: number; // number of repetitions
  interval?: number; // milliseconds between repetitions
}

export interface HapticEvent {
  event: string;
  pattern: HapticPattern;
  priority: 'low' | 'medium' | 'high' | 'critical';
  context?: any;
}

export class HapticFeedbackManager {
  private lastHapticTime = 0;
  private readonly MIN_HAPTIC_INTERVAL = 100; // Minimum 100ms between haptics
  private readonly MAX_HAPTIC_INTERVAL = 2000; // Maximum 2s between repeated events
  private hapticHistory: Array<{event: string; timestamp: number}> = [];
  private readonly HISTORY_SIZE = 10;

  // Amy's haptic preferences
  private preferences = {
    intensity: 'normal' as 'gentle' | 'normal' | 'strong',
    enableMovementFeedback: true,
    enableGestureFeedback: true,
    enableSuccessFeedback: true,
    enableErrorFeedback: true,
    reduceFrequentHaptics: true, // Prevent haptic spam
    adaptiveIntensity: true // Adjust based on time of day
  };

  // Predefined haptic patterns for different events
  private readonly patterns = {
    // Hand detection and movement
    hand_detected: {
      type: 'light' as const,
      intensity: 0.3,
      duration: 50
    },
    hand_moved: {
      type: 'light' as const,
      intensity: 0.2,
      duration: 30
    },
    hand_stable: {
      type: 'light' as const,
      intensity: 0.4,
      duration: 40
    },

    // Gesture detection stages
    gesture_start: {
      type: 'light' as const,
      intensity: 0.5,
      duration: 60
    },
    gesture_progress: {
      type: 'light' as const,
      intensity: 0.3,
      duration: 40,
      repeat: 2,
      interval: 50
    },
    gesture_complete: {
      type: 'medium' as const,
      intensity: 0.7,
      duration: 80
    },

    // Success and recognition
    gesture_recognized: {
      type: 'success' as const,
      intensity: 0.8,
      duration: 100
    },
    high_confidence: {
      type: 'success' as const,
      intensity: 0.9,
      duration: 120
    },

    // Errors and corrections
    gesture_failed: {
      type: 'error' as const,
      intensity: 0.6,
      duration: 70,
      repeat: 2,
      interval: 100
    },
    low_confidence: {
      type: 'light' as const,
      intensity: 0.4,
      duration: 50
    },

    // Special events
    emergency_detected: {
      type: 'heavy' as const,
      intensity: 1.0,
      duration: 150,
      repeat: 3,
      interval: 100
    },
    combination_start: {
      type: 'medium' as const,
      intensity: 0.6,
      duration: 60,
      repeat: 2,
      interval: 80
    },
    combination_complete: {
      type: 'success' as const,
      intensity: 1.0,
      duration: 200
    },

    // Learning and practice
    practice_start: {
      type: 'light' as const,
      intensity: 0.4,
      duration: 50,
      repeat: 3,
      interval: 150
    },
    practice_success: {
      type: 'success' as const,
      intensity: 0.7,
      duration: 100
    },
    practice_hint: {
      type: 'light' as const,
      intensity: 0.3,
      duration: 40,
      repeat: 2,
      interval: 200
    }
  };

  /**
   * Trigger haptic feedback for a specific event
   */
  triggerHaptic(event: string, context?: any): void {
    // Disable haptic system during testing to avoid interference with existing tests
    if ((window as any).__disableHapticSystem === true) {
      return;
    }

    if (!this.shouldTriggerHaptic(event)) {
      return;
    }

    const pattern = this.getAdaptedPattern(event, context);
    if (!pattern) {
      return;
    }

    const hapticEvent: HapticEvent = {
      event,
      pattern,
      priority: this.getEventPriority(event),
      context
    };

    this.sendHapticToReactNative(hapticEvent);
    this.recordHapticEvent(event);
  }

  /**
   * Trigger haptic for hand detection
   */
  onHandDetected(handCount: number, stability: number): void {
    if (!this.preferences.enableMovementFeedback) {
      return;
    }

    if (handCount === 1) {
      this.triggerHaptic('hand_detected', { handCount, stability });
    } else if (handCount === 2) {
      // Different pattern for two hands
      this.triggerHaptic('hand_detected', { handCount, stability, pattern: 'double' });
    }
  }

  /**
   * Trigger haptic for hand movement
   */
  onHandMovement(movementIntensity: number): void {
    if (!this.preferences.enableMovementFeedback || movementIntensity < 0.1) {
      return;
    }

    // Only trigger for significant movements to avoid spam
    const timeSinceLastMovement = Date.now() - this.lastHapticTime;
    if (timeSinceLastMovement < 200) {
      return;
    }

    this.triggerHaptic('hand_moved', { intensity: movementIntensity });
  }

  /**
   * Trigger haptic for gesture detection stages
   */
  onGestureStage(stage: 'start' | 'progress' | 'complete', gesture: string, confidence: number): void {
    if (!this.preferences.enableGestureFeedback) {
      return;
    }

    const event = `gesture_${stage}`;
    this.triggerHaptic(event, { gesture, confidence });
  }

  /**
   * Trigger haptic for gesture recognition
   */
  onGestureRecognized(gesture: string, confidence: number, isHighConfidence: boolean = false): void {
    if (!this.preferences.enableGestureFeedback) {
      return;
    }

    if (isHighConfidence || confidence > 0.8) {
      this.triggerHaptic('high_confidence', { gesture, confidence });
    } else {
      this.triggerHaptic('gesture_recognized', { gesture, confidence });
    }
  }

  /**
   * Trigger haptic for gesture failure
   */
  onGestureFailed(gesture: string, reason: string): void {
    if (!this.preferences.enableErrorFeedback) {
      return;
    }

    this.triggerHaptic('gesture_failed', { gesture, reason });
  }

  /**
   * Trigger haptic for emergency gestures
   */
  onEmergencyGesture(gesture: string): void {
    this.triggerHaptic('emergency_detected', { gesture, priority: 'critical' });
  }

  /**
   * Trigger haptic for gesture combinations
   */
  onCombinationEvent(event: 'start' | 'complete', combination: string): void {
    const hapticEvent = `combination_${event}`;
    this.triggerHaptic(hapticEvent, { combination });
  }

  /**
   * Trigger haptic for practice sessions
   */
  onPracticeEvent(event: 'start' | 'success' | 'hint'): void {
    const hapticEvent = `practice_${event}`;
    this.triggerHaptic(hapticEvent);
  }

  /**
   * Update Amy's haptic preferences
   */
  updatePreferences(newPreferences: Partial<typeof this.preferences>): void {
    this.preferences = { ...this.preferences, ...newPreferences };
  }

  /**
   * Get current haptic preferences
   */
  getPreferences(): typeof this.preferences {
    return { ...this.preferences };
  }

  /**
   * Check if haptic should be triggered based on timing and preferences
   */
  private shouldTriggerHaptic(event: string): boolean {
    const now = Date.now();

    // Check minimum interval
    if (now - this.lastHapticTime < this.MIN_HAPTIC_INTERVAL) {
      return false;
    }

    // Check for frequent event suppression
    if (this.preferences.reduceFrequentHaptics) {
      const recentEvents = this.hapticHistory.filter(
        h => now - h.timestamp < this.MAX_HAPTIC_INTERVAL
      );

      const sameEventCount = recentEvents.filter(h => h.event === event).length;
      if (sameEventCount >= 3) {
        return false; // Don't spam the same haptic
      }
    }

    return true;
  }

  /**
   * Get adapted haptic pattern based on preferences and context
   */
  private getAdaptedPattern(event: string, context?: any): HapticPattern | null {
    let basePattern = this.patterns[event as keyof typeof this.patterns];

    if (!basePattern) {
      // Fallback to light haptic for unknown events
      basePattern = this.patterns.hand_detected;
    }

    if (!basePattern) {
      return null;
    }

    const adaptedPattern = { ...basePattern };

    // Adjust intensity based on preferences
    if (this.preferences.intensity === 'gentle') {
      adaptedPattern.intensity = Math.max(0.1, adaptedPattern.intensity * 0.6);
    } else if (this.preferences.intensity === 'strong') {
      adaptedPattern.intensity = Math.min(1.0, adaptedPattern.intensity * 1.3);
    }

    // Adjust based on time of day if adaptive intensity is enabled
    if (this.preferences.adaptiveIntensity) {
      const hour = new Date().getHours();
      if (hour >= 6 && hour <= 9) { // Morning - gentler
        adaptedPattern.intensity *= 0.8;
      } else if (hour >= 20 || hour <= 5) { // Evening/Night - slightly stronger for reassurance
        adaptedPattern.intensity = Math.min(1.0, adaptedPattern.intensity * 1.1);
      }
    }

    // Context-specific adjustments
    if (context?.priority === 'critical') {
      adaptedPattern.intensity = 1.0;
      adaptedPattern.repeat = (adaptedPattern.repeat || 1) + 1;
    }

    return adaptedPattern;
  }

  /**
   * Get priority level for haptic event
   */
  private getEventPriority(event: string): 'low' | 'medium' | 'high' | 'critical' {
    const criticalEvents = ['emergency_detected'];
    const highEvents = ['gesture_recognized', 'high_confidence', 'combination_complete'];
    const mediumEvents = ['gesture_complete', 'gesture_start', 'hand_detected'];

    if (criticalEvents.includes(event)) return 'critical';
    if (highEvents.includes(event)) return 'high';
    if (mediumEvents.includes(event)) return 'medium';
    return 'low';
  }

  /**
   * Send haptic event to React Native
   */
  private sendHapticToReactNative(hapticEvent: HapticEvent): void {
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: 'haptic_feedback',
          event: hapticEvent.event,
          pattern: hapticEvent.pattern,
          priority: hapticEvent.priority,
          context: hapticEvent.context,
          timestamp: Date.now()
        })
      );

      this.lastHapticTime = Date.now();
    } catch (error) {
      console.warn('Failed to send haptic feedback:', error);
    }
  }

  /**
   * Record haptic event for frequency tracking
   */
  private recordHapticEvent(event: string): void {
    this.hapticHistory.push({
      event,
      timestamp: Date.now()
    });

    // Maintain history size
    if (this.hapticHistory.length > this.HISTORY_SIZE) {
      this.hapticHistory.shift();
    }
  }

  /**
   * Reset haptic state (for testing or fresh start)
   */
  reset(): void {
    this.hapticHistory = [];
    this.lastHapticTime = 0;
  }

  /**
   * Get haptic statistics
   */
  getHapticStats(): {
    totalHaptics: number;
    recentHaptics: number;
    mostFrequentEvent: string;
    averageInterval: number;
  } {
    const now = Date.now();
    const recentHaptics = this.hapticHistory.filter(h => now - h.timestamp < 60000).length; // Last minute

    const eventCounts: Record<string, number> = {};
    for (const h of this.hapticHistory) {
      eventCounts[h.event] = (eventCounts[h.event] || 0) + 1;
    }

    const mostFrequentEvent = Object.entries(eventCounts)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'none';

    const intervals = [];
    for (let i = 1; i < this.hapticHistory.length; i++) {
      intervals.push(this.hapticHistory[i].timestamp - this.hapticHistory[i - 1].timestamp);
    }
    const averageInterval = intervals.length > 0
      ? intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length
      : 0;

    return {
      totalHaptics: this.hapticHistory.length,
      recentHaptics,
      mostFrequentEvent,
      averageInterval
    };
  }
}