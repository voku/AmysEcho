/**
 * Positive-Only Telemetry Service - Amy First
 *
 * Focuses exclusively on successful communication moments and patterns.
 * Celebrates Amy's achievements and helps identify what works best for her.
 *
 * Key principles:
 * - Track only successes, never failures
 * - Celebrate communication achievements
 * - Identify patterns of effective communication
 * - Support caregivers with positive insights
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SuccessMoment {
  gesture: string;
  confidence: number;
  timestamp: number;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: number;
  context?: string; // e.g., "with_favorite_toy", "after_meal"
  duration?: number; // how long the communication moment lasted
  emotionalState?: 'happy' | 'excited' | 'calm' | 'focused';
}

export interface SuccessPattern {
  gesture: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  averageConfidence: number;
  frequency: number;
  lastSuccess: number;
  bestContext?: string;
  emotionalPattern?: string;
  streakCount: number; // consecutive successful uses
}

export interface CommunicationCelebration {
  type: 'milestone' | 'streak' | 'improvement' | 'consistency';
  message: string;
  gesture?: string;
  value?: number;
  priority: 'low' | 'medium' | 'high';
}

export interface PositiveInsights {
  topGestures: Array<{gesture: string; successRate: number; frequency: number}>;
  peakPerformanceTimes: Array<{timeOfDay: string; averageConfidence: number}>;
  communicationStreaks: Array<{gesture: string; currentStreak: number; longestStreak: number}>;
  recentCelebrations: CommunicationCelebration[];
  weeklyProgress: {
    totalSuccesses: number;
    averageConfidence: number;
    mostSuccessfulDay: string;
    improvementTrend: 'improving' | 'stable' | 'celebrating';
  };
}

class PositiveTelemetryService {
  private static instance: PositiveTelemetryService;
  private successMoments: SuccessMoment[] = [];
  private successPatterns: Map<string, SuccessPattern> = new Map();
  private recentCelebrations: CommunicationCelebration[] = [];
  private readonly STORAGE_KEY = 'positive_telemetry_data';
  private readonly MAX_SUCCESS_MOMENTS = 1000;
  private readonly CELEBRATION_STORAGE_KEY = 'communication_celebrations';

  private constructor() {
    this.loadTelemetryData();
  }

  static getInstance(): PositiveTelemetryService {
    if (!PositiveTelemetryService.instance) {
      PositiveTelemetryService.instance = new PositiveTelemetryService();
    }
    return PositiveTelemetryService.instance;
  }

  /**
   * Record a successful communication moment
   */
  recordSuccess(
    gesture: string,
    confidence: number,
    context?: string,
    emotionalState?: 'happy' | 'excited' | 'calm' | 'focused',
    duration?: number
  ): void {
    const now = Date.now();
    const timeOfDay = this.getTimeOfDay();
    const dayOfWeek = new Date().getDay();

    const successMoment: SuccessMoment = {
      gesture,
      confidence,
      timestamp: now,
      timeOfDay,
      dayOfWeek,
    };

    if (context) {
      successMoment.context = context;
    }

    if (emotionalState) {
      successMoment.emotionalState = emotionalState;
    }

    if (duration !== undefined) {
      successMoment.duration = duration;
    }

    // Add to success moments
    this.successMoments.push(successMoment);
    if (this.successMoments.length > this.MAX_SUCCESS_MOMENTS) {
      this.successMoments.shift(); // Remove oldest
    }

    // Update patterns
    this.updateSuccessPattern(gesture, confidence, timeOfDay, context, emotionalState);

    // Check for celebrations
    const celebration = this.checkForCelebration(gesture, confidence);
    if (celebration) {
      this.recentCelebrations.push(celebration);
      if (this.recentCelebrations.length > 10) {
        this.recentCelebrations.shift();
      }
    }

    // Save data periodically
    if (this.successMoments.length % 50 === 0) {
      this.saveTelemetryData();
    }
  }

  /**
   * Get positive insights about Amy's communication
   */
  getPositiveInsights(): PositiveInsights {
    const topGestures = this.getTopPerformingGestures();
    const peakTimes = this.getPeakPerformanceTimes();
    const streaks = this.getCommunicationStreaks();
    const weeklyProgress = this.getWeeklyProgress();

    return {
      topGestures,
      peakPerformanceTimes: peakTimes,
      communicationStreaks: streaks,
      recentCelebrations: [...this.recentCelebrations],
      weeklyProgress
    };
  }

  /**
   * Get success statistics for a specific gesture
   */
  getGestureSuccessStats(gesture: string): {
    totalSuccesses: number;
    averageConfidence: number;
    bestTimeOfDay: string;
    currentStreak: number;
    longestStreak: number;
    favoriteContext?: string;
  } | null {
    const pattern = Array.from(this.successPatterns.values())
      .find(p => p.gesture === gesture);

    if (!pattern) return null;

    const gestureSuccesses = this.successMoments.filter(m => m.gesture === gesture);
    if (gestureSuccesses.length === 0) {
      return null;
    }
    const averageConfidence = gestureSuccesses.reduce((sum, m) => sum + m.confidence, 0) / gestureSuccesses.length;

    const timeOfDayStats = this.getTimeOfDayStats(gesture);
    const firstTimeStat = timeOfDayStats.find(Boolean) ?? null;
    const bestTimeOfDayStat = firstTimeStat
      ? timeOfDayStats.reduce((best, current) =>
          current.averageConfidence > best.averageConfidence ? current : best,
          firstTimeStat,
        )
      : null;
    const bestTimeOfDay = bestTimeOfDayStat?.timeOfDay ?? 'morning';

    const streaks = this.calculateStreaks(gesture);
    const contextStats = this.getContextStats(gesture);
    const firstContextStat = contextStats.find(Boolean) ?? null;
    const favoriteContextStat = firstContextStat
      ? contextStats.reduce((best, current) =>
          current.frequency > best.frequency ? current : best,
          firstContextStat,
        )
      : null;
    const favoriteContext = favoriteContextStat?.context;

    return {
      totalSuccesses: gestureSuccesses.length,
      averageConfidence,
      bestTimeOfDay,
      currentStreak: streaks.current,
      longestStreak: streaks.longest,
      ...(favoriteContext ? { favoriteContext } : {})
    };
  }

  /**
   * Get recent success moments for celebration
   */
  getRecentSuccesses(limit: number = 5): SuccessMoment[] {
    return this.successMoments
      .slice(-limit)
      .reverse(); // Most recent first
  }

  /**
   * Clear old data (for privacy/data management)
   */
  clearOldData(daysToKeep: number = 90): void {
    const cutoffDate = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

    this.successMoments = this.successMoments.filter(m => m.timestamp > cutoffDate);

    // Update patterns based on remaining data
    this.rebuildPatternsFromMoments();

    this.saveTelemetryData();
  }

  // Private helper methods

  private getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  private updateSuccessPattern(
    gesture: string,
    confidence: number,
    timeOfDay: string,
    context?: string,
    emotionalState?: string
  ): void {
    const patternKey = `${gesture}_${timeOfDay}`;
    const existing = this.successPatterns.get(patternKey);

    if (existing) {
      // Update existing pattern
      const newFrequency = existing.frequency + 1;
      const newAverageConfidence = (existing.averageConfidence * existing.frequency + confidence) / newFrequency;

      existing.frequency = newFrequency;
      existing.averageConfidence = newAverageConfidence;
      existing.lastSuccess = Date.now();

      // Update context and emotional patterns
      if (context && (!existing.bestContext || this.getContextFrequency(gesture, context) > this.getContextFrequency(gesture, existing.bestContext))) {
        existing.bestContext = context;
      }

      if (emotionalState && (!existing.emotionalPattern || this.getEmotionalFrequency(gesture, emotionalState) > this.getEmotionalFrequency(gesture, existing.emotionalPattern))) {
        existing.emotionalPattern = emotionalState;
      }

      // Update streak
      existing.streakCount = this.calculateCurrentStreak(gesture);
    } else {
      // Create new pattern
      const newPattern: SuccessPattern = {
        gesture,
        timeOfDay: timeOfDay as any,
        averageConfidence: confidence,
        frequency: 1,
        lastSuccess: Date.now(),
        streakCount: 1,
      };

      if (context) {
        newPattern.bestContext = context;
      }

      if (emotionalState) {
        newPattern.emotionalPattern = emotionalState;
      }

      this.successPatterns.set(patternKey, newPattern);
    }
  }

  private checkForCelebration(gesture: string, confidence: number): CommunicationCelebration | null {
    const gestureStats = this.getGestureSuccessStats(gesture);
    if (!gestureStats) return null;

    // Milestone celebrations
    if (gestureStats.totalSuccesses === 10) {
      return {
        type: 'milestone',
        message: `🎉 ${gesture} milestone! Amy has successfully used this gesture 10 times!`,
        gesture,
        value: 10,
        priority: 'high'
      };
    }

    if (gestureStats.totalSuccesses === 50) {
      return {
        type: 'milestone',
        message: `🏆 Amazing! ${gesture} has been used 50 times successfully!`,
        gesture,
        value: 50,
        priority: 'high'
      };
    }

    // Streak celebrations
    if (gestureStats.currentStreak === 5) {
      return {
        type: 'streak',
        message: `🔥 ${gesture} streak! Amy has used this gesture successfully 5 times in a row!`,
        gesture,
        value: 5,
        priority: 'medium'
      };
    }

    if (gestureStats.currentStreak === 10) {
      return {
        type: 'streak',
        message: `🌟 Incredible ${gesture} streak! 10 successful uses in a row!`,
        gesture,
        value: 10,
        priority: 'high'
      };
    }

    // Confidence improvement
    if (confidence > 0.9) {
      return {
        type: 'improvement',
        message: `💫 Perfect ${gesture}! Amy used this gesture with exceptional confidence!`,
        gesture,
        priority: 'low'
      };
    }

    // Consistency celebration (regular use)
    const recentSuccesses = this.successMoments
      .filter(m => m.gesture === gesture)
      .slice(-7); // Last 7 successes

    if (recentSuccesses.length >= 7) {
      const daysWithSuccess = new Set(recentSuccesses.map(m => new Date(m.timestamp).toDateString())).size;
      if (daysWithSuccess >= 5) { // Used successfully on 5+ different days in the last week
        return {
          type: 'consistency',
          message: `📅 ${gesture} consistency! Amy has been using this gesture regularly all week!`,
          gesture,
          priority: 'medium'
        };
      }
    }

    return null;
  }

  private getTopPerformingGestures(): Array<{gesture: string; successRate: number; frequency: number}> {
    const gestureStats = new Map<string, {total: number; sumConfidence: number}>();

    // Aggregate by gesture
    for (const moment of this.successMoments) {
      const existing = gestureStats.get(moment.gesture) || { total: 0, sumConfidence: 0 };
      gestureStats.set(moment.gesture, {
        total: existing.total + 1,
        sumConfidence: existing.sumConfidence + moment.confidence
      });
    }

    // Convert to array and sort by frequency
    return Array.from(gestureStats.entries())
      .map(([gesture, stats]) => ({
        gesture,
        successRate: stats.sumConfidence / stats.total,
        frequency: stats.total
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5);
  }

  private getPeakPerformanceTimes(): Array<{timeOfDay: string; averageConfidence: number}> {
    const timeStats = new Map<string, {total: number; sumConfidence: number}>();

    for (const moment of this.successMoments) {
      const existing = timeStats.get(moment.timeOfDay) || { total: 0, sumConfidence: 0 };
      timeStats.set(moment.timeOfDay, {
        total: existing.total + 1,
        sumConfidence: existing.sumConfidence + moment.confidence
      });
    }

    return Array.from(timeStats.entries())
      .map(([timeOfDay, stats]) => ({
        timeOfDay,
        averageConfidence: stats.sumConfidence / stats.total
      }))
      .sort((a, b) => b.averageConfidence - a.averageConfidence);
  }

  private getCommunicationStreaks(): Array<{gesture: string; currentStreak: number; longestStreak: number}> {
    const gestures = [...new Set(this.successMoments.map(m => m.gesture))];

    return gestures.map(gesture => {
      const streaks = this.calculateStreaks(gesture);
      return {
        gesture,
        currentStreak: streaks.current,
        longestStreak: streaks.longest
      };
    }).filter(s => s.currentStreak > 0)
      .sort((a, b) => b.currentStreak - a.currentStreak)
      .slice(0, 5);
  }

  private calculateStreaks(gesture: string): {current: number; longest: number} {
    const gestureMoments = this.successMoments
      .filter(m => m.gesture === gesture)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (gestureMoments.length === 0) return { current: 0, longest: 0 };

    let longestStreak = 1;
    let tempStreak = 1;

      for (let i = 1; i < gestureMoments.length; i++) {
        const previousMoment = gestureMoments[i - 1];
        const currentMoment = gestureMoments[i];
        if (!previousMoment || !currentMoment) {
          continue;
        }
        const prevDate = new Date(previousMoment.timestamp).toDateString();
        const currDate = new Date(currentMoment.timestamp).toDateString();

      if (prevDate === currDate) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }

    longestStreak = Math.max(longestStreak, tempStreak);

    // Calculate current streak (consecutive days ending with today or yesterday)

    const recentMoments = gestureMoments.slice(-longestStreak);
    const recentDates = recentMoments.map(m => new Date(m.timestamp).toDateString());
    const uniqueRecentDates = [...new Set(recentDates)].sort();

    // Check if the most recent dates form a consecutive streak
    let streakCount = 0;
    for (let i = uniqueRecentDates.length - 1; i >= 0; i--) {
      const expectedDate = new Date(Date.now() - (uniqueRecentDates.length - 1 - i) * 24 * 60 * 60 * 1000).toDateString();
      if (uniqueRecentDates[i] === expectedDate) {
        streakCount++;
      } else {
        break;
      }
    }

    return { current: streakCount, longest: longestStreak };
  }

  private calculateCurrentStreak(gesture: string): number {
    const streaks = this.calculateStreaks(gesture);
    return streaks.current;
  }

  private getWeeklyProgress(): PositiveInsights['weeklyProgress'] {
    const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const weeklySuccesses = this.successMoments.filter(m => m.timestamp > weekAgo);

    if (weeklySuccesses.length === 0) {
      return {
        totalSuccesses: 0,
        averageConfidence: 0,
        mostSuccessfulDay: 'none',
        improvementTrend: 'stable'
      };
    }

    const totalSuccesses = weeklySuccesses.length;
    const averageConfidence = weeklySuccesses.reduce((sum, m) => sum + m.confidence, 0) / totalSuccesses;

    // Find most successful day
    const dayStats = new Map<string, number>();
    for (const success of weeklySuccesses) {
      const day = new Date(success.timestamp).toLocaleDateString();
      dayStats.set(day, (dayStats.get(day) || 0) + 1);
    }

    const mostSuccessfulDay = Array.from(dayStats.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'none';

    // Calculate improvement trend (simplified - compare first half vs second half of week)
    const midpoint = weekAgo + (3.5 * 24 * 60 * 60 * 1000);
    const firstHalf = weeklySuccesses.filter(m => m.timestamp < midpoint);
    const secondHalf = weeklySuccesses.filter(m => m.timestamp >= midpoint);

    let improvementTrend: 'improving' | 'stable' | 'celebrating' = 'stable';

    if (firstHalf.length > 0 && secondHalf.length > 0) {
      const firstAvg = firstHalf.reduce((sum, m) => sum + m.confidence, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, m) => sum + m.confidence, 0) / secondHalf.length;

      if (secondAvg > firstAvg + 0.1) {
        improvementTrend = 'improving';
      } else if (secondAvg > firstAvg + 0.05) {
        improvementTrend = 'celebrating'; // Small improvement is still worth celebrating
      }
    }

    return {
      totalSuccesses,
      averageConfidence,
      mostSuccessfulDay,
      improvementTrend
    };
  }

  private getTimeOfDayStats(gesture: string): Array<{timeOfDay: string; averageConfidence: number; frequency: number}> {
    const timeStats = new Map<string, {total: number; sumConfidence: number}>();

    for (const moment of this.successMoments.filter(m => m.gesture === gesture)) {
      const existing = timeStats.get(moment.timeOfDay) || { total: 0, sumConfidence: 0 };
      timeStats.set(moment.timeOfDay, {
        total: existing.total + 1,
        sumConfidence: existing.sumConfidence + moment.confidence
      });
    }

    return Array.from(timeStats.entries()).map(([timeOfDay, stats]) => ({
      timeOfDay,
      averageConfidence: stats.sumConfidence / stats.total,
      frequency: stats.total
    }));
  }

  private getContextStats(gesture: string): Array<{context: string; frequency: number; averageConfidence: number}> {
    const contextStats = new Map<string, {total: number; sumConfidence: number}>();

    for (const moment of this.successMoments.filter(m => m.gesture === gesture && m.context)) {
      const context = moment.context!;
      const existing = contextStats.get(context) || { total: 0, sumConfidence: 0 };
      contextStats.set(context, {
        total: existing.total + 1,
        sumConfidence: existing.sumConfidence + moment.confidence
      });
    }

    return Array.from(contextStats.entries()).map(([context, stats]) => ({
      context,
      frequency: stats.total,
      averageConfidence: stats.sumConfidence / stats.total
    }));
  }

  private getContextFrequency(gesture: string, context: string): number {
    return this.successMoments.filter(m => m.gesture === gesture && m.context === context).length;
  }

  private getEmotionalFrequency(gesture: string, emotionalState: string): number {
    return this.successMoments.filter(m => m.gesture === gesture && m.emotionalState === emotionalState).length;
  }

  private rebuildPatternsFromMoments(): void {
    this.successPatterns.clear();

    for (const moment of this.successMoments) {
      this.updateSuccessPattern(
        moment.gesture,
        moment.confidence,
        moment.timeOfDay,
        moment.context,
        moment.emotionalState
      );
    }
  }

  private async loadTelemetryData(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.successMoments = parsed.successMoments || [];
        this.successPatterns = new Map(Object.entries(parsed.successPatterns || {}));
      }

      const celebrationsStored = await AsyncStorage.getItem(this.CELEBRATION_STORAGE_KEY);
      if (celebrationsStored) {
        this.recentCelebrations = JSON.parse(celebrationsStored);
      }
    } catch (error) {
      console.warn('Failed to load positive telemetry data:', error);
    }
  }

  private async saveTelemetryData(): Promise<void> {
    try {
      const data = {
        successMoments: this.successMoments,
        successPatterns: Object.fromEntries(this.successPatterns)
      };
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
      await AsyncStorage.setItem(this.CELEBRATION_STORAGE_KEY, JSON.stringify(this.recentCelebrations));
    } catch (error) {
      console.warn('Failed to save positive telemetry data:', error);
    }
  }
}

export const positiveTelemetryService = PositiveTelemetryService.getInstance();