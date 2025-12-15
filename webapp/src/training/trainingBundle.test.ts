import { describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { createTrainingZip, normalizeTrainingJobStatus, uploadTrainingBundle } from './trainingBundle';
import type { TrainingBundlePayload } from './types';

const basePayload: TrainingBundlePayload = {
  profileId: 'p1',
  label: 'HILFE',
  smoothingConfig: {
    method: 'stability',
    minCutOff: 0.9,
    beta: 0.05,
    dCutOff: 1.1,
  },
  frames: [
    {
      landmarks: [
        [
          [0.1, 0.2, 0.3],
        ],
        [],
      ],
      handedness: ['Left'],
      poseLandmarks: [
        [0.5, 0.6, 0.1, 0.9],
        [0.4, 0.2, -0.1, 0.8],
      ],
      faceLandmarks: [
        [0.25, 0.75, 0.05],
        [0.26, 0.76, 0.04],
      ],
    },
  ],
};

describe('createTrainingZip', () => {
  it('packt metadata und landmarks inklusive Clip', async () => {
    const clip = new File([new Uint8Array([1, 2, 3])], 'demo.mp4', { type: 'video/mp4' });
    const zip = await createTrainingZip({ ...basePayload, clipFile: clip });
    const entries = unzipSync(zip);
    const entryNames = Object.keys(entries);
    const normalizedNames = entryNames.map((name) => name.replace(/\/$/, ''));
    const metadataEntry = entries['metadata.json'] ?? entries['metadata.json/'];

    expect(normalizedNames).toContain('metadata.json');
    expect(normalizedNames).toContain('landmarks.json');
    const metadataBytes = metadataEntry;
    expect(metadataBytes?.length ?? 0).toBeGreaterThan(0);
    const metadata = JSON.parse(strFromU8(metadataBytes ?? new Uint8Array())) as Record<string, unknown>;
    expect(metadata.profileId).toBe('p1');
    expect(metadata.label).toBe('HILFE');
    expect(metadata.clipFilename).toBe('clip.mp4');

    const landmarksBytes = entries['landmarks.json'] ?? entries['landmarks.json/'];
    expect(landmarksBytes?.length ?? 0).toBeGreaterThan(0);
    const landmarks = JSON.parse(strFromU8(landmarksBytes ?? new Uint8Array())) as {
      frames: Array<{
        landmarks: number[][];
        handLandmarks: number[][][];
        poseLandmarks: number[][];
        faceLandmarks: number[][];
      }>;
      metadata: {
        modalities: Record<string, unknown>;
        smoothing: Record<string, number | string>;
        handedness?: { labels: string[]; frameCount: number };
      };
    };
    expect(Array.isArray(landmarks.frames)).toBe(true);
    const firstFrame = landmarks.frames[0];
    expect(firstFrame?.landmarks?.length).toBe(42);
    expect(firstFrame?.handLandmarks?.[0]?.[0]).toEqual([0.1, 0.2, 0.3]);
    expect(firstFrame?.poseLandmarks?.[0]).toEqual([0.5, 0.6, 0.1, 0.9]);
    expect(firstFrame?.faceLandmarks?.[0]).toEqual([0.25, 0.75, 0.05]);
    expect(landmarks.metadata.modalities).toEqual({
      hands: { present: true, frameCount: 1, coverage: 1 },
      pose: { present: true, frameCount: 1, coverage: 1 },
      face: { present: true, frameCount: 1, coverage: 1 },
    });
    expect(landmarks.metadata.smoothing).toMatchObject({ method: 'stability', minCutOff: 0.9, beta: 0.05, dCutOff: 1.1 });
    expect(landmarks.metadata.handedness).toEqual({ labels: ['Left'], frameCount: 1 });
    expect(metadata).toMatchObject({
      modalities: landmarks.metadata.modalities,
      smoothing: landmarks.metadata.smoothing,
      handedness: landmarks.metadata.handedness,
    });
    expect(entries['clip.mp4']).toBeDefined();
  });

  it('legt eine WebM-Datei als clip.webm in das ZIP', async () => {
    const clip = new File([new Uint8Array([9, 8, 7])], 'clip.webm', { type: 'video/webm' });
    const zip = await createTrainingZip({ ...basePayload, clipFile: clip });
    const entries = unzipSync(zip);
    const normalizedNames = Object.keys(entries).map((name) => name.replace(/\/$/, ''));
    expect(normalizedNames).toContain('clip.webm');
    const metadataBytes = entries['metadata.json'];
    const metadata = JSON.parse(strFromU8(metadataBytes ?? new Uint8Array()));
    expect(metadata.clipFilename).toBe('clip.webm');
  });

  it('speichert handFocus in den Metadaten', async () => {
    const clip = new File([new Uint8Array([1, 2, 3])], 'demo.mp4', { type: 'video/mp4' });
    const zip = await createTrainingZip({ ...basePayload, clipFile: clip, handFocus: 'right' });
    const entries = unzipSync(zip);
    const metadataBytes = entries['metadata.json'];
    const metadata = JSON.parse(strFromU8(metadataBytes ?? new Uint8Array())) as Record<string, unknown>;
    expect(metadata.handFocus).toBe('right');
  });

  it('bricht ab, wenn keine Hand-Landmarks enthalten sind', async () => {
    const payload: TrainingBundlePayload = {
      ...basePayload,
      frames: [
        {
          landmarks: [[], []],
          poseLandmarks: [[0.1, 0.2, 0.3]],
          faceLandmarks: [],
        },
      ],
    };

    await expect(createTrainingZip(payload)).rejects.toThrow(
      'Keine Hand-Landmarks erkannt. Bitte nimm die Gebärde erneut mit sichtbaren Händen auf.',
    );
  });
});

describe('normalizeTrainingJobStatus', () => {
  it('normalisiert unterschiedliche Statusschreibweisen', () => {
    expect(normalizeTrainingJobStatus('queued')).toBe('queued');
    expect(normalizeTrainingJobStatus('Pending')).toBe('queued');
    expect(normalizeTrainingJobStatus('done')).toBe('completed');
    expect(normalizeTrainingJobStatus('error')).toBe('failed');
  });
});

describe('uploadTrainingBundle', () => {
  it('reicht den ZIP-Body an den Server weiter', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'bundle-1', status: 'queued' }),
    });
    (globalThis as any).fetch = fetchSpy;

    const result = await uploadTrainingBundle(basePayload, { endpoint: 'https://example.test' });
    expect(result.id).toBe('bundle-1');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchSpy.mock.calls[0];
    expect(requestInit?.method).toBe('POST');
    expect(requestInit?.headers).toMatchObject({ 'Content-Type': 'application/zip' });
    expect(requestInit?.body).toBeInstanceOf(Blob);
  });

  it('wirft einen Fehler, wenn kein Upload-Endpunkt konfiguriert ist', async () => {
    await expect(uploadTrainingBundle(basePayload, { endpoint: '' })).rejects.toThrow(
      'API-Endpunkt fehlt für Trainings-Uploads.',
    );
  });
});
