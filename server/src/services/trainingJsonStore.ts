import {
	getJsonCollection,
	isDatabaseInitialized,
	mutateJsonCollection,
	setJsonCollection,
} from "../sqliteDb.js";
import {
	parseTrainingManifest,
	parseTrainingManifestEntry,
	type TrainingManifest,
	type TrainingManifestEntry,
} from "./trainingManifestSchema.js";

const TRAINING_MANIFEST_KEY = "training.manifest";
const DGS_SAMPLES_KEY = "training.dgs_samples";
const CUSTOM_SIGNS_KEY = "training.custom_signs";
const TRAINING_QUALITY_LOG_KEY = "training.quality_log";
const TRAINING_REPORTS_KEY = "training.reports";
const MAX_TRAINING_REPORT_ENTRIES = 500;

export type TrainingManifestFile<TEntry = Record<string, unknown>> = Omit<TrainingManifest, "entries"> & {
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

export type TrainingReportsFile<TEntry = Record<string, unknown>> = {
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

function readArrayField<T>(value: unknown, key: string): T[] {
	if (!isRecord(value)) {
		return [];
	}
	const field = value[key];
	return Array.isArray(field) ? (field as T[]) : [];
}

function normalizeEntriesPayload(value: unknown): TrainingManifestFile<TrainingManifestEntry> {
	return parseTrainingManifest(value);
}

function normalizeSamplesPayload<TSample>(value: unknown): DgsSamplesFile<TSample> {
	return { samples: readArrayField<TSample>(value, "samples") };
}

function normalizeSignsPayload<TSign>(value: unknown): CustomSignsFile<TSign> {
	return { signs: readArrayField<TSign>(value, "signs") };
}

function normalizeQualityPayload<TEntry>(value: unknown): TrainingQualityLogFile<TEntry> {
	return { entries: readArrayField<TEntry>(value, "entries") };
}

export function loadTrainingManifest<TEntry = TrainingManifestEntry>(): TrainingManifestFile<TEntry> {
	assertDatabaseInitialized();
	const parsed = normalizeEntriesPayload(
		getJsonCollection(TRAINING_MANIFEST_KEY, { entries: [] }),
	);
	return { ...parsed, entries: parsed.entries as TEntry[] };
}

export function loadTrainingManifestRaw(): unknown {
	assertDatabaseInitialized();
	return getJsonCollection(TRAINING_MANIFEST_KEY, { entries: [] });
}

export function saveTrainingManifest<TEntry = Record<string, unknown>>(
	manifest: TrainingManifestFile<TEntry>,
): void {
	assertDatabaseInitialized();
	setJsonCollection(TRAINING_MANIFEST_KEY, normalizeEntriesPayload(manifest));
}

export function appendTrainingManifestEntry(entry: TrainingManifestEntry): TrainingManifestFile<TrainingManifestEntry> {
	assertDatabaseInitialized();
	const parsedEntry = parseTrainingManifestEntry(entry);
	return mutateJsonCollection<TrainingManifestFile<TrainingManifestEntry>>(
		TRAINING_MANIFEST_KEY,
		{ entries: [] },
		(current) => {
			const normalized = normalizeEntriesPayload(current);
			normalized.entries.push(parsedEntry);
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

export function loadTrainingReports<TEntry = Record<string, unknown>>(): TrainingReportsFile<TEntry> {
	assertDatabaseInitialized();
	return normalizeQualityPayload<TEntry>(
		getJsonCollection(TRAINING_REPORTS_KEY, { entries: [] }),
	);
}

export function saveTrainingReports<TEntry = Record<string, unknown>>(
	entries: TrainingReportsFile<TEntry>,
): void {
	assertDatabaseInitialized();
	setJsonCollection(TRAINING_REPORTS_KEY, normalizeQualityPayload<TEntry>(entries));
}

export function appendTrainingReportEntry<TEntry extends { runId: string }>(
	entry: TEntry,
): TrainingReportsFile<TEntry> {
	assertDatabaseInitialized();
	return mutateJsonCollection<TrainingReportsFile<TEntry>>(
		TRAINING_REPORTS_KEY,
		{ entries: [] },
		(current) => {
			const normalized = normalizeQualityPayload<TEntry>(current);
			const existingIndex = normalized.entries.findIndex(
				(item) => item.runId === entry.runId,
			);
			if (existingIndex >= 0) {
				normalized.entries[existingIndex] = entry;
			} else {
				normalized.entries.push(entry);
			}
			if (normalized.entries.length > MAX_TRAINING_REPORT_ENTRIES) {
				normalized.entries = normalized.entries.slice(
					normalized.entries.length - MAX_TRAINING_REPORT_ENTRIES,
				);
			}
			return normalized;
		},
	);
}
