import express, { Request, Response } from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { createHash, randomBytes } from 'crypto';
import { spawn } from 'child_process';
import config from './config/index.js';
import { withFileLock } from './utils/fileLock.js';
import {
  HAND_LANDMARKS_PER_HAND,
  TOTAL_HAND_LANDMARKS,
  MULTIMODAL_LANDMARKS,
} from './constants/featureSchema.js';
import { registerTrainingBundleRoute } from './routes/trainingBundleRoute.js';
import { registerCustomSignsRoute } from './routes/customSignsRoute.js';
import { registerGdprRoutes } from './routes/gdprRoutes.js';
import { createLatestMlpModelHandler } from './routes/latestMlpModelRoute.js';
import { registerAuthRoutes } from './routes/authRoutes.js';
import { registerSymbolRoutes } from './routes/symbolRoutes.js';
import { registerProfileRoutes } from './routes/profileRoutes.js';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import {
  DATA_DIR,
  ensureDataDir,
  getMlpModelPath,
  PROFILE_ID_PATTERN,
  SERVER_DIR,
  TRAINING_MANIFEST_PATH,
} from './constants/modelPaths.js';
import { DB_FILE_PATH } from './constants/dbPaths.js';
import { PROFILE_REGISTRY_PATH } from './constants/profileRegistryPaths.js';
import {
  setupDatabase,
  Database,
  addNegativeSample,
  logCorrection,
  saveDatabase,
} from './db.js';
import { auth } from './middleware/auth.js';
import {
  seedBaselineModel,
  writeMinimalMlpModel,
  sendBinaryModel,
  applyModelResponseHeaders,
} from './services/mlpModelArtifacts.js';
import logger from './services/logger.js';
import { ingestTrainingBundlesIntoDataset } from './services/trainingBundleIngestor.js';
import { appendCrashReports, CrashReport } from './services/crashService.js';
import { isProfileAuthorized } from './utils/profileAuthorization.js';
import { Correction, NegativeSample } from './types.js';
import { migrateProfileIds } from './services/profileMigration.js';
import {
  saveProfileRegistry,
  ensureProfileRecord,
  ProfileRegistry,
} from './services/profileRegistry.js';
import { writeProfileBackup } from './services/profileDataService.js';

export const app = express();

