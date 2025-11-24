import { describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { createTrainingZip, normalizeTrainingJobStatus, uploadTrainingBundle } from './trainingBundle';
import type { TrainingBundlePayload } from './types';

const basePayload: TrainingBundlePayload = {
  profileId: 'p1',
  label: 'HILFE',
  frames: [
    {
      landmarks: [
        [
          [0.1, 0.2, 0.3],
        ],
        [],
      ],
      handedness: ['Left'],
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
      frames: Array<{ landmarks: number[][] }>;
    };
    expect(Array.isArray(landmarks.frames)).toBe(true);
    expect(landmarks.frames[0]?.landmarks?.length).toBe(42);
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
});
