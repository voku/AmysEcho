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
import type { TrainingJobInfo } from './trainingBundleService';
import { listQueuedTrainingBundles, removeQueuedTrainingBundle } from './trainingBundleQueue';

const TRAINING_JOB_TRIGGER_TIMEOUT_MS = 30_000;
const TRAINING_JOB_POLL_TIMEOUT_MS = 2 * 60_000;
const TRAINING_JOB_POLL_INITIAL_DELAY_MS = 1_000;
const TRAINING_JOB_POLL_MAX_DELAY_MS = 10_000;

const TRAINING_JOB_STATUS_SET = new Set(['queued', 'running', 'completed', 'failed']);

let fetchNetOverride: (() => Promise<NetInfoState | undefined>) | undefined;
let trainingJobPollWait: (ms: number) => Promise<void> = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function __setNetInfoFetchOverride(
  override?: () => Promise<NetInfoState | undefined>,
): void {
  fetchNetOverride = override;
}

export function __setTrainingJobPollWaitOverride(
  override?: (ms: number) => Promise<void>,
): void {
  trainingJobPollWait =
    typeof override === 'function'
      ? override
      : (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTrainingJobStatus(value: unknown): TrainingJobInfo['status'] | undefined {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (TRAINING_JOB_STATUS_SET.has(normalized)) {
      return normalized as TrainingJobInfo['status'];
    }
  }
  return undefined;
}

function resolvePollUrl(job: TrainingJobInfo): string {
  if (job.pollUrl) {
    const trimmed = job.pollUrl.trim();
    if (/^https?:/i.test(trimmed)) {
      return trimmed;
    }
    if (trimmed.startsWith('/')) {
      return `${API_URL}${trimmed}`;
    }
    return `${API_URL}/${trimmed}`;
  }
  return `${API_URL}/api/training-status/${encodeURIComponent(job.jobId)}`;
}

function extractTrainingJobStatus(payload: unknown): TrainingJobInfo['status'] | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  const direct = normalizeTrainingJobStatus((payload as { status?: unknown }).status);
  if (direct) {
    return direct;
  }
  const nestedCandidates: unknown[] = [];
  const trainingJob = (payload as { trainingJob?: unknown }).trainingJob;
  if (trainingJob && typeof trainingJob === 'object') {
    nestedCandidates.push((trainingJob as { status?: unknown }).status);
  }
  const job = (payload as { job?: unknown }).job;
  if (job && typeof job === 'object') {
    nestedCandidates.push((job as { status?: unknown }).status);
  }
  const data = (payload as { data?: unknown }).data;
  if (data && typeof data === 'object') {
    nestedCandidates.push((data as { status?: unknown }).status);
  }
  for (const candidate of nestedCandidates) {
    const normalized = normalizeTrainingJobStatus(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return undefined;
}

function extractTrainingJobInfo(payload: unknown): TrainingJobInfo | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const candidates: unknown[] = [];
  candidates.push(payload);
  const trainingJob = (payload as { trainingJob?: unknown }).trainingJob;
  if (trainingJob && typeof trainingJob === 'object') {
    candidates.push(trainingJob);
  }
  const job = (payload as { job?: unknown }).job;
  if (job && typeof job === 'object') {
    candidates.push(job);
  }

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') {
      continue;
    }
    const jobIdRaw = (candidate as { jobId?: unknown }).jobId ?? (candidate as { id?: unknown }).id;
    if (typeof jobIdRaw === 'string' && jobIdRaw.trim().length > 0) {
      const jobId = jobIdRaw.trim();
      const status =
        extractTrainingJobStatus(candidate) ?? normalizeTrainingJobStatus((payload as { status?: unknown }).status) ?? 'queued';
      const pollUrlRaw = (candidate as { pollUrl?: unknown }).pollUrl;
      const pollUrl = typeof pollUrlRaw === 'string' && pollUrlRaw.trim().length > 0 ? pollUrlRaw.trim() : undefined;
      return {
        jobId,
        status,
        ...(pollUrl ? { pollUrl } : {}),
      };
    }
  }
  return undefined;
}

