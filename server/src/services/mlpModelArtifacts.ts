import { spawn } from "child_process";
import { createHash } from "crypto";
import type { Response } from "express";
import type { Stats } from "fs";
import * as fsSync from "fs";
import { promises as fs } from "fs";
import path from "path";
import {
	FEATURE_SCHEMA,
	WINDOW_FEATURE_SIZE,
	WINDOW_SIZE,
} from "../constants/featureSchema.js";
import {
	HAND_FEATURE_CONTRACT_VERSION,
	HAND_FEATURE_COORDINATES_PER_POINT,
	HAND_FEATURE_HAND_ORDER,
	HAND_FEATURE_MISSING_HAND_STRATEGY,
	HAND_FEATURE_NORMALIZATION,
	HAND_FEATURE_POINTS_PER_HAND,
	HAND_FEATURE_VECTOR_LENGTH,
} from "../constants/landmarkFeatureContract.js";
import {
	BASELINE_MLP_MODEL_PATH,
	MLP_MODELS_DIR,
	SERVER_DIR,
	SRC_DIR,
} from "../constants/modelPaths.js";
import { resolvePythonExecutable, withProjectPythonPath } from "../utils/pythonExecutable.js";

export const DEFAULT_MLP_INPUT_SIZE = WINDOW_FEATURE_SIZE;
export const DEFAULT_MLP_WINDOW_SIZE = WINDOW_SIZE;
export const DEFAULT_MLP_FEATURE_SIZE = WINDOW_FEATURE_SIZE / WINDOW_SIZE;
export const DEFAULT_MLP_LAYER1_SIZE = 512;
export const DEFAULT_MLP_LAYER2_SIZE = 256;
const FALLBACK_BASELINE_LABELS = [
	"alle",
	"blau",
	"essen",
	"fertig",
	"gelb",
	"gruen",
	"nochmal",
	"rot",
	"satt",
	"schwester",
	"spielen",
	"trinken",
] as const;

function loadDefaultBaselineLabels(): readonly string[] {
	const defaultPath = path.join(
		SERVER_DIR,
		"data",
		"config",
		"defaultBaselineLabels.json",
	);
	try {
		const raw = fsSync.readFileSync(defaultPath, "utf8");
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			if (parsed.every((item) => typeof item === "string")) {
				return Object.freeze(parsed.map((label) => String(label)));
			}

			console.warn(
				`Invalid structure in ${defaultPath}; expected array of strings. Falling back to hard-coded values.`,
			);
		}
	} catch (error) {
		// ignore and fall back to hard-coded defaults

		console.warn(
			`Failed to load default baseline labels from ${defaultPath}; falling back to hard-coded values.`,
			error,
		);
	}
	return Object.freeze([...FALLBACK_BASELINE_LABELS]);
}

export const DEFAULT_BASELINE_LABELS = loadDefaultBaselineLabels();

export type BaselineSeedMessages = {
	success: (dest: string) => string;
	failure: (dest: string, error: unknown) => string;
};

const SERVER_MODULE_DIR = SRC_DIR;
// Ensure bundlers include the helper script by referencing it relative to the source tree.
const ZERO_MODEL_SCRIPT_PATH = path.join(
	SERVER_MODULE_DIR,
	"amyserver_tools",
	"generate_zero_model.py",
);
const CDN_CACHE_MAX_AGE_SECONDS = 3600; // 1 hour
const REQUIRE_BASELINE_ARTIFACT = ["1", "true", "yes"].includes(
	(
		process.env.MLP_REQUIRE_BASELINE ??
		(process.env.NODE_ENV === "production" ? "1" : "0")
	).toLowerCase(),
);
const EXPECTED_BASELINE_SHA = (
	process.env.MLP_BASELINE_SHA256 ?? ""
).toLowerCase();
const TRAINING_METADATA_FILENAME = "training_metadata.json";
const MODALITY_KEYS = ["hands", "pose", "face"] as const;
type ModalityKey = (typeof MODALITY_KEYS)[number];

