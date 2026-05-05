import { spawn } from "child_process";
import { randomBytes } from "crypto";
import { type Request, type Response } from "express";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import {
	createConfiguredApp,
	errorHandler,
} from "./bootstrap/expressApp.js";
import { createServerRateLimiters } from "./bootstrap/rateLimiters.js";
import { readServerPackageJson } from "./bootstrap/serverPackage.js";
import { startServerWhenReady } from "./bootstrap/startServer.js";
import config from "./config/index.js";
import { DB_FILE_PATH } from "./constants/dbPaths.js";
import {
	HAND_LANDMARKS_PER_HAND,
	MULTIMODAL_LANDMARKS,
	TOTAL_HAND_LANDMARKS,
} from "./constants/featureSchema.js";
import {
	DATA_DIR,
	ensureDataDir,
	getMlpModelPath,
	MLP_MODELS_DIR,
	PROFILE_ID_PATTERN,
	SERVER_DIR,
} from "./constants/modelPaths.js";
import { PROFILE_REGISTRY_PATH } from "./constants/profileRegistryPaths.js";
import {
	type Database,
	setupDatabase,
} from "./db.js";
import { auth } from "./middleware/auth.js";
import { registerAuthRoutes } from "./routes/authRoutes.js";
import { registerCustomSignsRoute } from "./routes/customSignsRoute.js";
import { registerDiagnosticsRoutes } from "./routes/diagnosticsRoutes.js";
import { registerGdprRoutes } from "./routes/gdprRoutes.js";
import { registerLandmarkTemplateRoute } from "./routes/landmarkTemplateRoute.js";
import { createLatestMlpModelHandler } from "./routes/latestMlpModelRoute.js";
import { registerMetacomRoutes } from "./routes/metacomRoutes.js";
import { registerMetacomSentenceRoutes } from "./routes/metacomSentenceRoutes.js";
import { registerModelMetadataRoutes } from "./routes/modelMetadataRoutes.js";
import { registerProfileRoutes } from "./routes/profileRoutes.js";
import { registerSymbolRoutes } from "./routes/symbolRoutes.js";
import { registerTrainingBundleRoute } from "./routes/trainingBundleRoute.js";
import { registerTrainingJobsRoutes } from "./routes/trainingJobsRoutes.js";
import { registerProfileLabelRoutes } from "./routes/profileLabelRoutes.js";
import { registerUserRoutes } from "./routes/userRoutes.js";
import { registerUtilityRoutes } from "./routes/utilityRoutes.js";
import { createEmailService } from "./services/emailService.js";
import logger from "./services/logger.js";
import {
	applyModelResponseHeaders,
	sendBinaryModel,
	writeMinimalMlpModel,
} from "./services/mlpModelArtifacts.js";
import {
	findReusableBundleTrainingJob,
	releaseCompletedBundleTrainingJob,
} from "./services/bundleTrainingJobState.js";
import { writeProfileBackup } from "./services/profileDataService.js";
import {
	readLatestPostTrainingCadenceSummary,
	runPostTrainingCadenceCycle,
} from "./services/postTrainingCadenceService.js";
import {
	appendDgsSamples,
	appendTrainingReportEntry,
	loadDgsSamples,
	loadTrainingManifest,
} from "./services/trainingJsonStore.js";
import {
	ensureProfileRecord,
	loadProfileRegistry,
	type ProfileRegistry,
	saveProfileRegistry,
	UUID_REGEX,
} from "./services/profileRegistry.js";
import { ingestTrainingBundlesIntoDataset } from "./services/trainingBundleIngestor.js";
import { parseEpochSchedule, resolveTrainingScore } from "./services/profileTrainingTuning.js";
import type { ManifestEntry } from "./types.js";
import { withFileLock } from "./utils/fileLock.js";
import { loadManifestEntries } from "./utils/manifestUtils.js";
import { resolvePythonExecutable, withProjectPythonPath } from "./utils/pythonExecutable.js";
import { isProfileAuthorized } from "./utils/profileAuthorization.js";

export const app = createConfiguredApp();
const { apiLimiter, modelMetadataLimiter, trainingLimiter, healthLimiter } =
	createServerRateLimiters();

async function collectLabelCounts(): Promise<{
	globalCounts: Record<string, number>;
	profileCounts: Map<string, Record<string, number>>;
}> {
	const globalCounts: Record<string, number> = {};
	const profileCounts = new Map<string, Record<string, number>>();
	const samples = loadDgsSamples<unknown>().samples;
	for (const sample of samples) {
		if (!sample || typeof sample !== "object") continue;
		const row = sample as { label?: unknown; profileId?: unknown };
		const label = typeof row.label === "string" ? row.label : undefined;
		if (!label) continue;
		globalCounts[label] = (globalCounts[label] || 0) + 1;
		const profileId =
			typeof row.profileId === "string" ? row.profileId : undefined;
		if (profileId && PROFILE_ID_PATTERN.test(profileId)) {
			const existing = profileCounts.get(profileId) ?? {};
			existing[label] = (existing[label] || 0) + 1;
			profileCounts.set(profileId, existing);
		}
	}

	return { globalCounts, profileCounts };
}

