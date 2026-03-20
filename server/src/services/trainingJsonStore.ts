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

function assertDatabaseInitialized(): void {
	if (!isDatabaseInitialized()) {
		throw new Error("TrainingJsonStore requires initialized SQLite database");
	}
}

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

export function loadTrainingManifest<TEntry = Record<string, unknown>>(): TrainingManifestFile<TEntry> {
	assertDatabaseInitialized();
	return normalizeEntriesPayload<TEntry>(
		getJsonCollection(TRAINING_MANIFEST_KEY, { entries: [] }),
	);
}

export function saveTrainingManifest<TEntry = Record<string, unknown>>(
	manifest: TrainingManifestFile<TEntry>,
): void {
	assertDatabaseInitialized();
	setJsonCollection(TRAINING_MANIFEST_KEY, normalizeEntriesPayload<TEntry>(manifest));
}

export function appendTrainingManifestEntry<TEntry>(entry: TEntry): TrainingManifestFile<TEntry> {
	assertDatabaseInitialized();
	return mutateJsonCollection<TrainingManifestFile<TEntry>>(
		TRAINING_MANIFEST_KEY,
		{ entries: [] },
		(current) => {
			const normalized = normalizeEntriesPayload<TEntry>(current);
			normalized.entries.push(entry);
			return normalized;
		},
	);
}

export function loadDgsSamples<TSample = Record<string, unknown>>(): DgsSamplesFile<TSample> {
	assertDatabaseInitialized();
	return normalizeSamplesPayload<TSample>(
		getJsonCollection(DGS_SAMPLES_KEY, { samples: [] }),
	);
}

export function saveDgsSamples<TSample = Record<string, unknown>>(
	samples: DgsSamplesFile<TSample>,
): void {
	assertDatabaseInitialized();
	setJsonCollection(DGS_SAMPLES_KEY, normalizeSamplesPayload<TSample>(samples));
}

export function appendDgsSamples<TSample>(newSamples: TSample[]): DgsSamplesFile<TSample> {
	assertDatabaseInitialized();
	return mutateJsonCollection<DgsSamplesFile<TSample>>(
		DGS_SAMPLES_KEY,
		{ samples: [] },
		(current) => {
			const normalized = normalizeSamplesPayload<TSample>(current);
			normalized.samples.push(...newSamples);
			return normalized;
		},
	);
}

export function loadCustomSigns<TSign = Record<string, unknown>>(): CustomSignsFile<TSign> {
	assertDatabaseInitialized();
	return normalizeSignsPayload<TSign>(
		getJsonCollection(CUSTOM_SIGNS_KEY, { signs: [] }),
	);
}

export function saveCustomSigns<TSign = Record<string, unknown>>(
	signs: CustomSignsFile<TSign>,
): void {
	assertDatabaseInitialized();
	setJsonCollection(CUSTOM_SIGNS_KEY, normalizeSignsPayload<TSign>(signs));
}

export function mutateCustomSigns<TSign = Record<string, unknown>>(
	mutator: (signs: TSign[]) => void,
): CustomSignsFile<TSign> {
	assertDatabaseInitialized();
	return mutateJsonCollection<CustomSignsFile<TSign>>(
		CUSTOM_SIGNS_KEY,
		{ signs: [] },
		(current) => {
			const normalized = normalizeSignsPayload<TSign>(current);
			mutator(normalized.signs);
			return normalized;
		},
	);
}

export function loadTrainingQualityLog<TEntry = Record<string, unknown>>(): TrainingQualityLogFile<TEntry> {
	assertDatabaseInitialized();
	return normalizeQualityPayload<TEntry>(
		getJsonCollection(TRAINING_QUALITY_LOG_KEY, { entries: [] }),
	);
}

export function saveTrainingQualityLog<TEntry = Record<string, unknown>>(
	entries: TrainingQualityLogFile<TEntry>,
): void {
	assertDatabaseInitialized();
	setJsonCollection(TRAINING_QUALITY_LOG_KEY, normalizeQualityPayload<TEntry>(entries));
}

export function appendTrainingQualityLogEntry<TEntry extends { bundleId: string }>(
	entry: TEntry,
): TrainingQualityLogFile<TEntry> {
	assertDatabaseInitialized();
	return mutateJsonCollection<TrainingQualityLogFile<TEntry>>(
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
}
