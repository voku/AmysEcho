import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

import { resolvePythonExecutable, withProjectPythonPath } from '../src/utils/pythonExecutable.js';

describe('feature schema checksum', () => {
  it('matches between Node and Python', async () => {
    const repoRoot = path.basename(process.cwd()) === 'server'
      ? path.resolve(process.cwd(), '..')
      : process.cwd();
    const schemaPath = path.join(repoRoot, 'spec', 'feature_schema.json');

    const raw = await fs.readFile(schemaPath);
    const nodeHash = createHash('sha256').update(raw).digest('hex');

    const script = [
      'import hashlib, pathlib, sys',
      'path = pathlib.Path(sys.argv[1])',
      'digest = hashlib.sha256(path.read_bytes()).hexdigest()',
      'print(digest)',
    ].join('\n');
    const result = spawnSync(resolvePythonExecutable(), ['-c', script, schemaPath], {
      encoding: 'utf8',
      env: withProjectPythonPath(),
    });

    expect(result.status).toBe(0);
    const pythonHash = result.stdout.trim();
    expect(pythonHash).toMatch(/^[a-f0-9]{64}$/);
    expect(pythonHash).toBe(nodeHash);
  });
});
