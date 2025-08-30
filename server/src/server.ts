import express, { Request, Response } from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import readline from 'readline';
import { getCentroids } from './services/dgsModelService';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import {
  TRAINED_MODEL_PATH,
  DATA_DIR,
  ensureDataDir,
  getTrainedModelPath,
  getMlpModelPath,
  PROFILE_ID_PATTERN,
} from './constants/modelPaths';
import { DB_FILE_PATH } from './constants/dbPaths';
import {
  setupDatabase,
  loadDatabase,
  saveDatabase,
  Database,
  logCorrection,
  addNegativeSample,
  getProfileData,
  deleteProfileData,
} from './db';
import auth from './middleware/auth';
import {
  Correction,
  UsageStat,
  LearningAnalytics,
  Profile,
  SymbolRecord,
  NegativeSample,
  CentroidModel,
} from './types';
import {
  saveAnalyticsToFile,
  loadAnalyticsFromFile,
  computeSummaryMetrics,
  loadTelemetry,
  saveTelemetry,
  TelemetryEvent,
  computeAnalyticsInsights,
} from './services/analyticsService';
import { getLLMSuggestions, LLMRequest } from './services/dialogEngine';
import portalRouter from './portal';
import caregiverPortalApiRouter from './caregiverPortalApi';

import { appendCrashReports, CrashReport } from './services/crashService';

const app = express();
// Increase JSON body size limit to accommodate base64 images from the app
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

const dialogLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.DIALOG_LIMIT ?? '60', 10),
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true,
});

// Generic API rate limiter for server endpoints
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.API_LIMIT ?? '120', 10),
  standardHeaders: true,
  legacyHeaders: false,
});

// Serve static files from the portal directory
app.use('/portal', express.static(path.join(__dirname, 'portal')));

// Serve the main portal HTML file
app.get('/portal', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, 'portal', 'index.html'));
});

// Basic health check endpoint for monitoring
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// API routes for caregiver portal
app.use('/portal', portalRouter);

// Serve static files from the caregiver portal directory
app.use('/caregiver-portal', express.static(path.join(__dirname, 'caregiver-portal')));

app.use('/api/caregiver-portal', auth, caregiverPortalApiRouter);

// Simple per-file async lock
const fileLocks = new Map<string, Promise<void>>();
async function withFileLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const prev = fileLocks.get(file) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((res) => (release = res));
  fileLocks.set(file, prev.finally(() => next));
  try {
    return await fn();
  } finally {
    release();
    if (fileLocks.get(file) === next) fileLocks.delete(file);
  }
}

// In-memory training job queue to serialize model updates
const trainingQueue: Array<() => Promise<void>> = [];
let trainingRunning = false;
function runNextTraining() {
  if (trainingRunning) return;
  const next = trainingQueue.shift();
  if (!next) return;
  trainingRunning = true;
  next().finally(() => {
    trainingRunning = false;
    runNextTraining();
  });
}
// Apply generic rate limiting to API namespace
app.use('/api', apiLimiter);

let dbInstance: Database; // Declare a variable to hold the database instance

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
}
const trainingJobs = new Map<string, TrainingJob>();

// Utility to generate lightweight unique ids
const genId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2);

// Ensure the database file exists with default content and load it
setupDatabase(DB_FILE_PATH)
  .then((db) => {
    dbInstance = db;
  })
  .catch((err) => {
    console.error('Database setup failed:', err);
  });

// Middleware to attach dbInstance to req (optional, but good practice)
app.use((req: Request, res: Response, next: Function) => {
  (req as any).db = dbInstance;
  next();
});

// API Endpoints for Portal
app.get('/api/analytics/profiles', auth, async (_req: Request, res: Response) => {
  try {
    const profiles = dbInstance.profiles;
    res.json(profiles.map((p: Profile) => ({ id: p.id, name: p.name })));
  } catch (error) {
    console.error('Error fetching profiles:', error);
    res.status(500).json({ error: 'Failed to fetch profiles' });
  }
});

