import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

import { resolvePythonExecutable, withProjectPythonPath } from '../src/utils/pythonExecutable.js';

describe('config path resolution when started from server directory', () => {
  const serverDir = path.resolve(__dirname, '..');
  const originalCwd = process.cwd();
  const originalPathEnv = process.env.PATH ?? '';
  const originalPythonBin = process.env.AMY_PYTHON_BIN;

  afterEach(() => {
    process.chdir(originalCwd);
    process.env.PATH = originalPathEnv;
    if (originalPythonBin) {
      process.env.AMY_PYTHON_BIN = originalPythonBin;
    } else {
      delete process.env.AMY_PYTHON_BIN;
    }
    jest.resetModules();
  });

  it('resolves the training script and spawns it without ENOENT', async () => {
    process.chdir(serverDir);
    jest.resetModules();

    const { config } = await import('../src/config/index.js');
    await expect(fs.access(config.mlpScript)).resolves.toBeUndefined();
    expect(path.relative(serverDir, config.mlpScript)).toBe(
      path.join('src', 'amyserver_tools', 'train_mlp.py'),
    );

    const stubDir = await fs.mkdtemp(path.join(os.tmpdir(), 'train-script-'));
    const argsFile = path.join(stubDir, 'spawn-args.json');
    const stubPath = path.join(stubDir, 'python-stub');
    const stubScript = `#!/usr/bin/env node\nconst fs = require('fs');\nconst args = process.argv.slice(2);\nfs.writeFileSync(${JSON.stringify(
      argsFile,
    )}, JSON.stringify(args), 'utf8');\nprocess.exit(0);\n`;
    await fs.writeFile(stubPath, stubScript, { mode: 0o755 });

    process.env.AMY_PYTHON_BIN = stubPath;
    process.env.PATH = `${stubDir}:${originalPathEnv}`;

    try {
      const { SERVER_DIR, TRAINING_MANIFEST_PATH, DATA_DIR } = await import(
        '../src/constants/modelPaths.js'
      );
      const scriptArgs = [
        path.isAbsolute(config.mlpScript)
          ? config.mlpScript
          : path.join(SERVER_DIR, config.mlpScript),
        '--manifest',
        TRAINING_MANIFEST_PATH,
        '--data-dir',
        DATA_DIR,
      ];

      await new Promise<void>((resolve, reject) => {
        const proc = spawn(resolvePythonExecutable(), scriptArgs, {
          cwd: SERVER_DIR,
          env: withProjectPythonPath({ ...process.env }),
        });
        let stderr = '';
        proc.stderr?.on('data', (chunk) => {
          stderr += chunk.toString();
        });
        proc.on('error', reject);
        proc.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(stderr || `stub exited with code ${code}`));
          }
        });
      });

      const recordedArgs = JSON.parse(await fs.readFile(argsFile, 'utf8')) as string[];
      expect(recordedArgs[0]).toBe(config.mlpScript);
    } finally {
      await fs.rm(stubDir, { recursive: true, force: true });
    }
  });
});
