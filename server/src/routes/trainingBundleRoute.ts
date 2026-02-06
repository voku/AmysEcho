import type { IZipEntry } from "adm-zip";
import AdmZip from "adm-zip";
import type { Express } from "express";
import express, { type Request, type Response } from "express";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import {
	DATA_DIR,
	ensureDataDir,
	PROFILE_ID_PATTERN,
	TRAINING_DATASETS_DIR,
	TRAINING_MANIFEST_PATH,
	TRAINING_UPLOADS_DIR,
} from "../constants/modelPaths.js";
import { auth } from "../middleware/auth.js";
import { logger } from "../services/logger.js";
import { atomicWriteBuffer, atomicWriteJson } from "../utils/atomicFs.js";
import { withFileLock } from "../utils/fileLock.js";

interface TrainingJobTriggerContext {
	bundleId: string;
	profileId: string | null;
	label: string;
}

const TriggerTrainingJobResultSchema = z.object({
	jobId: z.string().trim().min(1),
	status: z.enum(["queued", "running", "completed", "failed"]),
	pollUrl: z.string().trim().min(1).optional(),
	queueDepth: z.number().int().nonnegative().optional(),
	retryAfterMs: z.number().int().positive().optional(),
});
type TriggerTrainingJobResult = z.infer<typeof TriggerTrainingJobResultSchema>;

interface TrainingBundleRouteDeps {
	triggerTrainingJob?: (
		context: TrainingJobTriggerContext,
	) => TriggerTrainingJobResult | null | undefined;
	resolveProfileId?: (
		profileId: string | null,
	) => Promise<{ profileId: string | null }>;
}

interface TrainingBundleMetadata {
	label: string;
	profileId: string | null;
	capturedAt: string | null;
	source: string | null;
	clipFilename: string | null;
	stillFilename: string | null;
	/**
	 * Audio filename for multimodal recognition
	 * Amy First: Captures verbal utterances alongside gestures
	 */
	audioFilename?: string | null;
	recording?: {
		frameCount?: number;
		usableFrameCount?: number;
		clipDurationMs?: number;
		clipBytes?: number;
		clipMimeType?: string;
		stillBytes?: number;
		stillMimeType?: string;
		/**
		 * Audio recording metadata
		 */
		audioDurationMs?: number;
		audioBytes?: number;
		audioMimeType?: string;
	};
	validationSummary?: {
		frameCount: number;
		landmarksPath: string;
	};
	modalities?: Record<string, unknown>;
	smoothing?: Record<string, unknown>;
	handedness?: { labels?: string[]; frameCount?: number };
	handFocus?:
		| "dominant_only"
		| "both_equal"
		| "both_asymmetric"
		| "either_hand";
	variationData?: {
		clusterId?: string;
		dominantCluster?: string;
		variationDiversity?: number;
		canonicalTemplates?: number;
	};
}

interface TrainingBundleManifestEntry {
	id: string;
	profileId: string | null;
	label: string;
	capturedAt: string | null;
	source: string | null;
	storage: {
		directory: string;
		bundle: string;
		files: string[];
		clip?: string;
		still?: string;
	};
	metadata: TrainingBundleMetadata;
	receivedAt: string;
}

interface TrainingBundleManifestFile {
	entries: TrainingBundleManifestEntry[];
}

const trainingBundleUpload = express.raw({
	type: [
		"application/zip",
		"application/x-zip-compressed",
		"application/octet-stream",
	],
	limit: "64mb",
});

const MODALITY_KEYS = ["hands", "pose", "face", "nonManual"] as const;
type ModalityKey = (typeof MODALITY_KEYS)[number];
const INGESTION_METRICS_PATH = path.join(
	TRAINING_DATASETS_DIR,
	"ingestion_metrics.json",
);

const SmoothingSchema = z
	.object({
		method: z.string().optional(),
		minCutOff: z.number().optional(),
		beta: z.number().optional(),
		dCutOff: z.number().optional(),
	})
	.passthrough();

const ModalityStatsSchema = z
	.object({
		present: z.boolean().optional(),
		frameCount: z.number().optional(),
		coverage: z.number().optional(),
	})
	.passthrough();

const ModalitiesSchema = z
	.object({
		hands: ModalityStatsSchema.optional(),
		pose: ModalityStatsSchema.optional(),
		face: ModalityStatsSchema.optional(),
		nonManual: ModalityStatsSchema.optional(),
	})
	.passthrough();

const HandednessSchema = z
	.object({
		labels: z.array(z.string()).optional(),
		frameCount: z.number().optional(),
	})
	.passthrough();

const RecordingSchema = z
	.object({
		frameCount: z.number().int().nonnegative().optional(),
		usableFrameCount: z.number().int().nonnegative().optional(),
		clipDurationMs: z.number().int().nonnegative().optional(),
		clipBytes: z.number().int().nonnegative().optional(),
		clipMimeType: z.string().optional(),
		stillBytes: z.number().int().nonnegative().optional(),
		stillMimeType: z.string().optional(),
		audioDurationMs: z.number().int().nonnegative().optional(),
		audioBytes: z.number().int().nonnegative().optional(),
		audioMimeType: z.string().optional(),
	})
	.passthrough();

const HandFocusSchema = z.enum([
	"dominant_only", // Only one hand matters (the moving one)
	"both_equal", // Both hands equally important
	"both_asymmetric", // Both hands, but weighted differently
	"either_hand", // Works with either hand
]);

