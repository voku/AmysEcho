import express, { Request, Response } from 'express';
import type { Express } from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import AdmZip from 'adm-zip';
import type { IZipEntry } from 'adm-zip';
import { z } from 'zod';

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

interface TrainingBundleMetadata {
  label: string;
  profileId: string | null;
  capturedAt: string | null;
  source: string | null;
}

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
  metadata: TrainingBundleMetadata;
  receivedAt: string;
}

interface TrainingBundleManifestFile {
  entries: TrainingBundleManifestEntry[];
}

const trainingBundleUpload = express.raw({
  type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
  limit: '64mb',
});

const MetadataSchema = z
  .object({
    label: z.string().min(1),
    profileId: z.string().optional(),
    capturedAt: z.string().optional(),
    source: z.string().optional(),
  })
  .passthrough();

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function sanitizeEntryName(entryName: string): string {
  const normalized = path.posix.normalize(entryName.replace(/\\/g, '/')).replace(/^\//, '');
  if (!normalized || normalized === '.') {
    return '';
  }
  const withoutTrailingSlash = normalized.replace(/\/$/, '');
  if (!withoutTrailingSlash) {
    return '';
  }
  if (withoutTrailingSlash.includes(':')) {
    return '';
  }
  const segments = withoutTrailingSlash.split('/');
  if (segments.some((segment) => segment === '' || segment === '..')) {
    return '';
  }
  return withoutTrailingSlash;
}

function isPathInside(target: string, root: string): boolean {
  const normalizedRoot = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  const resolved = path.resolve(target);
  return resolved === root || resolved.startsWith(normalizedRoot);
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

      let metadataEntry: IZipEntry | null = zip.getEntry('metadata.json');
      if (!metadataEntry) {
        metadataEntry =
          zip
            .getEntries()
            .find((entry) => !entry.isDirectory && entry.entryName.replace(/\\/g, '/').endsWith('/metadata.json')) ??
          null;
      }
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

      let parsedMetadata: z.infer<typeof MetadataSchema>;
      try {
        const metadata = JSON.parse(metadataContent);
        const result = MetadataSchema.safeParse(metadata);
        if (!result.success) {
          return res.status(400).json({ error: 'metadata.json validation failed', details: result.error.flatten() });
        }
        parsedMetadata = result.data;
      } catch (error) {
        console.error('metadata.json is not valid JSON:', error);
        return res.status(400).json({ error: 'metadata.json must be valid JSON' });
      }

      const label = parsedMetadata.label.trim();
      if (!label) {
        return res.status(400).json({ error: 'metadata.label is required' });
      }

      const profileIdRaw = isNonEmptyString(parsedMetadata.profileId)
        ? parsedMetadata.profileId.trim()
        : undefined;
      if (profileIdRaw && !PROFILE_ID_PATTERN.test(profileIdRaw)) {
        return res.status(400).json({ error: 'metadata.profileId is invalid' });
      }

      const bundleId = genId();
      const profileBucket = profileIdRaw ?? 'unassigned';
      const bundleRoot = path.join(TRAINING_UPLOADS_DIR, profileBucket, bundleId);
      await fs.mkdir(bundleRoot, { recursive: true });

      const bundleZipPath = path.join(bundleRoot, 'bundle.zip');
      await atomicWriteBuffer(bundleZipPath, req.body as Buffer);

      const bundleRootResolved = path.resolve(bundleRoot);
      const storedFiles: string[] = [];
      try {
        for (const entry of zip.getEntries()) {
          if (entry.isDirectory) {
            const dirName = sanitizeEntryName(entry.entryName);
            if (!dirName) {
              throw new Error(`Unsafe directory entry: ${entry.entryName}`);
            }
            const targetDir = path.resolve(bundleRoot, dirName.split('/').join(path.sep));
            if (!isPathInside(targetDir, bundleRootResolved)) {
              throw new Error(`Unsafe directory entry: ${entry.entryName}`);
            }
            await fs.mkdir(targetDir, { recursive: true });
            continue;
          }

          const fileName = sanitizeEntryName(entry.entryName);
          if (!fileName) {
            throw new Error(`Invalid entry name: ${entry.entryName}`);
          }
          const targetPath = path.resolve(bundleRoot, fileName.split('/').join(path.sep));
          if (!isPathInside(targetPath, bundleRootResolved)) {
            throw new Error(`Unsafe entry path: ${entry.entryName}`);
          }

          await fs.mkdir(path.dirname(targetPath), { recursive: true });
          await fs.writeFile(targetPath, entry.getData());
          storedFiles.push(fileName);
        }
      } catch (error) {
        console.error('Failed to extract training bundle payload:', error);
        return res.status(400).json({ error: 'Failed to extract training bundle' });
      }

      const sanitizedMetadata: TrainingBundleMetadata = {
        label,
        profileId: profileIdRaw ?? null,
        capturedAt: isNonEmptyString(parsedMetadata.capturedAt) ? parsedMetadata.capturedAt : null,
        source: isNonEmptyString(parsedMetadata.source) ? parsedMetadata.source : null,
      };

      const files = Array.from(new Set(storedFiles));

      const manifestEntry: TrainingBundleManifestEntry = {
        id: bundleId,
        profileId: profileIdRaw ?? null,
        label,
        capturedAt: sanitizedMetadata.capturedAt,
        source: sanitizedMetadata.source,
        storage: {
          directory: path.relative(DATA_DIR, bundleRoot),
          bundle: path.relative(DATA_DIR, bundleZipPath),
          files,
        },
        metadata: sanitizedMetadata,
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
