/**
 * Context-Aware Recognition Service - Amy First
 *
 * Enhances gesture recognition by considering:
 * - Time of day patterns (morning vs evening preferences)
 * - Recent gesture sequences (what Amy typically does next)
 * - Usage frequency patterns (Amy's favorite gestures)
 * - Confidence adjustments based on context
 *
 * This helps Amy communicate more naturally by anticipating her needs
 * and adjusting recognition sensitivity based on learned patterns.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface GestureContext {
  gesture: string;
  confidence: number;
  timestamp: number;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: number; // 0-6, Sunday = 0
  location: 'home' | 'school' | 'playground' | 'other';
  previousGesture?: string;
  sessionDuration: number; // minutes since session start
}

export interface RecognitionPattern {
  gesture: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  location: 'home' | 'school' | 'playground' | 'other';
  averageConfidence: number;
  frequency: number;
  lastUsed: number;
  commonSequences: Array<{
    nextGesture: string;
    probability: number;
    confidence: number;
  }>;
}

export interface ContextAdjustment {
  confidenceMultiplier: number;
  reason: string;
  priority: 'low' | 'medium' | 'high';
}

class ContextAwareRecognitionService {
  private static instance: ContextAwareRecognitionService;
  private patterns: Map<string, RecognitionPattern> = new Map();
  private recentGestures: GestureContext[] = [];
  private sessionStartTime: number = Date.now();
  private currentLocation: 'home' | 'school' | 'playground' | 'other' = 'home';
  private readonly MAX_RECENT_GESTURES = 20;
  private readonly PATTERN_STORAGE_KEY = 'gesture_patterns';
  private readonly CONFIDENCE_HISTORY_SIZE = 10;

  private constructor() {
    this.loadPatterns();
  }

  static getInstance(): ContextAwareRecognitionService {
    if (!ContextAwareRecognitionService.instance) {
      ContextAwareRecognitionService.instance = new ContextAwareRecognitionService();
    }
    return ContextAwareRecognitionService.instance;
  }

  setLocation(location: 'home' | 'school' | 'playground' | 'other'): void {
    this.currentLocation = location;
  }

  /**
   * Record a gesture detection for pattern learning
   */
  recordGesture(gesture: string, confidence: number, previousGesture?: string): void {
    const now = Date.now();
    const timeOfDay = this.getTimeOfDay();
    const dayOfWeek = new Date().getDay();
    const sessionDuration = (now - this.sessionStartTime) / (1000 * 60); // minutes
    const location = this.currentLocation;

    const context: GestureContext = {
      gesture,
      confidence,
      timestamp: now,
      timeOfDay,
      dayOfWeek,
      location,
      previousGesture,
      sessionDuration
    };

    // Add to recent gestures
    this.recentGestures.push(context);
    if (this.recentGestures.length > this.MAX_RECENT_GESTURES) {
      this.recentGestures.shift();
    }

    // Update patterns
    this.updatePattern(gesture, confidence, timeOfDay, location);
    if (previousGesture) {
      this.updateSequenceForPrevious(previousGesture, gesture, confidence, timeOfDay, location);
    }

    // Save patterns periodically (every 10 gestures)
    if (this.recentGestures.length % 10 === 0) {
      this.savePatterns();
    }
  }

  /**
   * Get context-based confidence adjustment for a gesture
   */
  getContextAdjustment(gesture: string, baseConfidence: number): ContextAdjustment {
    const timeOfDay = this.getTimeOfDay();
    const patternKey = `${gesture}_${timeOfDay}_${this.currentLocation}`;
    const pattern = this.patterns.get(patternKey);

    let confidenceMultiplier = 1.0;
    let reason = 'Standard recognition';
    let priority: 'low' | 'medium' | 'high' = 'low';

    // Time-of-day adjustment
    if (pattern) {
      const timeAdjustment = this.calculateTimeOfDayAdjustment(pattern, baseConfidence);
      confidenceMultiplier *= timeAdjustment.multiplier;
      if (timeAdjustment.multiplier !== 1.0) {
        reason = timeAdjustment.reason;
        priority = timeAdjustment.priority;
      }
    } else {
      // Fallback: if there are patterns for this gesture at other times of day, apply a gentle preference boost
      const anyPatterns = Array.from(this.patterns.values()).filter(p => p.gesture === gesture);
      if (anyPatterns.length > 0) {
        confidenceMultiplier *= 1.05;
        reason = 'Known time-of-day preference detected';
        if (priority === 'low') priority = 'medium';
      }
    }

    // Sequence prediction adjustment
    const sequenceAdjustment = this.getSequenceAdjustment(gesture);
    if (sequenceAdjustment.multiplier > 1.0) {
      confidenceMultiplier *= sequenceAdjustment.multiplier;
      if (sequenceAdjustment.priority === 'high') {
        reason = sequenceAdjustment.reason;
        priority = 'high';
      }
    }

    // Frequency-based adjustment (Amy's favorites get slight boost)
    const frequencyAdjustment = this.getFrequencyAdjustment(gesture);
    if (frequencyAdjustment.multiplier > 1.0) {
      confidenceMultiplier *= frequencyAdjustment.multiplier;
      if (frequencyAdjustment.priority === 'medium' && priority === 'low') {
        reason = frequencyAdjustment.reason;
        priority = 'medium';
      }
    }

    // Session duration adjustment (Amy might get tired or more confident over time)
    const sessionAdjustment = this.getSessionAdjustment();
    confidenceMultiplier *= sessionAdjustment.multiplier;

    return {
      confidenceMultiplier,
      reason,
      priority
    };
  }

  /**
   * Get predicted next gestures based on current context
   */
  getPredictedGestures(currentGesture?: string): Array<{gesture: string; probability: number; reason: string}> {
    if (!currentGesture) {
      // Return most frequent gestures for this time of day
      return this.getTimeOfDayFavorites();
    }

    const timeOfDay = this.getTimeOfDay();
    const patternKey = `${currentGesture}_${timeOfDay}_${this.currentLocation}`;
    const pattern = this.patterns.get(patternKey);

    if (!pattern || !pattern.commonSequences.length) {
      return [];
    }

    return pattern.commonSequences
      .filter(seq => seq.probability > 0.3) // Only high probability sequences
      .map(seq => ({
        gesture: seq.nextGesture,
        probability: seq.probability,
        reason: `Folgt häufig auf ${currentGesture} ${timeOfDay} in ${this.currentLocation}`
      }))
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 3); // Top 3 predictions
  }

  /**
   * Reset session (call when starting new communication session)
   */
  resetSession(): void {
    this.sessionStartTime = Date.now();
    this.recentGestures = [];
  }

  /**
   * Get recognition insights for caregivers
   */
  getInsights(): {
    timeOfDayPatterns: Array<{timeOfDay: string; favoriteGesture: string; confidence: number}>;
    commonSequences: Array<{from: string; to: string; frequency: number}>;
    confidenceTrends: Array<{gesture: string; trend: 'improving' | 'stable' | 'declining'}>;
  } {
    const timeOfDayPatterns = this.getTimeOfDayPatterns();
    const commonSequences = this.getCommonSequences();
    const confidenceTrends = this.getConfidenceTrends();

    return {
      timeOfDayPatterns,
      commonSequences,
      confidenceTrends
    };
  }

  // Private helper methods

  private getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  private updatePattern(gesture: string, confidence: number, timeOfDay: string, location: string): void {
    const patternKey = `${gesture}_${timeOfDay}_${location}`;
    const existing = this.patterns.get(patternKey);

    if (existing) {
      // Update existing pattern
      const newFrequency = existing.frequency + 1;
      const newAverageConfidence = (existing.averageConfidence * existing.frequency + confidence) / newFrequency;

      existing.frequency = newFrequency;
      existing.averageConfidence = newAverageConfidence;
      existing.lastUsed = Date.now();

      // Sequence updates handled separately via updateSequenceForPrevious
    } else {
      // Create new pattern
      this.patterns.set(patternKey, {
        gesture,
        timeOfDay: timeOfDay as any,
        location: location as any,
        averageConfidence: confidence,
        frequency: 1,
        lastUsed: Date.now(),
        commonSequences: []
      });
    }
  }

  private updateSequenceForPrevious(previousGesture: string, currentGesture: string, confidence: number, timeOfDay: string, location: string): void {
    const prevKey = `${previousGesture}_${timeOfDay}_${location}`;
    let pattern = this.patterns.get(prevKey);
    if (!pattern) {
      pattern = {
        gesture: previousGesture,
        timeOfDay: timeOfDay as any,
        location: location as any,
        averageConfidence: confidence,
        frequency: 1,
        lastUsed: Date.now(),
        commonSequences: []
      };
      this.patterns.set(prevKey, pattern);
    }
    const existingSeq = pattern.commonSequences.find(seq => seq.nextGesture === currentGesture);

    if (existingSeq) {
      // Update existing sequence
      const newProbability = (existingSeq.probability * existingSeq.confidence + confidence) / (existingSeq.confidence + 1);
      existingSeq.probability = Math.min(1.0, newProbability + 0.1); // Slight boost for recency
      existingSeq.confidence += 1;
    } else {
      // Add new sequence
      pattern.commonSequences.push({
        nextGesture: currentGesture,
        probability: 0.5, // Start with moderate probability
        confidence: 1
      });
    }

    // Keep only top sequences
    pattern.commonSequences.sort((a, b) => b.probability - a.probability);
    pattern.commonSequences = pattern.commonSequences.slice(0, 5);
  }

  private calculateTimeOfDayAdjustment(pattern: RecognitionPattern, baseConfidence: number): {multiplier: number; reason: string; priority: 'low' | 'medium' | 'high'} {
    const confidenceDiff = baseConfidence - pattern.averageConfidence;
    const absDiff = Math.abs(confidenceDiff);

    // Need at least 3 data points for reliable pattern
    if (pattern.frequency < 2) {
      return { multiplier: 1.0, reason: 'Insufficient time-of-day data', priority: 'low' };
    }

    if (absDiff < 0.1) {
      return { multiplier: 1.05, reason: 'Slight time-of-day preference detected', priority: 'medium' };
    }

    if (confidenceDiff > 0.15) {
      // Current confidence is higher than usual for this time
      return {
        multiplier: 1.15,
        reason: `Amy is particularly confident with ${pattern.gesture} at ${pattern.timeOfDay}`,
        priority: 'high'
      };
    }

    if (confidenceDiff < -0.15) {
      // Current confidence is lower than usual
      return {
        multiplier: 0.9,
        reason: `Amy typically struggles with ${pattern.gesture} at ${pattern.timeOfDay}`,
        priority: 'medium'
      };
    }

    return { multiplier: 1.02, reason: 'Slight time-of-day preference detected', priority: 'low' };
  }

  private getSequenceAdjustment(gesture: string): {multiplier: number; reason: string; priority: 'low' | 'medium' | 'high'} {
    if (this.recentGestures.length < 2) return { multiplier: 1.0, reason: 'Not enough sequence data', priority: 'low' };

    const lastGesture = this.recentGestures[this.recentGestures.length - 1];
    const timeOfDay = this.getTimeOfDay();
    const prevKey = `${lastGesture.gesture}_${timeOfDay}_${lastGesture.location}`;
    const pattern = this.patterns.get(prevKey);

    if (!pattern) return { multiplier: 1.0, reason: 'No sequence pattern found', priority: 'low' };

    const sequence = pattern.commonSequences.find(seq => seq.nextGesture === gesture);
    if (!sequence || sequence.probability < 0.3) {
      return { multiplier: 1.0, reason: 'No strong sequence prediction', priority: 'low' };
    }

    return {
      multiplier: 1.0 + (sequence.probability * 0.2), // Up to 20% boost for strong sequences
      reason: `Often follows ${lastGesture.gesture} (${Math.round(sequence.probability * 100)}% probability)`,
      priority: sequence.probability > 0.6 ? 'high' : 'medium'
    };
  }

  private getFrequencyAdjustment(gesture: string): {multiplier: number; reason: string; priority: 'low' | 'medium' | 'high'} {
    const timeOfDay = this.getTimeOfDay();
    const patternKey = `${gesture}_${timeOfDay}_${this.currentLocation}`;
    const pattern = this.patterns.get(patternKey);

    if (!pattern || pattern.frequency < 3) {
      return { multiplier: 1.0, reason: 'Not enough frequency data', priority: 'low' };
    }

    // Calculate relative frequency compared to other gestures at this time
    const timeOfDayPatterns = Array.from(this.patterns.values())
      .filter(p => p.timeOfDay === timeOfDay && p.location === this.currentLocation);

    if (timeOfDayPatterns.length < 2) {
      return { multiplier: 1.0, reason: 'Not enough comparison data', priority: 'low' };
    }

    const avgFrequency = timeOfDayPatterns.reduce((sum, p) => sum + p.frequency, 0) / timeOfDayPatterns.length;
    const relativeFrequency = pattern.frequency / avgFrequency;

    if (relativeFrequency > 1.5) {
      return {
        multiplier: 1.1,
        reason: `${gesture} is one of Amy's favorite gestures at ${timeOfDay}`,
        priority: 'medium'
      };
    }

    return { multiplier: 1.0, reason: 'Standard frequency', priority: 'low' };
  }

  private getSessionAdjustment(): {multiplier: number; reason: string} {
    const sessionMinutes = (Date.now() - this.sessionStartTime) / (1000 * 60);

    if (sessionMinutes < 5) {
      return { multiplier: 1.0, reason: 'Early session' };
    }

    if (sessionMinutes > 30) {
      // Amy might be tired or more experienced
      const recentConfidence = this.getRecentAverageConfidence();
      if (recentConfidence > 0.7) {
        return { multiplier: 1.05, reason: 'Amy is getting more confident' };
      } else {
        return { multiplier: 0.95, reason: 'Amy might be getting tired' };
      }
    }

    return { multiplier: 1.0, reason: 'Mid-session' };
  }

  private getRecentAverageConfidence(): number {
    if (this.recentGestures.length === 0) return 0.5;

    const recent = this.recentGestures.slice(-5); // Last 5 gestures
    const sum = recent.reduce((acc, g) => acc + g.confidence, 0);
    return sum / recent.length;
  }

  private getTimeOfDayFavorites(): Array<{gesture: string; probability: number; reason: string}> {
    const timeOfDay = this.getTimeOfDay();
    const location = this.currentLocation;
    const timeOfDayPatterns = Array.from(this.patterns.values())
      .filter(p => p.timeOfDay === timeOfDay && p.location === location)
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 3);

    return timeOfDayPatterns.map(pattern => ({
      gesture: pattern.gesture,
      probability: Math.min(0.8, pattern.frequency / 10), // Scale probability
      reason: `Amy's favorite at ${timeOfDay} (${pattern.frequency} times)`
    }));
  }

  private getTimeOfDayPatterns(): Array<{timeOfDay: string; favoriteGesture: string; confidence: number}> {
    const timeOfDays: Array<'morning' | 'afternoon' | 'evening' | 'night'> = ['morning', 'afternoon', 'evening', 'night'];

    return timeOfDays.map(timeOfDay => {
      const patterns = Array.from(this.patterns.values())
        .filter(p => p.timeOfDay === timeOfDay && p.location === this.currentLocation)
        .sort((a, b) => b.frequency - a.frequency);

      const favorite = patterns[0];
      return {
        timeOfDay,
        favoriteGesture: favorite?.gesture || 'none',
        confidence: favorite?.averageConfidence || 0
      };
    });
  }

  private getCommonSequences(): Array<{from: string; to: string; frequency: number}> {
    const sequences: Array<{from: string; to: string; frequency: number}> = [];

    for (const pattern of this.patterns.values()) {
      if (pattern.location !== this.currentLocation) continue;
      for (const seq of pattern.commonSequences) {
        if (seq.probability > 0.4) {
          sequences.push({
            from: pattern.gesture,
            to: seq.nextGesture,
            frequency: seq.confidence
          });
        }
      }
    }

    return sequences.sort((a, b) => b.frequency - a.frequency).slice(0, 10);
  }

  private getConfidenceTrends(): Array<{gesture: string; trend: 'improving' | 'stable' | 'declining'}> {
    const trends: Array<{gesture: string; trend: 'improving' | 'stable' | 'declining'}> = [];

    // Group recent gestures by gesture type
    const gestureGroups = new Map<string, number[]>();

    for (const gesture of this.recentGestures.slice(-this.CONFIDENCE_HISTORY_SIZE)) {
      if (!gestureGroups.has(gesture.gesture)) {
        gestureGroups.set(gesture.gesture, []);
      }
      gestureGroups.get(gesture.gesture)!.push(gesture.confidence);
    }

    for (const [gesture, confidences] of gestureGroups) {
      if (confidences.length < 3) continue;

      const firstHalf = confidences.slice(0, Math.floor(confidences.length / 2));
      const secondHalf = confidences.slice(Math.floor(confidences.length / 2));

      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      const diff = secondAvg - firstAvg;

      let trend: 'improving' | 'stable' | 'declining';
      if (diff > 0.1) trend = 'improving';
      else if (diff < -0.1) trend = 'declining';
      else trend = 'stable';

      trends.push({ gesture, trend });
    }

    return trends;
  }

  private async loadPatterns(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(this.PATTERN_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.patterns = new Map(
          Object.entries(parsed).map(([key, value]) => {
            const pattern = value as RecognitionPattern;
            if (!pattern.location) {
              pattern.location = 'home';
            }
            return [key, pattern];
          })
        );
      }
    } catch (error) {
      console.warn('Failed to load gesture patterns:', error);
    }
  }

  private async savePatterns(): Promise<void> {
    try {
      const serialized = Object.fromEntries(this.patterns);
      await AsyncStorage.setItem(this.PATTERN_STORAGE_KEY, JSON.stringify(serialized));
    } catch (error) {
      console.warn('Failed to save gesture patterns:', error);
    }
  }
}

export const contextAwareRecognitionService = ContextAwareRecognitionService.getInstance();
