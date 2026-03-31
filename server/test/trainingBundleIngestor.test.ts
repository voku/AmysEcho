import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  MAX_FACE_JITTER,
  MAX_HAND_JITTER,
  MAX_POSE_JITTER,
  MIN_SIGN_SAMPLE_FRAMES,
} from '../src/constants/trainingQuality.js';

let ingestTrainingBundlesIntoDataset: (
  typeof import('../src/services/trainingBundleIngestor.js')
)['ingestTrainingBundlesIntoDataset'];
let DATA_DIR: string;
let KID_STARTER_PRESET_PATH: string;
let DB_PATH: string;
let saveTrainingManifestToStore: typeof import('../src/services/trainingJsonStore.js').saveTrainingManifest;
let loadDgsSamplesFromStore: typeof import('../src/services/trainingJsonStore.js').loadDgsSamples;
let loadTrainingQualityLogFromStore: typeof import('../src/services/trainingJsonStore.js').loadTrainingQualityLog;

function resolveDataPath(relativePath: string): string {
  if (!DATA_DIR) {
    throw new Error('DATA_DIR not initialized');
  }
  return path.join(DATA_DIR, relativePath);
}

type ExtraFile = { relativePath: string; data?: string | Buffer };

type LandmarkFrame = {
  landmarks: number[][];
  handLandmarks?: number[][][];
  poseLandmarks?: number[][];
  faceLandmarks?: number[][];
  handedness?: Array<string | unknown>;
  timestampMs?: number;
};

type LandmarksPayload = { frames: LandmarkFrame[]; metadata?: Record<string, unknown> };

type BundleFixtureOptions = {
  landmarksRelativePath?: string;
  frames?: LandmarksPayload;
  includeValidationSummary?: boolean;
  recordingMetadata?: Record<string, unknown>;
  featureContractVersion?: string;
  extraFiles?: ExtraFile[];
};

function buildLandmarkFrame(seed: number): LandmarkFrame {
  return {
    landmarks: Array.from({ length: 42 }, (_, idx) => {
      const base = seed + idx * 0.01;
      return [base, base + 0.01, base + 0.02];
    }),
  };
}

function buildConstantLandmarkFrame(value: number): LandmarkFrame {
  return {
    landmarks: Array.from({ length: 42 }, () => [value, value, value]),
  };
}

