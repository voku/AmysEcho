/**
 * Adaptive Practice Timing Service - Amy First
 *
 * Ensures practice suggestions never interrupt Amy's active communication.
 * Learns when Amy is most receptive to practice and schedules accordingly.
 *
 * Key principles:
 * - Never interrupt active communication
 * - Learn Amy's natural communication patterns
 * - Suggest practice only during calm moments
 * - Respect Amy's energy levels and preferences
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CommunicationSession {
  startTime: number;
  endTime?: number;
  duration: number; // in minutes
  gesturesCount: number;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: number;
  energyLevel?: 'high' | 'medium' | 'low';
}

export interface PracticeOpportunity {
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: number;
  confidence: number; // How good this time is for practice
  reason: string;
  lastSuggested?: number;
}

export interface PracticeTimingDecision {
  canSuggestPractice: boolean;
  reason: string;
  suggestedDelay?: number; // minutes to wait
  alternativeTime?: PracticeOpportunity;
  priority: 'high' | 'medium' | 'low';
}

class AdaptivePracticeTimingService {
  private static instance: AdaptivePracticeTimingService;
  private currentSession: CommunicationSession | null = null;
  private recentSessions: CommunicationSession[] = [];
  private practiceOpportunities: Map<string, PracticeOpportunity> = new Map();
  private lastPracticeSuggestion: number = 0;
  private readonly STORAGE_KEY = 'practice_timing_data';
  private readonly MAX_RECENT_SESSIONS = 50;
  private readonly MIN_TIME_BETWEEN_SUGGESTIONS = 30 * 60 * 1000; // 30 minutes
  private readonly COMMUNICATION_TIMEOUT = 5 * 60 * 1000; // 5 minutes of inactivity

  private constructor() {
    this.loadTimingData();
  }

  static getInstance(): AdaptivePracticeTimingService {
    if (!AdaptivePracticeTimingService.instance) {
      AdaptivePracticeTimingService.instance = new AdaptivePracticeTimingService();
    }
    return AdaptivePracticeTimingService.instance;
  }

  /**
   * Start tracking a communication session
   */
  startCommunicationSession(energyLevel?: 'high' | 'medium' | 'low'): void {
    if (this.currentSession) {
      // End previous session if it exists
      this.endCommunicationSession();
    }

    const now = Date.now();
    this.currentSession = {
      startTime: now,
      duration: 0,
      gesturesCount: 0,
      timeOfDay: this.getTimeOfDay(),
      dayOfWeek: new Date().getDay(),
      energyLevel
    };
  }

  /**
   * Record a gesture in the current session
   */
  recordGestureInSession(): void {
    if (this.currentSession) {
      this.currentSession.gesturesCount++;
    }
  }

  /**
   * End the current communication session
   */
  endCommunicationSession(): void {
    if (this.currentSession) {
      const now = Date.now();
      this.currentSession.endTime = now;
      this.currentSession.duration = (now - this.currentSession.startTime) / (1000 * 60); // minutes

      // Add to recent sessions
      this.recentSessions.push(this.currentSession);
      if (this.recentSessions.length > this.MAX_RECENT_SESSIONS) {
        this.recentSessions.shift();
      }

      // Learn from this session
      this.learnFromSession(this.currentSession);

      // Save data
      this.saveTimingData();

      this.currentSession = null;
    }
  }

  /**
   * Check if it's appropriate to suggest practice
   */
  shouldSuggestPractice(): PracticeTimingDecision {
    const now = Date.now();
    const timeOfDay = this.getTimeOfDay();
    const dayOfWeek = new Date().getDay();

    // Check if we're in an active communication session
    if (this.isInActiveCommunication()) {
      return {
        canSuggestPractice: false,
        reason: 'Amy is currently communicating - never interrupt!',
        priority: 'high'
      };
    }

    // Check minimum time between suggestions
    if (now - this.lastPracticeSuggestion < this.MIN_TIME_BETWEEN_SUGGESTIONS) {
      const remainingTime = Math.ceil((this.MIN_TIME_BETWEEN_SUGGESTIONS - (now - this.lastPracticeSuggestion)) / (1000 * 60));
      return {
        canSuggestPractice: false,
        reason: `Recently suggested practice. Wait ${remainingTime} minutes.`,
        suggestedDelay: remainingTime,
        priority: 'medium'
      };
    }

    // Check if this is a good time based on learned patterns
    const opportunityKey = `${timeOfDay}_${dayOfWeek}`;
    const opportunity = this.practiceOpportunities.get(opportunityKey);

    if (opportunity && opportunity.confidence > 0.7) {
      // This is a good time for practice
      return {
        canSuggestPractice: true,
        reason: opportunity.reason,
        priority: 'high'
      };
    }

    // Find the best alternative time
    const alternative = this.findBestAlternativeTime();
    if (alternative) {
      return {
        canSuggestPractice: false,
        reason: `Not the best time. Try ${alternative.timeOfDay} instead.`,
        alternativeTime: alternative,
        priority: 'low'
      };
    }

    // Default: allow practice but with low priority
    return {
      canSuggestPractice: true,
      reason: 'Standard practice time - Amy can choose to practice or not',
      priority: 'low'
    };
  }

  /**
   * Record that practice was suggested
   */
  recordPracticeSuggestion(): void {
    this.lastPracticeSuggestion = Date.now();
    this.saveTimingData();
  }

  /**
   * Get insights about Amy's communication patterns
   */
  getCommunicationInsights(): {
    peakCommunicationTimes: Array<{timeOfDay: string; averageGestures: number}>;
    averageSessionDuration: number;
    preferredPracticeTimes: PracticeOpportunity[];
    communicationFrequency: number; // sessions per day
  } {
    const peakTimes = this.calculatePeakCommunicationTimes();
    const avgDuration = this.calculateAverageSessionDuration();
    const preferredTimes = Array.from(this.practiceOpportunities.values())
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);
    const frequency = this.calculateCommunicationFrequency();

    return {
      peakCommunicationTimes: peakTimes,
      averageSessionDuration: avgDuration,
      preferredPracticeTimes: preferredTimes,
      communicationFrequency: frequency
    };
  }

  /**
   * Force end any stale sessions (for cleanup)
   */
  cleanupStaleSessions(): void {
    if (this.currentSession) {
      const now = Date.now();
      const timeSinceLastGesture = now - this.currentSession.startTime;

      // If more than COMMUNICATION_TIMEOUT has passed, end the session
      if (timeSinceLastGesture > this.COMMUNICATION_TIMEOUT) {
        console.log('Cleaning up stale communication session');
        this.endCommunicationSession();
      }
    }
  }

  // Private helper methods

  private isInActiveCommunication(): boolean {
    if (!this.currentSession) return false;

    const now = Date.now();
    const timeSinceStart = now - this.currentSession.startTime;

    // Consider active if session started recently and has gestures
    return timeSinceStart < this.COMMUNICATION_TIMEOUT && this.currentSession.gesturesCount > 0;
  }

  private getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  private learnFromSession(session: CommunicationSession): void {
    // Learn when Amy communicates most
    const opportunityKey = `${session.timeOfDay}_${session.dayOfWeek}`;
    const existing = this.practiceOpportunities.get(opportunityKey);

    if (existing) {
      // Update existing opportunity
      // If Amy communicated a lot at this time, it's probably not a good practice time
      const communicationIntensity = session.gesturesCount / Math.max(session.duration, 1); // gestures per minute
      const newConfidence = Math.max(0, existing.confidence - (communicationIntensity * 0.1));

      existing.confidence = newConfidence;
      existing.lastSuggested = Date.now();
    } else {
      // Create new opportunity
      // Start with high confidence, will be reduced if Amy communicates here
      this.practiceOpportunities.set(opportunityKey, {
        timeOfDay: session.timeOfDay,
        dayOfWeek: session.dayOfWeek,
        confidence: 0.8, // Start optimistic
        reason: `${session.timeOfDay} appears to be a communication time`,
        lastSuggested: Date.now()
      });
    }

    // Learn from session patterns
    this.learnSessionPatterns(session);
  }

  private learnSessionPatterns(session: CommunicationSession): void {
    // Look for patterns in session timing and duration
    const sessionsAtSameTime = this.recentSessions.filter(s =>
      s.timeOfDay === session.timeOfDay &&
      s.dayOfWeek === session.dayOfWeek &&
      s !== session // Exclude current session
    );

    if (sessionsAtSameTime.length >= 3) {
      const avgGestures = sessionsAtSameTime.reduce((sum, s) => sum + s.gesturesCount, 0) / sessionsAtSameTime.length;
      const currentIntensity = session.gesturesCount;

      // If current session has much higher activity, this might be a peak time
      if (currentIntensity > avgGestures * 1.5) {
        const opportunityKey = `${session.timeOfDay}_${session.dayOfWeek}`;
        const opportunity = this.practiceOpportunities.get(opportunityKey);
        if (opportunity) {
          opportunity.confidence = Math.max(0.2, opportunity.confidence - 0.2); // Reduce confidence for practice
          opportunity.reason = `Peak communication time in ${session.timeOfDay} - avoid practice`;
        }
      }
    }
  }

  private findBestAlternativeTime(): PracticeOpportunity | null {
    let bestOpportunity: PracticeOpportunity | null = null;
    let bestScore = 0;

    for (const opportunity of this.practiceOpportunities.values()) {
      const timeSinceLastSuggestion = opportunity.lastSuggested
        ? Date.now() - opportunity.lastSuggested
        : Infinity;

      // Score based on confidence and time since last suggestion
      const score = opportunity.confidence * Math.min(1, timeSinceLastSuggestion / this.MIN_TIME_BETWEEN_SUGGESTIONS);

      if (score > bestScore && score > 0.6) {
        bestScore = score;
        bestOpportunity = opportunity;
      }
    }

    return bestOpportunity;
  }

  private calculatePeakCommunicationTimes(): Array<{timeOfDay: string; averageGestures: number}> {
    const timeOfDayStats = new Map<string, {totalGestures: number; sessionCount: number}>();

    for (const session of this.recentSessions) {
      const key = session.timeOfDay;
      const existing = timeOfDayStats.get(key) || { totalGestures: 0, sessionCount: 0 };

      timeOfDayStats.set(key, {
        totalGestures: existing.totalGestures + session.gesturesCount,
        sessionCount: existing.sessionCount + 1
      });
    }

    const result: Array<{timeOfDay: string; averageGestures: number}> = [];
    for (const [timeOfDay, stats] of timeOfDayStats) {
      result.push({
        timeOfDay,
        averageGestures: stats.totalGestures / stats.sessionCount
      });
    }

    return result.sort((a, b) => b.averageGestures - a.averageGestures);
  }

  private calculateAverageSessionDuration(): number {
    if (this.recentSessions.length === 0) return 0;

    const totalDuration = this.recentSessions.reduce((sum, session) => sum + session.duration, 0);
    return totalDuration / this.recentSessions.length;
  }

  private calculateCommunicationFrequency(): number {
    if (this.recentSessions.length < 2) return 0;

    // Calculate sessions per day over the last 7 days
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const recentSessions = this.recentSessions.filter(s => s.startTime > sevenDaysAgo);

    if (recentSessions.length === 0) return 0;

    // Estimate sessions per day
    const daysSpan = 7;
    return recentSessions.length / daysSpan;
  }

  private async loadTimingData(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.recentSessions = parsed.recentSessions || [];
        this.practiceOpportunities = new Map(Object.entries(parsed.practiceOpportunities || {}));
        this.lastPracticeSuggestion = parsed.lastPracticeSuggestion || 0;
      }
    } catch (error) {
      console.warn('Failed to load practice timing data:', error);
    }
  }

  private async saveTimingData(): Promise<void> {
    try {
      const data = {
        recentSessions: this.recentSessions,
        practiceOpportunities: Object.fromEntries(this.practiceOpportunities),
        lastPracticeSuggestion: this.lastPracticeSuggestion
      };
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save practice timing data:', error);
    }
  }
}

export const adaptivePracticeTimingService = AdaptivePracticeTimingService.getInstance();