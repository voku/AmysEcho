/**
 * Personalized Confidence Threshold Service - Amy First
 *
 * Dynamically adjusts confidence thresholds based on Amy's individual patterns,
 * time of day preferences, and learning progress. This ensures optimal recognition
 * accuracy while adapting to Amy's unique gesture style and confidence levels.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { contextAwareRecognitionService } from './contextAwareRecognitionService';

export interface ConfidenceProfile {
  gestureId: string;
  baseThreshold: number;
  timeOfDayAdjustments: Record<'morning' | 'afternoon' | 'evening' | 'night', number>;
  learningProgress: number; // 0-1, how well Amy has learned this gesture
  successRate: number; // Rolling success rate for this gesture
  lastUpdated: number;
}

export interface PersonalizedThreshold {
  threshold: number;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  adjustments: string[];
}

class PersonalizedConfidenceService {
  private static instance: PersonalizedConfidenceService;
  private profiles: Map<string, ConfidenceProfile> = new Map();
  private readonly STORAGE_KEY = 'confidence_profiles';
  private readonly MIN_SAMPLES_FOR_ADAPTATION = 5;
  private readonly ADAPTATION_RATE = 0.1; // How quickly to adapt thresholds

  private constructor() {
    this.loadProfiles();
  }

  static getInstance(): PersonalizedConfidenceService {
    if (!PersonalizedConfidenceService.instance) {
      PersonalizedConfidenceService.instance = new PersonalizedConfidenceService();
    }
    return PersonalizedConfidenceService.instance;
  }

  /**
   * Get personalized confidence threshold for a gesture
   */
  getPersonalizedThreshold(gestureId: string, baseConfidence: number): PersonalizedThreshold {
    const profile = this.profiles.get(gestureId);
    const timeOfDay = this.getTimeOfDay();
    const contextAdjustment =
      contextAwareRecognitionService.getContextAdjustment(gestureId, baseConfidence) ||
      { confidenceMultiplier: 1.0, reason: 'No context adjustment' };

    let threshold = 0.5; // Default threshold
    const adjustments: string[] = [];
    let confidence: 'high' | 'medium' | 'low' = 'medium';

    if (profile) {
      // Start with personalized base threshold
      threshold = profile.baseThreshold;
      adjustments.push(`Personalized base: ${threshold.toFixed(2)}`);

      // Apply time-of-day adjustment
      const timeAdjustment = profile.timeOfDayAdjustments[timeOfDay];
      if (typeof timeAdjustment === 'number' && timeAdjustment !== 0) {
        threshold += timeAdjustment;
        threshold = Math.max(0.2, Math.min(0.8, threshold)); // Keep within reasonable bounds
        adjustments.push(`${timeOfDay} adjustment: ${(timeAdjustment > 0 ? '+' : '')}${timeAdjustment.toFixed(2)}`);
      }

      // Apply learning progress adjustment
      if (profile.learningProgress > 0.7) {
        // Amy has mastered this gesture - can be more strict
        threshold += 0.1;
        adjustments.push('Mastered gesture: +0.1');
        confidence = 'high';
      } else if (profile.learningProgress < 0.3) {
        // Amy is still learning - be more lenient
        threshold -= 0.15;
        adjustments.push('Learning gesture: -0.15');
        confidence = 'low';
      }

      // Apply success rate adjustment
      if (profile.successRate > 0.8) {
        threshold += 0.05;
        adjustments.push('High success rate: +0.05');
      } else if (profile.successRate < 0.5) {
        threshold -= 0.1;
        adjustments.push('Low success rate: -0.1');
      }

    } else {
      adjustments.push('Using default threshold: 0.5');
      confidence = 'medium';
    }

    // Apply context adjustment from context-aware service
    if (contextAdjustment.confidenceMultiplier !== 1.0) {
      threshold *= contextAdjustment.confidenceMultiplier;
      adjustments.push(`Context: ×${contextAdjustment.confidenceMultiplier.toFixed(2)} (${contextAdjustment.reason})`);
    }

    // Ensure threshold stays within reasonable bounds
    threshold = Math.max(0.2, Math.min(0.9, threshold));

    return {
      threshold,
      reason: this.generateReason(adjustments),
      confidence,
      adjustments
    };
  }

  /**
   * Record gesture attempt for threshold adaptation
   */
  recordGestureAttempt(gestureId: string, confidence: number, wasSuccessful: boolean): void {
    const profile = this.profiles.get(gestureId) || this.createDefaultProfile(gestureId);
    const timeOfDay = this.getTimeOfDay();

    // Update success rate (rolling average)
    const currentSuccessRate = profile.successRate;
    profile.successRate = (currentSuccessRate * 9 + (wasSuccessful ? 1 : 0)) / 10;

    // Update learning progress based on recent performance
    if (wasSuccessful && confidence > profile.baseThreshold + 0.2) {
      profile.learningProgress = Math.min(1.0, profile.learningProgress + 0.05);
    } else if (!wasSuccessful && confidence < profile.baseThreshold - 0.2) {
      profile.learningProgress = Math.max(0.0, profile.learningProgress - 0.02);
    }

    // Adapt base threshold based on success patterns
    if (profile.successRate > 0.8 && profile.learningProgress > 0.6) {
      // High success rate with good learning - can increase threshold slightly
      profile.baseThreshold = Math.min(0.7, profile.baseThreshold + this.ADAPTATION_RATE * 0.1);
    } else if (profile.successRate < 0.4) {
      // Low success rate - decrease threshold to be more accepting
      profile.baseThreshold = Math.max(0.3, profile.baseThreshold - this.ADAPTATION_RATE * 0.2);
    }

    // Update time-of-day preferences
    if (wasSuccessful) {
      // Slightly lower threshold for this time of day if successful
      profile.timeOfDayAdjustments[timeOfDay] -= this.ADAPTATION_RATE * 0.05;
      profile.timeOfDayAdjustments[timeOfDay] = Math.max(-0.2, profile.timeOfDayAdjustments[timeOfDay]);
    } else if (confidence > profile.baseThreshold - 0.1) {
      // Close but unsuccessful - slightly increase threshold for this time
      profile.timeOfDayAdjustments[timeOfDay] += this.ADAPTATION_RATE * 0.03;
      profile.timeOfDayAdjustments[timeOfDay] = Math.min(0.2, profile.timeOfDayAdjustments[timeOfDay]);
    }

    profile.lastUpdated = Date.now();
    this.profiles.set(gestureId, profile);

    // Save periodically (every 10 attempts)
    if (Math.random() < 0.1) {
      this.saveProfiles();
    }
  }

  /**
   * Get confidence threshold statistics for debugging
   */
  getThresholdStats(): {
    totalProfiles: number;
    averageThreshold: number;
    timeOfDayPreferences: Record<string, number>;
    learningProgress: { mastered: number; learning: number; struggling: number };
  } {
    const profiles = Array.from(this.profiles.values());
    const timeOfDayPreferences: Record<'morning' | 'afternoon' | 'evening' | 'night', number> = {
      morning: 0,
      afternoon: 0,
      evening: 0,
      night: 0
    };

    let mastered = 0;
    let learning = 0;
    let struggling = 0;

    profiles.forEach(profile => {
      if (profile.learningProgress > 0.7) mastered++;
      else if (profile.learningProgress > 0.3) learning++;
      else struggling++;

      Object.entries(profile.timeOfDayAdjustments).forEach(([time, adjustment]) => {
        const key = time as 'morning' | 'afternoon' | 'evening' | 'night';
        if (key in timeOfDayPreferences) {
          timeOfDayPreferences[key] += adjustment;
        }
      });
    });

    // Average the time-of-day preferences
    (Object.keys(timeOfDayPreferences) as Array<'morning' | 'afternoon' | 'evening' | 'night'>).forEach(time => {
      timeOfDayPreferences[time] /= Math.max(1, profiles.length);
    });

    return {
      totalProfiles: profiles.length,
      averageThreshold: profiles.length > 0
        ? profiles.reduce((sum, p) => sum + p.baseThreshold, 0) / profiles.length
        : 0.5,
      timeOfDayPreferences,
      learningProgress: { mastered, learning, struggling }
    };
  }

  /**
   * Reset all profiles (useful for testing or when switching users)
   */
  resetProfiles(): void {
    this.profiles.clear();
    AsyncStorage.removeItem(this.STORAGE_KEY);
  }

  // Private helper methods

  private getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  private createDefaultProfile(gestureId: string): ConfidenceProfile {
    return {
      gestureId,
      baseThreshold: 0.5,
      timeOfDayAdjustments: {
        morning: 0,
        afternoon: 0,
        evening: 0,
        night: 0
      },
      learningProgress: 0.5,
      successRate: 0.5,
      lastUpdated: Date.now()
    };
  }

  private generateReason(adjustments: string[]): string {
    if (adjustments.length === 0) {
      return '';
    }

    if (adjustments.length === 1) {
      return adjustments[0] ?? '';
    }

    const primary = adjustments[0] ?? '';
    const count = adjustments.length - 1;
    return `${primary} (+${count} adjustments)`;
  }

  private async loadProfiles(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.profiles = new Map(Object.entries(parsed));
      }
    } catch (error) {
      console.warn('Failed to load confidence profiles:', error);
    }
  }

  private async saveProfiles(): Promise<void> {
    try {
      const serialized = Object.fromEntries(this.profiles);
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(serialized));
    } catch (error) {
      console.warn('Failed to save confidence profiles:', error);
    }
  }
}

export const personalizedConfidenceService = PersonalizedConfidenceService.getInstance();