const VariationDataSchema = z
	.object({
		clusterId: z.string().optional(),
		dominantCluster: z.string().optional(),
		variationDiversity: z.number().optional(),
		canonicalTemplates: z.number().optional(),
	})
	.passthrough();

const MetadataSchema = z
	.object({
		label: z.string().min(1),
		profileId: z.string().optional(),
		capturedAt: z.string().optional(),
		source: z.string().optional(),
		clipFilename: z.string().optional(),
		stillFilename: z.string().optional(),
		audioFilename: z.string().optional(),
		modalities: ModalitiesSchema.optional(),
		smoothing: SmoothingSchema.optional(),
		handedness: HandednessSchema.optional(),
		recording: RecordingSchema.optional(),
		handFocus: HandFocusSchema.optional(),
		variationData: VariationDataSchema.optional(),
	})
	.passthrough();

type IngestionMetrics = {
	updatedAt: string;
	totals: {
		uploads: number;
		rejected: number;
		missingModalities: Record<ModalityKey, number>;
		nonManualCoverage: NonManualCoverageSummary;
		nonManualCoverageSamples: number[];
	};
	profiles: Record<
		string,
		{
			uploads: number;
			rejected: number;
			missingModalities: Record<ModalityKey, number>;
			nonManualCoverage: NonManualCoverageSummary;
			nonManualCoverageSamples: number[];
		}
	>;
};

type NonManualCoverageSummary = {
	p50: number;
	p90: number;
	sampleCount: number;
};

const COVERAGE_SAMPLE_LIMIT = 200;


const NonManualFeaturesSchema = z
	.object({
		headYaw: z.number().nullable().optional(),
		headPitch: z.number().nullable().optional(),
		mouthOpenness: z.number().nullable().optional(),
		eyebrowRaiseLeft: z.number().nullable().optional(),
		eyebrowRaiseRight: z.number().nullable().optional(),
		source: z.enum(["face", "pose", "mixed"]).optional(),
	})
	.strict();

const LandmarkFrameSchema = z
	.object({
		landmarks: z.array(z.unknown()).optional(),
		nonManualFeatures: NonManualFeaturesSchema.optional(),
	})
	.passthrough()
	.nullable();

const LandmarksFileSchema = z
	.object({
		frames: z.array(LandmarkFrameSchema),
		metadata: z
			.object({
				modalities: ModalitiesSchema.optional(),
				smoothing: SmoothingSchema.optional(),
				handedness: HandednessSchema.optional(),
			})
			.passthrough()
			.optional(),
	})
	.passthrough();

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function normalizeCapturedAt(value: unknown): string | null {
	if (!isNonEmptyString(value)) {
		return null;
	}
	return value.trim();
}

function normalizeClipFilename(value: unknown): string | null {
	if (!isNonEmptyString(value)) {
		return null;
	}
	const trimmed = value.trim();
	if (!trimmed || trimmed === "." || trimmed === "..") {
		return null;
	}
	if (/[\\/:]/.test(trimmed)) {
		return null;
	}
	return trimmed;
}

function normalizeVariationData(
	raw: unknown,
): TrainingBundleMetadata["variationData"] | undefined {
	if (!raw || typeof raw !== "object") {
		return undefined;
	}
	const candidate = raw as Record<string, unknown>;
	const result: Partial<TrainingBundleMetadata["variationData"]> = {};

	if (typeof candidate.clusterId === "string") {
		const trimmedId = candidate.clusterId.trim();
		if (trimmedId) {
			result.clusterId = trimmedId;
		}
	}

	if (typeof candidate.dominantCluster === "string") {
		const trimmedCluster = candidate.dominantCluster.trim();
		if (trimmedCluster) {
			result.dominantCluster = trimmedCluster;
		}
	}

	if (
		typeof candidate.variationDiversity === "number" &&
		Number.isFinite(candidate.variationDiversity)
	) {
		result.variationDiversity = candidate.variationDiversity;
	}

	if (
		typeof candidate.canonicalTemplates === "number" &&
		Number.isFinite(candidate.canonicalTemplates)
	) {
		result.canonicalTemplates = candidate.canonicalTemplates;
	}

	return Object.keys(result).length > 0
		? (result as TrainingBundleMetadata["variationData"])
		: undefined;
}

function validateRecordingMetadata(
	recording: z.infer<typeof RecordingSchema> | undefined,
	clipFilename: string | null,
): string | null {
	if (!recording) {
		return null;
	}
	if (
		typeof recording.frameCount === "number" &&
		typeof recording.usableFrameCount === "number" &&
		recording.usableFrameCount > recording.frameCount
	) {
		return "metadata.recording.usableFrameCount must be <= metadata.recording.frameCount";
	}
	if (
		clipFilename &&
		typeof recording.clipDurationMs === "number" &&
		recording.clipDurationMs <= 0
	) {
		return "metadata.recording.clipDurationMs must be > 0 when clipFilename is provided";
	}
	return null;
}

