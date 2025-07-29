const { readdirSync } = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const testDir = __dirname;
const tests = readdirSync(testDir).filter(f => f.endsWith('.test.ts'));
for (const file of tests) {
  if (file === 'run-tests.js') continue;
  console.log('Running', file);
  execSync(
    `npx ts-node --skip-project --transpile-only --compiler-options '{"module":"commonjs"}' ${path.join(testDir, file)}`,
    {
      stdio: 'inherit',
    }
  );
}
