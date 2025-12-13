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
    metadata: z
      .object({
        profileId: z.string().nullable().optional(),
        validationSummary: z
          .object({
            frameCount: z.number().optional(),
            landmarksPath: z.string().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

type TrainingBundleManifestEntry = z.infer<typeof TrainingBundleManifestEntrySchema>;

interface LandmarksFrameEntry {
  landmarks?: unknown;
  handLandmarks?: unknown;
  poseLandmarks?: unknown;
  faceLandmarks?: unknown;
  handedness?: unknown;
}

interface LandmarksFile {
  frames?: LandmarksFrameEntry[];
  metadata?: unknown;
}

interface DatasetSample {
  id: string;
  label: string;
  landmarks: number[][];
  ts: number;
  profileId?: string;
  sourceBundleId?: string;
  frameIndex?: number;
  handLandmarks?: number[][][];
  poseLandmarks?: number[][];
  faceLandmarks?: number[][];
  handedness?: string[];
  captureMetadata?: CaptureMetadata;
}

interface DatasetFile {
  samples: DatasetSample[];
}

interface CaptureMetadata {
  modalities?: { hands?: boolean; pose?: boolean; face?: boolean };
  smoothing?: { method?: string; minCutOff?: number; beta?: number; dCutOff?: number };
}

function isDatasetSample(value: unknown): value is DatasetSample {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.label === 'string' &&
    typeof candidate.ts === 'number' &&
    Array.isArray(candidate.landmarks)
  );
}

const BUNDLE_SAMPLE_PREFIX = 'bundle:';
const MAX_FLATTENED_LANDMARK_POINTS = 42;
const MAX_HANDS = 2;
const HAND_LANDMARKS_PER_HAND = 21;
const MAX_POSE_POINTS = 33;
// MediaPipe Face Mesh provides 468 landmarks. We capture and process all of them,
// but only render a subset (8 key points) in OverlayRenderer for performance.
const MAX_FACE_POINTS = 468;

function normalizeRelativePath(relativePath: string): string | null {
  if (typeof relativePath !== 'string') {
    return null;
  }
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!normalized || normalized === '.' || normalized === '..') {
    return null;
  }
  const segments = normalized.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    return null;
  }
  if (normalized.includes(':')) {
    return null;
  }
  return normalized;
}

function selectLandmarksRelativePath(entry: TrainingBundleManifestEntry): string | null {
  const summaryPath =
    entry.metadata && typeof entry.metadata === 'object'
      ? (entry.metadata as Record<string, unknown>).validationSummary
      : null;
  if (summaryPath && typeof (summaryPath as Record<string, unknown>).landmarksPath === 'string') {
    const normalized = normalizeRelativePath(
      (summaryPath as { landmarksPath: string }).landmarksPath,
    );
    if (normalized) {
      return normalized;
    }
  }

  const files = Array.isArray(entry.storage?.files)
    ? entry.storage!.files.filter((file): file is string => typeof file === 'string')
    : [];

  for (const file of files) {
    const normalized = normalizeRelativePath(file);
    if (!normalized) {
      continue;
    }
    const baseName = normalized.split('/').pop();
    if (baseName === 'landmarks.json') {
      return normalized;
    }
  }

  return null;
}

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

function normalizePointTriplet(point: unknown): [number, number, number] | null {
  if (!Array.isArray(point)) {
    return null;
  }
  const [x, y, z] = point as number[];
  if (
    typeof x === 'number' && Number.isFinite(x) &&
    typeof y === 'number' && Number.isFinite(y) &&
    typeof z === 'number' && Number.isFinite(z)
  ) {
    return [x, y, z];
  }
  return null;
}

function normalizePointArray(
  raw: unknown,
  options: { maxPoints?: number; padToLength?: number } = {},
): number[][] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const maxPoints = options.maxPoints ?? Infinity;
  const padToLength = options.padToLength ?? 0;
  const points: number[][] = [];
  for (const point of raw) {
    const normalized = normalizePointTriplet(point);
    if (normalized) {
      points.push(normalized);
      if (points.length === maxPoints) {
        break;
      }
    }
  }
  while (points.length < padToLength) {
    points.push([0, 0, 0]);
  }
  return points;
}