function sanitizeEntryName(entryName: string): string {
	const normalized = path.posix
		.normalize(entryName.replace(/\\/g, "/"))
		.replace(/^\//, "");
	if (!normalized || normalized === ".") {
		return "";
	}
	const withoutTrailingSlash = normalized.replace(/\/$/, "");
	if (!withoutTrailingSlash) {
		return "";
	}
	if (withoutTrailingSlash.includes(":")) {
		return "";
	}
	const segments = withoutTrailingSlash.split("/");
	if (segments.some((segment) => segment === "" || segment === "..")) {
		return "";
	}
	return withoutTrailingSlash;
}

function isPathInside(target: string, root: string): boolean {
	const normalizedRoot = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
	const resolved = path.resolve(target);
	return resolved === root || resolved.startsWith(normalizedRoot);
}

function createEmptyModalities(): Record<ModalityKey, number> {
	return { hands: 0, pose: 0, face: 0, nonManual: 0 };
}

function createEmptyIngestionMetrics(): IngestionMetrics {
	const emptyCoverage: NonManualCoverageSummary = {
		p50: 0,
		p90: 0,
		sampleCount: 0,
	};
	return {
		updatedAt: new Date().toISOString(),
		totals: {
			uploads: 0,
			rejected: 0,
			missingModalities: createEmptyModalities(),
			nonManualCoverage: emptyCoverage,
			nonManualCoverageSamples: [],
		},
		profiles: {},
	};
}

function normalizeModalities(raw: unknown): Record<ModalityKey, number> {
	const base = createEmptyModalities();
	if (!raw || typeof raw !== "object") {
		return base;
	}
	const record = raw as Record<string, unknown>;
	for (const key of MODALITY_KEYS) {
		const value = record[key];
		if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
			base[key] = value;
		}
	}
	return base;
}

function normalizeIngestionMetrics(raw: unknown): IngestionMetrics {
	if (!raw || typeof raw !== "object") {
		return createEmptyIngestionMetrics();
	}
	const record = raw as Record<string, unknown>;
	const totalsRaw = record.totals as Record<string, unknown> | undefined;
	const profilesRaw = record.profiles as Record<string, unknown> | undefined;
	const totalsCoverageSamples = normalizeCoverageSamples(
		totalsRaw?.nonManualCoverageSamples,
	);
	const metrics: IngestionMetrics = {
		updatedAt:
			typeof record.updatedAt === "string"
				? record.updatedAt
				: new Date().toISOString(),
		totals: {
			uploads: typeof totalsRaw?.uploads === "number" ? totalsRaw.uploads : 0,
			rejected:
				typeof totalsRaw?.rejected === "number" ? totalsRaw.rejected : 0,
			missingModalities: normalizeModalities(totalsRaw?.missingModalities),
			nonManualCoverage: normalizeCoverageSummary(
				totalsRaw?.nonManualCoverage,
				totalsCoverageSamples,
			),
			nonManualCoverageSamples: totalsCoverageSamples,
		},
		profiles: {},
	};

	if (profilesRaw && typeof profilesRaw === "object") {
		for (const [profileId, profileValue] of Object.entries(profilesRaw)) {
			if (!profileValue || typeof profileValue !== "object") {
				continue;
			}
			const profileRecord = profileValue as Record<string, unknown>;
			const profileCoverageSamples = normalizeCoverageSamples(
				profileRecord.nonManualCoverageSamples,
			);
			metrics.profiles[profileId] = {
				uploads:
					typeof profileRecord.uploads === "number" ? profileRecord.uploads : 0,
				rejected:
					typeof profileRecord.rejected === "number"
						? profileRecord.rejected
						: 0,
				missingModalities: normalizeModalities(profileRecord.missingModalities),
				nonManualCoverage: normalizeCoverageSummary(
					profileRecord.nonManualCoverage,
					profileCoverageSamples,
				),
				nonManualCoverageSamples: profileCoverageSamples,
			};
		}
	}

	return metrics;
}

async function recordIngestionMetrics(update: {
	profileId: string | null;
	status: "accepted" | "rejected";
	missingModalities?: ModalityKey[];
	nonManualCoverage?: number | null;
}): Promise<void> {
	try {
		await ensureDataDir();
		await fs.mkdir(TRAINING_DATASETS_DIR, { recursive: true });
		await withFileLock(INGESTION_METRICS_PATH, async () => {
			let metrics = createEmptyIngestionMetrics();
			try {
				const raw = await fs.readFile(INGESTION_METRICS_PATH, "utf8");
				metrics = normalizeIngestionMetrics(JSON.parse(raw));
			} catch (error: any) {
				if (error?.code !== "ENOENT") {
					logger.warn("Failed to read ingestion metrics; reinitializing", {
						error,
					});
				}
			}

			const profileKey = update.profileId ?? "unassigned";
			const profileMetrics = metrics.profiles[profileKey] ?? {
				uploads: 0,
				rejected: 0,
				missingModalities: createEmptyModalities(),
				nonManualCoverage: { p50: 0, p90: 0, sampleCount: 0 },
				nonManualCoverageSamples: [],
			};

			if (update.status === "accepted") {
				metrics.totals.uploads += 1;
				profileMetrics.uploads += 1;
			} else {
				metrics.totals.rejected += 1;
				profileMetrics.rejected += 1;
			}

			if (update.missingModalities) {
				for (const modality of update.missingModalities) {
					metrics.totals.missingModalities[modality] += 1;
					profileMetrics.missingModalities[modality] += 1;
				}
			}

			if (update.status === "accepted" && update.nonManualCoverage != null) {
				metrics.totals.nonManualCoverageSamples = updateCoverageSamples(
					metrics.totals.nonManualCoverageSamples,
					update.nonManualCoverage,
				);
				metrics.totals.nonManualCoverage = computeCoverageSummary(
					metrics.totals.nonManualCoverageSamples,
				);

				profileMetrics.nonManualCoverageSamples = updateCoverageSamples(
					profileMetrics.nonManualCoverageSamples,
					update.nonManualCoverage,
				);
				profileMetrics.nonManualCoverage = computeCoverageSummary(
					profileMetrics.nonManualCoverageSamples,
				);
			}

			metrics.updatedAt = new Date().toISOString();
			metrics.profiles[profileKey] = profileMetrics;
			await atomicWriteJson(INGESTION_METRICS_PATH, metrics);
		});
	} catch (error) {
		logger.warn("Failed to update ingestion metrics", { error });
	}
}

