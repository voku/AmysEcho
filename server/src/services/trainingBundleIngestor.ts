import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import { FACE_LANDMARKS, POSE_LANDMARKS } from "../constants/featureSchema.js";
import {
	DATA_DIR,
	ensureDataDir,
} from "../constants/modelPaths.js";
import {
	MAX_FACE_JITTER,
	MAX_HAND_JITTER,
	MAX_POSE_JITTER,
	MIN_HAND_FRAME_COVERAGE,
	MIN_SIGN_SAMPLE_FRAMES,
} from "../constants/trainingQuality.js";
import { logger } from "./logger.js";
import {
	appendTrainingQualityLogEntry,
	loadDgsSamples,
	loadTrainingManifest,
	loadTrainingQualityLog,
	saveDgsSamples,
} from "./trainingJsonStore.js";


const KID_STARTER_PRESET_PATH = process.env.AMY_ECHO_KID_STARTER_PRESET_PATH
	? path.resolve(process.env.AMY_ECHO_KID_STARTER_PRESET_PATH)
	: path.join(DATA_DIR, "config", "kid_starter_preset.json");

interface QualityThresholds {
	maxHandJitter: number;
	maxPoseJitter: number;
	maxFaceJitter: number;
}

const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
	maxHandJitter: MAX_HAND_JITTER,
	maxPoseJitter: MAX_POSE_JITTER,
	maxFaceJitter: MAX_FACE_JITTER,
};

async function loadQualityThresholds(): Promise<QualityThresholds> {
	try {
		const raw = await fs.readFile(KID_STARTER_PRESET_PATH, "utf8");
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		const gates = parsed["qualityGates"];
		if (!gates || typeof gates !== "object") {
			return DEFAULT_QUALITY_THRESHOLDS;
		}
		const candidate = gates as Record<string, unknown>;
		const generic = candidate["maxJitterThreshold"];
		const hand = candidate["maxHandJitterThreshold"];
		const pose = candidate["maxPoseJitterThreshold"];
		const face = candidate["maxFaceJitterThreshold"];
		const genericValue = typeof generic === "number" && Number.isFinite(generic) && generic > 0 ? generic : null;
		const handValue = typeof hand === "number" && Number.isFinite(hand) && hand > 0 ? hand : genericValue;
		const poseValue = typeof pose === "number" && Number.isFinite(pose) && pose > 0 ? pose : genericValue;
		const faceValue = typeof face === "number" && Number.isFinite(face) && face > 0 ? face : genericValue;
		return {
			maxHandJitter: handValue ?? DEFAULT_QUALITY_THRESHOLDS.maxHandJitter,
			maxPoseJitter: poseValue ?? DEFAULT_QUALITY_THRESHOLDS.maxPoseJitter,
			maxFaceJitter: faceValue ?? DEFAULT_QUALITY_THRESHOLDS.maxFaceJitter,
		};
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
			logger.warn("Failed to load kid starter quality thresholds; using defaults", {
				error: error instanceof Error ? error.message : String(error),
				path: KID_STARTER_PRESET_PATH,
			});
		}
		return DEFAULT_QUALITY_THRESHOLDS;
	}
}

const TrainingBundleManifestEntrySchema = z
	.object({
		id: z.string(),
		profileId: z.string().nullable().optional(),
		label: z.string().trim().min(1),
		symbolId: z.string().trim().min(1).optional(),
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
				handFocus: z
					.enum([
						"dominant_only",
						"both_equal",
						"both_asymmetric",
						"either_hand",
					])
					.optional(),
				augmentation: z
					.object({
						mirrorSafe: z.boolean().optional(),
					})
					.passthrough()
					.optional(),
					recording: z
						.object({
							frameCount: z.number().optional(),
							usableFrameCount: z.number().optional(),
							clipDurationMs: z.number().optional(),
							clipBytes: z.number().optional(),
							clipMimeType: z.string().optional(),
							stillBytes: z.number().optional(),
							stillMimeType: z.string().optional(),
							previewMirrored: z.boolean().optional(),
						})
						.passthrough()
						.optional(),
			})
			.passthrough()
			.optional(),
	})
	.passthrough();

type TrainingBundleManifestEntry = z.infer<
	typeof TrainingBundleManifestEntrySchema
>;

interface LandmarksFrameEntry {
	landmarks?: unknown;
	handLandmarks?: unknown;
	poseLandmarks?: unknown;
	faceLandmarks?: unknown;
	handedness?: unknown;
	timestampMs?: unknown;
}

interface LandmarksFile {
	frames?: LandmarksFrameEntry[];
	metadata?: unknown;
}

