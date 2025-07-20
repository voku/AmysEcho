import { database } from '../db';
import { Correction } from '../db/models';
import { Q } from '@nozbe/watermelondb';
import { logger } from '../utils/logger';
import { mlService } from './mlService';

const SYNC_ENDPOINT = 'https://your-secure-backend.com/api/sync-data';
const MODEL_CHECK_ENDPOINT = 'https://your-secure-backend.com/api/check-model';

class SyncService {
  async syncUnsyncedData(): Promise<void> {
    const correctionsCollection = database.get<Correction>('corrections');
    const unsynced = await correctionsCollection
      .query(Q.where('is_synced', false))
      .fetch();

    if (unsynced.length === 0) {
      logger.info('No new data to sync.');
      return;
    }

    try {
      const payload = unsynced.map(c => ({
        predictedGesture: c.predictedGesture,
        actualGesture: c.actualGesture,
        confidence: c.confidence,
        landmarks: c.landmarks,
        timestamp: c.timestamp,
      }));

      const response = await fetch(SYNC_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corrections: payload }),
      });

      if (!response.ok) throw new Error('Sync failed on server');

      await database.write(async () => {
        const updates = unsynced.map(c =>
          c.prepareUpdate(record => {
            record.isSynced = true;
          })
        );
        await database.batch(...updates);
      });

      logger.info(`✅ Successfully synced ${unsynced.length} corrections.`);
    } catch (error) {
      logger.error('Data sync failed:', error);
    }
  }

  async checkForNewModel(currentVersion: string): Promise<void> {
    try {
      const response = await fetch(
        `${MODEL_CHECK_ENDPOINT}?currentVersion=${currentVersion}`
      );
      if (!response.ok) return;

      const { hasNewModel, modelUrl, version } = await response.json();
      if (hasNewModel) {
        logger.info(`New model version ${version} found at ${modelUrl}.`);
        // Here you would download the model and re-initialize the ML service
        // await mlService.initializeModel(modelUrl);
      }
    } catch (error) {
      logger.error('Model check failed:', error);
    }
  }
}

export const syncService = new SyncService();
