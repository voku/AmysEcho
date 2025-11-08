const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const appDir = path.resolve(__dirname, '..');
const logRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'amys-echo-jest-'));

function sanitizeLabel(label) {
  return label.replace(/[^a-z0-9.-]+/gi, '_');
}

function handleJestResult(result, label) {
  const stdout = result.stdout ? result.stdout.toString() : '';
  const stderr = result.stderr ? result.stderr.toString() : '';
  const logFile = path.join(logRoot, `${sanitizeLabel(label)}.log`);

  fs.writeFileSync(logFile, stdout);
  if (stderr) {
    fs.appendFileSync(logFile, stderr);
  }

  if (stdout) {
    process.stdout.write(stdout);
  }
  if (stderr) {
    process.stderr.write(stderr);
  }

  const combinedOutput = `${stdout}\n${stderr}`;
  const skippedMatch = combinedOutput.match(/Tests:[^\n]*\b(\d+)\s+skipped\b/i);
  if (skippedMatch && Number(skippedMatch[1]) > 0) {
    console.error(
      `Jest reported skipped tests (${skippedMatch[0].trim()}). See ${logFile} for full output.`
    );
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status);
  }

  return logFile;
}

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

// Allow running specific test files: node run-tests.js path/to/test1.test.ts path/to/test2.test.ts
// Or run all tests by providing no arguments. Additional Jest flags (e.g. --coverage)
// can be passed and will be forwarded automatically.
const filteredArgs = process.argv.slice(2).filter((arg) => arg !== '--');

const optionArgsWithValue = new Set([
  '-c',
  '--config',
  '--runTestsByPath',
  '--testNamePattern',
  '-t',
  '--selectProjects',
  '--maxWorkers',
  '--projects',
  '--outputFile',
  '--reporters',
]);

const jestArgs = [];
const fileArgs = [];

for (let i = 0; i < filteredArgs.length; i += 1) {
  const arg = filteredArgs[i];

  if (optionArgsWithValue.has(arg)) {
    jestArgs.push(arg);
    const next = filteredArgs[i + 1];
    if (next && next !== '--') {
      jestArgs.push(next);
      i += 1;
    }
    continue;
  }

  if (arg.startsWith('-')) {
    jestArgs.push(arg);
    continue;
  }

  fileArgs.push(arg);
}

const shouldRunSequentially = fileArgs.length > 0 || jestArgs.length === 0;

const baseJestArgs = [
  require.resolve('jest/bin/jest'),
  '--runInBand',
  '--detectOpenHandles',
  '--watchAll=false',
  '--verbose',
];

if (shouldRunSequentially) {
  let files = fileArgs;

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
    files = list.stdout
      .split('\n')
      .map((file) => file.trim())
      .filter(Boolean);
  }

  const logFiles = [];

  for (const file of files) {
    console.log('Running', file);
    const result = spawnSync(
      process.execPath,
      [...baseJestArgs, ...jestArgs, file],
      {
        cwd: appDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NODE_OPTIONS: '--max_old_space_size=8192', CI: '1' },
        maxBuffer: 10 * 1024 * 1024,
      }
    );
    const relativeFile = path.relative(appDir, file) || path.basename(file);
    logFiles.push(handleJestResult(result, relativeFile));
  }

  console.log('All tests passed');
  console.log('Jest logs saved to:', logFiles.join(', '));
} else {
  console.log('Running Jest with flags', jestArgs.join(' '));
  const result = spawnSync(
    process.execPath,
    [...baseJestArgs, ...jestArgs],
    {
      cwd: appDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_OPTIONS: '--max_old_space_size=8192', CI: '1' },
      maxBuffer: 10 * 1024 * 1024,
    }
  );

  const logFile = handleJestResult(result, jestArgs.length > 0 ? jestArgs.join('_') : 'all-tests');
  console.log('Jest log saved to:', logFile);
}