interface DatasetSample {
	id: string;
	label: string;
	symbolId?: string;
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
	handFocus?:
		| "dominant_only"
		| "both_equal"
		| "both_asymmetric"
		| "either_hand";
}

interface DatasetFile {
	samples: DatasetSample[];
}

interface QualityMetrics {
	frameCount: number;
	handCoverage: number;
	poseCoverage: number;
	faceCoverage: number;
	handJitter?: number;
	poseJitter?: number;
	faceJitter?: number;
	handJitterRaw?: number;
	poseJitterRaw?: number;
	faceJitterRaw?: number;
	overallQualityScore?: number;
}

interface CaptureMetadata {
	modalities?: { hands?: boolean; pose?: boolean; face?: boolean };
	smoothing?: {
		method?: string;
		minCutOff?: number;
		beta?: number;
		dCutOff?: number;
	};
	handFocus?:
		| "dominant_only"
		| "both_equal"
		| "both_asymmetric"
		| "either_hand";
	recording?: RecordingMetadata;
	timing?: TimingMetadata;
}

interface RecordingMetadata {
	frameCount?: number;
	usableFrameCount?: number;
	clipDurationMs?: number;
	clipBytes?: number;
	clipMimeType?: string;
	stillBytes?: number;
	stillMimeType?: string;
	previewMirrored?: boolean;
}

interface TimingMetadata {
	nonMonotonic?: boolean;
	averageDeltaMs?: number;
	minDeltaMs?: number;
	maxDeltaMs?: number;
}


export interface TrainingQualityLogEntry {
	bundleId: string;
	label: string;
	profileId: string | null;
	reasons: string[];
	metrics: QualityMetrics;
	recordedAt: string;
}

function isDatasetSample(value: unknown): value is DatasetSample {
	if (!value || typeof value !== "object") {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.id === "string" &&
		typeof candidate.label === "string" &&
		typeof candidate.ts === "number" &&
		Array.isArray(candidate.landmarks)
	);
}

const BUNDLE_SAMPLE_PREFIX = "bundle:";
const MAX_FLATTENED_LANDMARK_POINTS = 543;
const EXPECTED_FEATURE_CONTRACT_VERSION = "wrist_relative_max_abs_v1";
const MAX_HANDS = 2;
const HAND_LANDMARKS_PER_HAND = 21;
const MAX_POSE_POINTS = POSE_LANDMARKS;
// MediaPipe Face Mesh provides 468 landmarks. We capture and process all of them,
// but only render a subset (8 key points) in OverlayRenderer for performance.
const MAX_FACE_POINTS = FACE_LANDMARKS;

function normalizeRelativePath(relativePath: string): string | null {
	if (typeof relativePath !== "string") {
		return null;
	}
	const normalized = relativePath
		.replace(/\\/g, "/")
		.replace(/^\/+/, "")
		.trim();
	if (!normalized || normalized === "." || normalized === "..") {
		return null;
	}
	const segments = normalized.split("/");
	if (
		segments.some(
			(segment) => segment.length === 0 || segment === "." || segment === "..",
		)
	) {
		return null;
	}
	if (normalized.includes(":")) {
		return null;
	}
	return normalized;
}

