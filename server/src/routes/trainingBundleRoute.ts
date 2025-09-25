import express, { Request, Response } from 'express';
import type { Express } from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import AdmZip, { IZipEntry } from 'adm-zip';

import { atomicWriteJson, atomicWriteBuffer } from '../utils/atomicFs.js';
import {
  ensureDataDir,
  TRAINING_UPLOADS_DIR,
  TRAINING_DATASETS_DIR,
  TRAINING_MANIFEST_PATH,
  DATA_DIR,
  PROFILE_ID_PATTERN,
} from '../constants/modelPaths.js';
import { legacyAuth } from '../middleware/auth.js';
import { withFileLock } from '../utils/fileLock.js';

interface TrainingBundleManifestEntry {
  id: string;
  profileId: string | null;
  label: string;
  capturedAt: string | null;
  source: string | null;
  storage: {
    directory: string;
    bundle: string;
    files: string[];
  };
  metadata: unknown;
  receivedAt: string;
}

interface TrainingBundleManifestFile {
  entries: TrainingBundleManifestEntry[];
}

const trainingBundleUpload = express.raw({ type: 'application/zip', limit: '64mb' });

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function registerTrainingBundleRoute(app: Express, genId: () => string): void {
  app.post('/api/v1/dgs/sample-bundles', legacyAuth, trainingBundleUpload, async (req: Request, res: Response) => {
    try {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: 'ZIP payload required' });
      }

      await ensureDataDir();
      await fs.mkdir(TRAINING_UPLOADS_DIR, { recursive: true });

      let zip: AdmZip;
      try {
        zip = new AdmZip(req.body as Buffer);
      } catch (error) {
        console.error('Invalid training bundle ZIP:', error);
        return res.status(400).json({ error: 'Invalid training bundle ZIP' });
      }

      const metadataEntry = zip.getEntry('metadata.json');
      if (!metadataEntry) {
        return res.status(400).json({ error: 'metadata.json missing from bundle' });
      }

      let metadataContent: string;
      try {
        metadataContent = metadataEntry.getData().toString('utf8');
      } catch (error) {
        console.error('Failed to read metadata.json from bundle:', error);
        return res.status(400).json({ error: 'Failed to read metadata.json' });
      }

      let metadata: any;
      try {
        metadata = JSON.parse(metadataContent);
      } catch (error) {
        console.error('metadata.json is not valid JSON:', error);
        return res.status(400).json({ error: 'metadata.json must be valid JSON' });
      }

      const label = isNonEmptyString(metadata.label) ? metadata.label.trim() : '';
      if (!label) {
        return res.status(400).json({ error: 'metadata.label is required' });
      }

      const profileIdRaw = isNonEmptyString(metadata.profileId) ? metadata.profileId.trim() : undefined;
      if (profileIdRaw && !PROFILE_ID_PATTERN.test(profileIdRaw)) {
        return res.status(400).json({ error: 'metadata.profileId is invalid' });
      }

      const bundleId = genId();
      const profileBucket = profileIdRaw ?? 'unassigned';
      const bundleRoot = path.join(TRAINING_UPLOADS_DIR, profileBucket, bundleId);
      await fs.mkdir(bundleRoot, { recursive: true });

      const bundleZipPath = path.join(bundleRoot, 'bundle.zip');
      await atomicWriteBuffer(bundleZipPath, req.body as Buffer);

      try {
        zip.extractAllTo(bundleRoot, true);
      } catch (error) {
        console.error('Failed to extract training bundle payload:', error);
        return res.status(400).json({ error: 'Failed to extract training bundle' });
      }

      const manifestEntry: TrainingBundleManifestEntry = {
        id: bundleId,
        profileId: profileIdRaw ?? null,
        label,
        capturedAt: isNonEmptyString(metadata.capturedAt) ? metadata.capturedAt : null,
        source: isNonEmptyString(metadata.source) ? metadata.source : null,
        storage: {
          directory: path.relative(DATA_DIR, bundleRoot),
          bundle: path.relative(DATA_DIR, bundleZipPath),
          files: zip
            .getEntries()
            .filter((entry: IZipEntry) => !entry.isDirectory)
            .map((entry: IZipEntry) => entry.entryName),
        },
        metadata,
        receivedAt: new Date().toISOString(),
      };

      await withFileLock(TRAINING_MANIFEST_PATH, async () => {
        await fs.mkdir(TRAINING_DATASETS_DIR, { recursive: true });

        let manifest: TrainingBundleManifestFile = { entries: [] };
        try {
          const raw = await fs.readFile(TRAINING_MANIFEST_PATH, 'utf8');
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.entries)) {
            manifest.entries = parsed.entries as TrainingBundleManifestEntry[];
          }
        } catch (error: any) {
          if (error?.code !== 'ENOENT') throw error;
        }

        manifest.entries.push(manifestEntry);
        await atomicWriteJson(TRAINING_MANIFEST_PATH, manifest);
      });

      res.status(202).json({ status: 'queued', id: bundleId });
    } catch (error) {
      console.error('Error saving training bundle:', error);
      res.status(500).json({ error: 'Failed to save training bundle' });
    }
  });
}