function requiresValidModelContract(): boolean {
	return ["1", "true", "yes"].includes(
		(
			process.env.MLP_REQUIRE_VALID_CONTRACT ??
			(process.env.NODE_ENV === "production" ? "1" : "0")
		).toLowerCase(),
	);
}

async function assertBaselineIntegrity(): Promise<void> {
	if (!EXPECTED_BASELINE_SHA) {
		return;
	}
	const buffer = await fs.readFile(BASELINE_MLP_MODEL_PATH);
	const sha = createHash("sha256").update(buffer).digest("hex");
	if (sha.toLowerCase() !== EXPECTED_BASELINE_SHA) {
		throw new Error(
			`Baseline-MLP SHA256 stimmt nicht: erwartet ${EXPECTED_BASELINE_SHA}, erhalten ${sha}`,
		);
	}
}

async function ensureBaselinePresent(): Promise<boolean> {
	const exists = await fs
		.stat(BASELINE_MLP_MODEL_PATH)
		.then(() => true)
		.catch((error: NodeJS.ErrnoException) => {
			if (error?.code === "ENOENT") {
				return false;
			}
			throw error;
		});

	if (!exists && REQUIRE_BASELINE_ARTIFACT) {
		throw new Error(
			`Demo-MLP fehlt unter ${BASELINE_MLP_MODEL_PATH}. Stelle das geprüfte Artefakt bereit oder setze MLP_REQUIRE_BASELINE=0 für Entwicklungszwecke.`,
		);
	}

	if (exists) {
		await assertBaselineIntegrity();
	}

	return exists;
}

export async function seedBaselineModel(
	filePath: string,
	messages: BaselineSeedMessages,
	logTraining: (message: string) => Promise<void>,
): Promise<boolean> {
	try {
		const baselineAvailable = await ensureBaselinePresent();
		if (!baselineAvailable) {
			await logTraining(
				messages.failure(
					filePath,
					new Error(`Demo-MLP fehlt unter ${BASELINE_MLP_MODEL_PATH}`),
				),
			);
			return false;
		}
		if (path.resolve(filePath) === path.resolve(BASELINE_MLP_MODEL_PATH)) {
			await logTraining(messages.success(filePath));
			return true;
		}
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.copyFile(BASELINE_MLP_MODEL_PATH, filePath);
		await fs.chmod(filePath, 0o640);
		await logTraining(messages.success(filePath));
		return true;
	} catch (error) {
		await logTraining(messages.failure(filePath, error));
		return false;
	}
}

async function writeZeroInitializedModel(
	filePath: string,
	labels: readonly string[],
	counts: readonly number[],
	logTraining?: (message: string) => Promise<void>,
): Promise<number> {
	const effectiveLabels = (
		labels.length > 0 ? labels : DEFAULT_BASELINE_LABELS
	).map((label) => String(label));
	const effectiveCounts = effectiveLabels.map((_, index) => {
		const value = Number(counts[index]) || 0;
		return value < 0 ? 0 : value;
	});
	const payload = JSON.stringify({
		labels: effectiveLabels,
		counts: effectiveCounts,
		inputSize: DEFAULT_MLP_INPUT_SIZE,
		windowSize: DEFAULT_MLP_WINDOW_SIZE,
		featureSize: DEFAULT_MLP_FEATURE_SIZE,
		layer1Size: DEFAULT_MLP_LAYER1_SIZE,
		layer2Size: DEFAULT_MLP_LAYER2_SIZE,
	});
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await new Promise<void>((resolve, reject) => {
		const proc = spawn(resolvePythonExecutable(), [ZERO_MODEL_SCRIPT_PATH, filePath], {
			cwd: path.join(SERVER_MODULE_DIR, ".."),
			stdio: ["pipe", "ignore", "pipe"],
			env: withProjectPythonPath(),
		});
		let stderr = "";
		proc.stderr.on("data", (data) => {
			stderr += data.toString();
		});
		proc.stdin.on("error", (error) => {
			reject(error);
		});
		proc.on("error", (error) => {
			reject(error);
		});
		proc.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				const trimmed = stderr.trim();
				if (trimmed && logTraining) {
					logTraining(`(Warnung) Python-Helfer meldete: ${trimmed}`).catch(
						() => {},
					);
				}
				reject(new Error(trimmed || `python exited with ${code}`));
			}
		});
		proc.stdin.end(payload);
	});

	return effectiveLabels.length;
}

