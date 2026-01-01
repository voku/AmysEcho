import type { Express, Request, Response, RequestHandler } from 'express';
import { z } from 'zod';
import { auth } from '../middleware/auth.js';
import type { Database } from '../db.js';
import { saveDatabase } from '../db.js';
import { DB_FILE_PATH } from '../constants/dbPaths.js';
import { PROFILE_ID_PATTERN } from '../constants/modelPaths.js';
import { MIN_SAMPLES_FOR_READY } from '../constants/training.js';
import { withFileLock } from '../utils/fileLock.js';
import { SymbolRecord } from '../types.js';
import { loadManifestEntries } from '../utils/manifestUtils.js';

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
  profileId: z.string().optional(),
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

function toClientSymbol(symbol: SymbolRecord, sampleCountsByLabel: Record<string, number>) {
  const count = sampleCountsByLabel[symbol.id] || 0;
  const isReady = count >= MIN_SAMPLES_FOR_READY;
  
  let status: 'registered' | 'training' | 'ready' = 'registered';
  if (isReady) {
    status = 'ready';
  } else if (count > 0) {
    status = 'training';
  }

  return {
    id: symbol.id,
    name: symbol.name,
    category: symbol.category ?? 'custom',
    imageUrl: symbol.imageUrl ?? null,
    profileId: symbol.profileId,
    emoji: symbol.emoji,
    color: symbol.color,
    sampleCount: count,
    samplesNeeded: Math.max(0, MIN_SAMPLES_FOR_READY - count),
    isReady,
    status
  };
}

