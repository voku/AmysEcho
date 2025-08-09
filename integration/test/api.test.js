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
const PORT = 5050;
let proc;

async function startServer() {
  proc = spawn('node', ['dist/server.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: PORT.toString(), API_TOKEN: 'testtoken' },
    stdio: ['ignore', 'pipe', 'pipe'],
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
    await once(proc, 'exit').catch(() => {});
  }
}

before(startServer);
after(stopServer);

test('POST /classify returns label and confidence', async () => {
  const res = await fetch(`http://localhost:${PORT}/classify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer testtoken',
    },
    body: JSON.stringify({ landmarks: [0, 0, 0] }),
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.ok('label' in data);
  assert.ok('confidence' in data);
});

test('POST /train-model invalid payload', async () => {
  const res = await fetch(`http://localhost:${PORT}/train-model`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer testtoken',
    },
    body: JSON.stringify({ landmarks: 'bad' }),
  });
  assert.strictEqual(res.status, 400);
});

test('GET /model-version returns version and path', async () => {
  const res = await fetch(`http://localhost:${PORT}/model-version`, {
    headers: { Authorization: 'Bearer testtoken' },
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.ok(typeof data.version === 'string');
  assert.strictEqual(data.modelPath, 'latest-model');
});

test('GET /latest-model serves model file when present', async () => {
  const filePath = join(serverDir, 'trained_model.tflite');
  await fs.writeFile(filePath, 'dummy model');
  const res = await fetch(`http://localhost:${PORT}/latest-model`, {
    headers: { Authorization: 'Bearer testtoken' },
  });
  assert.strictEqual(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.length > 0);
  await fs.unlink(filePath);
});

test('POST /analytics then GET returns same data', async () => {
  const payload = { successRate7d: 0.5, improvementTrend: 0.1 };
  const post = await fetch(`http://localhost:${PORT}/analytics`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer testtoken',
    },
    body: JSON.stringify(payload),
  });
  assert.strictEqual(post.status, 200);

  await delay(100); // give server time to persist
  const get = await fetch(`http://localhost:${PORT}/analytics`, {
    headers: { Authorization: 'Bearer testtoken' },
  });
  assert.strictEqual(get.status, 200);
  const data = await get.json();
  assert.strictEqual(data.successRate7d, payload.successRate7d);
  assert.strictEqual(data.improvementTrend, payload.improvementTrend);
});
