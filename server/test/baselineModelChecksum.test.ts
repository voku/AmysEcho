import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';

const LFS_POINTER_PREFIX = 'version https://git-lfs.github.com/spec/v1';
// LFS pointer files are always < 200 bytes; reading this many bytes is sufficient to detect them.
const LFS_POINTER_MAX_HEADER_BYTES = 200;

/**
 * Returns the SHA256 of the model content.
 * When Git LFS is not configured (e.g. in CI), the file on disk is the LFS
 * pointer text.  In that case we extract the OID from the pointer so that the
 * hash comparison is consistent regardless of whether LFS objects are fetched.
 */
function resolveModelHash(buf: Buffer): string {
  const head = buf.toString('utf8', 0, LFS_POINTER_MAX_HEADER_BYTES);
  if (head.startsWith(LFS_POINTER_PREFIX)) {
    const match = head.match(/oid sha256:([a-f0-9]{64})/);
    if (!match) throw new Error('Could not parse OID from LFS pointer');
    return match[1];
  }
  return createHash('sha256').update(buf).digest('hex');
}

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
    const actual = resolveModelHash(modelBuffer);

    expect(expected).toMatch(/^[a-f0-9]{64}$/);
    expect(actual).toBe(expected);
  });
});
