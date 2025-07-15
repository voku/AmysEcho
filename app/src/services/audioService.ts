import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { GestureModelEntry } from '../model';

/**
 * Attempts to play a pre-recorded audio file for the given symbol. If not found,
 * falls back to text-to-speech using the symbol label.
 */
export async function playSymbolAudio(entry: GestureModelEntry): Promise<void> {
  try {
    const sound = new Audio.Sound();
    await sound.loadAsync(require(`../assets/sounds/${entry.id}.mp3`));
    await sound.playAsync();
    await sound.unloadAsync();
  } catch {
    Speech.speak(entry.label);
  }
}
