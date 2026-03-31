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

const MetadataSchema = z.object({
	label: z.string().optional(),
	profileId: z.string().nullable().optional(),
	symbolId: z.string().optional(),
	source: z.string().nullable().optional(),
	capturedAt: z.string().nullable().optional(),
	clipFilename: z.string().optional(),
	stillFilename: z.string().optional(),
	modalities: z.object({
		hands: z.unknown().optional(),
		pose: z.unknown().optional(),
		face: z.unknown().optional(),
		nonManual: z.unknown().optional(),
	}).strict().optional(),
	smoothing: z.object({
		method: z.string().optional(),
		minCutOff: z.number().optional(),
		beta: z.number().optional(),
		dCutOff: z.number().optional(),
	}).strict().optional(),
	handedness: z.object({
		labels: z.array(z.string()).optional(),
		frameCount: z.number().optional(),
	}).strict().optional(),
	validationSummary: ValidationSummarySchema.optional(),
	handFocus: HandFocusSchema.optional(),
	augmentation: z.object({ mirrorSafe: z.boolean().optional() }).strict().optional(),
	variationData: z.object({
		clusterId: z.string().optional(),
		dominantCluster: z.string().optional(),
		variationDiversity: z.number().optional(),
		canonicalTemplates: z.number().optional(),
	}).strict().optional(),
	recording: RecordingSchema.optional(),
	featureContract: z.object({ version: z.string().optional() }).strict().optional(),
}).strict();

const StorageSchema = z.object({
	directory: NonEmptyString,
	bundle: z.string().optional(),
	files: z.array(NonEmptyString),
	clip: z.string().optional(),
	still: z.string().optional(),
}).strict();

export const TrainingManifestEntrySchema = z.object({
	id: z.string().optional(),
	profileId: z.string().nullable().optional(),
	label: NonEmptyString,
	symbolId: NonEmptyString.optional(),
	capturedAt: z.string().nullable().optional(),
	source: z.string().nullable().optional(),
	storage: StorageSchema,
	receivedAt: z.string().optional(),
	metadata: MetadataSchema.optional(),
}).strict();

export type TrainingManifestEntry = z.infer<typeof TrainingManifestEntrySchema>;

export const TrainingManifestSchema = z.object({
	version: z.string().optional(),
	generatedAt: z.string().optional(),
	jobId: z.string().optional(),
	entries: z.array(TrainingManifestEntrySchema),
}).strict();

export type TrainingManifest = z.infer<typeof TrainingManifestSchema>;

export function parseTrainingManifest(raw: unknown): TrainingManifest {
	return TrainingManifestSchema.parse(raw);
}

export function parseTrainingManifestEntry(raw: unknown): TrainingManifestEntry {
	return TrainingManifestEntrySchema.parse(raw);
}
