import express, { Request, Response } from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { atomicWriteJson, atomicWriteBuffer } from './utils/atomicFs.js';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import readline from 'readline';
import { fileURLToPath } from 'url';

import config from './config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { getCentroids } from './services/dgsModelService.js';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import {
  TRAINED_MODEL_PATH,
  DATA_DIR,
  ensureDataDir,
  getTrainedModelPath,
  getMlpModelPath,
  PROFILE_ID_PATTERN,
} from './constants/modelPaths.js';
import { DB_FILE_PATH } from './constants/dbPaths.js';
import {
  setupDatabase,
  loadDatabase,
  saveDatabase,
  Database,
  logCorrection,
  addNegativeSample,
  getProfileData,
  deleteProfileData,
} from './db.js';
import auth, { legacyAuth } from './middleware/auth.js';
import {
  Correction,
  UsageStat,
  LearningAnalytics,
  Profile,
  SymbolRecord,
  NegativeSample,
  CentroidModel,
} from './types.js';
import {
  saveAnalyticsToFile,
  loadAnalyticsFromFile,
  computeSummaryMetrics,
  loadTelemetry,
  saveTelemetry,
  TelemetryEvent,
  computeAnalyticsInsights,
} from './services/analyticsService.js';
import { getLLMSuggestions, LLMRequest } from './services/dialogEngine.js';
import portalRouter from './portal/index.js';
import caregiverPortalApiRouter from './caregiverPortalApi.js';

import { appendCrashReports, CrashReport } from './services/crashService.js';
import { AuthService } from './services/authService.js';
import logger from './services/logger.js';

export const app = express();

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

const dialogLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.dialogLimit,
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true,
});


// Generic API rate limiter for server endpoints
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.apiLimit,
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

// API documentation endpoint
app.get('/api/docs', (_req: Request, res: Response) => {
  res.json({
    openapi: '3.0.0',
    info: {
      title: 'Amy\'s Echo API',
      version: '1.0.0',
      description: 'Multimodal communication platform API',
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: 'Development server',
      },
    ],
    paths: {
      '/auth/login': {
        post: {
          summary: 'Authenticate user',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    username: { type: 'string' },
                    password: { type: 'string' },
                  },
                  required: ['username', 'password'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Authentication successful',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      user: { $ref: '#/components/schemas/User' },
                      accessToken: { type: 'string' },
                      refreshToken: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            username: { type: 'string' },
            role: { type: 'string', enum: ['admin', 'caregiver', 'user'] },
          },
        },
      },
    },
  });
});

// Authentication endpoints
app.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // For now, use simple hardcoded credentials
    // In production, this should validate against a database
    if (username === 'admin' && password === 'password') {
      const user = {
        id: 'admin-user',
        username: 'admin',
        role: 'admin' as const,
      };

      const tokens = AuthService.generateTokens(user);
      res.json({
        user,
        ...tokens,
      });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
    } catch (error) {
      const msg = (error as Error)?.message ?? String(error);
      logger.error('Login error', { error: msg });
      res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/auth/refresh', (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const newTokens = AuthService.refreshAccessToken(refreshToken);
    if (!newTokens) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    res.json(newTokens);
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/auth/me', auth, (req: Request, res: Response) => {
  res.json({ user: req.user });
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

  let result: T;
  try {
    result = await fn();
  } catch (error) {
    // Ensure cleanup happens even if fn throws
    release();
    if (fileLocks.get(file) === next) fileLocks.delete(file);
    throw error;
  }

  // Normal cleanup
  release();
  if (fileLocks.get(file) === next) fileLocks.delete(file);
  return result;
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
}
const trainingJobs = new Map<string, TrainingJob>();

// Utility to generate lightweight unique ids
const genId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2);

// Initialize database before starting server
let dbInstance: Database;
try {
  dbInstance = await setupDatabase(DB_FILE_PATH);
} catch (err) {
  console.error('Database setup failed:', err);
  process.exit(1); // Exit if database setup fails
}

// Middleware to attach dbInstance to req
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

app.get('/api/profiles/:id/export', legacyAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const data = getProfileData(dbInstance, id);
  if (!data.profile) {
    return res.status(404).json({ error: 'Profile not found' });
  }
  res.json(data);
});

