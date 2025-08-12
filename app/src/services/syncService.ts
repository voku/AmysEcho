import { database } from '../../db';
import { GestureTrainingData, Correction } from '../../db/models';
import { API_URL, API_TOKEN, MODEL_VERSION_URL } from '../constants';
import { logger } from '../utils/logger';
import { loadActiveProfileId, loadProfile, saveCustomModelUri } from '../storage';
import { Q } from '@nozbe/watermelondb';
import * as FileSystem from 'expo-file-system';
import { uploadTelemetry } from './analytics';
import { telemetry } from '../telemetry/recorder';

const LOCAL_MODEL_VERSION_KEY = 'localModelVersion';

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
        const payload = pendingSamples.map((s) => JSON.parse(s.landmarkData));
        const response = await fetch(`${API_URL}/train-model`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${API_TOKEN}`,
          },
          body: JSON.stringify({ landmarks: payload }),
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

  async uploadPendingCorrections(): Promise<void> {
    logger.info('Attempting to upload pending corrections...');
    try {
      const pending = await database
        .get<Correction>('corrections')
        .query(Q.where('is_synced', false))
        .fetch();

      if (pending.length === 0) {
        logger.info('No pending corrections to upload.');
        return;
      }

      for (const correction of pending) {
        try {
          const response = await fetch(`${API_URL}/api/corrections`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${API_TOKEN}`,
            },
            body: JSON.stringify({ gesture: correction.actualGesture }),
          });

          if (response.ok) {
            await database.write(async () => {
              await correction.update((c) => {
                c.isSynced = true;
              });
            });
          } else {
            logger.error(
              `Failed to upload correction: ${response.status} ${response.statusText}`,
            );
          }
        } catch (uploadError) {
          logger.error('Error uploading correction:', uploadError);
        }
      }
    } catch (error) {
      logger.error('Error in uploadPendingCorrections:', error);
    }
  },

  async checkForNewModel(): Promise<void> {
    logger.info('Checking for new model updates...');
    try {
      const response = await fetch(MODEL_VERSION_URL, {
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch model version: ${response.status} ${response.statusText}`);
      }
      const remoteModelVersion = await response.json();

      const localModelVersionRaw = await FileSystem.readAsStringAsync(FileSystem.documentDirectory + LOCAL_MODEL_VERSION_KEY).catch(() => null);
      const localModelVersion = localModelVersionRaw ? JSON.parse(localModelVersionRaw) : { version: '0.0.0' };

      if (remoteModelVersion.version > localModelVersion.version) {
        logger.info(`New model version available: ${remoteModelVersion.version}. Current: ${localModelVersion.version}`);
        const modelDownloadUrl = `${API_URL}/${remoteModelVersion.modelPath}`;
        const localModelPath = FileSystem.documentDirectory + 'new_gesture_classifier.tflite';

        logger.info(`Downloading new model from ${modelDownloadUrl} to ${localModelPath}`);
        const downloadResult = await FileSystem.downloadAsync(
          modelDownloadUrl,
          localModelPath,
          { headers: { Authorization: `Bearer ${API_TOKEN}` } },
        );

        if (downloadResult.status === 200) {
          logger.info('Model downloaded successfully. Updating local version.');
          await FileSystem.writeAsStringAsync(FileSystem.documentDirectory + LOCAL_MODEL_VERSION_KEY, JSON.stringify(remoteModelVersion));
          await saveCustomModelUri(localModelPath); // Update the model path in storage
          logger.info('New model activated.');
        } else {
          logger.error(`Failed to download model: ${downloadResult.status}`);
          // Fallback to old model is implicit if new one fails to download/activate
        }
      } else {
        logger.info('Local model is up to date.');
      }
    } catch (error) {
      logger.error('Error checking for new model:', error);
    }
  },
};
