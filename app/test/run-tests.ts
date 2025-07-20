import { readdirSync } from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const testDir = __dirname;
const tests = readdirSync(testDir).filter(f => f.endsWith('.test.ts'));
for (const file of tests) {
  if (file === 'run-tests.ts') continue;
  console.log('Running', file);
  execSync(`npx ts-node ${path.join(testDir, file)}`, { stdio: 'inherit' });
}
