import * as Haptics from 'expo-haptics';
import { audioService } from './audioService';
import { logger } from '../utils/logger';

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