export async function writeMinimalMlpModel(
	filePath: string,
	gestureCounts: Record<string, number>,
	logTraining: (message: string) => Promise<void>,
): Promise<void> {
	const hasCounts = Object.values(gestureCounts).some(
		(count) => (Number(count) || 0) > 0,
	);

	if (!hasCounts) {
		if (REQUIRE_BASELINE_ARTIFACT) {
			throw new Error(
				`Keine Trainingsdaten für ${filePath}; persönliches Modell wird nicht aus dem globalen Demo-Modell kopiert.`,
			);
		}

		await logTraining(
			`Keine Trainingsdaten für ${filePath}; erstelle neutrales Entwicklungsmodell (Labels=${DEFAULT_BASELINE_LABELS.length})`,
		);
		const labelCount = await writeZeroInitializedModel(
			filePath,
			DEFAULT_BASELINE_LABELS,
			DEFAULT_BASELINE_LABELS.map(() => 0),
			logTraining,
		);
		await logTraining(
			`Neutraler MLP-Fallback nach ${filePath} geschrieben (${labelCount} Labels)`,
		);
	} else {
		const entries = Object.entries(gestureCounts).map(
			([label, count]) => [label, Number(count) || 0] as const,
		);
		const entryLabels = entries.map(([label]) => label);
		const entryCounts = entries.map(([, count]) => count);
		const labelCount = await writeZeroInitializedModel(
			filePath,
			entryLabels,
			entryCounts,
			logTraining,
		);

		await logTraining(
			`wrote minimal MLP model to ${filePath} (${labelCount} labels)`,
		);
	}

	try {
		await fs.chmod(filePath, 0o640);
	} catch (error) {
		await logTraining(
			`(Warnung) Konnte Rechte für ${filePath} nicht setzen: ${String(error)}`,
		);
	}
}

type TrainingMetadata = {
	version?: string;
	labels?: string[];
	modalities?: ModalityKey[];
	modalityCounts?: Partial<Record<ModalityKey, number>>;
	configSnapshot?: {
		epochs?: number;
		learningRate?: number;
		dropoutRate?: number;
	};
	artifactContract?: {
		featureSchemaVersion?: number;
		featureContractVersion?: string;
		handFeatureNormalization?: string;
		handFeatureHandOrder?: string[];
		handFeatureMissingHandStrategy?: string;
		handFeaturePointsPerHand?: number;
		handFeatureCoordinatesPerPoint?: number;
		handFeatureVectorLength?: number;
		windowSize?: number;
		frameFeatureSize?: number;
		windowFeatureSize?: number;
		labelCount?: number;
		featureMode?: "absolute" | "relative_delta" | "unsupported";
	};
};

function normalizeModalityCounts(
	raw: unknown,
): Partial<Record<ModalityKey, number>> | null {
	if (!raw || typeof raw !== "object") {
		return null;
	}
	const record = raw as Record<string, unknown>;
	const counts: Partial<Record<ModalityKey, number>> = {};
	for (const key of MODALITY_KEYS) {
		const value = record[key];
		if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
			counts[key] = value;
		}
	}
	return Object.keys(counts).length > 0 ? counts : null;
}

