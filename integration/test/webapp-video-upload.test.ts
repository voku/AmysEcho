import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';

import { createTrainingZip, uploadTrainingZip } from '../../webapp/src/training/trainingBundle.ts';
import type { TrainingBundlePayload, TrainingFrame } from '../../webapp/src/training/types.ts';
import { TEST_TOKEN, serverBaseUrl, serverHeaders, startServer, stopServer, createProfile } from './helpers/server.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const clipFixturePath = join(repoRoot, 'server', 'test', 'fixtures', 'clip.mp4');
const profileId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

before(async () => {
  await startServer();
  await createProfile({ id: profileId, displayName: 'Video Upload Test Profile' });
});

after(stopServer);

function buildFrames(): TrainingFrame[] {
  return [
    {
      timestampMs: 0,
      landmarks: Array.from({ length: 42 }, () => [0.1, 0.2, 0.3]),
      handedness: ['Right'],
    },
    {
      timestampMs: 33,
      landmarks: Array.from({ length: 42 }, () => [0.15, 0.25, 0.35]),
      handedness: ['Right'],
    },
  ];
}

async function readManifest() {
  const configuredDataDir = process.env.AMY_ECHO_DATA_DIR ?? process.env.AMY_DATA_DIR;
  const manifestPath = configuredDataDir
    ? join(configuredDataDir, 'datasets', 'training_manifest.json')
    : join(repoRoot, 'server', 'data', 'datasets', 'training_manifest.json');
  const raw = await fs.readFile(manifestPath, 'utf8');
  return JSON.parse(raw) as { entries?: Array<Record<string, any>> };
}

test('webapp helpers upload a real repo video and server serves stored clip', async () => {
  const clipBytes = await fs.readFile(clipFixturePath);
  assert.ok(clipBytes.length > 0, 'expected non-empty clip fixture');

  const clipFile = new File([new Uint8Array(clipBytes)], 'clip.mp4', { type: 'video/mp4' });
  const payload: TrainingBundlePayload = {
    profileId,
    label: 'VIDEO_TEST',
    frames: buildFrames(),
    clipFile,
    stillFile: null,
    audioFile: null,
    recording: {
      clipDurationMs: 1200,
      clipBytes: clipBytes.length,
      clipMimeType: 'video/mp4',
    },
    capturedAt: new Date().toISOString(),
    source: 'test://webapp-video-upload',
  };

  const zip = await createTrainingZip(payload);
  assert.ok(zip.byteLength > clipBytes.length, 'zip should include metadata and landmarks');

  const uploadResult = await uploadTrainingZip(zip, {
    endpoint: `${serverBaseUrl()}/api/v1/dgs/sample-bundles`,
    token: TEST_TOKEN,
  });

  assert.ok(uploadResult.id.length > 0, 'server should return bundle id');

  const manifest = await readManifest();
  const entry = manifest.entries?.find((candidate) => candidate.id === uploadResult.id);
  assert.ok(entry, 'uploaded bundle should be recorded in training manifest');
  assert.strictEqual(entry?.metadata?.recording?.clipMimeType, 'video/mp4');
  assert.strictEqual(entry?.metadata?.recording?.clipBytes, clipBytes.length);
  assert.ok(typeof entry?.storage?.clip === 'string' && entry.storage.clip.length > 0, 'manifest should keep clip storage path');

  const clipResponse = await fetch(`${serverBaseUrl()}/api/v1/training-videos/${uploadResult.id}/clip`, {
    headers: serverHeaders(),
  });
  assert.strictEqual(clipResponse.status, 200);
  assert.strictEqual(clipResponse.headers.get('content-type'), 'video/mp4');

  const downloadedClip = Buffer.from(await clipResponse.arrayBuffer());
  assert.strictEqual(downloadedClip.length, clipBytes.length, 'served clip size should match uploaded fixture size');
  assert.strictEqual(Buffer.compare(downloadedClip, clipBytes), 0, 'served clip should match uploaded fixture bytes exactly');
});