export function registerSymbolRoutes(app: Express, db: Database, rateLimiter?: RequestHandler): void {
  app.get('/api/v1/symbols', async (req: Request, res: Response) => {
    try {
      const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : undefined;
      
      if (profileId && !PROFILE_ID_PATTERN.test(profileId)) {
        res.status(400).json({ error: 'Ungültige Profil-ID.' });
        return;
      }

      const manifestEntries = await loadManifestEntries();

      // Separate global and profile-specific symbols
      const globalSymbols = db.symbols.filter((s) => !s.profileId);
      const profileSymbols = profileId 
        ? db.symbols.filter((s) => s.profileId === profileId)
        : [];

      // Optimize sample count calculation
      const profileManifestEntries = profileId 
        ? manifestEntries.filter(e => e.profileId === profileId)
        : manifestEntries.filter(e => !e.profileId);

      const sampleCountsByLabel = profileManifestEntries.reduce((acc, entry) => {
        if (entry.label) {
          const label = entry.label.trim();
          acc[label] = (acc[label] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>);

      // Names of symbols defined by the profile
      const profileSymbolNames = new Set(profileSymbols.map(s => s.name.toLowerCase()));

      // Return profile symbols + global symbols that are NOT overridden by name
      const symbols = [
        ...profileSymbols,
        ...globalSymbols.filter(gs => !profileSymbolNames.has(gs.name.toLowerCase()))
      ].map(s => toClientSymbol(s, sampleCountsByLabel));

      res.json({ symbols });
    } catch (error: unknown) {
      console.error('Failed to load symbols', error);
      res.status(500).json({ error: 'Symbole konnten nicht geladen werden.' });
    }
  });

  const persistAndRespond = async (
    updater: () => { symbol: SymbolRecord; created: boolean } | null,
    res: Response,
    profileId?: string,
  ): Promise<void> => {
    const result = updater();
    if (!result) {
      res.status(404).json({ error: 'Symbol nicht gefunden oder Zugriff verweigert' });
      return;
    }

    // Load manifest entries to provide accurate sample counts in the response
    const manifestEntries = await loadManifestEntries();
    const profileManifestEntries = profileId 
      ? manifestEntries.filter(e => e.profileId === profileId)
      : manifestEntries.filter(e => !e.profileId);

    const sampleCountsByLabel = profileManifestEntries.reduce((acc, entry) => {
      if (entry.label) {
        const label = entry.label.trim();
        acc[label] = (acc[label] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    await withFileLock(DB_FILE_PATH, async () => saveDatabase(db, DB_FILE_PATH));
    res.status(result.created ? 201 : 200).json(toClientSymbol(result.symbol, sampleCountsByLabel));
  };

  const middlewares = rateLimiter ? [auth, rateLimiter] : [auth];

  app.post('/api/v1/symbols', ...middlewares, async (req: Request, res: Response) => {
    const normalized = normalizeSymbolPayload(req.body);
    if (!normalized.success) {
      res.status(400).json({ error: 'Ungültige Symbol-Daten', details: normalized.error });
      return;
    }

    const existing = db.symbols.find((s) => s.id === normalized.data.id);
    const isAdmin = req.user?.role === 'admin';
    
    // If updating existing, check ownership
    if (existing) {
      if (existing.profileId !== normalized.data.profileId) {
        // If overwriting a global symbol, only admins can do it
        if (!existing.profileId && !isAdmin) {
          res.status(403).json({ error: 'Globale Symbole können nur von Administratoren überschrieben werden.' });
          return;
        }

        res.status(403).json({ error: 'Bestehende Symbole anderer Profile können nicht überschrieben werden.' });
        return;
      }

      // Even if profileIds match (both undefined), still need admin check for global
      if (!existing.profileId && !isAdmin) {
        res.status(403).json({ error: 'Globale Symbole können nur von Administratoren überschrieben werden.' });
        return;
      }
    }

    await persistAndRespond(() => {
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
        profileId: normalized.data.profileId,
      };
      if (existing) {
        Object.assign(existing, next);
        return { symbol: existing, created: false };
      }
      db.symbols.push(next);
      return { symbol: next, created: true };
    }, res, normalized.data.profileId);
  });

  app.put('/api/v1/symbols/:id', ...middlewares, async (req: Request, res: Response) => {
    const normalized = normalizeSymbolPayload({ ...req.body, id: req.params.id });
    if (!normalized.success) {
      res.status(400).json({ error: 'Ungültige Symbol-Daten', details: normalized.error });
      return;
    }

    const existing = db.symbols.find((s) => s.id === req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Symbol nicht gefunden' });
      return;
    }

    // Ownership check: must match profileId (unless global, but we restrict that too)
    const isAdmin = req.user?.role === 'admin';
    if (existing.profileId !== normalized.data.profileId) {
      // If it's a global symbol (no profileId), only admins can modify it
      if (!existing.profileId && !isAdmin) {
        res.status(403).json({ error: 'Globale Symbole können nur von Administratoren bearbeitet werden.' });
        return;
      }
      
      res.status(403).json({ error: 'Nur eigene Symbole können bearbeitet werden.' });
      return;
    }

    // Special case: if the symbol IS global, only allow update if user is admin
    if (!existing.profileId && !isAdmin) {
      res.status(403).json({ error: 'Globale Symbole können nur von Administratoren bearbeitet werden.' });
      return;
    }

    await persistAndRespond(() => {
      Object.assign(existing, {
        name: normalized.data.name,
        category: normalized.data.category,
        imageUrl: normalized.data.imageUrl ?? existing.imageUrl,
      });
      return { symbol: existing, created: false };
    }, res, normalized.data.profileId);
  });

  app.delete('/api/v1/symbols/:id', ...middlewares, async (req: Request, res: Response) => {
    const targetId = req.params.id;
    const existing = db.symbols.find((s) => s.id === targetId);
    if (!existing) {
      res.status(404).json({ error: 'Symbol nicht gefunden' });
      return;
    }

    const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : undefined;
    const isAdmin = req.user?.role === 'admin';

    if (existing.profileId !== profileId) {
      // If it's a global symbol, only admins can delete it
      if (!existing.profileId && !isAdmin) {
        res.status(403).json({ error: 'Globale Symbole können nur von Administratoren gelöscht werden.' });
        return;
      }

      res.status(403).json({ error: 'Nur eigene Symbole können gelöscht werden.' });
      return;
    }

    // Special case: if it IS global, only allow deletion if user is admin
    if (!existing.profileId && !isAdmin) {
      res.status(403).json({ error: 'Globale Symbole können nur von Administratoren gelöscht werden.' });
      return;
    }

    db.symbols = db.symbols.filter((s) => s.id !== targetId);
    await withFileLock(DB_FILE_PATH, async () => saveDatabase(db, DB_FILE_PATH));
    res.status(204).send();
  });
}