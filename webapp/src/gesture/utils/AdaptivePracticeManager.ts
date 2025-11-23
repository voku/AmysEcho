// @ts-nocheck
/**
 * Adaptive Practice Timing Manager - Amy First Phase 2
 * Ensures practice never interrupts active communication and learns optimal practice times
 */

export interface PracticeSession {
  startTime: number;
  endTime: number;
  duration: number;
  successRate: number;
  gesturesAttempted: number;
  interruptions: number;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: number;
  activityLevel: 'high' | 'low' | 'normal';
}

export interface CommunicationSession {
  startTime: number;
  isActive: boolean;
  gestureCount: number;
  lastGestureTime: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface PracticeSuggestion {
  shouldSuggest: boolean;
  timing: 'immediate' | 'short_delay' | 'optimal_time';
  reason: string;
  confidence: number;
  expectedSuccessRate: number;
}

export class AdaptivePracticeManager {
  private practiceHistory: PracticeSession[] = [];
  private communicationSessions: CommunicationSession[] = [];
  private readonly MAX_HISTORY = 50;
  private readonly SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes of inactivity ends session
  private readonly MIN_COMMUNICATION_GAP_MS = 10 * 60 * 1000; // 10 minutes gap needed for practice

  // Preferred practice times learning
  private preferredTimes: Map<string, {
    successRate: number;
    frequency: number;
    lastPractice: number;
    averageDuration: number;
  }> = new Map();

  // Communication interruption tracking
  private interruptionHistory: Array<{
    timestamp: number;
    wasInterrupted: boolean;
    reason: string;
  }> = [];

  /**
   * Check if practice should be suggested based on current context
   */
  shouldSuggestPractice(
    currentTimeOfDay: 'morning' | 'afternoon' | 'evening' | 'night',
    currentActivity: 'high' | 'low' | 'normal',
    recentCommunication: number // minutes since last communication
  ): PracticeSuggestion {
    // Never interrupt active communication
    if (this.isCommunicationActive()) {
      return {
        shouldSuggest: false,
        timing: 'short_delay',
        reason: 'active_communication',
        confidence: 1.0,
        expectedSuccessRate: 0
      };
    }

    // Check minimum gap after communication
    if (recentCommunication < this.MIN_COMMUNICATION_GAP_MS / (60 * 1000)) {
      return {
        shouldSuggest: false,
        timing: 'short_delay',
        reason: 'recent_communication',
        confidence: 0.9,
        expectedSuccessRate: 0.3
      };
    }

    // Check if current time is optimal for practice
    const timeKey = `${currentTimeOfDay}_${currentActivity}`;
    const timePreference = this.preferredTimes.get(timeKey);

    if (timePreference && timePreference.successRate > 0.6) {
      // This is a preferred time
      return {
        shouldSuggest: true,
        timing: 'immediate',
        reason: 'preferred_time',
        confidence: 0.8,
        expectedSuccessRate: timePreference.successRate
      };
    }

    // Check for calm moments (low activity, good time of day)
    if (currentActivity === 'low' && this.isCalmTime(currentTimeOfDay)) {
      return {
        shouldSuggest: true,
        timing: 'optimal_time',
        reason: 'calm_moment',
        confidence: 0.7,
        expectedSuccessRate: 0.65
      };
    }

    // Default: suggest during optimal times only
    const shouldSuggest = this.isOptimalPracticeTime(currentTimeOfDay, currentActivity);

    return {
      shouldSuggest,
      timing: shouldSuggest ? 'optimal_time' : 'short_delay',
      reason: shouldSuggest ? 'optimal_timing' : 'suboptimal_timing',
      confidence: shouldSuggest ? 0.6 : 0.4,
      expectedSuccessRate: shouldSuggest ? 0.6 : 0.4
    };
  }

  /**
   * Start tracking a communication session
   */
  startCommunicationSession(priority: 'low' | 'medium' | 'high' | 'critical' = 'medium'): void {
    // End any existing session
    this.endCommunicationSession();

    const session: CommunicationSession = {
      startTime: Date.now(),
      isActive: true,
      gestureCount: 0,
      lastGestureTime: Date.now(),
      priority
    };

    this.communicationSessions.push(session);
  }

  /**
   * Record a gesture in the current communication session
   */
  recordGestureInSession(): void {
    const currentSession = this.getCurrentSession();
    if (currentSession && currentSession.isActive) {
      currentSession.gestureCount++;
      currentSession.lastGestureTime = Date.now();
    } else {
      // Start a new session if none is active
      this.startCommunicationSession('medium');
    }
  }