describe('ingestTrainingBundlesIntoDataset', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'amy-bundles-'));
    process.env.AMY_ECHO_DATA_DIR = tempDir;
    const constants = await import('../src/constants/modelPaths.js');
    const { loadDatabase } = await import('../src/db.js');
    ({ saveTrainingManifest: saveTrainingManifestToStore, loadDgsSamples: loadDgsSamplesFromStore, loadTrainingQualityLog: loadTrainingQualityLogFromStore } = await import('../src/services/trainingJsonStore.js'));
    DATA_DIR = constants.DATA_DIR;
    KID_STARTER_PRESET_PATH = path.join(tempDir, 'config', 'kid_starter_preset.json');
    process.env.AMY_ECHO_KID_STARTER_PRESET_PATH = KID_STARTER_PRESET_PATH;
    DB_PATH = path.join(tempDir, 'db.json');
    await loadDatabase(DB_PATH);
    ({ ingestTrainingBundlesIntoDataset } = await import('../src/services/trainingBundleIngestor.js'));
  });

  afterAll(async () => {
    delete process.env.AMY_ECHO_DATA_DIR;
    delete process.env.AMY_ECHO_KID_STARTER_PRESET_PATH;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.mkdir(tempDir, { recursive: true });
    const { loadDatabase } = await import('../src/db.js');
    DB_PATH = path.join(tempDir, `db-${Date.now()}.json`);
    await loadDatabase(DB_PATH);
  });

  it('copies unique bundle frames into the dataset and avoids duplicates', async () => {
    await writeBundleFixture('bundle-1');

    const firstRun = await ingestTrainingBundlesIntoDataset();
    expect(firstRun.appended).toBe(MIN_SIGN_SAMPLE_FRAMES);

    const dataset = loadDgsSamplesFromStore<any>();
    expect(dataset.samples).toHaveLength(MIN_SIGN_SAMPLE_FRAMES);
    expect(dataset.samples[0]).toMatchObject({
      label: 'HALLO',
      profileId: 'p-123',
      sourceBundleId: 'bundle-1',
      frameIndex: 0,
    });
    expect(dataset.samples[1]).toMatchObject({
      label: 'HALLO',
      profileId: 'p-123',
      sourceBundleId: 'bundle-1',
      frameIndex: 1,
    });
    expect(dataset.samples[0].landmarks).toHaveLength(42);
    expect(dataset.samples[1].landmarks).toHaveLength(42);
    expect(dataset.samples[0].landmarks[0]).toEqual([0, 0, 0]);
    expect(dataset.samples[1].landmarks[1]).toEqual([0.02, 0.03, 0.04]);

    const secondRun = await ingestTrainingBundlesIntoDataset();
    expect(secondRun.appended).toBe(0);

    const datasetAfter = loadDgsSamplesFromStore<any>();
    expect(datasetAfter.samples).toHaveLength(MIN_SIGN_SAMPLE_FRAMES);
  });

  it('rejects corrupted manifest files at read boundary', async () => {
    const { setJsonCollection } = await import('../src/sqliteDb.js');
    setJsonCollection('training.manifest', { entries: 'broken' });

    await expect(ingestTrainingBundlesIntoDataset()).rejects.toThrow('Invalid input: expected array, received string');
  });

  it('recovers when the existing dataset JSON is invalid', async () => {
    await writeBundleFixture('bundle-2');

    const { setJsonCollection } = await import('../src/sqliteDb.js');
    setJsonCollection('training.dgs_samples', { samples: 'broken' });

    const result = await ingestTrainingBundlesIntoDataset();
    expect(result.appended).toBe(MIN_SIGN_SAMPLE_FRAMES);

    const dataset = loadDgsSamplesFromStore<any>();
    expect(dataset.samples).toHaveLength(MIN_SIGN_SAMPLE_FRAMES);
  });

  it('prefers validationSummary.landmarksPath when selecting landmarks data', async () => {
    const frames: LandmarksPayload = {
      frames: Array.from({ length: MIN_SIGN_SAMPLE_FRAMES }, (_, idx) =>
        buildLandmarkFrame(0.11 + idx * 0.01),
      ),
    };

    await writeBundleFixture('bundle-prefers-summary', {
      landmarksRelativePath: 'bundle/nested/path/landmarks.json',
      frames,
      extraFiles: [
        {
          relativePath: 'bundle/not-landmarks.json',
          data: JSON.stringify({ frames: [buildLandmarkFrame(9.99)] }, null, 2),
        },
      ],
    });

    const result = await ingestTrainingBundlesIntoDataset();
    expect(result.appended).toBe(MIN_SIGN_SAMPLE_FRAMES);

    const dataset = loadDgsSamplesFromStore<any>();
    expect(dataset.samples).toHaveLength(MIN_SIGN_SAMPLE_FRAMES);
    expect(dataset.samples[0].landmarks[0][0]).toBeCloseTo(0.11, 6);
    expect(dataset.samples[0].landmarks[0][1]).toBeCloseTo(0.12, 6);
    expect(dataset.samples[0].landmarks[0][2]).toBeCloseTo(0.13, 6);
  });

  it('falls back to basename matching when validation summary is missing', async () => {
    const frames: LandmarksPayload = {
      frames: Array.from({ length: MIN_SIGN_SAMPLE_FRAMES }, (_, idx) =>
        buildLandmarkFrame(0.21 + idx * 0.01),
      ),
    };

    await writeBundleFixture('bundle-no-summary', {
      landmarksRelativePath: 'bundle/custom/nested/landmarks.json',
      frames,
      includeValidationSummary: false,
      extraFiles: [
        {
          relativePath: 'bundle/custom/not-landmarks.json',
          data: JSON.stringify({ frames: [buildLandmarkFrame(5.55)] }, null, 2),
        },
      ],
    });

    const result = await ingestTrainingBundlesIntoDataset();
    expect(result.appended).toBe(MIN_SIGN_SAMPLE_FRAMES);

    const dataset = loadDgsSamplesFromStore<any>();
    expect(dataset.samples).toHaveLength(MIN_SIGN_SAMPLE_FRAMES);
    expect(dataset.samples[0].landmarks[0][0]).toBeCloseTo(0.21, 6);
    expect(dataset.samples[0].landmarks[0][1]).toBeCloseTo(0.22, 6);
    expect(dataset.samples[0].landmarks[0][2]).toBeCloseTo(0.23, 6);
  });

  it('skips bundles that do not meet the minimum frame count', async () => {
    const frames: LandmarksPayload = {
      frames: Array.from({ length: MIN_SIGN_SAMPLE_FRAMES - 1 }, (_, idx) =>
        buildLandmarkFrame(0.15 + idx * 0.01),
      ),
    };

    await writeBundleFixture('bundle-too-few-frames', { frames });

    const result = await ingestTrainingBundlesIntoDataset();
    expect(result.appended).toBe(0);

    expect(loadDgsSamplesFromStore<any>().samples).toHaveLength(0);
  });

  it('skips bundles with excessive hand jitter', async () => {
    const jitterValue = Math.min(1, MAX_HAND_JITTER + 0.5);
    const frames: LandmarksPayload = {
      frames: Array.from({ length: MIN_SIGN_SAMPLE_FRAMES }, (_, idx) =>
        buildConstantLandmarkFrame(idx % 2 === 0 ? 0 : jitterValue),
      ),
    };

    await writeBundleFixture('bundle-jittery', { frames });

    const result = await ingestTrainingBundlesIntoDataset();
    expect(result.appended).toBe(0);

    expect(loadDgsSamplesFromStore<any>().samples).toHaveLength(0);
  });




  it('accepts bundles with moderate pose jitter', async () => {
    const moderatePoseDelta = MAX_POSE_JITTER * 0.5;
    const frames: LandmarksPayload = {
      frames: Array.from({ length: MIN_SIGN_SAMPLE_FRAMES }, (_, idx) => ({
        landmarks: Array.from({ length: 42 }, () => [0.2, 0.2, 0.2]),
        handLandmarks: [
          Array.from({ length: 21 }, () => [0.2, 0.2, 0.2]),
          Array.from({ length: 21 }, () => [0.3, 0.3, 0.3]),
        ],
        poseLandmarks: Array.from({ length: 33 }, () => [
          idx % 2 === 0 ? 0 : moderatePoseDelta,
          idx % 2 === 0 ? 0 : moderatePoseDelta,
          0,
        ]),
      })),
    };

    await writeBundleFixture('bundle-moderate-pose-jitter', { frames });

    const result = await ingestTrainingBundlesIntoDataset();
    expect(result.appended).toBe(MIN_SIGN_SAMPLE_FRAMES);
  });



  it('accepts borderline oscillating hand jitter when smoothing trajectory is continuous', async () => {
    const jitterAmplitude = 0.9;
    const frames: LandmarksPayload = {
      frames: Array.from({ length: MIN_SIGN_SAMPLE_FRAMES }, (_, idx) => ({
        landmarks: Array.from({ length: 42 }, () => [0.2, 0.2, 0.2]),
        handLandmarks: [
          Array.from({ length: 21 }, () => [idx % 2 === 0 ? 0 : jitterAmplitude, idx % 2 === 0 ? 0 : jitterAmplitude, 0]),
          Array.from({ length: 21 }, () => [0.3, 0.3, 0.3]),
        ],
      })),
    };

    await writeBundleFixture('bundle-borderline-hand-jitter', { frames });

    const result = await ingestTrainingBundlesIntoDataset();
    expect(result.appended).toBe(MIN_SIGN_SAMPLE_FRAMES);
  });

  it('accepts bundles with moderate hand jitter', async () => {
    const moderateHandDelta = MAX_HAND_JITTER * 0.5;
    const frames: LandmarksPayload = {
      frames: Array.from({ length: MIN_SIGN_SAMPLE_FRAMES }, (_, idx) => ({
        landmarks: Array.from({ length: 42 }, () => [0.2, 0.2, 0.2]),
        handLandmarks: [
          Array.from({ length: 21 }, () => [
            idx % 2 === 0 ? 0 : moderateHandDelta,
            idx % 2 === 0 ? 0 : moderateHandDelta,
            0,
          ]),
          Array.from({ length: 21 }, () => [0.3, 0.3, 0.3]),
        ],
        poseLandmarks: Array.from({ length: 33 }, () => [0.2, 0.2, 0]),
      })),
    };

    await writeBundleFixture('bundle-moderate-hand-jitter', { frames });

    const result = await ingestTrainingBundlesIntoDataset();
    expect(result.appended).toBe(MIN_SIGN_SAMPLE_FRAMES);
  });

  it('accepts bundles with moderate face jitter', async () => {
    const moderateFaceDelta = MAX_FACE_JITTER * 0.5;
    const frames: LandmarksPayload = {
      frames: Array.from({ length: MIN_SIGN_SAMPLE_FRAMES }, (_, idx) => ({
        landmarks: Array.from({ length: 42 }, () => [0.2, 0.2, 0.2]),
        handLandmarks: [
          Array.from({ length: 21 }, () => [0.2, 0.2, 0.2]),
          Array.from({ length: 21 }, () => [0.3, 0.3, 0.3]),
        ],
        faceLandmarks: Array.from({ length: 20 }, () => [
          idx % 2 === 0 ? 0.4 : 0.4 + moderateFaceDelta,
          idx % 2 === 0 ? 0.4 : 0.4 + moderateFaceDelta,
          0,
        ]),
      })),
    };

    await writeBundleFixture('bundle-moderate-face-jitter', { frames });

    const result = await ingestTrainingBundlesIntoDataset();
    expect(result.appended).toBe(MIN_SIGN_SAMPLE_FRAMES);
  });

  it('uses configurable jitter thresholds from kid starter preset', async () => {
    await fs.mkdir(path.dirname(KID_STARTER_PRESET_PATH), { recursive: true });
    await fs.writeFile(
      KID_STARTER_PRESET_PATH,
      JSON.stringify({
        qualityGates: {
          maxHandJitterThreshold: 0.05,
          maxPoseJitterThreshold: 0.05,
          maxFaceJitterThreshold: 0.05,
        },
      }),
      'utf8',
    );

    const frames: LandmarksPayload = {
      frames: Array.from({ length: MIN_SIGN_SAMPLE_FRAMES }, (_, idx) => ({
        landmarks: Array.from({ length: 42 }, () => [0.2, 0.2, 0.2]),
        handLandmarks: [
          Array.from({ length: 21 }, () => [idx % 2 === 0 ? 0 : 0.5, idx % 2 === 0 ? 0 : 0.5, 0]),
          Array.from({ length: 21 }, () => [0.3, 0.3, 0.3]),
        ],
      })),
    };

    await writeBundleFixture('bundle-preset-threshold', { frames });

    const result = await ingestTrainingBundlesIntoDataset();
    expect(result.appended).toBe(0);

    const qualityLog = loadTrainingQualityLogFromStore<{ reasons: string[] }>();
    expect(qualityLog.entries[0]?.reasons.some((reason) => reason.includes('> 0.05'))).toBe(true);
  });

  it('falls back to generic maxJitterThreshold when specific keys are missing', async () => {
    await fs.mkdir(path.dirname(KID_STARTER_PRESET_PATH), { recursive: true });
    await fs.writeFile(
      KID_STARTER_PRESET_PATH,
      JSON.stringify({
        qualityGates: {
          maxJitterThreshold: 0.05,
        },
      }),
      'utf8',
    );

    const frames: LandmarksPayload = {
      frames: Array.from({ length: MIN_SIGN_SAMPLE_FRAMES }, (_, idx) => ({
        landmarks: Array.from({ length: 42 }, () => [0.2, 0.2, 0.2]),
        handLandmarks: [
          Array.from({ length: 21 }, () => [idx % 2 === 0 ? 0 : 0.5, idx % 2 === 0 ? 0 : 0.5, 0]),
          Array.from({ length: 21 }, () => [0.3, 0.3, 0.3]),
        ],
      })),
    };

    await writeBundleFixture('bundle-generic-threshold', { frames });

    const result = await ingestTrainingBundlesIntoDataset();
    expect(result.appended).toBe(0);

    const qualityLog = loadTrainingQualityLogFromStore<{ bundleId: string; reasons: string[] }>();
    const entry = qualityLog.entries.find((item) => item.bundleId === 'bundle-generic-threshold');
    expect(entry?.reasons.some((reason) => reason.includes('> 0.05'))).toBe(true);
  });

  it('persistiert Quality-Gate-Ablehnungen im Quality-Log', async () => {
    const jitterValue = Math.min(1, MAX_HAND_JITTER + 0.5);
    const frames: LandmarksPayload = {
      frames: Array.from({ length: MIN_SIGN_SAMPLE_FRAMES }, (_, idx) =>
        buildConstantLandmarkFrame(idx % 2 === 0 ? 0 : jitterValue),
      ),
    };

    await writeBundleFixture('bundle-quality-log', { frames });

    const result = await ingestTrainingBundlesIntoDataset();
    expect(result.appended).toBe(0);

    const qualityLog = loadTrainingQualityLogFromStore<{
      bundleId: string;
      label: string;
      profileId: string | null;
      reasons: string[];
      metrics: Record<string, number>;
    }>();

    expect(qualityLog.entries).toHaveLength(1);
    expect(qualityLog.entries[0]).toMatchObject({
      bundleId: 'bundle-quality-log',
      label: 'HALLO',
      profileId: 'p-123',
      reasons: expect.arrayContaining([expect.stringContaining('handJitter')]),
      metrics: expect.objectContaining({
        frameCount: MIN_SIGN_SAMPLE_FRAMES,
        overallQualityScore: expect.any(Number),
        handJitter: expect.any(Number),
        handJitterRaw: expect.any(Number),
      }),
    });

    const metrics = qualityLog.entries[0]?.metrics ?? {};
    expect((metrics.overallQualityScore as number) >= 0 && (metrics.overallQualityScore as number) <= 1).toBe(true);
    expect((metrics.handJitterRaw as number) >= (metrics.handJitter as number)).toBe(true);
  });


  it('setzt Ingestion fort, wenn abgelehntes Bundle auf korruptes Quality-Log trifft', async () => {
    const jitterValue = Math.min(1, MAX_HAND_JITTER + 0.5);
    const frames: LandmarksPayload = {
      frames: Array.from({ length: MIN_SIGN_SAMPLE_FRAMES }, (_, idx) =>
        buildConstantLandmarkFrame(idx % 2 === 0 ? 0 : jitterValue),
      ),
    };
    await writeBundleFixture('bundle-rejected-corrupt-log', { frames });

    const { setJsonCollection } = await import('../src/sqliteDb.js');
    setJsonCollection('training.quality_log', { entries: 'broken' });

    const result = await ingestTrainingBundlesIntoDataset();
    expect(result.appended).toBe(0);

    expect(loadDgsSamplesFromStore<any>().samples).toHaveLength(0);
  });

  it('persists multimodal landmarks and handedness', async () => {
    const frames: LandmarksPayload = {
      frames: Array.from({ length: MIN_SIGN_SAMPLE_FRAMES }, () => ({
        handLandmarks: [
          [
            [0.1, 0.2, 0.3],
            [0.4, 0.5, 0.6],
          ],
          [
            [0.7, 0.8, 0.9],
          ],
        ],
        poseLandmarks: [
          [0.11, 0.22, 0.33],
          ['x' as unknown as number, 0.44, 0.55],
          [0.66, 0.77, 0.88],
        ],
        faceLandmarks: [
          [0.9, 0.8, 0.7],
          [Infinity as number, 0.6, 0.5],
        ],
        handedness: ['Right', 'Left', 123 as unknown as string],
      })),
    };

    await writeBundleFixture('bundle-multimodal', { frames });

    const result = await ingestTrainingBundlesIntoDataset();
    expect(result.appended).toBe(MIN_SIGN_SAMPLE_FRAMES);

    const dataset = loadDgsSamplesFromStore<any>();
    expect(dataset.samples).toHaveLength(MIN_SIGN_SAMPLE_FRAMES);
    const sample = dataset.samples[0];

    expect(sample.landmarks).toHaveLength(42);
    expect(sample.handLandmarks).toHaveLength(2);
    expect(sample.handLandmarks[0]).toHaveLength(21);
    expect(sample.handLandmarks[0][0]).toEqual([0.1, 0.2, 0.3]);
    expect(sample.handLandmarks[1][0]).toEqual([0.7, 0.8, 0.9]);

    expect(sample.poseLandmarks).toEqual([
      [0.11, 0.22, 0.33],
      [0.66, 0.77, 0.88],
    ]);
    expect(sample.faceLandmarks).toEqual([[0.9, 0.8, 0.7]]);
    expect(sample.handedness).toEqual(['Right', 'Left']);
  });

  it('propagates capture metadata such as modalities and smoothing', async () => {
    const frames: LandmarksPayload = {
      metadata: {
        modalities: { hands: true, pose: true, face: false },
        smoothing: { method: 'one_euro', minCutOff: 1.2, beta: 0.01 },
      },
      frames: Array.from({ length: MIN_SIGN_SAMPLE_FRAMES }, () => ({
        landmarks: Array.from({ length: 42 }, (_, idx) => [idx * 0.01, idx * 0.02, idx * 0.03]),
      })),
    };

    await writeBundleFixture('bundle-metadata', { frames });

    const result = await ingestTrainingBundlesIntoDataset();
    expect(result.appended).toBe(MIN_SIGN_SAMPLE_FRAMES);

    const dataset = loadDgsSamplesFromStore<any>();
    const sample = dataset.samples[0];

    expect(sample.captureMetadata).toEqual({
      modalities: { hands: true, pose: true, face: false },
      smoothing: { method: 'one_euro', minCutOff: 1.2, beta: 0.01 },
    });
  });

  it('prefers per-frame timestamps and includes recording metadata', async () => {
    const frames: LandmarksPayload = {
      frames: Array.from({ length: MIN_SIGN_SAMPLE_FRAMES }, (_, idx) => ({
        ...buildLandmarkFrame(0.3 + idx * 0.01),
        timestampMs: 1716897791000 + idx * 100,
      })),
    };

    await writeBundleFixture('bundle-timestamps', {
      frames,
      recordingMetadata: {
        frameCount: 12,
        usableFrameCount: 10,
        clipDurationMs: 1200,
        clipBytes: 2048,
        clipMimeType: 'video/webm',
        stillBytes: 512,
        stillMimeType: 'image/jpeg',
      },
    });

    const result = await ingestTrainingBundlesIntoDataset();
    expect(result.appended).toBe(MIN_SIGN_SAMPLE_FRAMES);

    const dataset = loadDgsSamplesFromStore<any>();
    const sample = dataset.samples[0];

    expect(sample.ts).toBe(1716897791000);
    expect(sample.captureMetadata?.recording).toEqual({
      frameCount: 12,
      usableFrameCount: 10,
      clipDurationMs: 1200,
      clipBytes: 2048,
      clipMimeType: 'video/webm',
      stillBytes: 512,
      stillMimeType: 'image/jpeg',
    });
    expect(sample.captureMetadata?.timing).toMatchObject({
      averageDeltaMs: 100,
      minDeltaMs: 100,
      maxDeltaMs: 100,
    });
  });

  it('rejects bundles with unsupported feature contract version', async () => {
    await writeBundleFixture('bundle-bad-contract', {
      featureContractVersion: 'legacy_sum_abs_v0',
    });

    const result = await ingestTrainingBundlesIntoDataset();
    expect(result.appended).toBe(0);

    const dataset = loadDgsSamplesFromStore<any>();
    expect(dataset.samples).toHaveLength(0);

    const qualityLog = loadTrainingQualityLogFromStore<{ bundleId: string; reasons: string[] }>();
    const entry = qualityLog.entries.find((item) => item.bundleId === 'bundle-bad-contract');
    expect(entry).toBeDefined();
    expect(entry?.reasons.some((reason) => reason.includes("featureContract.version"))).toBe(true);
  });

  it('rejects bundles when feature contract version is missing/empty', async () => {
    await writeBundleFixture('bundle-missing-contract', {
      featureContractVersion: '',
    });

    const result = await ingestTrainingBundlesIntoDataset();
    expect(result.appended).toBe(0);
    expect(loadDgsSamplesFromStore<any>().samples).toHaveLength(0);

    const qualityLog = loadTrainingQualityLogFromStore<{ bundleId: string; reasons: string[] }>();
    const entry = qualityLog.entries.find((item) => item.bundleId === 'bundle-missing-contract');
    expect(entry).toBeDefined();
    expect(entry?.reasons.some((reason) => reason.includes('missing'))).toBe(true);
  });

  async function writeBundleFixture(
    bundleId: string,
    options: BundleFixtureOptions = {},
  ): Promise<void> {
    const bundleRoot = resolveDataPath(`training_uploads/unassigned/${bundleId}`);
    await fs.mkdir(path.join(bundleRoot, 'bundle'), { recursive: true });

    const defaultFrames: LandmarksPayload = {
      frames: Array.from({ length: MIN_SIGN_SAMPLE_FRAMES }, (_, frameIdx) => ({
        landmarks: Array.from({ length: 42 }, (_, idx) => [
          idx * 0.01 + frameIdx * 0.01,
          idx * 0.02 + frameIdx * 0.01,
          idx * 0.03 + frameIdx * 0.01,
        ]),
      })),
    };
    const frames = options.frames ?? defaultFrames;
    const normalizedLandmarksRelative = (options.landmarksRelativePath ?? 'bundle/landmarks.json')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '');
    const landmarksPath = path.join(bundleRoot, normalizedLandmarksRelative);
    await fs.mkdir(path.dirname(landmarksPath), { recursive: true });
    await fs.writeFile(landmarksPath, JSON.stringify(frames, null, 2));

    for (const extra of options.extraFiles ?? []) {
      const normalizedExtra = extra.relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
      const extraPath = path.join(bundleRoot, normalizedExtra);
      await fs.mkdir(path.dirname(extraPath), { recursive: true });
      await fs.writeFile(extraPath, extra.data ?? 'extra');
    }

    const manifest = {
      entries: [
        {
          id: bundleId,
          profileId: 'p-123',
          label: 'HALLO',
          capturedAt: '2024-05-28T12:03:11Z',
          source: 'app://mediapipe',
          storage: {
            directory: `training_uploads/unassigned/${bundleId}`,
            bundle: `training_uploads/unassigned/${bundleId}/bundle.zip`,
            files: [
              normalizedLandmarksRelative,
              'bundle/metadata.json',
              'bundle/clip.webm',
              'bundle/still.jpg',
              ...((options.extraFiles ?? []).map((extra) =>
                extra.relativePath.replace(/\\/g, '/').replace(/^\/+/, ''),
              )),
            ],
            clip: 'bundle/clip.webm',
            still: 'bundle/still.jpg',
          },
          metadata: {
            label: 'HALLO',
            profileId: 'p-123',
            capturedAt: '2024-05-28T12:03:11Z',
            source: 'app://mediapipe',
            clipFilename: 'clip.webm',
            stillFilename: 'still.jpg',
            featureContract: {
              version: options.featureContractVersion ?? 'wrist_relative_max_abs_v1',
            },
            ...(options.recordingMetadata ? { recording: options.recordingMetadata } : {}),
            ...(options.includeValidationSummary === false
              ? {}
              : {
                  validationSummary: {
                    frameCount: Array.isArray(frames.frames) ? frames.frames.length : 0,
                    landmarksPath: normalizedLandmarksRelative,
                  },
                }),
          },
          receivedAt: '2024-05-28T12:03:12Z',
        },
      ],
    };
    saveTrainingManifestToStore(manifest);
  }
});
