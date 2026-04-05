#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const REPO_ROOT = process.cwd();
const DOC_PATH = path.join(REPO_ROOT, 'docs/integration/api.md');
const INVENTORY_PATH = path.join(REPO_ROOT, 'docs/integration/api-route-inventory.json');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseIndexRoutes(docText) {
  const begin = '<!-- BEGIN ROUTE INDEX -->';
  const end = '<!-- END ROUTE INDEX -->';
  const start = docText.indexOf(begin);
  const finish = docText.indexOf(end);
  if (start === -1 || finish === -1 || finish <= start) {
    fail('Route index markers are missing in docs/integration/api.md');
  }

  const block = docText.slice(start + begin.length, finish);
  const routes = block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim());

  return new Set(routes);
}

function loadLiveInventory() {
  const run = spawnSync('node', ['scripts/generate-api-route-inventory.mjs'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (run.status !== 0) {
    fail(run.stderr || 'Failed to generate route inventory');
  }
  const payload = JSON.parse(run.stdout);
  return new Set(payload.routes.map((entry) => `${entry.method} ${entry.path}`));
}

function loadCommittedInventory() {
  const text = fs.readFileSync(INVENTORY_PATH, 'utf8');
  const payload = JSON.parse(text);
  return new Set(payload.routes.map((entry) => `${entry.method} ${entry.path}`));
}

function diff(expected, actual) {
  const missing = [];
  const extra = [];

  for (const route of expected) {
    if (!actual.has(route)) missing.push(route);
  }
  for (const route of actual) {
    if (!expected.has(route)) extra.push(route);
  }

  missing.sort();
  extra.sort();
  return { missing, extra };
}

const docText = fs.readFileSync(DOC_PATH, 'utf8');
const docRoutes = parseIndexRoutes(docText);
const liveRoutes = loadLiveInventory();
const committedRoutes = loadCommittedInventory();

const docVsLive = diff(liveRoutes, docRoutes);
if (docVsLive.missing.length || docVsLive.extra.length) {
  console.error('API doc route index is out of sync with code.');
  if (docVsLive.missing.length) {
    console.error('\nMissing in docs:');
    docVsLive.missing.forEach((route) => console.error('  + ' + route));
  }
  if (docVsLive.extra.length) {
    console.error('\nNot in code (remove from docs):');
    docVsLive.extra.forEach((route) => console.error('  - ' + route));
  }
  process.exit(1);
}

const snapshotVsLive = diff(liveRoutes, committedRoutes);
if (snapshotVsLive.missing.length || snapshotVsLive.extra.length) {
  console.error('Committed route inventory is out of sync with code.');
  console.error('Run: node scripts/generate-api-route-inventory.mjs --out docs/integration/api-route-inventory.json');
  process.exit(1);
}

console.log(`API docs check passed (${liveRoutes.size} routes).`);
