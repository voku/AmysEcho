import path from 'path';
import { promises as fs } from 'fs';
import { z } from 'zod';
import { ensureDataDir, DATA_DIR, TRAINING_MANIFEST_PATH } from '../constants/modelPaths.js';
import { withFileLock } from '../utils/fileLock.js';
import { atomicWriteJson } from '../utils/atomicFs.js';
import { logger } from './logger.js';

const TrainingBundleManifestEntrySchema = z
  .object({
    id: z.string(),
    profileId: z.string().nullable().optional(),
    label: z.string().trim().min(1),
    capturedAt: z.string().nullable().optional(),
    source: z.string().nullable().optional(),
    storage: z
      .object({
        directory: z.string(),
        bundle: z.string().optional(),
        files: z.array(z.string()),
      })
      .passthrough(),
    receivedAt: z.string(),
  })
  .passthrough();

type TrainingBundleManifestEntry = z.infer<typeof TrainingBundleManifestEntrySchema>;

interface LandmarksFrameEntry {
  landmarks?: unknown;
}

interface LandmarksFile {
  frames?: LandmarksFrameEntry[];
}

interface DatasetSample {
  id: string;
  label: string;
  landmarks: number[][];
  ts: number;
  profileId?: string;
  sourceBundleId?: string;
  frameIndex?: number;
}

interface DatasetFile {
  samples: DatasetSample[];
}

const BUNDLE_SAMPLE_PREFIX = 'bundle:';
const MAX_LANDMARK_POINTS = 42;

function ensureInside(base: string, target: string): string {
  const baseResolved = path.resolve(base);
  const targetResolved = path.resolve(target);
  if (targetResolved === baseResolved) {
    return targetResolved;
  }
  if (!targetResolved.startsWith(baseResolved + path.sep)) {
    throw new Error(`Path ${targetResolved} is outside of ${baseResolved}`);
  }
  return targetResolved;
}

