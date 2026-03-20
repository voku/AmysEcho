import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import path from "path";
import {
	DATA_DIR,
	TRAINING_DATASETS_DIR,
	TRAINING_MANIFEST_PATH,
	TRAINING_QUALITY_LOG_PATH,
} from "../constants/modelPaths.js";
import {
	getJsonCollection,
	isDatabaseInitialized,
	mutateJsonCollection,
	setJsonCollection,
} from "../sqliteDb.js";

const TRAINING_MANIFEST_KEY = "training.manifest";
const DGS_SAMPLES_KEY = "training.dgs_samples";
const CUSTOM_SIGNS_KEY = "training.custom_signs";
const TRAINING_QUALITY_LOG_KEY = "training.quality_log";
const DGS_SAMPLES_PATH = path.join(DATA_DIR, "dgs_samples.json");
const CUSTOM_SIGNS_PATH = path.join(TRAINING_DATASETS_DIR, "custom_signs.json");

export type TrainingManifestFile<TEntry = Record<string, unknown>> = {
	entries: TEntry[];
};

export type DgsSamplesFile<TSample = Record<string, unknown>> = {
	samples: TSample[];
};

export type CustomSignsFile<TSign = Record<string, unknown>> = {
	signs: TSign[];
};

export type TrainingQualityLogFile<TEntry = Record<string, unknown>> = {
	entries: TEntry[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object";
}

function normalizeEntriesPayload<TEntry>(value: unknown): TrainingManifestFile<TEntry> {
	if (!isRecord(value)) {
		return { entries: [] };
	}
	const entries = (value as { entries?: unknown }).entries;
	return { entries: Array.isArray(entries) ? (entries as TEntry[]) : [] };
}

function normalizeSamplesPayload<TSample>(value: unknown): DgsSamplesFile<TSample> {
	if (!isRecord(value)) {
		return { samples: [] };
	}
	const samples = (value as { samples?: unknown }).samples;
	return { samples: Array.isArray(samples) ? (samples as TSample[]) : [] };
}

function normalizeSignsPayload<TSign>(value: unknown): CustomSignsFile<TSign> {
	if (!isRecord(value)) {
		return { signs: [] };
	}
	const signs = (value as { signs?: unknown }).signs;
	return { signs: Array.isArray(signs) ? (signs as TSign[]) : [] };
}

function normalizeQualityPayload<TEntry>(value: unknown): TrainingQualityLogFile<TEntry> {
	if (!isRecord(value)) {
		return { entries: [] };
	}
	const entries = (value as { entries?: unknown }).entries;
	return { entries: Array.isArray(entries) ? (entries as TEntry[]) : [] };
}

function loadLegacyJson<T>(filePath: string): T | null {
	if (!existsSync(filePath)) {
		return null;
	}
	try {
		const raw = readFileSync(filePath, "utf8");
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

function mirrorLegacyJson(filePath: string, payload: unknown): void {
	mkdirSync(path.dirname(filePath), { recursive: true });
	const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
	writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
	renameSync(tempPath, filePath);
}

function readCollectionOrFallback<T>(key: string, fallback: T): T {
	if (!isDatabaseInitialized()) {
		return fallback;
	}
	return getJsonCollection<T>(key, fallback);
}

function writeCollectionIfAvailable(key: string, payload: unknown): void {
	if (!isDatabaseInitialized()) {
		return;
	}
	setJsonCollection(key, payload);
}

export function loadTrainingManifest<TEntry = Record<string, unknown>>(): TrainingManifestFile<TEntry> {
	let payload = normalizeEntriesPayload<TEntry>(
		readCollectionOrFallback(TRAINING_MANIFEST_KEY, { entries: [] }),
	);
	if (payload.entries.length === 0) {
		const legacy = normalizeEntriesPayload<TEntry>(
			loadLegacyJson<unknown>(TRAINING_MANIFEST_PATH),
		);
		if (legacy.entries.length > 0) {
			payload = legacy;
			writeCollectionIfAvailable(TRAINING_MANIFEST_KEY, payload);
		}
	}
	return payload;
}

export function saveTrainingManifest<TEntry = Record<string, unknown>>(
	manifest: TrainingManifestFile<TEntry>,
): void {
	const payload = normalizeEntriesPayload<TEntry>(manifest);
	writeCollectionIfAvailable(TRAINING_MANIFEST_KEY, payload);
	mirrorLegacyJson(TRAINING_MANIFEST_PATH, payload);
}

export function appendTrainingManifestEntry<TEntry>(entry: TEntry): TrainingManifestFile<TEntry> {
	let result: TrainingManifestFile<TEntry>;
	if (isDatabaseInitialized()) {
		result = mutateJsonCollection<TrainingManifestFile<TEntry>>(
			TRAINING_MANIFEST_KEY,
			{ entries: [] },
			(current) => {
				const normalized = normalizeEntriesPayload<TEntry>(current);
				normalized.entries.push(entry);
				return normalized;
			},
		);
	} else {
		result = loadTrainingManifest<TEntry>();
		result.entries.push(entry);
	}
	mirrorLegacyJson(TRAINING_MANIFEST_PATH, result);
	return result;
}

export function loadDgsSamples<TSample = Record<string, unknown>>(): DgsSamplesFile<TSample> {
	let payload = normalizeSamplesPayload<TSample>(
		readCollectionOrFallback(DGS_SAMPLES_KEY, { samples: [] }),
	);
	if (payload.samples.length === 0) {
		const legacy = normalizeSamplesPayload<TSample>(
			loadLegacyJson<unknown>(DGS_SAMPLES_PATH),
		);
		if (legacy.samples.length > 0) {
			payload = legacy;
			writeCollectionIfAvailable(DGS_SAMPLES_KEY, payload);
		}
	}
	return payload;
}

export function saveDgsSamples<TSample = Record<string, unknown>>(
	samples: DgsSamplesFile<TSample>,
): void {
	const payload = normalizeSamplesPayload<TSample>(samples);
	writeCollectionIfAvailable(DGS_SAMPLES_KEY, payload);
	mirrorLegacyJson(DGS_SAMPLES_PATH, payload);
}

export function appendDgsSamples<TSample>(newSamples: TSample[]): DgsSamplesFile<TSample> {
	let result: DgsSamplesFile<TSample>;
	if (isDatabaseInitialized()) {
		result = mutateJsonCollection<DgsSamplesFile<TSample>>(
			DGS_SAMPLES_KEY,
			{ samples: [] },
			(current) => {
				const normalized = normalizeSamplesPayload<TSample>(current);
				normalized.samples.push(...newSamples);
				return normalized;
			},
		);
	} else {
		result = loadDgsSamples<TSample>();
		result.samples.push(...newSamples);
	}
	mirrorLegacyJson(DGS_SAMPLES_PATH, result);
	return result;
}

export function loadCustomSigns<TSign = Record<string, unknown>>(): CustomSignsFile<TSign> {
	let payload = normalizeSignsPayload<TSign>(
		readCollectionOrFallback(CUSTOM_SIGNS_KEY, { signs: [] }),
	);
	if (payload.signs.length === 0) {
		const legacy = normalizeSignsPayload<TSign>(
			loadLegacyJson<unknown>(CUSTOM_SIGNS_PATH),
		);
		if (legacy.signs.length > 0) {
			payload = legacy;
			writeCollectionIfAvailable(CUSTOM_SIGNS_KEY, payload);
		}
	}
	return payload;
}

export function saveCustomSigns<TSign = Record<string, unknown>>(
	signs: CustomSignsFile<TSign>,
): void {
	const payload = normalizeSignsPayload<TSign>(signs);
	writeCollectionIfAvailable(CUSTOM_SIGNS_KEY, payload);
	mirrorLegacyJson(CUSTOM_SIGNS_PATH, payload);
}

export function mutateCustomSigns<TSign = Record<string, unknown>>(
	mutator: (signs: TSign[]) => void,
): CustomSignsFile<TSign> {
	let result: CustomSignsFile<TSign>;
	if (isDatabaseInitialized()) {
		result = mutateJsonCollection<CustomSignsFile<TSign>>(
			CUSTOM_SIGNS_KEY,
			{ signs: [] },
			(current) => {
				const normalized = normalizeSignsPayload<TSign>(current);
				mutator(normalized.signs);
				return normalized;
			},
		);
	} else {
		result = loadCustomSigns<TSign>();
		mutator(result.signs);
	}
	mirrorLegacyJson(CUSTOM_SIGNS_PATH, result);
	return result;
}

export function loadTrainingQualityLog<TEntry = Record<string, unknown>>(): TrainingQualityLogFile<TEntry> {
	let payload = normalizeQualityPayload<TEntry>(
		readCollectionOrFallback(TRAINING_QUALITY_LOG_KEY, { entries: [] }),
	);
	if (payload.entries.length === 0) {
		const legacy = normalizeQualityPayload<TEntry>(
			loadLegacyJson<unknown>(TRAINING_QUALITY_LOG_PATH),
		);
		if (legacy.entries.length > 0) {
			payload = legacy;
			writeCollectionIfAvailable(TRAINING_QUALITY_LOG_KEY, payload);
		}
	}
	return payload;
}

export function saveTrainingQualityLog<TEntry = Record<string, unknown>>(
	entries: TrainingQualityLogFile<TEntry>,
): void {
	const payload = normalizeQualityPayload<TEntry>(entries);
	writeCollectionIfAvailable(TRAINING_QUALITY_LOG_KEY, payload);
	mirrorLegacyJson(TRAINING_QUALITY_LOG_PATH, payload);
}

export function appendTrainingQualityLogEntry<TEntry extends { bundleId: string }>(
	entry: TEntry,
): TrainingQualityLogFile<TEntry> {
	let result: TrainingQualityLogFile<TEntry>;
	if (isDatabaseInitialized()) {
		result = mutateJsonCollection<TrainingQualityLogFile<TEntry>>(
			TRAINING_QUALITY_LOG_KEY,
			{ entries: [] },
			(current) => {
				const normalized = normalizeQualityPayload<TEntry>(current);
				normalized.entries.push(entry);
				const dedup = new Map<string, TEntry>();
				for (const item of normalized.entries) {
					dedup.set(item.bundleId, item);
				}
				normalized.entries = Array.from(dedup.values());
				return normalized;
			},
		);
	} else {
		result = loadTrainingQualityLog<TEntry>();
		result.entries.push(entry);
		const dedup = new Map<string, TEntry>();
		for (const item of result.entries) {
			dedup.set(item.bundleId, item);
		}
		result.entries = Array.from(dedup.values());
	}
	mirrorLegacyJson(TRAINING_QUALITY_LOG_PATH, result);
	return result;
}
