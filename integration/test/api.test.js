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
  // Ensure a clean database so prior runs don't influence API tests
  const dbPath = join(serverDir, 'db.json');
  await fs.rm(dbPath, { force: true }).catch(() => {});
  await fs.rm(join(serverDir, 'data', 'trained_model.json'), { force: true }).catch(() => {});

  proc = spawn('node', ['dist/server.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: PORT.toString(), API_TOKEN: 'testtoken', TRAIN_SCRIPT: 'mockTrain.py' },
    // Discard stdio so the child process can't block if it writes a lot of
    // logs that no one reads.
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

test('POST /train-model invalid payload', async () => {
  const res = await fetch(`http://localhost:${PORT}/train-model`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer testtoken',
    },
    body: JSON.stringify({ samples: 'bad' }),
  });
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.ok(typeof body.error === 'string');
});

test('POST /train-model invalid sample items', async () => {
  const res = await fetch(`http://localhost:${PORT}/train-model`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer testtoken',
    },
    body: JSON.stringify({ samples: [{ gestureDefinitionId: 123, landmarkData: {} }] }),
  });
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.ok(typeof body.error === 'string');
  assert.ok(body.details);
});

test('POST /train-model processes samples and returns model', async () => {
  const res = await fetch(`http://localhost:${PORT}/train-model`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer testtoken',
    },
    body: JSON.stringify({ samples: [{ gestureDefinitionId: 'g1', landmarkData: Array.from({ length: 42 }, () => [0, 0, 0]) }] }),
  });
  assert.strictEqual(res.status, 202);
  const { jobId } = await res.json();

  const statusUrl = `http://localhost:${PORT}/train-status/${jobId}`;
  const headers = { Authorization: 'Bearer testtoken' };
  const start = Date.now();
  while (true) {
    const s = await fetch(statusUrl, { headers });
    const info = await s.json();
    if (info.status === 'completed') {
      assert.strictEqual(info.progress, 100);
      break;
    }
    if (Date.now() - start > 30000) throw new Error('training did not complete');
    await delay(200);
  }

  const modelRes = await fetch(`http://localhost:${PORT}/latest-model`, { headers });
  assert.strictEqual(modelRes.status, 200);
  const buf = Buffer.from(await modelRes.arrayBuffer());
  assert.ok(buf.length > 0);
  const json = JSON.parse(buf.toString('utf8'));
  assert.strictEqual(json.type, 'centroid_model');
  assert.ok(json.centroids && typeof json.centroids === 'object');
  assert.ok(json.counts && typeof json.counts === 'object');
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
  const filePath = join(serverDir, 'data', 'trained_model.json');
  await fs.mkdir(join(serverDir, 'data'), { recursive: true });
  await fs.writeFile(filePath, '{}');
  try {
    const res = await fetch(`http://localhost:${PORT}/latest-model`, {
      headers: { Authorization: 'Bearer testtoken' },
    });
    assert.strictEqual(res.status, 200);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.ok(buf.length > 0);
  } finally {
    await fs.unlink(filePath).catch(() => {});
  }
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

