import express, { Request, Response } from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { atomicWriteJson, atomicWriteBuffer } from './utils/atomicFs.js';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import readline from 'readline';
import { fileURLToPath } from 'url';

import config from './config/index.js';
import { withFileLock } from './utils/fileLock.js';
import { registerTrainingBundleRoute } from './routes/trainingBundleRoute.js';

const serverModuleDir = path.dirname(fileURLToPath(import.meta.url));
import { getCentroids, normalize } from './services/dgsModelService.js';
import type { Point } from './services/dgsModelService.js';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import {
  TRAINED_MODEL_PATH,
  DATA_DIR,
  ensureDataDir,
  getTrainedModelPath,
  getMlpModelPath,
  PROFILE_ID_PATTERN,
  SERVER_DIR,
  BASELINE_MLP_MODEL_PATH,
  TRAINING_MANIFEST_PATH,
  MLP_MODELS_DIR,
  TRAINED_MLP_GLOBAL_DIR,
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
  computeSummaryMetrics,
  loadTelemetry,
  saveTelemetry,
  TelemetryEvent,
  computeAnalyticsInsights,
  computeLearningAnalytics,
} from './services/analyticsService.js';
import { getLLMSuggestions, LLMRequest } from './services/dialogEngine.js';
import portalRouter from './portal/index.js';
import caregiverPortalApiRouter from './caregiverPortalApi.js';

import { appendCrashReports, CrashReport } from './services/crashService.js';
import { AuthService } from './services/authService.js';
import logger from './services/logger.js';
import { ingestTrainingBundlesIntoDataset } from './services/trainingBundleIngestor.js';

export const app = express();

const portalPath = path.join(serverModuleDir, 'portal');
let portalAvailable = true;
try {
  await fs.access(portalPath);
} catch (error) {
  portalAvailable = false;
  logger.warn('Portal directory missing', { portalPath, error: (error as Error).message });
}

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

const analyticsPostLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const modelMetadataLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// Serve static files from the portal directory
if (portalAvailable) {
  app.use('/portal', express.static(portalPath));
}

