import { processLandmarks } from '../../server/src/services/mlService';
import { playAudio, playSystemSound } from '../../server/src/services/audioService';
import { playVideo } from '../../server/src/services/videoService';
import { fetchSuggestions } from '../../server/src/services/dialogService';
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

  // should not throw even if the sound file is missing
  await playSystemSound('success');
  await playSystemSound('error');

  let failed = false;
  try {
    await playAudio('/no/such/file.mp3');
  } catch {
    failed = true;
  }
  if (!failed) {
    throw new Error('missing audio should error');
  }

  const sugg = await fetchSuggestions('hello');
  if (sugg.length !== 0) {
    throw new Error('LLM should be disabled by default');
  }
  console.log('services ok');
})();
