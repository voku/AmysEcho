/**
 * Feedback Service for Web
 * Provides haptic and multi-sensory feedback for gestures.
 */

import { audioService } from './audioService';
import { logger } from './logger';

export interface HapticPattern {
  intensity: 'light' | 'medium' | 'heavy';
  repeat?: number;
  duration?: number;
}

export interface HapticPreferences {
  intensity: 'gentle' | 'normal' | 'strong';
  timeBasedAdjustments: boolean;
  contextAwareness: boolean;
}

const PREFERENCES_KEY = 'amy_haptic_preferences';

class FeedbackService {
  private static instance: FeedbackService;
  private preferences: HapticPreferences;

  private constructor() {
    this.preferences = this.getDefaultPreferences();
    this.loadPreferences();
  }

  static getInstance(): FeedbackService {
    if (!FeedbackService.instance) {
      FeedbackService.instance = new FeedbackService();
    }
    return FeedbackService.instance;
  }

  private getDefaultPreferences(): HapticPreferences {
    return {
      intensity: 'normal',
      timeBasedAdjustments: true,
      contextAwareness: true,
    };
  }

  private loadPreferences(): void {
    try {
      const stored = localStorage.getItem(PREFERENCES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.preferences = { ...this.getDefaultPreferences(), ...parsed };
      }
    } catch (error) {
      logger.warn('Failed to load haptic preferences:', error);
    }
  }

