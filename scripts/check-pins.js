#!/usr/bin/env node
const fs = require('fs');

function hasRange(version) {
  return typeof version === 'string' && (/^[~^]/.test(version) || version === 'latest');
}

function checkPkg(file, criticalDeps) {
  const raw = fs.readFileSync(file, 'utf8');
  const pkg = JSON.parse(raw);
  const problems = [];

  const sections = ['dependencies', 'devDependencies'];
  for (const sec of sections) {
    const deps = pkg[sec] || {};
    for (const name of criticalDeps) {
      if (deps[name] && hasRange(deps[name])) {
        problems.push(`${file}: ${sec}.${name} is not pinned ("${deps[name]}")`);
      }
    }
  }
  return problems;
}

const criticalAppDeps = [
  'react',
  'react-native',
  'expo',
  'react-native-vision-camera',
  'react-native-worklets-core',
  'react-native-reanimated',
  '@nozbe/watermelondb',
];
const criticalServerDeps = ['express', 'express-rate-limit'];

let failed = [];
failed = failed.concat(checkPkg('app/package.json', criticalAppDeps));
failed = failed.concat(checkPkg('server/package.json', criticalServerDeps));

if (failed.length) {
  console.error('Dependency pin check failed:');
  for (const f of failed) console.error(' -', f);
  process.exit(1);
} else {
  console.log('All critical dependencies are pinned.');
}

