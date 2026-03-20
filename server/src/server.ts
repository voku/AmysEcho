import { spawn } from "child_process";
import { createHash, randomBytes } from "crypto";
import express, { type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
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
	PROFILE_ID_PATTERN,
	SERVER_DIR,
	TRAINING_MANIFEST_PATH,
} from "./constants/modelPaths.js";
import { PROFILE_REGISTRY_PATH } from "./constants/profileRegistryPaths.js";
import {
	addCorrection,
	addNegativeSample,
	type Database,
	logCorrection,
	saveDatabase,
	setupDatabase,
} from "./db.js";
import { auth } from "./middleware/auth.js";
import { registerAuthRoutes } from "./routes/authRoutes.js";
import { registerCustomSignsRoute } from "./routes/customSignsRoute.js";
import { registerGdprRoutes } from "./routes/gdprRoutes.js";
import { registerLandmarkTemplateRoute } from "./routes/landmarkTemplateRoute.js";
import { createLatestMlpModelHandler } from "./routes/latestMlpModelRoute.js";
import { registerMetacomRoutes } from "./routes/metacomRoutes.js";
import { registerMetacomSentenceRoutes } from "./routes/metacomSentenceRoutes.js";
import { registerPretrainingRoutes } from "./routes/pretrainingRoutes.js";
import { registerProfileRoutes } from "./routes/profileRoutes.js";
import { registerSymbolRoutes } from "./routes/symbolRoutes.js";
import { registerTrainingBundleRoute } from "./routes/trainingBundleRoute.js";
import { registerTrainingVideoRoutes } from "./routes/trainingVideoRoutes.js";
import { registerUserLabelRoutes } from "./routes/userLabelRoutes.js";
import { registerUserRoutes } from "./routes/userRoutes.js";
import {
	appendCrashReports,
	type CrashReport,
} from "./services/crashService.js";
import { createEmailService } from "./services/emailService.js";
import logger from "./services/logger.js";
import {
	applyModelResponseHeaders,
	seedBaselineModel,
	sendBinaryModel,
	writeMinimalMlpModel,
} from "./services/mlpModelArtifacts.js";
import { loadCustomSigns, writeProfileBackup } from "./services/profileDataService.js";
import {
	appendDgsSamples,
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
import { buildLabelManifest, getVideosForLabel, isValidLabel } from "./services/labelRegistry.js";
import { parseEpochSchedule, resolveTrainingScore } from "./services/profileTrainingTuning.js";
import type { Correction, ManifestEntry, NegativeSample } from "./types.js";
import { withFileLock } from "./utils/fileLock.js";
import { loadManifestEntries } from "./utils/manifestUtils.js";
import { resolvePythonExecutable, withProjectPythonPath } from "./utils/pythonExecutable.js";
import { buildTrainedLabelDescriptors, mergeTrainedLabels } from "./services/trainedLabelsService.js";
import { isProfileAuthorized } from "./utils/profileAuthorization.js";
import { httpsEnforcement, hstsHeaders } from "./middleware/httpsEnforcement.js";

export const app = express();

// Trust first proxy (Nginx) to correctly handle X-Forwarded-Proto
app.set("trust proxy", 1);

// Security middleware - must be first
// HTTPS enforcement (production only) and HSTS headers
app.use(httpsEnforcement);
app.use(hstsHeaders);

function getErrnoCode(error: unknown): string | undefined {
	return (error as NodeJS.ErrnoException | undefined)?.code;
}

async function readServerPackageJson(): Promise<Record<string, unknown>> {
	const candidates = [
		path.join(SERVER_DIR, "package.json"),
		path.join(SERVER_DIR, "..", "package.json"),
	];
	for (const candidate of candidates) {
		try {
			const raw = await fs.readFile(candidate, "utf8");
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === "object") {
				return parsed as Record<string, unknown>;
			}
		} catch (error) {
			if (getErrnoCode(error) !== "ENOENT") {
				throw error;
			}
		}
	}
	throw new Error("package.json not found");
}

// Increase JSON body size limit to accommodate base64 images from the app
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "8mb" }));