function summarizeLandmarkFrames(frames: Array<Record<string, unknown>>) {
	const totalFrames = frames.length;
	let handsFrameCount = 0;
	let poseFrameCount = 0;
	let faceFrameCount = 0;
	let nonManualFrameCount = 0;
	let handednessFrameCount = 0;
	const handednessLabels = new Set<string>();
	for (const frame of frames) {
		const landmarks = Array.isArray(frame.landmarks)
			? (frame.landmarks as unknown[])
			: [];
		const poseLandmarks = Array.isArray(frame.poseLandmarks)
			? (frame.poseLandmarks as unknown[])
			: [];
		const faceLandmarks = Array.isArray(frame.faceLandmarks)
			? (frame.faceLandmarks as unknown[])
			: [];
		const handedness = Array.isArray(frame.handedness)
			? (frame.handedness as unknown[])
			: [];
		const nonManualFeatures =
			frame.nonManualFeatures && typeof frame.nonManualFeatures === "object"
				? (frame.nonManualFeatures as Record<string, unknown>)
				: null;

		if (
			landmarks.some(
				(hand) => Array.isArray(hand) && (hand as unknown[]).length > 0,
			)
		) {
			handsFrameCount++;
		}

		if (poseLandmarks.length > 0) {
			poseFrameCount++;
		}

		if (faceLandmarks.length > 0) {
			faceFrameCount++;
		}

		if (nonManualFeatures && Object.keys(nonManualFeatures).length > 0) {
			nonManualFrameCount++;
		}

		const handednessStrings = handedness.filter(
			(value): value is string =>
				typeof value === "string" && value.trim().length > 0,
		);
		if (handednessStrings.length > 0) {
			handednessFrameCount++;
			handednessStrings.forEach((entry) => handednessLabels.add(entry));
		}
	}

	return {
		modalities: {
			hands: {
				present: handsFrameCount > 0,
				frameCount: handsFrameCount,
				coverage: totalFrames > 0 ? handsFrameCount / totalFrames : 0,
			},
			pose: {
				present: poseFrameCount > 0,
				frameCount: poseFrameCount,
				coverage: totalFrames > 0 ? poseFrameCount / totalFrames : 0,
			},
			face: {
				present: faceFrameCount > 0,
				frameCount: faceFrameCount,
				coverage: totalFrames > 0 ? faceFrameCount / totalFrames : 0,
			},
			nonManual: {
				present: nonManualFrameCount > 0,
				frameCount: nonManualFrameCount,
				coverage: totalFrames > 0 ? nonManualFrameCount / totalFrames : 0,
			},
		},
		handedness:
			handednessLabels.size > 0
				? {
						labels: Array.from(handednessLabels),
						frameCount: handednessFrameCount,
					}
				: undefined,
	};
}

function normalizeCoverageSamples(value: unknown): number[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.filter((entry) => typeof entry === "number" && Number.isFinite(entry))
		.map((entry) => Math.max(0, Math.min(1, entry)))
		.slice(-COVERAGE_SAMPLE_LIMIT);
}

function normalizeCoverageSummary(
	value: unknown,
	samples: number[],
): NonManualCoverageSummary {
	if (samples.length > 0) {
		return computeCoverageSummary(samples);
	}
	if (!value || typeof value !== "object") {
		return { p50: 0, p90: 0, sampleCount: 0 };
	}
	const record = value as Record<string, unknown>;
	const p50 =
		typeof record.p50 === "number" && Number.isFinite(record.p50)
			? record.p50
			: 0;
	const p90 =
		typeof record.p90 === "number" && Number.isFinite(record.p90)
			? record.p90
			: 0;
	const sampleCount =
		typeof record.sampleCount === "number" && Number.isFinite(record.sampleCount)
			? record.sampleCount
			: 0;
	return { p50, p90, sampleCount };
}

function updateCoverageSamples(samples: number[], coverage: number): number[] {
	if (!Number.isFinite(coverage)) {
		return samples;
	}
	const clamped = Math.max(0, Math.min(1, coverage));
	const updated = [...samples, clamped];
	return updated.slice(-COVERAGE_SAMPLE_LIMIT);
}

function computeCoverageSummary(samples: number[]): NonManualCoverageSummary {
	if (samples.length === 0) {
		return { p50: 0, p90: 0, sampleCount: 0 };
	}
	const sorted = [...samples].sort((a, b) => a - b);
	const percentile = (ratio: number) => {
		const index = Math.floor((sorted.length - 1) * ratio);
		return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
	};
	return {
		p50: percentile(0.5),
		p90: percentile(0.9),
		sampleCount: sorted.length,
	};
}

