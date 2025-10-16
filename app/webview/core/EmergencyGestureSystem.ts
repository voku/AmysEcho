/**
 * Emergency gesture detection and priority processing system
 * Handles critical gestures that require immediate attention
 */

import { messageBatcher } from '../utils/MessageBatcher';

export class EmergencyGestureSystem {
  private readonly EMERGENCY_GESTURES = new Set([
    'hilfe', 'help', 'emergency', 'stop', 'danger',
    'notfall', 'gefahr', 'au', 'schmerz', 'angst'
  ]);
  private readonly EMERGENCY_CONFIDENCE_THRESHOLD = 0.25; // Very low threshold for emergencies
  private lastEmergencyGestureTime = 0;
  private readonly EMERGENCY_COOLDOWN_MS = 500; // Quick response for repeated emergencies
  private emergencyHistory: Array<{gesture: string; timestamp: number; confidence: number}> = [];
  private readonly MAX_HISTORY = 10;

  /**
   * Check if gesture is an emergency and should be prioritized
   */
  isEmergencyGesture(gesture: string, confidence: number): boolean {
    if (!gesture) return false;
    if (!this.EMERGENCY_GESTURES.has(gesture.toLowerCase())) return false;

    // Emergency gestures bypass normal confidence thresholds
    return confidence >= this.EMERGENCY_CONFIDENCE_THRESHOLD;
  }

  /**
   * Process emergency gesture with priority handling
   */
  processEmergencyGesture(gesture: string, confidence: number, landmarks: number[][][]): {
    shouldProcess: boolean;
    priority: 'critical' | 'high' | 'normal';
    cooldownRemaining: number;
    feedback: string;
  } {
    const now = Date.now();
    const timeSinceLastEmergency = now - this.lastEmergencyGestureTime;

    // Track emergency history
    this.emergencyHistory.push({
      gesture,
      timestamp: now,
      confidence
    });

    if (this.emergencyHistory.length > this.MAX_HISTORY) {
      this.emergencyHistory.shift();
    }

    if (!this.isEmergencyGesture(gesture, confidence)) {
      return {
        shouldProcess: false,
        priority: 'normal',
        cooldownRemaining: 0,
        feedback: ''
      };
    }

    // Check cooldown to prevent spam
    if (timeSinceLastEmergency < this.EMERGENCY_COOLDOWN_MS) {
      return {
        shouldProcess: false,
        priority: 'critical',
        cooldownRemaining: this.EMERGENCY_COOLDOWN_MS - timeSinceLastEmergency,
        feedback: 'Notfall-Geste erkannt, wird verarbeitet...'
      };
    }

    // Process emergency gesture
    this.lastEmergencyGestureTime = now;

    // Send emergency telemetry
    this.sendEmergencyTelemetry(gesture, confidence, landmarks);

    return {
      shouldProcess: true,
      priority: 'critical',
      cooldownRemaining: 0,
      feedback: this.getEmergencyFeedback(gesture)
    };
  }

  /**
   * Get appropriate feedback for emergency gesture
   */
  private getEmergencyFeedback(gesture: string): string {
    const feedbackMap: Record<string, string> = {
      'hilfe': '🆘 Hilfe wird gerufen!',
      'help': '🆘 Help is being called!',
      'emergency': '🚨 Notfall erkannt!',
      'stop': '⏹️ Stop-Signal erkannt!',
      'danger': '⚠️ Gefahr erkannt!',
      'notfall': '🚨 Notfall-Situation!',
      'gefahr': '⚠️ Gefahr-Signal!',
      'au': '😣 Schmerzsignal erkannt!',
      'schmerz': '😣 Pain signal detected!',
      'angst': '😨 Angstsignal erkannt!'
    };

    return feedbackMap[gesture.toLowerCase()] || '🚨 Notfall-Geste erkannt!';
  }

  /**
   * Send emergency telemetry to React Native
   */
  private sendEmergencyTelemetry(
    gesture: string,
    confidence: number,
    landmarks?: number[][][] | null
  ): void {
    const timestamp = Date.now();
    const normalizedLandmarks: number[][][] = (landmarks ?? []) as number[][][];
    const handCount = normalizedLandmarks.length;
    const pointsPerHand =
      handCount > 0 && Array.isArray(normalizedLandmarks[0]) ? normalizedLandmarks[0].length : 0;

    const basePayload = {
      gesture,
      confidence,
      timestamp,
      systemHealth: 'active' as const,
      handCount,
      pointsPerHand,
    };

    try {
      messageBatcher.queueMessage(
        {
          type: 'telemetry',
          event: 'emergency_gesture_detected',
          ...basePayload,
        },
        { flushImmediately: false }
      );
      messageBatcher.queueMessage(
        {
          type: 'emergency_gesture',
          ...basePayload,
        },
        { flushImmediately: true }
      );
    } catch (err) {
      console.error('Failed to enqueue emergency telemetry:', err);
    }
  }

  /**
   * Check if system should enter emergency-only mode
   */
  shouldEnterEmergencyMode(): boolean {
    const recentEmergencies = this.emergencyHistory.filter(
      h => Date.now() - h.timestamp < 30000 // Last 30 seconds
    );

    // Enter emergency mode if 3+ emergencies in 30 seconds
    return recentEmergencies.length >= 3;
  }

  /**
   * Get emergency system status
   */
  getStatus(): {
    activeEmergencies: number;
    lastEmergencyTime: number;
    emergencyModeRecommended: boolean;
  } {
    const recentEmergencies = this.emergencyHistory.filter(
      h => Date.now() - h.timestamp < 60000 // Last minute
    );

    return {
      activeEmergencies: recentEmergencies.length,
      lastEmergencyTime: this.lastEmergencyGestureTime,
      emergencyModeRecommended: this.shouldEnterEmergencyMode()
    };
  }

  /**
   * Reset emergency system (for testing or recovery)
   */
  reset(): void {
    this.emergencyHistory = [];
    this.lastEmergencyGestureTime = 0;
  }
}