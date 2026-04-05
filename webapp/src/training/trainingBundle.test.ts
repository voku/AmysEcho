import { afterEach, describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import {
  createTrainingZip,
  fetchTrainingQualityLog,
  normalizeTrainingJobStatus,
  resolveTrainingUploadTimeoutMs,
  uploadTrainingBundle,
} from './trainingBundle';
import type { TrainingBundlePayload } from './types';

const basePoseLandmarks = () => {
  const pose = Array.from({ length: 33 }, () => [0, 0, 0, 0.9]);
  pose[0] = [0.5, 0.6, 0.1, 0.9];
  pose[1] = [0.4, 0.2, -0.1, 0.8];
  pose[11] = [0.4, 0.2, -0.1, 0.8];
  pose[12] = [0.6, 0.2, -0.1, 0.8];
  return pose;
};

const baseFaceLandmarks = () => {
  const face = Array.from({ length: 468 }, () => [0, 0, 0]);
  face[0] = [0.25, 0.75, 0.05];
  face[1] = [0.5, 0.5, 0.0];
  face[13] = [0.5, 0.54, 0.0];
  face[14] = [0.5, 0.58, 0.0];
  face[33] = [0.4, 0.5, 0.0];
  face[105] = [0.4, 0.42, 0.0];
  face[159] = [0.4, 0.48, 0.0];
  face[263] = [0.6, 0.5, 0.0];
  face[334] = [0.6, 0.42, 0.0];
  face[386] = [0.6, 0.48, 0.0];
  return face;
};

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
      poseLandmarks: basePoseLandmarks(),
      faceLandmarks: baseFaceLandmarks(),
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
    expect(metadata['profileId']).toBe('p1');
    expect(metadata['label']).toBe('HILFE');
    expect(metadata['clipFilename']).toBe('clip.mp4');

    const landmarksBytes = entries['landmarks.json'] ?? entries['landmarks.json/'];
    expect(landmarksBytes?.length ?? 0).toBeGreaterThan(0);
    const landmarks = JSON.parse(strFromU8(landmarksBytes ?? new Uint8Array())) as {
      frames: Array<{
        landmarks: number[][];
        handLandmarks: number[][][];
        poseLandmarks: number[][];
        faceLandmarks: number[][];
        nonManualFeatures?: Record<string, number | null>;
      }>;
      metadata: {
        modalities: {
          hands: { present: boolean; frameCount: number; coverage: number };
          pose: { present: boolean; frameCount: number; coverage: number };
          face: { present: boolean; frameCount: number; coverage: number };
          nonManual: { present: boolean; frameCount: number; coverage: number };
        };
        smoothing: Record<string, number | string>;
        handedness?: { labels: string[]; frameCount: number };
      };
    };
    expect(Array.isArray(landmarks.frames)).toBe(true);
    const firstFrame = landmarks.frames[0];
    if (firstFrame) {
      expect(firstFrame.landmarks.length).toBe(42);
      if (firstFrame.handLandmarks[0]) {
        expect(firstFrame.handLandmarks[0][0]).toEqual([0.1, 0.2, 0.3]);
      }
      if (firstFrame.poseLandmarks) {
        expect(firstFrame.poseLandmarks[0]).toEqual([0.5, 0.6, 0.1, 0.9]);
      }
      if (firstFrame.faceLandmarks && firstFrame.faceLandmarks[0]) {
        expect(firstFrame.faceLandmarks[0]).toEqual([0.25, 0.75, 0.05]);
      }
      expect(firstFrame.nonManualFeatures).toBeDefined();
    }
    expect(landmarks.metadata.modalities).toEqual({
      hands: { present: true, frameCount: 1, coverage: 1 },
      pose: { present: true, frameCount: 1, coverage: 1 },
      face: { present: true, frameCount: 1, coverage: 1 },
      nonManual: { present: true, frameCount: 1, coverage: 1 },
    });
    expect(landmarks.metadata.smoothing).toMatchObject({ method: 'stability', minCutOff: 0.9, beta: 0.05, dCutOff: 1.1 });
    expect(landmarks.metadata.handedness).toEqual({ labels: ['Left'], frameCount: 1 });
    expect(metadata).toMatchObject({
      modalities: landmarks.metadata.modalities,
      smoothing: landmarks.metadata.smoothing,
      handedness: landmarks.metadata.handedness,
      featureContract: {
        version: 'wrist_relative_max_abs_v1',
        normalization: 'wrist_relative_max_abs',
        handOrder: ['Left', 'Right'],
        missingHandStrategy: 'zero_pad',
        pointsPerHand: 21,
        coordinatesPerPoint: 3,
        vectorLength: 126,
        featurePreview: expect.any(Array),
      },
      validationSummary: expect.objectContaining({
        frameCount: 1,
        qualityScore: expect.any(Number),
        confidence: expect.any(Number),
        issues: expect.any(Array),
        suggestions: expect.any(Array),
      }),
    });
    expect((metadata.featureContract as { featurePreview?: unknown[] }).featurePreview?.length ?? 0).toBe(12);
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

  it('speichert handFocus und Mirror-Augmentation in den Metadaten', async () => {
    const clip = new File([new Uint8Array([1, 2, 3])], 'demo.mp4', { type: 'video/mp4' });
    const zip = await createTrainingZip({ ...basePayload, clipFile: clip, handFocus: 'either_hand' });
    const entries = unzipSync(zip);
    const metadataBytes = entries['metadata.json'];
    const metadata = JSON.parse(strFromU8(metadataBytes ?? new Uint8Array())) as Record<string, unknown>;
    expect(metadata['handFocus']).toBe('either_hand');
    expect(metadata['augmentation']).toEqual({ mirrorSafe: true });
  });

  it('deaktiviert Mirror-Augmentation für asymmetrische Handrollen', async () => {
    const clip = new File([new Uint8Array([1, 2, 3])], 'demo.mp4', { type: 'video/mp4' });
    const zip = await createTrainingZip({ ...basePayload, clipFile: clip, handFocus: 'dominant_only' });
    const entries = unzipSync(zip);
    const metadataBytes = entries['metadata.json'];
    const metadata = JSON.parse(strFromU8(metadataBytes ?? new Uint8Array())) as Record<string, unknown>;
    expect(metadata['augmentation']).toEqual({ mirrorSafe: false });
  });

  it('übernimmt Aufnahme-Metadaten und Frame-Zeitstempel', async () => {
    const clip = new File([new Uint8Array([1, 2, 3, 4])], 'demo.webm', { type: 'video/webm' });
    const still = new File([new Uint8Array([5, 6])], 'still.jpg', { type: 'image/jpeg' });
    const timestampMs = 1_700_000_123_456;
    const payload: TrainingBundlePayload = {
      ...basePayload,
      clipFile: clip,
      stillFile: still,
      recording: {
        frameCount: 12,
        clipDurationMs: 1200,
        previewMirrored: true,
      },
      frames: [
        {
          ...(basePayload.frames[0] ?? {}),
          timestampMs,
        } as any,
      ],
    };

    const zip = await createTrainingZip(payload);
    const entries = unzipSync(zip);
    const metadataBytes = entries['metadata.json'];
    const metadata = JSON.parse(strFromU8(metadataBytes ?? new Uint8Array())) as { recording?: Record<string, unknown> };
    expect(metadata.recording).toMatchObject({
      frameCount: 12,
      usableFrameCount: 1,
      clipDurationMs: 1200,
      clipBytes: clip.size,
      clipMimeType: clip.type,
      stillBytes: still.size,
      stillMimeType: still.type,
      previewMirrored: true,
    });

    const landmarksBytes = entries['landmarks.json'];
    const landmarks = JSON.parse(strFromU8(landmarksBytes ?? new Uint8Array())) as {
      frames: Array<{ timestampMs?: number }>;
    };
    const f0 = landmarks.frames[0];
    if (f0) {
      expect(f0.timestampMs).toBe(timestampMs);
    }
  });

  it('übernimmt signer-, geräte-, kamera- und lichtkontext in metadata.json', async () => {
    const payload: TrainingBundlePayload = {
      ...basePayload,
      captureContext: {
        signer: {
          signerId: 'amy-main',
          dominantHand: 'right',
          ageGroup: 'child',
        },
        device: {
          deviceModel: 'iPad13,4',
          platform: 'ios',
          osVersion: '17.5',
          appVersion: '1.2.3',
        },
        camera: {
          facingMode: 'user',
          width: 1280,
          height: 720,
          fps: 30,
        },
        lighting: {
          condition: 'mixed',
          confidence: 0.82,
          source: 'auto',
        },
      },
    };

    const zip = await createTrainingZip(payload);
    const entries = unzipSync(zip);
    const metadataBytes = entries['metadata.json'];
    const metadata = JSON.parse(strFromU8(metadataBytes ?? new Uint8Array())) as {
      captureContext?: Record<string, unknown>;
    };

    expect(metadata.captureContext).toEqual(payload.captureContext);
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

  it('bewahrt multimodale Daten vollständig über mehrere Frames', async () => {
    const payload: TrainingBundlePayload = {
      ...basePayload,
      frames: [
        {
          landmarks: [[[0.1, 0.2, 0.3]], [[0.4, 0.5, 0.6]]],
          handedness: ['Left', 'Right'],
          poseLandmarks: basePoseLandmarks(),
          faceLandmarks: baseFaceLandmarks(),
        },
        {
          landmarks: [[[0.11, 0.21, 0.31]], []],
          handedness: ['Left'],
          poseLandmarks: basePoseLandmarks().map((point, index) =>
            index === 0 ? [0.51, 0.61, 0.11, 0.91] : point,
          ),
          faceLandmarks: baseFaceLandmarks().map((point, index) =>
            index === 0 ? [0.27, 0.77, 0.06] : point,
          ),
        },
        {
          landmarks: [[], [[0.41, 0.51, 0.61]]],
          handedness: ['Right'],
          poseLandmarks: [],
          faceLandmarks: [],
        },
      ],
    };

    const zip = await createTrainingZip(payload);
    const entries = unzipSync(zip);
    const landmarksBytes = entries['landmarks.json'];
    const landmarks = JSON.parse(strFromU8(landmarksBytes ?? new Uint8Array())) as {
      frames: Array<{
        handedness: string[];
        landmarks: number[][];
        handLandmarks: number[][][];
        poseLandmarks: number[][];
        faceLandmarks: number[][];
      }>;
      metadata: {
        modalities: {
          hands: { present: boolean; frameCount: number; coverage: number };
          pose: { present: boolean; frameCount: number; coverage: number };
          face: { present: boolean; frameCount: number; coverage: number };
          nonManual: { present: boolean; frameCount: number; coverage: number };
        };
        smoothing: Record<string, number | string>;
        handedness?: { labels: string[]; frameCount: number };
      };
    };

    expect(landmarks.frames).toHaveLength(3);
    
    const f0 = landmarks.frames[0];
    if (f0) {
      expect(f0.handedness).toEqual(['Left', 'Right']);
      expect(f0.handLandmarks).toHaveLength(2);
      expect(f0.handLandmarks[0]?.[0]).toEqual([0.1, 0.2, 0.3]);
      expect(f0.handLandmarks[1]?.[0]).toEqual([0.4, 0.5, 0.6]);
      expect(f0.poseLandmarks).toHaveLength(33);
      expect(f0.poseLandmarks[0]).toEqual([0.5, 0.6, 0.1, 0.9]);
      expect(f0.faceLandmarks).toHaveLength(468);
      if (f0.faceLandmarks && f0.faceLandmarks[0]) {
        expect(f0.faceLandmarks[0]).toEqual([0.25, 0.75, 0.05]);
      }
    }
    
    // Frame 2: Left hand, pose, and face present
    const f1 = landmarks.frames[1];
    if (f1) {
      expect(f1.handedness).toEqual(['Left']);
      expect(f1.handLandmarks).toHaveLength(2);
      expect(f1.handLandmarks[0]?.[0]).toEqual([0.11, 0.21, 0.31]);
      expect(f1.poseLandmarks).toHaveLength(33);
      expect(f1.poseLandmarks[0]).toEqual([0.51, 0.61, 0.11, 0.91]);
      expect(f1.faceLandmarks).toHaveLength(468);
      if (f1.faceLandmarks && f1.faceLandmarks[0]) {
        expect(f1.faceLandmarks[0]).toEqual([0.27, 0.77, 0.06]);
      }
    }
    
    // Frame 3: Right hand only, no pose or face
    const f2 = landmarks.frames[2];
    if (f2) {
      expect(f2.handedness).toEqual(['Right']);
      expect(f2.handLandmarks).toHaveLength(2);
      expect(f2.handLandmarks[1]?.[0]).toEqual([0.41, 0.51, 0.61]);
      expect(f2.poseLandmarks).toHaveLength(0);
      expect(f2.faceLandmarks).toHaveLength(0);
    }
    
    // Verify modality metadata
    expect(landmarks.metadata.modalities.hands).toEqual({ present: true, frameCount: 3, coverage: 1 });
    expect(landmarks.metadata.modalities.pose).toEqual({ present: true, frameCount: 2, coverage: 2/3 });
    expect(landmarks.metadata.modalities.face).toEqual({ present: true, frameCount: 2, coverage: 2/3 });
    expect(landmarks.metadata.modalities.nonManual).toEqual({ present: true, frameCount: 2, coverage: 2/3 });
    expect(landmarks.metadata.handedness).toEqual({ labels: ['Left', 'Right'], frameCount: 3 });
  });

  it('bewahrt Pose-Landmarks nach der Verarbeitung', async () => {
    const payload: TrainingBundlePayload = {
      ...basePayload,
      frames: [
        {
          landmarks: [[[0.1, 0.2, 0.3]]],
          handedness: ['Left'],
          poseLandmarks: [[0.5, 0.6, 0.1, 0.9]],
          faceLandmarks: [],
        },
      ],
    };

    const zip = await createTrainingZip(payload);
    const entries = unzipSync(zip);
    const landmarksBytes = entries['landmarks.json'];
    const landmarks = JSON.parse(strFromU8(landmarksBytes ?? new Uint8Array())) as {
      frames: Array<{ poseLandmarks?: number[][] }>;
    };

    const f0 = landmarks.frames[0];
    if (f0 && f0.poseLandmarks) {
      expect(f0.poseLandmarks).toBeDefined();
      expect(f0.poseLandmarks).toHaveLength(1);
      const firstPose = f0.poseLandmarks[0];
      if (firstPose) {
        expect(firstPose).toEqual([0.5, 0.6, 0.1, 0.9]);
      }
    }
  });

  it('bewahrt Face-Landmarks nach der Verarbeitung', async () => {
    const payload: TrainingBundlePayload = {
      ...basePayload,
      frames: [
        {
          landmarks: [[[0.1, 0.2, 0.3]]],
          handedness: ['Left'],
          poseLandmarks: [],
          faceLandmarks: [[0.25, 0.75, 0.05]],
        },
      ],
    };

    const zip = await createTrainingZip(payload);
    const entries = unzipSync(zip);
    const landmarksBytes = entries['landmarks.json'];
    const landmarks = JSON.parse(strFromU8(landmarksBytes ?? new Uint8Array())) as {
      frames: Array<{ faceLandmarks?: number[][] }>;
    };

    const f0 = landmarks.frames[0];
    if (f0 && f0.faceLandmarks) {
      expect(f0.faceLandmarks).toBeDefined();
      expect(f0.faceLandmarks).toHaveLength(1);
      const firstFace = f0.faceLandmarks[0];
      if (firstFace) {
        expect(firstFace).toEqual([0.25, 0.75, 0.05]);
      }
    }
  });

  it('bewahrt Smoothing-Konfiguration in Metadaten', async () => {
    const customSmoothing = {
      method: 'one_euro',
      minCutOff: 1.5,
      beta: 0.02,
      dCutOff: 1.2,
    };
    const payload: TrainingBundlePayload = {
      ...basePayload,
      smoothingConfig: customSmoothing,
    };

    const zip = await createTrainingZip(payload);
    const entries = unzipSync(zip);
    const metadataBytes = entries['metadata.json'];
    const metadata = JSON.parse(strFromU8(metadataBytes ?? new Uint8Array())) as {
      smoothing?: Record<string, string | number>;
    };

    // This test ensures smoothing config is preserved in metadata
    expect(metadata.smoothing).toBeDefined();
    if (metadata.smoothing) {
      expect(metadata.smoothing).toEqual(customSmoothing);
    }
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

describe('resolveTrainingUploadTimeoutMs', () => {
  it('verwendet das Mindest-Timeout für leere Bundles', () => {
    expect(resolveTrainingUploadTimeoutMs(0)).toBe(30000);
  });

  it('erhöht das Timeout abhängig von der Bundle-Größe', () => {
    expect(resolveTrainingUploadTimeoutMs(1024 * 1024)).toBe(45000);
    expect(resolveTrainingUploadTimeoutMs(4 * 1024 * 1024)).toBe(90000);
  });

  it('begrenzt das Timeout auf das Maximum', () => {
    expect(resolveTrainingUploadTimeoutMs(40 * 1024 * 1024)).toBe(300000);
  });
});

describe('uploadTrainingBundle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('reicht den ZIP-Body an den Server weiter', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'bundle-1', status: 'queued' }),
    });
    vi.stubGlobal('fetch', fetchSpy as any);

    const result = await uploadTrainingBundle(basePayload, { endpoint: 'https://example.test' });
    expect(result.id).toBe('bundle-1');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const firstCall = fetchSpy.mock.calls[0];
    if (firstCall) {
      const [, requestInit] = firstCall;
      expect(requestInit?.method).toBe('POST');
      expect(requestInit?.headers).toMatchObject({ 'Content-Type': 'application/zip' });
      expect(requestInit?.body).toBeInstanceOf(Blob);
    }
  });

  it('wirft einen Fehler, wenn kein Upload-Endpunkt konfiguriert ist', async () => {
    await expect(uploadTrainingBundle(basePayload, { endpoint: '' })).rejects.toThrow(
      'API-Endpunkt fehlt für Trainings-Uploads.',
    );
  });

  it('liest Queue-Metadaten aus der Upload-Antwort', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({
        id: 'bundle-2',
        status: 'queued',
        trainingJob: {
          jobId: 'job-2',
          status: 'queued',
          pollUrl: '/api/v1/train-status/job-2',
          queueDepth: 2,
          retryAfterMs: 1000,
        },
        validationSummary: {
          frameCount: 14,
          issues: ['hand_coverage_low'],
          suggestions: ['Halte die Hände im Bild.'],
          qualityScore: 74,
          confidence: 0.9,
        },
        qualityGate: {
          outcome: 'review',
          reasons: ['hand_coverage_low'],
        },
      }),
    });
    vi.stubGlobal('fetch', fetchSpy as any);

    const result = await uploadTrainingBundle(basePayload, { endpoint: 'https://example.test' });
    expect(result.trainingJob?.queueDepth).toBe(2);
    expect(result.trainingJob?.retryAfterMs).toBe(1000);
    expect(result.validationSummary?.frameCount).toBe(14);
    expect(result.validationSummary?.qualityScore).toBe(74);
    expect(result.qualityGate).toEqual({ outcome: 'review', reasons: ['hand_coverage_low'] });
  });


  it('meldet HTTP 404 mit klarer Update-Hinweis-Meldung', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });
    vi.stubGlobal('fetch', fetchSpy as any);

    await expect(
      uploadTrainingBundle(basePayload, {
        endpoint: 'https://example.test/api/v1/dgs/sample-bundles',
        token: 'demo-token',
      }),
    ).rejects.toThrow('Upload-Endpunkt nicht gefunden (HTTP 404). Bitte Webapp und Server gemeinsam aktualisieren.');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const firstCall = fetchSpy.mock.calls[0];
    if (firstCall) {
      const [url, requestInit] = firstCall;
      expect(url).toBe('https://example.test/api/v1/dgs/sample-bundles');
      expect(requestInit?.headers).toMatchObject({
        'Content-Type': 'application/zip',
        Authorization: 'Bearer demo-token',
      });
    }
  });

  it.each([
    { status: 422, statusText: 'Unprocessable Entity' },
    { status: 404, statusText: 'Not Found' },
  ])('zeigt die tatsächliche Server-Fehlermeldung bei HTTP $status an', async ({ status, statusText }) => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status,
      statusText,
      json: () => Promise.resolve({ error: 'Profil nicht gefunden.' }),
    });
    vi.stubGlobal('fetch', fetchSpy as any);

    await expect(
      uploadTrainingBundle(basePayload, {
        endpoint: 'https://example.test/api/v1/dgs/sample-bundles',
        token: 'demo-token',
      }),
    ).rejects.toThrow('Profil nicht gefunden.');
  });

  it('meldet Zeitüberschreitungen mit verständlicher Fehlermeldung', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    vi.stubGlobal('fetch', fetchSpy as any);

    await expect(uploadTrainingBundle(basePayload, { endpoint: 'https://example.test' })).rejects.toThrow(
      'Upload wurde wegen einer Zeitüberschreitung abgebrochen.',
    );
  });

  it('versucht den Upload bei HTTP 429 erneut und respektiert Retry-After', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '1' }),
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'bundle-retry', status: 'queued' }),
      });
    vi.stubGlobal('fetch', fetchSpy as any);

    const request = uploadTrainingBundle(basePayload, { endpoint: 'https://example.test' });
    const expectation = expect(request).resolves.toMatchObject({ id: 'bundle-retry' });

    await vi.advanceTimersByTimeAsync(1000);
    await expectation;
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('liefert bei dauerhaftem HTTP 429 eine verständliche Upload-Fehlermeldung', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '0.1' }),
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchSpy as any);

    const request = uploadTrainingBundle(basePayload, { endpoint: 'https://example.test' });
    const expectation = expect(request).rejects.toThrow('Zu viele Anfragen. Bitte warte einen Moment und versuche den Upload erneut.');

    await vi.advanceTimersByTimeAsync(2000);
    await expectation;
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

});


