import express from 'express';
import rateLimit from 'express-rate-limit';
import { TRAINED_MLP_MODEL_PATH, TRAINING_MANIFEST_PATH, DATA_DIR } from '../constants/modelPaths.js';
import { DB_FILE_PATH } from '../constants/dbPaths.js';
import {
  loadDatabase,
  saveDatabase,
  addGestureTrainingData,
  removeGestureTrainingData,
  getGestureTrainingDataById,
  updateGestureTrainingData,
} from '../db.js';
import type { Database } from '../db.js';
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

declare module 'express-serve-static-core' {
  interface Request {
    trainingBundleEntry?: TrainingManifestEntry;
    db?: Database;
  }
}

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

  const dataRoot = path.resolve(DATA_DIR);
  const expectedRoot = path.resolve(dataRoot, entry.storage.directory);
  if (expectedRoot !== dataRoot && !expectedRoot.startsWith(`${dataRoot}${path.sep}`)) {
    return null;
  }

  const target = path.resolve(expectedRoot, fileName);
  if (target === expectedRoot || target.startsWith(`${expectedRoot}${path.sep}`)) {
    return target;
  }
  return null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
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
        entry.profileId ? `Profil: ${escapeHtml(entry.profileId)}` : 'Profil: unbekannt',
        `Label: ${escapeHtml(entry.label)}`,
        entry.capturedAt ? `Erfasst: ${escapeHtml(entry.capturedAt)}` : null,
        entry.source ? `Quelle: ${escapeHtml(entry.source)}` : null,
      ]
        .filter(Boolean)
        .join(' · ');

      const clipHref = `/portal/training-bundles/${encodeURIComponent(entry.id)}/clip`;
      const metadataHref = `/portal/training-bundles/${encodeURIComponent(entry.id)}/metadata`;
      const files = Array.isArray(entry.storage.files) ? entry.storage.files : [];
      const filesList = files
        .map((file) => `<li>${escapeHtml(file)}</li>`)
        .join('');

      return `
        <section class="bundle">
          <h3>Bundle ${escapeHtml(entry.id)}</h3>
          <p>${meta}</p>
          <p>Eingegangen am: ${escapeHtml(entry.receivedAt)}</p>
          <details>
            <summary>Metadaten anzeigen</summary>
            <p><a href="${metadataHref}" target="_blank" rel="noopener">Metadaten als JSON</a></p>
            <strong>Enthaltene Dateien:</strong>
            <ul>${filesList}</ul>
          </details>
          <div class="bundle__video">
            <video src="${clipHref}" controls preload="metadata" class="bundle__video-element"></video>
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
      <li><a href="/portal/download-model">Download Personalized MLP</a></li>
      <li><a href="/portal/training-data">Manage Training Data</a></li>
      <li><a href="/portal/training-bundles">Training Bundles</a></li>
    </ul>
  `);
});

router.get('/analytics', limiter, async (req, res) => {
  const db = req.db ?? (req.app?.locals?.dbInstance as Database | undefined);
  if (!db) {
    res.status(500).send('Datenbank nicht initialisiert');
    return;
  }
  const analytics = db.learningAnalytics.find((entry) => entry.id === 'default');
  if (!analytics) {
    res.status(404).send('No analytics available');
    return;
  }
  res.send(`<pre>${JSON.stringify(analytics, null, 2)}</pre>`);
});

router.get('/download-model', limiter, async (_req, res) => {
  try {
    await fs.access(TRAINED_MLP_MODEL_PATH);
    res.download(TRAINED_MLP_MODEL_PATH);
  } catch {
    res.status(404).send('MLP model not found');
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
      <!doctype html>
      <html lang="de">
        <head>
          <meta charset="utf-8" />
          <title>Hochgeladene Trainingspakete</title>
          <style>
            body {
              font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              margin: 24px;
              background: #f7f7f7;
              color: #222;
            }
            a {
              color: #005ea8;
            }
            .bundle {
              border: 1px solid #ccc;
              padding: 12px;
              border-radius: 8px;
              margin-bottom: 16px;
              background: #fafafa;
              box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
            }
            .bundle__video {
              margin-top: 8px;
            }
            .bundle__video-element {
              max-width: 100%;
              height: auto;
              border-radius: 4px;
            }
          </style>
        </head>
        <body>
          <h1>Hochgeladene Trainingspakete</h1>
          <p>Hier sehen Pflegekräfte jedes Paket inklusive Video, bevor es in das Modell einfließt.</p>
          ${createManifestHtml(entries)}
          <p><a href="/portal">Zurück zur Übersicht</a></p>
        </body>
      </html>
    `;
    res.send(body);
  } catch (error) {
    res.status(500).send(`Training manifest could not be loaded: ${(error as Error).message}`);
  }
});

router.param('bundleId', async (req, res, next, bundleId) => {
  try {
    const entries = await loadTrainingManifest();
    const entry = entries.find((e) => e.id === bundleId);
    if (!entry) {
      res.status(404).send('Bundle not found');
      return;
    }
    req.trainingBundleEntry = entry;
    next();
  } catch (error) {
    res.status(500).send(`Training manifest could not be loaded: ${(error as Error).message}`);
  }
});

router.get('/training-bundles/:bundleId/metadata', limiter, (req, res) => {
  const entry = req.trainingBundleEntry;
  if (!entry) {
    res.status(500).send('Training bundle metadata is unavailable');
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
});

router.get('/training-bundles/:bundleId/clip', limiter, (req, res) => {
  const entry = req.trainingBundleEntry;
  if (!entry) {
    res.status(500).send('Training bundle clip is unavailable');
    return;
  }

  const files = Array.isArray(entry.storage.files) ? entry.storage.files : [];
  const clipFile = files.find((file) => file.endsWith('clip.mp4'));
  if (!clipFile) {
    res.status(404).send('No video clip available');
    return;
  }

  const clipPath = resolveStoredPath(entry, clipFile);
  if (!clipPath) {
    res.status(400).send('Invalid file path in bundle');
    return;
  }

  res.sendFile(clipPath, (err) => {
    if (err) {
      res.status(500).send('Video file could not be loaded');
    }
  });
});

export default router;
