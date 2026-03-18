import { promises as fs } from "fs";
import path from "path";
import { loadDatabase } from "../db.js";
import {
	DATA_DIR,
	MLP_MODELS_DIR,
	TRAINING_DATASETS_DIR,
	TRAINING_QUALITY_LOG_PATH,
	TRAINING_UPLOADS_DIR,
	USER_TRAINING_DATA_DIR,
	ensureDataDir,
} from "../constants/modelPaths.js";
import {
	loadCustomSigns,
	loadDgsSamples,
	loadTrainingManifest,
	saveDgsSamples,
	saveTrainingManifest,
} from "./profileDataService.js";
import { atomicWriteJson } from "../utils/atomicFs.js";
import { resetTrainingStateInSqlite, type TrainingSqliteResetSummary } from "../sqliteDb.js";

const INGESTION_METRICS_PATH = path.join(
	TRAINING_DATASETS_DIR,
	"ingestion_metrics.json",
);

type ResetDirectorySummary = {
	existed: boolean;
	topLevelEntries: number;
};

export type ResetTrainingDataOptions = {
	dbPath: string;
	preserveGlobalModel?: boolean;
	dryRun?: boolean;
};

export type ResetTrainingDataSummary = {
	dataDir: string;
	dbPath: string;
	dryRun: boolean;
	preserveGlobalModel: boolean;
	trainingManifestEntriesCleared: number;
	dgsSamplesCleared: number;
	customSignsPreserved: number;
	trainingQualityLogEntriesCleared: number;
	ingestionMetricsRemoved: boolean;
	uploads: ResetDirectorySummary;
	userTrainingData: ResetDirectorySummary;
	modelsRemoved: string[];
	sqlite: TrainingSqliteResetSummary;
};

async function pathExists(targetPath: string): Promise<boolean> {
	try {
		await fs.access(targetPath);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return false;
		}
		throw error;
	}
}

async function countTopLevelEntries(targetPath: string): Promise<number> {
	try {
		const entries = await fs.readdir(targetPath);
		return entries.length;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return 0;
		}
		throw error;
	}
}

async function inspectDirectory(targetPath: string): Promise<ResetDirectorySummary> {
	const existed = await pathExists(targetPath);
	return {
		existed,
		topLevelEntries: existed ? await countTopLevelEntries(targetPath) : 0,
	};
}

async function writeEmptyTrainingQualityLog(dryRun: boolean): Promise<number> {
	const existed = await pathExists(TRAINING_QUALITY_LOG_PATH);
	if (!existed) {
		if (!dryRun) {
			await fs.mkdir(path.dirname(TRAINING_QUALITY_LOG_PATH), { recursive: true });
			await atomicWriteJson(TRAINING_QUALITY_LOG_PATH, { entries: [] });
		}
		return 0;
	}

	const raw = JSON.parse(
		await fs.readFile(TRAINING_QUALITY_LOG_PATH, "utf8"),
	) as { entries?: unknown[] };
	const count = Array.isArray(raw.entries) ? raw.entries.length : 0;
	if (!dryRun) {
		await atomicWriteJson(TRAINING_QUALITY_LOG_PATH, { entries: [] });
	}
	return count;
}

async function removeDirectoryAndRecreate(
	targetPath: string,
	dryRun: boolean,
): Promise<ResetDirectorySummary> {
	const summary = await inspectDirectory(targetPath);
	if (!dryRun) {
		await fs.rm(targetPath, { recursive: true, force: true });
		await fs.mkdir(targetPath, { recursive: true });
	}
	return summary;
}

async function clearModelDirectories(
	preserveGlobalModel: boolean,
	dryRun: boolean,
): Promise<string[]> {
	if (!(await pathExists(MLP_MODELS_DIR))) {
		if (!dryRun) {
			await fs.mkdir(MLP_MODELS_DIR, { recursive: true });
		}
		return [];
	}

	const removed: string[] = [];
	const entries = await fs.readdir(MLP_MODELS_DIR, { withFileTypes: true });
	for (const entry of entries) {
		if (!entry.isDirectory()) {
			continue;
		}
		if (preserveGlobalModel && entry.name === "global") {
			continue;
		}
		removed.push(entry.name);
		if (!dryRun) {
			await fs.rm(path.join(MLP_MODELS_DIR, entry.name), {
				recursive: true,
				force: true,
			});
		}
	}

	if (!dryRun) {
		await fs.mkdir(MLP_MODELS_DIR, { recursive: true });
	}

	return removed.sort();
}

export async function resetTrainingData(
	options: ResetTrainingDataOptions,
): Promise<ResetTrainingDataSummary> {
	const preserveGlobalModel = options.preserveGlobalModel ?? true;
	const dryRun = options.dryRun ?? false;

	await ensureDataDir();
	await loadDatabase(options.dbPath);

	const manifest = await loadTrainingManifest();
	const dgsSamples = await loadDgsSamples();
	const customSigns = await loadCustomSigns();
	const trainingQualityLogEntriesCleared = await writeEmptyTrainingQualityLog(dryRun);
	const uploads = await removeDirectoryAndRecreate(TRAINING_UPLOADS_DIR, dryRun);
	const userTrainingData = await removeDirectoryAndRecreate(
		USER_TRAINING_DATA_DIR,
		dryRun,
	);
	const modelsRemoved = await clearModelDirectories(
		preserveGlobalModel,
		dryRun,
	);
	const ingestionMetricsRemoved = await pathExists(INGESTION_METRICS_PATH);

	if (!dryRun) {
		await saveTrainingManifest({ entries: [] });
		await saveDgsSamples({ samples: [] });
		if (ingestionMetricsRemoved) {
			await fs.rm(INGESTION_METRICS_PATH, { force: true });
		}
	}

	const sqlite = dryRun
		? {
				signTrainingDataDeleted: 0,
				correctionsDeleted: 0,
				negativeSamplesDeleted: 0,
				labelSettingsReset: 0,
			}
		: resetTrainingStateInSqlite();

	return {
		dataDir: DATA_DIR,
		dbPath: options.dbPath,
		dryRun,
		preserveGlobalModel,
		trainingManifestEntriesCleared: manifest.entries.length,
		dgsSamplesCleared: dgsSamples.samples.length,
		customSignsPreserved: customSigns.signs.length,
		trainingQualityLogEntriesCleared,
		ingestionMetricsRemoved,
		uploads,
		userTrainingData,
		modelsRemoved,
		sqlite,
	};
}
