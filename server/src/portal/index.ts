import express from 'express';
import rateLimit from 'express-rate-limit';
import { loadAnalyticsFromFile } from '../services/analyticsService.js';
import {
  TRAINED_MODEL_PATH,
  TRAINING_MANIFEST_PATH,
  DATA_DIR,
} from '../constants/modelPaths.js';
import { DB_FILE_PATH } from '../constants/dbPaths.js';
import {
  loadDatabase,
  saveDatabase,
  addGestureTrainingData,
  removeGestureTrainingData,
  getGestureTrainingDataById,
  updateGestureTrainingData,
} from '../db.js';
import { promises as fs } from 'fs';
import path from 'path';

type TrainingManifestEntry = {
  id: string;
  label: string;
  profileId: string | null;
  capturedAt: string | null;
  source: string | null;
  storage: {
    directory: string;
    files: string[];
  };
  receivedAt: string;
};

async function loadTrainingManifest(): Promise<TrainingManifestEntry[]> {
  try {
    const raw = await fs.readFile(TRAINING_MANIFEST_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.entries)) {
      throw new Error('Manifest has unexpected structure');
    }
    return parsed.entries as TrainingManifestEntry[];
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function resolveStoredPath(entry: TrainingManifestEntry, fileName: string): string | null {
  if (typeof entry.storage?.directory !== 'string') {
    return null;
  }
  const target = path.resolve(DATA_DIR, entry.storage.directory, fileName);
  const expectedRoot = path.resolve(DATA_DIR, entry.storage.directory);
  if (target === expectedRoot || target.startsWith(`${expectedRoot}${path.sep}`)) {
    return target;
  }
  return null;
}

function createManifestHtml(entries: TrainingManifestEntry[]): string {
  if (!entries.length) {
    return '<p>Noch keine Trainingspakete vorhanden.</p>';
  }

  const rows = entries
    .slice()
    .reverse()
    .map((entry) => {
      const meta = [
        entry.profileId ? `Profil: ${entry.profileId}` : 'Profil: unbekannt',
        `Label: ${entry.label}`,
        entry.capturedAt ? `Erfasst: ${entry.capturedAt}` : null,
        entry.source ? `Quelle: ${entry.source}` : null,
      ]
        .filter(Boolean)
        .join(' · ');

      const clipHref = `/portal/training-bundles/${encodeURIComponent(entry.id)}/clip`;
      const metadataHref = `/portal/training-bundles/${encodeURIComponent(entry.id)}/metadata`;
      const files = Array.isArray(entry.storage.files) ? entry.storage.files : [];
      const filesList = files
        .map((file) => `<li>${file}</li>`)
        .join('');

      return `
        <section style="border:1px solid #ccc;padding:12px;border-radius:8px;margin-bottom:16px;background:#fafafa">
          <h3>Bundle ${entry.id}</h3>
          <p>${meta}</p>
          <p>Eingegangen am: ${entry.receivedAt}</p>
          <details>
            <summary>Metadaten anzeigen</summary>
            <p><a href="${metadataHref}" target="_blank" rel="noopener">Metadaten als JSON</a></p>
            <strong>Enthaltene Dateien:</strong>
            <ul>${filesList}</ul>
          </details>
          <div style="margin-top:8px">
            <video src="${clipHref}" controls preload="metadata" style="max-width:100%;height:auto"></video>
          </div>
        </section>
      `;
    })
    .join('\n');

  return rows;
}

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
      <li><a href="/portal/training-bundles">Training Bundles</a></li>
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

router.get('/training-bundles', limiter, async (_req, res) => {
  try {
    const entries = await loadTrainingManifest();
    const body = `
      <h1>Hochgeladene Trainingspakete</h1>
      <p>Hier sehen Pflegekräfte jedes Paket inklusive Video, bevor es in das Modell einfließt.</p>
      ${createManifestHtml(entries)}
      <p><a href="/portal">Zurück zur Übersicht</a></p>
    `;
    res.send(body);
  } catch (error) {
    res.status(500).send(`Training manifest konnte nicht geladen werden: ${(error as Error).message}`);
  }
});

router.get('/training-bundles/:id/metadata', limiter, async (req, res) => {
  try {
    const entries = await loadTrainingManifest();
    const entry = entries.find((e) => e.id === req.params.id);
    if (!entry) {
      res.status(404).send('Bundle nicht gefunden');
      return;
    }
    res.json({
      id: entry.id,
      profileId: entry.profileId,
      label: entry.label,
      capturedAt: entry.capturedAt,
      source: entry.source,
      receivedAt: entry.receivedAt,
    });
  } catch (error) {
    res.status(500).send(`Metadaten konnten nicht geladen werden: ${(error as Error).message}`);
  }
});

router.get('/training-bundles/:id/clip', limiter, async (req, res) => {
  try {
    const entries = await loadTrainingManifest();
    const entry = entries.find((e) => e.id === req.params.id);
    if (!entry) {
      res.status(404).send('Bundle nicht gefunden');
      return;
    }

    const clipFile = entry.storage.files.find((file) => file.endsWith('clip.mp4'));
    if (!clipFile) {
      res.status(404).send('Kein Videoclip vorhanden');
      return;
    }

    const clipPath = resolveStoredPath(entry, clipFile);
    if (!clipPath) {
      res.status(400).send('Ungültiger Dateipfad im Bundle');
      return;
    }

    res.sendFile(clipPath, (err) => {
      if (err) {
        res.status(500).send('Videodatei konnte nicht geladen werden');
      }
    });
  } catch (error) {
    res.status(500).send(`Videodatei konnte nicht geladen werden: ${(error as Error).message}`);
  }
});

export default router;
