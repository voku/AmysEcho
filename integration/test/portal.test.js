import { spawn } from 'child_process';
import { once } from 'events';
import assert from 'node:assert';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
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

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('server start timeout')), 5000);
    proc.stdout.on('data', (data) => {
      if (data.toString().includes('Server is running')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    proc.on('error', reject);
    proc.on('exit', (code) => reject(new Error(`server exited ${code}`)));
  });
}

async function stopServer() {
  if (proc) {
    proc.kill();
    await once(proc, 'exit').catch(() => {});
  }
}

before(startServer);
after(stopServer);

test('approve and export training data', async () => {
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
  assert.strictEqual(data.length, 1);
  assert.strictEqual(data[0].id, id);
  assert.strictEqual(data[0].approved, true);
});
