import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { auth } from '../middleware/auth.js';
import type { Database } from '../db.js';
import { saveDatabase } from '../db.js';
import { DB_FILE_PATH } from '../constants/dbPaths.js';
import { withFileLock } from '../utils/fileLock.js';
import { SymbolRecord } from '../types.js';

const SymbolPayloadSchema = z.object({
  id: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, 'id must start with a letter or number'),
  name: z.string().min(1).max(140),
  category: z.string().min(1).max(80),
  imageUrl: z.string().url().optional(),
  imageDataUrl: z
    .string()
    .regex(/^data:image\//)
    .max(8 * 1024 * 1024, 'image too large')
    .optional(),
});

function normalizeSymbolPayload(body: unknown) {
  const parsed = SymbolPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten() };
  }
  const { imageDataUrl, imageUrl, ...rest } = parsed.data;
  const finalImage = imageDataUrl ?? imageUrl;
  if (imageDataUrl && imageUrl && imageDataUrl !== imageUrl) {
    // Prefer uploaded data but avoid conflicting definitions
    return {
      success: false as const,
      error: { fieldErrors: { imageUrl: ['Bitte entweder Upload oder URL angeben, nicht beides.'] }, formErrors: [] },
    };
  }
  return { success: true as const, data: { ...rest, imageUrl: finalImage } };
}

function toClientSymbol(symbol: SymbolRecord) {
  return {
    id: symbol.id,
    name: symbol.name,
    category: symbol.category ?? 'custom',
    imageUrl: symbol.imageUrl ?? null,
  };
}

export function registerSymbolRoutes(app: Express, db: Database): void {
  app.get('/api/v1/symbols', async (_req: Request, res: Response) => {
    const symbols = db.symbols.map(toClientSymbol);
    res.json({ symbols });
  });

  const persistAndRespond = async (
    updater: () => { symbol: SymbolRecord; created: boolean } | null,
    res: Response,
  ): Promise<void> => {
    const result = updater();
    if (!result) {
      res.status(404).json({ error: 'Symbol nicht gefunden' });
      return;
    }
    await withFileLock(DB_FILE_PATH, async () => saveDatabase(db, DB_FILE_PATH));
    res.status(result.created ? 201 : 200).json(toClientSymbol(result.symbol));
  };

  app.post('/api/v1/symbols', auth, async (req: Request, res: Response) => {
    const normalized = normalizeSymbolPayload(req.body);
    if (!normalized.success) {
      res.status(400).json({ error: 'Ungültige Symbol-Daten', details: normalized.error });
      return;
    }
    await persistAndRespond(() => {
      const existing = db.symbols.find((s) => s.id === normalized.data.id);
      const next: SymbolRecord = {
        id: normalized.data.id,
        name: normalized.data.name,
        emoji: existing?.emoji ?? '🧩',
        color: existing?.color ?? '#4f46e5',
        audioUri: existing?.audioUri ?? '',
        dgsVideoUri: existing?.dgsVideoUri,
        healthScore: existing?.healthScore ?? 1,
        category: normalized.data.category,
        imageUrl: normalized.data.imageUrl ?? existing?.imageUrl,
      };
      if (existing) {
        Object.assign(existing, next);
        return { symbol: existing, created: false };
      }
      db.symbols.push(next);
      return { symbol: next, created: true };
    }, res);
  });

  app.put('/api/v1/symbols/:id', auth, async (req: Request, res: Response) => {
    const normalized = normalizeSymbolPayload({ ...req.body, id: req.params.id });
    if (!normalized.success) {
      res.status(400).json({ error: 'Ungültige Symbol-Daten', details: normalized.error });
      return;
    }

    await persistAndRespond(() => {
      const existing = db.symbols.find((s) => s.id === req.params.id);
      if (!existing) {
        return null;
      }
      Object.assign(existing, {
        name: normalized.data.name,
        category: normalized.data.category,
        imageUrl: normalized.data.imageUrl ?? existing.imageUrl,
      });
      return { symbol: existing, created: false };
    }, res);
  });

  app.delete('/api/v1/symbols/:id', auth, async (req: Request, res: Response) => {
    const targetId = req.params.id;
    const existing = db.symbols.find((s) => s.id === targetId);
    if (!existing) {
      res.status(404).json({ error: 'Symbol nicht gefunden' });
      return;
    }

    db.symbols = db.symbols.filter((s) => s.id !== targetId);
    await withFileLock(DB_FILE_PATH, async () => saveDatabase(db, DB_FILE_PATH));
    res.status(204).send();
  });
}
