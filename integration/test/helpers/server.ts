import AdmZip from 'adm-zip';
import { spawn, ChildProcess } from 'child_process';
import { once } from 'events';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { promises as fs } from 'fs';
import { setTimeout as delay } from 'node:timers/promises';
import jwt from 'jsonwebtoken';

declare global {
  var __serverCleanupRegistered: boolean | undefined;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = join(__dirname, '..', '..', '..', 'server');
const dgsFixtureDir = join(serverDir, 'data', 'fixtures', 'dgs_sources');
const dgsFixtureVideo = join(dgsFixtureDir, 'kindergarten.mp4');
const dgsFixtureConfig = join(serverDir, 'data', 'config', 'dgsVideoSources.integration.json');
const dgsFixtureLabel = 'kindergarten';
const dgsFixtureLandmarkName = `${dgsFixtureLabel}_integration_0_landmarks.json`;

export const TEST_PORT = 5050;
export const JWT_SECRET = 'integration-jwt-secret';

const LIVE_SERVER_URL = process.env.LIVE_SERVER_URL?.replace(/\/+$/, '');
const LOCAL_TEST_TOKEN = jwt.sign(
  { userId: 'integration-user', username: 'integration', role: 'caregiver' },
  JWT_SECRET,
  { expiresIn: '1h' },
);

export const TEST_TOKEN = process.env.LIVE_SERVER_TOKEN ?? LOCAL_TEST_TOKEN;
const BASE_URL = LIVE_SERVER_URL ?? `http://localhost:${TEST_PORT}`;

process.env.AMY_DGS_SOURCES_PATH = process.env.AMY_DGS_SOURCES_PATH ?? dgsFixtureConfig;
process.env.AMY_DGS_SKIP_SIGNDICT = process.env.AMY_DGS_SKIP_SIGNDICT ?? 'true';

export function isLiveServer() {
  return Boolean(LIVE_SERVER_URL);
}

export function serverBaseUrl() {
  return BASE_URL;
}

let proc: ChildProcess | null = null;
let startPromise: Promise<void> | null = null;
let refCount = 0;

function buildLandmarks(count = 42) {
  return Array.from({ length: count }, (_, idx) => {
    const base = idx / 100;
    return [base, base / 2, base / 3];
  });
}

export function buildTestTrainingBundleZipBuffer({
  profileId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
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
  if (isLiveServer()) {
    return;
  }
  const dbPath = join(serverDir, 'db.json');
  await fs.rm(dbPath, { force: true }).catch(() => {});
  // Only delete generated model files, not tracked baseline files
  await fs.rm(join(serverDir, 'data', 'models', '11111111-1111-4111-8111-111111111111'), { recursive: true, force: true }).catch(() => {});
  await fs.rm(join(serverDir, 'data', 'models', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), { recursive: true, force: true }).catch(() => {});
  await fs.rm(join(serverDir, 'data', 'datasets'), { recursive: true, force: true }).catch(() => {});
}

async function ensureDgsFixtureSources() {
  if (isLiveServer()) {
    return;
  }
  const configPath = process.env.AMY_DGS_SOURCES_PATH ?? dgsFixtureConfig;
  await fs.mkdir(dgsFixtureDir, { recursive: true });
  await fs.writeFile(dgsFixtureVideo, Buffer.from('fake-dgs-video-data'));

  const configPayload = {
    version: '1.0',
    description: 'Integration test sources',
    labels: {
      [dgsFixtureLabel]: {
        sources: [
          {
            name: 'integration',
            urls: [pathToFileURL(dgsFixtureVideo).href],
          },
        ],
      },
    },
  };
  await fs.writeFile(configPath, JSON.stringify(configPayload, null, 2));

  const dgsVideoDir = join(serverDir, 'data', 'dgs_video_examples');
  await fs.mkdir(dgsVideoDir, { recursive: true });
  await fs.writeFile(join(dgsVideoDir, dgsFixtureLandmarkName), JSON.stringify({ frames: [] }, null, 2));
}

async function waitForServerReady(baseUrl: string, headers: Record<string, string>) {
  const start = Date.now();
  const timeoutMs = 30_000;
  while (Date.now() - start < timeoutMs) {
    try {
      // Check a route that is only registered after database initialization
      const res = await fetch(`${baseUrl}/api/v1/profiles`, { headers });
      if (res.ok || res.status === 401 || res.status === 403) {
        return;
      }
    } catch {
      // ignore until timeout
    }
    await delay(500);
  }
  throw new Error(`server start timeout for ${baseUrl}`);
}

async function actuallyStartServer(attempt = 1) {
  await cleanServerArtifacts();
  await ensureDgsFixtureSources();

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
      JWT_SECRET,
      JWT_REFRESH_SECRET: 'integration-refresh-secret',
      BACKUP_SECRET: 'integration-backup-secret-DO-NOT-USE-IN-PRODUCTION',
      MLP_SCRIPT: 'src/amyserver_tools/train_mlp.py',
      MLP_EPOCHS: '1',
      MLP_MIN_SAMPLES_PER_LABEL: '1',
      MLP_MIN_SAMPLES_PER_PROFILE: '1',
      MLP_LAYER1_SIZE: '64',
      MLP_LAYER2_SIZE: '32',
      MLP_WINDOW_SIZE: '6',
      MLP_WINDOW_STRIDE: '3',
      MLP_MAX_FRAMES: '30',
      MLP_FRAME_STRIDE: '4',
      MLP_VALIDATION_FRACTION: '0.1',
      MLP_REQUIRE_MEDIAPIPE: '0',
      AMY_SKIP_DGS_EXAMPLES: 'true',
      TRAINING_JOB_SLA_MS: '300000',
      API_LIMIT: '1000', // Increase rate limit for integration tests
      MODEL_METADATA_LIMIT: '1000', // Increase model metadata rate limit for integration tests
      NODE_ENV: 'test', // Set environment to test mode
    },
    stdio: ['ignore', 'ignore', 'ignore'],
    detached: false, // Keep as subprocess to allow cleanup
  });
  
  // Unref the server process so it doesn't prevent the test runner from exiting
  // The server will stay alive as long as the Node.js process is running
  proc.unref();
  
  // Keep server alive across multiple test files by preventing premature shutdown
  proc.on('exit', (code) => {
    // If server exits unexpectedly, clear the cached promise so next startServer() will retry
    if (code !== 0 && code !== null) {
      startPromise = null;
      refCount = 0;
    }
  });
  
  // Register cleanup handler to kill server when test process exits
  if (!globalThis.__serverCleanupRegistered) {
    globalThis.__serverCleanupRegistered = true;
    
    const cleanup = () => {
      if (proc && !isLiveServer()) {
        try {
          proc.kill('SIGTERM');
          proc = null;
          startPromise = null;
        } catch {
          // Process may already be dead
        }
      }
    };
    
    // Use beforeExit to allow all test files to complete before cleanup
    process.on('beforeExit', cleanup);
    
    // Also handle exit event (fires when process is about to exit)
    process.on('exit', cleanup);
    
    // Handle termination signals to ensure cleanup on CI failures
    process.on('SIGTERM', () => {
      cleanup();
      process.exit(143); // 128 + 15 (SIGTERM)
    });
    
    process.on('SIGINT', () => {
      cleanup();
      process.exit(130); // 128 + 2 (SIGINT)
    });
  }

  const start = Date.now();
  const timeoutMs = 40_000;
  let serverReady = false;
  while (Date.now() - start < timeoutMs && !serverReady) {
    if (proc.exitCode !== null) {
      if (attempt < 2) {
        await delay(500);
        return actuallyStartServer(attempt + 1);
      }
      throw new Error(`server exited ${proc.exitCode}`);
    }
    try {
      await waitForServerReady(`http://localhost:${TEST_PORT}`, serverHeaders());
      serverReady = true;
    } catch {
      // Server not ready yet, continue waiting
      await delay(100);
    }
  }
  if (!serverReady) {
    throw new Error('server start timeout');
  }
}

export async function startServer() {
  refCount += 1;
  if (isLiveServer()) {
    if (!startPromise) {
      startPromise = waitForServerReady(serverBaseUrl(), serverHeaders()).catch((error) => {
        startPromise = null;
        refCount = 0;
        throw error;
      });
    }
    return startPromise;
  }
  
  // Check if we have a cached promise but the server process is dead or missing
  if (startPromise && (!proc || proc.exitCode !== null)) {
    // Server died or was cleaned up, reset everything and restart
    startPromise = null;
    proc = null;
  }
  
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
  // Keep the server alive across all test files
  // The process exit handler will clean it up when the test runner fully exits
}

export async function createProfile(profile: { id?: string; displayName: string }) {
  const res = await fetch(`${serverBaseUrl()}/api/v1/profiles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TEST_TOKEN}`,
    },
    body: JSON.stringify(profile),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error(`Failed to create profile: ${res.status}`, body);
    throw new Error(`Failed to create profile: ${res.status} ${JSON.stringify(body)}`);
  }
  const data = await res.json();
  console.log(`Created test profile: ${data.profile?.id} (${data.profile?.displayName})`);
  return data;
}

export function serverHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${TEST_TOKEN}`,
    ...extra,
  };
}
