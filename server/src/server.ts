import express, { Request, Response } from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import { getCentroids } from './services/dgsModelService';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { TRAINED_MODEL_PATH, DATA_DIR } from './constants/modelPaths';
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

// API routes for caregiver portal
app.use('/portal', portalRouter);

// Serve static files from the caregiver portal directory
app.use('/caregiver-portal', express.static(path.join(__dirname, 'caregiver-portal')));

app.use('/api/caregiver-portal', auth, caregiverPortalApiRouter);

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
}
const trainingJobs = new Map<string, TrainingJob>();
let trainingLock = false;

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

  // Add a labeled DGS sample (landmarks normalized [0..1])
  app.post('/api/v1/dgs/samples', auth, async (req: Request, res: Response) => {
  try {
    const Body = z.object({
      label: z.string().min(1),
      profileId: z.string().optional(),
      landmarks: z.array(z.array(z.array(z.number()))).min(1),
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'label and a sequence of landmarks (Nx21x3) required' });
    }
    const { label, profileId, landmarks } = parsed.data;
    const dataPath = path.join(DATA_DIR, 'dgs_samples.json');
    await fs.mkdir(DATA_DIR, { recursive: true });
    let data: any = { samples: [] };
    try {
      const raw = await fs.readFile(dataPath, 'utf8');
      data = JSON.parse(raw);
      if (!Array.isArray(data.samples)) data.samples = [];
    } catch {}
    data.samples.push({ id: genId(), label, profileId, landmarks, ts: Date.now() });
    await fs.writeFile(dataPath, JSON.stringify(data, null, 2));
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
    landmarkData: z.array(z.any()),
    profileId: z.string().optional(),
  });
  const BodySchema = z.object({ samples: z.array(SampleSchema) });
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid samples payload.', details: parsed.error.flatten() });
  }
  const samples = parsed.data.samples;

  const id = genId();
  const job: TrainingJob = { id, status: 'queued', progress: 0 };
  trainingJobs.set(id, job);

  // Start background job: append samples and recompute centroid model
  job.status = 'running';
  job.startedAt = Date.now();
  setImmediate(async () => {
    if (trainingLock) {
      job.status = 'failed';
      job.error = 'Another training job is in progress.';
      job.endedAt = Date.now();
      return;
    }
    trainingLock = true;
    try {
      const dataPath = path.join(DATA_DIR, 'dgs_samples.json');
      await fs.mkdir(DATA_DIR, { recursive: true });
      let data: any = { samples: [] };
      try {
        const raw = await fs.readFile(dataPath, 'utf8');
        data = JSON.parse(raw);
        if (!Array.isArray(data.samples)) data.samples = [];
      } catch {}
      const toAdd = samples.map((s) => ({
        id: genId(),
        label: s.gestureDefinitionId,
        profileId: s.profileId,
        landmarks: s.landmarkData,
        ts: Date.now(),
      }));
      const total = toAdd.length || 1;
      toAdd.forEach((s, idx) => {
        data.samples.push(s);
        job.progress = Math.round(((idx + 1) / total) * 50);
      });
      await fs.writeFile(dataPath, JSON.stringify(data, null, 2));

      // Compute centroids (global) and publish as the trained model
      const { centroids, counts } = await getCentroids();
      job.progress = 75;
      const out = { type: 'centroid_model', updatedAt: Date.now(), centroids, counts } as any;
      await fs.mkdir(path.dirname(TRAINED_MODEL_PATH), { recursive: true });
      await fs.writeFile(TRAINED_MODEL_PATH, JSON.stringify(out));

      job.progress = 100;
      job.status = 'completed';
      job.endedAt = Date.now();
    } catch (e: unknown) {
      job.status = 'failed';
      job.error = e instanceof Error ? e.message : String(e);
      job.endedAt = Date.now();
    } finally {
      trainingLock = false;
    }
  });

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

app.get('/latest-model', auth, async (_req: Request, res: Response) => {
  const file = TRAINED_MODEL_PATH;
  try {
    const stat = await fs.stat(file);
    const buf = await fs.readFile(file);
    const sha256 = createHash('sha256').update(buf).digest('hex');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stat.size.toString());
    res.setHeader('ETag', `"sha256-${sha256}"`);
    res.send(buf);
  } catch {
    res.status(404).json({ error: 'Model not found' });
  }
});

// Model metadata: version, size, sha256
app.get('/model-metadata', auth, async (_req: Request, res: Response) => {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkgRaw = await fs.readFile(pkgPath, 'utf8');
    const { version } = JSON.parse(pkgRaw);
    const stat = await fs.stat(TRAINED_MODEL_PATH);
    const buf = await fs.readFile(TRAINED_MODEL_PATH);
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

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
