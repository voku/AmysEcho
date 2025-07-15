import { processLandmarks } from '../src/services/mlService';
import { playAudio } from '../src/services/audioService';
import { tmpdir } from 'os';
import { promises as fs } from 'fs';
import path from 'path';

(async () => {
  const result = await processLandmarks([[0,0]]);
  if (result.processedBy !== 'local') {
    throw new Error('mlService should fall back to local');
  }

  const file = path.join(tmpdir(), 'dummy.mp3');
  await fs.writeFile(file, '');
  await playAudio(file);
  console.log('services ok');
})();
