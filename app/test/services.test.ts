import { processLandmarks } from '../../server/src/services/mlService';
import { playAudio, playSystemSound } from '../../server/src/services/audioService';
import { playVideo } from '../../server/src/services/videoService';
import { getLLMSuggestions } from '../../server/src/services/dialogEngine';
import { tmpdir } from 'os';
import { promises as fs } from 'fs';
import path from 'path';

describe('Services', () => {
  it('should run all services without errors', async () => {
    const result = await processLandmarks([[0,0]]);
    expect(result.processedBy).toBe('local');

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
    expect(failed).toBe(true);

    const sugg = await getLLMSuggestions({
      input: 'hello',
      context: [],
      language: 'de',
      age: 4,
    });
    expect(sugg.nextWords.length).toBe(0);
    expect(sugg.caregiverPhrases.length).toBe(0);
  });
});