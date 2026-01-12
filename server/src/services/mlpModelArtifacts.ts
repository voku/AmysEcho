import { spawn } from "child_process";
import { createHash } from "crypto";
import type { Response } from "express";
import type { Stats } from "fs";
import * as fsSync from "fs";
import { promises as fs } from "fs";
import path from "path";
import {
	MULTIMODAL_FEATURE_SIZE,
	WINDOW_SIZE,
} from "../constants/featureSchema.js";
import {
	BASELINE_MLP_MODEL_PATH,
	MLP_MODELS_DIR,
	SERVER_DIR,
	SRC_DIR,
} from "../constants/modelPaths.js";

export const DEFAULT_MLP_INPUT_SIZE = MULTIMODAL_FEATURE_SIZE * WINDOW_SIZE;
export const DEFAULT_MLP_WINDOW_SIZE = WINDOW_SIZE;
export const DEFAULT_MLP_FEATURE_SIZE = MULTIMODAL_FEATURE_SIZE;
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
			`Baseline-MLP fehlt unter ${BASELINE_MLP_MODEL_PATH}. Stelle das geprüfte Artefakt bereit oder setze MLP_REQUIRE_BASELINE=0 für Entwicklungszwecke.`,
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
					new Error(`Baseline-MLP fehlt unter ${BASELINE_MLP_MODEL_PATH}`),
				),
			);
			return false;
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
		const proc = spawn("python3", [ZERO_MODEL_SCRIPT_PATH, filePath], {
			cwd: path.join(SERVER_MODULE_DIR, ".."),
			stdio: ["pipe", "ignore", "pipe"],
			env: { ...process.env },
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
				reject(new Error(trimmed || `python3 exited with ${code}`));
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
		const baselineExists = await ensureBaselinePresent();
		if (baselineExists) {
			const seeded = await seedBaselineModel(
				filePath,
				{
					success: (dest) => `seeded MLP from baseline into ${dest}`,
					failure: (dest, error) =>
						`failed to copy baseline MLP into ${dest}: ${String(error)}`,
				},
				logTraining,
			);
			if (!seeded) {
				throw new Error(
					`Failed to seed baseline MLP model at ${filePath}. Provide ${BASELINE_MLP_MODEL_PATH} via your deployment process.`,
				);
			}
			return;
		}

		if (REQUIRE_BASELINE_ARTIFACT) {
			throw new Error(
				`Baseline-MLP fehlt unter ${BASELINE_MLP_MODEL_PATH}. Stelle ein geprüftes Artefakt bereit, damit Trainingsjobs nicht mit neutralen Gewichten starten.`,
			);
		}

		await logTraining(
			`Baseline-MLP fehlt unter ${BASELINE_MLP_MODEL_PATH}; erstelle neutrales Modell in ${filePath} (Labels=${DEFAULT_BASELINE_LABELS.length})`,
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
	modalities?: ModalityKey[];
	modalityCounts?: Partial<Record<ModalityKey, number>>;
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
		const modalityCounts =
			normalizeModalityCounts(parsed.modality_counts) ?? undefined;
		if (
			!version &&
			(!modalities || modalities.length === 0) &&
			!modalityCounts
		) {
			return null;
		}
		return { version, modalities, modalityCounts };
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
			return null;
		}
		if (process.env.NODE_ENV !== "production") {
			// eslint-disable-next-line no-console -- Metadata read failures should not break model downloads.
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
	if (profileId) {
		res.setHeader("X-Model-Profile", profileId);
	}
	const trainingMetadata = readTrainingMetadata(filePath);
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
