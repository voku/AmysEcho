import { spawn } from "child_process";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import {
	DATA_DIR,
	SERVER_DIR,
} from "../constants/modelPaths.js";
import { loadTrainingManifest } from "./trainingJsonStore.js";
import {
	resolvePythonExecutable,
	withProjectPythonPath,
} from "../utils/pythonExecutable.js";

export type DatasetReadinessSummary = Record<string, unknown>;

export type RunDatasetReadinessEvaluationOptions = {
	reportDir?: string;
	dataDir?: string;
	manifest?: { entries: Record<string, unknown>[] };
	minProfiles?: number;
	minLabels?: number;
	cacheTtlMs?: number;
	cacheKey?: string;
	forceRefresh?: boolean;
};

export const DATASET_READINESS_DIR = path.join(DATA_DIR, "dataset-readiness");
const DATASET_READINESS_SCRIPT = path.join(
	SERVER_DIR,
	"src",
	"amyserver_tools",
	"evaluate_dataset_readiness.py",
);
const DATASET_READINESS_CACHE_TTL_MS = 30_000;

type DatasetReadinessCacheEntry = {
	expiresAt: number;
	summary: DatasetReadinessSummary;
};

const datasetReadinessCache = new Map<string, DatasetReadinessCacheEntry>();
const datasetReadinessInFlight = new Map<string, Promise<DatasetReadinessSummary>>();

function buildManifestPayload(
	manifest: RunDatasetReadinessEvaluationOptions["manifest"],
): { entries: Record<string, unknown>[] } {
	if (manifest) {
		return {
			entries: Array.isArray(manifest.entries) ? manifest.entries : [],
		};
	}
	return loadTrainingManifest<Record<string, unknown>>();
}

function buildCacheKey(manifest: { entries: Record<string, unknown>[] }, explicitKey?: string): string {
	if (explicitKey && explicitKey.trim().length > 0) {
		return explicitKey.trim();
	}
	const digest = createHash("sha1")
		.update(JSON.stringify(manifest))
		.digest("hex");
	return `manifest:${digest}`;
}

function buildScopedReportDir(baseDir: string | undefined, cacheKey: string): string {
	if (baseDir) {
		return baseDir;
	}
	const digest = createHash("sha1").update(cacheKey).digest("hex").slice(0, 12);
	return path.join(DATASET_READINESS_DIR, digest);
}

async function spawnReadinessEvaluator(
	manifestSnapshotPath: string,
	reportDir: string,
	dataDir: string,
	options: RunDatasetReadinessEvaluationOptions,
): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const args = [
			DATASET_READINESS_SCRIPT,
			"--manifest",
			manifestSnapshotPath,
			"--data-dir",
			dataDir,
			"--output-dir",
			reportDir,
		];
		if (typeof options.minProfiles === "number" && Number.isFinite(options.minProfiles)) {
			args.push("--min-profiles", String(Math.round(options.minProfiles)));
		}
		if (typeof options.minLabels === "number" && Number.isFinite(options.minLabels)) {
			args.push("--min-labels", String(Math.round(options.minLabels)));
		}

		const proc = spawn(resolvePythonExecutable(), args, {
			env: withProjectPythonPath(),
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";

		proc.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		proc.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		proc.on("error", reject);
		proc.on("close", (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(
				new Error(
					`Dataset readiness evaluator exited with code ${code}: ${stderr || stdout}`,
				),
			);
		});
	});
}

export async function runDatasetReadinessEvaluation(
	options: RunDatasetReadinessEvaluationOptions = {},
): Promise<DatasetReadinessSummary> {
	const manifest = buildManifestPayload(options.manifest);
	const cacheKey = buildCacheKey(manifest, options.cacheKey);
	const cacheTtlMs =
		typeof options.cacheTtlMs === "number" && Number.isFinite(options.cacheTtlMs)
			? options.cacheTtlMs
			: DATASET_READINESS_CACHE_TTL_MS;
	const cached = datasetReadinessCache.get(cacheKey);
	if (
		!options.forceRefresh &&
		cached &&
		cached.expiresAt > Date.now()
	) {
		return cached.summary;
	}

	const existingInFlight = datasetReadinessInFlight.get(cacheKey);
	if (!options.forceRefresh && existingInFlight) {
		return existingInFlight;
	}

	const evaluationPromise = (async () => {
		const dataDir = options.dataDir ?? DATA_DIR;
		const reportDir = buildScopedReportDir(options.reportDir, cacheKey);
		const datasetsDir = path.join(dataDir, "datasets");
		await fs.mkdir(reportDir, { recursive: true });
		await fs.mkdir(datasetsDir, { recursive: true });

		const manifestSnapshotPath = path.join(reportDir, "manifest_snapshot.json");
		await fs.writeFile(
			manifestSnapshotPath,
			JSON.stringify(manifest, null, 2),
			"utf8",
		);

		await spawnReadinessEvaluator(
			manifestSnapshotPath,
			reportDir,
			dataDir,
			options,
		);

		const summaryRaw = await fs.readFile(path.join(reportDir, "summary.json"), "utf8");
		const summary = JSON.parse(summaryRaw) as DatasetReadinessSummary;
		if (cacheTtlMs > 0) {
			datasetReadinessCache.set(cacheKey, {
				expiresAt: Date.now() + cacheTtlMs,
				summary,
			});
		}
		return summary;
	})();

	datasetReadinessInFlight.set(cacheKey, evaluationPromise);
	try {
		return await evaluationPromise;
	} finally {
		datasetReadinessInFlight.delete(cacheKey);
	}
}