function normalizeModalityStats(
	source: z.infer<typeof ModalityStatsSchema> | undefined,
	fallback?: { present: boolean; frameCount: number; coverage: number },
) {
	const present =
		typeof source?.present === "boolean"
			? source.present
			: (fallback?.present ?? false);
	const frameCount =
		typeof source?.frameCount === "number"
			? source.frameCount
			: (fallback?.frameCount ?? 0);
	const coverage =
		typeof source?.coverage === "number"
			? source.coverage
			: (fallback?.coverage ?? 0);
	return { present, frameCount, coverage };
}

function mergeModalities(
	primary: unknown,
	fallback?: {
		hands: { present: boolean; frameCount: number; coverage: number };
		pose: { present: boolean; frameCount: number; coverage: number };
		face: { present: boolean; frameCount: number; coverage: number };
		nonManual: { present: boolean; frameCount: number; coverage: number };
	},
) {
	const parsed = ModalitiesSchema.safeParse(primary);
	const data = parsed.success ? parsed.data : undefined;
	return {
		hands: normalizeModalityStats(data?.hands, fallback?.hands),
		pose: normalizeModalityStats(data?.pose, fallback?.pose),
		face: normalizeModalityStats(data?.face, fallback?.face),
		nonManual: normalizeModalityStats(data?.nonManual, fallback?.nonManual),
	};
}

function mergeSmoothing(primary: unknown, fallback?: Record<string, unknown>) {
	const parsed = SmoothingSchema.safeParse(primary);
	if (parsed.success) {
		return { ...fallback, ...parsed.data };
	}
	return fallback;
}

function mergeHandedness(
	primary: unknown,
	fallback?: { labels: string[]; frameCount: number },
): { labels: string[]; frameCount: number } | undefined {
	const parsed = HandednessSchema.safeParse(primary);
	if (parsed.success && parsed.data) {
		const labels = Array.isArray(parsed.data.labels)
			? parsed.data.labels.filter(
					(label): label is string => typeof label === "string",
				)
			: [];
		const frameCount =
			typeof parsed.data.frameCount === "number"
				? parsed.data.frameCount
				: fallback?.frameCount;
		if (labels.length > 0 || typeof frameCount === "number") {
			return {
				labels: labels.length > 0 ? labels : (fallback?.labels ?? []),
				frameCount: frameCount ?? 0,
			};
		}
	}
	return fallback;
}

interface LandmarksValidationResult {
	relativePath: string;
	frameCount: number;
	metadata?: z.infer<typeof LandmarksFileSchema>["metadata"];
	computed: {
		modalities: {
			hands: { present: boolean; frameCount: number; coverage: number };
			pose: { present: boolean; frameCount: number; coverage: number };
			face: { present: boolean; frameCount: number; coverage: number };
			nonManual: { present: boolean; frameCount: number; coverage: number };
		};
		handedness?: { labels: string[]; frameCount: number };
	};
}

async function cleanupBundleRoot(bundleRoot: string): Promise<void> {
	try {
		await fs.rm(bundleRoot, { recursive: true, force: true });
	} catch (error) {
		console.warn("Failed to clean up invalid training bundle directory", {
			error,
			bundleRoot,
		});
	}
}

async function validateLandmarksFile(
	bundleRoot: string,
	bundleRootResolved: string,
	files: string[],
): Promise<LandmarksValidationResult> {
	const relative = files.find((file) => {
		const normalized = file.replace(/\\/g, "/");
		const baseName = normalized.split("/").pop();
		return baseName === "landmarks.json";
	});
	if (!relative) {
		throw new Error("landmarks.json missing from bundle");
	}

	const normalizedRelative = relative.replace(/\\/g, "/").replace(/^\/+/, "");
	if (!normalizedRelative) {
		throw new Error("landmarks.json path invalid");
	}

	const targetPath = path.resolve(
		bundleRoot,
		normalizedRelative.split("/").join(path.sep),
	);
	if (!isPathInside(targetPath, bundleRootResolved)) {
		throw new Error("landmarks.json path escapes extraction directory");
	}

	let raw: string;
	try {
		raw = await fs.readFile(targetPath, "utf8");
	} catch {
		throw new Error("landmarks.json could not be read");
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error("landmarks.json must be valid JSON");
	}

	const validation = LandmarksFileSchema.safeParse(parsed);
	if (!validation.success) {
		throw new Error("landmarks.json must include a frames array");
	}

	const { frames, metadata } = validation.data;
	const computed = summarizeLandmarkFrames(
		frames as Array<Record<string, unknown>>,
	);
	const frameCount = frames.reduce((count, frame) => {
		if (frame?.landmarks && frame.landmarks.length > 0) {
			return count + 1;
		}
		return count;
	}, 0);

	if (frameCount === 0) {
		throw new Error(
			"landmarks.json must contain at least one frame with landmarks",
		);
	}

	return { relativePath: relative, frameCount, metadata, computed };
}

const VIDEO_FILE_EXTENSIONS = [".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"];
const IMAGE_FILE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".bmp"];
const AUDIO_FILE_EXTENSIONS = [
	".webm",
	".opus",
	".ogg",
	".mp3",
	".m4a",
	".wav",
	".aac",
];

