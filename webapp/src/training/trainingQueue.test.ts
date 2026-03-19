import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  enqueuePersistedBundle,
  hasAutomaticUploadAttemptsRemaining,
  listQueuedBundles,
  MAX_AUTOMATIC_BUNDLE_UPLOAD_ATTEMPTS,
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
    const firstBundle = bundles[0];
    if (firstBundle && bundle) {
      expect(firstBundle.key).toBe(bundle.key);
    }
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
    const b0 = bundles[0];
    const b1 = bundles[1];
    if (b0) expect(b0.label).toBe('GESTURE_1');
    if (b1) expect(b1.label).toBe('GESTURE_2');
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

    if (bundle) {
      await markBundleUploading(bundle.key);

      const bundles = await listQueuedBundles();
      expect(bundles.length).toBe(1);
      const firstBundle = bundles[0];
      if (firstBundle) {
        expect(firstBundle.status).toBe('uploading');
      }
    }
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
    const firstBundle = bundles[0];
    if (firstBundle) {
      expect(firstBundle.status).toBe('failed');
      expect(firstBundle.lastError).toBe(errorMessage);
      expect(firstBundle.attempts).toBe(1);
    }
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

    if (bundle) {
      await removeQueuedBundle(bundle.key);
    }

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

    const retrievedZip = bundle ? await readBundleData(bundle.key) : null;
    expect(retrievedZip).toBeDefined();
    if (retrievedZip) {
      const retrievedContent = new TextDecoder().decode(retrievedZip);
      expect(retrievedContent).toBe(testZipContent);
    }
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
    if (bundles[0]) expect(bundles[0].attempts).toBe(1);

    // Second failure
    await markBundleFailed(bundle!.key, 'Second error');
    bundles = await listQueuedBundles();
    if (bundles[0]) {
      expect(bundles[0].attempts).toBe(2);
      expect(bundles[0].lastError).toBe('Second error');
    }

    // Third failure
    await markBundleFailed(bundle!.key, 'Third error');
    bundles = await listQueuedBundles();
    if (bundles[0]) expect(bundles[0].attempts).toBe(3);
  });

  it('does not double count one failed upload after marking the bundle as uploading', async () => {
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
    await markBundleFailed(bundle!.key, 'Upload fehlgeschlagen');

    const bundles = await listQueuedBundles();
    if (bundles[0]) {
      expect(bundles[0].status).toBe('failed');
      expect(bundles[0].attempts).toBe(1);
    }
  });

  it('reports when automatic retries are exhausted', async () => {
    expect(hasAutomaticUploadAttemptsRemaining({ attempts: MAX_AUTOMATIC_BUNDLE_UPLOAD_ATTEMPTS - 1 })).toBe(true);
    expect(hasAutomaticUploadAttemptsRemaining({ attempts: MAX_AUTOMATIC_BUNDLE_UPLOAD_ATTEMPTS })).toBe(false);
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
    const firstBundle = bundles[0];
    if (firstBundle) {
      expect(firstBundle.clipBytes).toBe(1024);
      expect(firstBundle.stillBytes).toBe(512);
      expect(firstBundle.framesCount).toBe(5);
    }
  });
});