describe('fetchTrainingQualityLog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('lädt und filtert Quality-Log-Einträge', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            bundleId: 'bundle-1',
            label: 'HILFE',
            profileId: 'profile-1',
            reasons: ['too_few_frames'],
            metrics: {
              frameCount: 8,
              handCoverage: 0.4,
              poseCoverage: 0.8,
              faceCoverage: 0.7,
              handJitterRaw: 0.12,
              poseJitterRaw: 0.2,
              faceJitterRaw: 0.08,
              overallQualityScore: 0.74,
            },
            recordedAt: '2026-01-01T10:00:00.000Z',
          },
          {
            bundleId: '',
            label: 'ungültig',
            profileId: null,
            reasons: [],
            metrics: {},
            recordedAt: '2026-01-01T11:00:00.000Z',
          },
        ],
      }),
      headers: new Headers(),
    });

    vi.stubGlobal('fetch', fetchSpy as any);

    const result = await fetchTrainingQualityLog({
      endpoint: 'https://api.example.org/api/v1/dgs/training-quality',
      token: 'token-1',
      profileId: 'profile-1',
      limit: 10,
    });

    expect(result).toEqual([
      expect.objectContaining({
        bundleId: 'bundle-1',
        reasons: ['too_few_frames'],
        metrics: expect.objectContaining({
          handJitterRaw: 0.12,
          poseJitterRaw: 0.2,
          faceJitterRaw: 0.08,
          overallQualityScore: 0.74,
        }),
      }),
    ]);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('profileId=profile-1'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer token-1' }),
      }),
    );

    vi.unstubAllGlobals();
  });


  it('ignoriert Quality-Log-Einträge mit nicht-endlichen Pflichtmetriken', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            bundleId: 'bundle-invalid-nan',
            label: 'HILFE',
            profileId: 'profile-1',
            reasons: ['too_few_frames'],
            metrics: {
              frameCount: Number.NaN,
              handCoverage: 0.4,
              poseCoverage: 0.8,
              faceCoverage: 0.7,
            },
            recordedAt: '2026-01-01T10:00:00.000Z',
          },
        ],
      }),
      headers: new Headers(),
    });

    vi.stubGlobal('fetch', fetchSpy as any);

    const result = await fetchTrainingQualityLog({
      endpoint: 'https://api.example.org/api/v1/dgs/training-quality',
      token: 'token-1',
      profileId: 'profile-1',
      limit: 10,
    });

    expect(result).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('fällt bei 403 mit profileId auf den allgemeinen Qualitäts-Log zurück', async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              bundleId: 'bundle-2',
              label: 'HALLO',
              profileId: 'profile-2',
              reasons: ['hand_coverage_low'],
              metrics: {
                frameCount: 12,
                handCoverage: 0.5,
                poseCoverage: 0.75,
                faceCoverage: 0.8,
              },
              recordedAt: '2026-01-01T12:00:00.000Z',
            },
          ],
        }),
        headers: new Headers(),
      });

    vi.stubGlobal('fetch', fetchSpy as any);

    const result = await fetchTrainingQualityLog({
      endpoint: 'https://api.example.org/api/v1/dgs/training-quality',
      token: 'token-1',
      profileId: 'nicht-autorisierte-profile-id',
      limit: 10,
    });

    expect(result).toEqual([
      expect.objectContaining({
        bundleId: 'bundle-2',
      }),
    ]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const firstRequestUrl = String(fetchSpy.mock.calls[0]?.[0]);
    const secondRequestUrl = String(fetchSpy.mock.calls[1]?.[0]);
    expect(firstRequestUrl).toContain('profileId=nicht-autorisierte-profile-id');
    expect(secondRequestUrl).not.toContain('profileId=');

    vi.unstubAllGlobals();
  });

  it('wartet bei HTTP 429 und versucht das Qualitätsprotokoll erneut', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
        headers: new Headers(),
      });

    vi.stubGlobal('fetch', fetchSpy as any);

    const request = fetchTrainingQualityLog({
      endpoint: 'https://api.example.org/api/v1/dgs/training-quality',
      token: 'token-1',
      profileId: 'profile-1',
      limit: 10,
    });
    const expectation = expect(request).resolves.toEqual([]);

    await vi.advanceTimersByTimeAsync(1000);
    await expectation;
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('liefert bei dauerhaftem HTTP 429 eine verständliche Fehlermeldung', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '0.1' }),
    });

    vi.stubGlobal('fetch', fetchSpy as any);

    const request = fetchTrainingQualityLog({
      endpoint: 'https://api.example.org/api/v1/dgs/training-quality',
      token: 'token-1',
      profileId: 'profile-1',
      limit: 10,
    });
    const expectation = expect(request).rejects.toThrow('Zu viele Anfragen. Bitte versuche es später erneut.');

    await vi.advanceTimersByTimeAsync(2000);
    await expectation;
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});
