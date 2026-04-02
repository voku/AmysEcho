import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { dirname, join } from 'node:path';
import { test, before, after } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  createProfile,
  isLiveServer,
  serverBaseUrl,
  serverHeaders,
  startServer,
  stopServer,
} from './helpers/server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = join(__dirname, '..', '..', 'server');
const baseUrl = serverBaseUrl();
const liveServer = isLiveServer();

const TEST_PROFILE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TEST_LABEL = 'kindergarten';
const TEST_LANDMARK_NAME = `${TEST_LABEL}_integration_0_landmarks.json`;

async function waitForFile(path: string, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fs.access(path);
      return true;
    } catch {
      await delay(200);
    }
  }
  return false;
}

async function waitForManifestEntry(path: string, label: string, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const raw = await fs.readFile(path, 'utf8');
      const manifest = JSON.parse(raw);
      const entry = (manifest.gestures || []).find((g: { id?: string; label?: string }) => (
        g.id === label || g.label === label
      ));
      if (entry) {
        return entry;
      }
    } catch {
      // ignore parse/read errors until timeout
    }
    await delay(200);
  }
  return null;
}

before(async () => {
  if (liveServer) {
    return;
  }

  await startServer();
  await createProfile({ id: TEST_PROFILE_ID, displayName: 'Integration DGS Sources' });
});

after(async () => {
  if (liveServer) {
    return;
  }
  await stopServer();
});

test('auto-pretrain uses custom DGS sources for new German labels', async () => {
  const res = await fetch(
    `${baseUrl}/api/v1/profiles/${TEST_PROFILE_ID}/labels/${TEST_LABEL}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...serverHeaders(),
      },
      body: JSON.stringify({ mode: 'server_pretrain', enabled: true }),
    },
  );

  assert.strictEqual(res.status, 200);
  const payload = await res.json();
  assert.ok(payload.autoPretrainJob);
  assert.ok(typeof payload.autoPretrainJob.jobId === 'string');

  if (!liveServer) {
    const manifestPath = join(serverDir, 'data', 'dgs_manifest.json');
    const entry = await waitForManifestEntry(manifestPath, TEST_LABEL);
    assert.ok(entry, 'Manifest entry for the new label should be created.');

    const targetLandmark = join(
      serverDir,
      'data',
      'users',
      TEST_PROFILE_ID,
      'labels',
      TEST_LABEL,
      'server_pretrain',
      'landmarks',
      TEST_LANDMARK_NAME,
    );
    const landmarkCopied = await waitForFile(targetLandmark);
    assert.ok(landmarkCopied, 'Landmark file should be synchronized to the user profile.');
  }
});
