import type { Express, Request, Response, NextFunction } from 'express';
import type { Database } from '../db.js';

type GdprDependencies = {
  authMiddleware: (req: Request, res: Response, next: NextFunction) => void;
  db: Database;
  dbFilePath: string;
  getProfileData: (db: Database, profileId: string) => {
    profile: unknown;
    usageStats: unknown[];
    corrections: unknown[];
  };
  deleteProfileData: (db: Database, profileId: string, filePath: string) => Promise<void>;
  withFileLock: <T>(filePath: string, callback: () => Promise<T>) => Promise<T>;
  logError: (message: string, metadata?: Record<string, unknown>) => void;
};

export function registerGdprRoutes(app: Express, deps: GdprDependencies): void {
  const { authMiddleware, db, dbFilePath, getProfileData, deleteProfileData, withFileLock, logError } = deps;

  app.get('/api/profiles/:id/export', authMiddleware, (req: Request, res: Response) => {
    const { id } = req.params;
    const data = getProfileData(db, id);
    if (!data.profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }
    res.json(data);
  });

  app.delete('/api/profiles/:id', authMiddleware, async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      await withFileLock(dbFilePath, async () => deleteProfileData(db, id, dbFilePath));
      res.json({ status: 'deleted' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError('Profile deletion failed', { error: message, profileId: id });
      res.status(500).json({ error: 'Profile deletion failed' });
    }
  });
}