// Centralized error handling middleware
const errorHandler = (
	error: unknown,
	req: Request,
	res: Response,
	_next: Function,
) => {
	const errorRecord = error as {
		statusCode?: number;
		message?: string;
		stack?: string;
	};
	const statusCode =
		typeof errorRecord.statusCode === "number" ? errorRecord.statusCode : 500;
	const message =
		typeof errorRecord.message === "string"
			? errorRecord.message
			: "Internal server error";

	// Log detailed error for debugging
	logger.error(
		"Request error",
		{
			method: req.method,
			path: req.path,
			message: errorRecord.message,
			stack: errorRecord.stack,
			statusCode,
			url: req.url,
			userAgent: req.get("User-Agent"),
		},
		req.user?.id,
	);

	// Return user-friendly error message
	res.status(statusCode).json({
		error: statusCode === 500 ? "Internal server error" : message,
		...(config.nodeEnv === "development" && { details: message }),
	});
};

// Generic API rate limiter for server endpoints
const apiLimiter = rateLimit({
	windowMs: 60 * 1000,
	max: config.apiLimit,
	standardHeaders: true,
	legacyHeaders: false,
});

const modelMetadataLimiter = rateLimit({
	windowMs: 60 * 1000,
	max: config.modelMetadataLimit,
	standardHeaders: true,
	legacyHeaders: false,
});

const trainingLimiter = rateLimit({
	windowMs: 60 * 1000,
	max: config.trainingLimit, // Training operations are expensive, but caregivers may upload/poll in bursts
	standardHeaders: true,
	legacyHeaders: false,
	message: "Zu viele Trainingsanfragen. Bitte versuche es später erneut.",
	handler: (_req, res, _next, optionsUsed) => {
		const retryAfterSecs = Math.ceil(((optionsUsed.windowMs as number | undefined) ?? 60_000) / 1000);
		res.setHeader("Retry-After", String(retryAfterSecs));
		res.status(429).json({ error: "Zu viele Trainingsanfragen. Bitte versuche es später erneut." });
	},
});

const healthLimiter = rateLimit({
	windowMs: 1000,
	max: 100,
	standardHeaders: true,
	legacyHeaders: false,
});

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

// Cache for Python dependency check to avoid spawning process on every health check
let pythonDepsCheckCache: {
	status: "ok" | "error";
	message: string;
	timestamp: number;
} | null = null;
const PYTHON_DEPS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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

async function checkPythonDependencies(): Promise<{ status: "ok" | "error"; message: string }> {
	// Return cached result if still valid
	if (pythonDepsCheckCache && Date.now() - pythonDepsCheckCache.timestamp < PYTHON_DEPS_CACHE_TTL_MS) {
		return { status: pythonDepsCheckCache.status, message: pythonDepsCheckCache.message };
	}

	// Perform actual check
	try {
		const pythonExecutable = resolvePythonExecutable();
		await new Promise<void>((resolve, reject) => {
			const proc = spawn(
				pythonExecutable,
				["-c", "import numpy, sklearn, mediapipe; print('ok')"],
				{ env: withProjectPythonPath() },
			);
			let stderr = "";
			proc.stderr.on("data", (data) => { stderr += data; });
			proc.on("close", (code) => {
				if (code === 0) {
					resolve();
				} else {
					reject(new Error(`Python check failed with code ${code} using ${pythonExecutable}: ${stderr}`));
				}
			});
			proc.on("error", reject);
		});
		
		const result = {
			status: "ok" as const,
			message: `Required Python packages installed (numpy, sklearn, mediapipe) via ${pythonExecutable}`,
		};
		
		// Update cache
		pythonDepsCheckCache = { ...result, timestamp: Date.now() };
		return result;
	} catch (error) {
		const result = {
			status: "error" as const,
			message: error instanceof Error ? error.message : String(error),
		};
		
		// Cache error result too, but with shorter TTL (don't retry on every request)
		pythonDepsCheckCache = { ...result, timestamp: Date.now() };
		return result;
	}
}

