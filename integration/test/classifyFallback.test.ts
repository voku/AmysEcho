import { spawn, ChildProcess } from 'child_process';
import { once } from 'events';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';
import { test, before, after } from 'node:test';

// Determine paths relative to this test file
const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = join(__dirname, '..', '..', 'server');
const PORT = 5052; // dedicated port so tests don't clash
let proc: ChildProcess;

async function startServer() {
  // Ensure a clean database so prior runs don't influence results
  const dbPath = join(serverDir, 'db.json');
  await fs.rm(dbPath, { force: true }).catch(() => {});

  proc = spawn('node', ['dist/server.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: PORT.toString(),
      API_TOKEN: 'testtoken',
      // Point cloud API to an unreachable address so the server must
      // fall back to the offline model.
      CLOUD_API_URL: 'http://127.0.0.1:5999/unreachable',
      OFFLINE_MODEL_PATH: join(serverDir, 'src', 'offlineModel.json'),
    },
    stdio: ['ignore', 'ignore', 'inherit'],
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
      if (res.ok) return; // server is ready
    } catch {
      // ignore until timeout
    }
    await delay(500);
  }
  throw new Error('server start timeout');
}

async function stopServer() {
  if (proc) {
    proc.kill();
    await once(proc, 'exit').catch((err) =>
      console.warn('Error waiting for server to exit:', err)
    );
  }
}

before(startServer);
after(stopServer);

test('falls back to offline model when cloud unavailable', async () => {
  const res = await fetch(`http://localhost:${PORT}/classify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer testtoken',
    },
    body: JSON.stringify({ landmarks: [0, 0] }),
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.equal(data.label, 'g1');
  assert.equal(data.processedBy, 'local');
});

