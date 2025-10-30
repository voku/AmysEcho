import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

let ingestTrainingBundlesIntoDataset: (
  typeof import('../src/services/trainingBundleIngestor.js')
)['ingestTrainingBundlesIntoDataset'];
let TRAINING_MANIFEST_PATH: string;
let DATA_DIR: string;

function resolveDataPath(relativePath: string): string {
  if (!DATA_DIR) {
    throw new Error('DATA_DIR not initialized');
  }
  return path.join(DATA_DIR, relativePath);
}

describe('ingestTrainingBundlesIntoDataset', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'amy-bundles-'));
    process.env.AMY_ECHO_DATA_DIR = tempDir;
    const constants = await import('../src/constants/modelPaths.js');
    DATA_DIR = constants.DATA_DIR;
    TRAINING_MANIFEST_PATH = constants.TRAINING_MANIFEST_PATH;
    ({ ingestTrainingBundlesIntoDataset } = await import('../src/services/trainingBundleIngestor.js'));
  });

  afterAll(async () => {
    delete process.env.AMY_ECHO_DATA_DIR;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.mkdir(tempDir, { recursive: true });
  });

  it('copies unique bundle frames into the dataset and avoids duplicates', async () => {
    await writeBundleFixture('bundle-1');

    const firstRun = await ingestTrainingBundlesIntoDataset();
    expect(firstRun.appended).toBe(2);

    const datasetPath = resolveDataPath('dgs_samples.json');
    const datasetRaw = await fs.readFile(datasetPath, 'utf8');
    const dataset = JSON.parse(datasetRaw) as { samples: any[] };
    expect(dataset.samples).toHaveLength(2);
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
    expect(dataset.samples[1].landmarks[1]).toEqual([0.05, 0.06, 0.07]);

    const secondRun = await ingestTrainingBundlesIntoDataset();
    expect(secondRun.appended).toBe(0);

    const datasetAfter = JSON.parse(await fs.readFile(datasetPath, 'utf8')) as { samples: any[] };
    expect(datasetAfter.samples).toHaveLength(2);
  });

  it('ignores corrupted manifest files instead of throwing', async () => {
    await fs.mkdir(path.dirname(TRAINING_MANIFEST_PATH), { recursive: true });
    await fs.writeFile(TRAINING_MANIFEST_PATH, '{"entries": [');

    const result = await ingestTrainingBundlesIntoDataset();
    expect(result.appended).toBe(0);
  });

  it('recovers when the existing dataset JSON is invalid', async () => {
    await writeBundleFixture('bundle-2');

    const datasetPath = resolveDataPath('dgs_samples.json');
    await fs.mkdir(path.dirname(datasetPath), { recursive: true });
    await fs.writeFile(datasetPath, '{invalid json');

    const result = await ingestTrainingBundlesIntoDataset();
    expect(result.appended).toBe(2);

    const datasetRaw = await fs.readFile(datasetPath, 'utf8');
    const dataset = JSON.parse(datasetRaw) as { samples: any[] };
    expect(dataset.samples).toHaveLength(2);
  });

  async function writeBundleFixture(bundleId: string): Promise<void> {
    const bundleRoot = resolveDataPath(`training_uploads/unassigned/${bundleId}`);
    await fs.mkdir(path.join(bundleRoot, 'bundle'), { recursive: true });

    const frames = {
      frames: [
        { landmarks: Array.from({ length: 42 }, (_, idx) => [idx * 0.01, idx * 0.02, idx * 0.03]) },
        { landmarks: Array.from({ length: 42 }, (_, idx) => [idx * 0.05, idx * 0.06, idx * 0.07]) },
      ],
    };
    await fs.writeFile(path.join(bundleRoot, 'bundle', 'landmarks.json'), JSON.stringify(frames, null, 2));

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
            files: ['bundle/landmarks.json', 'bundle/metadata.json', 'bundle/clip.webm'],
            clip: 'bundle/clip.webm',
          },
          metadata: {
            label: 'HALLO',
            profileId: 'p-123',
            capturedAt: '2024-05-28T12:03:11Z',
            source: 'app://mediapipe',
            clipFilename: 'clip.webm',
          },
          receivedAt: '2024-05-28T12:03:12Z',
        },
      ],
    };
    await fs.mkdir(path.dirname(TRAINING_MANIFEST_PATH), { recursive: true });
    await fs.writeFile(TRAINING_MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  }
});