function normalizeHandedness(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeHandLandmarks(raw: unknown): number[][][] {
  const hands: number[][][] = [];
  if (Array.isArray(raw)) {
    for (const hand of raw.slice(0, MAX_HANDS)) {
      hands.push(
        normalizePointArray(hand, {
          maxPoints: HAND_LANDMARKS_PER_HAND,
          padToLength: HAND_LANDMARKS_PER_HAND,
        }),
      );
    }
  }
  while (hands.length < MAX_HANDS) {
    hands.push(Array.from({ length: HAND_LANDMARKS_PER_HAND }, () => [0, 0, 0]));
  }
  return hands;
}

function normalizePoseLandmarks(raw: unknown): number[][] {
  return normalizePointArray(raw, { maxPoints: MAX_POSE_POINTS });
}

function normalizeFaceLandmarks(raw: unknown): number[][] {
  return normalizePointArray(raw, { maxPoints: MAX_FACE_POINTS });
}

function deriveFlattenedHands(
  handLandmarks: number[][][],
  handedness: string[],
): number[][] {
  const leftIndex = handedness.findIndex((entry) => /left/i.test(entry));
  const rightIndex = handedness.findIndex((entry) => /right/i.test(entry));
  
  let left, right;
  if (leftIndex >= 0 && rightIndex >= 0) {
    left = handLandmarks[leftIndex] ?? [];
    right = handLandmarks[rightIndex] ?? [];
  } else {
    // Warn if handedness is missing or unrecognized - this may indicate data quality issues
    logger.warn(
      `[deriveFlattenedHands] Handedness information missing or unrecognized. Falling back to array indices. handedness=${JSON.stringify(handedness)}, handLandmarks.length=${handLandmarks.length}`,
    );
    left = handLandmarks[0] ?? [];
    right = handLandmarks[1] ?? [];
  }

  const flattened: number[][] = [];
  for (let i = 0; i < HAND_LANDMARKS_PER_HAND; i++) {
    flattened.push([left[i]?.[0] ?? 0, left[i]?.[1] ?? 0, left[i]?.[2] ?? 0]);
  }
  for (let i = 0; i < HAND_LANDMARKS_PER_HAND; i++) {
    flattened.push([right[i]?.[0] ?? 0, right[i]?.[1] ?? 0, right[i]?.[2] ?? 0]);
  }
  return flattened;
}

interface NormalizedFrameData {
  landmarks: number[][];
  handLandmarks: number[][][];
  poseLandmarks: number[][];
  faceLandmarks: number[][];
  handedness: string[];
  captureMetadata?: CaptureMetadata;
}

function hasAnyNonZeroPoint(points: number[][]): boolean {
  return points.some((point) => point.some((coord) => coord !== 0));
}

function hasAnyNonZeroHandLandmarks(hands: number[][][]): boolean {
  return hands.some((hand) => hasAnyNonZeroPoint(hand));
}

function normalizeModalities(raw: unknown): CaptureMetadata['modalities'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const candidate = raw as Record<string, unknown>;
  const hands = typeof candidate.hands === 'boolean' ? candidate.hands : undefined;
  const pose = typeof candidate.pose === 'boolean' ? candidate.pose : undefined;
  const face = typeof candidate.face === 'boolean' ? candidate.face : undefined;
  if (hands === undefined && pose === undefined && face === undefined) {
    return undefined;
  }
  return {
    ...(hands !== undefined ? { hands } : {}),
    ...(pose !== undefined ? { pose } : {}),
    ...(face !== undefined ? { face } : {}),
  };
}

function normalizeSmoothing(raw: unknown): CaptureMetadata['smoothing'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const candidate = raw as Record<string, unknown>;
  const method = typeof candidate.method === 'string' && candidate.method.trim() ? candidate.method.trim() : undefined;
  const minCutOff = typeof candidate.minCutOff === 'number' && Number.isFinite(candidate.minCutOff)
    ? candidate.minCutOff
    : undefined;
  const beta = typeof candidate.beta === 'number' && Number.isFinite(candidate.beta) ? candidate.beta : undefined;
  const dCutOff = typeof candidate.dCutOff === 'number' && Number.isFinite(candidate.dCutOff)
    ? candidate.dCutOff
    : undefined;
  if (!method && minCutOff === undefined && beta === undefined && dCutOff === undefined) {
    return undefined;
  }
  return {
    ...(method ? { method } : {}),
    ...(minCutOff !== undefined ? { minCutOff } : {}),
    ...(beta !== undefined ? { beta } : {}),
    ...(dCutOff !== undefined ? { dCutOff } : {}),
  };
}

function normalizeCaptureMetadata(raw: unknown): CaptureMetadata | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const modalities = normalizeModalities((raw as Record<string, unknown>).modalities);
  const smoothing = normalizeSmoothing((raw as Record<string, unknown>).smoothing);

  if (!modalities && !smoothing) {
    return undefined;
  }

  return {
    ...(modalities ? { modalities } : {}),
    ...(smoothing ? { smoothing } : {}),
  };
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

function normalizeFlattenedLandmarks(raw: unknown): number[][] {
  const points = normalizePointArray(raw, {
    maxPoints: MAX_FLATTENED_LANDMARK_POINTS,
    padToLength: MAX_FLATTENED_LANDMARK_POINTS,
  });
  return points;
}

async function readLandmarks(entry: TrainingBundleManifestEntry): Promise<NormalizedFrameData[]> {
  if (!entry.storage || typeof entry.storage.directory !== 'string') {
    return [];
  }
  const dataRoot = path.resolve(DATA_DIR);
  const bundleRoot = ensureInside(dataRoot, path.join(dataRoot, entry.storage.directory));
  const relativeLandmarks = selectLandmarksRelativePath(entry);
  if (!relativeLandmarks) {
    return [];
  }
  const normalizedRelative = relativeLandmarks.replace(/\\/g, '/');
  const landmarksPath = ensureInside(bundleRoot, path.join(bundleRoot, normalizedRelative));
  try {
    const raw = await fs.readFile(landmarksPath, 'utf8');
    const parsed = JSON.parse(raw) as LandmarksFile;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.frames)) {
      return [];
    }
    const captureMetadata = normalizeCaptureMetadata((parsed as Record<string, unknown>).metadata);
    const frames: NormalizedFrameData[] = [];
    parsed.frames.forEach((frame) => {
      const handedness = normalizeHandedness(frame?.handedness);
      const handLandmarks = normalizeHandLandmarks(frame?.handLandmarks);
      const poseLandmarks = normalizePoseLandmarks(frame?.poseLandmarks);
      const faceLandmarks = normalizeFaceLandmarks(frame?.faceLandmarks);
      const flattened = normalizeFlattenedLandmarks(frame?.landmarks);
      const landmarks = flattened.length > 0 ? flattened : deriveFlattenedHands(handLandmarks, handedness);
      if (landmarks.length === 0) {
        return;
      }
      frames.push({
        landmarks,
        handLandmarks,
        poseLandmarks,
        faceLandmarks,
        handedness,
        ...(captureMetadata ? { captureMetadata } : {}),
      });
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
  frameData: NormalizedFrameData,
): DatasetSample {
  const timestampSource = entry.capturedAt ?? entry.receivedAt;
  const parsedTimestamp = timestampSource ? Date.parse(timestampSource) : NaN;
  const ts = Number.isFinite(parsedTimestamp) ? parsedTimestamp : Date.now();
  const sample: DatasetSample = {
    id: `${BUNDLE_SAMPLE_PREFIX}${entry.id}:frame:${frameIndex}`,
    label: entry.label,
    landmarks: frameData.landmarks,
    ts,
    ...(entry.profileId ? { profileId: entry.profileId } : {}),
    sourceBundleId: entry.id,
    frameIndex,
  };
  if (hasAnyNonZeroHandLandmarks(frameData.handLandmarks)) {
    sample.handLandmarks = frameData.handLandmarks;
  }
  if (hasAnyNonZeroPoint(frameData.poseLandmarks)) {
    sample.poseLandmarks = frameData.poseLandmarks;
  }
  if (hasAnyNonZeroPoint(frameData.faceLandmarks)) {
    sample.faceLandmarks = frameData.faceLandmarks;
  }
  if (frameData.handedness.length > 0) {
    sample.handedness = frameData.handedness;
  }
  if (frameData.captureMetadata) {
    sample.captureMetadata = frameData.captureMetadata;
  }
  return sample;
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
        const parsed: unknown = JSON.parse(raw);
        const samples = (parsed as Record<string, unknown>)?.samples;
        if (Array.isArray(samples)) {
          const normalizedSamples = samples
            .filter(isDatasetSample)
            .map((sample) => ({ ...sample }));
          if (normalizedSamples.length !== samples.length) {
            datasetReset = true;
            logger.warn('Training dataset file contained invalid samples – pruning entries', {
              discarded: samples.length - normalizedSamples.length,
              path: dataPath,
            });
          }
          dataset = { samples: normalizedSamples };
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
        return [] as NormalizedFrameData[];
      });
      if (frames.length === 0) continue;
      frames.forEach((frameData, index) => {
        const key = `${entry.id}:${index}`;
        if (existingKeys.has(key)) {
          return;
        }
        dataset.samples.push(buildDatasetSample(entry, index, frameData));
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