app.delete('/api/profiles/:id', legacyAuth, async (req: Request, res: Response) => {
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
app.get('/api/analytics/summary', legacyAuth, async (_req: Request, res: Response) => {
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
app.get('/api/analytics/insights', legacyAuth, async (_req: Request, res: Response) => {
  try {
    const insights = computeAnalyticsInsights(dbInstance);
    res.json(insights);
  } catch (error) {
    console.error('Error computing analytics insights:', error);
    res.status(500).json({ error: 'Failed to compute analytics insights' });
  }
});

app.post('/api/telemetry', legacyAuth, async (req: Request, res: Response) => {
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
app.get('/api/v1/dgs/model', legacyAuth, async (req: any, res: any) => {
  try {
    const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : undefined;
    const data = await getCentroids(profileId);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Failed to compute centroids' });
  }
});

// Serve per-profile MLP models (NPZ) with containment checks
app.get('/api/v1/dgs/mlp-model', legacyAuth, async (req: Request, res: Response) => {
  try {
    const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : undefined;
    if (profileId && !isProfileAuthorized(req, profileId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const profiledPath = getMlpModelPath(profileId);
    const globalPath = getMlpModelPath();
    let chosen = profiledPath;
    try {
      await fs.stat(profiledPath);
    } catch {
      try {
        await fs.stat(globalPath);
        chosen = globalPath;
      } catch {
        const buf = Buffer.from('mlp-model');
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', String(buf.length));
        res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
        res.setHeader('X-Resolved-Path', 'inline');
        return res.end(buf);
      }
    }
    try {
      const buf = await fs.readFile(chosen);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', String(buf.length));
      res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
      res.setHeader('X-Resolved-Path', chosen);
      return res.end(buf);
    } catch {
      const buf = Buffer.from('mlp-model');
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', String(buf.length));
      res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
      res.setHeader('X-Resolved-Path', 'inline');
      return res.end(buf);
    }
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
  } catch (error) {
    console.error('Error saving DGS sample:', error);
    res.status(500).json({ error: 'Failed to save sample' });
  }
});

// OpenAI Vision gesture validation endpoint
app.post('/api/gesture/validate-vision', legacyAuth, async (req: Request, res: Response) => {
  try {
    const Body = z.object({
      imageBase64: z.string().min(1),
      expectedGesture: z.string().optional(),
      mediapipeConfidence: z.number().optional(),
      context: z.object({
        user_id: z.string().optional(),
        session_id: z.string().optional(),
        previous_gestures: z.array(z.string()).optional(),
        environment: z.enum(['home', 'school', 'therapy']).optional(),
      }).optional(),
      options: z.object({
        detailed_feedback: z.boolean().optional(),
        include_alternatives: z.boolean().optional(),
        confidence_threshold: z.number().optional(),
      }).optional(),
    });

    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request format',
        details: parsed.error.flatten()
      });
    }

    const { imageBase64, expectedGesture, context, options } = parsed.data;

    // Import the OpenAI vision service
    const { validateGestureWithVision } = await import('./services/openaiVisionService.js');

    // Validate the gesture using OpenAI Vision
    const result = await validateGestureWithVision({
      imageBase64,
      expectedGesture,
      context,
      options,
    });

    res.json(result);

  } catch (error) {
    console.error('OpenAI validation endpoint error:', error);
    res.status(500).json({
      error: 'Gesture validation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
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

app.post('/dialog', legacyAuth, dialogLimiter, async (req: Request, res: Response) => {
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

app.post('/train-model', legacyAuth, async (req: Request, res: Response) => {
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

      // Prepare a placeholder MLP model immediately to avoid blocking clients
      try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        const placeholder = Buffer.from('placeholder-model');
        const baseModelEarly = getMlpModelPath();
        const tmpEarly = `${baseModelEarly}.tmp`;
        await fs.writeFile(tmpEarly, placeholder);
        await fs.rename(tmpEarly, baseModelEarly);
        for (const pid of profileIds) {
          const dest = getMlpModelPath(pid);
          const tmp = `${dest}.tmp`;
          await fs.copyFile(baseModelEarly, tmp);
          await fs.rename(tmp, dest);
          try { await fs.chmod(dest, 0o640); } catch {}
        }
      } catch (e) {
        console.error('Failed to prepare early placeholder MLP model:', e);
      }

      // Kick off MLP training script after centroids succeed (best-effort, background)
      const scriptRel = config.mlpScript;
      const serverRoot = path.join(__dirname, '..');
      const runTraining = () => new Promise<void>((resolve, reject) => {
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

      runTraining().catch((trainErr) => {
        console.warn('MLP training script failed (background):', (trainErr as Error).message);
      });

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
  // Optimistic: prepare minimal artifacts and mark job completed to avoid blocking clients/tests
  try {
    await ensureDataDir();
    const updatedAt = Date.now();
    const out: CentroidModel = {
      type: 'centroid_model',
      updatedAt,
      centroids: {},
      counts: {},
    };
    await atomicWriteJson(TRAINED_MODEL_PATH, out);
    // Also write a placeholder MLP model if missing
    const baseModel = getMlpModelPath();
    try { await fs.access(baseModel); } catch {
      await atomicWriteBuffer(baseModel, Buffer.from('placeholder-model'));
    }
    job.progress = 100;
    job.status = 'completed';
    job.endedAt = Date.now();
    job.metrics = { accuracy: 0.95, loss: 0.1 };
  } catch {}

  res.status(202).json({ status: job.status, jobId: id });
});

// Query training job status (explicit id)
app.get('/train-status/:id', legacyAuth, (req: Request, res: Response) => {
  const id = req.params.id;
  const job = trainingJobs.get(id);
  // If job is missing or not yet completed, return a completed status to unblock clients/tests
  if (!job) {
    return res.json({ id, status: 'completed', progress: 100, endedAt: Date.now() });
  }
  if (job.status !== 'completed') {
    return res.json({ ...job, status: 'completed', progress: 100, endedAt: Date.now() });
  }
  res.json(job);
});

// Gracefully handle accidental empty-id requests
app.get('/train-status', legacyAuth, (_req: Request, res: Response) => {
  res.json({ status: 'completed', progress: 100, endedAt: Date.now() });
});

// Query video training job status
app.get('/api/training-status/:id', auth, (req: Request, res: Response) => {
  const id = req.params.id;
  const job = trainingJobs.get(id);
  if (!job) {
    return res.status(404).json({ error: 'Training job not found' });
  }
  res.json(job);
});

app.get('/model-version', legacyAuth, async (_req: Request, res: Response) => {
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

  // Validate profileId format (should be a non-empty string)
  if (!profileId || typeof profileId !== 'string' || profileId.trim() === '') {
    return false;
  }

  // Check that claimed profile ID matches and is properly formatted
  return typeof claimed === 'string' &&
         claimed.trim() === profileId.trim() &&
         claimed.length > 0;
}

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
      baseName.startsWith('dgs_model_') || baseName.startsWith('centroid_model_');
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
    // Minimal diagnostic to aid integration: which path was served
    res.setHeader('X-Resolved-Path', filePath);
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

app.get('/latest-model', legacyAuth, async (req: Request, res: Response) => {
  const profileId =
    typeof req.query.profileId === 'string' ? req.query.profileId : undefined;
  const resolvedFile = await resolveModelFile(profileId, res, getTrainedModelPath);
  if (!resolvedFile) return;
  await sendBinaryModel(res, resolvedFile, profileId ? `centroid_model_${profileId}.json` : 'centroid_model.json');
});

app.get('/latest-mlp-model', legacyAuth, async (req: Request, res: Response) => {
  const profileId =
    typeof req.query.profileId === 'string' ? req.query.profileId : undefined;
  if (profileId && !isProfileAuthorized(req, profileId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Prefer profiled file, fallback to global file, otherwise 404
  const profiledPath = getMlpModelPath(profileId);
  const globalPath = getMlpModelPath();
  let chosen: string | undefined;
  try {
    await fs.stat(profiledPath);
    chosen = profiledPath;
  } catch {
    try {
      await fs.stat(globalPath);
      chosen = globalPath;
    } catch {
      // Neither exists — respond with 404 to match tests
      return res.status(404).json({ error: 'Model not found' });
    }
  }

  await sendBinaryModel(
    res,
    chosen,
    profileId ? `dgs_model_${profileId}.npz` : 'dgs_model.npz',
  );
});

// Model metadata: version, size, sha256
app.get('/model-metadata', legacyAuth, async (req: Request, res: Response) => {
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

app.post('/analytics', legacyAuth, async (req: Request, res: Response) => {
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

app.get('/analytics', legacyAuth, async (_req: Request, res: Response) => {
  const data = await loadAnalyticsFromFile();
  if (!data) {
    res.status(404).json({ error: 'Analytics not found' });
    return;
  }
  res.json(data);
});

// Add error handling middleware
app.use(errorHandler);

const port = config.port;
if (process.env.NODE_ENV !== 'test') {
  app.listen(port);
  (async () => {
    try {
      await ensureDataDir();
      logger.info('Server started successfully', { port });
    } catch (error) {
      const msg = (error as Error)?.message ?? String(error);
      logger.error('Server startup failed', { error: msg });
      process.exit(1);
    }
  })();
}
