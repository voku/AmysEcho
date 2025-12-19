import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  enqueuePersistedBundle,
  listQueuedBundles,
  markBundleUploading,
  markBundleFailed,
  removeQueuedBundle,
  readBundleData,
  clearBundleStoreForTests,
} from './trainingQueue';

describe('trainingQueue - IndexedDB operations', () => {
  beforeEach(async () => {
    // Clear all bundles before each test
    await clearBundleStoreForTests();
  });

  afterEach(async () => {
    // Clean up after each test
    await clearBundleStoreForTests();
  });

  it('enqueues a bundle to IndexedDB when offline', async () => {
    const testZip = new TextEncoder().encode('test-zip-data');
    const bundleParams = {
      profileId: 'test-profile',
      label: 'TEST_GESTURE',
      capturedAt: '2024-01-01T00:00:00.000Z',
      source: 'web://test',
      framesCount: 10,
      zip: testZip,
    };

    const bundle = await enqueuePersistedBundle(bundleParams);
    expect(bundle).toBeTruthy();
    expect(bundle!.key).toMatch(/^trainingBundles:/);
    expect(bundle!.profileId).toBe('test-profile');
    expect(bundle!.label).toBe('TEST_GESTURE');
    expect(bundle!.status).toBe('pending');
    expect(bundle!.attempts).toBe(0);

    const bundles = await listQueuedBundles();
    expect(bundles.length).toBe(1);
    expect(bundles[0].key).toBe(bundle!.key);
  });

  it('lists all queued bundles', async () => {
    const zip1 = new TextEncoder().encode('zip-1');
    const zip2 = new TextEncoder().encode('zip-2');

    await enqueuePersistedBundle({
      profileId: 'profile-1',
      label: 'GESTURE_1',
      capturedAt: '2024-01-01T00:00:00.000Z',
      source: 'web://test',
      framesCount: 5,
      zip: zip1,
    });

    await enqueuePersistedBundle({
      profileId: 'profile-2',
      label: 'GESTURE_2',
      capturedAt: '2024-01-02T00:00:00.000Z',
      source: 'web://test',
      framesCount: 8,
      zip: zip2,
    });

    const bundles = await listQueuedBundles();
    expect(bundles.length).toBe(2);
    expect(bundles[0].label).toBe('GESTURE_1');
    expect(bundles[1].label).toBe('GESTURE_2');
  });

  it('marks bundle as uploading', async () => {
    const testZip = new TextEncoder().encode('test-data');
    const bundle = await enqueuePersistedBundle({
      profileId: 'test',
      label: 'TEST',
      capturedAt: '2024-01-01T00:00:00.000Z',
      source: 'web://test',
      framesCount: 3,
      zip: testZip,
    });

    await markBundleUploading(bundle!.key);

    const bundles = await listQueuedBundles();
    expect(bundles.length).toBe(1);
    expect(bundles[0].status).toBe('uploading');
  });

  it('marks bundle as failed with error message', async () => {
    const testZip = new TextEncoder().encode('test-data');
    const bundle = await enqueuePersistedBundle({
      profileId: 'test',
      label: 'TEST',
      capturedAt: '2024-01-01T00:00:00.000Z',
      source: 'web://test',
      framesCount: 3,
      zip: testZip,
    });

    const errorMessage = 'Network error during upload';
    await markBundleFailed(bundle!.key, errorMessage);

    const bundles = await listQueuedBundles();
    expect(bundles.length).toBe(1);
    expect(bundles[0].status).toBe('failed');
    expect(bundles[0].lastError).toBe(errorMessage);
    expect(bundles[0].attempts).toBe(1);
  });

  it('removes bundle after successful upload', async () => {
    const testZip = new TextEncoder().encode('test-data');
    const bundle = await enqueuePersistedBundle({
      profileId: 'test',
      label: 'TEST',
      capturedAt: '2024-01-01T00:00:00.000Z',
      source: 'web://test',
      framesCount: 3,
      zip: testZip,
    });

    let bundles = await listQueuedBundles();
    expect(bundles.length).toBe(1);

    await removeQueuedBundle(bundle!.key);

    bundles = await listQueuedBundles();
    expect(bundles.length).toBe(0);
  });

  it('reads bundle ZIP data', async () => {
    const testZipContent = 'test-zip-content-12345';
    const testZip = new TextEncoder().encode(testZipContent);
    const bundle = await enqueuePersistedBundle({
      profileId: 'test',
      label: 'TEST',
      capturedAt: '2024-01-01T00:00:00.000Z',
      source: 'web://test',
      framesCount: 3,
      zip: testZip,
    });

    const retrievedZip = await readBundleData(bundle!.key);
    expect(retrievedZip).toBeTruthy();
    expect(retrievedZip!.length).toBe(testZip.length);
    
    const retrievedContent = new TextDecoder().decode(retrievedZip);
    expect(retrievedContent).toBe(testZipContent);
  });

  it('handles multiple failed attempts with retry count', async () => {
    const testZip = new TextEncoder().encode('test-data');
    const bundle = await enqueuePersistedBundle({
      profileId: 'test',
      label: 'TEST',
      capturedAt: '2024-01-01T00:00:00.000Z',
      source: 'web://test',
      framesCount: 3,
      zip: testZip,
    });

    // First failure
    await markBundleFailed(bundle!.key, 'First error');
    let bundles = await listQueuedBundles();
    expect(bundles[0].attempts).toBe(1);

    // Second failure
    await markBundleFailed(bundle!.key, 'Second error');
    bundles = await listQueuedBundles();
    expect(bundles[0].attempts).toBe(2);
    expect(bundles[0].lastError).toBe('Second error');

    // Third failure
    await markBundleFailed(bundle!.key, 'Third error');
    bundles = await listQueuedBundles();
    expect(bundles[0].attempts).toBe(3);
  });

  it('persists bundle data across operations', async () => {
    const testZip = new TextEncoder().encode('persistent-data');
    const bundle = await enqueuePersistedBundle({
      profileId: 'test',
      label: 'PERSIST_TEST',
      capturedAt: '2024-01-01T00:00:00.000Z',
      source: 'web://test',
      framesCount: 5,
      clipBytes: 1024,
      stillBytes: 512,
      zip: testZip,
    });

    // Change status
    await markBundleUploading(bundle!.key);
    
    // Read bundle data - should still be there
    const retrievedZip = await readBundleData(bundle!.key);
    expect(retrievedZip).toBeTruthy();
    expect(retrievedZip!.length).toBe(testZip.length);

    // Check metadata
    const bundles = await listQueuedBundles();
    expect(bundles[0].clipBytes).toBe(1024);
    expect(bundles[0].stillBytes).toBe(512);
    expect(bundles[0].framesCount).toBe(5);
  });
});