  /**
   * End the current communication session
   */
  endCommunicationSession(): void {
    const currentSession = this.getCurrentSession();
    if (currentSession && currentSession.isActive) {
      currentSession.isActive = false;
      // Could store session data for analysis if needed
    }
  }

  /**
   * Check if there's currently active communication
   */
  isCommunicationActive(): boolean {
    const currentSession = this.getCurrentSession();
    if (!currentSession || !currentSession.isActive) {
      return false;
    }

    // Check if session has timed out
    const timeSinceLastGesture = Date.now() - currentSession.lastGestureTime;
    if (timeSinceLastGesture > this.SESSION_TIMEOUT_MS) {
      this.endCommunicationSession();
      return false;
    }

    return true;
  }

  /**
   * Record a practice session for learning
   */
  recordPracticeSession(
    startTime: number,
    endTime: number,
    successRate: number,
    gesturesAttempted: number,
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night',
    activityLevel: 'high' | 'low' | 'normal',
    wasInterrupted: boolean = false
  ): void {
    const session: PracticeSession = {
      startTime,
      endTime,
      duration: endTime - startTime,
      successRate,
      gesturesAttempted,
      interruptions: wasInterrupted ? 1 : 0,
      timeOfDay,
      dayOfWeek: new Date(startTime).getDay(),
      activityLevel
    };

    this.practiceHistory.push(session);

    // Keep history size manageable
    if (this.practiceHistory.length > this.MAX_HISTORY) {
      this.practiceHistory.shift();
    }

    // Update preferred times
    this.updatePreferredTimes(session);

    // Record interruption if it happened
    if (wasInterrupted) {
      this.interruptionHistory.push({
        timestamp: Date.now(),
        wasInterrupted: true,
        reason: 'practice_during_communication'
      });
    }
  }

  /**
   * Get the current communication session
   */
  private getCurrentSession(): CommunicationSession | null {
    return this.communicationSessions.find(session => session.isActive) || null;
  }

  /**
   * Check if current time is optimal for practice
   */
  private isOptimalPracticeTime(
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night',
    activityLevel: 'high' | 'low' | 'normal'
  ): boolean {
    // Optimal times: afternoon (learning time), evening (family time), low activity
    if (timeOfDay === 'afternoon' || timeOfDay === 'evening') {
      return activityLevel === 'low' || activityLevel === 'normal';
    }

    // Morning can be good if activity is low (before routines ramp up)
    if (timeOfDay === 'morning' && activityLevel === 'low') {
      return true;
    }

    return false;
  }

  /**
   * Check if current time is a calm moment
   */
  private isCalmTime(timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night'): boolean {
    // Calm times: early morning, mid-afternoon, early evening
    const hour = new Date().getHours();

    if (timeOfDay === 'morning' && hour >= 6 && hour <= 8) return true;
    if (timeOfDay === 'afternoon' && hour >= 14 && hour <= 16) return true;
    if (timeOfDay === 'evening' && hour >= 17 && hour <= 19) return true;

    return false;
  }

  /**
   * Update preferred practice times based on session results
   */
  private updatePreferredTimes(session: PracticeSession): void {
    const timeKey = `${session.timeOfDay}_${session.activityLevel}`;
    const existing = this.preferredTimes.get(timeKey);

    if (existing) {
      // Update with weighted average
      const totalSessions = existing.frequency + 1;
      existing.successRate = ((existing.successRate * existing.frequency) + session.successRate) / totalSessions;
      existing.frequency = totalSessions;
      existing.lastPractice = session.endTime;
      existing.averageDuration = ((existing.averageDuration * existing.frequency) + session.duration) / totalSessions;
    } else {
      // New time preference
      this.preferredTimes.set(timeKey, {
        successRate: session.successRate,
        frequency: 1,
        lastPractice: session.endTime,
        averageDuration: session.duration
      });
    }
  }