function selectLandmarksRelativePath(
	entry: TrainingBundleManifestEntry,
): string | null {
	const summaryPath =
		entry.metadata && typeof entry.metadata === "object"
			? (entry.metadata as Record<string, unknown>).validationSummary
			: null;
	if (
		summaryPath &&
		typeof (summaryPath as Record<string, unknown>).landmarksPath === "string"
	) {
		const normalized = normalizeRelativePath(
			(summaryPath as { landmarksPath: string }).landmarksPath,
		);
		if (normalized) {
			return normalized;
		}
	}

	const files = Array.isArray(entry.storage?.files)
		? entry.storage!.files.filter(
				(file): file is string => typeof file === "string",
			)
		: [];

	for (const file of files) {
		const normalized = normalizeRelativePath(file);
		if (!normalized) {
			continue;
		}
		const baseName = normalized.split("/").pop();
		if (baseName === "landmarks.json") {
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

function normalizePointTriplet(
	point: unknown,
): [number, number, number] | null {
	if (!Array.isArray(point)) {
		return null;
	}
	const [x, y, z] = point as number[];
	if (
		typeof x === "number" &&
		Number.isFinite(x) &&
		typeof y === "number" &&
		Number.isFinite(y) &&
		typeof z === "number" &&
		Number.isFinite(z)
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
		.filter((entry): entry is string => typeof entry === "string")
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
		hands.push(
			Array.from({ length: HAND_LANDMARKS_PER_HAND }, () => [0, 0, 0]),
		);
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
		flattened.push([
			right[i]?.[0] ?? 0,
			right[i]?.[1] ?? 0,
			right[i]?.[2] ?? 0,
		]);
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
	timestampMs?: number;
}

function hasAnyNonZeroPoint(points: number[][]): boolean {
	return points.some((point) => point.some((coord) => coord !== 0));
}

function hasAnyNonZeroHandLandmarks(hands: number[][][]): boolean {
	return hands.some((hand) => hasAnyNonZeroPoint(hand));
}

function normalizeModalityPresence(value: unknown): boolean | undefined {
	if (typeof value === "boolean") {
		return value;
	}
	if (value && typeof value === "object") {
		const candidate = value as Record<string, unknown>;
		const present = candidate.present;
		if (typeof present === "boolean") {
			return present;
		}
		const coverage = candidate.coverage;
		if (typeof coverage === "number" && Number.isFinite(coverage)) {
			return coverage > 0;
		}
		const frameCount = candidate.frameCount;
		if (typeof frameCount === "number" && Number.isFinite(frameCount)) {
			return frameCount > 0;
		}
	}
	return undefined;
}

function normalizeModalities(raw: unknown): CaptureMetadata["modalities"] {
	if (!raw || typeof raw !== "object") return undefined;
	const candidate = raw as Record<string, unknown>;
	const hands = normalizeModalityPresence(candidate.hands);
	const pose = normalizeModalityPresence(candidate.pose);
	const face = normalizeModalityPresence(candidate.face);
	if (hands === undefined && pose === undefined && face === undefined) {
		return undefined;
	}
	return {
		...(hands !== undefined ? { hands } : {}),
		...(pose !== undefined ? { pose } : {}),
		...(face !== undefined ? { face } : {}),
	};
}

function normalizeSmoothing(raw: unknown): CaptureMetadata["smoothing"] {
	if (!raw || typeof raw !== "object") return undefined;
	const candidate = raw as Record<string, unknown>;
	const method =
		typeof candidate.method === "string" && candidate.method.trim()
			? candidate.method.trim()
			: undefined;
	const minCutOff =
		typeof candidate.minCutOff === "number" &&
		Number.isFinite(candidate.minCutOff)
			? candidate.minCutOff
			: undefined;
	const beta =
		typeof candidate.beta === "number" && Number.isFinite(candidate.beta)
			? candidate.beta
			: undefined;
	const dCutOff =
		typeof candidate.dCutOff === "number" && Number.isFinite(candidate.dCutOff)
			? candidate.dCutOff
			: undefined;
	if (
		!method &&
		minCutOff === undefined &&
		beta === undefined &&
		dCutOff === undefined
	) {
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
	if (!raw || typeof raw !== "object") return undefined;
	const modalities = normalizeModalities(
		(raw as Record<string, unknown>).modalities,
	);
	const smoothing = normalizeSmoothing(
		(raw as Record<string, unknown>).smoothing,
	);

	if (!modalities && !smoothing) {
		return undefined;
	}

	return {
		...(modalities ? { modalities } : {}),
		...(smoothing ? { smoothing } : {}),
	};
}

function normalizeRecordingMetadata(
	raw: unknown,
): RecordingMetadata | undefined {
	if (!raw || typeof raw !== "object") return undefined;
	const candidate = raw as Record<string, unknown>;
	const frameCount =
		typeof candidate.frameCount === "number" &&
		Number.isFinite(candidate.frameCount)
			? candidate.frameCount
			: undefined;
	const usableFrameCount =
		typeof candidate.usableFrameCount === "number" &&
		Number.isFinite(candidate.usableFrameCount)
			? candidate.usableFrameCount
			: undefined;
	const clipDurationMs =
		typeof candidate.clipDurationMs === "number" &&
		Number.isFinite(candidate.clipDurationMs)
			? candidate.clipDurationMs
			: undefined;
	const clipBytes =
		typeof candidate.clipBytes === "number" &&
		Number.isFinite(candidate.clipBytes)
			? candidate.clipBytes
			: undefined;
	const clipMimeType =
		typeof candidate.clipMimeType === "string" && candidate.clipMimeType.trim()
			? candidate.clipMimeType.trim()
			: undefined;
	const stillBytes =
		typeof candidate.stillBytes === "number" &&
		Number.isFinite(candidate.stillBytes)
			? candidate.stillBytes
			: undefined;
	const stillMimeType =
		typeof candidate.stillMimeType === "string" &&
		candidate.stillMimeType.trim()
			? candidate.stillMimeType.trim()
			: undefined;
	const previewMirrored =
		typeof candidate.previewMirrored === "boolean"
			? candidate.previewMirrored
			: undefined;

	if (
		frameCount === undefined &&
		usableFrameCount === undefined &&
		clipDurationMs === undefined &&
		clipBytes === undefined &&
		!clipMimeType &&
		stillBytes === undefined &&
		!stillMimeType &&
		previewMirrored === undefined
	) {
		return undefined;
	}

	return {
		...(frameCount !== undefined ? { frameCount } : {}),
		...(usableFrameCount !== undefined ? { usableFrameCount } : {}),
		...(clipDurationMs !== undefined ? { clipDurationMs } : {}),
		...(clipBytes !== undefined ? { clipBytes } : {}),
		...(clipMimeType ? { clipMimeType } : {}),
		...(stillBytes !== undefined ? { stillBytes } : {}),
		...(stillMimeType ? { stillMimeType } : {}),
		...(previewMirrored !== undefined ? { previewMirrored } : {}),
	};
}

function mergeCaptureMetadata(
	frameMetadata: CaptureMetadata | undefined,
	recording: RecordingMetadata | undefined,
	timing: TimingMetadata | undefined,
): CaptureMetadata | undefined {
	if (!frameMetadata && !recording && !timing) return undefined;
	return {
		...(frameMetadata ?? {}),
		...(recording ? { recording } : {}),
		...(timing ? { timing } : {}),
	};
}

function analyzeTimestampSequence(
	frames: LandmarksFrameEntry[],
): TimingMetadata | undefined {
	const timestamps = frames
		.map((frame) => frame.timestampMs)
		.filter(
			(value): value is number =>
				typeof value === "number" && Number.isFinite(value),
		);

	if (timestamps.length < 2) {
		return undefined;
	}

	let nonMonotonic = false;
	const deltas: number[] = [];
	for (let i = 1; i < timestamps.length; i += 1) {
		const delta = timestamps[i] - timestamps[i - 1];
		if (delta <= 0) {
			nonMonotonic = true;
		}
		if (delta > 0) {
			deltas.push(delta);
		}
	}

	if (deltas.length === 0) {
		return nonMonotonic ? { nonMonotonic: true } : undefined;
	}

	const totalDelta = deltas.reduce((sum, d) => sum + d, 0);
	const averageDelta = totalDelta / deltas.length;
	const minDelta = Math.min(...deltas);
	const maxDelta = Math.max(...deltas);

	const result: Partial<TimingMetadata> = {};
	if (nonMonotonic) {
		result.nonMonotonic = true;
	}
	if (Number.isFinite(averageDelta)) {
		result.averageDeltaMs = averageDelta;
	}
	if (Number.isFinite(minDelta)) {
		result.minDeltaMs = minDelta;
	}
	if (Number.isFinite(maxDelta)) {
		result.maxDeltaMs = maxDelta;
	}

	return Object.keys(result).length > 0
		? (result as TimingMetadata)
		: undefined;
}

function loadManifest(): TrainingBundleManifestEntry[] {
	const parsed = loadTrainingManifest<unknown>().entries;
	const validEntries: TrainingBundleManifestEntry[] = [];
	parsed.forEach((entry, index) => {
		const result = TrainingBundleManifestEntrySchema.safeParse(entry);
		if (result.success) {
			validEntries.push(result.data);
		} else {
			logger.warn("Skipping invalid training bundle manifest entry", {
				index,
				issues: result.error.issues,
			});
		}
	});
	return validEntries;
}

function isQualityMetrics(value: unknown): value is QualityMetrics {
	if (!value || typeof value !== "object") {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.frameCount === "number" &&
		Number.isFinite(candidate.frameCount) &&
		typeof candidate.handCoverage === "number" &&
		Number.isFinite(candidate.handCoverage) &&
		typeof candidate.poseCoverage === "number" &&
		Number.isFinite(candidate.poseCoverage) &&
		typeof candidate.faceCoverage === "number" &&
		Number.isFinite(candidate.faceCoverage)
	);
}

function normalizeTrainingQualityLogEntries(raw: unknown): TrainingQualityLogEntry[] {
	if (!raw || typeof raw !== "object") {
		return [];
	}
	const entries = Array.isArray((raw as { entries?: unknown }).entries)
		? (raw as { entries: unknown[] }).entries
		: [];
	return entries
		.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
		.filter((entry) =>
			typeof entry.bundleId === "string" &&
			typeof entry.label === "string" &&
			(entry.profileId === null || typeof entry.profileId === "string") &&
			Array.isArray(entry.reasons) &&
			entry.reasons.every((reason) => typeof reason === "string") &&
			isQualityMetrics(entry.metrics) &&
			typeof entry.recordedAt === "string",
		)
		.map((entry) => ({
			bundleId: entry.bundleId as string,
			label: entry.label as string,
			profileId: (entry.profileId as string | null) ?? null,
			reasons: entry.reasons as string[],
			metrics: entry.metrics as QualityMetrics,
			recordedAt: entry.recordedAt as string,
		}));
}

export async function readTrainingQualityLog(): Promise<TrainingQualityLogEntry[]> {
	const payload = loadTrainingQualityLog<unknown>();
	return normalizeTrainingQualityLogEntries(payload);
}

async function appendTrainingQualityLog(entry: TrainingQualityLogEntry): Promise<void> {
	appendTrainingQualityLogEntry(entry);
}

function normalizeFlattenedLandmarks(raw: unknown): number[][] {
	const points = normalizePointArray(raw, {
		maxPoints: MAX_FLATTENED_LANDMARK_POINTS,
	});
	return points;
}

function flattenHandPoints(handLandmarks?: number[][][]): number[][] {
	if (!handLandmarks || handLandmarks.length === 0) {
		return [];
	}
	return handLandmarks.flatMap((hand) => hand);
}

function countFramesWithPoints(
	frames: NormalizedFrameData[],
	getPoints: (frame: NormalizedFrameData) => number[][],
): number {
	return frames.reduce(
		(count, frame) => (getPoints(frame).length > 0 ? count + 1 : count),
		0,
	);
}

function extractHandPoints(frame: NormalizedFrameData): number[][] {
	const flattenedHands = flattenHandPoints(frame.handLandmarks);
	if (
		flattenedHands.length > 0 &&
		hasAnyNonZeroHandLandmarks(frame.handLandmarks)
	) {
		return flattenedHands;
	}
	const totalPoints = frame.landmarks.length;
	if (
		totalPoints === HAND_LANDMARKS_PER_HAND ||
		totalPoints === MAX_HANDS * HAND_LANDMARKS_PER_HAND
	) {
		return frame.landmarks;
	}
	return [];
}

function smoothPoints(points: number[][], previous: number[][] | null): number[][] {
	if (!previous || previous.length !== points.length) {
		return points;
	}
	const alpha = 0.35;
	return points.map((point, idx) => {
		const prev = previous[idx];
		if (!prev) {
			return point;
		}
		return [
			(prev[0] * (1 - alpha)) + (point[0] * alpha),
			(prev[1] * (1 - alpha)) + (point[1] * alpha),
			(prev[2] * (1 - alpha)) + (point[2] * alpha),
		];
	});
}

function computeAverageJitter(
	frames: NormalizedFrameData[],
	getPoints: (frame: NormalizedFrameData) => number[][],
	options?: { useSmoothing?: boolean },
): number | null {
	if (frames.length < 2) {
		return null;
	}
	const deltas: number[] = [];
	let previousSmoothed: number[][] | null = null;
	for (let i = 1; i < frames.length; i += 1) {
		const prevPoints = getPoints(frames[i - 1]);
		const nextPoints = getPoints(frames[i]);
		if (prevPoints.length === 0 || nextPoints.length === 0) {
			continue;
		}
		if (prevPoints.length !== nextPoints.length) {
			continue;
		}
		const prevFramePoints: number[][] =
			options?.useSmoothing && previousSmoothed !== null
				? previousSmoothed
				: prevPoints;
		const nextFramePoints: number[][] = options?.useSmoothing
			? smoothPoints(nextPoints, prevFramePoints)
			: nextPoints;

		let sumOfDistances = 0;
		for (let idx = 0; idx < prevFramePoints.length; idx += 1) {
			const prev = prevFramePoints[idx];
			const next = nextFramePoints[idx];
			const dx = next[0] - prev[0];
			const dy = next[1] - prev[1];
			const dz = next[2] - prev[2];
			sumOfDistances += Math.sqrt(dx * dx + dy * dy + dz * dz);
		}
		deltas.push(sumOfDistances / prevFramePoints.length);
		previousSmoothed = nextFramePoints;
	}
	if (deltas.length === 0) {
		return null;
	}
	const total = deltas.reduce((acc, value) => acc + value, 0);
	return total / deltas.length;
}

function computeOverallQualityScore(
	thresholds: QualityThresholds,
	metrics: {
	frameCount: number;
	handCoverage: number;
	poseCoverage: number;
	faceCoverage: number;
	handJitter: number | null;
	poseJitter: number | null;
	faceJitter: number | null;
}): number {
	const frameScore = Math.min(1, metrics.frameCount / (MIN_SIGN_SAMPLE_FRAMES * 2));
	const coverageScore =
		(metrics.handCoverage * 0.5) + (metrics.poseCoverage * 0.25) + (metrics.faceCoverage * 0.25);
	const handJitterScore = metrics.handJitter === null ? 1 : Math.max(0, 1 - (metrics.handJitter / thresholds.maxHandJitter));
	const poseJitterScore = metrics.poseJitter === null ? 1 : Math.max(0, 1 - (metrics.poseJitter / thresholds.maxPoseJitter));
	const faceJitterScore = metrics.faceJitter === null ? 1 : Math.max(0, 1 - (metrics.faceJitter / thresholds.maxFaceJitter));
	const jitterScore = (handJitterScore * 0.5) + (poseJitterScore * 0.25) + (faceJitterScore * 0.25);
	return Number(((frameScore * 0.2) + (coverageScore * 0.4) + (jitterScore * 0.4)).toFixed(3));
}

function evaluateBundleQuality(frames: NormalizedFrameData[], thresholds: QualityThresholds): {
	accepted: boolean;
	reasons: string[];
	metrics: QualityMetrics;
} {
	const frameCount = frames.length;
	const handFrames = countFramesWithPoints(frames, extractHandPoints);
	const poseFrames = countFramesWithPoints(
		frames,
		(frame) => frame.poseLandmarks ?? [],
	);
	const faceFrames = countFramesWithPoints(
		frames,
		(frame) => frame.faceLandmarks ?? [],
	);
	const handCoverage = frameCount > 0 ? handFrames / frameCount : 0;
	const poseCoverage = frameCount > 0 ? poseFrames / frameCount : 0;
	const faceCoverage = frameCount > 0 ? faceFrames / frameCount : 0;
	const handJitterRaw = computeAverageJitter(frames, extractHandPoints);
	const poseJitterRaw = computeAverageJitter(
		frames,
		(frame) => frame.poseLandmarks ?? [],
	);
	const faceJitterRaw = computeAverageJitter(
		frames,
		(frame) => frame.faceLandmarks ?? [],
	);
	const handJitter = computeAverageJitter(frames, extractHandPoints, { useSmoothing: true });
	const poseJitter = computeAverageJitter(
		frames,
		(frame) => frame.poseLandmarks ?? [],
		{ useSmoothing: true },
	);
	const faceJitter = computeAverageJitter(
		frames,
		(frame) => frame.faceLandmarks ?? [],
		{ useSmoothing: true },
	);
	const overallQualityScore = computeOverallQualityScore(thresholds, {
		frameCount,
		handCoverage,
		poseCoverage,
		faceCoverage,
		handJitter,
		poseJitter,
		faceJitter,
	});

	const metrics: QualityMetrics = {
		frameCount,
		handCoverage,
		poseCoverage,
		faceCoverage,
		overallQualityScore,
		...(handJitter !== null ? { handJitter } : {}),
		...(poseJitter !== null ? { poseJitter } : {}),
		...(faceJitter !== null ? { faceJitter } : {}),
		...(handJitterRaw !== null ? { handJitterRaw } : {}),
		...(poseJitterRaw !== null ? { poseJitterRaw } : {}),
		...(faceJitterRaw !== null ? { faceJitterRaw } : {}),
	};

	const reasons: string[] = [];
	if (frameCount < MIN_SIGN_SAMPLE_FRAMES) {
		reasons.push(`frameCount ${frameCount} < ${MIN_SIGN_SAMPLE_FRAMES}`);
	}
	if (handCoverage < MIN_HAND_FRAME_COVERAGE) {
		reasons.push(
			`handCoverage ${handCoverage.toFixed(2)} < ${MIN_HAND_FRAME_COVERAGE}`,
		);
	}
	if (handJitter !== null && handJitter > thresholds.maxHandJitter) {
		reasons.push(`handJitter ${handJitter.toFixed(3)} > ${thresholds.maxHandJitter}`);
	}
	if (poseJitter !== null && poseJitter > thresholds.maxPoseJitter) {
		reasons.push(`poseJitter ${poseJitter.toFixed(3)} > ${thresholds.maxPoseJitter}`);
	}
	if (faceJitter !== null && faceJitter > thresholds.maxFaceJitter) {
		reasons.push(`faceJitter ${faceJitter.toFixed(3)} > ${thresholds.maxFaceJitter}`);
	}

	return {
		accepted: reasons.length === 0,
		reasons,
		metrics,
	};
}

async function readLandmarks(
	entry: TrainingBundleManifestEntry,
): Promise<NormalizedFrameData[]> {
	if (!entry.storage || typeof entry.storage.directory !== "string") {
		return [];
	}
	const dataRoot = path.resolve(DATA_DIR);
	const bundleRoot = ensureInside(
		dataRoot,
		path.join(dataRoot, entry.storage.directory),
	);
	const relativeLandmarks = selectLandmarksRelativePath(entry);
	if (!relativeLandmarks) {
		return [];
	}
	const normalizedRelative = relativeLandmarks.replace(/\\/g, "/");
	const landmarksPath = ensureInside(
		bundleRoot,
		path.join(bundleRoot, normalizedRelative),
	);
	try {
		const raw = await fs.readFile(landmarksPath, "utf8");
		const parsed = JSON.parse(raw) as LandmarksFile;
		if (
			!parsed ||
			typeof parsed !== "object" ||
			!Array.isArray(parsed.frames)
		) {
			return [];
		}
		const captureMetadata = normalizeCaptureMetadata(
			(parsed as Record<string, unknown>).metadata,
		);
		const recordingMetadata = normalizeRecordingMetadata(
			entry.metadata && typeof entry.metadata === "object"
				? (entry.metadata as Record<string, unknown>).recording
				: null,
		);
		const timingMetadata = analyzeTimestampSequence(parsed.frames);
		if (timingMetadata?.nonMonotonic) {
			logger.warn("Training bundle contains non-monotonic frame timestamps", {
				bundleId: entry.id,
				profileId: entry.profileId ?? null,
				timing: timingMetadata,
			});
		}
		const mergedCaptureMetadata = mergeCaptureMetadata(
			captureMetadata,
			recordingMetadata,
			timingMetadata,
		);
		const frames: NormalizedFrameData[] = [];
		parsed.frames.forEach((frame) => {
			const handedness = normalizeHandedness(frame?.handedness);
			const handLandmarks = normalizeHandLandmarks(frame?.handLandmarks);
			const poseLandmarks = normalizePoseLandmarks(frame?.poseLandmarks);
			const faceLandmarks = normalizeFaceLandmarks(frame?.faceLandmarks);
			const flattened = normalizeFlattenedLandmarks(frame?.landmarks);
			const timestampRaw = frame?.timestampMs;
			const timestampMs =
				typeof timestampRaw === "number" && Number.isFinite(timestampRaw)
					? timestampRaw
					: undefined;
			const landmarks =
				flattened.length > 0
					? flattened
					: deriveFlattenedHands(handLandmarks, handedness);
			if (landmarks.length === 0) {
				return;
			}
			frames.push({
				landmarks,
				handLandmarks,
				poseLandmarks,
				faceLandmarks,
				handedness,
				...(mergedCaptureMetadata
					? { captureMetadata: mergedCaptureMetadata }
					: {}),
				...(timestampMs !== undefined ? { timestampMs } : {}),
			});
		});
		return frames;
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
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
	const frameTimestamp =
		typeof frameData.timestampMs === "number" &&
		Number.isFinite(frameData.timestampMs)
			? frameData.timestampMs
			: undefined;
	const timestampSource = entry.capturedAt ?? entry.receivedAt;
	const parsedTimestamp = timestampSource ? Date.parse(timestampSource) : NaN;
	const ts =
		frameTimestamp ??
		(Number.isFinite(parsedTimestamp) ? parsedTimestamp : Date.now());
	const sample: DatasetSample = {
		id: `${BUNDLE_SAMPLE_PREFIX}${entry.id}:frame:${frameIndex}`,
		label: entry.label,
		...(entry.symbolId ? { symbolId: entry.symbolId } : {}),
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
	// Pass through handFocus from bundle metadata
	const handFocus = entry.metadata?.handFocus;
	if (handFocus) {
		sample.handFocus = handFocus;
	}
	return sample;
}

export async function ingestTrainingBundlesIntoDataset(): Promise<{
	appended: number;
	latestCapturedAt?: string;
}> {
	await ensureDataDir();
	const manifestEntries = loadManifest();
	const qualityThresholds = await loadQualityThresholds();
	if (manifestEntries.length === 0) {
		return { appended: 0 };
	}

	let dataset: DatasetFile = { samples: [] };
	let datasetReset = false;
	const rawDataset = loadDgsSamples<unknown>().samples;
	if (Array.isArray(rawDataset)) {
		const normalizedSamples = rawDataset
			.filter(isDatasetSample)
			.map((sample) => ({ ...sample }));
		if (normalizedSamples.length !== rawDataset.length) {
			datasetReset = true;
			logger.warn(
				"Training dataset storage contained invalid samples – pruning entries",
				{
					discarded: rawDataset.length - normalizedSamples.length,
				},
			);
		}
		dataset = { samples: normalizedSamples };
	}

		if (!Array.isArray(dataset.samples)) {
			dataset.samples = [];
		}

		const existingKeys = new Set<string>();
		for (const sample of dataset.samples) {
			if (sample && typeof sample === "object") {
				const bundleId = (sample as DatasetSample).sourceBundleId;
				const frameIdx = (sample as DatasetSample).frameIndex;
				if (typeof bundleId === "string" && typeof frameIdx === "number") {
					existingKeys.add(`${bundleId}:${frameIdx}`);
				}
			}
		}

		let appended = 0;
		let latestCapturedAt: string | undefined;

		for (const entry of manifestEntries) {
			const featureContractVersion =
				typeof entry.metadata?.featureContract === "object" &&
				entry.metadata.featureContract &&
				typeof (entry.metadata.featureContract as Record<string, unknown>).version === "string"
					? ((entry.metadata.featureContract as Record<string, unknown>).version as string)
					: null;
			if (
				featureContractVersion &&
				featureContractVersion !== EXPECTED_FEATURE_CONTRACT_VERSION
			) {
				const recordedAt =
					(typeof entry.capturedAt === "string" && entry.capturedAt) ||
					(typeof entry.metadata?.capturedAt === "string" && entry.metadata.capturedAt) ||
					(typeof entry.receivedAt === "string" && entry.receivedAt) ||
					new Date().toISOString();
				const reasons = [
					`featureContract.version '${featureContractVersion}' != '${EXPECTED_FEATURE_CONTRACT_VERSION}'`,
				];
				const qualityLogEntry: TrainingQualityLogEntry = {
					bundleId: entry.id,
					label: entry.label,
					profileId: entry.profileId ?? null,
					reasons,
					metrics: {
						frameCount: 0,
						handCoverage: 0,
						poseCoverage: 0,
						faceCoverage: 0,
					},
					recordedAt,
				};
				try {
					await appendTrainingQualityLog(qualityLogEntry);
				} catch (appendError) {
					logger.error("Failed to append training quality log entry", {
						bundleId: entry.id,
						error:
							appendError instanceof Error
								? appendError.message
								: String(appendError),
					});
				}
				logger.warn("Training bundle rejected due to feature contract mismatch", {
					bundleId: entry.id,
					profileId: entry.profileId ?? null,
					label: entry.label,
					reasons,
				});
				continue;
			}

			const frames = await readLandmarks(entry).catch((error) => {
				logger.warn("Failed to read landmarks for training bundle", {
					error: error instanceof Error ? error.message : String(error),
					bundleId: entry.id,
				});
				return [] as NormalizedFrameData[];
			});
			if (frames.length === 0) continue;
			const quality = evaluateBundleQuality(frames, qualityThresholds);
			if (!quality.accepted) {
				const recordedAt =
					(typeof entry.capturedAt === "string" && entry.capturedAt) ||
					(typeof entry.metadata?.capturedAt === "string" && entry.metadata.capturedAt) ||
					(typeof entry.receivedAt === "string" && entry.receivedAt) ||
					new Date().toISOString();
				const qualityLogEntry: TrainingQualityLogEntry = {
					bundleId: entry.id,
					label: entry.label,
					profileId: entry.profileId ?? null,
					reasons: quality.reasons,
					metrics: quality.metrics,
					recordedAt,
				};
				try {
					await appendTrainingQualityLog(qualityLogEntry);
				} catch (appendError) {
					logger.error("Failed to append training quality log entry", {
						bundleId: entry.id,
						error:
							appendError instanceof Error
								? appendError.message
								: String(appendError),
					});
				}
				logger.warn("Training bundle rejected by quality gate", {
					bundleId: entry.id,
					profileId: entry.profileId ?? null,
					label: entry.label,
					reasons: quality.reasons,
					metrics: quality.metrics,
				});
				continue;
			}
			const capturedAt = entry.capturedAt ?? entry.metadata?.capturedAt ?? null;
			if (typeof capturedAt === "string") {
				const capturedMs = Date.parse(capturedAt);
				if (!Number.isNaN(capturedMs)) {
					if (!latestCapturedAt || capturedMs > Date.parse(latestCapturedAt)) {
						latestCapturedAt = capturedAt;
					}
				}
			}
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
			saveDgsSamples(dataset);
		}
		return { appended: 0, latestCapturedAt };
	}

	saveDgsSamples(dataset);
	return { appended, latestCapturedAt };
}
