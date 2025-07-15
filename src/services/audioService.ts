import { promises as fs } from 'fs';

/**
 * Plays an audio file if it exists. In this simplified environment we simply
 * verify the file is present and log the attempt rather than actually
 * outputting sound.
 */
export async function playAudio(filePath: string): Promise<void> {
  await fs.access(filePath);
  console.log(`Playing audio: ${filePath}`);
}
