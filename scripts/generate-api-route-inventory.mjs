#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const REPO_ROOT = process.cwd();
const ROUTE_DIR = path.join(REPO_ROOT, 'server/src/routes');
const TARGET_FILES = ['server/src/server.ts'].concat(
  fs.readdirSync(ROUTE_DIR)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => 'server/src/routes/' + name),
);

const METHOD_PATTERN = "\\b(?<target>app|router)\\.(?<method>get|post|put|patch|delete)\\(\\s*(?<quote>[\"'])(?<route>[^\"']+)\\k<quote>";
const MOUNT_PATTERN = "\\bapp\\.use\\(\\s*([\"'])([^\"']+)\\1\\s*,\\s*([a-zA-Z_$][\\w$]*)\\s*\\)";

function indexToLine(text, index) {
  return text.slice(0, index).split('\n').length;
}

function parseRoutes(filePath, text, targetName) {
  const routePattern = new RegExp(METHOD_PATTERN, 'g');
  const routes = [];
  let match;
  while ((match = routePattern.exec(text)) !== null) {
    if (match.groups?.target !== targetName) continue;
    routes.push({
      method: match.groups.method.toUpperCase(),
      path: match.groups.route,
      source: filePath,
      line: indexToLine(text, match.index),
    });
  }
  return routes;
}

function parseRouterMounts(text) {
  const mountPattern = new RegExp(MOUNT_PATTERN, 'g');
  const mounts = new Map();
  let match;
  while ((match = mountPattern.exec(text)) !== null) {
    mounts.set(match[3], match[2]);
  }
  return mounts;
}

function joinPaths(basePath, routePath) {
  const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  const child = routePath.startsWith('/') ? routePath : '/' + routePath;
  return base + child;
}

function buildInventory() {
  const inventory = [];

  for (const relPath of TARGET_FILES) {
    const absPath = path.join(REPO_ROOT, relPath);
    const text = fs.readFileSync(absPath, 'utf8');

    for (const route of parseRoutes(relPath, text, 'app')) {
      inventory.push(route);
    }

    const mounts = parseRouterMounts(text);
    if (mounts.size > 0) {
      const routerRoutes = parseRoutes(relPath, text, 'router');
      for (const route of routerRoutes) {
        for (const basePath of mounts.values()) {
          inventory.push({ ...route, path: joinPaths(basePath, route.path) });
        }
      }
    }
  }

  const deduped = new Map();
  for (const route of inventory) {
    const key = route.method + ' ' + route.path;
    if (!deduped.has(key)) deduped.set(key, route);
  }

  return Array.from(deduped.values()).sort((a, b) => {
    if (a.path === b.path) return a.method.localeCompare(b.method);
    return a.path.localeCompare(b.path);
  });
}

const routes = buildInventory();
const payload = {
  generatedAt: new Date().toISOString(),
  sourceGlobs: ['server/src/server.ts', 'server/src/routes/*.ts'],
  routeCount: routes.length,
  routes,
};

const outArgIndex = process.argv.indexOf('--out');
if (outArgIndex !== -1 && process.argv[outArgIndex + 1]) {
  const outPath = path.resolve(REPO_ROOT, process.argv[outArgIndex + 1]);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
} else {
  process.stdout.write(JSON.stringify(payload, null, 2));
}
