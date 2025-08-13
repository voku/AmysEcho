const { readdirSync } = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const testDir = __dirname;
const appDir = path.join(testDir, '..');
const tests = readdirSync(testDir).filter(f => f.endsWith('.test.ts'));
for (const file of tests) {
  if (file === 'run-tests.js') continue;
  console.log('Running', file);
  execFileSync('npm', ['test', '--prefix', appDir, '--', path.join(testDir, file)], {
    stdio: 'inherit',
  });
}
