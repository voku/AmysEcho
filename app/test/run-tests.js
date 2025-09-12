const path = require('path');
const { spawnSync } = require('child_process');

const appDir = path.join(__dirname, '..');
const tests = [
  'test/MediaPipeGestureDetector.test.tsx',
  'test/useOpenAIValidation.test.tsx',
  'test/emotionDetectionService.test.ts',
  'test/emotionalResponseService.test.ts',
];

for (const file of tests) {
  console.log('Running', file);
  const result = spawnSync('npx', ['jest', '--runInBand', '--detectOpenHandles', '--verbose', file], {
    cwd: appDir,
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: "--max_old_space_size=4096" }
  });
  if (result.status !== 0) {
    process.exit(result.status);
  }
}
