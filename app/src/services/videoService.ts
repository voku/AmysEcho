import { Video } from 'expo-av';
import { GestureModelEntry } from '../model';

/**
 * Attempt to play a DGS video for the given symbol. If the file is missing
 * nothing happens and we just log the attempt.
 */
export async function playSymbolVideo(
  entry: GestureModelEntry,
  useDgs = false,
): Promise<void> {
  console.log('Video playback not implemented yet for:', entry.id);
}
