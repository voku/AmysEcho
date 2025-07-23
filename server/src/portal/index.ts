import express from 'express';
import rateLimit from 'express-rate-limit';
import { loadAnalyticsFromFile } from '../services/analyticsService';
import { TRAINED_MODEL_PATH } from '../constants/modelPaths';
import { promises as fs } from 'fs';

const router = express.Router();

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
});

router.get('/', (_req, res) => {
  res.send(`
    <h1>Amy's Echo Portal</h1>
    <ul>
      <li><a href="/portal/analytics">View Analytics</a></li>
      <li><a href="/portal/download-model">Download Personalized Model</a></li>
    </ul>
  `);
});

router.get('/analytics', limiter, async (_req, res) => {
  const analytics = await loadAnalyticsFromFile();
  if (!analytics) {
    res.status(404).send('No analytics available');
    return;
  }
  res.send(`<pre>${JSON.stringify(analytics, null, 2)}</pre>`);
});

router.get('/download-model', limiter, async (_req, res) => {
  try {
    await fs.access(TRAINED_MODEL_PATH);
    res.download(TRAINED_MODEL_PATH);
  } catch {
    res.status(404).send('Model not found');
  }
});

export default router;
