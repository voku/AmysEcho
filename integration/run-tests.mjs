#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const binDir = path.resolve(__dirname, 'node_modules', '.bin');
const tsxExecutable = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
const tsxPath = path.join(binDir, tsxExecutable);

const rawArgs = process.argv.slice(2);

const nodeFlags = [];
for (let i = 0; i < rawArgs.length; i += 1) {
  const arg = rawArgs[i];
  if (arg === '--grep') {
    const pattern = rawArgs[i + 1];
    if (!pattern) {
      console.error('Missing pattern for --grep');
      process.exit(1);
    }
    nodeFlags.push('--test-name-pattern', pattern);
    i += 1;
  } else if (arg.startsWith('--grep=')) {
    const pattern = arg.slice('--grep='.length);
    if (pattern.length === 0) {
      console.error('Missing pattern for --grep');
      process.exit(1);
    }
    nodeFlags.push('--test-name-pattern', pattern);
  } else {
    nodeFlags.push(arg);
  }
}

const tsxArgs = ['--test', ...nodeFlags, 'test/api.test.js', 'test/training-flow.test.ts', 'test/multimodal-training-flow.test.ts'];

const child = spawn(tsxPath, tsxArgs, {
  cwd: __dirname,
  stdio: 'inherit',
  env: process.env,
  shell: false
});

child.on('exit', code => {
  process.exit(code ?? 0);
});

child.on('error', error => {
  console.error('Failed to launch integration tests:', error);
  process.exit(1);
});
