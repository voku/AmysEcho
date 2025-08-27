import { database } from '../../db';
import { GestureTrainingData } from '../../db/models';
import { API_URL, API_TOKEN } from '../constants';
import { logger } from '../utils/logger';
import { loadActiveProfileId, loadProfile } from '../storage';
import { flattenHandsWithHandedness, frameHasAnyLandmarks } from './handUtils';
import { Q } from '@nozbe/watermelondb';
import { uploadTelemetry } from './analytics';
import { telemetry } from '../telemetry/recorder';

export const syncService = {
  async syncTelemetry(): Promise<void> {
    logger.info('Attempting to sync telemetry data...');
    try {
      const events = telemetry.dump();
      if (events.length > 0) {
        await uploadTelemetry(events);
        logger.info(`Uploaded ${events.length} telemetry events.`);
      }
    } catch (error) {
      logger.error('Error in syncTelemetry:', error);
    }
  },
  async uploadPendingTrainingData(): Promise<void> {
    logger.info('Attempting to upload pending training data...');
    try {
      const activeProfileId = await loadActiveProfileId();
      if (!activeProfileId) {
        logger.warn('No active profile found. Skipping training data upload.');
        return;
      }

      const profile = await loadProfile(activeProfileId);
      if (!profile || !profile.consentHelpMeGetSmarter) {
        logger.info('User has not consented to upload training data. Skipping.');
        return;
      }

      const pendingSamples = await database.get<GestureTrainingData>('gesture_training_data')
        .query(
          Q.where('custom_sync_status', 'pending')
        )
        .fetch();

      if (pendingSamples.length === 0) {
        logger.info('No pending training data to upload.');
        await this.syncTelemetry(); // Also sync telemetry when checking for training data
        return;
      }

      logger.info(`Found ${pendingSamples.length} pending training samples.`);

      try {
        const payload = pendingSamples.flatMap((s) => {
          let frames: any[] = [];
          try { frames = JSON.parse(s.landmarkData); } catch {}
          return (Array.isArray(frames) ? frames : [])
            .filter((f) => frameHasAnyLandmarks((f as any).landmarks || f))
            .map((f) => ({
              gestureDefinitionId: s.gestureDefinition.id,
              landmarkData: flattenHandsWithHandedness(
                (f as any).landmarks || f,
                (f as any).handedness || [],
              ),
            }));
        });
        const response = await fetch(`${API_URL}/train-model`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${API_TOKEN}`,
          },
          body: JSON.stringify({ samples: payload }),
        });

        if (response.ok) {
          await database.write(async () => {
            for (const sample of pendingSamples) {
              await sample.update((s) => {
                s.customSyncStatus = 'synced';
              });
            }
          });
          logger.info(`Uploaded ${pendingSamples.length} samples successfully.`);
        } else {
          logger.error(`Failed to upload training data: ${response.status} ${response.statusText}`);
        }
      } catch (uploadError) {
        logger.error('Error uploading training data:', uploadError);
      }
    } catch (error) {
      logger.error('Error in uploadPendingTrainingData:', error);
    }
  },
};
