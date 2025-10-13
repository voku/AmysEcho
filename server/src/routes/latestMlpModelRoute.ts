import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import type { Request, Response } from 'express';
import type {
  BaselineSeedMessages,
  ModelResponseMetadata,
  PrecomputedModelPayload,
} from '../services/mlpModelArtifacts.js';

type LatestMlpModelDeps = {
  getMlpModelPath: (profileId?: string) => string;
  seedBaselineModel: (
    filePath: string,
    messages: BaselineSeedMessages,
    logTraining: (message: string) => Promise<void>,
  ) => Promise<boolean>;
  sendBinaryModel: (
    res: Response,
    filePath: string,
    downloadName: string,
    options?: { precomputed?: PrecomputedModelPayload; headersOnly?: boolean },
  ) => Promise<void>;
  applyModelHeaders: (
    res: Response,
    filePath: string,
    downloadName: string,
    metadata: ModelResponseMetadata,
  ) => void;
  logTraining: (message: string) => Promise<void>;
  isProfileAuthorized: (req: Request, profileId: string) => boolean;
};

async function loadModelForResponse(filePath: string): Promise<PrecomputedModelPayload> {
  const stat = await fs.stat(filePath);
  const buffer = await fs.readFile(filePath);
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  return {
    stat,
    buffer,
    sha256,
    etag: `"sha256-${sha256}"`,
  };
}

export function createLatestMlpModelHandler(deps: LatestMlpModelDeps) {
  return async function latestMlpModelHandler(req: Request, res: Response) {
    try {
      const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : undefined;
      if (profileId && !deps.isProfileAuthorized(req, profileId)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const profiledPath = deps.getMlpModelPath(profileId);
      const globalPath = deps.getMlpModelPath();
      let chosen: string | undefined;

      if (profileId) {
        try {
          await fs.stat(profiledPath);
          chosen = profiledPath;
          await deps.logTraining(`latest-mlp-model resolved profile file ${profiledPath}`);
        } catch {
          // fall through to global handling
        }
      }

      if (!chosen) {
        let globalAvailable = false;
        try {
          await fs.stat(globalPath);
          globalAvailable = true;
        } catch {
          const messages: BaselineSeedMessages = {
            success: (dest) => `latest-mlp-model seeded baseline into ${dest}`,
            failure: (dest, error) =>
              `latest-mlp-model failed to seed baseline into ${dest}: ${String(error)}`,
          };
          globalAvailable = await deps.seedBaselineModel(globalPath, messages, deps.logTraining);
        }

        if (globalAvailable) {
          chosen = globalPath;
          await deps.logTraining(`latest-mlp-model serving global file ${globalPath}`);
        }
      }

      if (!chosen) {
        await deps.logTraining(`latest-mlp-model missing profile=${profileId ?? 'global'}`);
        return res.status(404).json({ error: 'Model not found' });
      }

      const downloadName = profileId ? `dgs_model_${profileId}.npz` : 'amy_model.npz';
      const precomputed = await loadModelForResponse(chosen);
      const ifNoneMatchHeader = req.headers['if-none-match'];
      const candidates =
        typeof ifNoneMatchHeader === 'string'
          ? ifNoneMatchHeader
              .split(',')
              .map((value) => value.trim())
              .filter((value) => value.length > 0)
          : [];

      if (candidates.includes('*') || candidates.includes(precomputed.etag)) {
        deps.applyModelHeaders(res, chosen, downloadName, precomputed);
        res.status(304).end();
        return;
      }

      await deps.sendBinaryModel(res, chosen, downloadName, { precomputed });
    } catch (error) {
      await deps.logTraining(`latest-mlp-model handler error: ${String(error)}`);
      res.status(500).json({ error: 'Failed to load MLP model' });
    }
  };
}