type TrainingConfigSnapshot = {
	epochs?: number;
	learning_rate?: number;
	dropout_rate?: number;
};

type ArtifactContractSnapshot = {
	feature_schema_version?: number;
	feature_contract_version?: string;
	hand_feature_normalization?: string;
	hand_feature_hand_order?: string[];
	hand_feature_missing_hand_strategy?: string;
	hand_feature_points_per_hand?: number;
	hand_feature_coordinates_per_point?: number;
	hand_feature_vector_length?: number;
	window_size?: number;
	frame_feature_size?: number;
	window_feature_size?: number;
	label_count?: number;
	feature_mode?: string;
};

function allowsRelativeFeatureMode(): boolean {
	return ["1", "true", "yes"].includes(
		(
			process.env.MLP_ALLOW_RELATIVE_FEATURE_MODE ??
			(process.env.NODE_ENV === "production" ? "0" : "1")
		).toLowerCase(),
	);
}

function normalizeFiniteNumber(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return undefined;
	}
	return value;
}

function normalizeTrainingConfigSnapshot(
	raw: unknown,
): TrainingMetadata["configSnapshot"] | null {
	if (!raw || typeof raw !== "object") {
		return null;
	}
	const record = raw as TrainingConfigSnapshot;
	const epochs = normalizeFiniteNumber(record.epochs);
	const learningRate = normalizeFiniteNumber(record.learning_rate);
	const dropoutRate = normalizeFiniteNumber(record.dropout_rate);
	if (
		typeof epochs === "undefined" &&
		typeof learningRate === "undefined" &&
		typeof dropoutRate === "undefined"
	) {
		return null;
	}
	return {
		epochs,
		learningRate,
		dropoutRate,
	};
}

function normalizeArtifactContract(
	raw: unknown,
): TrainingMetadata["artifactContract"] | null {
	if (!raw || typeof raw !== "object") {
		return null;
	}
	const record = raw as ArtifactContractSnapshot;
	const featureSchemaVersion = normalizeFiniteNumber(
		record.feature_schema_version,
	);
	const featureContractVersion =
		typeof record.feature_contract_version === "string"
			? record.feature_contract_version
			: undefined;
	const handFeatureNormalization =
		typeof record.hand_feature_normalization === "string"
			? record.hand_feature_normalization
			: undefined;
	const handFeatureHandOrder = Array.isArray(record.hand_feature_hand_order)
		? record.hand_feature_hand_order.filter(
				(entry): entry is string => typeof entry === "string",
			)
		: undefined;
	const handFeatureMissingHandStrategy =
		typeof record.hand_feature_missing_hand_strategy === "string"
			? record.hand_feature_missing_hand_strategy
			: undefined;
	const handFeaturePointsPerHand = normalizeFiniteNumber(
		record.hand_feature_points_per_hand,
	);
	const handFeatureCoordinatesPerPoint = normalizeFiniteNumber(
		record.hand_feature_coordinates_per_point,
	);
	const handFeatureVectorLength = normalizeFiniteNumber(
		record.hand_feature_vector_length,
	);
	const windowSize = normalizeFiniteNumber(record.window_size);
	const frameFeatureSize = normalizeFiniteNumber(record.frame_feature_size);
	const windowFeatureSize = normalizeFiniteNumber(record.window_feature_size);
	const labelCount = normalizeFiniteNumber(record.label_count);
	const featureMode =
		typeof record.feature_mode === "undefined"
			? undefined
			: record.feature_mode === "absolute" || record.feature_mode === "relative_delta"
				? record.feature_mode
				: "unsupported";
	if (
		typeof featureSchemaVersion === "undefined" &&
		typeof featureContractVersion === "undefined" &&
		typeof handFeatureNormalization === "undefined" &&
		typeof handFeatureHandOrder === "undefined" &&
		typeof handFeatureMissingHandStrategy === "undefined" &&
		typeof handFeaturePointsPerHand === "undefined" &&
		typeof handFeatureCoordinatesPerPoint === "undefined" &&
		typeof handFeatureVectorLength === "undefined" &&
		typeof windowSize === "undefined" &&
		typeof frameFeatureSize === "undefined" &&
		typeof windowFeatureSize === "undefined" &&
		typeof labelCount === "undefined" &&
		typeof featureMode === "undefined"
	) {
		return null;
	}
	return {
		featureSchemaVersion,
		featureContractVersion,
		handFeatureNormalization,
		handFeatureHandOrder,
		handFeatureMissingHandStrategy,
		handFeaturePointsPerHand,
		handFeatureCoordinatesPerPoint,
		handFeatureVectorLength,
		windowSize,
		frameFeatureSize,
		windowFeatureSize,
		labelCount,
		featureMode,
	};
}

