// Third-party imports
import * as Haptics from 'expo-haptics';

// Local imports
import { audioService } from './audioService';
import { logger } from '../utils/logger';

/**
 * Enhanced Haptic Feedback Service - Amy First
 *
 * Provides multi-sensory confirmation for gesture recognition with different
 * patterns based on confidence levels and gesture types.
 */

export interface HapticPattern {
  style: Haptics.ImpactFeedbackStyle;
  intensity: 'light' | 'medium' | 'heavy';
  duration?: number; // for custom patterns
  repeat?: number; // number of repetitions
}

/**
 * Get haptic pattern based on gesture confidence
 */
export function getHapticPatternForConfidence(confidence: number): HapticPattern {
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
export function getHapticPatternForGesture(gestureId: string): HapticPattern {
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
 * Enhanced haptic feedback for gesture recognition
 */
export async function gestureHapticFeedback(
  gestureId: string,
  confidence: number,
  isEmergency: boolean = false
): Promise<void> {
  try {
    let pattern: HapticPattern;

    if (isEmergency) {
      // Emergency gestures always get maximum feedback
      pattern = {
        style: Haptics.ImpactFeedbackStyle.Heavy,
        intensity: 'heavy',
        repeat: 3
      };
    } else {
      // Choose the stronger pattern between confidence and gesture type
      const confidencePattern = getHapticPatternForConfidence(confidence);
      const gesturePattern = getHapticPatternForGesture(gestureId);

      // Use the stronger intensity
      pattern = confidencePattern.intensity === 'heavy' || gesturePattern.intensity === 'heavy'
        ? { ...confidencePattern, ...gesturePattern, intensity: 'heavy' as const }
        : confidencePattern.intensity === 'medium' || gesturePattern.intensity === 'medium'
        ? { ...confidencePattern, ...gesturePattern, intensity: 'medium' as const }
        : confidencePattern;
    }

    // Execute haptic pattern
    for (let i = 0; i < (pattern.repeat || 1); i++) {
      await Haptics.impactAsync(pattern.style);

      // Add small delay between repetitions
      if (i < (pattern.repeat || 1) - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

  } catch (error) {
    // Silently fail - don't interrupt gesture processing
    logger.debug('Enhanced haptic feedback failed:', error);
  }
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
    audioService.playSuccessFeedback(text, confidence),
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