async function readServerPackageJson(): Promise<any> {
  const candidates = [path.join(SERVER_DIR, 'package.json'), path.join(SERVER_DIR, '..', 'package.json')];
  for (const candidate of candidates) {
    try {
      const raw = await fs.readFile(candidate, 'utf8');
      return JSON.parse(raw);
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }
  throw new Error('package.json not found');
}

// Increase JSON body size limit to accommodate base64 images from the app
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

// Centralized error handling middleware
const errorHandler = (error: any, req: Request, res: Response, _next: Function) => {
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';

  // Log detailed error for debugging
  logger.error('Request error', {
    method: req.method,
    path: req.path,
    message: error.message,
    stack: error.stack,
    statusCode,
    url: req.url,
    userAgent: req.get('User-Agent'),
  }, (req as any).user?.id);

  // Return user-friendly error message
  res.status(statusCode).json({
    error: statusCode === 500 ? 'Internal server error' : message,
    ...(config.nodeEnv === 'development' && { details: error.message }),
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
  const dataPath = path.join(DATA_DIR, 'dgs_samples.json');
  const globalCounts: Record<string, number> = {};
  const profileCounts = new Map<string, Record<string, number>>();

  try {
    const raw = await fs.readFile(dataPath, 'utf8');
    const parsed = JSON.parse(raw);
    const samples = Array.isArray(parsed?.samples) ? parsed.samples : [];
    for (const sample of samples) {
      if (!sample || typeof sample !== 'object') continue;
      const label = typeof sample.label === 'string' ? sample.label : undefined;
      if (!label) continue;
      globalCounts[label] = (globalCounts[label] || 0) + 1;
      const profileId = typeof sample.profileId === 'string' ? sample.profileId : undefined;
      if (profileId && PROFILE_ID_PATTERN.test(profileId)) {
        const existing = profileCounts.get(profileId) ?? {};
        existing[label] = (existing[label] || 0) + 1;
        profileCounts.set(profileId, existing);
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      throw error;
    }
  }

  return { globalCounts, profileCounts };
}

async function logTraining(message: string): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const line = `${new Date().toISOString()} ${message}\n`;
    await fs.appendFile(path.join(DATA_DIR, 'training-debug.log'), line);
    await fs.appendFile(path.join(SERVER_DIR, 'training-debug.log'), line);
  } catch (err) {
    console.warn('training log failed:', err);
  }
}
// Apply generic rate limiting to API namespace
app.use('/api', apiLimiter);

// API Versioning middleware
app.use('/api/v1', (_req: Request, res: Response, next: Function) => {
  res.setHeader('X-API-Version', '1.0.0');
  next();
});

// Simple in-memory training job registry
type TrainStatus = 'queued' | 'running' | 'completed' | 'failed';
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
  .refine(
    ([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1,
    {
      message: 'landmarks must be valid landmark points in range [0,1] for x,y',
    },
  );

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

const healthHandler = (_req: Request, res: Response) => {
  res.json({ status: 'ok', uptime: process.uptime(), pendingTrainingJobs: trainingQueue.length });
};

app.use('/health', healthLimiter);
app.get('/health', healthHandler);

app.use('/api/v1/health', healthLimiter);
app.get('/api/v1/health', healthHandler);

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
        console.error('Training queue execution failed', error);
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

async function executeTrainingQueueEntry(entry: TrainingQueueEntry): Promise<void> {
  const { job } = entry;
  job.status = 'running';
  job.startedAt = Date.now();
  job.queueDepth = 0;
  job.retryAfterMs = undefined;
  trainingJobs.set(job.id, job);

  try {
    await runTrainingWorkflow(job.id, job, entry.samples, entry.triggeredByBundles);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    job.status = 'failed';
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
    return { status: 404, body: { error: 'Training job not found' } };
  }
  return { status: 200, body: job };
}

// Utility to generate cryptographically secure unique ids
const genId = () =>
  Date.now().toString(36) + randomBytes(4).toString('hex');

// Initialize database before starting server
let dbInstance: Database;
let profileRegistry: ProfileRegistry;
export const databaseReady: Promise<Database> = setupDatabase(DB_FILE_PATH)
  .then(async (db) => {
    dbInstance = db;
    app.locals.dbInstance = db;
    const migration = await migrateProfileIds(db, PROFILE_REGISTRY_PATH);
    profileRegistry = migration.registry;
    app.locals.profileRegistry = profileRegistry;
    if (profileRegistry.profiles.length === 0 && db.profiles.length > 0) {
      // Reuse the default profile created by setupDatabase
      const defaultProfile = db.profiles[0];
      ensureProfileRecord(profileRegistry, {
        id: defaultProfile.id,
        displayName: defaultProfile.displayName || 'Standardprofil',
      });
    } else if (profileRegistry.profiles.length === 0) {
      // Invariant violation: setupDatabase should have ensured at least one profile exists in the DB.
      throw new Error(`Profile initialization failed: registry is empty and no database profiles were found to sync from (DB profiles: ${db.profiles.length})`);
    }
    await withFileLock(PROFILE_REGISTRY_PATH, async () =>
      saveProfileRegistry(PROFILE_REGISTRY_PATH, profileRegistry),
    );
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
    registerAuthRoutes(app, { db, dbFilePath: DB_FILE_PATH, withFileLock });
    registerSymbolRoutes(app, db, apiLimiter);
    return db;
  })
  .catch((err) => {
    console.error('Database setup failed:', err);
    throw err;
  });

databaseReady
  .then(() => {
    void runProfileBackupCycle();
    const timer = setInterval(() => {
      void runProfileBackupCycle();
    }, config.profileBackupIntervalHours * 60 * 60 * 1000);
    timer.unref();
  })
  .catch((error) => {
    logger.warn('Profile backup automation skipped', { error: String(error) });
  });

async function resolveProfileId(
  value?: string | null,
): Promise<{ profileId: string | null }> {
  if (!profileRegistry || !value) {
    return { profileId: value ?? null };
  }
  const trimmed = value.trim();
  const exists = profileRegistry.profiles.some((profile) => profile.id === trimmed);
  return { profileId: exists ? trimmed : null };
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
      const backup = await writeProfileBackup(profile.id, profileRegistry, dbInstance);
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
      logger.warn('Profile backup automation failed', {
        profileId: profile.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function startTrainingJob(
  samples: TrainingSample[],
  trigger: 'bundles' | null = null,
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
  const initialStatus: TrainStatus = isQueueIdle ? 'running' : 'queued';
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
    triggeredByBundles: trigger === 'bundles',
    resolve: resolveCompletion,
  });
  void processTrainingQueue();

  if (initialStatus === 'queued') {
    void logTraining(`job ${id}: queued (trigger=${trigger ?? 'manual'})`);
  }

  return { jobId: id, status: initialStatus, completion, queueDepth, retryAfterMs };
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
  const dataPath = path.join(DATA_DIR, 'dgs_samples.json');

  const toAdd = samples.map((s) => ({
    id: genId(),
    label: s.signId,
    profileId: s.profileId ?? undefined,
    landmarks: s.landmarkData,
    ts: Date.now(),
  }));

  if (toAdd.length > 0) {
    await withFileLock(dataPath, async () => {
      let data: any = { samples: [] };
      try {
        const raw = await fs.readFile(dataPath, 'utf8');
        data = JSON.parse(raw);
        if (!Array.isArray(data.samples)) data.samples = [];
      } catch {}
      data.samples.push(...toAdd);
      const tmp = `${dataPath}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(data, null, 2));
      await fs.rename(tmp, dataPath);
    });
    await logTraining(`job ${id}: samples appended (${toAdd.length})`);
  } else if (triggeredByBundles) {
    await logTraining(`job ${id}: triggered by bundle manifest with no inline samples`);
  }

  let bundleFrames = 0;
  let latestCapturedAt: string | undefined;
  try {
    const result = await ingestTrainingBundlesIntoDataset();
    bundleFrames = result.appended;
    latestCapturedAt = result.latestCapturedAt;
    if (bundleFrames > 0) {
      await logTraining(`job ${id}: ingested ${bundleFrames} frames from training bundles`);
    }
  } catch (err) {
    logger.error(`job ${id}: failed to ingest training bundles`, { error: err });
    await logTraining(`job ${id}: failed to ingest training bundles`);
  }

  const { globalCounts, profileCounts } = await collectLabelCounts();
  await logTraining(`job ${id}: label counts computed global=${Object.keys(globalCounts).length}`);

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
    console.error('Failed to prepare early MLP model:', e);
    await logTraining(`job ${id}: minimal MLP failed ${String(e)}`);
  }

  const scriptPath = config.mlpScript;
  const serverRoot = SERVER_DIR;
  const scriptArgs = [
    path.isAbsolute(scriptPath) ? scriptPath : path.join(serverRoot, scriptPath),
    '--manifest',
    TRAINING_MANIFEST_PATH,
    '--data-dir',
    DATA_DIR,
  ];

  if (process.env.AMY_SKIP_DGS_EXAMPLES === 'true') {
    scriptArgs.push('--skip-examples');
  }

  const trainStartMs = Date.now();
  const runReport = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const proc = spawn('python3', scriptArgs, {
        cwd: serverRoot,
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        proc.kill('SIGKILL');
        reject(new Error(`train_mlp timed out after ${config.trainingTimeoutMs}ms`));
      }, config.trainingTimeoutMs);
      timer.unref();
      proc.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || `train_mlp exited with code ${code}`));
      }
    });
  });

  const trainDurationMs = Date.now() - trainStartMs;
  if (runReport.stderr.trim().length > 0) {
    await logTraining(`job ${id}: train_mlp stderr ${runReport.stderr.trim()}`);
  }

  let parsedReport: Record<string, unknown> = {};
  const stdoutText = runReport.stdout.trim();
  if (stdoutText.length > 0) {
    try {
      const lines = stdoutText.split(/\r?\n/).filter(Boolean);
      parsedReport = JSON.parse(lines[lines.length - 1]);
    } catch (err) {
      await logTraining(`job ${id}: failed to parse training report (${String(err)})`);
    }
  }

  job.progress = 100;
  job.status = 'completed';
  job.endedAt = Date.now();
  const captureToTrainMs = latestCapturedAt
    ? Date.now() - Date.parse(latestCapturedAt)
    : null;
  if (captureToTrainMs && captureToTrainMs > config.trainingSlaMs) {
    logger.warn('Training SLA exceeded (capture-to-train)', {
      jobId: id,
      captureToTrainMs,
      slaMs: config.trainingSlaMs,
    });
  }
  if (trainDurationMs > config.trainingSlaMs) {
    logger.warn('Training SLA exceeded (training duration)', {
      jobId: id,
      trainDurationMs,
      slaMs: config.trainingSlaMs,
    });
    throw new Error(`Training überschreitet das SLA (${trainDurationMs}ms > ${config.trainingSlaMs}ms)`);
  }
  job.metrics = {
    accuracy: (parsedReport as any)?.global?.accuracy ?? 0,
    samples: (parsedReport as any)?.global?.samples ?? 0,
    bundleFrames,
    trainingDurationMs: trainDurationMs,
    captureToTrainMs,
    workflowDurationMs: Date.now() - workflowStartMs,
  };
  job.report = parsedReport;
  job.message = 'Dein Modell ist jetzt aktualisiert';
  await logTraining(`job ${id}: completed synchronously`);
}

// Serve per-profile MLP models (NPZ) with containment checks
const latestMlpModelHandler = createLatestMlpModelHandler({
  getMlpModelPath,
  seedBaselineModel,
  sendBinaryModel,
  applyModelHeaders: applyModelResponseHeaders,
  logTraining,
  isProfileAuthorized,
  resolveProfileId: resolveProfileId,
});
app.get('/latest-mlp-model', auth, modelMetadataLimiter, latestMlpModelHandler);
app.get('/api/v1/dgs/mlp-model', auth, modelMetadataLimiter, latestMlpModelHandler);

registerTrainingBundleRoute(app, genId, {
  triggerTrainingJob: ({ bundleId, profileId, label }) => {
    try {
      const { jobId, status, queueDepth, retryAfterMs } = startTrainingJob([], 'bundles');
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
      console.error('Failed to schedule training after bundle upload:', error);
      return null;
    }
  },
  resolveProfileId: resolveProfileId,
});

registerCustomSignsRoute(app, {
  resolveProfileId: resolveProfileId,
  triggerTrainingJob: ({ bundleId, profileId, label }) => {
    try {
      const { jobId, status } = startTrainingJob([], 'bundles');
      void logTraining(
        `job ${jobId}: scheduled automatically from sign registration ${bundleId} (status=${status}, profile=${profileId}, label=${label})`,
      );
    } catch (error) {
      console.error('Failed to schedule training after sign registration:', error);
    }
  }
});

// Add a labeled DGS sample (landmarks normalized [0..1])
app.post('/api/v1/dgs/samples', auth, async (req: Request, res: Response) => {
  try {
    const Body = z.object({
      label: z.string().min(1),
      profileId: z.string().optional(),
      // 21 (one hand), 42 (two hands), or 543 (multimodal: 42 + 33 + 468)
      landmarks: z
        .array(z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]))
        .refine(
          (pts: [number, number, number][]) =>
            pts.length === HAND_LANDMARKS_PER_HAND ||
            pts.length === TOTAL_HAND_LANDMARKS ||
            pts.length === MULTIMODAL_LANDMARKS,
          'landmarks must be 21, 42 or 543 points',
        )
        .refine(
          (pts: [number, number, number][]) =>
            pts.every(([x, y, z]: [number, number, number]) => x >= 0 && x <= 1 && y >= 0 && y <= 1 && Number.isFinite(z)),
          'landmarks must be within [0,1] for x,y',
        ),
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Label und gültige Landmarken (21, 42 oder 543 × [x,y,z]) erforderlich.', details: parsed.error.flatten() });
    }
    const { label, profileId, landmarks } = parsed.data;
    if (profileId && !PROFILE_ID_PATTERN.test(profileId)) {
      return res.status(400).json({ error: 'Ungültige Profil-ID.' });
    }
    const resolvedProfile = await resolveProfileId(profileId ?? null);
    const resolvedProfileId = resolvedProfile.profileId ?? undefined;
    if (profileId && !resolvedProfileId) {
      return res.status(404).json({ error: 'Profil nicht gefunden.' });
    }
    if (resolvedProfileId && !isProfileAuthorized(req, resolvedProfileId)) {
      return res.status(403).json({ error: 'Zugriff verweigert.' });
    }
    console.log(`Received DGS sample: label=${label}, profileId=${resolvedProfileId}, landmarks length=${landmarks.length}`);
    const dataPath = path.join(DATA_DIR, 'dgs_samples.json');
    await withFileLock(dataPath, async () => {
      let data: any = { samples: [] };
      try {
        const raw = await fs.readFile(dataPath, 'utf8');
        data = JSON.parse(raw);
        if (!Array.isArray(data.samples)) data.samples = [];
      } catch (err: any) {
        if (err?.code !== 'ENOENT') throw err;
      }
      data.samples.push({ id: genId(), label, profileId: resolvedProfileId, landmarks, ts: Date.now() });
      const tmp = `${dataPath}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(data, null, 2));
      await fs.rename(tmp, dataPath);
    });
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Error saving DGS sample:', error);
    res.status(500).json({ error: 'Beispiel konnte nicht gespeichert werden.' });
  }
});

// Crash report ingestion
app.post('/api/v1/crash-reports', auth, async (req: Request, res: Response) => {
  try {
    const payload = Array.isArray(req.body) ? req.body : [req.body];
    const valid: CrashReport[] = [];
    for (const r of payload) {
      if (!r || typeof r !== 'object') continue;
      if (typeof r.message !== 'string' || typeof r.timestamp !== 'number') continue;
      valid.push({
        id: typeof (r as any).id === 'string' ? (r as any).id : Date.now().toString(36),
        name: typeof (r as any).name === 'string' ? (r as any).name : 'Error',
        message: r.message,
        stack: typeof (r as any).stack === 'string' ? (r as any).stack : undefined,
        timestamp: r.timestamp,
        extra: (r as any).extra && typeof (r as any).extra === 'object' ? (r as any).extra : undefined,
      });
    }
    if (!valid.length) return res.status(400).json({ error: 'No valid crash reports' });
    await appendCrashReports(valid);
    res.status(202).json({ status: 'ok', saved: valid.length });
  } catch (error) {
    console.error('Error saving crash reports:', error);
    res.status(500).json({ error: 'Failed to save crash reports' });
  }
});

const signToString = (g: unknown): string | null => {
  if (typeof g === 'string') return g;
  if (g && typeof g === 'object') {
    const { left, right } = g as { left?: unknown; right?: unknown };
    if (typeof left === 'string' && typeof right === 'string') {
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

app.post('/api/v1/corrections', auth, async (req: Request, res: Response) => {

  const parsed = SignPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid correction', details: parsed.error.flatten() });
  }
  const signStr = signToString(parsed.data.sign)!;
  try {
    logCorrection(dbInstance, 'unknown', signStr, null);
    const record: Correction = {
      id: genId(),
      predictedSign: 'unknown',
      actualSign: signStr,
      confidence: 0,
      timestamp: Date.now(),
      isSynced: false,
    };
    dbInstance.corrections.push(record);
    await withFileLock(DB_FILE_PATH, async () => saveDatabase(dbInstance, DB_FILE_PATH));
    res.status(202).json({ status: 'queued' });
  } catch (error) {
    console.error('Error logging correction:', error);
    res.status(500).json({ error: 'Failed to log correction' });
  }
});

app.post('/api/v1/negative-samples', auth, async (req: Request, res: Response) => {
  const parsed = SignPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid negative sample',
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
    await withFileLock(DB_FILE_PATH, async () => saveDatabase(dbInstance, DB_FILE_PATH));
    res.status(202).json({ status: 'queued' });
  } catch (error) {
    console.error('Error logging negative sample:', error);
    res.status(500).json({ error: 'Failed to log negative sample' });
  }
});

app.post('/train-model', auth, apiLimiter, async (req: Request, res: Response) => {
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
            message: 'landmarks must be 21, 42 or 543 points',
          },
        ),
      z.array(FrameSchema).refine(
        (frames) =>
          frames.every(
            (f) =>
              f.landmarks.length === HAND_LANDMARKS_PER_HAND ||
              f.landmarks.length === TOTAL_HAND_LANDMARKS ||
              f.landmarks.length === MULTIMODAL_LANDMARKS,
          ),
        { message: 'each frame must contain 21, 42 or 543 landmarks' },
      ),
    ]),
  });
  const BodySchema = z.object({
    samples: z.array(SampleSchema).optional(),
    trigger: z.enum(['bundles']).optional(),
  });
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid samples payload.', details: parsed.error.flatten() });
  }
  type Sample = z.infer<typeof SampleSchema>;
  const samples: Sample[] = parsed.data.samples ?? [];
  const triggeredByBundles = parsed.data.trigger === 'bundles';
  const trainingSamples: TrainingSample[] = samples.map((sample) => ({
    signId: sample.signId,
    profileId: sample.profileId ?? null,
    landmarkData: sample.landmarkData,
  }));

  const { jobId, status, queueDepth, retryAfterMs } = startTrainingJob(
    trainingSamples,
    triggeredByBundles ? 'bundles' : null,
  );

  const message =
    status === 'queued'
      ? 'Trainingsauftrag wurde in die Warteschlange gestellt'
      : 'Trainingsauftrag gestartet';

  if (retryAfterMs > 0) {
    res.setHeader('Retry-After', Math.ceil(retryAfterMs / 1000).toString());
  }

  res.status(202).json({
    status,
    jobId,
    pollUrl: `/api/v1/train-status/${jobId}`,
    message,
    queueDepth,
    ...(retryAfterMs > 0 ? { retryAfterMs } : {}),
  });
});