type ContractStatus = "missing" | "invalid" | "valid";

function evaluateArtifactContract(
	contract: TrainingMetadata["artifactContract"] | undefined,
	labels: string[] | undefined,
): { status: ContractStatus; reason?: string } {
	if (!contract) {
		return { status: "missing" };
	}
	if (
		typeof contract.featureSchemaVersion !== "number" ||
		typeof contract.windowSize !== "number" ||
		typeof contract.frameFeatureSize !== "number" ||
		typeof contract.windowFeatureSize !== "number"
	) {
		return { status: "invalid", reason: "incomplete_contract" };
	}
	if (contract.featureSchemaVersion !== FEATURE_SCHEMA.version) {
		return { status: "invalid", reason: "schema_version_mismatch" };
	}
	if (
		typeof contract.featureContractVersion !== "undefined" &&
		contract.featureContractVersion !== HAND_FEATURE_CONTRACT_VERSION
	) {
		return { status: "invalid", reason: "feature_contract_version_mismatch" };
	}
	if (
		typeof contract.handFeatureNormalization !== "undefined" &&
		contract.handFeatureNormalization !== HAND_FEATURE_NORMALIZATION
	) {
		return { status: "invalid", reason: "feature_normalization_mismatch" };
	}
	if (
		typeof contract.handFeatureMissingHandStrategy !== "undefined" &&
		contract.handFeatureMissingHandStrategy !== HAND_FEATURE_MISSING_HAND_STRATEGY
	) {
		return { status: "invalid", reason: "missing_hand_strategy_mismatch" };
	}
	if (
		typeof contract.handFeaturePointsPerHand !== "undefined" &&
		contract.handFeaturePointsPerHand !== HAND_FEATURE_POINTS_PER_HAND
	) {
		return { status: "invalid", reason: "points_per_hand_mismatch" };
	}
	if (
		typeof contract.handFeatureCoordinatesPerPoint !== "undefined" &&
		contract.handFeatureCoordinatesPerPoint !== HAND_FEATURE_COORDINATES_PER_POINT
	) {
		return { status: "invalid", reason: "coordinates_per_point_mismatch" };
	}
	if (
		typeof contract.handFeatureVectorLength !== "undefined" &&
		contract.handFeatureVectorLength !== HAND_FEATURE_VECTOR_LENGTH
	) {
		return { status: "invalid", reason: "hand_vector_length_mismatch" };
	}
	if (
		Array.isArray(contract.handFeatureHandOrder) &&
		contract.handFeatureHandOrder.join(",") !== HAND_FEATURE_HAND_ORDER.join(",")
	) {
		return { status: "invalid", reason: "hand_order_mismatch" };
	}
	if (contract.windowSize !== WINDOW_SIZE) {
		return { status: "invalid", reason: "window_size_mismatch" };
	}
	if (contract.frameFeatureSize !== DEFAULT_MLP_FEATURE_SIZE) {
		return { status: "invalid", reason: "frame_feature_size_mismatch" };
	}
	if (contract.windowFeatureSize !== WINDOW_FEATURE_SIZE) {
		return { status: "invalid", reason: "window_feature_size_mismatch" };
	}
	if (
		typeof contract.labelCount === "number" &&
		(!Number.isInteger(contract.labelCount) || contract.labelCount < 1)
	) {
		return { status: "invalid", reason: "invalid_label_count" };
	}
	if (
		typeof contract.labelCount === "number" &&
		!Array.isArray(labels)
	) {
		return { status: "invalid", reason: "missing_labels" };
	}
	if (
		typeof contract.labelCount === "number" &&
		Array.isArray(labels) &&
		contract.labelCount !== labels.length
	) {
		return { status: "invalid", reason: "label_count_mismatch" };
	}
	if (Array.isArray(labels) && new Set(labels).size !== labels.length) {
		return { status: "invalid", reason: "duplicate_labels" };
	}
	const featureMode = contract.featureMode;
	if (typeof featureMode === "undefined") {
		return { status: "invalid", reason: "missing_feature_mode" };
	}
	if (featureMode === "unsupported") {
		return { status: "invalid", reason: "unsupported_feature_mode" };
	}
	if (featureMode === "relative_delta" && !allowsRelativeFeatureMode()) {
		return { status: "invalid", reason: "relative_feature_mode_disabled" };
	}
	return { status: "valid" };
}