function hasVideoExtension(fileName: string): boolean {
	const lower = fileName.toLowerCase();
	return VIDEO_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function hasAudioExtension(fileName: string): boolean {
	const lower = fileName.toLowerCase();
	return AUDIO_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function findClipRelativePath(
	files: string[],
	clipFilename: string | null,
): string | null {
	let clipPathByExt: string | null = null;
	let clipPathByAny: string | null = null;

	const metadataExtension =
		clipFilename && clipFilename.includes(".")
			? clipFilename.substring(clipFilename.lastIndexOf(".") + 1).toLowerCase()
			: null;

	for (const fileName of files) {
		const normalized = fileName.replace(/\\/g, "/");
		const baseName = normalized.split("/").pop() ?? "";
		if (!baseName) {
			continue;
		}

		if (clipFilename && baseName === clipFilename) {
			return fileName;
		}

		if (
			!clipPathByExt &&
			metadataExtension &&
			baseName.toLowerCase().endsWith(`.${metadataExtension}`)
		) {
			clipPathByExt = fileName;
			continue;
		}

		if (!clipPathByAny && hasVideoExtension(baseName)) {
			clipPathByAny = fileName;
		}
	}

	return clipPathByExt ?? clipPathByAny;
}

function findStillRelativePath(
	files: string[],
	stillFilename: string | null,
): string | null {
	let stillPathByMetadata: string | null = null;
	let stillPathByAny: string | null = null;

	const metadataExtension =
		stillFilename && stillFilename.includes(".")
			? stillFilename.substring(stillFilename.lastIndexOf(".")).toLowerCase()
			: null;

	for (const fileName of files) {
		const normalized = fileName.replace(/\\/g, "/");
		const baseName = normalized.split("/").pop() ?? "";
		if (!baseName) {
			continue;
		}

		if (stillFilename && baseName === stillFilename) {
			return fileName;
		}

		const lower = baseName.toLowerCase();

		if (
			!stillPathByMetadata &&
			metadataExtension &&
			lower.endsWith(metadataExtension)
		) {
			stillPathByMetadata = fileName;
			continue;
		}

		if (
			!stillPathByAny &&
			IMAGE_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext))
		) {
			stillPathByAny = fileName;
		}
	}

	return stillPathByMetadata ?? stillPathByAny;
}

/**
 * Find audio file in bundle
 * Amy First: Supports multimodal recognition by locating verbal utterance recordings
 */
function findAudioRelativePath(
	files: string[],
	audioFilename: string | null,
): string | null {
	let audioPathByMetadata: string | null = null;
	let audioPathByAny: string | null = null;

	const metadataExtension =
		audioFilename && audioFilename.includes(".")
			? audioFilename.substring(audioFilename.lastIndexOf(".")).toLowerCase()
			: null;

	for (const fileName of files) {
		const normalized = fileName.replace(/\\/g, "/");
		const baseName = normalized.split("/").pop() ?? "";
		if (!baseName) {
			continue;
		}

		if (audioFilename && baseName === audioFilename) {
			return fileName;
		}

		const lower = baseName.toLowerCase();

		if (
			!audioPathByMetadata &&
			metadataExtension &&
			lower.endsWith(metadataExtension)
		) {
			audioPathByMetadata = fileName;
			continue;
		}

		if (!audioPathByAny && hasAudioExtension(baseName)) {
			audioPathByAny = fileName;
		}
	}

	return audioPathByMetadata ?? audioPathByAny;
}