app.get('/api/profiles/:id/export', auth, (req: Request, res: Response) => {
  const { id } = req.params;
  const data = getProfileData(dbInstance, id);
  if (!data.profile) {
    return res.status(404).json({ error: 'Profile not found' });
  }
  res.json(data);
});

app.delete('/api/profiles/:id', auth, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await deleteProfileData(dbInstance, id, DB_FILE_PATH);
    res.json({ status: 'deleted' });
  } catch (error) {
    console.error('Profile deletion failed:', error);
    res.status(500).json({ error: 'Profile deletion failed' });
  }
});

app.get('/api/analytics/corrections', auth, async (req: Request, res: Response) => {
  try {
    const { profileId } = req.query;
    let corrections = dbInstance.corrections;
    if (profileId) {
      corrections = corrections.filter((c: Correction) => c.profileId === profileId);
    }
    res.json(corrections.map((c: Correction) => ({
      predictedGesture: c.predictedGesture,
      actualGesture: c.actualGesture,
      confidence: c.confidence,
      timestamp: c.timestamp,
    })));
  } catch (error) {
    console.error('Error fetching corrections:', error);
    res.status(500).json({ error: 'Failed to fetch corrections' });
  }
});

app.get('/api/analytics/usage-rates', auth, async (req: Request, res: Response) => {
  try {
    const { profileId } = req.query;
    let usageStats = dbInstance.usageStats;
    if (profileId) {
      usageStats = usageStats.filter((u: UsageStat) => u.profileId === profileId);
    }
    res.json(usageStats.map((u: UsageStat) => ({
      symbolId: u.symbolId,
      usageCount: u.count,
    })));
  } catch (error) {
    console.error('Error fetching usage rates:', error);
    res.status(500).json({ error: 'Failed to fetch usage rates' });
  }
});

app.get('/api/analytics/training-trends', auth, async (req: Request, res: Response) => {
  try {
    const { profileId } = req.query;
    let trainingTrends = dbInstance.learningAnalytics;
    // For now, no direct profileId filtering on LearningAnalytic in current schema
    res.json(trainingTrends.map((t: LearningAnalytics) => ({
      gestureDefinitionId: t.gestureDefinitionId,
      successRate24h: t.successRate24h,
      successRate7d: t.successRate7d,
      avgConfidenceScore: t.avgConfidenceScore,
      improvementTrend: t.improvementTrend,
      lastCalculated: t.lastCalculated,
    })));
  } catch (error) {
    console.error('Error fetching training trends:', error);
    res.status(500).json({ error: 'Failed to fetch training trends' });
  }
});

