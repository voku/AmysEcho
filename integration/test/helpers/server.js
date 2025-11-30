import AdmZip from 'adm-zip';
import { spawn } from 'child_process';
import { once } from 'events';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import { setTimeout as delay } from 'node:timers/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = join(__dirname, '..', '..', '..', 'server');

export const TEST_PORT = 5050;
export const TEST_TOKEN = 'testtoken';

let proc;
let startPromise = null;
let refCount = 0;

function buildLandmarks(count = 42) {
  return Array.from({ length: count }, (_, idx) => {
    const base = idx / 100;
    return [base, base / 2, base / 3];
  });
}

export function buildTestTrainingBundleZipBuffer({
  profileId = 'p-integration',
  label = 'HALLO',
} = {}) {
  const metadata = {
    profileId,
    label,
    capturedAt: '2024-05-28T12:03:11Z',
    source: 'app://integration-test',
    clipFilename: 'clip.webm',
    stillFilename: 'still.jpg',
  };

  const landmarks = buildLandmarks();

  const zip = new AdmZip();
  zip.addFile('bundle/metadata.json', Buffer.from(JSON.stringify(metadata, null, 2)));
  zip.addFile(
    'bundle/landmarks.json',
    Buffer.from(
      JSON.stringify(
        {
          frames: [{ landmarks }],
        },
        null,
        2,
      ),
    ),
  );
  zip.addFile('bundle/clip.webm', Buffer.from('fake-video-data'));
  zip.addFile('bundle/still.jpg', Buffer.from('fake-image-data'));
  return zip.toBuffer();
}

async function cleanServerArtifacts() {
  const dbPath = join(serverDir, 'db.json');
  await fs.rm(dbPath, { force: true }).catch(() => {});
  await fs.rm(join(serverDir, 'data'), { recursive: true, force: true }).catch(() => {});
}

async function actuallyStartServer(attempt = 1) {
  await cleanServerArtifacts();

  await new Promise((resolve, reject) => {
    const build = spawn('npm', ['run', 'build'], {
      cwd: serverDir,
      stdio: 'ignore',
    });
    build.on('error', reject);
    build.on('exit', (code) => {
      code === 0 ? resolve(null) : reject(new Error('build failed'));
    });
  });

  proc = spawn('node', ['dist/server.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: TEST_PORT.toString(),
      API_TOKEN: TEST_TOKEN,
      MLP_SCRIPT: 'src/amyserver_tools/train_mlp.py',
      MLP_EPOCHS: '1',
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  const start = Date.now();
  const timeoutMs = 30_000;
  while (Date.now() - start < timeoutMs) {
    if (proc.exitCode !== null) {
      if (attempt < 2) {
        await delay(500);
        return actuallyStartServer(attempt + 1);
      }
      throw new Error(`server exited ${proc.exitCode}`);
    }
    try {
      const res = await fetch(`http://localhost:${TEST_PORT}/model-version`, {
        headers: serverHeaders(),
      });
      if (res.ok) return;
    } catch {
      // ignore until timeout
    }
    await delay(500);
  }
  throw new Error('server start timeout');
}

export async function startServer() {
  refCount += 1;
  if (!startPromise) {
    startPromise = actuallyStartServer().catch((error) => {
      startPromise = null;
      refCount = 0;
      throw error;
    });
  }
  return startPromise;
}

export async function stopServer() {
  refCount = Math.max(0, refCount - 1);
  if (refCount > 0) {
    return;
  }

  if (proc) {
    proc.kill();
    await once(proc, 'exit').catch(() => {});
  }

  proc = null;
  startPromise = null;
  await delay(200);
  await cleanServerArtifacts();
}

export function serverHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${TEST_TOKEN}`,
    ...extra,
  };
}