const healthHandler = async (_req: Request, res: Response) => {
	const checks: Record<string, { status: string; message?: string; details?: unknown }> = {};
	let overallStatus = "ok";

	// Check database connectivity
	try {
		const dbExists = await fs.access(DB_FILE_PATH).then(() => true).catch(() => false);
		checks.database = {
			status: dbExists ? "ok" : "warning",
			message: dbExists ? "Database file accessible" : "Database file not found (will be created on first write)",
		};
	} catch (error) {
		checks.database = {
			status: "error",
			message: error instanceof Error ? error.message : String(error),
		};
		overallStatus = "degraded";
	}

	// Check global model availability
	try {
		const globalModelPath = getMlpModelPath();
		const modelExists = await fs.access(globalModelPath).then(() => true).catch(() => false);
		checks.globalModel = {
			status: modelExists ? "ok" : "warning",
			message: modelExists ? "Global model available" : "Global model not found (will be created on first training)",
			details: { path: globalModelPath },
		};
	} catch (error) {
		checks.globalModel = {
			status: "error",
			message: error instanceof Error ? error.message : String(error),
		};
		overallStatus = "degraded";
	}

	// Check Python dependencies (with caching)
	const pythonCheck = await checkPythonDependencies();
	checks.pythonDependencies = {
		status: pythonCheck.status,
		message: pythonCheck.message,
	};
	if (pythonCheck.status === "error") {
		overallStatus = "degraded";
	}

	const manifestEntries = loadTrainingManifest<unknown>().entries;
	checks.trainingManifest = {
		status: "ok",
		message: `Training manifest entries in SQLite: ${manifestEntries.length}`,
	};

	res.json({
		status: overallStatus,
		uptime: process.uptime(),
		pendingTrainingJobs: trainingQueue.length,
		checks,
		timestamp: new Date().toISOString(),
	});
};

app.use("/health", healthLimiter);
app.get("/health", healthHandler);

app.use("/api/v1/health", healthLimiter);
app.get("/api/v1/health", healthHandler);

// ========== Label Registry Endpoint ==========
// Amy First: Exposes the unified label registry for training data
app.get("/api/v1/labels", async (_req: Request, res: Response) => {
	try {
		const manifest = await buildLabelManifest();
		// Convert Map to plain object for JSON serialization using idiomatic Object.fromEntries
		const variationsObject = Object.fromEntries(manifest.variations);
		res.json({
			version: manifest.version,
			labels: manifest.labels,
			variations: variationsObject,
			stats: manifest.stats,
		});
	} catch (error) {
		console.error("Failed to load label manifest:", error);
		res.status(500).json({ error: "Fehler beim Laden der Gebärden-Labels" });
	}
});

app.get("/api/v1/labels/:labelId/videos", async (req: Request, res: Response) => {
	const { labelId } = req.params;
	if (!labelId) {
		return res.status(400).json({ error: "Label-ID erforderlich" });
	}
	
	// Sanitize labelId: only allow lowercase letters, digits, German umlauts (äöüß), and hyphens
	// German umlauts are intentionally permitted for Deutsche Gebärdensprache (DGS) labels
	// like "grün" (green). This prevents injection attacks while supporting German vocabulary.
	const sanitizedLabelId = labelId.toLowerCase().replace(/[^a-z0-9äöüß-]/g, "");
	if (sanitizedLabelId.length === 0 || sanitizedLabelId.length > 64) {
		return res.status(400).json({ error: "Ungültige Label-ID", labelId });
	}
	
	const valid = await isValidLabel(sanitizedLabelId);
	if (!valid) {
		return res.status(404).json({ error: "Unbekanntes Label", labelId: sanitizedLabelId });
	}
	
	const videos = await getVideosForLabel(sanitizedLabelId);
	return res.json({ labelId: sanitizedLabelId, videos, count: videos.length });
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
		trainingJobs.set(job.id, job);
		entry.resolve(job);
	}
}

