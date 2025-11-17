import { playAudio, playSystemSound } from '../../server/src/services/audioService';
import { playVideo } from '../../server/src/services/videoService';
import { tmpdir } from 'os';
import { promises as fs } from 'fs';
import path from 'path';

describe('Services integration smoke test', () => {
  it('executes audio and video flows without throwing', async () => {
    const audioFile = path.join(tmpdir(), 'dummy.mp3');
    const videoFile = path.join(tmpdir(), 'dummy.mp4');
    await fs.writeFile(audioFile, '');
    await fs.writeFile(videoFile, '');

    await expect(playAudio(audioFile)).resolves.toBeUndefined();
    await expect(playVideo(videoFile)).resolves.toBeUndefined();

    await expect(playSystemSound('success')).resolves.toBeUndefined();
    await expect(playSystemSound('error')).resolves.toBeUndefined();

    // Dialog suggestions are fully removed; only the gesture training loop remains.
  });
});
