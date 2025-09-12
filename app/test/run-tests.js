const { spawnSync } = require('child_process');
const path = require('path');

const appDir = path.resolve(__dirname, '..');

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
const files = list.stdout.trim().split('\n').filter(Boolean);

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
