import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import {
	DATA_DIR,
	TRAINING_DATASETS_DIR,
	TRAINING_MANIFEST_PATH,
	TRAINING_QUALITY_LOG_PATH,
} from "../constants/modelPaths.js";
import { getJsonCollection, setJsonCollection } from "../sqliteDb.js";

const TRAINING_MANIFEST_KEY = "training.manifest";
const DGS_SAMPLES_KEY = "training.dgs_samples";
const CUSTOM_SIGNS_KEY = "training.custom_signs";
const TRAINING_QUALITY_LOG_KEY = "training.quality_log";
const DGS_SAMPLES_PATH = path.join(DATA_DIR, "dgs_samples.json");
const CUSTOM_SIGNS_PATH = path.join(TRAINING_DATASETS_DIR, "custom_signs.json");

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
	writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function readCollectionOrFallback<T>(key: string, fallback: T): T {
	try {
		return getJsonCollection<T>(key, fallback);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.includes("Database not initialized")) {
			return fallback;
		}
		throw error;
	}
}

function writeCollectionIfAvailable(key: string, payload: unknown): void {
	try {
		setJsonCollection(key, payload);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.includes("Database not initialized")) {
			return;
		}
		throw error;
	}
}

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

export function loadTrainingManifest<TEntry = Record<string, unknown>>(): TrainingManifestFile<TEntry> {
	let payload = readCollectionOrFallback<TrainingManifestFile<TEntry>>(TRAINING_MANIFEST_KEY, {
		entries: [],
	});
	if (payload.entries.length === 0) {
		const legacy = loadLegacyJson<TrainingManifestFile<TEntry>>(TRAINING_MANIFEST_PATH);
		if (legacy && Array.isArray(legacy.entries)) {
			payload = legacy;
			writeCollectionIfAvailable(TRAINING_MANIFEST_KEY, payload);
		}
	}
	if (!Array.isArray(payload.entries)) {
		return { entries: [] };
	}
	return payload;
}

export function saveTrainingManifest<TEntry = Record<string, unknown>>(
	manifest: TrainingManifestFile<TEntry>,
): void {
	const payload = {
		entries: Array.isArray(manifest.entries) ? manifest.entries : [],
	};
	writeCollectionIfAvailable(TRAINING_MANIFEST_KEY, payload);
	mirrorLegacyJson(TRAINING_MANIFEST_PATH, payload);
}

export function loadDgsSamples<TSample = Record<string, unknown>>(): DgsSamplesFile<TSample> {
	let payload = readCollectionOrFallback<DgsSamplesFile<TSample>>(DGS_SAMPLES_KEY, {
		samples: [],
	});
	if (payload.samples.length === 0) {
		const legacy = loadLegacyJson<DgsSamplesFile<TSample>>(DGS_SAMPLES_PATH);
		if (legacy && Array.isArray(legacy.samples)) {
			payload = legacy;
			writeCollectionIfAvailable(DGS_SAMPLES_KEY, payload);
		}
	}
	if (!Array.isArray(payload.samples)) {
		return { samples: [] };
	}
	return payload;
}

export function saveDgsSamples<TSample = Record<string, unknown>>(
	samples: DgsSamplesFile<TSample>,
): void {
	const payload = {
		samples: Array.isArray(samples.samples) ? samples.samples : [],
	};
	writeCollectionIfAvailable(DGS_SAMPLES_KEY, payload);
	mirrorLegacyJson(DGS_SAMPLES_PATH, payload);
}

export function loadCustomSigns<TSign = Record<string, unknown>>(): CustomSignsFile<TSign> {
	let payload = readCollectionOrFallback<CustomSignsFile<TSign>>(CUSTOM_SIGNS_KEY, {
		signs: [],
	});
	if (payload.signs.length === 0) {
		const legacy = loadLegacyJson<CustomSignsFile<TSign>>(CUSTOM_SIGNS_PATH);
		if (legacy && Array.isArray(legacy.signs)) {
			payload = legacy;
			writeCollectionIfAvailable(CUSTOM_SIGNS_KEY, payload);
		}
	}
	if (!Array.isArray(payload.signs)) {
		return { signs: [] };
	}
	return payload;
}

export function saveCustomSigns<TSign = Record<string, unknown>>(
	signs: CustomSignsFile<TSign>,
): void {
	const payload = {
		signs: Array.isArray(signs.signs) ? signs.signs : [],
	};
	writeCollectionIfAvailable(CUSTOM_SIGNS_KEY, payload);
	mirrorLegacyJson(CUSTOM_SIGNS_PATH, payload);
}

export function loadTrainingQualityLog<TEntry = Record<string, unknown>>(): TrainingQualityLogFile<TEntry> {
	let payload = readCollectionOrFallback<TrainingQualityLogFile<TEntry>>(TRAINING_QUALITY_LOG_KEY, {
		entries: [],
	});
	if (payload.entries.length === 0) {
		const legacy = loadLegacyJson<TrainingQualityLogFile<TEntry>>(TRAINING_QUALITY_LOG_PATH);
		if (legacy && Array.isArray(legacy.entries)) {
			payload = legacy;
			writeCollectionIfAvailable(TRAINING_QUALITY_LOG_KEY, payload);
		}
	}
	if (!Array.isArray(payload.entries)) {
		return { entries: [] };
	}
	return payload;
}

export function saveTrainingQualityLog<TEntry = Record<string, unknown>>(
	entries: TrainingQualityLogFile<TEntry>,
): void {
	const payload = {
		entries: Array.isArray(entries.entries) ? entries.entries : [],
	};
	writeCollectionIfAvailable(TRAINING_QUALITY_LOG_KEY, payload);
	mirrorLegacyJson(TRAINING_QUALITY_LOG_PATH, payload);
}
