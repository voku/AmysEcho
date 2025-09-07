import { database as realDatabase } from '../../db';
import { GestureTrainingData } from '../../db/models';
import { API_URL, API_TOKEN } from '../constants';
import { logger } from '../utils/logger';
import { loadActiveProfileId, loadProfile } from '../storage';
import { processFramesForUpload } from './handUtils';
import { Q } from '@nozbe/watermelondb';
import { uploadTelemetry } from './analytics';
import { telemetry } from '../telemetry/recorder';
import { refreshDgsModel } from './modelUpdate';

// Test injection hooks
let db: any = realDatabase;
export const __setDatabaseForTests = (d: any) => { db = d; };

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
      // telemetry.dump() can fail due to storage corruption or internal issues
      let events: any[] = [];
      try {
        events = await telemetry.dump();
      } catch (dumpError) {
        logger.error('Failed to dump telemetry events:', dumpError);
        // Log additional context for debugging
        logger.info('Telemetry dump failed, will retry on next sync attempt');
        return; // Exit early if we can't get the events
      }

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

      const collection: any = (db as any).get('gesture_training_data');
      const pendingSamples = await collection
        .query(
          Q.where('custom_sync_status', 'pending')
        )
        .fetch();

      if (pendingSamples.length === 0) {
        logger.info('No pending training data to upload.');
        // Still sync telemetry even with no training data
        try {
          await this.syncTelemetry();
        } catch (telemetryError) {
          logger.error('Failed to sync telemetry:', telemetryError);
        }
        return;
      }

      logger.info(`Found ${pendingSamples.length} pending training samples.`);

      try {
        const corruptedSamples: string[] = [];
        const payload = pendingSamples.flatMap((s: GestureTrainingData) => {
          let frames: any[] = [];
          try {
            frames = JSON.parse(s.landmarkData);
          } catch (parseError) {
            logger.warn(`Failed to parse landmark data for sample ${s.id}:`, parseError);
            corruptedSamples.push(s.id);
            return []; // Skip this sample
          }
          return processFramesForUpload(frames, s.gestureDefinition.id);
        });

        // Mark corrupted samples
        if (corruptedSamples.length > 0) {
          try {
            await db.write(async () => {
              for (const sampleId of corruptedSamples) {
                const sample = (await db.get('gesture_training_data').find(sampleId)) as GestureTrainingData;
                await sample.update((s: GestureTrainingData) => {
                  s.customSyncStatus = 'corrupted';
                });
              }
            });
            logger.info(`Marked ${corruptedSamples.length} samples as corrupted`);
          } catch (dbError) {
            logger.error('Failed to mark corrupted samples:', dbError);
          }
        }

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
          await db.write(async () => {
            for (const sample of pendingSamples) {
              await sample.update((s: GestureTrainingData) => {
                s.customSyncStatus = 'synced';
              });
            }
          });
          logger.info(`Uploaded ${pendingSamples.length} samples successfully.`);

          // Refresh DGS model after successful upload
          try {
            await refreshDgsModel(activeProfileId);
            logger.info('Successfully refreshed DGS model after training data upload.');
          } catch (modelError) {
            logger.error('Failed to refresh DGS model after training data upload:', modelError);
            // Log additional context for debugging
            logger.info('Model refresh failed, but training data upload was successful. Model will be refreshed on next app start.');
            // Don't fail the entire upload process for model refresh issues
          }
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
    }

    // Sync telemetry after training data upload (not in finally to avoid redundant calls)
    try {
      await this.syncTelemetry();
    } catch (telemetryError) {
      logger.error('Failed to sync telemetry after training data upload:', telemetryError);
    }
  },
};