function readTrainingMetadata(filePath: string): TrainingMetadata | null {
	const metadataPath = path.join(
		path.dirname(filePath),
		TRAINING_METADATA_FILENAME,
	);
	try {
		const raw = fsSync.readFileSync(metadataPath, "utf8");
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		const version =
			typeof parsed.version === "string" ? parsed.version : undefined;
		const modalities = Array.isArray(parsed.modalities)
			? parsed.modalities.filter((entry): entry is ModalityKey =>
					MODALITY_KEYS.includes(entry as ModalityKey),
				)
			: undefined;
		const rawLabels = parsed.labels;
		const labels = Array.isArray(rawLabels)
			? rawLabels
					.filter((entry): entry is string => typeof entry === "string")
					.map((entry) => entry.trim())
					.filter((entry) => entry.length > 0)
			: undefined;
		const modalityCounts =
			normalizeModalityCounts(parsed.modality_counts) ?? undefined;
		const configSnapshot =
			normalizeTrainingConfigSnapshot(parsed.config_snapshot) ?? undefined;
		const artifactContract =
			normalizeArtifactContract(parsed.artifact_contract) ?? undefined;
		if (
			!version &&
			(!labels || labels.length === 0) &&
			(!modalities || modalities.length === 0) &&
			!modalityCounts &&
			!configSnapshot &&
			!artifactContract
		) {
			return null;
		}
		return {
			version,
			labels,
			modalities,
			modalityCounts,
			configSnapshot,
			artifactContract,
		};
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
			return null;
		}
		if (process.env.NODE_ENV !== "production") {
			console.warn(
				`[mlpModelArtifacts] Failed to read training metadata at ${metadataPath}:`,
				error,
			);
		}
		return null;
	}
}

function formatModalities(
	modalities: Partial<Record<ModalityKey, number>> | null,
): string | null {
	if (!modalities) {
		return null;
	}
	const entries = MODALITY_KEYS.map(
		(key) => [key, modalities[key]] as const,
	).filter(
		(pair): pair is [ModalityKey, number] =>
			typeof pair[1] === "number" && pair[1] > 0,
	);
	if (entries.length === 0) {
		return null;
	}
	return entries.map(([key]) => key).join(",");
}

function formatModalityCounts(
	modalities: Partial<Record<ModalityKey, number>> | null,
): string | null {
	if (!modalities) {
		return null;
	}
	const entries = MODALITY_KEYS.map(
		(key) => [key, modalities[key]] as const,
	).filter(
		(pair): pair is [ModalityKey, number] => typeof pair[1] === "number",
	);
	if (entries.length === 0) {
		return null;
	}
	return JSON.stringify(Object.fromEntries(entries));
}

