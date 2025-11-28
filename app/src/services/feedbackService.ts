// Third-party imports
import * as Haptics from 'expo-haptics';

// Local imports
import { audioService } from './audioService';
import { logger } from '../utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Enhanced Haptic Feedback Service - Amy First
 *
 * Provides multi-sensory confirmation for gesture recognition with different
 * patterns based on confidence levels and gesture types.
 * Includes context-awareness and Amy's personal preferences.
 */

class AmyFirstHapticService {
  private static instance: AmyFirstHapticService;
  private preferences: AmyHapticPreferences;
  private readonly PREFERENCES_KEY = 'amy_haptic_preferences';

  private constructor() {
    this.preferences = this.getDefaultPreferences();
    this.loadPreferences();
  }

  static getInstance(): AmyFirstHapticService {
    if (!AmyFirstHapticService.instance) {
      AmyFirstHapticService.instance = new AmyFirstHapticService();
    }
    return AmyFirstHapticService.instance;
  }

  private getDefaultPreferences(): AmyHapticPreferences {
    return {
      intensity: 'normal',
      patterns: {
        emergency: {
          style: Haptics.ImpactFeedbackStyle.Heavy,
          intensity: 'heavy',
          repeat: 3
        },
        success: {
          style: Haptics.ImpactFeedbackStyle.Medium,
          intensity: 'medium',
          repeat: 1
        },
        encouragement: {
          style: Haptics.ImpactFeedbackStyle.Light,
          intensity: 'light',
          repeat: 1
        },
        learning: {
          style: Haptics.ImpactFeedbackStyle.Light,
          intensity: 'light',
          repeat: 2
        }
      },
      timeBasedAdjustments: true,
      contextAwareness: true
    };
  }

