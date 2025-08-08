import express from 'express';
import rateLimit from 'express-rate-limit';
import { loadAnalyticsFromFile } from '../services/analyticsService';
import { TRAINED_MODEL_PATH } from '../constants/modelPaths';
import { DB_FILE_PATH } from '../constants/dbPaths';
import {
  loadDatabase,
  saveDatabase,
  addGestureTrainingData,
  removeGestureTrainingData,
  getGestureTrainingDataById,
  updateGestureTrainingData,
} from '../db';
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
      <li><a href="/portal/training-data">Manage Training Data</a></li>
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

router.get('/training-data', limiter, async (_req, res) => {
  const db = await loadDatabase(DB_FILE_PATH);
  res.send(`<pre>${JSON.stringify(db.gestureTrainingData, null, 2)}</pre>`);
});

router.post('/training-data', limiter, async (req, res) => {
  const { gestureDefinitionId, landmarkData } = req.body || {};
  if (!gestureDefinitionId || !landmarkData) {
    res.status(400).send('Invalid payload');
    return;
  }
  const db = await loadDatabase(DB_FILE_PATH);
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
  addGestureTrainingData(db, {
    id,
    gestureDefinitionId,
    landmarkData,
    source: 'HIP_2',
    syncStatus: 'pending',
    approved: false,
  });
  await saveDatabase(db, DB_FILE_PATH);
  res.json({ id });
});

router.delete('/training-data/:id', limiter, async (req, res) => {
  const { id } = req.params;
  const db = await loadDatabase(DB_FILE_PATH);
  removeGestureTrainingData(db, id);
  await saveDatabase(db, DB_FILE_PATH);
  res.json({ status: 'deleted' });
});

router.post('/training-data/:id/approve', limiter, async (req, res) => {
  const { id } = req.params;
  const db = await loadDatabase(DB_FILE_PATH);
  const record = getGestureTrainingDataById(db, id);
  if (!record) {
    res.status(404).send('Not found');
    return;
  }
  record.approved = true;
  updateGestureTrainingData(db, record);
  await saveDatabase(db, DB_FILE_PATH);
  res.json({ status: 'approved' });
});

router.get('/training-data/export', limiter, async (_req, res) => {
  const db = await loadDatabase(DB_FILE_PATH);
  const approved = db.gestureTrainingData.filter((d) => d.approved);
  res.setHeader('Content-Disposition', 'attachment; filename="training-data.json"');
  res.json(approved);
});

export default router;
