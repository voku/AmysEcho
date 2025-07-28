import { GestureModelEntry } from '../model';
import * as FileSystem from 'expo-file-system';
import { logger } from '../utils/logger';

/**
 * Attempt to play a DGS video for the given symbol. If the file is missing
 * nothing happens and we just log the attempt.
 */
export async function playSymbolVideo(
  entry: GestureModelEntry,
  useDgs = false,
): Promise<void> {
  if (!useDgs || !entry.dgsVideoUri) {
    logger.info('DGS video not requested or not available for:', entry.id);
    return;
  }

  try {
    const videoUri = entry.dgsVideoUri; // Use dgsVideoUri for DGS videos
    const info = await FileSystem.getInfoAsync(videoUri);

    if (info.exists) {
      logger.info(`DGS video found for ${entry.id} at ${videoUri}. RecognitionScreen will handle playback.`);
      // The RecognitionScreen is now responsible for showing the SymbolVideoPlayer
      // based on the `showVideoPlayer` state.
    } else {
      logger.warn(`DGS video not found for ${entry.id} at ${videoUri}`);
    }
  } catch (error) {
    logger.error(`Error checking DGS video for ${entry.id}:`, error);
  }
}