async function logTraining(message: string): Promise<void> {
	try {
		await fs.mkdir(DATA_DIR, { recursive: true });
		const line = `${new Date().toISOString()} ${message}\n`;
		await fs.appendFile(path.join(DATA_DIR, "training-debug.log"), line);
		await fs.appendFile(path.join(SERVER_DIR, "training-debug.log"), line);
	} catch (err) {
		console.warn("training log failed:", err);
	}
}
// Apply generic rate limiting to API namespace
app.use("/api", apiLimiter);

// API Versioning middleware
app.use("/api/v1", (_req: Request, res: Response, next: Function) => {
	res.setHeader("X-API-Version", "1.0.0");
	next();
});

// Simple in-memory training job registry
type TrainStatus = "queued" | "running" | "completed" | "failed";
interface TrainingJob {
	id: string;
	status: TrainStatus;
	progress: number; // 0..100
	queueDepth?: number;
	retryAfterMs?: number;
	error?: string;
	startedAt?: number;
	endedAt?: number;
	metrics?: Record<string, unknown>;
	report?: Record<string, unknown>;
	message?: string;
}

type TrainingRunProfileSummary = {
	profileId: string;
	accuracy: number;
	f1Score: number;
	samples: number;
	confusionMatrix: number[][];
	labels: string[];
	datasetHealth?: Record<string, unknown>;
};

// Define reusable landmark validation schema at module level
const LandmarkTupleSchema = z
	.tuple([z.number().finite(), z.number().finite(), z.number().finite()])
	.refine(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1, {
		message: "landmarks must be valid landmark points in range [0,1] for x,y",
	});

const FrameSchema = z.object({
	timestampMs: z.number().finite(),
	landmarks: z.array(LandmarkTupleSchema),
	poseLandmarks: z.array(z.array(z.number().finite())).optional(),
	faceLandmarks: z.array(z.array(z.number().finite())).optional(),
});

type TrainingSample = {
	signId: string;
	profileId?: string | null;
	landmarkData: number[][] | z.infer<typeof FrameSchema>[];
};
const trainingJobs = new Map<string, TrainingJob>();

interface TrainingQueueEntry {
	job: TrainingJob;
	samples: TrainingSample[];
	triggeredByBundles: boolean;
	resolve: (job: TrainingJob) => void;
}

const trainingQueue: TrainingQueueEntry[] = [];
let isProcessingTrainingQueue = false;
let activeBundleTrainingJobId: string | null = null;

let trainingManifestCache: {
	entries: ManifestEntry[];
	timestamp: number;
} | null = null;

function invalidateTrainingManifestCache(): void {
	trainingManifestCache = null;
}

async function getCachedManifestEntries(): Promise<ManifestEntry[]> {
	if (trainingManifestCache && Date.now() - trainingManifestCache.timestamp < config.trainingManifestCacheTtlMs) {
		return trainingManifestCache.entries;
	}

	const entries = await loadManifestEntries();
	trainingManifestCache = {
		entries,
		timestamp: Date.now(),
	};
	return entries;
}

registerDiagnosticsRoutes(app, {
	healthLimiter,
	getPendingTrainingJobs: () => trainingQueue.length,
	getTrainingManifestEntries: getCachedManifestEntries,
});

async function processTrainingQueue(): Promise<void> {
	if (isProcessingTrainingQueue) {
		return;
	}
	isProcessingTrainingQueue = true;
	try {
		while (trainingQueue.length > 0) {
			const entry = trainingQueue.shift();
			if (!entry) {
				continue;
			}
			try {
				await executeTrainingQueueEntry(entry);
			} catch (error) {
				console.error("Training queue execution failed", error);
			}
		}
	} finally {
		isProcessingTrainingQueue = false;
		// If new entries arrived while winding down, restart processing so they do not stall.
		if (trainingQueue.length > 0) {
			void processTrainingQueue();
		}
	}
}