  async savePreferences(preferences: Partial<HapticPreferences>): Promise<void> {
    try {
      this.preferences = { ...this.preferences, ...preferences };
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(this.preferences));
    } catch (error) {
      logger.warn('Failed to save haptic preferences:', error);
    }
  }

  getPreferences(): HapticPreferences {
    return { ...this.preferences };
  }

  /**
   * Trigger haptic feedback using Vibration API
   */
  private triggerHaptic(pattern: HapticPattern): void {
    if (!('vibrate' in navigator)) return;

    try {
      const duration = pattern.duration ?? (
        pattern.intensity === 'heavy' ? 100 :
        pattern.intensity === 'medium' ? 50 : 30
      );

      const repeat = pattern.repeat ?? 1;
      const vibrationPattern: number[] = [];

      for (let i = 0; i < repeat; i++) {
        vibrationPattern.push(duration);
        if (i < repeat - 1) {
          vibrationPattern.push(50); // Gap between pulses
        }
      }

      navigator.vibrate(vibrationPattern);
    } catch (error) {
      logger.debug('Haptic feedback failed:', error);
    }
  }

  /**
   * Get haptic pattern based on gesture confidence
   */
  getHapticPatternForConfidence(confidence: number): HapticPattern {
    if (confidence >= 0.8) {
      return { intensity: 'heavy', repeat: 2 };
    } else if (confidence >= 0.6) {
      return { intensity: 'medium' };
    } else if (confidence >= 0.3) {
      return { intensity: 'light' };
    } else {
      return { intensity: 'light' };
    }
  }

  /**
   * Get haptic pattern for gesture type
   */
  getHapticPatternForGesture(gestureId: string): HapticPattern {
    // Emergency gestures get strongest feedback
    if (gestureId === 'hilfe' || gestureId === 'help') {
      return { intensity: 'heavy', repeat: 3 };
    }

    // Positive gestures get celebratory feedback
    if (['danke', 'ja', 'gut', 'fertig', 'super', 'toll'].includes(gestureId)) {
      return { intensity: 'medium', repeat: 2 };
    }

    // Default for other gestures
    return { intensity: 'light' };
  }

  /**
   * Context-aware haptic feedback
   */
  async provideContextAwareFeedback(
    gestureId: string,
    confidence: number,
    context?: {
      timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
      recentActivity?: number;
      isEmergency?: boolean;
    }
  ): Promise<void> {
    try {
      let pattern = this.getHapticPatternForConfidence(confidence);

      // Emergency gestures always get priority
      if (context?.isEmergency || gestureId === 'hilfe' || gestureId === 'help') {
        pattern = { intensity: 'heavy', repeat: 3 };
      }

      // Positive gestures: celebratory double pulse
      const positive = ['danke', 'ja', 'gut', 'fertig', 'super', 'toll'];
      if (positive.includes(gestureId)) {
        pattern.repeat = 2;
      }

      // Apply preference adjustments
      pattern = this.adjustForPreferences(pattern);

      // Apply time-based adjustments
      if (this.preferences.timeBasedAdjustments && context?.timeOfDay) {
        pattern = this.applyTimeAdjustments(pattern, context.timeOfDay);
      }

      this.triggerHaptic(pattern);
    } catch (error) {
      logger.debug('Context-aware haptic feedback failed:', error);
      this.detectionHapticFeedback();
    }
  }

  private adjustForPreferences(pattern: HapticPattern): HapticPattern {
    const adjusted = { ...pattern };

    switch (this.preferences.intensity) {
      case 'gentle':
        if (adjusted.intensity === 'heavy') adjusted.intensity = 'medium';
        else if (adjusted.intensity === 'medium') adjusted.intensity = 'light';
        break;
      case 'strong':
        if (adjusted.intensity === 'light') adjusted.intensity = 'medium';
        else if (adjusted.intensity === 'medium') adjusted.intensity = 'heavy';
        break;
    }

    return adjusted;
  }

  private applyTimeAdjustments(pattern: HapticPattern, timeOfDay: string): HapticPattern {
    const adjusted = { ...pattern };

    // Morning: More gentle
    if (timeOfDay === 'morning') {
      if (adjusted.intensity === 'heavy') adjusted.intensity = 'medium';
      else if (adjusted.intensity === 'medium') adjusted.intensity = 'light';
      adjusted.repeat = Math.max((adjusted.repeat ?? 1) - 1, 1);
    }

    // Evening: Slightly more pronounced
    if (timeOfDay === 'evening') {
      if (adjusted.intensity === 'light') adjusted.intensity = 'medium';
    }

    return adjusted;
  }

  /**
   * Multi-sensory feedback combining haptic with audio and visual
   */
  async provideMultiSensoryFeedback(
    gestureId: string,
    confidence: number,
    context?: Record<string, unknown>,
    options?: {
      includeAudio?: boolean;
      includeVisual?: boolean;
      visualCallback?: () => void;
    }
  ): Promise<void> {
    const tasks: Promise<void>[] = [];

    // Haptic feedback
    tasks.push(this.provideContextAwareFeedback(gestureId, confidence, context as Parameters<typeof this.provideContextAwareFeedback>[2]));

    // Audio feedback (if enabled)
    if (options?.includeAudio !== false) {
      tasks.push(
        audioService.playSuccessFeedback(gestureId, confidence)
          .catch(error => logger.debug('Audio feedback failed:', error))
      );
    }

    // Visual feedback (if enabled and callback provided)
    if (options?.includeVisual !== false && options?.visualCallback) {
      tasks.push(
        Promise.resolve(options.visualCallback())
          .catch(error => logger.debug('Visual feedback failed:', error))
      );
    }

    await Promise.allSettled(tasks);
  }

  /**
   * Enhanced haptic feedback for gesture recognition
   */
  async gestureHapticFeedback(
    gestureId: string,
    confidence: number,
    isEmergency: boolean = false,
    context?: Record<string, unknown>
  ): Promise<void> {
    await this.provideContextAwareFeedback(gestureId, confidence, {
      ...(context as Parameters<typeof this.provideContextAwareFeedback>[2]),
      isEmergency
    });
  }

  /**
   * Haptic feedback for gesture detection
   */
  detectionHapticFeedback(): void {
    this.triggerHaptic({ intensity: 'light' });
  }

  /**
   * Haptic feedback for partial gesture completion
   */
  partialGestureHapticFeedback(completion: number): void {
    if (completion >= 0.8) {
      this.triggerHaptic({ intensity: 'medium' });
    } else if (completion >= 0.5) {
      this.triggerHaptic({ intensity: 'light' });
    }
  }

  /**
   * Haptic feedback for learning progress
   */
  learningProgressHapticFeedback(improvement: number): void {
    if (improvement >= 0.2) {
      this.triggerHaptic({ intensity: 'heavy', repeat: 2 });
    } else if (improvement >= 0.1) {
      this.triggerHaptic({ intensity: 'medium' });
    } else {
      this.triggerHaptic({ intensity: 'light' });
    }
  }

  /**
   * Haptic feedback for streak achievements
   */
  streakAchievementHapticFeedback(streakCount: number): void {
    if (streakCount >= 10) {
      this.triggerHaptic({ intensity: 'heavy', repeat: 3 });
    } else if (streakCount >= 5) {
      this.triggerHaptic({ intensity: 'heavy', repeat: 2 });
    } else {
      this.triggerHaptic({ intensity: 'medium' });
    }
  }

  /**
   * Encouragement haptic feedback
   */
  encouragementHapticFeedback(): void {
    this.triggerHaptic({ intensity: 'light', repeat: 2 });
  }

  /**
   * Child-friendly haptic feedback
   */
  childHaptic(): void {
    this.triggerHaptic({ intensity: 'light' });
  }

  /**
   * Trigger speech, symbol display and haptic feedback in parallel
   */
  async triggerSpeakAndShow(
    text: string,
    confidence: number,
    showSymbol: () => void,
  ): Promise<void> {
    const tasks: Promise<unknown>[] = [
      audioService.playSuccessFeedback(text, confidence)
        .catch(error => logger.warn('Audio feedback failed:', error)),
      Promise.resolve().then(() => this.triggerHaptic({ intensity: 'medium' }))
        .catch(error => logger.warn('Haptics feedback failed:', error)),
      Promise.resolve().then(() => showSymbol())
        .catch(error => logger.warn('Visual feedback failed:', error)),
    ];
    await Promise.allSettled(tasks);
  }
}

export const feedbackService = FeedbackService.getInstance();

// Re-export convenience functions
export const gestureHapticFeedback = feedbackService.gestureHapticFeedback.bind(feedbackService);
export const multiSensoryFeedback = feedbackService.provideMultiSensoryFeedback.bind(feedbackService);
export const detectionHapticFeedback = feedbackService.detectionHapticFeedback.bind(feedbackService);
export const partialGestureHapticFeedback = feedbackService.partialGestureHapticFeedback.bind(feedbackService);
export const learningProgressHapticFeedback = feedbackService.learningProgressHapticFeedback.bind(feedbackService);
export const streakAchievementHapticFeedback = feedbackService.streakAchievementHapticFeedback.bind(feedbackService);
export const encouragementHapticFeedback = feedbackService.encouragementHapticFeedback.bind(feedbackService);
export const childHaptic = feedbackService.childHaptic.bind(feedbackService);
export const triggerSpeakAndShow = feedbackService.triggerSpeakAndShow.bind(feedbackService);
