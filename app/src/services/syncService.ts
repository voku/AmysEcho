import { database } from '../../db';
import { GestureTrainingData } from '../../db/models';
import { API_URL, API_TOKEN } from '../constants';
import { logger } from '../utils/logger';
import { loadActiveProfileId, loadProfile } from '../storage';
import { processFramesForUpload } from './handUtils';
import { Q } from '@nozbe/watermelondb';
import { uploadTelemetry } from './analytics';
import { telemetry } from '../telemetry/recorder';
import { refreshDgsModel } from './modelUpdate';

// Simple promise-based lock to prevent concurrent uploads
let uploadLock: Promise<void> | null = null;

// Cache for consent status to reduce database queries
interface ConsentCache {
  value: boolean;
  timestamp: number;
  profileId: string;
}
let consentCache: ConsentCache | null = null;
const CONSENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Helper function for retrying with exponential backoff
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        logger.info(`Upload attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}

// Get cached consent status with TTL
async function getCachedConsent(profileId: string): Promise<boolean> {
  const now = Date.now();
  if (consentCache &&
      consentCache.profileId === profileId &&
      (now - consentCache.timestamp) < CONSENT_CACHE_TTL) {
    return consentCache.value;
  }

  const profile = await loadProfile(profileId);
  const consent = profile?.consentHelpMeGetSmarter ?? false;
  consentCache = {
    value: consent,
    timestamp: now,
    profileId
  };
  return consent;
}

export const syncService = {
  async syncTelemetry(): Promise<void> {
    logger.info('Attempting to sync telemetry data...');
    try {
      const events = await telemetry.dump();
      if (events.length > 0) {
        await retryWithBackoff(async () => {
          await uploadTelemetry(events);
        });
        logger.info(`Uploaded ${events.length} telemetry events.`);
      } else {
        logger.info('No telemetry events to upload.');
      }
    } catch (error) {
      logger.error('Error in syncTelemetry after retries:', error);
    }
  },
  async uploadPendingTrainingData(): Promise<void> {
    // Prevent concurrent uploads
    if (uploadLock) {
      logger.info('Upload already in progress, skipping...');
      return;
    }

    uploadLock = this._performUpload();
    try {
      await uploadLock;
    } finally {
      uploadLock = null;
    }
  },

  async _performUpload(): Promise<void> {
    logger.info('Attempting to upload pending training data...');
    try {
      const activeProfileId = await loadActiveProfileId();
      if (!activeProfileId) {
        logger.warn('No active profile found. Skipping training data upload.');
        return;
      }

      const hasConsent = await getCachedConsent(activeProfileId);
      if (!hasConsent) {
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
        return;
      }

      logger.info(`Found ${pendingSamples.length} pending training samples.`);

      try {
        const payload = pendingSamples.flatMap((s) => {
          let frames: any[] = [];
          try { frames = JSON.parse(s.landmarkData); } catch (parseError) {
            logger.warn(`Failed to parse landmark data for sample ${s.id}:`, parseError);
          }
          return processFramesForUpload(frames, s.gestureDefinition.id);
        });

        if (payload.length === 0) {
          logger.warn('No valid payload to upload after processing samples.');
          return;
        }

        await retryWithBackoff(async () => {
          const res = await fetch(`${API_URL}/train-model`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${API_TOKEN}`,
            },
            body: JSON.stringify({ samples: payload }),
          });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }
          return res;
        });

        // If we reach here, upload was successful
        try {
          await database.write(async () => {
            for (const sample of pendingSamples) {
              await sample.update((s) => {
                s.customSyncStatus = 'synced';
              });
            }
          });
          logger.info(`Uploaded ${pendingSamples.length} samples successfully.`);
          await refreshDgsModel(activeProfileId);
        } catch (dbError) {
          logger.error('Failed to update sample status in database:', dbError);
          // Samples remain pending, will retry on next sync
        }
      } catch (uploadError) {
        if (uploadError instanceof TypeError && uploadError.message.includes('fetch')) {
          logger.error('Network error during upload:', uploadError);
        } else {
          logger.error('Unexpected error uploading training data:', uploadError);
        }
      }
    } catch (error) {
      logger.error('Error in uploadPendingTrainingData:', error);
    } finally {
      // Always attempt to sync telemetry
      await this.syncTelemetry();
    }
  },
};