async function waitForTrainingJobCompletion(
  job: TrainingJobInfo,
  token?: string,
): Promise<boolean> {
  if (job.status === 'completed') {
    logger.info('Training job already completed', { jobId: job.jobId });
    return true;
  }

  const deadline = Date.now() + TRAINING_JOB_POLL_TIMEOUT_MS;
  const pollEndpoint = resolvePollUrl(job);
  let attempt = 0;
  let delay = TRAINING_JOB_POLL_INITIAL_DELAY_MS;
  let lastStatus: TrainingJobInfo['status'] = job.status;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(pollEndpoint, {
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch (parseError) {
        logger.warn('Failed to parse training job status response', {
          error: parseError,
          jobId: job.jobId,
          attempt,
        });
        payload = undefined;
      }

      const nextStatus = extractTrainingJobStatus(payload) ?? lastStatus;
      lastStatus = nextStatus;

      if (nextStatus === 'completed') {
        logger.info('Training job completed', { jobId: job.jobId, attempts: attempt + 1 });
        return true;
      }

      if (nextStatus === 'failed') {
        logger.warn('Training job failed', { jobId: job.jobId });
        return false;
      }
    } catch (error) {
      logger.warn('Training job poll failed', {
        error,
        jobId: job.jobId,
        attempt,
      });
    }

    attempt += 1;
    await trainingJobPollWait(delay);
    delay = Math.min(Math.round(delay * 1.5), TRAINING_JOB_POLL_MAX_DELAY_MS);
  }

  logger.warn('Training job poll timed out', { jobId: job.jobId, attempts: attempt });
  return false;
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
    let trainingJobToMonitor: TrainingJobInfo | null = null;
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

        const serverScheduledJob = uploadResult?.trainingJob;

        if (!trainingJobToMonitor && serverScheduledJob?.jobId) {
          trainingJobToMonitor = serverScheduledJob;
          logger.info('Server scheduled training job after upload', {
            jobId: serverScheduledJob.jobId,
            status: serverScheduledJob.status,
            pollUrl: serverScheduledJob.pollUrl ?? null,
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
      if (token && !trainingJobToMonitor) {
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
              const triggeredJob = extractTrainingJobInfo(payload);
              if (triggeredJob) {
                trainingJobToMonitor = triggeredJob;
                logger.info('Training job triggered for uploaded bundles', {
                  jobId: triggeredJob.jobId,
                  status: triggeredJob.status,
                  pollUrl: triggeredJob.pollUrl ?? null,
                });
              } else if (payload && typeof payload === 'object' && 'jobId' in payload) {
                const jobIdRaw = (payload as { jobId?: unknown }).jobId;
                if (typeof jobIdRaw === 'string' && jobIdRaw.trim().length > 0) {
                  logger.info('Training job triggered for uploaded bundles', {
                    jobId: jobIdRaw.trim(),
                  });
                }
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
      } else if (trainingJobToMonitor) {
        logger.info('Skipping additional training job trigger (already scheduled by server)', {
          jobId: trainingJobToMonitor.jobId,
          status: trainingJobToMonitor.status,
          pollUrl: trainingJobToMonitor.pollUrl ?? null,
        });
      }

      let refreshed = false;
      if (trainingJobToMonitor) {
        try {
          const completed = await waitForTrainingJobCompletion(trainingJobToMonitor, token);
          if (completed) {
            await refreshDgsModel(profile.id);
            logger.info('DGS model refreshed after training job completion', {
              jobId: trainingJobToMonitor.jobId,
            });
            refreshed = true;
          } else {
            logger.warn('Skipped model refresh because training job did not complete', {
              jobId: trainingJobToMonitor.jobId,
            });
          }
        } catch (pollError) {
          logger.warn('Training job monitoring failed', {
            error: pollError,
            jobId: trainingJobToMonitor.jobId,
          });
        }
      } else {
        await refreshDgsModel(profile.id);
        refreshed = true;
      }

      if (refreshed && !trainingJobToMonitor) {
        logger.info('DGS model refreshed after training data sync (no training job to monitor)', {
          profileId: profile.id,
        });
      }
    }
    const remaining = await listQueuedTrainingBundles(profile.id);
    return { uploaded: processed, remaining: remaining.length };
  } catch (e) {
    logger.warn('training sync failed', e);
    const pending = await listQueuedTrainingBundles(profile.id);
    return { uploaded: 0, remaining: pending.length };
  }
}
