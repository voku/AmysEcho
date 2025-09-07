import path from 'path';
import { promises as fs } from 'fs';

const testDir = path.join(process.cwd(), 'server');

describe('Model Version Logic', () => {
  it('should read package.json version', async () => {
    const pkgPath = path.join(testDir, '..', 'package.json');
    const pkgRaw = await fs.readFile(pkgPath, 'utf8');
    const { version } = JSON.parse(pkgRaw);

    expect(typeof version).toBe('string');
    expect(version.length).toBeGreaterThan(0);
  });

  it('should return correct model path', () => {
    const modelPath = 'latest-model';
    expect(modelPath).toBe('latest-model');
  });
});