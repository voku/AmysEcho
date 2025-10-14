import * as FileSystem from 'expo-file-system';
import type { NetInfoState } from '@react-native-community/netinfo';
import { NetInfoStateType } from '@react-native-community/netinfo';
// Use dynamic require to honor various mock shapes in tests
import {
  loadProfile,
  loadBackendApiToken,
  updateTrainingSample,
} from '../storage';
import { API_URL } from '../constants';
import { logger } from '../utils/logger';
import { refreshDgsModel } from './modelUpdate';
import { uploadTrainingBundle } from './trainingBundleService';
import { listQueuedTrainingBundles, removeQueuedTrainingBundle } from './trainingBundleQueue';

const TRAINING_JOB_TRIGGER_TIMEOUT_MS = 30_000;

let fetchNetOverride: (() => Promise<NetInfoState | undefined>) | undefined;

export function __setNetInfoFetchOverride(
  override?: () => Promise<NetInfoState | undefined>,
): void {
  fetchNetOverride = override;
}

export interface SyncProgressOptions {
  onProgress?: (progress: number) => void;
}

export interface SyncResult {
  uploaded: number;
  remaining: number;
}

export async function syncTrainingData(opts?: SyncProgressOptions): Promise<SyncResult> {
  const profile = await loadProfile();
  if (!profile?.consentHelpMeGetSmarter) {
    return { uploaded: 0, remaining: 0 };
  }

  const bundles = await listQueuedTrainingBundles(profile.id);
  if (bundles.length === 0) {
    return { uploaded: 0, remaining: 0 };
  }
  let netState: NetInfoState | undefined;
  if (fetchNetOverride) {
    netState = await fetchNetOverride();
  } else {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const NetInfoMod = require('@react-native-community/netinfo');
    const fetchNet: any = NetInfoMod.fetch || NetInfoMod.default?.fetch;
    const netResult = await (typeof fetchNet === 'function'
      ? fetchNet()
      : Promise.resolve<NetInfoState | undefined>(undefined));
    netState = netResult && typeof netResult === 'object' ? netResult : undefined;
  }
  const net: NetInfoState =
    netState ?? {
      type: NetInfoStateType.none,
      isConnected: false,
      isInternetReachable: false,
      details: null,
    };
  if (
    net.isConnected !== true ||
    net.isInternetReachable !== true ||
    net.type !== 'wifi'
  )
    return { uploaded: 0, remaining: bundles.length };

  try {
    const token = await loadBackendApiToken();
    let processed = 0;
    let trainingJobScheduledByServer = false;
    for (const bundle of bundles) {
      try {
        const uploadOptions = token ? { tokenOverride: token } : {};
        const uploadResult = await uploadTrainingBundle(
          {
            label: bundle.label,
            profileId: bundle.profileId,
            frames: bundle.frames,
            clipUri: bundle.clipUri,
            capturedAt: bundle.capturedAt,
            source: 'app://mediapipe',
          },
          uploadOptions,
        );

        if (!trainingJobScheduledByServer && uploadResult?.trainingJobId) {
          trainingJobScheduledByServer = true;
          logger.info('Server hat den Trainingsjob nach dem Upload ausgelöst', {
            jobId: uploadResult.trainingJobId,
          });
        }

        await removeQueuedTrainingBundle(bundle.key);
        await updateTrainingSample(bundle.sampleId, bundle.profileId, {
          syncStatus: 'synced',
          bundleKey: null,
        });
        try {
          await FileSystem.deleteAsync(bundle.clipUri, { idempotent: true });
        } catch (clipError) {
          logger.warn('Failed to clean up clip after upload', clipError);
        }

        processed += 1;
        const progress = Math.round((processed / bundles.length) * 100);
        opts?.onProgress?.(progress);
      } catch (error) {
        logger.warn('training bundle upload failed', {
          error,
          bundleKey: bundle.key,
        });
      }
    }

    if (processed > 0) {
      if (token && !trainingJobScheduledByServer) {
        try {
          const controller =
            typeof AbortController !== 'undefined' ? new AbortController() : undefined;
          const timeoutId = controller
            ? setTimeout(() => controller.abort(), TRAINING_JOB_TRIGGER_TIMEOUT_MS)
            : undefined;
          try {
            const response = await fetch(`${API_URL}/train-model`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ trigger: 'bundles' }),
              ...(controller ? { signal: controller.signal } : {}),
            });
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }
            try {
              const payload = await response.json();
              if (payload?.jobId) {
                logger.info('Training job triggered for uploaded bundles', { jobId: payload.jobId });
              }
            } catch (parseError) {
              logger.warn('Failed to parse training job response', { error: parseError });
            }
          } finally {
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
          }
        } catch (triggerError) {
          logger.warn('Training job trigger failed after bundle upload', { error: triggerError });
        }
      } else if (!token) {
        logger.warn('Skipping training job trigger: missing API token');
      } else {
        logger.info('Kein zusätzlicher Trainingsjob-Trigger notwendig (Server hat bereits geplant)');
      }

      await refreshDgsModel(profile.id);
    }
    const remaining = await listQueuedTrainingBundles(profile.id);
    return { uploaded: processed, remaining: remaining.length };
  } catch (e) {
    logger.warn('training sync failed', e);
    const pending = await listQueuedTrainingBundles(profile.id);
    return { uploaded: 0, remaining: pending.length };
  }
}
