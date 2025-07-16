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
  try {
    const video = new Video();
    const customPath = useDgs ? entry.dgsVideoUri : entry.videoUri;
    const source = customPath
      ? { uri: customPath }
      : useDgs
        ? require(`../assets/videos/dgs/${entry.id}.mp4`)
        : require(`../assets/videos/${entry.id}.mp4`);
    await video.loadAsync(source);
    await video.presentFullscreenPlayer();
    await video.playAsync();
    await video.unloadAsync();
  } catch {
    console.log('Video not found for', entry.id);
  }
}