export type ModelResponseMetadata = {
	stat: Stats;
	sha256: string;
	etag: string;
};

export type PrecomputedModelPayload = ModelResponseMetadata & {
	buffer?: Buffer;
};

function buildModelResponseMetadata(
	stat: Stats,
	buffer: Buffer,
): PrecomputedModelPayload {
	const sha256 = createHash("sha256").update(buffer).digest("hex");
	return {
		stat,
		sha256,
		etag: `"sha256-${sha256}"`,
		buffer,
	};
}

async function loadModelPayload(
	filePath: string,
): Promise<PrecomputedModelPayload> {
	const stat = await fs.stat(filePath);
	const buffer = await fs.readFile(filePath);
	return buildModelResponseMetadata(stat, buffer);
}

export function applyModelResponseHeaders(
	res: Response,
	filePath: string,
	downloadName: string,
	metadata: ModelResponseMetadata,
): void {
	res.setHeader("Accept-Ranges", "bytes");
	const modelsDirResolved = path.resolve(MLP_MODELS_DIR);
	const relDir = path.relative(modelsDirResolved, path.dirname(filePath));
	const firstSegment = relDir.split(path.sep)[0];
	const isProfileSpecific =
		!!firstSegment && firstSegment !== "global" && firstSegment !== ".";
	const profileId = isProfileSpecific ? firstSegment : null;
	if (isProfileSpecific) {
		res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
		res.removeHeader("CDN-Cache-Control");
	} else {
		res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
		res.setHeader("CDN-Cache-Control", `max-age=${CDN_CACHE_MAX_AGE_SECONDS}`);
	}
	res.setHeader("Content-Type", "application/octet-stream");
	res.setHeader("X-Resolved-Path", filePath);
	res.setHeader("ETag", metadata.etag);
	res.setHeader("X-Checksum-SHA256", metadata.sha256);
	res.setHeader("X-Model-Version", String(Math.floor(metadata.stat.mtimeMs)));
	res.setHeader("X-Model-Source", profileId ? "profile" : "global");
	res.setHeader("X-Feature-Schema-Version", String(FEATURE_SCHEMA.version));
	res.setHeader("X-Model-Window-Size", String(WINDOW_SIZE));
	res.setHeader("X-Model-Window-Feature-Size", String(WINDOW_FEATURE_SIZE));
	res.setHeader("X-Model-Frame-Feature-Size", String(DEFAULT_MLP_FEATURE_SIZE));
	if (profileId) {
		res.setHeader("X-Model-Profile", profileId);
	}
	const trainingMetadata = readTrainingMetadata(filePath);
	const contractEvaluation = evaluateArtifactContract(
		trainingMetadata?.artifactContract,
		trainingMetadata?.labels,
	);
	res.setHeader("X-Model-Contract-Status", contractEvaluation.status);
	if (contractEvaluation.reason) {
		res.setHeader("X-Model-Contract-Reason", contractEvaluation.reason);
	}
	if (
		(contractEvaluation.status === "invalid" ||
			contractEvaluation.status === "missing") &&
		requiresValidModelContract()
	) {
		throw new Error(
			`Ungültiger Modellvertrag: ${contractEvaluation.reason ?? contractEvaluation.status}`,
		);
	}
	if (trainingMetadata) {
		if (trainingMetadata.version) {
			res.setHeader("X-Training-Version", trainingMetadata.version);
		}
		const modalitiesHeader =
			trainingMetadata.modalities && trainingMetadata.modalities.length > 0
				? trainingMetadata.modalities.join(",")
				: formatModalities(trainingMetadata.modalityCounts ?? null);
		if (modalitiesHeader) {
			res.setHeader("X-Training-Modalities", modalitiesHeader);
		}
		const modalityCountsHeader = formatModalityCounts(
			trainingMetadata.modalityCounts ?? null,
		);
		if (modalityCountsHeader) {
			res.setHeader("X-Training-Modalities-Counts", modalityCountsHeader);
		}
		if (trainingMetadata.configSnapshot) {
			const { epochs, learningRate, dropoutRate } =
				trainingMetadata.configSnapshot;
			if (typeof epochs !== "undefined") {
				res.setHeader("X-Training-Epochs", String(epochs));
			}
			if (typeof learningRate !== "undefined") {
				res.setHeader("X-Training-Learning-Rate", String(learningRate));
			}
			if (typeof dropoutRate !== "undefined") {
				res.setHeader("X-Training-Dropout-Rate", String(dropoutRate));
			}
		}
		if (trainingMetadata.artifactContract?.labelCount) {
			res.setHeader(
				"X-Model-Label-Count",
				String(trainingMetadata.artifactContract.labelCount),
			);
		}
		if (trainingMetadata.artifactContract?.featureContractVersion) {
			res.setHeader(
				"X-Model-Feature-Contract-Version",
				trainingMetadata.artifactContract.featureContractVersion,
			);
		}
		if (
			trainingMetadata.artifactContract?.featureMode === "absolute" ||
			trainingMetadata.artifactContract?.featureMode === "relative_delta"
		) {
			res.setHeader(
				"X-Model-Feature-Mode",
				trainingMetadata.artifactContract.featureMode,
			);
		}
	}
	res.setHeader(
		"Content-Disposition",
		`attachment; filename="${downloadName}"`,
	);
}

