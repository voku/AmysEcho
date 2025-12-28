import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';

describe('baseline model checksum', () => {
  it('matches the recorded SHA256 checksum', async () => {
    const repoRoot = path.basename(process.cwd()) === 'server'
      ? path.resolve(process.cwd(), '..')
      : process.cwd();
    const modelPath = path.join(repoRoot, 'server', 'data', 'models', 'global', 'amy_model.npz');
    const checksumPath = `${modelPath}.sha256`;

    const [modelBuffer, checksumRaw] = await Promise.all([
      fs.readFile(modelPath),
      fs.readFile(checksumPath, 'utf8'),
    ]);

    const expected = checksumRaw.trim();
    const actual = createHash('sha256').update(modelBuffer).digest('hex');

    expect(expected).toMatch(/^[a-f0-9]{64}$/);
    expect(actual).toBe(expected);
  });
});
