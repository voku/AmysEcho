import express, { Request, Response } from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import config from './config/index.js';
import { withFileLock } from './utils/fileLock.js';
import { registerTrainingBundleRoute } from './routes/trainingBundleRoute.js';
import { registerCustomGesturesRoute } from './routes/customGesturesRoute.js';
import { registerGdprRoutes } from './routes/gdprRoutes.js';
import { createLatestMlpModelHandler } from './routes/latestMlpModelRoute.js';
import { registerAuthRoutes } from './routes/authRoutes.js';
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
import {
  setupDatabase,
  Database,
  addNegativeSample,
  logCorrection,
  saveDatabase,
  getProfileData,
  deleteProfileData,
} from './db.js';
import { legacyAuth } from './middleware/auth.js';
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
const errorHandler = (error: any, req: Request, res: Response, next: Function) => {
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
  max: 10,
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
app.use('/api/v1', (req: Request, res: Response, next: Function) => {
  res.setHeader('X-API-Version', '1.0.0');
  next();
});

// Simple in-memory training job registry
type TrainStatus = 'queued' | 'running' | 'completed' | 'failed';
interface TrainingJob {
  id: string;
  status: TrainStatus;
  progress: number; // 0..100
  error?: string;
  startedAt?: number;
  endedAt?: number;
  metrics?: Record<string, unknown>;
  report?: Record<string, unknown>;
  message?: string;
}

type TrainingSample = {
  gestureDefinitionId: string;
  profileId?: string | null;
  landmarkData: number[][];
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

app.use('/health', healthLimiter);
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', uptime: process.uptime(), pendingTrainingJobs: trainingQueue.length });
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

// Utility to generate lightweight unique ids
const genId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2);

// Initialize database before starting server
let dbInstance: Database;
export const databaseReady: Promise<Database> = setupDatabase(DB_FILE_PATH)
  .then((db) => {
    dbInstance = db;
    app.locals.dbInstance = db;
    registerGdprRoutes(app, {
      authMiddleware: legacyAuth,
      db,
      dbFilePath: DB_FILE_PATH,
      getProfileData,
      deleteProfileData,
      withFileLock,
      logError: (message, meta) => logger.error(message, meta),
    });
    registerAuthRoutes(app, { db, dbFilePath: DB_FILE_PATH, withFileLock });
    return db;
  })
  .catch((err) => {
    console.error('Database setup failed:', err);
    throw err;
  });

function startTrainingJob(
  samples: TrainingSample[],
  trigger: 'bundles' | null = null,
): { jobId: string; status: TrainStatus; completion: Promise<TrainingJob> } {
  const isQueueIdle = !isProcessingTrainingQueue && trainingQueue.length === 0;
  const id = genId();
  const initialStatus: TrainStatus = isQueueIdle ? 'running' : 'queued';
  const job: TrainingJob = {
    id,
    status: initialStatus,
    progress: 0,
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

  return { jobId: id, status: initialStatus, completion };
}

async function runTrainingWorkflow(
  id: string,
  job: TrainingJob,
  samples: TrainingSample[],
  triggeredByBundles: boolean,
): Promise<void> {
  await ensureDataDir();
  await logTraining(`job ${id}: data dir ready at ${DATA_DIR}`);
  const dataPath = path.join(DATA_DIR, 'dgs_samples.json');

  const toAdd = samples.map((s) => ({
    id: genId(),
    label: s.gestureDefinitionId,
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
  try {
    const result = await ingestTrainingBundlesIntoDataset();
    bundleFrames = result.appended;
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
  for (const pid of profileCounts.keys()) {
    profileIdSet.add(pid);
  }
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

  const runReport = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const proc = spawn('python3', scriptArgs, {
      cwd: serverRoot,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || `train_mlp exited with code ${code}`));
      }
    });
  });

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
  job.metrics = {
    accuracy: (parsedReport as any)?.global?.accuracy ?? 0,
    samples: (parsedReport as any)?.global?.samples ?? 0,
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
});
app.get('/latest-mlp-model', legacyAuth, modelMetadataLimiter, latestMlpModelHandler);
app.get('/api/v1/dgs/mlp-model', legacyAuth, modelMetadataLimiter, latestMlpModelHandler);

registerTrainingBundleRoute(app, genId, {
  triggerTrainingJob: ({ bundleId }) => {
    try {
      const { jobId, status } = startTrainingJob([], 'bundles');
      void logTraining(
        `job ${jobId}: scheduled automatically from bundle ${bundleId} (status=${status})`,
      );
      return { jobId, status, pollUrl: `/train-status/${jobId}` };
    } catch (error) {
      console.error('Failed to schedule training after bundle upload:', error);
      return null;
    }
  },
});

registerCustomGesturesRoute(app);

// Add a labeled DGS sample (landmarks normalized [0..1])
app.post('/api/v1/dgs/samples', legacyAuth, async (req: Request, res: Response) => {
  try {
    const Body = z.object({
      label: z.string().min(1),
      profileId: z.string().optional(),
      // exactly 42 points of [x,y,z] in [0,1]
      landmarks: z
        .array(z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]))
        .length(42)
        .refine(
          (pts: [number, number, number][]) =>
            pts.every(([x, y, z]: [number, number, number]) => x >= 0 && x <= 1 && y >= 0 && y <= 1 && Number.isFinite(z)),
          'landmarks must be 42 points of [x,y,z] within [0,1] for x,y',
        ),
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'label and landmarks (42 × [x,y,z]) required', details: parsed.error.flatten() });
    }
    const { label, profileId, landmarks } = parsed.data;
    if (profileId && !PROFILE_ID_PATTERN.test(profileId)) {
      return res.status(400).json({ error: 'Invalid profileId' });
    }
    console.log(`Received DGS sample: label=${label}, profileId=${profileId}, landmarks length=${landmarks.length}`);
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
      data.samples.push({ id: genId(), label, profileId, landmarks, ts: Date.now() });
      const tmp = `${dataPath}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(data, null, 2));
      await fs.rename(tmp, dataPath);
    });
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Error saving DGS sample:', error);
    res.status(500).json({ error: 'Failed to save sample' });
  }
});

// Crash report ingestion
app.post('/api/crash-reports', legacyAuth, async (req: Request, res: Response) => {
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

const gestureToString = (g: unknown): string | null => {
  if (typeof g === 'string') return g;
  if (g && typeof g === 'object') {
    const { left, right } = g as { left?: unknown; right?: unknown };
    if (typeof left === 'string' && typeof right === 'string') {
      return `${left}+${right}`;
    }
  }
  return null;
};

const GesturePayloadSchema = z.object({
  gesture: z.union([
    z.string().min(1),
    z.object({ left: z.string().min(1), right: z.string().min(1) }),
  ]),
});

// Define reusable landmark validation schema at module level
const LandmarkTupleSchema = z
  .tuple([z.number().finite(), z.number().finite(), z.number().finite()])
  .refine(
    ([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1,
    {
      message: 'landmarks must be 21 or 42 points of [x,y,z] within [0,1] for x,y',
    },
  );

app.post('/api/corrections', legacyAuth, async (req: Request, res: Response) => {
  const parsed = GesturePayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid correction', details: parsed.error.flatten() });
  }
  const gestureStr = gestureToString(parsed.data.gesture)!;
  try {
    logCorrection(dbInstance, 'unknown', gestureStr, null);
    const record: Correction = {
      id: genId(),
      predictedGesture: 'unknown',
      actualGesture: gestureStr,
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

app.post('/api/negative-samples', legacyAuth, async (req: Request, res: Response) => {
  const parsed = GesturePayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid negative sample',
      details: parsed.error.flatten(),
    });
  }
  const gestureStr = gestureToString(parsed.data.gesture)!;
  try {
    const record: NegativeSample = {
      id: genId(),
      gesture: gestureStr,
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

app.post('/train-model', legacyAuth, async (req: Request, res: Response) => {
  const SampleSchema = z.object({
    gestureDefinitionId: z.string().min(1),
    profileId: z.string().optional(),
    landmarkData: z
      .array(LandmarkTupleSchema)
      .refine((arr) => arr.length === 21 || arr.length === 42, {
        message: 'landmarks must be 21 or 42 points of [x,y,z] within [0,1] for x,y',
      }),
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
    gestureDefinitionId: sample.gestureDefinitionId,
    profileId: sample.profileId ?? null,
    landmarkData: sample.landmarkData,
  }));

  const { jobId, status } = startTrainingJob(
    trainingSamples,
    triggeredByBundles ? 'bundles' : null,
  );

  const message =
    status === 'queued'
      ? 'Trainingsauftrag wurde in die Warteschlange gestellt'
      : 'Trainingsauftrag gestartet';

  res.status(202).json({
    status,
    jobId,
    pollUrl: `/train-status/${jobId}`,
    message,
  });
});

// Query training job status (explicit id)
app.get('/train-status/:id', legacyAuth, (req: Request, res: Response) => {
  const id = req.params.id;
  const job = trainingJobs.get(id);
  if (!job) {
    return res.status(404).json({ id, status: 'not_found' });
  }
  res.json(job);
});

// Gracefully handle accidental empty-id requests
app.get('/train-status', legacyAuth, (_req: Request, res: Response) => {
  res.json({ status: 'unknown' });
});

// Query video training job status
app.get('/api/training-status/:id', legacyAuth, (req: Request, res: Response) => {
  const id = req.params.id;
  const result = buildTrainingStatusResponse(trainingJobs, id);
  res.status(result.status).json(result.body);
});

app.get('/model-version', legacyAuth, async (_req: Request, res: Response) => {
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
  const base = await fs
    .realpath(DATA_DIR)
    .catch(() => path.resolve(DATA_DIR));
  const resolvedFile = await fs
    .realpath(file)
    .catch(() => path.resolve(file));
  // Check path containment robustly
  const relative = path.relative(base, resolvedFile);
  if (
    relative.startsWith('..') ||
    path.isAbsolute(relative)
  ) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  return resolvedFile;
}

// Model metadata: version, size, sha256
app.get(
  '/model-metadata',
  legacyAuth,
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
