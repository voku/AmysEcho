import { z } from "zod";

const NonEmptyString = z.string().trim().min(1);

const RecordingSchema = z.object({
	frameCount: z.number().int().nonnegative().optional(),
	usableFrameCount: z.number().int().nonnegative().optional(),
	clipDurationMs: z.number().int().nonnegative().optional(),
	clipBytes: z.number().int().nonnegative().optional(),
	clipMimeType: z.string().optional(),
	stillBytes: z.number().int().nonnegative().optional(),
	stillMimeType: z.string().optional(),
	previewMirrored: z.boolean().optional(),
}).strict();

const ValidationSummarySchema = z.object({
	frameCount: z.number().int().nonnegative().optional(),
	landmarksPath: z.string().optional(),
	issues: z.array(z.string()).optional(),
	suggestions: z.array(z.string()).optional(),
	qualityScore: z.number().optional(),
	confidence: z.number().optional(),
}).strict();

const HandFocusSchema = z.enum([
	"dominant_only",
	"both_equal",
	"both_asymmetric",
	"either_hand",
]);

const ModalityStatsSchema = z.object({
	present: z.boolean().optional(),
	frameCount: z.number().nonnegative().optional(),
	coverage: z.number().optional(),
}).strict();

const ModalitiesSchema = z.object({
	hands: ModalityStatsSchema.optional(),
	pose: ModalityStatsSchema.optional(),
	face: ModalityStatsSchema.optional(),
	nonManual: ModalityStatsSchema.optional(),
}).strict();

const SmoothingSchema = z.object({
	method: z.string().optional(),
	minCutOff: z.number().optional(),
	beta: z.number().optional(),
	dCutOff: z.number().optional(),
}).strict();

const HandednessSchema = z.object({
	labels: z.array(z.string()).optional(),
	frameCount: z.number().nonnegative().optional(),
}).strict();

const VariationDataSchema = z.object({
	clusterId: z.string().optional(),
	dominantCluster: z.string().optional(),
	variationDiversity: z.number().optional(),
	canonicalTemplates: z.number().optional(),
}).strict();

const CaptureContextSchema = z.object({
	signer: z.object({
		signerId: z.string().optional(),
		dominantHand: z.enum(["left", "right", "both", "unknown"]).optional(),
		ageGroup: z.enum(["child", "teen", "adult", "unknown"]).optional(),
	}).strict().optional(),
	device: z.object({
		deviceModel: z.string().optional(),
		platform: z.string().optional(),
		osVersion: z.string().optional(),
		appVersion: z.string().optional(),
	}).strict().optional(),
	camera: z.object({
		facingMode: z.enum(["user", "environment", "left", "right", "unknown"]).optional(),
		width: z.number().optional(),
		height: z.number().optional(),
		fps: z.number().optional(),
	}).strict().optional(),
	lighting: z.object({
		condition: z.enum(["low", "mixed", "bright", "backlit", "unknown"]).optional(),
		confidence: z.number().optional(),
		source: z.enum(["manual", "auto", "unknown"]).optional(),
	}).strict().optional(),
}).strict();

const MetadataSchema = z.object({
	label: NonEmptyString.optional(),
	profileId: z.string().nullable().optional(),
	symbolId: NonEmptyString.optional(),
	source: z.string().nullable().optional(),
	capturedAt: z.string().nullable().optional(),
	clipFilename: NonEmptyString.nullable().optional(),
	stillFilename: NonEmptyString.nullable().optional(),
	modalities: ModalitiesSchema.optional(),
	smoothing: SmoothingSchema.optional(),
	handedness: HandednessSchema.optional(),
	validationSummary: ValidationSummarySchema.optional(),
	handFocus: HandFocusSchema.optional(),
	augmentation: z.object({ mirrorSafe: z.boolean().optional() }).strict().optional(),
	variationData: VariationDataSchema.optional(),
	captureContext: CaptureContextSchema.optional(),
	recording: RecordingSchema.optional(),
	featureContract: z.object({ version: z.string().optional() }).strict().optional(),
}).strict();

const StorageSchema = z.object({
	directory: NonEmptyString,
	bundle: NonEmptyString.optional(),
	files: z.array(NonEmptyString).min(1),
	clip: NonEmptyString.optional(),
	still: NonEmptyString.optional(),
}).strict();

export const TrainingManifestEntrySchema = z.object({
	id: NonEmptyString.optional(),
	profileId: z.string().nullable().optional(),
	label: NonEmptyString,
	symbolId: NonEmptyString.optional(),
	capturedAt: z.string().nullable().optional(),
	source: z.string().nullable().optional(),
	storage: StorageSchema,
	receivedAt: NonEmptyString.optional(),
	metadata: MetadataSchema.optional(),
}).strict();

export type TrainingManifestEntry = z.infer<typeof TrainingManifestEntrySchema>;

export const TrainingManifestSchema = z.object({
	version: NonEmptyString.optional(),
	generatedAt: NonEmptyString.optional(),
	jobId: NonEmptyString.optional(),
	entries: z.array(TrainingManifestEntrySchema),
}).strict();

export type TrainingManifest = z.infer<typeof TrainingManifestSchema>;

export function parseTrainingManifest(raw: unknown): TrainingManifest {
	return TrainingManifestSchema.parse(raw);
}

export function parseTrainingManifestEntry(raw: unknown): TrainingManifestEntry {
	return TrainingManifestEntrySchema.parse(raw);
}