async function loadManifest(): Promise<TrainingBundleManifestEntry[]> {
  try {
    const raw = await fs.readFile(TRAINING_MANIFEST_PATH, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (parseError) {
      logger.warn('Training bundle manifest is not valid JSON – ignoring file', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        path: TRAINING_MANIFEST_PATH,
      });
      return [];
    }
    if (!parsed || typeof parsed !== 'object') {
      return [];
    }
    const entries = Array.isArray((parsed as { entries?: unknown }).entries)
      ? ((parsed as { entries: unknown[] }).entries)
      : [];
    const validEntries: TrainingBundleManifestEntry[] = [];
    entries.forEach((entry, index) => {
      const result = TrainingBundleManifestEntrySchema.safeParse(entry);
      if (result.success) {
        validEntries.push(result.data);
      } else {
        logger.warn('Skipping invalid training bundle manifest entry', {
          index,
          issues: result.error.issues,
        });
      }
    });
    return validEntries;
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function normalizeLandmarks(raw: unknown): number[][] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const coords: number[][] = [];
  for (const point of raw) {
    if (!Array.isArray(point)) continue;
    const [x, y, z] = point as number[];
    if (
      typeof x === 'number' && Number.isFinite(x) &&
      typeof y === 'number' && Number.isFinite(y) &&
      typeof z === 'number' && Number.isFinite(z)
    ) {
      coords.push([x, y, z]);
    }
    if (coords.length === MAX_LANDMARK_POINTS) {
      break;
    }
  }
  if (coords.length === 0) {
    return null;
  }
  const paddingNeeded = MAX_LANDMARK_POINTS - coords.length;
  if (paddingNeeded > 0) {
    coords.push(...Array.from({ length: paddingNeeded }, () => [0, 0, 0]));
  }
  return coords;
}

async function readLandmarks(entry: TrainingBundleManifestEntry): Promise<number[][][]> {
  if (!entry.storage || typeof entry.storage.directory !== 'string') {
    return [];
  }
  const dataRoot = path.resolve(DATA_DIR);
  const bundleRoot = ensureInside(dataRoot, path.join(dataRoot, entry.storage.directory));
  const files = Array.isArray(entry.storage.files)
    ? entry.storage.files.filter((file): file is string => typeof file === 'string')
    : [];
  const relativeLandmarks = files.find((f) => f.replace(/\\/g, '/').endsWith('landmarks.json'));
  if (!relativeLandmarks) {
    return [];
  }
  const normalizedRelative = relativeLandmarks.replace(/\\/g, '/').replace(/^\//, '');
  const landmarksPath = ensureInside(bundleRoot, path.join(bundleRoot, normalizedRelative));
  try {
    const raw = await fs.readFile(landmarksPath, 'utf8');
    const parsed = JSON.parse(raw) as LandmarksFile;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.frames)) {
      return [];
    }
    const frames: number[][][] = [];
    parsed.frames.forEach((frame) => {
      const normalized = normalizeLandmarks((frame ?? {}).landmarks);
      if (normalized) {
        frames.push(normalized);
      }
    });
    return frames;
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function buildDatasetSample(
  entry: TrainingBundleManifestEntry,
  frameIndex: number,
  landmarks: number[][],
): DatasetSample {
  const timestampSource = entry.capturedAt ?? entry.receivedAt;
  const parsedTimestamp = timestampSource ? Date.parse(timestampSource) : NaN;
  const ts = Number.isFinite(parsedTimestamp) ? parsedTimestamp : Date.now();
  return {
    id: `${BUNDLE_SAMPLE_PREFIX}${entry.id}:frame:${frameIndex}`,
    label: entry.label,
    landmarks,
    ts,
    ...(entry.profileId ? { profileId: entry.profileId } : {}),
    sourceBundleId: entry.id,
    frameIndex,
  };
}

export async function ingestTrainingBundlesIntoDataset(): Promise<{ appended: number }> {
  await ensureDataDir();
  const manifestEntries = await loadManifest();
  if (manifestEntries.length === 0) {
    return { appended: 0 };
  }

  const dataPath = path.join(DATA_DIR, 'dgs_samples.json');
  await fs.mkdir(path.dirname(dataPath), { recursive: true });

  return withFileLock(dataPath, async () => {
    let dataset: DatasetFile = { samples: [] };
    let datasetReset = false;
    try {
      const raw = await fs.readFile(dataPath, 'utf8');
      try {
        const parsed = JSON.parse(raw) as DatasetFile;
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.samples)) {
          dataset = { samples: parsed.samples.slice() };
        }
      } catch (parseError) {
        datasetReset = true;
        logger.warn('Training dataset file is corrupted – resetting to empty dataset', {
          error: parseError instanceof Error ? parseError.message : String(parseError),
          path: dataPath,
        });
      }
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }

    if (!Array.isArray(dataset.samples)) {
      dataset.samples = [];
    }

    const existingKeys = new Set<string>();
    for (const sample of dataset.samples) {
      if (sample && typeof sample === 'object') {
        const bundleId = (sample as DatasetSample).sourceBundleId;
        const frameIdx = (sample as DatasetSample).frameIndex;
        if (typeof bundleId === 'string' && typeof frameIdx === 'number') {
          existingKeys.add(`${bundleId}:${frameIdx}`);
        }
      }
    }

    let appended = 0;

    for (const entry of manifestEntries) {
      const frames = await readLandmarks(entry).catch((error) => {
        logger.warn('Failed to read landmarks for training bundle', {
          error,
          bundleId: entry.id,
        });
        return [] as number[][][];
      });
      if (frames.length === 0) continue;
      frames.forEach((landmarks, index) => {
        const key = `${entry.id}:${index}`;
        if (existingKeys.has(key)) {
          return;
        }
        dataset.samples.push(buildDatasetSample(entry, index, landmarks));
        existingKeys.add(key);
        appended += 1;
      });
    }

    if (appended === 0) {
      if (datasetReset) {
        await atomicWriteJson(dataPath, dataset);
      }
      return { appended: 0 };
    }

    await atomicWriteJson(dataPath, dataset);
    return { appended };
  });
}
