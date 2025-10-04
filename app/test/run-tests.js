const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const appDir = path.resolve(__dirname, '..');

function ensureWebviewBundle() {
  const bundlePath = path.join(appDir, 'webview', 'dist', 'gestureDetector.js');
  if (fs.existsSync(bundlePath)) {
    return;
  }

  const build = spawnSync('npm', ['run', 'build:webview'], {
    cwd: appDir,
    stdio: 'inherit',
    env: process.env,
  });

  if (build.status !== 0) {
    console.error('Failed to build webview bundle required for tests.');
    process.exit(build.status);
  }
}

ensureWebviewBundle();

const rawArgs = process.argv.slice(2).filter((arg) => arg !== '--');

let files = rawArgs;

if (files.length === 0) {
  // Get list of test files from Jest
  const list = spawnSync('npx', ['jest', '--listTests'], {
    cwd: appDir,
    encoding: 'utf8',
    env: { ...process.env, CI: '1' },
  });
  if (list.status !== 0) {
    console.error(list.stderr);
    process.exit(list.status);
  }
  files = list.stdout.trim().split('\n').filter(Boolean);
}

for (const file of files) {
  console.log('Running', file);
  const result = spawnSync(
    process.execPath,
    [
      require.resolve('jest/bin/jest'),
      '--runInBand',
      '--detectOpenHandles',
      '--watchAll=false',
      '--verbose',
      file,
    ],
    {
      cwd: appDir,
      stdio: 'inherit',
      env: { ...process.env, NODE_OPTIONS: '--max_old_space_size=8192', CI: '1' },
    }
  );
  if (result.status !== 0) {
    process.exit(result.status);
  }
}

console.log('All tests passed');
