import { promises as fs } from 'fs';
import path from 'path';

/**
 * Plays an audio file if it exists. In this simplified environment we simply
 * verify the file is present and log the attempt rather than actually
 * outputting sound.
 */
export async function playAudio(filePath: string): Promise<void> {
  await fs.access(filePath);
  console.log(`Playing audio: ${filePath}`);
}

/**
 * Play a simple system sound. In the Node test environment we just verify
 * the sound file exists and log the action.
 */
export async function playSystemSound(
  type: 'success' | 'error',
): Promise<void> {
  const fileName = type === 'success' ? 'success.mp3' : 'error.mp3';
  const filePath = path.join(__dirname, '..', 'assets', 'sounds', fileName);
  try {
    await fs.access(filePath);
    console.log(`Playing system sound: ${filePath}`);
  } catch {
    console.log(`System sound missing: ${type}`);
  }
}

export const audioService = {
  playAudio,
  playSystemSound,
};
