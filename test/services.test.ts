import { processLandmarks } from '../src/services/mlService';
import { playAudio } from '../src/services/audioService';
import { playVideo } from '../src/services/videoService';
import { fetchSuggestions } from '../src/services/dialogService';
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

  const vid = path.join(tmpdir(), 'dummy.mp4');
  await fs.writeFile(vid, '');
  await playVideo(vid);

  const sugg = await fetchSuggestions('hello');
  if (sugg.length !== 0) {
    throw new Error('LLM should be disabled by default');
  }
  console.log('services ok');
})();