  /**
   * Get practice timing insights
   */
  getPracticeInsights(): {
    preferredTimes: Array<{
      timeOfDay: string;
      activityLevel: string;
      successRate: number;
      frequency: number;
    }>;
    interruptionRate: number;
    optimalPracticeWindows: string[];
    recentSuccessRate: number;
  } {
    // Get top preferred times
    const sortedPreferences = Array.from(this.preferredTimes.entries())
      .sort(([,a], [,b]) => b.successRate - a.successRate)
      .slice(0, 3)
      .map(([key, data]) => {
        const [timeOfDay, activityLevel] = key.split('_');
        return {
          timeOfDay,
          activityLevel,
          successRate: data.successRate,
          frequency: data.frequency
        };
      });

    // Calculate interruption rate
    const totalInterruptions = this.interruptionHistory.filter(i => i.wasInterrupted).length;
    const interruptionRate = this.interruptionHistory.length > 0 ?
      totalInterruptions / this.interruptionHistory.length : 0;

    // Identify optimal windows
    const optimalWindows: string[] = [];
    if (this.preferredTimes.has('afternoon_low')) optimalWindows.push('afternoon_low_activity');
    if (this.preferredTimes.has('evening_low')) optimalWindows.push('evening_low_activity');
    if (this.preferredTimes.has('morning_low')) optimalWindows.push('morning_low_activity');

    // Calculate recent success rate
    const recentSessions = this.practiceHistory.slice(-5);
    const recentSuccessRate = recentSessions.length > 0 ?
      recentSessions.reduce((sum, s) => sum + s.successRate, 0) / recentSessions.length : 0;

    return {
      preferredTimes: sortedPreferences,
      interruptionRate,
      optimalPracticeWindows: optimalWindows,
      recentSuccessRate
    };
  }

  /**
   * Get time until next optimal practice window
   */
  getTimeToOptimalPractice(): {
    minutesUntilOptimal: number;
    nextOptimalTime: string;
    expectedSuccessRate: number;
  } {
    const now = new Date();
    const currentHour = now.getHours();
    const currentTimeOfDay = this.getTimeOfDay(currentHour);

    // Find next optimal time
    let nextOptimalHour = -1;
    let expectedSuccessRate = 0.5;

    // Check current time first
    if (this.isOptimalPracticeTime(currentTimeOfDay, 'low')) {
      nextOptimalHour = currentHour;
      expectedSuccessRate = 0.7;
    } else {
      // Find next optimal hour
      const optimalHours = [
        { hour: 7, timeOfDay: 'morning' as const },   // 7 AM
        { hour: 15, timeOfDay: 'afternoon' as const }, // 3 PM
        { hour: 18, timeOfDay: 'evening' as const }   // 6 PM
      ];

      for (const optimal of optimalHours) {
        if (optimal.hour > currentHour) {
          nextOptimalHour = optimal.hour;
          const timeKey = `${optimal.timeOfDay}_low`;
          const preference = this.preferredTimes.get(timeKey);
          expectedSuccessRate = preference ? preference.successRate : 0.6;
          break;
        }
      }

      // If no optimal time today, use tomorrow morning
      if (nextOptimalHour === -1) {
        nextOptimalHour = 7;
        expectedSuccessRate = 0.6;
      }
    }

    const hourDiff = (nextOptimalHour - currentHour + 24) % 24;
    const minutesUntilOptimal = hourDiff * 60;

    return {
      minutesUntilOptimal,
      nextOptimalTime: `${nextOptimalHour}:00`,
      expectedSuccessRate
    };
  }

  /**
   * Get time of day from hour
   */
  private getTimeOfDay(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  /**
   * Reset practice timing data
   */
  reset(): void {
    this.practiceHistory = [];
    this.communicationSessions = [];
    this.preferredTimes.clear();
    this.interruptionHistory = [];
  }

  /**
   * Export practice timing data for persistence
   */
  exportPracticeData(): {
    practiceHistory: PracticeSession[];
    preferredTimes: Record<string, any>;
    interruptionHistory: Array<{timestamp: number; wasInterrupted: boolean; reason: string}>;
  } {
    return {
      practiceHistory: this.practiceHistory,
      preferredTimes: Object.fromEntries(this.preferredTimes),
      interruptionHistory: this.interruptionHistory
    };
  }

  /**
   * Import practice timing data from persistence
   */
  importPracticeData(data: {
    practiceHistory: PracticeSession[];
    preferredTimes: Record<string, any>;
    interruptionHistory: Array<{timestamp: number; wasInterrupted: boolean; reason: string}>;
  }): void {
    this.practiceHistory = data.practiceHistory || [];
    this.preferredTimes = new Map(Object.entries(data.preferredTimes || {}));
    this.interruptionHistory = data.interruptionHistory || [];
  }
}