app.get('/api/analytics/export', auth, async (req: Request, res: Response) => {
  try {
    const { type, profileId } = req.query;
    let data: any[] = [];
    let filename = 'export.csv';

    switch (type) {
      case 'corrections':
        let corrections = dbInstance.corrections;
        if (profileId) {
          corrections = corrections.filter((c: Correction) => c.profileId === profileId);
        }
        data = corrections.map((c: Correction) => ({
          predictedGesture: c.predictedGesture,
          actualGesture: c.actualGesture,
          confidence: c.confidence,
          timestamp: new Date(c.timestamp).toISOString(),
        }));
        filename = 'corrections.csv';
        break;
      case 'usage':
        let usageStats = dbInstance.usageStats;
        if (profileId) {
          usageStats = usageStats.filter((u: UsageStat) => u.profileId === profileId);
        }
        data = usageStats.map((u: UsageStat) => ({
          symbolId: u.symbolId,
          usageCount: u.count,
        }));
        filename = 'usage.csv';
        break;
      case 'training':
        let trainingTrends = dbInstance.learningAnalytics;
        // For now, no direct profileId filtering on LearningAnalytic in current schema
        data = trainingTrends.map((t: LearningAnalytics) => ({
          gestureDefinitionId: t.gestureDefinitionId,
          successRate24h: t.successRate24h,
          successRate7d: t.successRate7d,
          avgConfidenceScore: t.avgConfidenceScore,
          improvementTrend: t.improvementTrend,
          lastCalculated: t.lastCalculated ? new Date(t.lastCalculated).toISOString() : '',
        }));
        filename = 'training.csv';
        break;
      default:
        return res.status(400).json({ error: 'Invalid export type' });
    }

    if (data.length === 0) {
      return res.status(404).json({ error: 'No data to export' });
    }

    const header = Object.keys(data[0]).join(',');
    const rows = data.map(row => Object.values(row).join(',')).join('\n');
    const csv = `${header}\n${rows}`;

    res.header('Content-Type', 'text/csv');
    res.attachment(filename);
    res.send(csv);

  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// Analytics summary: correction rate, uncertainty ratio, median latency, top misclassifications
app.get('/api/analytics/summary', auth, async (_req: Request, res: Response) => {
  try {
    const telemetry = await loadTelemetry();
    const summary = computeSummaryMetrics(dbInstance, telemetry);
    res.json(summary);
  } catch (error) {
    console.error('Error computing analytics summary:', error);
    res.status(500).json({ error: 'Failed to compute analytics summary' });
  }
});

// Insights: correction frequency and improvement suggestions
app.get('/api/analytics/insights', auth, async (_req: Request, res: Response) => {
  try {
    const insights = computeAnalyticsInsights(dbInstance);
    res.json(insights);
  } catch (error) {
    console.error('Error computing analytics insights:', error);
    res.status(500).json({ error: 'Failed to compute analytics insights' });
  }
});

app.post('/api/telemetry', auth, async (req: Request, res: Response) => {
    const events = Array.isArray(req.body) ? req.body : [req.body];
    if (!events.every(e => typeof e.latencyMs === 'number' && typeof e.timestamp === 'number' &&
      (e.event === undefined || typeof e.event === 'string') &&
      (e.source === undefined || typeof e.source === 'string'))
    ) {
      return res.status(400).json({ error: 'Invalid telemetry event payload' });
    }
  
    try {
      const existingEvents = await loadTelemetry();
      const newEvents = existingEvents.concat(events);
      // Keep the last 1000 events to prevent the file from growing too large
      const prunedEvents = newEvents.slice(-1000);
      await saveTelemetry(prunedEvents);
      res.status(202).json({ status: 'ok' });
    } catch (error) {
      console.error('Error saving telemetry data:', error);
      res.status(500).json({ error: 'Failed to save telemetry data' });
    }
  });

// Serve per-profile centroids for offline/edge usage
app.get('/api/v1/dgs/model', auth, async (req: any, res: any) => {
  try {
    const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : undefined;
    const data = await getCentroids(profileId);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Failed to compute centroids' });
  }
});

// Serve per-profile MLP models (NPZ) with containment checks
app.get('/api/v1/dgs/mlp-model', auth, async (req: Request, res: Response) => {
  try {
    const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : undefined;
    if (profileId && !isProfileAuthorized(req, profileId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const resolvedFile = await resolveModelFile(profileId, res, getMlpModelPath);
    if (!resolvedFile) return;
    await sendBinaryModel(res, resolvedFile, profileId ? `dgs_model_${profileId}.npz` : 'dgs_model.npz');
  } catch {
    res.status(500).json({ error: 'Failed to load MLP model' });
  }
});

  // Add a labeled DGS sample (landmarks normalized [0..1])
app.post('/api/v1/dgs/samples', auth, async (req: Request, res: Response) => {
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
  } catch (e) {
    res.status(500).json({ error: 'Failed to save sample' });
  }
});

// Crash report ingestion
app.post('/api/crash-reports', auth, async (req: Request, res: Response) => {
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

app.post('/api/corrections', auth, async (req: Request, res: Response) => {
  const { gesture } = req.body || {};
  if (typeof gesture !== 'string') {
    return res.status(400).json({ error: 'Invalid correction' });
  }
  try {
    logCorrection(dbInstance, 'unknown', gesture, null);
    const record: Correction = {
      id: genId(),
      predictedGesture: 'unknown', 
      actualGesture: gesture,
      confidence: 0,
      timestamp: Date.now(),
      isSynced: false,
    };
    dbInstance.corrections.push(record);
    await saveDatabase(dbInstance, DB_FILE_PATH);
    res.status(202).json({ status: 'queued' });
  } catch (error) {
    console.error('Error logging correction:', error);
    res.status(500).json({ error: 'Failed to log correction' });
  }
});

app.post('/api/negative-samples', auth, async (req: Request, res: Response) => {
    const { gesture } = req.body || {};
    if (typeof gesture !== 'string') {
        return res.status(400).json({ error: 'Invalid negative sample' });
    }
    try {
        const record: NegativeSample = {
            id: genId(),
            gesture,
            timestamp: Date.now(),
        };
        addNegativeSample(dbInstance, record);
        await saveDatabase(dbInstance, DB_FILE_PATH);
        res.status(202).json({ status: 'queued' });
    } catch (error) {
        console.error('Error logging negative sample:', error);
        res.status(500).json({ error: 'Failed to log negative sample' });
    }
});

app.post('/dialog', auth, dialogLimiter, async (req: Request, res: Response) => {
  const body: LLMRequest = req.body || {};
  try {
    console.log('Dialog request', {
      input: body.input,
      contextSize: body.context?.length ?? 0,
    });
    const suggestions = await getLLMSuggestions(body);
    res.json(suggestions);
  } catch (error) {
    console.error('Dialog endpoint error:', error);
    res.status(500).json({ nextWords: [], caregiverPhrases: [] });
  }
});

app.post('/train-model', auth, async (req: Request, res: Response) => {
  const SampleSchema = z.object({
    gestureDefinitionId: z.string().min(1),
    profileId: z.string().optional(),
    landmarkData: z
      .array(z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]))
      .refine((arr) => arr.length === 21 || arr.length === 42, {
        message: 'landmarks must be 21 or 42 points of [x,y,z] within [0,1]',
      }),
  });
  const BodySchema = z.object({ samples: z.array(SampleSchema).min(1) });
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid samples payload.', details: parsed.error.flatten() });
  }
  type Sample = z.infer<typeof SampleSchema>;
  const samples: Sample[] = parsed.data.samples;

  const id = genId();
  const job: TrainingJob = { id, status: 'queued', progress: 0 };
  trainingJobs.set(id, job);

  // Enqueue training job to run sequentially
  trainingQueue.push(async () => {
    job.status = 'running';
    job.startedAt = Date.now();
    try {
      const dataPath = path.join(DATA_DIR, 'dgs_samples.json');
      const toAdd = samples.map((s: Sample) => ({
        id: genId(),
        label: s.gestureDefinitionId,
        profileId: s.profileId,
        landmarks: s.landmarkData,
        ts: Date.now(),
      }));
      const total = toAdd.length || 1;
      await withFileLock(dataPath, async () => {
        let data: any = { samples: [] };
        try {
          const raw = await fs.readFile(dataPath, 'utf8');
          data = JSON.parse(raw);
          if (!Array.isArray(data.samples)) data.samples = [];
        } catch {}
        toAdd.forEach((s, idx) => {
          data.samples.push(s);
          job.progress = Math.round(((idx + 1) / total) * 50);
        });
        const tmp = `${dataPath}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(data, null, 2));
        await fs.rename(tmp, dataPath);
      });

      // Compute centroids (global) and publish as the trained model
      const { centroids, counts } = await getCentroids();
      job.progress = 75;
      const updatedAt = Date.now();
      const out: CentroidModel = {
        type: 'centroid_model',
        updatedAt,
        centroids,
        counts,
      };
      await withFileLock(TRAINED_MODEL_PATH, async () => {
        const tmp = `${TRAINED_MODEL_PATH}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(out));
        await fs.rename(tmp, TRAINED_MODEL_PATH);
      });

      const profileIds = Array.from(
        new Set(
          samples
            .map((s) => s.profileId)
            .filter((p): p is string => !!p && PROFILE_ID_PATTERN.test(p)),
        ),
      );
      for (const pid of profileIds) {
        const { centroids: pc, counts: pcnts } = await getCentroids(pid);
        const pOut: CentroidModel = {
          type: 'centroid_model',
          updatedAt,
          centroids: pc,
          counts: pcnts,
        };
        const file = getTrainedModelPath(pid);
        await withFileLock(file, async () => {
          const tmp = `${file}.tmp`;
          await fs.writeFile(tmp, JSON.stringify(pOut));
          await fs.rename(tmp, file);
        });
      }

      // Run MLP training script after centroids succeed
      const scriptRel = process.env.MLP_SCRIPT || 'src/amyserver_tools/train_mlp.py';
      const serverRoot = path.join(__dirname, '..');
      await new Promise<void>((resolve, reject) => {
        const proc = spawn('python3', [path.join(serverRoot, scriptRel)], {
          cwd: serverRoot,
        });
        const stderrOutput: string[] = [];
        const MAX_STDERR_LINES = 50;
        proc.stderr.on('data', (d) => {
          stderrOutput.push(d.toString());
          if (stderrOutput.length > MAX_STDERR_LINES) {
            stderrOutput.splice(0, stderrOutput.length - MAX_STDERR_LINES);
          }
        });

        const rl = readline.createInterface({ input: proc.stdout });
        rl.on('line', (line: string) => {
          if (!line.trim()) return;
          try {
            const msg = JSON.parse(line);
            if (msg && msg.type === 'progress') {
              const cur = Number(msg.current);
              const total = Number(msg.total);
              if (total > 0) {
                job.progress = 75 + Math.round((cur / total) * 25);
              }
            }
            if (msg && msg.type === 'metrics') {
              job.metrics = msg;
            }
          } catch {
            console.log(`MLP script non-JSON output: ${line}`);
          }
        });

        proc.on('error', reject);
        proc.on('close', (code) => {
          rl.close();
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`MLP training failed (${code}): ${stderrOutput.join('')}`));
          }
        });
      });

      // Copy model for profile-specific variants (atomic)
      const baseModel = getMlpModelPath();
      for (const pid of profileIds) {
        const dest = getMlpModelPath(pid);
        const tmp = `${dest}.tmp`;
        await fs.copyFile(baseModel, tmp);
        await fs.rename(tmp, dest);
        try { await fs.chmod(dest, 0o640); } catch {}
      }

      job.progress = 100;
      job.status = 'completed';
      job.endedAt = Date.now();
    } catch (e: unknown) {
      job.status = 'failed';
      job.error = e instanceof Error ? e.message : String(e);
      job.endedAt = Date.now();
    }
  });
  runNextTraining();

  res.status(202).json({ status: 'queued', jobId: id });
});