// Serve the main portal HTML file
app.get('/portal', (_req: Request, res: Response) => {
  if (!portalAvailable) {
    return res.status(404).send('Portal not available');
  }
  const indexPath = path.join(portalPath, 'index.html');
  res.sendFile(indexPath, (error) => {
    if (!error) return;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      res.status(404).send('Portal not available');
    } else {
      logger.error('Failed to serve portal index', { error: (error as Error).message });
      if (!res.headersSent) {
        res.status(500).send('Failed to load portal');
      }
    }
  });
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
app.use('/caregiver-portal', express.static(path.join(serverModuleDir, 'caregiver-portal')));

app.use('/api/caregiver-portal', auth, caregiverPortalApiRouter);

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
const trainingJobs = new Map<string, TrainingJob>();

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
try {
  dbInstance = await setupDatabase(DB_FILE_PATH);
  app.locals.dbInstance = dbInstance;
} catch (err) {
  console.error('Database setup failed:', err);
  process.exit(1); // Exit if database setup fails
}

// Middleware to attach dbInstance to req
app.use((req: Request, res: Response, next: Function) => {
  req.db = dbInstance;
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

registerTrainingBundleRoute(app, genId);

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

  const id = genId();
  const job: TrainingJob = { id, status: 'running', progress: 0, startedAt: Date.now() };
  trainingJobs.set(id, job);

  try {
    await ensureDataDir();
    await logTraining(`job ${id}: data dir ready at ${DATA_DIR}`);
    const dataPath = path.join(DATA_DIR, 'dgs_samples.json');
    const toAdd = samples.map((s: Sample) => ({
      id: genId(),
      label: s.gestureDefinitionId,
      profileId: s.profileId,
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

    let { centroids, counts } = await getCentroids();
    if (Object.keys(centroids).length === 0 && toAdd.length > 0) {
      const rebuilt: Record<string, Point[][]> = {};
      const rebuiltCounts: Record<string, number> = {};
      for (const sample of toAdd) {
        const pts = normalize(sample.landmarks as any);
        if (!pts || pts.length === 0) continue;
        if (!rebuilt[sample.label]) rebuilt[sample.label] = [];
        rebuilt[sample.label].push(pts as Point[]);
        rebuiltCounts[sample.label] = (rebuiltCounts[sample.label] || 0) + 1;
      }
      const centroidFrom = (arrs: Point[][]): Point[] => {
        if (!arrs.length) return [];
        const len = arrs[0].length;
        const acc: number[][] = Array.from({ length: len }, () => [0, 0, 0]);
        for (const a of arrs) {
          for (let i = 0; i < len; i++) {
            acc[i][0] += a[i][0];
            acc[i][1] += a[i][1];
            acc[i][2] += a[i][2];
          }
        }
        const inv = 1 / arrs.length;
        return acc.map(([x, y, z]) => [x * inv, y * inv, z * inv] as Point);
      };
      centroids = Object.fromEntries(Object.entries(rebuilt).map(([label, arrs]) => [label, centroidFrom(arrs)]));
      counts = rebuiltCounts;
      await logTraining(`job ${id}: rebuilt centroids inline for labels=${Object.keys(counts).join(',')}`);
    }
    await logTraining(`job ${id}: centroids computed labels=${Object.keys(counts).join(',')}`);

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
    await logTraining(`job ${id}: wrote global centroid model`);

    const profileIds = Array.from(
      new Set(
        samples
          .map((s) => s.profileId)
          .filter((p): p is string => !!p && PROFILE_ID_PATTERN.test(p)),
      ),
    );
    const perProfileCounts = new Map<string, Record<string, number>>();
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
      perProfileCounts.set(pid, pcnts);
      await logTraining(`job ${id}: wrote centroid model for ${pid}`);
    }

    try {
      const baseModel = getMlpModelPath();
      await writeMinimalMlpModel(baseModel, counts);
      await logTraining(`job ${id}: seeded global MLP`);
      for (const pid of profileIds) {
        const dest = getMlpModelPath(pid);
        await writeMinimalMlpModel(dest, perProfileCounts.get(pid) ?? counts);
        await logTraining(`job ${id}: seeded MLP for ${pid}`);
      }
    } catch (e) {
      console.error('Failed to prepare early MLP model:', e);
      await logTraining(`job ${id}: minimal MLP failed ${String(e)}`);
    }

    // Run full training script synchronously so we can surface its report
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
        // In case of stray newlines pick the last JSON object
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
  } catch (e: unknown) {
    job.status = 'failed';
    job.error = e instanceof Error ? e.message : String(e);
    job.endedAt = Date.now();
    await logTraining(`job ${id}: failed ${String(job.error)}`);
  }
  trainingJobs.set(id, job);

  if (job.status === 'failed') {
    return res.status(500).json({ status: job.status, jobId: id, error: job.error });
  }

  res.status(200).json({
    status: job.status,
    jobId: id,
    report: job.report ?? {},
    message: job.message ?? 'Dein Modell ist jetzt aktualisiert',
    metrics: job.metrics ?? {},
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
app.get('/api/training-status/:id', auth, (req: Request, res: Response) => {
  const id = req.params.id;
  const result = buildTrainingStatusResponse(trainingJobs, id);
  res.status(result.status).json(result.body);
});

app.get('/model-version', legacyAuth, async (_req: Request, res: Response) => {
  try {
    const pkg = await readServerPackageJson();
    const { version } = pkg;
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

async function writeMinimalMlpModel(filePath: string, gestureCounts: Record<string, number>): Promise<void> {
  const entries = Object.entries(gestureCounts).map(([label, count]) => [label, Number(count) || 0] as const);
  const hasCounts = entries.some(([, count]) => count > 0);

  if (!hasCounts) {
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.copyFile(BASELINE_MLP_MODEL_PATH, filePath);
      await fs.chmod(filePath, 0o640);
      await logTraining(`seeded MLP from baseline into ${filePath}`);
      return;
    } catch (copyErr) {
      await logTraining(`failed to copy baseline MLP (${String(copyErr)}), falling back to minimal generation`);
    }
  }

  const labels = entries.map(([label]) => label);
  const counts = entries.map(([, count]) => count);
  const payload = JSON.stringify({ labels, counts });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const script = `import json, numpy as np, os, sys\n` +
    `path = sys.argv[1]\n` +
    `payload = json.loads(sys.argv[2])\n` +
    `labels = np.array(payload.get('labels', []), dtype='<U64')\n` +
    `counts = np.array(payload.get('counts', []), dtype=np.float32)\n` +
    `tmp = path + '.tmp'\n` +
    `os.makedirs(os.path.dirname(path) or '.', exist_ok=True)\n` +
    `with open(tmp, 'wb') as f:\n` +
    `    np.savez(f, labels=labels, counts=counts)\n` +
    `os.replace(tmp, path)\n`;

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('python3', ['-c', script, filePath, payload], {
      cwd: path.join(serverModuleDir, '..'),
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `python exited with ${code}`));
      }
    });
  });

  await logTraining(`wrote minimal MLP model to ${filePath} (${labels.length} labels)`);

  try {
    await fs.chmod(filePath, 0o640);
  } catch {}
}

async function sendBinaryModel(res: Response, filePath: string, downloadName: string) {
  try {
    const stat = await fs.stat(filePath);
    // ETag & checksum
    const buf = await fs.readFile(filePath);
    const sha256 = createHash('sha256').update(buf).digest('hex');

    // Range support
    const range = (res.req.headers['range'] as string | undefined) || undefined;
    res.setHeader('Accept-Ranges', 'bytes');
    const baseName = path.basename(filePath);
    let isProfileSpecific = baseName.startsWith('centroid_model_');
    if (!isProfileSpecific) {
      const modelsDirResolved = path.resolve(MLP_MODELS_DIR);
      if (filePath.startsWith(modelsDirResolved)) {
        const relDir = path.relative(modelsDirResolved, path.dirname(filePath));
        const firstSegment = relDir.split(path.sep)[0];
        if (firstSegment && firstSegment !== 'global' && firstSegment !== '.') {
          isProfileSpecific = true;
        }
      }
    }
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
    await logTraining(`latest-mlp-model resolved profile file ${profiledPath}`);
  } catch {
    try {
      await fs.stat(globalPath);
      chosen = globalPath;
      await logTraining(`latest-mlp-model falling back to global file ${globalPath}`);
    } catch {
      // Neither exists — respond with 404 to match tests
      await logTraining(`latest-mlp-model missing profile=${profileId ?? 'global'}`);
      return res.status(404).json({ error: 'Model not found' });
    }
  }

  await logTraining(`latest-mlp-model serving ${chosen}`);
  await sendBinaryModel(
    res,
    chosen,
    profileId ? `dgs_model_${profileId}.npz` : 'amy_model.npz',
  );
});

// Model metadata: version, size, sha256
app.get(
  '/model-metadata',
  legacyAuth,
  modelMetadataLimiter,
  async (req: Request, res: Response) => {
  const profileId =
    typeof req.query.profileId === 'string' ? req.query.profileId : undefined;
  const resolvedFile = await resolveModelFile(profileId, res, getTrainedModelPath);
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

app.post(
  '/analytics',
  legacyAuth,
  analyticsPostLimiter,
  async (_req: Request, res: Response) => {
    try {
      const analytics = computeLearningAnalytics(dbInstance);
      const existingIndex = dbInstance.learningAnalytics.findIndex(
        (entry) => entry.id === analytics.id,
      );
      if (existingIndex >= 0) {
        dbInstance.learningAnalytics[existingIndex] = analytics;
      } else {
        dbInstance.learningAnalytics.push(analytics);
      }
      await withFileLock(DB_FILE_PATH, async () => {
        await saveDatabase(dbInstance, DB_FILE_PATH);
      });
      res.json(analytics);
    } catch (err) {
      console.error('Save analytics failed:', err);
      res.status(500).json({ error: 'Failed to save analytics' });
    }
  },
);

app.get('/analytics', legacyAuth, async (_req: Request, res: Response) => {
  const analytics = dbInstance.learningAnalytics.find((entry) => entry.id === 'default');
  if (!analytics) {
    res.status(404).json({ error: 'Analytics not found' });
    return;
  }
  res.json(analytics);
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