  private async loadPreferences(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(this.PREFERENCES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.preferences = { ...this.getDefaultPreferences(), ...parsed };
      }
    } catch (error) {
      logger.warn('Failed to load Amy haptic preferences:', error);
    }
  }

  async savePreferences(preferences: Partial<AmyHapticPreferences>): Promise<void> {
    try {
      this.preferences = { ...this.preferences, ...preferences };
      await AsyncStorage.setItem(this.PREFERENCES_KEY, JSON.stringify(this.preferences));
    } catch (error) {
      logger.warn('Failed to save Amy haptic preferences:', error);
    }
  }

  getPreferences(): AmyHapticPreferences {
    return { ...this.preferences };
  }

  /**
   * Context-aware haptic feedback that considers time of day and Amy's recent activity
   */
  async provideContextAwareFeedback(
    gestureId: string,
    confidence: number,
    context?: {
      timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
      recentActivity?: number; // number of recent gestures
      isEmergency?: boolean;
      patternMatch?: boolean; // from context-aware recognition
    }
  ): Promise<void> {
    try {
      // Determine a simple base intensity from confidence (Amy First: predictable & gentle)
      let intensity: 'light' | 'medium' | 'heavy' = confidence >= 0.8 ? 'medium' : confidence >= 0.4 ? 'light' : 'light';
      let repeat = 1;

      // Emergency gestures always get priority
      if (context?.isEmergency || gestureId === 'hilfe' || gestureId === 'help') {
        intensity = 'heavy';
        repeat = 3;
      }

      // Positive gestures: celebratory double pulse
      const positive = ['danke', 'ja', 'gut', 'fertig', 'super', 'toll'];
      if (positive.includes(gestureId)) {
        repeat = 2;
      }

      // Map intensity to platform style
      const toStyle = (i: 'light' | 'medium' | 'heavy') =>
        i === 'light' ? Haptics.ImpactFeedbackStyle.Light : i === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy;

      let pattern: NativeHapticPattern = { style: toStyle(intensity), intensity, repeat };

      if (this.preferences.contextAwareness && context) {
        pattern = this.applyContextAdjustments(pattern, context);
      }

      if (this.preferences.timeBasedAdjustments && context?.timeOfDay) {
        pattern = this.applyTimeAdjustments(pattern, context.timeOfDay);
      }
      const allowRepeat =
        context?.isEmergency || ['hilfe', 'help'].includes(gestureId) || positive.includes(gestureId);
      const adjusted = this.adjustForPreferences(pattern);
      if (!allowRepeat) {
        await Haptics.impactAsync(adjusted.style);
        return;
      }
      await this.executeHapticPattern(adjusted, allowRepeat);
    } catch (error) {
      logger.debug('Context-aware haptic feedback failed:', error);
      // Fallback to basic feedback
      await detectionHapticFeedback();
    }
  }

  private adjustForPreferences(pattern: NativeHapticPattern): NativeHapticPattern {
    const adjusted = { ...pattern };

    // Adjust intensity based on Amy's preference
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

    // Update style based on adjusted intensity
    switch (adjusted.intensity) {
      case 'light':
        adjusted.style = Haptics.ImpactFeedbackStyle.Light;
        break;
      case 'medium':
        adjusted.style = Haptics.ImpactFeedbackStyle.Medium;
        break;
      case 'heavy':
        adjusted.style = Haptics.ImpactFeedbackStyle.Heavy;
        break;
    }

    return adjusted;
  }

  private stepUp(intensity: 'light' | 'medium' | 'heavy'): 'medium' | 'heavy' {
    return intensity === 'light' ? 'medium' : 'heavy';
  }

  private stepDown(intensity: 'light' | 'medium' | 'heavy'): 'light' | 'medium' {
    return intensity === 'heavy' ? 'medium' : 'light';
  }

  private applyContextAdjustments(pattern: NativeHapticPattern, context: any): NativeHapticPattern {
    const adjusted = { ...pattern };

    // Pattern match bonus (from context-aware recognition)
    if (context.patternMatch) {
      adjusted.repeat = Math.min((adjusted.repeat || 1) + 1, 4);
      adjusted.intensity = this.stepUp(adjusted.intensity);
    }

    // Recent activity consideration
    if (context.recentActivity && context.recentActivity > 10) {
      // Amy has been very active - use gentler feedback to avoid overwhelming
      adjusted.intensity = this.stepDown(adjusted.intensity);
    }

    return adjusted;
  }

  private applyTimeAdjustments(pattern: NativeHapticPattern, timeOfDay: string): NativeHapticPattern {
    const adjusted = { ...pattern };

    // Morning: More gentle to not startle
    if (timeOfDay === 'morning') {
      adjusted.intensity = this.stepDown(adjusted.intensity);
      adjusted.repeat = Math.max((adjusted.repeat || 1) - 1, 1);
    }

    // Evening: Slightly more pronounced for better awareness
    if (timeOfDay === 'evening') {
      if (adjusted.intensity === 'light') adjusted.intensity = 'medium';
    }

    return adjusted;
  }

  private async executeHapticPattern(pattern: NativeHapticPattern, allowRepeat: boolean): Promise<void> {
    // Only repeat for emergency (heavy) or celebratory (medium x2) patterns.
    const intended = pattern.repeat || 1;
    const reps = allowRepeat
      ? pattern.intensity === 'heavy'
        ? intended
        : pattern.intensity === 'medium'
          ? Math.min(intended, 2)
          : 1
      : 1;
    for (let i = 0; i < reps; i++) {
      await Haptics.impactAsync(pattern.style);

      // Add delay between repetitions
      if (i < reps - 1) {
        await new Promise(resolve => setTimeout(resolve, 120));
      }
    }
  }

  /**
   * Multi-sensory feedback combining haptic with other senses
   */
  async provideMultiSensoryFeedback(
    gestureId: string,
    confidence: number,
    context?: any,
    options?: {
      includeAudio?: boolean;
      includeVisual?: boolean;
      visualCallback?: () => void;
    }
  ): Promise<void> {
    const tasks: Promise<void>[] = [];

    // Haptic feedback
    tasks.push(this.provideContextAwareFeedback(gestureId, confidence, context));

    // Audio feedback (if enabled)
    if (options?.includeAudio !== false) {
      tasks.push(
        Promise.resolve(audioService.playSuccessFeedback(gestureId, confidence))
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
}

export const amyFirstHapticService = AmyFirstHapticService.getInstance();

export interface NativeHapticPattern {
  style: Haptics.ImpactFeedbackStyle;
  intensity: 'light' | 'medium' | 'heavy';
  duration?: number; // for custom patterns
  repeat?: number; // number of repetitions
}

export interface AmyHapticPreferences {
  intensity: 'gentle' | 'normal' | 'strong';
  patterns: {
    emergency: NativeHapticPattern;
    success: NativeHapticPattern;
    encouragement: NativeHapticPattern;
    learning: NativeHapticPattern;
  };
  timeBasedAdjustments: boolean;
  contextAwareness: boolean;
}

/**
 * Get haptic pattern based on gesture confidence
 */
export function getHapticPatternForConfidence(confidence: number): NativeHapticPattern {
  if (confidence >= 0.8) {
    // High confidence - celebratory feedback
    return {
      style: Haptics.ImpactFeedbackStyle.Heavy,
      intensity: 'heavy',
      repeat: 2
    };
  } else if (confidence >= 0.6) {
    // Medium confidence - positive feedback
    return {
      style: Haptics.ImpactFeedbackStyle.Medium,
      intensity: 'medium'
    };
  } else if (confidence >= 0.3) {
    // Low confidence - gentle encouragement
    return {
      style: Haptics.ImpactFeedbackStyle.Light,
      intensity: 'light'
    };
  } else {
    // Very low confidence - minimal feedback to avoid overwhelming
    return {
      style: Haptics.ImpactFeedbackStyle.Light,
      intensity: 'light'
    };
  }
}

/**
 * Get haptic pattern for gesture type
 */
export function getHapticPatternForGesture(gestureId: string): NativeHapticPattern {
  // Emergency gestures get strongest feedback
  if (gestureId === 'hilfe' || gestureId === 'help') {
    return {
      style: Haptics.ImpactFeedbackStyle.Heavy,
      intensity: 'heavy',
      repeat: 3
    };
  }

  // Positive/encouraging gestures get celebratory feedback
  if (['danke', 'ja', 'gut', 'fertig', 'super', 'toll'].includes(gestureId)) {
    return {
      style: Haptics.ImpactFeedbackStyle.Medium,
      intensity: 'medium',
      repeat: 2
    };
  }

  // Communication gestures get standard feedback
  if (['ich', 'du', 'wir', 'essen', 'trinken', 'spielen'].includes(gestureId)) {
    return {
      style: Haptics.ImpactFeedbackStyle.Light,
      intensity: 'light',
      repeat: 1
    };
  }

  // Question gestures get gentle, inquisitive feedback
  if (['was', 'wer', 'wie', 'wo', 'wann'].includes(gestureId)) {
    return {
      style: Haptics.ImpactFeedbackStyle.Light,
      intensity: 'light',
      repeat: 1
    };
  }

  // Default for other gestures
  return {
    style: Haptics.ImpactFeedbackStyle.Light,
    intensity: 'light'
  };
}

/**
 * Enhanced haptic feedback for gesture recognition - Amy First
 */
export async function gestureHapticFeedback(
  gestureId: string,
  confidence: number,
  isEmergency: boolean = false,
  context?: any
): Promise<void> {
  // Use the new Amy First haptic service for enhanced feedback
  await amyFirstHapticService.provideContextAwareFeedback(gestureId, confidence, {
    ...context,
    isEmergency
  });
}

/**
 * Multi-sensory feedback combining haptic with audio and visual
 */
export async function multiSensoryFeedback(
  gestureId: string,
  confidence: number,
  context?: any,
  options?: {
    includeAudio?: boolean;
    includeVisual?: boolean;
    visualCallback?: () => void;
  }
): Promise<void> {
  await amyFirstHapticService.provideMultiSensoryFeedback(gestureId, confidence, context, options);
}

/**
 * Get Amy's haptic preferences
 */
export function getAmyHapticPreferences(): AmyHapticPreferences {
  return amyFirstHapticService.getPreferences();
}

/**
 * Update Amy's haptic preferences
 */
export async function updateAmyHapticPreferences(preferences: Partial<AmyHapticPreferences>): Promise<void> {
  await amyFirstHapticService.savePreferences(preferences);
}

/**
 * Haptic feedback for gesture detection (any hand movement)
 */
export async function detectionHapticFeedback(): Promise<void> {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch (error) {
    logger.debug('Detection haptic feedback failed:', error);
  }
}

/**
 * Haptic feedback for partial gesture completion
 */
export async function partialGestureHapticFeedback(completion: number): Promise<void> {
  try {
    if (completion >= 0.8) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else if (completion >= 0.5) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    // No feedback for very early stages to avoid overwhelming
  } catch (error) {
    logger.debug('Partial gesture haptic feedback failed:', error);
  }
}

/**
 * Haptic feedback for gesture learning progress
 */
export async function learningProgressHapticFeedback(improvement: number): Promise<void> {
  try {
    if (improvement >= 0.2) {
      // Significant improvement - celebratory
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await new Promise(resolve => setTimeout(resolve, 100));
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else if (improvement >= 0.1) {
      // Good improvement
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      // Small improvement
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } catch (error) {
    logger.debug('Learning progress haptic feedback failed:', error);
  }
}

/**
 * Haptic feedback for gesture streak achievements
 */
export async function streakAchievementHapticFeedback(streakCount: number): Promise<void> {
  try {
    if (streakCount >= 10) {
      // Major achievement - multiple strong pulses
      for (let i = 0; i < 3; i++) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    } else if (streakCount >= 5) {
      // Good streak - double pulse
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await new Promise(resolve => setTimeout(resolve, 100));
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      // Small streak - single medium pulse
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  } catch (error) {
    logger.debug('Streak achievement haptic feedback failed:', error);
  }
}

/**
 * Haptic feedback for encouragement during learning
 */
export async function encouragementHapticFeedback(): Promise<void> {
  try {
    // Gentle, encouraging pattern
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await new Promise(resolve => setTimeout(resolve, 200));
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch (error) {
    logger.debug('Encouragement haptic feedback failed:', error);
  }
}

/**
 * Trigger speech, symbol display and haptic feedback in parallel.
 * Failures in any individual channel should not prevent the others
 * from executing.
 */
export async function triggerSpeakAndShow(
  text: string,
  confidence: number,
  showSymbol: () => void,
): Promise<void> {
  const tasks: Promise<unknown>[] = [
    Promise.resolve(audioService.playSuccessFeedback(text, confidence))
      .catch(error => logger.warn('Audio feedback failed:', error)),
    (async () => {
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (error) {
        logger.warn('Haptics feedback failed:', error);
      }
    })(),
    (async () => {
      try {
        showSymbol();
      } catch (error) {
        logger.warn('Visual feedback failed:', error);
      }
    })(),
  ];
  await Promise.allSettled(tasks);
}

/**
 * Gentle haptic feedback for child-friendly touch targets.
 */
export async function childHaptic(): Promise<void> {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch (error) {
    logger.warn('Child haptic feedback failed:', error);
  }
}