// Query training job status
app.get('/train-status/:id', auth, (req: Request, res: Response) => {
  const id = req.params.id;
  const job = trainingJobs.get(id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

app.get('/model-version', auth, async (_req: Request, res: Response) => {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkgRaw = await fs.readFile(pkgPath, 'utf8');
    const { version } = JSON.parse(pkgRaw);
    res.json({ version, modelPath: 'latest-model' });
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

// Simple per-profile authorization: require matching X-Profile-Id header when requesting a profiled resource
function isProfileAuthorized(req: Request, profileId: string): boolean {
  const claimed = req.header('x-profile-id');
  return typeof claimed === 'string' && claimed === profileId;
}

const PROFILE_SPECIFIC_MODEL_REGEX = /_[A-Za-z0-9_-]+\.(json|npz)$/;
const CDN_CACHE_MAX_AGE_SECONDS = 3600; // 1 hour

async function sendBinaryModel(res: Response, filePath: string, downloadName: string) {
  try {
    const stat = await fs.stat(filePath);
    // ETag & checksum
    const buf = await fs.readFile(filePath);
    const sha256 = createHash('sha256').update(buf).digest('hex');

    // Range support
    const range = (res.req.headers['range'] as string | undefined) || undefined;
    res.setHeader('Accept-Ranges', 'bytes');
    const baseName = path.basename(filePath, path.extname(filePath));
    const isProfileSpecific =
      PROFILE_SPECIFIC_MODEL_REGEX.test(filePath) &&
      baseName.split('_').length > 2;
    if (isProfileSpecific) {
      res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      res.setHeader(
        'CDN-Cache-Control',
        `max-age=${CDN_CACHE_MAX_AGE_SECONDS}`,
      );
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('ETag', `"sha256-${sha256}"`);
    res.setHeader('X-Checksum-SHA256', sha256);
    res.setHeader('X-Model-Version', String(Math.floor(stat.mtimeMs)));
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);

    if (range && range.startsWith('bytes=')) {
      const [startStr, endStr] = range.replace('bytes=', '').split('-');
      let start = parseInt(startStr, 10);
      let end = endStr ? parseInt(endStr, 10) : stat.size - 1;
      if (Number.isNaN(start)) start = 0;
      if (Number.isNaN(end) || end >= stat.size) end = stat.size - 1;
      if (start > end || start < 0) {
        res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end();
        return;
      }
      const chunkSize = end - start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', String(chunkSize));
      const stream = (await import('fs')).createReadStream(filePath, { start, end });
      stream.pipe(res);
      return;
    }

    res.setHeader('Content-Length', String(stat.size));
    res.send(buf);
  } catch {
    res.status(404).json({ error: 'Model not found' });
  }
}

app.get('/latest-model', auth, async (req: Request, res: Response) => {
  const profileId =
    typeof req.query.profileId === 'string' ? req.query.profileId : undefined;
  const resolvedFile = await resolveModelFile(profileId, res, getTrainedModelPath);
  if (!resolvedFile) return;
  await sendBinaryModel(res, resolvedFile, profileId ? `centroid_model_${profileId}.json` : 'centroid_model.json');
});

app.get('/latest-mlp-model', auth, async (req: Request, res: Response) => {
  const profileId =
    typeof req.query.profileId === 'string' ? req.query.profileId : undefined;
  if (profileId && !isProfileAuthorized(req, profileId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const resolvedFile = await resolveModelFile(profileId, res, getMlpModelPath);
  if (!resolvedFile) return;
  await sendBinaryModel(res, resolvedFile, profileId ? `dgs_model_${profileId}.npz` : 'dgs_model.npz');
});

// Model metadata: version, size, sha256
app.get('/model-metadata', auth, async (req: Request, res: Response) => {
  const profileId =
    typeof req.query.profileId === 'string' ? req.query.profileId : undefined;
  const resolvedFile = await resolveModelFile(profileId, res, getTrainedModelPath);
  if (!resolvedFile) return;
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkgRaw = await fs.readFile(pkgPath, 'utf8');
    const { version } = JSON.parse(pkgRaw);
    const stat = await fs.stat(resolvedFile);
    const buf = await fs.readFile(resolvedFile);
    const sha256 = createHash('sha256').update(buf).digest('hex');
    res.json({ version, size: stat.size, sha256 });
  } catch (err) {
    console.error('Failed to read model metadata:', err);
    res.status(404).json({ error: 'Model not found' });
  }
});

app.post('/analytics', auth, async (req: Request, res: Response) => {
  const { successRate7d, improvementTrend } = req.body || {};
  if (typeof successRate7d !== 'number' || typeof improvementTrend !== 'number') {
    res.status(400).json({ error: 'Invalid analytics' });
    return;
  }
  try {
    await saveAnalyticsToFile({
      id: 'default',
      gestureDefinitionId: 'default', // Placeholder
      successRate24h: 0, // Placeholder
      successRate7d,
      avgConfidenceScore: 0, // Placeholder
      improvementTrend,
      lastCalculated: Date.now(), // Placeholder
    });
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Save analytics failed:', err);
    res.status(500).json({ error: 'Failed to save analytics' });
  }
});

app.get('/analytics', auth, async (_req: Request, res: Response) => {
  const data = await loadAnalyticsFromFile();
  if (!data) {
    res.status(404).json({ error: 'Analytics not found' });
    return;
  }
  res.json(data);
});

const port = process.env.PORT || 5000;
(async () => {
  try {
    await ensureDataDir();
  } catch {}
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
})();
