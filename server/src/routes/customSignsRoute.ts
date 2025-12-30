import type { Express, Request, Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';
import { auth } from '../middleware/auth.js';
import { ensureDataDir, TRAINING_DATASETS_DIR, TRAINING_MANIFEST_PATH, PROFILE_ID_PATTERN } from '../constants/modelPaths.js';
import { MIN_SAMPLES_FOR_READY } from '../constants/training.js';
import { withFileLock } from '../utils/fileLock.js';
import { atomicWriteJson } from '../utils/atomicFs.js';
import { ManifestEntry } from '../types.js';

const CUSTOM_SIGNS_PATH = path.join(TRAINING_DATASETS_DIR, 'custom_signs.json');

const SignRequestSchema = z.object({
  id: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9_-]+$/i, 'id must contain only letters, numbers, _ or -'),
  label: z.string().min(2).max(120),
  profileId: z.string().optional(), // Associate sign with specific profile/kid
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

const SignStoreSchema = z.object({
  signs: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      profileId: z.string().optional(),
      emoji: z.string().nullable().optional(),
      createdAt: z.string(),
      updatedAt: z.string(),
    }),
  ),
});

type SignStore = z.infer<typeof SignStoreSchema>;
type CustomSign = SignStore['signs'][number];

interface CustomSignResponse extends CustomSign {
  sampleCount: number;
  samplesNeeded: number;
  isReady: boolean;
  status: 'registered' | 'training' | 'ready';
}

async function readStore(): Promise<SignStore> {
  await ensureDataDir();
  await fs.mkdir(TRAINING_DATASETS_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(CUSTOM_SIGNS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const result = SignStoreSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      throw error;
    }
  }
  return { signs: [] };
}

async function writeStore(store: SignStore): Promise<void> {
  await fs.mkdir(path.dirname(CUSTOM_SIGNS_PATH), { recursive: true });
  await atomicWriteJson(CUSTOM_SIGNS_PATH, store);
}

function normalizeSignId(id: string): string {
  return id.trim().toLowerCase();
}

function normalizeLabel(label: string): string {
  return label.trim();
}

type CustomSignsDeps = {
  resolveProfileId?: (profileId: string | null) => Promise<{ profileId: string | null }>;
  triggerTrainingJob?: (context: {
    bundleId: string;
    profileId: string | null;
    label: string;
  }) => void;
};

export function registerCustomSignsRoute(app: Express, deps: CustomSignsDeps = {}): void {
  app.get('/api/v1/dgs/signs', auth, async (req: Request, res: Response) => {
    try {
      const store = await readStore();
      const { profileId } = req.query;
      
      // Load manifest to compute sample counts
      let manifestEntries: ManifestEntry[] = [];
      try {
        const manifestRaw = await fs.readFile(TRAINING_MANIFEST_PATH, 'utf8');
        const manifest = JSON.parse(manifestRaw);
        manifestEntries = Array.isArray(manifest?.entries) ? manifest.entries : [];
      } catch (err: unknown) {
        // Fallback if manifest doesn't exist yet, but log other errors.
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.error('Failed to load or parse training manifest:', err);
        }
      }

      // Only return signs for the specified profile to ensure data isolation
      if (typeof profileId !== 'string' || profileId.trim().length === 0) {
        return res.json({ signs: [] });
      }

      if (!PROFILE_ID_PATTERN.test(profileId)) {
        return res.status(400).json({ error: 'Ungültige Profil-ID.' });
      }

      const resolved = deps.resolveProfileId
        ? await deps.resolveProfileId(profileId)
        : { profileId };

      if (!resolved.profileId) {
        return res.status(404).json({ error: 'Profil nicht gefunden.' });
      }

      // Optimize sample count calculation: O(N+M)
      const profileManifestEntries = manifestEntries.filter(e => e.profileId === resolved.profileId);
      const sampleCountsByLabel = profileManifestEntries.reduce((acc, entry) => {
        if (entry.label) {
          const label = entry.label.trim();
          acc[label] = (acc[label] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>);

      const signs: CustomSignResponse[] = store.signs
        .filter(g => g.profileId === resolved.profileId)
        .map(sign => {
          // Matching by sign.id because that's the unique stable identifier
          const count = sampleCountsByLabel[sign.id] || 0;
          const isReady = count >= MIN_SAMPLES_FOR_READY;
          
          let status: 'registered' | 'training' | 'ready' = 'registered';
          if (isReady) {
            status = 'ready';
          } else if (count > 0) {
            status = 'training';
          }

          return {
            ...sign,
            sampleCount: count,
            samplesNeeded: Math.max(0, MIN_SAMPLES_FOR_READY - count),
            isReady,
            status
          };
        });
      
      return res.json({ signs });
    } catch (error) {
      console.error('Failed to load custom signs', error);
      return res.status(500).json({ error: 'Benutzerdefinierte Zeichen konnten nicht geladen werden.' });
    }
  });

  app.post('/api/v1/dgs/signs', auth, async (req: Request, res: Response) => {
    const parsed = SignRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Ungültige Zeichen-Daten.', details: parsed.error.flatten() });
    }

    const { id, label, profileId, emoji } = parsed.data;
    if (profileId && !PROFILE_ID_PATTERN.test(profileId)) {
      return res.status(400).json({ error: 'Ungültige Profil-ID.' });
    }
    const normalizedId = normalizeSignId(id);
    const normalizedLabel = normalizeLabel(label);
    const normalizedEmoji = typeof emoji === 'string' && emoji.trim().length > 0 ? emoji.trim() : null;

    try {
      const resolved = deps.resolveProfileId
        ? await deps.resolveProfileId(profileId ?? null)
        : { profileId: profileId ?? null };
      if (profileId && !resolved.profileId) {
        return res.status(404).json({ error: 'Profil nicht gefunden.' });
      }
      const result = await withFileLock(CUSTOM_SIGNS_PATH, async () => {
        const store = await readStore();
        // Find existing sign with same id AND profileId (if provided)
        const existing = store.signs.find((g) => 
          g.id === normalizedId && 
          (resolved.profileId ? g.profileId === resolved.profileId : !g.profileId)
        );
        const now = new Date().toISOString();
        if (existing) {
          existing.label = normalizedLabel;
          existing.emoji = normalizedEmoji;
          existing.updatedAt = now;
          await writeStore(store);
          return { sign: existing, created: false };
        }
        const newSign = {
          id: normalizedId,
          label: normalizedLabel,
          profileId: resolved.profileId ?? undefined,
          emoji: normalizedEmoji,
          createdAt: now,
          updatedAt: now,
        };
        store.signs.push(newSign);
        await writeStore(store);
        return { sign: newSign, created: true };
      });

      // Auto-trigger model training after custom sign registration
      if (deps.triggerTrainingJob) {
        deps.triggerTrainingJob({
          bundleId: `sign-reg-${result.sign.id}-${Date.now()}`,
          profileId: result.sign.profileId ?? null,
          label: result.sign.id, // Use the unique ID for training
        });
      }

      return res.status(result.created ? 201 : 200).json(result.sign);
    } catch (error) {
      console.error('Failed to persist custom sign', error);
      return res.status(500).json({ error: 'Benutzerdefiniertes Zeichen konnte nicht gespeichert werden.' });
    }
  });
}