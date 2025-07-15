import { promises as fs } from 'fs';

/**
 * Pretend to play a video file if it exists. In this Node test environment we
 * simply check the file is accessible and log the attempt.
 */
export async function playVideo(filePath: string): Promise<void> {
  await fs.access(filePath);
  console.log(`Playing video: ${filePath}`);
}
