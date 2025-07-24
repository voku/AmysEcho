import { processLandmarks } from '../../server/src/services/mlService';
import { playAudio, playSystemSound } from '../../server/src/services/audioService';
import { playVideo } from '../../server/src/services/videoService';
import { getLLMSuggestions } from '../../server/src/services/dialogEngine';
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

  const sugg = await getLLMSuggestions({
    input: 'hello',
    context: [],
    language: 'de',
    age: 4,
  });
  if (sugg.nextWords.length !== 0 || sugg.caregiverPhrases.length !== 0) {
    throw new Error('LLM should be disabled by default');
  }
  console.log('services ok');
})();