export function registerTrainingBundleRoute(
	app: Express,
	genId: () => string,
	deps: TrainingBundleRouteDeps = {},
): void {
	app.post(
		"/api/v1/dgs/sample-bundles",
		auth,
		trainingBundleUpload,
		async (req: Request, res: Response) => {
			let metricsProfileId: string | null = null;
			let metricsRecorded = false;
			const recordMetrics = async (update: {
				status: "accepted" | "rejected";
				missingModalities?: ModalityKey[];
				nonManualCoverage?: number | null;
			}) => {
				metricsRecorded = true;
				await recordIngestionMetrics({
					profileId: metricsProfileId,
					...update,
				});
			};
			try {
				if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
					return res.status(400).json({ error: "ZIP payload required" });
				}

				await ensureDataDir();
				await fs.mkdir(TRAINING_UPLOADS_DIR, { recursive: true });

				let zip: AdmZip;
				try {
					zip = new AdmZip(req.body as Buffer);
				} catch (error) {
					console.error("Invalid training bundle ZIP:", error);
					logger.warn("Rejected training bundle: invalid ZIP payload");
					return res.status(400).json({ error: "Invalid training bundle ZIP" });
				}

				let metadataEntry: IZipEntry | null = zip.getEntry("metadata.json");
				if (!metadataEntry) {
					metadataEntry =
						zip
							.getEntries()
							.find(
								(entry) =>
									!entry.isDirectory &&
									entry.entryName
										.replace(/\\/g, "/")
										.endsWith("/metadata.json"),
							) ?? null;
				}
				if (!metadataEntry) {
					logger.warn("Rejected training bundle: metadata.json missing");
					return res
						.status(400)
						.json({ error: "metadata.json missing from bundle" });
				}

				let metadataContent: string;
				try {
					metadataContent = metadataEntry.getData().toString("utf8");
				} catch (error) {
					console.error("Failed to read metadata.json from bundle:", error);
					logger.warn("Rejected training bundle: metadata.json unreadable", {
						error,
					});
					return res
						.status(400)
						.json({ error: "Failed to read metadata.json" });
				}

				let parsedMetadata: z.infer<typeof MetadataSchema>;
				try {
					const metadata = JSON.parse(metadataContent);
					const result = MetadataSchema.safeParse(metadata);
					if (!result.success) {
						logger.warn(
							"Rejected training bundle: metadata.json validation failed",
							{ details: result.error.flatten() },
						);
						return res
							.status(400)
							.json({
								error: "metadata.json validation failed",
								details: result.error.flatten(),
							});
					}
					parsedMetadata = result.data;
				} catch (error) {
					console.error("metadata.json is not valid JSON:", error);
					logger.warn("Rejected training bundle: metadata.json invalid JSON", {
						error,
					});
					return res
						.status(400)
						.json({ error: "metadata.json must be valid JSON" });
				}

				const label = parsedMetadata.label.trim();
				if (!label) {
					return res.status(400).json({ error: "metadata.label is required" });
				}

				const profileIdRaw = isNonEmptyString(parsedMetadata.profileId)
					? parsedMetadata.profileId.trim()
					: undefined;
				if (profileIdRaw && !PROFILE_ID_PATTERN.test(profileIdRaw)) {
					await recordMetrics({ status: "rejected" });
					return res
						.status(400)
						.json({ error: "metadata.profileId ist ungültig." });
				}
				const resolvedProfile = deps.resolveProfileId
					? await deps.resolveProfileId(profileIdRaw ?? null)
					: { profileId: profileIdRaw ?? null };
				const resolvedProfileId = resolvedProfile.profileId ?? null;
				if (profileIdRaw && !resolvedProfileId) {
					await recordMetrics({ status: "rejected" });
					return res.status(404).json({ error: "Profil nicht gefunden." });
				}
				metricsProfileId = resolvedProfileId ?? null;

				const bundleId = genId();
				const profileBucket = resolvedProfileId ?? "unassigned";
				const bundleRoot = path.join(
					TRAINING_UPLOADS_DIR,
					profileBucket,
					bundleId,
				);
				await fs.mkdir(bundleRoot, { recursive: true });

				const bundleZipPath = path.join(bundleRoot, "bundle.zip");
				await atomicWriteBuffer(bundleZipPath, req.body as Buffer);

				const bundleRootResolved = path.resolve(bundleRoot);
				const storedFiles: string[] = [];
				try {
					for (const entry of zip.getEntries()) {
						if (entry.isDirectory) {
							const dirName = sanitizeEntryName(entry.entryName);
							if (!dirName) {
								throw new Error(`Unsafe directory entry: ${entry.entryName}`);
							}
							const targetDir = path.resolve(
								bundleRoot,
								dirName.split("/").join(path.sep),
							);
							if (!isPathInside(targetDir, bundleRootResolved)) {
								throw new Error(`Unsafe directory entry: ${entry.entryName}`);
							}
							await fs.mkdir(targetDir, { recursive: true });
							continue;
						}

						const fileName = sanitizeEntryName(entry.entryName);
						if (!fileName) {
							throw new Error(`Invalid entry name: ${entry.entryName}`);
						}
						const targetPath = path.resolve(
							bundleRoot,
							fileName.split("/").join(path.sep),
						);
						// Prevent overwriting the archived bundle copy stored alongside the extracted files
						if (targetPath === bundleZipPath) {
							throw new Error(`Entry not allowed: ${entry.entryName}`);
						}
						if (!isPathInside(targetPath, bundleRootResolved)) {
							throw new Error(`Unsafe entry path: ${entry.entryName}`);
						}

						await fs.mkdir(path.dirname(targetPath), { recursive: true });
						await fs.writeFile(targetPath, entry.getData());
						storedFiles.push(fileName);
					}
				} catch (error) {
					console.error("Failed to extract training bundle payload:", error);
					await cleanupBundleRoot(bundleRoot);
					return res
						.status(400)
						.json({ error: "Failed to extract training bundle" });
				}

				const clipFilename = normalizeClipFilename(parsedMetadata.clipFilename);
				const stillFilename = normalizeClipFilename(
					parsedMetadata.stillFilename,
				);
				const recordingError = validateRecordingMetadata(
					parsedMetadata.recording,
					clipFilename,
				);
				if (recordingError) {
					await recordMetrics({ status: "rejected" });
					return res.status(400).json({ error: recordingError });
				}

				const variationData = normalizeVariationData(
					parsedMetadata.variationData,
				);
				const sanitizedMetadata: TrainingBundleMetadata = {
					label,
					profileId: resolvedProfileId ?? null,
					capturedAt: normalizeCapturedAt(parsedMetadata.capturedAt),
					source: isNonEmptyString(parsedMetadata.source)
						? parsedMetadata.source
						: null,
					clipFilename,
					stillFilename,
					...(parsedMetadata.recording
						? { recording: parsedMetadata.recording }
						: {}),
					...(parsedMetadata.handFocus
						? { handFocus: parsedMetadata.handFocus }
						: {}),
					...(variationData ? { variationData } : {}),
				};

				const files = Array.from(new Set(storedFiles));

				let landmarksValidation: LandmarksValidationResult;
				try {
					landmarksValidation = await validateLandmarksFile(
						bundleRoot,
						bundleRootResolved,
						files,
					);
				} catch (error: any) {
					console.error("Invalid landmarks.json in training bundle:", error);
					logger.warn("Rejected training bundle: landmarks invalid", {
						profileId: resolvedProfileId ?? null,
						reason: error?.message ?? "unknown",
					});
					await cleanupBundleRoot(bundleRoot);
					await recordMetrics({ status: "rejected" });
					return res.status(400).json({
						error: "landmarks.json missing or invalid",
						...(error?.message ? { details: error.message } : {}),
					});
				}

				const clipRelativePath = findClipRelativePath(files, clipFilename);
				const stillRelativePath = findStillRelativePath(files, stillFilename);
				const audioRelativePath = findAudioRelativePath(
					files,
					parsedMetadata.audioFilename ?? null,
				);

				const mergedModalities = mergeModalities(
					parsedMetadata.modalities ?? landmarksValidation.metadata?.modalities,
					landmarksValidation.computed.modalities,
				);
				const mergedSmoothing = mergeSmoothing(
					parsedMetadata.smoothing ?? landmarksValidation.metadata?.smoothing,
					landmarksValidation.metadata?.smoothing,
				);
				// Smoothing metadata is persisted for transparency; the downstream training pipeline currently does not apply it.
				const mergedHandedness = mergeHandedness(
					parsedMetadata.handedness ?? landmarksValidation.metadata?.handedness,
					landmarksValidation.computed.handedness,
				);

				const metadataWithSummary: TrainingBundleMetadata = {
					...sanitizedMetadata,
					...(mergedModalities ? { modalities: mergedModalities } : {}),
					...(mergedSmoothing ? { smoothing: mergedSmoothing } : {}),
					...(mergedHandedness ? { handedness: mergedHandedness } : {}),
					validationSummary: {
						frameCount: landmarksValidation.frameCount,
						landmarksPath: landmarksValidation.relativePath,
					},
				};

				const manifestEntry: TrainingBundleManifestEntry = {
					id: bundleId,
					profileId: resolvedProfileId ?? null,
					label,
					capturedAt: sanitizedMetadata.capturedAt,
					source: sanitizedMetadata.source,
					storage: {
						directory: path.relative(DATA_DIR, bundleRoot),
						bundle: path.relative(DATA_DIR, bundleZipPath),
						files,
						...(clipRelativePath ? { clip: clipRelativePath } : {}),
						...(stillRelativePath ? { still: stillRelativePath } : {}),
						...(audioRelativePath ? { audio: audioRelativePath } : {}),
					},
					metadata: metadataWithSummary,
					receivedAt: new Date().toISOString(),
				};

				await withFileLock(TRAINING_MANIFEST_PATH, async () => {
					await fs.mkdir(TRAINING_DATASETS_DIR, { recursive: true });

					const manifest: TrainingBundleManifestFile = { entries: [] };
					try {
						const raw = await fs.readFile(TRAINING_MANIFEST_PATH, "utf8");
						const parsed = JSON.parse(raw);
						if (
							!parsed ||
							typeof parsed !== "object" ||
							!Array.isArray((parsed as any).entries)
						) {
							throw new Error(
								"Training manifest file is corrupted and would be overwritten.",
							);
						}
						manifest.entries = (parsed as TrainingBundleManifestFile).entries;
					} catch (error: any) {
						if (error?.code !== "ENOENT") throw error;
					}

					manifest.entries.push(manifestEntry);
					await atomicWriteJson(TRAINING_MANIFEST_PATH, manifest);
				});

				// Analytics: Log missing modalities for monitoring data quality
				const missingModalities = MODALITY_KEYS.filter((modality) => {
					const isMissing = !mergedModalities[modality].present;
					if (isMissing && modality === "hands") {
						logger.warn("Training bundle missing required hand landmarks", {
							bundleId,
							profileId: resolvedProfileId ?? null,
							coverage: mergedModalities,
						});
					}
					return isMissing;
				});

				if (missingModalities.length > 0) {
					logger.info("Training bundle with incomplete multimodal data", {
						bundleId,
						profileId: resolvedProfileId ?? null,
						missingModalities,
						coverage: {
							hands: mergedModalities.hands.coverage,
							pose: mergedModalities.pose.coverage,
							face: mergedModalities.face.coverage,
						},
					});
				}

				logger.info("Training bundle stored", {
					bundleId,
					profileId: resolvedProfileId ?? null,
					frameCount: landmarksValidation.frameCount,
					modalities: mergedModalities,
				});

				await recordMetrics({
					status: "accepted",
					missingModalities,
					nonManualCoverage: mergedModalities.nonManual.coverage,
				});

				let trainingJob: TriggerTrainingJobResult | null = null;
				if (deps.triggerTrainingJob) {
					try {
						const maybe = deps.triggerTrainingJob({
							bundleId,
							profileId: resolvedProfileId ?? null,
							label,
						});
						if (maybe && typeof maybe === "object") {
							const result = TriggerTrainingJobResultSchema.safeParse(maybe);
							if (result.success) {
								trainingJob = result.data;
							}
						}
					} catch (error) {
						console.error(
							"Error scheduling training after bundle upload:",
							error,
						);
					}
				}

				res.status(202).json({ status: "queued", id: bundleId, trainingJob });
			} catch (error) {
				logger.error("Error saving training bundle", { error });
				if (metricsProfileId && !metricsRecorded) {
					await recordMetrics({ status: "rejected" });
				}
				res.status(500).json({ error: "Failed to save training bundle" });
			}
		},
	);
}
