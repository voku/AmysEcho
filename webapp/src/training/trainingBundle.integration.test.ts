import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { createTrainingZip, uploadTrainingBundle } from './trainingBundle';
import { REALISTIC_FRAMES } from './__fixtures__/realisticFrames';

type ManifestEntry = {
  metadata: Record<string, any>;
  landmarks: {
      frames: Array<{
        handedness: string[];
        landmarks: number[][];
        handLandmarks: number[][][];
        poseLandmarks: number[][];
        faceLandmarks: number[][];
      }>;
      metadata: Record<string, unknown>;
    };
  files: string[];
};

describe('uploadTrainingBundle integration', () => {
  const manifestEntries: ManifestEntry[] = [];
  const endpoint = 'https://stub.example/api/v1/dgs/sample-bundles';

  beforeEach(() => {
    manifestEntries.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('erstellt ein realistisches Bundle und überträgt es an das Stub-API', async () => {
    const payload = {
      profileId: 'profile-web',
      label: 'HILFE',
      capturedAt: '2024-06-02T10:00:00Z',
      source: 'app://mediapipe',
      frames: REALISTIC_FRAMES,
      clipFile: new File([Uint8Array.from([1, 2, 3, 4])], 'capture.mp4', { type: 'video/mp4' }),
    };

    const expectedZip = await createTrainingZip(payload);

    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== endpoint) {
        throw new Error(`unexpected endpoint: ${input}`);
      }
      const body = init?.body;
      if (!body) {
        throw new Error('expected Blob body');
      }
      expect(Object.prototype.toString.call(body)).toBe('[object Blob]');
      const blob = body as Blob;
      const normalizedBlob =
        typeof (blob as any).arrayBuffer === 'function' ? blob : new Blob([body as Blob], { type: 'application/zip' });
      const blobSize = normalizedBlob.size;
      expect(blobSize).toBeGreaterThan(100);
      expect(blobSize).toBe(expectedZip.byteLength);

      const uploadedBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error ?? new Error('Blob konnte nicht gelesen werden'));
        reader.readAsArrayBuffer(normalizedBlob);
      });
      const uploadedBytes = new Uint8Array(uploadedBuffer);

      let entries: Record<string, Uint8Array>;
      try {
        entries = unzipSync(uploadedBytes);
      } catch (error) {
        const signature = Array.from(uploadedBytes.slice(0, 4)).join(', ');
        throw new Error(
          `uploaded training bundle is not a valid ZIP (magic bytes: ${signature}): ${(error as Error).message}`,
        );
      }
      const metadataEntry = entries['metadata.json'] ?? entries['metadata.json/'];
      const landmarksEntry = entries['landmarks.json'] ?? entries['landmarks.json/'];

      if (!metadataEntry) {
        throw new Error('metadata.json not found in uploaded training bundle ZIP');
      }
      if (!landmarksEntry) {
        throw new Error('landmarks.json not found in uploaded training bundle ZIP');
      }

      const files = Object.keys(entries).map((name) => name.replace(/\/$/, ''));

      manifestEntries.push({
        metadata: JSON.parse(strFromU8(metadataEntry)) as Record<string, any>,
        landmarks: JSON.parse(strFromU8(landmarksEntry)) as {
          frames: Array<{
            handedness: string[];
            landmarks: number[][];
            handLandmarks: number[][][];
            poseLandmarks: number[][];
            faceLandmarks: number[][];
          }>;
          metadata: Record<string, unknown>;
        },
        files,
      });

      return new Response(
        JSON.stringify({
          id: 'bundle-stub-1',
          status: 'queued',
          trainingJob: { jobId: 'job-1', status: 'queued', pollUrl: '/train-status/job-1' },
        }),
        { status: 202, headers: { 'Content-Type': 'application/json' } },
      );
    });

    vi.stubGlobal('fetch', fetchSpy);

    const response = await uploadTrainingBundle(payload, { endpoint });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(response).toEqual({
      id: 'bundle-stub-1',
      status: 'queued',
      trainingJob: { jobId: 'job-1', status: 'queued', pollUrl: '/train-status/job-1' },
    });

    expect(manifestEntries).toHaveLength(1);
    const entry = manifestEntries[0];
    if (!entry) throw new Error('Manifest entry missing');
    expect(entry.metadata).toMatchObject({
      profileId: payload.profileId,
      label: payload.label,
      capturedAt: payload.capturedAt,
      source: payload.source,
      clipFilename: 'clip.mp4',
    });

    expect(entry.landmarks.metadata).toMatchObject({
      modalities: {
        hands: { present: true, frameCount: 2, coverage: 1 },
        pose: { present: false, frameCount: 0, coverage: 0 },
        face: { present: false, frameCount: 0, coverage: 0 },
        nonManual: { present: false, frameCount: 0, coverage: 0 },
      },
      smoothing: { method: 'one_euro' },
    });

    expect(entry.files).toEqual(
      expect.arrayContaining(['metadata.json', 'landmarks.json', 'clip.mp4']),
    );

    const [firstFrame, secondFrame] = entry.landmarks.frames;
    if (!firstFrame || !secondFrame) throw new Error('Frames missing');
    expect(firstFrame.handedness).toEqual(['Left', 'Right']);
    expect(firstFrame.landmarks).toHaveLength(42);
    
    const firstRealisticFrame = REALISTIC_FRAMES[0];
    if (firstRealisticFrame && firstRealisticFrame.landmarks[0]) {
      expect(firstFrame.landmarks[0]).toEqual(firstRealisticFrame.landmarks[0][0]);
    }
    
    if (firstRealisticFrame && firstRealisticFrame.landmarks[1]) {
      expect(firstFrame.landmarks[21]).toEqual(firstRealisticFrame.landmarks[1][0]);
    }

    if (firstRealisticFrame && firstRealisticFrame.landmarks[0] && firstFrame.handLandmarks[0]) {
      expect(firstFrame.handLandmarks[0][0]).toEqual(firstRealisticFrame.landmarks[0][0]);
    }
    expect(firstFrame.poseLandmarks).toEqual([]);
    expect(firstFrame.faceLandmarks).toEqual([]);

    expect(secondFrame.handedness).toEqual(['Right']);
    expect(secondFrame.landmarks).toHaveLength(42);
    expect(secondFrame.landmarks[0]).toEqual([0, 0, 0]);
    
    const secondRealisticFrame = REALISTIC_FRAMES[1];
    if (secondRealisticFrame && secondRealisticFrame.landmarks[0]) {
      expect(secondFrame.landmarks[21]).toEqual(secondRealisticFrame.landmarks[0][0]);
      if (secondFrame.handLandmarks[0]) {
        expect(secondFrame.handLandmarks[0][0]).toEqual(secondRealisticFrame.landmarks[0][0]);
      }
    }
  }, 10000);
});
