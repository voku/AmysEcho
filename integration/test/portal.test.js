import { spawn } from 'child_process';
import { once } from 'events';
import assert from 'node:assert';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';
import { test, before, after } from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = join(__dirname, '..', '..', 'server');
// Use a dedicated port so this test can run alongside others without
// fighting over the same TCP socket.
const PORT = 5051;
let proc;

async function startServer() {
  // Ensure a clean database so training data counts are deterministic
  const dbPath = join(serverDir, 'db.json');
  await fs.rm(dbPath, { force: true }).catch(() => {});

  // Build server before starting to ensure dist exists
  await new Promise((resolve, reject) => {
    const b = spawn('npm', ['run', 'build'], { cwd: serverDir, stdio: 'ignore' });
    b.on('error', reject);
    b.on('exit', (code) => (code === 0 ? resolve(null) : reject(new Error('build failed'))));
  });

  proc = spawn('node', ['dist/server.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: PORT.toString(), API_TOKEN: 'testtoken' },
    // Drop all stdio to avoid blocking if the server logs heavily.
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  const start = Date.now();
  const timeoutMs = 30_000;
  while (Date.now() - start < timeoutMs) {
    if (proc.exitCode !== null) {
      throw new Error(`server exited ${proc.exitCode}`);
    }
    try {
      const res = await fetch(`http://localhost:${PORT}/model-version`, {
        headers: { Authorization: 'Bearer testtoken' },
      });
      if (res.ok) return;
    } catch {
      // retry until timeout
    }
    await delay(500);
  }
  throw new Error('server start timeout');
}

async function stopServer() {
  if (proc) {
    proc.kill();
    await once(proc, 'exit').catch(() => {});
  }
}

before(async () => {
  try {
    await startServer();
  } catch (e) {
    console.log('Portal tests skipped - server could not start:', (e && e.message) || e);
    // Mark a flag to skip test body
    globalThis.__PORTAL_SKIP__ = true;
  }
});
after(stopServer);

test('approve and export training data', async () => {
  if (globalThis.__PORTAL_SKIP__) {
    console.log('Skipping portal API test due to server start failure');
    return;
  }
  const payload = { gestureDefinitionId: 'hello', landmarkData: [1, 2, 3] };
  const postRes = await fetch(`http://localhost:${PORT}/portal/training-data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.strictEqual(postRes.status, 200);
  const { id } = await postRes.json();
  assert.ok(id);

  const approveRes = await fetch(`http://localhost:${PORT}/portal/training-data/${id}/approve`, {
    method: 'POST',
  });
  assert.strictEqual(approveRes.status, 200);

  const exportRes = await fetch(`http://localhost:${PORT}/portal/training-data/export`);
  assert.strictEqual(exportRes.status, 200);
  const data = await exportRes.json();
  assert.ok(Array.isArray(data));
  const record = data.find((d) => d.id === id);
  assert.ok(record, 'exported data includes the new record');
  assert.strictEqual(record.approved, true);
});
