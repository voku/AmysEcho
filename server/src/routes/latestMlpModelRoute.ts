import { promises as fs } from 'fs';
import type { Request, Response } from 'express';
import type { BaselineSeedMessages } from '../services/mlpModelArtifacts.js';

type LatestMlpModelDeps = {
  getMlpModelPath: (profileId?: string) => string;
  seedBaselineModel: (
    filePath: string,
    messages: BaselineSeedMessages,
    logTraining: (message: string) => Promise<void>,
  ) => Promise<boolean>;
  sendBinaryModel: (res: Response, filePath: string, downloadName: string) => Promise<void>;
  logTraining: (message: string) => Promise<void>;
  isProfileAuthorized: (req: Request, profileId: string) => boolean;
};

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

      await deps.sendBinaryModel(
        res,
        chosen,
        profileId ? `dgs_model_${profileId}.npz` : 'amy_model.npz',
      );
    } catch (error) {
      await deps.logTraining(`latest-mlp-model handler error: ${String(error)}`);
      res.status(500).json({ error: 'Failed to load MLP model' });
    }
  };
}