export function buildTrainingStatusResponse(
	jobStore: Map<string, TrainingJob>,
	id: string,
): { status: number; body: Partial<TrainingJob> | { error: string } } {
	const job = jobStore.get(id);
	if (!job) {
		return { status: 404, body: { error: "Training job not found" } };
	}
	return { status: 200, body: job };
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
		registerTrainingVideoRoutes(app, { authMiddleware: auth, db, registry: profileRegistry });
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
		registerUserLabelRoutes(app, {
			authMiddleware: auth,
			db,
			registry: profileRegistry,
			logError: (msg, meta) => logger.error(msg, meta),
		});
		registerSymbolRoutes(app, db, apiLimiter);
		registerPretrainingRoutes(app);
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
		const baseModel = getMlpModelPath();
		await writeMinimalMlpModel(baseModel, globalCounts, logTraining);
		await logTraining(`job ${id}: seeded global MLP`);
		for (const pid of profileIds) {
			const dest = getMlpModelPath(pid);
			const counts = profileCounts.get(pid) ?? globalCounts;
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
	await fs.mkdir(path.dirname(TRAINING_MANIFEST_PATH), { recursive: true });
	const trainingManifestSnapshotPath = path.join(
		path.dirname(TRAINING_MANIFEST_PATH),
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

	try {
		for (let attemptIndex = 0; attemptIndex < trainingSchedule.length; attemptIndex += 1) {
			const attempt = attemptIndex + 1;
			const epochs = trainingSchedule[attemptIndex];
			const attemptArgs = [
				...scriptArgs,
				"--epochs",
				String(epochs),
				"--seed",
				String(20260301 + attempt),
			];
			await logTraining(
				`job ${id}: train attempt ${attempt}/${trainingSchedule.length} (epochs=${epochs})`,
			);

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
					const lines = stdoutText.split(/\r?\n/).filter(Boolean);
					parsedReport = JSON.parse(lines[lines.length - 1]);
				} catch (err) {
					await logTraining(
						`job ${id}: failed to parse training report attempt ${attempt} (${String(err)})`,
					);
				}
			}

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
	} finally {
		await fs.rm(trainingManifestSnapshotPath, { force: true }).catch(() => {});
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
	job.metrics = {
		bestAttempt,
		usableAccuracyThreshold,
		trainingSchedule,
		targetProfileId: scoreProfileId,
		accuracy:
			typeof (parsedReport.global as { accuracy?: unknown } | undefined)
				?.accuracy === "number"
				? ((parsedReport.global as { accuracy: number }).accuracy ?? 0)
				: 0,
		samples:
			typeof (parsedReport.global as { samples?: unknown } | undefined)
				?.samples === "number"
				? ((parsedReport.global as { samples: number }).samples ?? 0)
				: 0,
		bundleFrames,
		trainingDurationMs: trainDurationMs,
		captureToTrainMs,
		workflowDurationMs: Date.now() - workflowStartMs,
	};
	job.report = parsedReport;
	job.message = "Dein Modell ist jetzt aktualisiert";
	await logTraining(`job ${id}: completed synchronously`);
}

// Serve per-profile MLP models (NPZ) with containment checks
const latestMlpModelHandler = createLatestMlpModelHandler({
	getMlpModelPath,
	seedBaselineModel,
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

// Add a labeled DGS sample (landmarks normalized [0..1])
app.post("/api/v1/dgs/samples", auth, apiLimiter, async (req: Request, res: Response) => {
	try {
		const Body = z.object({
			label: z.string().min(1),
			profileId: z.string().optional(),
			// 21 (one hand), 42 (two hands), or 543 (multimodal: 42 + 33 + 468)
			landmarks: z
				.array(
					z.tuple([
						z.number().finite(),
						z.number().finite(),
						z.number().finite(),
					]),
				)
				.refine(
					(pts: [number, number, number][]) =>
						pts.length === HAND_LANDMARKS_PER_HAND ||
						pts.length === TOTAL_HAND_LANDMARKS ||
						pts.length === MULTIMODAL_LANDMARKS,
					"landmarks must be 21, 42 or 543 points",
				)
				.refine(
					(pts: [number, number, number][]) =>
						pts.every(
							([x, y, z]: [number, number, number]) =>
								x >= 0 && x <= 1 && y >= 0 && y <= 1 && Number.isFinite(z),
						),
					"landmarks must be within [0,1] for x,y",
				),
		});
		const parsed = Body.safeParse(req.body);
		if (!parsed.success) {
			return res
				.status(400)
				.json({
					error:
						"Label und gültige Landmarken (21, 42 oder 543 × [x,y,z]) erforderlich.",
					details: parsed.error.flatten(),
				});
		}
		const { label, profileId, landmarks } = parsed.data;
		if (profileId && !PROFILE_ID_PATTERN.test(profileId)) {
			return res.status(400).json({ error: "Ungültige Profil-ID." });
		}
		const resolvedProfile = await resolveProfileId(profileId ?? null);
		const resolvedProfileId = resolvedProfile.profileId ?? undefined;
		if (profileId && !resolvedProfileId) {
			return res.status(404).json({ error: "Profil nicht gefunden." });
		}
		if (resolvedProfileId && !isProfileAuthorized(req, resolvedProfileId, dbInstance, profileRegistry)) {
			return res.status(403).json({ error: "Zugriff verweigert." });
		}
			console.log(
				`Received DGS sample: label=${label}, profileId=${resolvedProfileId}, landmarks length=${landmarks.length}`,
			);
			appendDgsSamples([{
				id: genId(),
				label,
				profileId: resolvedProfileId,
				landmarks,
				ts: Date.now(),
			}]);
		res.json({ status: "ok" });
	} catch (error) {
		console.error("Error saving DGS sample:", error);
		res
			.status(500)
			.json({ error: "Beispiel konnte nicht gespeichert werden." });
	}
});

// Crash report ingestion
app.post("/api/v1/crash-reports", auth, apiLimiter, async (req: Request, res: Response) => {
	try {
		const payload: unknown[] = Array.isArray(req.body) ? req.body : [req.body];
		const valid: CrashReport[] = [];
		for (const r of payload) {
			if (!r || typeof r !== "object") continue;
			const candidate = r as Record<string, unknown>;
			if (
				typeof candidate.message !== "string" ||
				typeof candidate.timestamp !== "number"
			)
				continue;
			valid.push({
				id:
					typeof candidate.id === "string"
						? candidate.id
						: Date.now().toString(36),
				name: typeof candidate.name === "string" ? candidate.name : "Error",
				message: candidate.message,
				stack:
					typeof candidate.stack === "string" ? candidate.stack : undefined,
				timestamp: candidate.timestamp,
				extra:
					candidate.extra && typeof candidate.extra === "object"
						? (candidate.extra as Record<string, unknown>)
						: undefined,
			});
		}
		if (!valid.length)
			return res.status(400).json({ error: "No valid crash reports" });
		await appendCrashReports(valid);
		res.status(202).json({ status: "ok", saved: valid.length });
	} catch (error) {
		console.error("Error saving crash reports:", error);
		res.status(500).json({ error: "Failed to save crash reports" });
	}
});

const signToString = (g: unknown): string | null => {
	if (typeof g === "string") return g;
	if (g && typeof g === "object") {
		const { left, right } = g as { left?: unknown; right?: unknown };
		if (typeof left === "string" && typeof right === "string") {
			return `${left}+${right}`;
		}
	}
	return null;
};

const SignPayloadSchema = z.object({
	sign: z.union([
		z.string().min(1),
		z.object({ left: z.string().min(1), right: z.string().min(1) }),
	]),
});

app.post("/api/v1/corrections", auth, apiLimiter, async (req: Request, res: Response) => {
	const parsed = SignPayloadSchema.safeParse(req.body);
	if (!parsed.success) {
		return res
			.status(400)
			.json({ error: "Invalid correction", details: parsed.error.flatten() });
	}
	const signStr = signToString(parsed.data.sign)!;
	try {
		logCorrection(dbInstance, "unknown", signStr, null);
		const record: Correction = {
			id: genId(),
			predictedSign: "unknown",
			actualSign: signStr,
			confidence: 0,
			timestamp: Date.now(),
			isSynced: false,
		};
		addCorrection(dbInstance, record);
		// saveDatabase is now a no-op with SQLite, but kept for API compatibility
		await withFileLock(DB_FILE_PATH, async () =>
			saveDatabase(dbInstance, DB_FILE_PATH),
		);
		res.status(202).json({ status: "queued" });
	} catch (error) {
		console.error("Error logging correction:", error);
		res.status(500).json({ error: "Failed to log correction" });
	}
});

app.post(
	"/api/v1/negative-samples",
	auth,
	async (req: Request, res: Response) => {
		const parsed = SignPayloadSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({
				error: "Invalid negative sample",
				details: parsed.error.flatten(),
			});
		}
		const signStr = signToString(parsed.data.sign)!;
		try {
			const record: NegativeSample = {
				id: genId(),
				sign: signStr,
				timestamp: Date.now(),
			};
			addNegativeSample(dbInstance, record);
			await withFileLock(DB_FILE_PATH, async () =>
				saveDatabase(dbInstance, DB_FILE_PATH),
			);
			res.status(202).json({ status: "queued" });
		} catch (error) {
			console.error("Error logging negative sample:", error);
			res.status(500).json({ error: "Failed to log negative sample" });
		}
	},
);

app.post(
	"/train-model",
	auth,
	trainingLimiter,
	async (req: Request, res: Response) => {
		const SampleSchema = z.object({
			signId: z.string().min(1),
			profileId: z.string().optional(),
			landmarkData: z.union([
				z
					.array(LandmarkTupleSchema)
					.refine(
						(arr) =>
							arr.length === HAND_LANDMARKS_PER_HAND ||
							arr.length === TOTAL_HAND_LANDMARKS ||
							arr.length === MULTIMODAL_LANDMARKS,
						{
							message: "landmarks must be 21, 42 or 543 points",
						},
					),
				z
					.array(FrameSchema)
					.refine(
						(frames) =>
							frames.every(
								(f) =>
									f.landmarks.length === HAND_LANDMARKS_PER_HAND ||
									f.landmarks.length === TOTAL_HAND_LANDMARKS ||
									f.landmarks.length === MULTIMODAL_LANDMARKS,
							),
						{ message: "each frame must contain 21, 42 or 543 landmarks" },
					),
			]),
		});
		const BodySchema = z.object({
			samples: z.array(SampleSchema).optional(),
			trigger: z.enum(["bundles"]).optional(),
		});
		const parsed = BodySchema.safeParse(req.body);
		if (!parsed.success) {
			return res
				.status(400)
				.json({
					error: "Invalid samples payload.",
					details: parsed.error.flatten(),
				});
		}
		type Sample = z.infer<typeof SampleSchema>;
		const samples: Sample[] = parsed.data.samples ?? [];
		const triggeredByBundles = parsed.data.trigger === "bundles";
		if (samples.length === 0 && !triggeredByBundles) {
			return res.status(400).json({ error: "Samples array cannot be empty." });
		}
		
		// Check authorization for all profile-specific samples
		for (const sample of samples) {
			if (sample.profileId && !isProfileAuthorized(req, sample.profileId, dbInstance, profileRegistry)) {
				return res.status(403).json({ error: "Zugriff auf Profil verweigert." });
			}
		}
		
		const trainingSamples: TrainingSample[] = samples.map((sample) => ({
			signId: sample.signId,
			profileId: sample.profileId ?? null,
			landmarkData: sample.landmarkData,
		}));

		const { jobId, status, queueDepth, retryAfterMs } = startTrainingJob(
			trainingSamples,
			triggeredByBundles ? "bundles" : null,
		);

		const message =
			status === "queued"
				? "Trainingsauftrag wurde in die Warteschlange gestellt"
				: "Trainingsauftrag gestartet";

		if (retryAfterMs > 0) {
			res.setHeader("Retry-After", Math.ceil(retryAfterMs / 1000).toString());
		}

		res.status(202).json({
			status,
			jobId,
			pollUrl: `/api/v1/train-status/${jobId}`,
			message,
			queueDepth,
			...(retryAfterMs > 0 ? { retryAfterMs } : {}),
		});
	},
);

// Query training job status (explicit id)
app.get(
	"/api/v1/train-status/:id",
	auth,
	healthLimiter,
	(req: Request, res: Response) => {
		const id = req.params.id;
		const job = trainingJobs.get(id);
		if (!job) {
			return res.status(404).json({ id, status: "not_found" });
		}
		res.json(job);
	},
);

// Gracefully handle accidental empty-id requests
app.get(
	"/api/v1/train-status",
	auth,
	healthLimiter,
	(_req: Request, res: Response) => {
		res.status(400).json({ error: "Training job id is required." });
	},
);

// Query video training job status
app.get("/api/v1/training-status/:id", auth, apiLimiter, (req: Request, res: Response) => {
	const id = req.params.id;
	const result = buildTrainingStatusResponse(trainingJobs, id);
	res.status(result.status).json(result.body);
});

app.get(
	"/api/v1/models/version",
	auth,
	modelMetadataLimiter,
	async (_req: Request, res: Response) => {
		try {
			const pkg = await readServerPackageJson();
			const { version } = pkg;
			res.json({ version, modelPath: "/api/v1/models/latest" });
		} catch (err) {
			console.error("Failed to read model version:", err);
			res.status(500).json({ error: "Failed to read model version" });
		}
	},
);

async function resolveModelFile(
	profileId: string | undefined,
	res: Response,
	getPath: (profileId?: string) => string,
): Promise<string | undefined> {
	let file: string;
	try {
		file = getPath(profileId);
	} catch {
		res.status(400).json({ error: "Invalid profileId" });
		return;
	}

	// Resolve base directory first
	const base = await fs.realpath(DATA_DIR).catch(() => path.resolve(DATA_DIR));

	// Normalize the file path to remove any ".." segments
	// This prevents path traversal attacks
	const normalizedFile = path.resolve(file);

	// Check path containment BEFORE resolving symlinks
	const preCheckRelative = path.relative(base, normalizedFile);
	if (preCheckRelative.startsWith("..") || path.isAbsolute(preCheckRelative)) {
		res.status(403).json({ error: "Forbidden" });
		return;
	}

	// Resolve any symbolic links if the file exists
	const resolvedFile = await fs
		.realpath(normalizedFile)
		.catch(() => normalizedFile);

	// Check path containment again after resolving symlinks
	// This prevents symlink attacks that point outside the base directory
	const postCheckRelative = path.relative(base, resolvedFile);
	if (
		postCheckRelative.startsWith("..") ||
		path.isAbsolute(postCheckRelative)
	) {
		res.status(403).json({ error: "Forbidden" });
		return;
	}

	return resolvedFile;
}

// Model metadata: version, size, sha256
app.get(
	"/api/v1/models/metadata",
	auth,
	modelMetadataLimiter,
	async (req: Request, res: Response) => {
		const profileId =
			typeof req.query.profileId === "string" ? req.query.profileId : undefined;
		
		// Check authorization if accessing profile-specific model
		if (profileId && !isProfileAuthorized(req, profileId, dbInstance, profileRegistry)) {
			return res.status(403).json({ error: "Zugriff verweigert." });
		}
		
		const resolvedFile = await resolveModelFile(
			profileId,
			res,
			getMlpModelPath,
		);
		if (!resolvedFile) return;
		try {
			const pkg = await readServerPackageJson();
			const { version } = pkg;
			const stat = await fs.stat(resolvedFile);
			const buf = await fs.readFile(resolvedFile);
			const sha256 = createHash("sha256").update(buf).digest("hex");
			res.json({ version, size: stat.size, sha256 });
		} catch (err) {
			console.error("Failed to read model metadata:", err);
			res.status(404).json({ error: "Model not found" });
		}
	},
);

// List available profile models and their status
app.get("/api/models/profiles", auth, modelMetadataLimiter, async (req: Request, res: Response) => {
	try {
		const { profileCounts } = await collectLabelCounts();
		interface ProfileInfo {
			profileId: string;
			modelAvailable: boolean;
			signCount: number;
			lastUpdated?: Date;
		}
		const profiles: ProfileInfo[] = [];

		const modelsDir = path.join(DATA_DIR, "models");
		let modelDirs: string[] = [];
		try {
			modelDirs = await fs.readdir(modelsDir);
			} catch {
				// Models dir might not exist yet
			}

		for (const pid of modelDirs) {
			if (pid === "global" || !PROFILE_ID_PATTERN.test(pid)) continue;
			
			// Only include profiles the user has access to
			if (!isProfileAuthorized(req, pid, dbInstance, profileRegistry)) {
				continue;
			}

			const modelPath = getMlpModelPath(pid);
			let modelAvailable = false;
			let lastUpdated: Date | undefined;

			try {
				const stat = await fs.stat(modelPath);
				modelAvailable = true;
				lastUpdated = stat.mtime;
				} catch {
					// Model not built yet
				}

			const counts = profileCounts.get(pid) || {};
			const signCount = Object.values(counts).reduce((a, b) => a + b, 0);

			profiles.push({
				profileId: pid,
				modelAvailable,
				signCount,
				...(lastUpdated ? { lastUpdated } : {}),
			});
		}

		// Add profiles that have data but no model file yet
		for (const [pid, counts] of profileCounts.entries()) {
			if (!profiles.find((p) => p.profileId === pid)) {
				// Only include if user has access to this profile
				if (isProfileAuthorized(req, pid, dbInstance, profileRegistry)) {
					profiles.push({
						profileId: pid,
						modelAvailable: false,
						signCount: Object.values(counts).reduce((a, b) => a + b, 0),
					});
				}
			}
		}

		res.json(profiles);
	} catch (error) {
		console.error("Failed to list profile models:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// Get labels that have at least one sample for a profile
app.get(
	"/api/v1/dgs/trained-labels",
	auth,
	async (req: Request, res: Response) => {
		try {
			const profileId =
				typeof req.query.profileId === "string"
					? req.query.profileId
					: undefined;
			if (!profileId) {
				return res.status(400).json({ error: "profileId required" });
			}
			
			// Check authorization before returning profile-specific data
			if (!isProfileAuthorized(req, profileId, dbInstance, profileRegistry)) {
				return res.status(403).json({ error: "Zugriff verweigert." });
			}

			const manifestEntries = await getCachedManifestEntries();
			const trainedLabels = mergeTrainedLabels(profileId, manifestEntries);
			const customSigns = await loadCustomSigns();
			const labelDescriptors = buildTrainedLabelDescriptors(
				profileId,
				trainedLabels,
				Array.isArray(customSigns.signs) ? customSigns.signs : [],
			);

			res.json({ profileId, trainedLabels, labelDescriptors });
		} catch (error) {
			console.error("Failed to get trained labels:", error);
			res.status(500).json({ error: "Internal server error" });
		}
	},
);

// Get normalization configuration
app.get(
	"/api/v1/config/normalization",
	auth,
	async (_req: Request, res: Response) => {
		try {
			const configPath = path.join(
				DATA_DIR,
				"config",
				"normalization_config.json",
			);
			const raw = await fs.readFile(configPath, "utf8");
			res.json(JSON.parse(raw));
		} catch {
			// Return defaults if config missing
			res.json({
				priority_factors: {
					hands: 4.0,
					pose: 0.2,
					face: 0.05,
				},
			});
		}
	},
);

// Add error handling middleware
app.use(errorHandler);

const port = config.port;
const shouldAutoListen =
	!process.env.JEST_WORKER_ID &&
	process.env.AMY_ECHO_SKIP_LISTEN !== "1" &&
	process.env.AMY_ECHO_SKIP_LISTEN !== "true";
if (shouldAutoListen) {
	databaseReady
		.then(async () => {
			await ensureDataDir();
			app.listen(port);
			logger.info("Server started successfully", { port });
		})
		.catch((error) => {
			const msg = (error as Error)?.message ?? String(error);
			logger.error("Server startup failed", { error: msg });
			process.exit(1);
		});
}