// Query training job status (explicit id)
app.get('/api/v1/train-status/:id', auth, healthLimiter, (req: Request, res: Response) => {
  const id = req.params.id;
  const job = trainingJobs.get(id);
  if (!job) {
    return res.status(404).json({ id, status: 'not_found' });
  }
  res.json(job);
});

// Gracefully handle accidental empty-id requests
app.get('/api/v1/train-status', auth, healthLimiter, (_req: Request, res: Response) => {
  res.json({ status: 'unknown' });
});

// Query video training job status
app.get('/api/v1/training-status/:id', auth, (req: Request, res: Response) => {
  const id = req.params.id;
  const result = buildTrainingStatusResponse(trainingJobs, id);
  res.status(result.status).json(result.body);
});

app.get('/model-version', auth, modelMetadataLimiter, async (_req: Request, res: Response) => {
  try {
    const pkg = await readServerPackageJson();
    const { version } = pkg;
    res.json({ version, modelPath: 'latest-mlp-model' });
  } catch (err) {
    console.error('Failed to read model version:', err);
    res.status(500).json({ error: 'Failed to read model version' });
  }
});

async function resolveModelFile(
  profileId: string | undefined,
  res: Response,
  getPath: (profileId?: string) => string,
): Promise<string | undefined> {
  let file: string;
  try {
    file = getPath(profileId);
  } catch {
    res.status(400).json({ error: 'Invalid profileId' });
    return;
  }
  
  // Resolve base directory first
  const base = await fs
    .realpath(DATA_DIR)
    .catch(() => path.resolve(DATA_DIR));
  
  // Normalize the file path to remove any ".." segments
  // This prevents path traversal attacks
  const normalizedFile = path.resolve(file);
  
  // Check path containment BEFORE resolving symlinks
  const preCheckRelative = path.relative(base, normalizedFile);
  if (
    preCheckRelative.startsWith('..') ||
    path.isAbsolute(preCheckRelative)
  ) {
    res.status(403).json({ error: 'Forbidden' });
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
    postCheckRelative.startsWith('..') ||
    path.isAbsolute(postCheckRelative)
  ) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  
  return resolvedFile;
}

