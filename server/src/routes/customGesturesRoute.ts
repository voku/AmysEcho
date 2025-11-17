import type { Express, Request, Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';
import { legacyAuth } from '../middleware/auth.js';
import { ensureDataDir, TRAINING_DATASETS_DIR } from '../constants/modelPaths.js';
import { withFileLock } from '../utils/fileLock.js';
import { atomicWriteJson } from '../utils/atomicFs.js';

const CUSTOM_GESTURES_PATH = path.join(TRAINING_DATASETS_DIR, 'custom_gestures.json');

const GestureRequestSchema = z.object({
  id: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9_-]+$/i, 'id must contain only letters, numbers, _ or -'),
  label: z.string().min(2).max(120),
  emoji: z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
      }
      return null;
    }),
});

const GestureStoreSchema = z.object({
  gestures: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      emoji: z.string().nullable().optional(),
      createdAt: z.string(),
      updatedAt: z.string(),
    }),
  ),
});

type GestureStore = z.infer<typeof GestureStoreSchema>;

async function readStore(): Promise<GestureStore> {
  await ensureDataDir();
  await fs.mkdir(TRAINING_DATASETS_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(CUSTOM_GESTURES_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const result = GestureStoreSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
  } catch (error: unknown) {
    const isEnoent = typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 'ENOENT';
    if (!isEnoent) {
      throw error;
    }
  }
  return { gestures: [] };
}

async function writeStore(store: GestureStore): Promise<void> {
  await fs.mkdir(path.dirname(CUSTOM_GESTURES_PATH), { recursive: true });
  await atomicWriteJson(CUSTOM_GESTURES_PATH, store);
}

function normalizeGestureId(id: string): string {
  return id.trim().toLowerCase();
}

function normalizeLabel(label: string): string {
  return label.trim();
}

export function registerCustomGesturesRoute(app: Express): void {
  app.get('/api/v1/dgs/gestures', legacyAuth, async (_req: Request, res: Response) => {
    try {
      const store = await readStore();
      return res.json({ gestures: store.gestures });
    } catch (error) {
      console.error('Failed to load custom gestures', error);
      return res.status(500).json({ error: 'Failed to load custom gestures' });
    }
  });

  app.post('/api/v1/dgs/gestures', legacyAuth, async (req: Request, res: Response) => {
    const parsed = GestureRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid gesture payload', details: parsed.error.flatten() });
    }

    const { id, label, emoji } = parsed.data;
    const normalizedId = normalizeGestureId(id);
    const normalizedLabel = normalizeLabel(label);
    const normalizedEmoji = typeof emoji === 'string' && emoji.trim().length > 0 ? emoji.trim() : null;

    try {
      const result = await withFileLock(CUSTOM_GESTURES_PATH, async () => {
        const store = await readStore();
        const existing = store.gestures.find((g) => g.id === normalizedId);
        const now = new Date().toISOString();
        if (existing) {
          existing.label = normalizedLabel;
          existing.emoji = normalizedEmoji;
          existing.updatedAt = now;
          await writeStore(store);
          return { gesture: existing, created: false };
        }
        const newGesture = {
          id: normalizedId,
          label: normalizedLabel,
          emoji: normalizedEmoji,
          createdAt: now,
          updatedAt: now,
        };
        store.gestures.push(newGesture);
        await writeStore(store);
        return { gesture: newGesture, created: true };
      });

      return res.status(result.created ? 201 : 200).json(result.gesture);
    } catch (error) {
      console.error('Failed to persist custom gesture', error);
      return res.status(500).json({ error: 'Failed to store custom gesture' });
    }
  });
}
