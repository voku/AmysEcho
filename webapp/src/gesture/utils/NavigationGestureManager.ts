/**
 * Navigation Gesture Manager - Amy First
 * Recognizes simple gestures for navigation back to main screen
 */

export interface NavigationGesture {
  name: string;
  description: string;
  gesture: string; // The actual gesture to detect
  minConfidence: number;
  cooldownMs: number; // Prevent accidental repeated triggers
  feedback: {
    message: string;
    hapticPattern: 'light' | 'medium' | 'heavy';
    soundEnabled: boolean;
  };
}

export interface NavigationTrigger {
  gesture: NavigationGesture;
  confidence: number;
  timestamp: number;
  context: any;
}

export class NavigationGestureManager {
  private navigationGestures: NavigationGesture[] = [
    {
      name: 'home',
      description: 'Return to main recognition screen',
      gesture: 'fist', // Simple closed fist gesture
      minConfidence: 0.7,
      cooldownMs: 2000, // 2 second cooldown
      feedback: {
        message: 'Going home! 👋',
        hapticPattern: 'medium',
        soundEnabled: true
      }
    },
    {
      name: 'back',
      description: 'Go back to previous screen',
      gesture: 'thumbs_down', // Thumbs down for "go back"
      minConfidence: 0.7,
      cooldownMs: 1500,
      feedback: {
        message: 'Going back! ↩️',
        hapticPattern: 'light',
        soundEnabled: true
      }
    },
    {
      name: 'menu',
      description: 'Open main menu',
      gesture: 'open_palm', // Open palm facing up
      minConfidence: 0.75,
      cooldownMs: 2000,
      feedback: {
        message: 'Opening menu! 📱',
        hapticPattern: 'medium',
        soundEnabled: true
      }
    }
  ];

  private lastTriggerTime: Record<string, number> = {};
  private gestureHoldStart: Record<string, number> = {};
  private readonly HOLD_DURATION = 500; // Hold gesture for 500ms to confirm

  /**
   * Check if a detected gesture should trigger navigation
   */
  checkNavigationTrigger(
    gesture: string,
    confidence: number,
    landmarks: number[][][],
    context?: any
  ): NavigationTrigger | null {
    // Find matching navigation gesture
    const navGesture = this.navigationGestures.find(ng => ng.gesture === gesture);
    if (!navGesture) {
      return null;
    }

    // Check confidence threshold
    if (confidence < navGesture.minConfidence) {
      return null;
    }

    // Check cooldown
    const lastTrigger = this.lastTriggerTime[navGesture.name] || 0;
    const now = Date.now();
    if (now - lastTrigger < navGesture.cooldownMs) {
      return null;
    }

    // Check if gesture is being held (for confirmation)
    const holdStart = this.gestureHoldStart[navGesture.name];
    if (!holdStart) {
      // Start holding timer
      this.gestureHoldStart[navGesture.name] = now;
      return null;
    }

    // Check if held long enough
    if (now - holdStart < this.HOLD_DURATION) {
      return null;
    }

    // Create navigation trigger
    const trigger: NavigationTrigger = {
      gesture: navGesture,
      confidence,
      timestamp: now,
      context: context || {}
    };

    // Record trigger time and reset hold timer
    this.lastTriggerTime[navGesture.name] = now;
    delete this.gestureHoldStart[navGesture.name];

    return trigger;
  }

  /**
   * Process navigation trigger and send to React Native
   */
  processNavigationTrigger(trigger: NavigationTrigger): void {
    // Send navigation command to React Native
    this.sendNavigationToReactNative(trigger);

    // Provide feedback
    this.provideNavigationFeedback(trigger);
  }

  /**
   * Reset hold timers (when gesture changes or is interrupted)
   */
  resetHoldTimers(): void {
    this.gestureHoldStart = {};
  }

  /**
   * Get available navigation gestures
   */
  getAvailableNavigationGestures(): NavigationGesture[] {
    return [...this.navigationGestures];
  }

