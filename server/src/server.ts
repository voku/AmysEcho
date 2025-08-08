import express, { Request, Response } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { promises as fs } from 'fs';
import rateLimit from 'express-rate-limit';
import { TRAINED_MODEL_PATH } from './constants/modelPaths';
import { DB_FILE_PATH } from './constants/dbPaths';
import { setupDatabase, loadDatabase, saveDatabase, Database, logCorrection } from './db';
import auth from './middleware/auth';
import { mlService } from './services/mlService';
import { Correction, UsageStat, LearningAnalytics, Profile, SymbolRecord } from './types';
import { classifyGesture, ClassificationResult } from './recognizer';
import {
  saveAnalyticsToFile,
  loadAnalyticsFromFile,
} from './services/analyticsService';
import { getLLMSuggestions, LLMRequest } from './services/dialogEngine';

const app = express();
app.use(express.json());

const dialogLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.DIALOG_LIMIT) || 60,
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true,
});

// Serve static files from the portal directory
app.use('/portal', express.static(path.join(__dirname, 'portal')));

// Serve the main portal HTML file
app.get('/portal', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, 'portal', 'index.html'));
});

let dbInstance: Database; // Declare a variable to hold the database instance

// Utility to generate lightweight unique ids
const genId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2);

// Ensure the database file exists with default content and load it
setupDatabase(DB_FILE_PATH)
  .then(async (db) => {
    dbInstance = db;
    try {
      await mlService.loadModels();
    } catch (err) {
      console.error('ML model load failed:', err);
    }
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
  const landmarks = req.body?.landmarks;
  if (!Array.isArray(landmarks)) {
    res.status(400).json({ error: 'Invalid landmarks' });
    return;
  }
  const tmp = path.join(process.cwd(), 'tmp_landmarks.json');
  await fs.writeFile(tmp, JSON.stringify(landmarks));
  try {
    await new Promise<void>((resolve, reject) => {
      const p = spawn('python3', [path.join(__dirname, 'train.py'), tmp], { stdio: 'inherit' });
      p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    });
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Training failed:', err);
    res.status(500).json({ error: 'Training failed' });
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
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
    await fs.access(file);
    res.sendFile(file);
  }  catch {
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

// New /classify endpoint
app.post('/classify', auth, async (req: Request, res: Response) => {
  const { landmarks } = req.body;
  if (!landmarks) {
    return res.status(400).json({ error: 'Landmarks are required' });
  }
  try {
    let result: ClassificationResult | null = null;
    if (mlService.isServiceReady()) {
      try {
        result = await mlService.classifyGesture(landmarks);
      } catch (err) {
        console.error('Local model failed:', err);
      }
    }
    if (!result) {
      result = await classifyGesture(landmarks);
    }
    res.json(result);
  } catch (error) {
    console.error('Classification failed:', error);
    res.status(500).json({ error: 'Classification failed' });
  }
});

const port = process.env.PORT || 5000;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});



