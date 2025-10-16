import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

describe('MediaPipe vision bundle', () => {
  const bundlePath = path.resolve(__dirname, '../webview/vision_bundle.js');
  const checksumPath = path.resolve(__dirname, '../webview/vision_bundle.sha256');
  const documentationPath = path.resolve(__dirname, '../../docs/VisionBundleSource.md');

  it('matches the pinned checksum from vision_bundle.sha256', async () => {
    const bundle = await fs.readFile(bundlePath);
    const expectedChecksum = (await fs.readFile(checksumPath, 'utf8')).trim();
    const actualChecksum = createHash('sha256').update(bundle).digest('hex');

    expect(actualChecksum).toBe(expectedChecksum);
  });

  it('documents the upstream source for regeneration', async () => {
    const documentation = await fs.readFile(documentationPath, 'utf8');

    expect(documentation).toMatch(/https:\/\/cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-vision@/);
    expect(documentation).toMatch(/Definition-of-Done/i);
    const expectedChecksum = (await fs.readFile(checksumPath, 'utf8')).trim();
    expect(documentation).toContain(expectedChecksum);
  });
});