  /**
   * Add custom navigation gesture
   */
  addCustomNavigationGesture(gesture: NavigationGesture): void {
    // Check if gesture already exists
    const existingIndex = this.navigationGestures.findIndex(ng => ng.name === gesture.name);
    if (existingIndex >= 0) {
      this.navigationGestures[existingIndex] = gesture;
    } else {
      this.navigationGestures.push(gesture);
    }
  }

  /**
   * Remove navigation gesture
   */
  removeNavigationGesture(gestureName: string): boolean {
    const index = this.navigationGestures.findIndex(ng => ng.name === gestureName);
    if (index >= 0) {
      this.navigationGestures.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Update navigation gesture settings
   */
  updateNavigationGesture(gestureName: string, updates: Partial<NavigationGesture>): boolean {
    const gesture = this.navigationGestures.find(ng => ng.name === gestureName);
    if (gesture) {
      Object.assign(gesture, updates);
      return true;
    }
    return false;
  }

  /**
   * Get navigation gesture by name
   */
  getNavigationGesture(gestureName: string): NavigationGesture | null {
    return this.navigationGestures.find(ng => ng.name === gestureName) || null;
  }

  /**
   * Check if a gesture is currently being held for navigation
   */
  getHoldProgress(gestureName: string): number {
    const holdStart = this.gestureHoldStart[gestureName];
    if (!holdStart) {
      return 0;
    }

    const elapsed = Date.now() - holdStart;
    return Math.min(1, elapsed / this.HOLD_DURATION);
  }

  /**
   * Get navigation statistics
   */
  getNavigationStats(): {
    totalTriggers: number;
    mostUsedGesture: string;
    averageConfidence: number;
    recentActivity: number; // Triggers in last 5 minutes
  } {
    const now = Date.now();
    const recentThreshold = now - 300000; // 5 minutes ago

    let totalTriggers = 0;
    let totalConfidence = 0;
    let recentCount = 0;
    const usageCount: Record<string, number> = {};

    Object.entries(this.lastTriggerTime).forEach(([gestureName, timestamp]) => {
      totalTriggers++;
      usageCount[gestureName] = (usageCount[gestureName] || 0) + 1;

      // We don't have confidence history, so we'll use a default
      totalConfidence += 0.8; // Assume good confidence

      if (timestamp > recentThreshold) {
        recentCount++;
      }
    });

    const mostUsedGesture = Object.entries(usageCount)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'none';

    return {
      totalTriggers,
      mostUsedGesture,
      averageConfidence: totalTriggers > 0 ? totalConfidence / totalTriggers : 0,
      recentActivity: recentCount
    };
  }

  /**
   * Send navigation command to React Native
   */
  private sendNavigationToReactNative(trigger: NavigationTrigger): void {
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: 'navigation_trigger',
          navigationType: trigger.gesture.name,
          gesture: trigger.gesture.gesture,
          confidence: trigger.confidence,
          feedback: trigger.gesture.feedback,
          timestamp: trigger.timestamp,
          context: trigger.context
        })
      );
    } catch (error) {
      console.warn('Failed to send navigation trigger:', error);
    }
  }

  /**
   * Provide feedback for navigation trigger
   */
  private provideNavigationFeedback(trigger: NavigationTrigger): void {
    const { feedback } = trigger.gesture;

    // Send feedback message
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: 'navigation_feedback',
          message: feedback.message,
          hapticPattern: feedback.hapticPattern,
          soundEnabled: feedback.soundEnabled,
          timestamp: Date.now()
        })
      );
    } catch (error) {
      console.warn('Failed to send navigation feedback:', error);
    }
  }

  /**
   * Reset navigation state
   */
  reset(): void {
    this.lastTriggerTime = {};
    this.gestureHoldStart = {};
  }

  /**
   * Export navigation configuration
   */
  exportConfiguration(): NavigationGesture[] {
    return [...this.navigationGestures];
  }

  /**
   * Import navigation configuration
   */
  importConfiguration(config: NavigationGesture[]): void {
    this.navigationGestures = [...config];
  }
}