async function executeTrainingQueueEntry(
	entry: TrainingQueueEntry,
): Promise<void> {
	const { job } = entry;
	job.status = "running";
	job.startedAt = Date.now();
	job.queueDepth = 0;
	job.retryAfterMs = undefined;
	trainingJobs.set(job.id, job);

	try {
		await runTrainingWorkflow(
			job.id,
			job,
			entry.samples,
			entry.triggeredByBundles,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		job.status = "failed";
		job.error = message;
		job.endedAt = Date.now();
		console.error(`Training job ${job.id} failed:`, error);
		await logTraining(`job ${job.id}: failed ${message}`);
	} finally {
		activeBundleTrainingJobId = releaseCompletedBundleTrainingJob(
			activeBundleTrainingJobId,
			job,
		);
		trainingJobs.set(job.id, job);
		entry.resolve(job);
	}
}

// Utility to generate cryptographically secure unique ids
const genId = () => Date.now().toString(36) + randomBytes(4).toString("hex");

// Initialize database before starting server
let dbInstance: Database;
let profileRegistry: ProfileRegistry;
export const databaseReady: Promise<Database> = setupDatabase(DB_FILE_PATH)
	.then(async (db) => {
		if (!db) {
			throw new Error("Database initialization failed: setupDatabase returned falsy");
		}
		dbInstance = db;
		app.locals.dbInstance = db;
		profileRegistry = await loadProfileRegistry(PROFILE_REGISTRY_PATH);
		let registryDirty = false;
		for (const profile of db.profiles) {
			if (!UUID_REGEX.test(profile.id)) {
				throw new Error(`Ungültige Profil-ID in der Datenbank: ${profile.id}`);
			}
			const beforeCount = profileRegistry.profiles.length;
			ensureProfileRecord(profileRegistry, {
				id: profile.id,
				displayName: profile.displayName || "Profil",
			});
			if (profileRegistry.profiles.length !== beforeCount) {
				registryDirty = true;
			}
		}
		app.locals.profileRegistry = profileRegistry;
		// Zero profiles is acceptable at startup - profiles are created via user registration
		if (registryDirty) {
			await withFileLock(PROFILE_REGISTRY_PATH, async () =>
				saveProfileRegistry(PROFILE_REGISTRY_PATH, profileRegistry),
			);
		}
		registerGdprRoutes(app, {
			authMiddleware: auth,
			db,
			dbFilePath: DB_FILE_PATH,
			registry: profileRegistry,
			registryPath: PROFILE_REGISTRY_PATH,
			saveRegistry: saveProfileRegistry,
			withFileLock,
			logError: (message, meta) => logger.error(message, meta),
		});
		registerProfileRoutes(app, {
			authMiddleware: auth,
			db,
			dbFilePath: DB_FILE_PATH,
			registry: profileRegistry,
			registryPath: PROFILE_REGISTRY_PATH,
			withFileLock,
			saveRegistry: saveProfileRegistry,
			logError: (message, meta) => logger.error(message, meta),
		});
		registerMetacomRoutes(app, { authMiddleware: auth, db, registry: profileRegistry });
		registerMetacomSentenceRoutes(app);
		const emailService = createEmailService();
		registerAuthRoutes(app, {
			db,
			dbFilePath: DB_FILE_PATH,
			registry: profileRegistry,
			registryPath: PROFILE_REGISTRY_PATH,
			saveRegistry: saveProfileRegistry,
			withFileLock,
			emailService,
		});
		registerUserRoutes(app, {
			db,
			dbFilePath: DB_FILE_PATH,
			authMiddleware: auth,
		});
		registerProfileLabelRoutes(app, {
			authMiddleware: auth,
			db,
			registry: profileRegistry,
			logError: (msg, meta) => logger.error(msg, meta),
		});
		registerSymbolRoutes(app, db, apiLimiter);
		return db;
	})
	.catch((err) => {
		console.error("Database setup failed:", err);
		throw err;
	});

databaseReady
	.then(() => {
		void runProfileBackupCycle();
		const timer = setInterval(
			() => {
				void runProfileBackupCycle();
			},
			config.profileBackupIntervalHours * 60 * 60 * 1000,
		);
		timer.unref();
	})
	.catch((error) => {
		logger.warn("Profile backup automation skipped", { error: String(error) });
	});

databaseReady
	.then(() => {
		if (!config.postTrainingCadenceEnabled) {
			return;
		}
		const runCadence = async (reason: "startup" | "interval") => {
			try {
				const summary = await runPostTrainingCadenceCycle({
					dryRun: false,
					retentionDays: config.postTrainingCadenceRetentionDays,
				});
				logger.info("Post-training cadence cycle completed", {
					reason,
					report: summary.outputs.latestJsonPath,
					retryEligibleInterrupted:
						summary.totals.retryEligibleInterrupted,
					retentionCandidates: summary.totals.retentionCandidates,
					removedJobIds: summary.retention.removedJobIds,
				});
			} catch (error) {
				logger.warn("Post-training cadence cycle failed", {
					reason,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		};

		void runCadence("startup");
		const timer = setInterval(
			() => {
				void runCadence("interval");
			},
			config.postTrainingCadenceIntervalHours * 60 * 60 * 1000,
		);
		timer.unref();
	})
	.catch((error) => {
		logger.warn("Post-training cadence automation skipped", {
			error: String(error),
		});
	});

async function resolveProfileId(
	value?: string | null,
): Promise<{ profileId: string | null }> {
	if (!value) {
		return { profileId: null };
	}
	const trimmed = value.trim();
	// Check SQLite database first (primary source after migration)
	const inDb = dbInstance?.profiles.some((p) => p.id === trimmed) ?? false;
	if (inDb) {
		return { profileId: trimmed };
	}
	// Fall back to profile registry (JSON) for caregiver/device metadata
	const inRegistry =
		profileRegistry?.profiles.some((profile) => profile.id === trimmed) ??
		false;
	return { profileId: inRegistry ? trimmed : null };
}

async function runProfileBackupCycle(): Promise<void> {
	if (!profileRegistry) return;
	const intervalMs = config.profileBackupIntervalHours * 60 * 60 * 1000;
	const now = Date.now();

	const latestBackups = new Map<string, number>();
	for (const backup of profileRegistry.backups) {
		const backupTime = new Date(backup.createdAt).getTime();
		const existingTime = latestBackups.get(backup.profileId) ?? 0;
		if (backupTime > existingTime) {
			latestBackups.set(backup.profileId, backupTime);
		}
	}

	for (const profile of profileRegistry.profiles) {
		const lastBackupTime = latestBackups.get(profile.id) ?? 0;
		if (now - lastBackupTime < intervalMs) {
			continue;
		}
		try {
			const backup = await writeProfileBackup(
				profile.id,
				profileRegistry,
				dbInstance,
			);
			const createdAt = new Date().toISOString();
			profileRegistry.backups.push({
				profileId: profile.id,
				createdAt,
				path: backup.path,
				sizeBytes: backup.sizeBytes,
				checksum: backup.checksum,
			});
			latestBackups.set(profile.id, new Date(createdAt).getTime()); // Keep map up-to-date
			await withFileLock(PROFILE_REGISTRY_PATH, async () =>
				saveProfileRegistry(PROFILE_REGISTRY_PATH, profileRegistry),
			);
		} catch (error) {
			logger.warn("Profile backup automation failed", {
				profileId: profile.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}

function startTrainingJob(
	samples: TrainingSample[],
	trigger: "bundles" | null = null,
): {
	jobId: string;
	status: TrainStatus;
	completion: Promise<TrainingJob>;
	queueDepth: number;
	retryAfterMs: number;
} {
	const isQueueIdle = !isProcessingTrainingQueue && trainingQueue.length === 0;
	const queuedBefore = trainingQueue.length;
	const runningJobs = isProcessingTrainingQueue ? 1 : 0;
	const queueDepth = queuedBefore + runningJobs;
	const retryAfterMs = queueDepth > 0 ? 1000 : 0;
	if (trigger === "bundles") {
		const reusableBundleJob = findReusableBundleTrainingJob(
			activeBundleTrainingJobId,
			trainingJobs,
		);
		if (reusableBundleJob) {
			return {
				jobId: reusableBundleJob.id,
				status: reusableBundleJob.status,
				completion: Promise.resolve(reusableBundleJob as TrainingJob),
				queueDepth: reusableBundleJob.queueDepth ?? queueDepth,
				retryAfterMs: reusableBundleJob.retryAfterMs ?? retryAfterMs,
			};
		}
	}
	const id = genId();
	const initialStatus: TrainStatus = isQueueIdle ? "running" : "queued";
	const job: TrainingJob = {
		id,
		status: initialStatus,
		progress: 0,
		queueDepth,
		retryAfterMs: retryAfterMs || undefined,
	};
	trainingJobs.set(id, job);
	if (trigger === "bundles") {
		activeBundleTrainingJobId = id;
	}

	let resolveCompletion: (job: TrainingJob) => void = () => {};
	const completion = new Promise<TrainingJob>((resolve) => {
		resolveCompletion = resolve;
	});

	trainingQueue.push({
		job,
		samples,
		triggeredByBundles: trigger === "bundles",
		resolve: resolveCompletion,
	});
	void processTrainingQueue();

	if (initialStatus === "queued") {
		void logTraining(`job ${id}: queued (trigger=${trigger ?? "manual"})`);
	}

	return {
		jobId: id,
		status: initialStatus,
		completion,
		queueDepth,
		retryAfterMs,
	};
}

async function runTrainingWorkflow(
	id: string,
	job: TrainingJob,
	samples: TrainingSample[],
	triggeredByBundles: boolean,
): Promise<void> {
	const workflowStartMs = Date.now();
	await ensureDataDir();
	await logTraining(`job ${id}: data dir ready at ${DATA_DIR}`);

	const toAdd = samples.map((s) => ({
		id: genId(),
		label: s.signId,
		profileId: s.profileId ?? undefined,
		landmarks: s.landmarkData,
		ts: Date.now(),
	}));

	if (toAdd.length > 0) {
		appendDgsSamples(toAdd);
		await logTraining(`job ${id}: samples appended (${toAdd.length})`);
	} else if (triggeredByBundles) {
		await logTraining(
			`job ${id}: triggered by bundle manifest with no inline samples`,
		);
	}

	let bundleFrames = 0;
	let latestCapturedAt: string | undefined;
	try {
		const result = await ingestTrainingBundlesIntoDataset();
		bundleFrames = result.appended;
		latestCapturedAt = result.latestCapturedAt;
		if (bundleFrames > 0) {
			await logTraining(
				`job ${id}: ingested ${bundleFrames} frames from training bundles`,
			);
		}
	} catch (err) {
		logger.error(`job ${id}: failed to ingest training bundles`, {
			error: err,
		});
		await logTraining(`job ${id}: failed to ingest training bundles`);
	}

	const { globalCounts, profileCounts } = await collectLabelCounts();
	await logTraining(
		`job ${id}: label counts computed global=${Object.keys(globalCounts).length}`,
	);

	const profileIdSet = new Set<string>();
	Array.from(profileCounts.keys()).forEach((pid) => {
		profileIdSet.add(pid);
	});
	for (const pid of samples
		.map((s) => s.profileId)
		.filter((p): p is string => !!p && PROFILE_ID_PATTERN.test(p))) {
		profileIdSet.add(pid);
	}
	const profileIds = Array.from(profileIdSet);

	try {
		for (const pid of profileIds) {
			const dest = getMlpModelPath(pid);
			const counts = profileCounts.get(pid) ?? {};
			await writeMinimalMlpModel(dest, counts, logTraining);
			await logTraining(`job ${id}: seeded MLP for ${pid}`);
		}
	} catch (e) {
		console.error("Failed to prepare early MLP model:", e);
		await logTraining(`job ${id}: minimal MLP failed ${String(e)}`);
	}

	const scriptPath = config.mlpScript;
	const serverRoot = SERVER_DIR;
	const manifestSnapshot = loadTrainingManifest<unknown>();
	const trainingManifestSnapshotDir = path.join(DATA_DIR, "training-snapshots");
	await fs.mkdir(trainingManifestSnapshotDir, { recursive: true });
	const trainingManifestSnapshotPath = path.join(
		trainingManifestSnapshotDir,
		`training-manifest-${id}-${randomBytes(6).toString("hex")}.json`,
	);
	await fs.writeFile(
		trainingManifestSnapshotPath,
		JSON.stringify(manifestSnapshot, null, 2),
		"utf8",
	);
	const scriptArgs = [
		path.isAbsolute(scriptPath)
			? scriptPath
			: path.join(serverRoot, scriptPath),
		"--manifest",
		trainingManifestSnapshotPath,
		"--data-dir",
		DATA_DIR,
	];
	const useFewShotRunner =
		path.basename(scriptPath).includes("train_mlp_fewshot");
	const fewShotShots = "1,3,5";
	const fewShotSeeds = "42,1337,2025";
	const fewShotTestProfileFraction = "0.2";

	if (process.env.AMY_SKIP_DGS_EXAMPLES === "true") {
		scriptArgs.push("--skip-examples");
	}

	const trainingSchedule = parseEpochSchedule(
		process.env.AMY_PROFILE_TRAINING_EPOCH_SCHEDULE,
		[20, 40, 80],
	);
	const usableAccuracyThreshold = Number.parseFloat(
		process.env.AMY_PROFILE_TRAINING_USABLE_ACCURACY ?? "0.35",
	);
	const targetProfileIds = Array.from(
		new Set(
			samples
				.map((sample) => sample.profileId)
				.filter((profileId): profileId is string => !!profileId),
		),
	);
	const scoreProfileId = targetProfileIds.length === 1 ? targetProfileIds[0] : null;

	const trainStartMs = Date.now();
	let bestReport: Record<string, unknown> = {};
	let bestScore = -1;
	let bestAttempt = 0;
	let lastStderr = "";
	let fewShotOutputDir: string | null = null;

	try {
		const executeAttempt = async (attempt: number, attemptArgs: string[]) => {
			const runReport = await new Promise<{ stdout: string; stderr: string }>(
				(resolve, reject) => {
					const proc = spawn(resolvePythonExecutable(), attemptArgs, {
						cwd: serverRoot,
						env: withProjectPythonPath(),
					});
					let stdout = "";
					let stderr = "";
					let settled = false;
					const timer = setTimeout(() => {
						if (settled) return;
						settled = true;
						proc.kill("SIGKILL");
						reject(
							new Error(`train_mlp timed out after ${config.trainingTimeoutMs}ms`),
						);
					}, config.trainingTimeoutMs);
					timer.unref();
					proc.stdout?.on("data", (chunk: Buffer) => {
						stdout += chunk.toString();
					});
					proc.stderr?.on("data", (chunk: Buffer) => {
						stderr += chunk.toString();
					});
					proc.on("error", (error) => {
						if (settled) return;
						settled = true;
						clearTimeout(timer);
						reject(error);
					});
					proc.on("close", (code) => {
						if (settled) return;
						settled = true;
						clearTimeout(timer);
						if (code === 0) {
							resolve({ stdout, stderr });
						} else {
							reject(new Error(stderr || `train_mlp exited with code ${code}`));
						}
					});
				},
			);

			lastStderr = runReport.stderr.trim();
			if (lastStderr.length > 0) {
				await logTraining(
					`job ${id}: train_mlp stderr attempt ${attempt} ${lastStderr}`,
				);
			}

			let parsedReport: Record<string, unknown> = {};
			const stdoutText = runReport.stdout.trim();
			if (stdoutText.length > 0) {
				try {
					parsedReport = JSON.parse(stdoutText);
				} catch (fullParseError) {
					try {
						const lines = stdoutText.split(/\r?\n/).filter(Boolean);
						parsedReport = JSON.parse(lines[lines.length - 1]);
					} catch (lastLineParseError) {
						await logTraining(
							`job ${id}: failed to parse training report attempt ${attempt} (full text: ${String(fullParseError)}, last line: ${String(lastLineParseError)})`,
						);
						throw new Error(
							`job ${id}: failed to parse training report JSON for attempt ${attempt}`,
						);
					}
				}
			}
			return parsedReport;
		};

		if (useFewShotRunner) {
			fewShotOutputDir = path.join(
				DATA_DIR,
				"fewshot-runs",
				`${id}-${randomBytes(4).toString("hex")}`,
			);
			const fewShotArgs = [
				...scriptArgs,
				"--output-dir",
				fewShotOutputDir,
				"--shots",
				fewShotShots,
				"--seeds",
				fewShotSeeds,
				"--test-profile-fraction",
				fewShotTestProfileFraction,
				"--promote-best-model-dir",
				MLP_MODELS_DIR,
				"--preserve-global-model",
			];
			await logTraining(
				`job ${id}: few-shot runner enabled (shots=${fewShotShots}, seeds=${fewShotSeeds})`,
			);
			const parsedReport = await executeAttempt(1, fewShotArgs);
			bestScore = resolveTrainingScore(parsedReport, scoreProfileId);
			bestReport = parsedReport;
			bestAttempt = 1;
			const diagnostics =
				parsedReport.diagnostics as
					| { fallback_metric_count?: number; fallback_metric_trials?: unknown[] }
					| undefined;
			const fallbackMetricCount =
				typeof diagnostics?.fallback_metric_count === "number"
					? diagnostics.fallback_metric_count
					: 0;
			if (fallbackMetricCount > 0) {
				await logTraining(
					`job ${id}: few-shot diagnostics fallback_metric_count=${fallbackMetricCount}`,
				);
			}
			const promotion =
				parsedReport.promotion as
					| { promoted?: boolean; reason?: string; source?: string; destination?: string }
					| undefined;
			if (promotion && promotion.promoted === false) {
				await logTraining(
					`job ${id}: few-shot promotion skipped reason=${promotion.reason ?? "unknown"}`,
				);
			}
			await logTraining(`job ${id}: few-shot best score=${bestScore.toFixed(4)}`);
		} else {
			for (let attemptIndex = 0; attemptIndex < trainingSchedule.length; attemptIndex += 1) {
				const attempt = attemptIndex + 1;
				const epochs = trainingSchedule[attemptIndex];
				const attemptArgs = [
					...scriptArgs,
					"--skip-global-output",
					"--epochs",
					String(epochs),
					"--seed",
					String(20260301 + attempt),
				];
				await logTraining(
					`job ${id}: train attempt ${attempt}/${trainingSchedule.length} (epochs=${epochs})`,
				);
				const parsedReport = await executeAttempt(attempt, attemptArgs);

				const score = resolveTrainingScore(parsedReport, scoreProfileId);
				if (score > bestScore) {
					bestScore = score;
					bestReport = parsedReport;
					bestAttempt = attempt;
				}
				await logTraining(`job ${id}: attempt ${attempt} score=${score.toFixed(4)}`);
				if (score >= usableAccuracyThreshold) {
					await logTraining(
						`job ${id}: usable score reached (${score.toFixed(4)} >= ${usableAccuracyThreshold})`,
					);
					break;
				}
			}
		}
	} finally {
		await fs.rm(trainingManifestSnapshotPath, { force: true }).catch(() => {});
		if (fewShotOutputDir) {
			await fs.rm(fewShotOutputDir, { recursive: true, force: true }).catch(() => {});
		}
	}

	const trainDurationMs = Date.now() - trainStartMs;
	if (lastStderr.length > 0) {
		await logTraining(`job ${id}: final train_mlp stderr ${lastStderr}`);
	}

	const parsedReport = bestReport;

	job.progress = 100;
	job.status = "completed";
	job.endedAt = Date.now();
	const captureToTrainMs = latestCapturedAt
		? Date.now() - Date.parse(latestCapturedAt)
		: null;
	if (captureToTrainMs && captureToTrainMs > config.trainingSlaMs) {
		logger.warn("Training SLA exceeded (capture-to-train)", {
			jobId: id,
			captureToTrainMs,
			slaMs: config.trainingSlaMs,
		});
	}
	if (trainDurationMs > config.trainingSlaMs) {
		logger.warn("Training SLA exceeded (training duration)", {
			jobId: id,
			trainDurationMs,
			slaMs: config.trainingSlaMs,
		});
		throw new Error(
			`Training überschreitet das SLA (${trainDurationMs}ms > ${config.trainingSlaMs}ms)`,
		);
	}
	const globalMetrics = parsedReport.global as
		| { accuracy?: unknown; samples?: unknown }
		| undefined;
	const diagnostics = parsedReport.diagnostics as
		| { fallback_metric_count?: unknown }
		| undefined;
	const promotion = parsedReport.promotion as { promoted?: unknown } | undefined;
	const bestTrialGlobalMetrics = (
		parsedReport.best_trial as
			| { raw_report?: { global?: { samples?: unknown } } }
			| undefined
	)?.raw_report?.global;

	job.metrics = {
		bestAttempt,
		usableAccuracyThreshold,
		trainingSchedule,
		targetProfileId: scoreProfileId,
		accuracy: typeof globalMetrics?.accuracy === "number" ? globalMetrics.accuracy : 0,
		samples:
			typeof globalMetrics?.samples === "number"
				? globalMetrics.samples
				: typeof bestTrialGlobalMetrics?.samples === "number"
					? bestTrialGlobalMetrics.samples
					: 0,
		bundleFrames,
		trainingDurationMs: trainDurationMs,
		captureToTrainMs,
		workflowDurationMs: Date.now() - workflowStartMs,
		fewShotFallbackMetricCount:
			typeof diagnostics?.fallback_metric_count === "number"
				? diagnostics.fallback_metric_count
				: 0,
		fewShotPromoted: typeof promotion?.promoted === "boolean" ? promotion.promoted : false,
	};
	job.report = parsedReport;
	job.message = "Dein Modell ist jetzt aktualisiert";
	try {
		const rawProfileReports = parsedReport.profiles;
		const profileReportsRaw =
			rawProfileReports &&
			typeof rawProfileReports === "object" &&
			!Array.isArray(rawProfileReports)
				? (rawProfileReports as Record<string, Record<string, unknown>>)
				: {};
		const profileSummaries: TrainingRunProfileSummary[] = Object.entries(
			profileReportsRaw,
		)
			.flatMap(([profileId, profileReport]) => {
				if (
					typeof profileId !== "string" ||
					profileId.trim().length === 0 ||
					!profileReport ||
					typeof profileReport !== "object"
				) {
					return [];
				}
				const confusionRaw = profileReport.confusion_matrix;
				const labelsRaw = profileReport.labels;
				return [{
					profileId,
					accuracy:
						typeof profileReport.accuracy === "number" ? profileReport.accuracy : 0,
					f1Score:
						typeof profileReport.f1_score === "number" ? profileReport.f1_score : 0,
					samples:
						typeof profileReport.samples === "number" ? profileReport.samples : 0,
					confusionMatrix: Array.isArray(confusionRaw)
						? confusionRaw.filter((row): row is number[] =>
							Array.isArray(row) && row.every((value) => typeof value === "number"),
						)
						: [],
					labels: Array.isArray(labelsRaw)
						? labelsRaw.filter((label): label is string => typeof label === "string")
						: [],
					datasetHealth:
						profileReport.dataset_health &&
						typeof profileReport.dataset_health === "object" &&
						!Array.isArray(profileReport.dataset_health)
							? (profileReport.dataset_health as Record<string, unknown>)
							: undefined,
				}];
			})
			.filter((entry) => entry.profileId.length > 0);
		appendTrainingReportEntry({
			runId: id,
			recordedAt: new Date().toISOString(),
			globalAccuracy:
				typeof globalMetrics?.accuracy === "number" ? globalMetrics.accuracy : 0,
			globalSamples:
				typeof globalMetrics?.samples === "number" ? globalMetrics.samples : 0,
			profiles: profileSummaries,
		});
	} catch (error) {
		logger.warn("Training report persistence failed", {
			jobId: id,
			error: error instanceof Error ? error.message : String(error),
		});
	}
	await logTraining(`job ${id}: completed synchronously`);
}

// Serve per-profile MLP models (NPZ) with containment checks
const latestMlpModelHandler = createLatestMlpModelHandler({
	getMlpModelPath,
	listAuthorizedProfileModelPaths: async (req: Request) => {
		if (!profileRegistry) {
			return [];
		}
		const candidates = await Promise.all(
			profileRegistry.profiles.map(async (profile) => {
				if (!isProfileAuthorized(req, profile.id, dbInstance, profileRegistry)) {
					return null;
				}
				const filePath = getMlpModelPath(profile.id);
				try {
					const stat = await fs.stat(filePath);
					if (!stat.isFile()) {
						return null;
					}
					return {
						profileId: profile.id,
						filePath,
						mtimeMs: stat.mtimeMs,
					};
				} catch {
					return null;
				}
			}),
		);
		return candidates.filter(
			(candidate): candidate is { profileId: string; filePath: string; mtimeMs: number } =>
				candidate !== null,
		);
	},
	sendBinaryModel,
	applyModelHeaders: applyModelResponseHeaders,
	logTraining,
	isProfileAuthorized: (req: Request, profileId: string) =>
		isProfileAuthorized(req, profileId, dbInstance, profileRegistry),
	resolveProfileId: resolveProfileId,
});
app.get("/api/v1/models/latest", auth, modelMetadataLimiter, latestMlpModelHandler);

registerTrainingBundleRoute(app, genId, {
	triggerTrainingJob: ({ bundleId, profileId, label }) => {
		try {
			const { jobId, status, queueDepth, retryAfterMs } = startTrainingJob(
				[],
				"bundles",
			);
			void logTraining(
				`job ${jobId}: scheduled automatically from bundle ${bundleId} (status=${status}, profile=${profileId}, label=${label})`,
			);
			return {
				jobId,
				status,
				pollUrl: `/api/v1/train-status/${jobId}`,
				queueDepth,
				...(retryAfterMs > 0 ? { retryAfterMs } : {}),
			};
		} catch (error) {
			console.error("Failed to schedule training after bundle upload:", error);
			return null;
		}
	},
	onManifestUpdated: invalidateTrainingManifestCache,
	resolveProfileId: resolveProfileId,
	isProfileAuthorized: (req: Request, profileId: string) =>
		isProfileAuthorized(req, profileId, dbInstance, profileRegistry),
});

registerCustomSignsRoute(app, {
	resolveProfileId: resolveProfileId,
	triggerTrainingJob: ({ bundleId, profileId, label }) => {
		try {
			const { jobId, status } = startTrainingJob([], "bundles");
			void logTraining(
				`job ${jobId}: scheduled automatically from sign registration ${bundleId} (status=${status}, profile=${profileId}, label=${label})`,
			);
		} catch (error) {
			console.error(
				"Failed to schedule training after sign registration:",
				error,
			);
		}
	},
});

registerLandmarkTemplateRoute(app, {
	resolveProfileId: resolveProfileId,
});

registerUtilityRoutes(app, {
	authMiddleware: auth,
	apiLimiter,
	dataDir: DATA_DIR,
	dbFilePath: DB_FILE_PATH,
	getDatabase: () => dbInstance,
	genId,
	getManifestEntries: getCachedManifestEntries,
	handLandmarksPerHand: HAND_LANDMARKS_PER_HAND,
	totalHandLandmarks: TOTAL_HAND_LANDMARKS,
	multimodalLandmarks: MULTIMODAL_LANDMARKS,
	profileIdPattern: PROFILE_ID_PATTERN,
	resolveProfileId,
	isProfileAuthorized: (req: Request, profileId: string) =>
		isProfileAuthorized(req, profileId, dbInstance, profileRegistry),
	withFileLock,
});

registerTrainingJobsRoutes(app, {
	authMiddleware: auth,
	trainingLimiter,
	healthLimiter,
	landmarkTupleSchema: LandmarkTupleSchema,
	frameSchema: FrameSchema,
	handLandmarksPerHand: HAND_LANDMARKS_PER_HAND,
	totalHandLandmarks: TOTAL_HAND_LANDMARKS,
	multimodalLandmarks: MULTIMODAL_LANDMARKS,
	startTrainingJob,
	trainingJobs,
	getLatestPostTrainingCadenceSummary: () => readLatestPostTrainingCadenceSummary(),
	isProfileAuthorized: (req: Request, profileId: string) =>
		isProfileAuthorized(req, profileId, dbInstance, profileRegistry),
});

registerModelMetadataRoutes(app, {
	authMiddleware: auth,
	modelMetadataLimiter,
	readServerPackageJson,
	collectLabelCounts,
	getMlpModelPath,
	isProfileAuthorized: (req: Request, profileId: string) =>
		isProfileAuthorized(req, profileId, dbInstance, profileRegistry),
	profileIdPattern: PROFILE_ID_PATTERN,
});

// Add error handling middleware
app.use(errorHandler);
startServerWhenReady(app, databaseReady);