type SendBinaryModelOptions = {
	precomputed?: PrecomputedModelPayload;
	headersOnly?: boolean;
};

export async function sendBinaryModel(
	res: Response,
	filePath: string,
	downloadName: string,
	options: SendBinaryModelOptions = {},
): Promise<void> {
	try {
		const range = (res.req.headers["range"] as string | undefined) || undefined;
		let buffer: Buffer | undefined = options.precomputed?.buffer;
		let metadata: ModelResponseMetadata;

		if (options.precomputed) {
			const { stat, sha256, etag } = options.precomputed;
			metadata = { stat, sha256, etag };
		} else {
			const loaded = await loadModelPayload(filePath);
			buffer = loaded.buffer;
			metadata = {
				stat: loaded.stat,
				sha256: loaded.sha256,
				etag: loaded.etag,
			};
		}

		applyModelResponseHeaders(res, filePath, downloadName, metadata);

		if (options.headersOnly) {
			return;
		}

		if (range && range.startsWith("bytes=")) {
			const [startStr, endStr] = range.replace("bytes=", "").split("-");
			let start = parseInt(startStr, 10);
			let end = endStr ? parseInt(endStr, 10) : metadata.stat.size - 1;
			if (Number.isNaN(start)) start = 0;
			if (Number.isNaN(end) || end >= metadata.stat.size)
				end = metadata.stat.size - 1;
			if (start > end || start < 0) {
				res
					.status(416)
					.setHeader("Content-Range", `bytes */${metadata.stat.size}`)
					.end();
				return;
			}
			const chunkSize = end - start + 1;
			res.status(206);
			res.setHeader(
				"Content-Range",
				`bytes ${start}-${end}/${metadata.stat.size}`,
			);
			res.setHeader("Content-Length", String(chunkSize));
			if (buffer) {
				res.send(buffer.subarray(start, end + 1));
			} else {
				const stream = fsSync.createReadStream(filePath, { start, end });
				stream.pipe(res);
			}
			return;
		}

		res.setHeader("Content-Length", String(metadata.stat.size));
		if (buffer) {
			res.send(buffer);
		} else {
			const stream = fsSync.createReadStream(filePath);
			stream.pipe(res);
		}
	} catch (error) {
		console.error(`Failed to send binary model ${filePath}:`, error);
		res.status(404).json({ error: "Model not found" });
	}
}
