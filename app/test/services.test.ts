import { playAudio, playSystemSound } from '../../server/src/services/audioService';
import { playVideo } from '../../server/src/services/videoService';
import { tmpdir } from 'os';
import { promises as fs } from 'fs';
import path from 'path';

describe('Services integration smoke test', () => {
  it('executes audio, video, and dialog flows without throwing', async () => {
    const audioFile = path.join(tmpdir(), 'dummy.mp3');
    const videoFile = path.join(tmpdir(), 'dummy.mp4');
    await fs.writeFile(audioFile, '');
    await fs.writeFile(videoFile, '');

    await expect(playAudio(audioFile)).resolves.toBeUndefined();
    await expect(playVideo(videoFile)).resolves.toBeUndefined();

    await expect(playSystemSound('success')).resolves.toBeUndefined();
    await expect(playSystemSound('error')).resolves.toBeUndefined();

    // Dialog suggestions are now handled entirely on the client via OpenAI;
    // server-side dialog helpers were removed with the caregiver portal.
  });
});