// Model metadata: version, size, sha256
app.get(
  '/model-metadata',
  auth,
  modelMetadataLimiter,
  async (req: Request, res: Response) => {
  const profileId =
    typeof req.query.profileId === 'string' ? req.query.profileId : undefined;
  const resolvedFile = await resolveModelFile(profileId, res, getMlpModelPath);
  if (!resolvedFile) return;
  try {
    const pkg = await readServerPackageJson();
    const { version } = pkg;
    const stat = await fs.stat(resolvedFile);
    const buf = await fs.readFile(resolvedFile);
    const sha256 = createHash('sha256').update(buf).digest('hex');
    res.json({ version, size: stat.size, sha256 });
  } catch (err) {
    console.error('Failed to read model metadata:', err);
    res.status(404).json({ error: 'Model not found' });
  }
  },
);

// List available profile models and their status
app.get('/api/models/profiles', auth, async (_req: Request, res: Response) => {
  try {
    const { profileCounts } = await collectLabelCounts();
    interface ProfileInfo {
      profileId: string;
      modelAvailable: boolean;
      signCount: number;
      lastUpdated?: Date;
    }
    const profiles: ProfileInfo[] = [];
    
    const modelsDir = path.join(DATA_DIR, 'models');
    let modelDirs: string[] = [];
    try {
      modelDirs = await fs.readdir(modelsDir);
    } catch (e) {
      // Models dir might not exist yet
    }

    for (const pid of modelDirs) {
      if (pid === 'global' || !PROFILE_ID_PATTERN.test(pid)) continue;
      
      const modelPath = getMlpModelPath(pid);
      let modelAvailable = false;
      let lastUpdated: Date | undefined;
      
      try {
        const stat = await fs.stat(modelPath);
        modelAvailable = true;
        lastUpdated = stat.mtime;
      } catch (e) {
        // Model not built yet
      }

      const counts = profileCounts.get(pid) || {};
      const signCount = Object.values(counts).reduce((a, b) => a + b, 0);

      profiles.push({
        profileId: pid,
        modelAvailable,
        signCount,
        ...(lastUpdated ? { lastUpdated } : {})
      });
    }

    // Add profiles that have data but no model file yet
    for (const [pid, counts] of profileCounts.entries()) {
      if (!profiles.find(p => p.profileId === pid)) {
        profiles.push({
          profileId: pid,
          modelAvailable: false,
          signCount: Object.values(counts).reduce((a, b) => a + b, 0)
        });
      }
    }

    res.json(profiles);
  } catch (error) {
    console.error('Failed to list profile models:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get labels that have at least one sample for a profile
app.get('/api/v1/dgs/trained-labels', auth, async (req: Request, res: Response) => {
  try {
    const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : undefined;
    if (!profileId) {
      return res.status(400).json({ error: 'profileId required' });
    }

    const { profileCounts } = await collectLabelCounts();
    const counts = profileCounts.get(profileId) || {};
    const trainedLabels = Object.keys(counts).filter(label => counts[label] > 0);

    res.json({ profileId, trainedLabels });
  } catch (error) {
    console.error('Failed to get trained labels:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get normalization configuration
app.get('/api/config/normalization', auth, async (_req: Request, res: Response) => {
  try {
    const configPath = path.join(DATA_DIR, 'config', 'normalization_config.json');
    const raw = await fs.readFile(configPath, 'utf8');
    res.json(JSON.parse(raw));
  } catch (error) {
    // Return defaults if config missing
    res.json({
      priority_factors: {
        hands: 3.0,
        pose: 0.4,
        face: 0.1
      }
    });
  }
});

// Add error handling middleware
app.use(errorHandler);

const port = config.port;
const shouldAutoListen =
  !process.env.JEST_WORKER_ID &&
  process.env.AMY_ECHO_SKIP_LISTEN !== '1' &&
  process.env.AMY_ECHO_SKIP_LISTEN !== 'true';
if (shouldAutoListen) {
  databaseReady
    .then(async () => {
      await ensureDataDir();
      app.listen(port);
      logger.info('Server started successfully', { port });
    })
    .catch((error) => {
      const msg = (error as Error)?.message ?? String(error);
      logger.error('Server startup failed', { error: msg });
      process.exit(1);
    });
}
