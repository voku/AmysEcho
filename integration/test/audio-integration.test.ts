import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, before, after } from 'node:test';

import { createTrainingZip, uploadTrainingZip } from '../../webapp/src/training/trainingBundle.ts';
import type { TrainingFrame, TrainingBundlePayload } from '../../webapp/src/training/types.ts';
import { TEST_TOKEN, serverHeaders, serverBaseUrl, startServer, stopServer, createProfile } from './helpers/server.ts';

before(async () => {
  await startServer();
  await createProfile({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', displayName: 'Audio Test Profile' });
});
after(stopServer);

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Integration test for multimodal audio+gesture training workflow
 * 
 * Amy First: Tests all three learning scenarios:
 * 1. Gesture-only (Amy can't speak yet)
 * 2. Speech-only (Amy speaks but doesn't know sign)
 * 3. Both together (multimodal)
 */

test('Multimodal Audio+Gesture Integration - Gesture Only', async () => {
  // Scenario 1: Amy uses only gestures (can't speak "purple" yet)
  const frames: TrainingFrame[] = [
    {
      timestampMs: 0,
      landmarks: Array(42).fill(null).map(() => [0.5, 0.5, 0.5]),
      poseLandmarks: Array(33).fill(null).map(() => [0.5, 0.5, 0.5]),
      faceLandmarks: Array(468).fill(null).map(() => [0.5, 0.5, 0.5]),
      handedness: ['Right'],
    },
    {
      timestampMs: 33,
      landmarks: Array(42).fill(null).map(() => [0.6, 0.6, 0.6]),
      poseLandmarks: Array(33).fill(null).map(() => [0.5, 0.5, 0.5]),
      faceLandmarks: Array(468).fill(null).map(() => [0.5, 0.5, 0.5]),
      handedness: ['Right'],
    },
  ];

  const payload: TrainingBundlePayload = {
    profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    label: 'purple_gesture_only',
    frames,
    clipFile: null,
    stillFile: null,
    audioFile: null, // No audio - gesture only
    capturedAt: new Date().toISOString(),
    source: 'test://audio-integration',
  };

  const zipBytes = await createTrainingZip(payload);
  assert.ok(zipBytes.byteLength > 0, 'ZIP should be created for gesture-only');

  const uploadResult = await uploadTrainingZip(zipBytes, {
    endpoint: serverBaseUrl + '/api/v1/dgs/sample-bundles',
    token: TEST_TOKEN,
  });

  assert.ok(uploadResult.id, 'Upload should succeed for gesture-only bundle');
  console.log('✅ Gesture-only bundle uploaded:', uploadResult.id);
});

test('Multimodal Audio+Gesture Integration - Speech Only', async () => {
  // Scenario 2: Amy speaks "Iila" (her pronunciation of purple) but doesn't know the sign
  const frames: TrainingFrame[] = [
    {
      timestampMs: 0,
      landmarks: [], // Minimal or no hand landmarks
      poseLandmarks: Array(33).fill(null).map(() => [0.5, 0.5, 0.5]),
      faceLandmarks: Array(468).fill(null).map(() => [0.5, 0.5, 0.5]),
      handedness: [],
    },
    {
      timestampMs: 33,
      landmarks: [],
      poseLandmarks: Array(33).fill(null).map(() => [0.5, 0.5, 0.5]),
      faceLandmarks: Array(468).fill(null).map(() => [0.5, 0.5, 0.5]),
      handedness: [],
    },
  ];

  // Create a simple audio file (mock)
  const audioContent = new Uint8Array([
    // WebM header (minimal valid structure)
    0x1a, 0x45, 0xdf, 0xa3, // EBML header
    0x00, 0x00, 0x00, 0x20, // Size
  ]);
  const audioFile = new File([audioContent], 'audio_1234567890.webm', {
    type: 'audio/webm',
  });

  const payload: TrainingBundlePayload = {
    profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    label: 'purple_speech_only',
    frames,
    clipFile: null,
    stillFile: null,
    audioFile, // Audio present
    recording: {
      audioDurationMs: 1500,
      audioBytes: audioContent.byteLength,
      audioMimeType: 'audio/webm',
    },
    capturedAt: new Date().toISOString(),
    source: 'test://audio-integration',
  };

  const zipBytes = await createTrainingZip(payload);
  assert.ok(zipBytes.byteLength > 0, 'ZIP should be created with audio');

  const uploadResult = await uploadTrainingZip(zipBytes, {
    endpoint: serverBaseUrl + '/api/v1/dgs/sample-bundles',
    token: TEST_TOKEN,
  });

  assert.ok(uploadResult.id, 'Upload should succeed for audio bundle');
  console.log('✅ Audio bundle uploaded:', uploadResult.id);

  // Verify the bundle contains audio file
  const configuredDataDir = process.env.AMY_ECHO_DATA_DIR ?? process.env.AMY_DATA_DIR;
  const manifestPath = configuredDataDir
    ? join(configuredDataDir, 'datasets', 'training_manifest.json')
    : join(__dirname, '..', '..', 'server', 'data', 'datasets', 'training_manifest.json');

  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const entry = manifest.entries?.find((e: any) => e.id === uploadResult.id);
  
  assert.ok(entry, 'Bundle entry should exist in manifest');
  assert.ok(
    entry.storage?.audio || entry.metadata?.audioFilename,
    'Audio file should be tracked in manifest'
  );
  console.log('✅ Audio file tracked in manifest:', entry.storage?.audio || entry.metadata?.audioFilename);
});

test('Multimodal Audio+Gesture Integration - Both Modalities', async () => {
  // Scenario 3: Amy uses both gesture and speech together
  const frames: TrainingFrame[] = [
    {
      timestampMs: 0,
      landmarks: Array(42).fill(null).map(() => [0.5, 0.5, 0.5]),
      poseLandmarks: Array(33).fill(null).map(() => [0.5, 0.5, 0.5]),
      faceLandmarks: Array(468).fill(null).map(() => [0.5, 0.5, 0.5]),
      handedness: ['Right'],
    },
    {
      timestampMs: 33,
      landmarks: Array(42).fill(null).map(() => [0.6, 0.6, 0.6]),
      poseLandmarks: Array(33).fill(null).map(() => [0.5, 0.5, 0.5]),
      faceLandmarks: Array(468).fill(null).map(() => [0.5, 0.5, 0.5]),
      handedness: ['Right'],
    },
  ];

  const audioContent = new Uint8Array([
    0x1a, 0x45, 0xdf, 0xa3, // EBML header
    0x00, 0x00, 0x00, 0x20,
  ]);
  const audioFile = new File([audioContent], 'audio_1234567891.webm', {
    type: 'audio/webm',
  });

  const payload: TrainingBundlePayload = {
    profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    label: 'purple_multimodal',
    frames,
    clipFile: null,
    stillFile: null,
    audioFile, // Both gesture and audio
    recording: {
      audioDurationMs: 1500,
      audioBytes: audioContent.byteLength,
      audioMimeType: 'audio/webm',
    },
    capturedAt: new Date().toISOString(),
    source: 'test://audio-integration',
  };

  const zipBytes = await createTrainingZip(payload);
  assert.ok(zipBytes.byteLength > 0, 'ZIP should be created with both modalities');

  const uploadResult = await uploadTrainingZip(zipBytes, {
    endpoint: serverBaseUrl + '/api/v1/dgs/sample-bundles',
    token: TEST_TOKEN,
  });

  assert.ok(uploadResult.id, 'Upload should succeed for multimodal bundle');
  console.log('✅ Multimodal bundle uploaded:', uploadResult.id);

  // Verify both modalities are present
  const configuredDataDir = process.env.AMY_ECHO_DATA_DIR ?? process.env.AMY_DATA_DIR;
  const manifestPath = configuredDataDir
    ? join(configuredDataDir, 'datasets', 'training_manifest.json')
    : join(__dirname, '..', '..', 'server', 'data', 'datasets', 'training_manifest.json');

  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const entry = manifest.entries?.find((e: any) => e.id === uploadResult.id);

  assert.ok(entry, 'Bundle entry should exist');
  assert.ok(entry.metadata?.modalities?.hands?.present, 'Hand modality should be present');
  assert.ok(
    entry.storage?.audio || entry.metadata?.audioFilename,
    'Audio should be tracked'
  );
  console.log('✅ Both modalities confirmed in manifest');
  console.log('   - Hands:', entry.metadata?.modalities?.hands?.present ? '✓' : '✗');
  console.log('   - Audio:', entry.storage?.audio ? '✓' : '✗');
});

test('Audio Bundle Metadata Validation', async () => {
  // Test that audio metadata is properly stored
  const frames: TrainingFrame[] = [
    {
      timestampMs: 0,
      landmarks: Array(42).fill(null).map(() => [0.5, 0.5, 0.5]),
      handedness: ['Right'],
    },
  ];

  const audioContent = new Uint8Array(256); // Larger mock file
  const audioFile = new File([audioContent], 'audio_1234567892.webm', {
    type: 'audio/webm;codecs=opus',
  });

  const payload: TrainingBundlePayload = {
    profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    label: 'purple_metadata_test',
    frames,
    clipFile: null,
    stillFile: null,
    audioFile,
    recording: {
      audioDurationMs: 2500,
      audioBytes: 256,
      audioMimeType: 'audio/webm;codecs=opus',
    },
    capturedAt: new Date().toISOString(),
    source: 'test://audio-metadata',
  };

  const zipBytes = await createTrainingZip(payload);
  const uploadResult = await uploadTrainingZip(zipBytes, {
    endpoint: serverBaseUrl + '/api/v1/dgs/sample-bundles',
    token: TEST_TOKEN,
  });

  const configuredDataDir = process.env.AMY_ECHO_DATA_DIR ?? process.env.AMY_DATA_DIR;
  const manifestPath = configuredDataDir
    ? join(configuredDataDir, 'datasets', 'training_manifest.json')
    : join(__dirname, '..', '..', 'server', 'data', 'datasets', 'training_manifest.json');

  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const entry = manifest.entries?.find((e: any) => e.id === uploadResult.id);

  // Verify audio metadata
  assert.ok(entry?.metadata?.recording?.audioDurationMs === 2500, 'Audio duration should be preserved');
  assert.ok(entry?.metadata?.recording?.audioBytes === 256, 'Audio size should be preserved');
  assert.ok(
    entry?.metadata?.recording?.audioMimeType?.includes('webm'),
    'Audio MIME type should be preserved'
  );

  console.log('✅ Audio metadata validation passed:');
  console.log('   - Duration:', entry.metadata.recording.audioDurationMs, 'ms');
  console.log('   - Size:', entry.metadata.recording.audioBytes, 'bytes');
  console.log('   - Type:', entry.metadata.recording.audioMimeType);
});
