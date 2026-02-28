import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';

import { createTrainingZip, uploadTrainingZip } from '../../webapp/src/training/trainingBundle.ts';
import type { TrainingBundlePayload, TrainingFrame } from '../../webapp/src/training/types.ts';
import { TEST_TOKEN, serverBaseUrl, serverHeaders, startServer, stopServer, createProfile } from './helpers/server.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const clipFixturePath = join(repoRoot, 'server', 'test', 'fixtures', 'clip.mp4');
const profileId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

type RepoLandmarkFrame = {
  landmarks?: number[][];
};

type RepoLandmarkFile = {
  frames?: RepoLandmarkFrame[];
};

before(async () => {
  await startServer();
  await createProfile({ id: profileId, displayName: 'Video Upload Test Profile' });
});

after(stopServer);

function buildFrames(): TrainingFrame[] {
  return [
    {
      timestampMs: 0,
      landmarks: [Array.from({ length: 42 }, () => [0.1, 0.2, 0.3])],
      handedness: ['Right'],
    },
    {
      timestampMs: 33,
      landmarks: [Array.from({ length: 42 }, () => [0.15, 0.25, 0.35])],
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

async function waitForTrainingCompletion(pollUrl: string) {
  const start = Date.now();
  const timeoutMs = 600_000;

  while (Date.now() - start <= timeoutMs) {
    const statusResp = await fetch(pollUrl, { headers: serverHeaders() });
    if (statusResp.status !== 200) {
      await delay(500);
      continue;
    }
    const info = await statusResp.json();
    if (info.status === 'failed') {
      assert.fail(`Training job failed: ${info.error || 'unknown error'}`);
    }
    if (info.status === 'completed') {
      return;
    }
    await delay(500);
  }

  assert.fail('training job did not complete before timeout');
}

function toTrainingFrame(frame: RepoLandmarkFrame): TrainingFrame {
  const points = Array.isArray(frame.landmarks)
    ? frame.landmarks.filter(
      (point): point is number[] =>
        Array.isArray(point) && point.length >= 3 && point.every((value) => Number.isFinite(value)),
    )
    : [];

  const handPoints = points.slice(0, 42);
  const leftHand = handPoints.slice(0, 21);
  const rightHand = handPoints.slice(21, 42);
  const poseLandmarks = points.slice(42, 75);
  const faceLandmarks = points.slice(75, 543);

  return {
    landmarks: [leftHand, rightHand],
    handedness: ['Left', 'Right'],
    poseLandmarks,
    faceLandmarks,
  };
}

async function createBundleFromRepoVideo(clipName: string, landmarksName: string, label: string) {
  const clipBytes = await fs.readFile(join(repoRoot, 'server', 'data', 'dgs_video_examples', clipName));
  const landmarksRaw = await fs.readFile(join(repoRoot, 'server', 'data', 'dgs_video_examples', landmarksName), 'utf8');
  const landmarks = JSON.parse(landmarksRaw) as RepoLandmarkFile;
  const frames = Array.isArray(landmarks.frames)
    ? landmarks.frames.map(toTrainingFrame).filter((frame) => frame.landmarks.some((hand) => hand.length > 0))
    : [];

  const clipData = new Uint8Array(clipBytes);
  const clipFile = {
    name: clipName,
    type: 'video/mp4',
    size: clipData.byteLength,
    arrayBuffer: async () => clipData.buffer.slice(clipData.byteOffset, clipData.byteOffset + clipData.byteLength),
  } as File;

  const payload: TrainingBundlePayload = {
    profileId,
    label,
    frames,
    clipFile,
    stillFile: null,
    audioFile: null,
    recording: {
      clipDurationMs: 1500,
      clipBytes: clipBytes.length,
      clipMimeType: 'video/mp4',
      frameCount: frames.length,
    },
    capturedAt: new Date().toISOString(),
    source: `test://real-video/${clipName}`,
  };

  const zip = await createTrainingZip(payload);
  return uploadTrainingZip(zip, {
    endpoint: `${serverBaseUrl()}/api/v1/dgs/sample-bundles`,
    token: TEST_TOKEN,
  });
}

test('webapp helpers upload a real repo video and server serves stored clip', async () => {
  const clipBytes = await fs.readFile(clipFixturePath);
  assert.ok(clipBytes.length > 0, 'expected non-empty clip fixture');

  const clipData = new Uint8Array(clipBytes);
  const clipFile = {
    name: 'clip.mp4',
    type: 'video/mp4',
    size: clipData.byteLength,
    arrayBuffer: async () => clipData.buffer.slice(clipData.byteOffset, clipData.byteOffset + clipData.byteLength),
  } as File;
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

test('real repo videos with multiple samples per label produce a profile model', async () => {
  const uploads = await Promise.all([
    createBundleFromRepoVideo('essen_main_essen.mp4', 'essen_main_essen_landmarks.json', 'ESSEN'),
    createBundleFromRepoVideo('essen_var_abendessen_0.mp4', 'essen_var_abendessen_0_landmarks.json', 'ESSEN'),
    createBundleFromRepoVideo('trinken_main_trinken.mp4', 'trinken_main_trinken_landmarks.json', 'TRINKEN'),
    createBundleFromRepoVideo('trinken_var_wasser_1.mp4', 'trinken_var_wasser_1_landmarks.json', 'TRINKEN'),
  ]);

  const pollUrls = uploads
    .map((upload) => upload.trainingJob?.pollUrl)
    .filter((pollUrl): pollUrl is string => typeof pollUrl === 'string' && pollUrl.length > 0)
    .map((pollUrl) => new URL(pollUrl, serverBaseUrl()).href);

  assert.ok(pollUrls.length > 0, 'bundle uploads should return at least one training poll URL');

  for (const pollUrl of pollUrls) {
    await waitForTrainingCompletion(pollUrl);
  }

  const labelsResponse = await fetch(`${serverBaseUrl()}/api/v1/dgs/trained-labels?profileId=${profileId}`, {
    headers: serverHeaders({ 'X-Profile-Id': profileId }),
  });
  assert.strictEqual(labelsResponse.status, 200);
  const labelsBody = await labelsResponse.json();
  assert.ok(Array.isArray(labelsBody.trainedLabels), 'trainedLabels must be an array');
  assert.ok(labelsBody.trainedLabels.includes('ESSEN'));
  assert.ok(labelsBody.trainedLabels.includes('TRINKEN'));

  const modelResponse = await fetch(`${serverBaseUrl()}/api/v1/models/latest?profileId=${profileId}`, {
    headers: serverHeaders({ 'X-Profile-Id': profileId }),
  });
  assert.strictEqual(modelResponse.status, 200);
  assert.strictEqual(modelResponse.headers.get('x-model-source'), 'profile');
  assert.strictEqual(modelResponse.headers.get('x-model-profile'), profileId);
  const modelBytes = Buffer.from(await modelResponse.arrayBuffer());
  assert.ok(modelBytes.length > 0, 'profile model should contain binary payload');
});
