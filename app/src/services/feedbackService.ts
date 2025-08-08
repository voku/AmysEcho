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
