#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.warn(
  '\n`node integration/test-runner.js` is deprecated. Use `npm test --prefix integration` or `node integration/run-tests.mjs` instead.\n',
);

const passthroughArgs = process.argv
  .slice(2)
  .filter((arg) => arg !== 'ci' && arg !== 'local');

const child = spawn(
  process.execPath,
  [path.join(__dirname, 'run-tests.mjs'), ...passthroughArgs],
  {
    cwd: __dirname,
    stdio: 'inherit',
    env: process.env,
  },
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error('Failed to run integration tests:', error);
  process.exit(1);
});
