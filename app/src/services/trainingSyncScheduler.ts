import { logger } from '../utils/logger';

let scheduledTimeout: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;
let backoffDelayMs = 15_000;
const MAX_BACKOFF_MS = 5 * 60 * 1000; // 5 minutes

async function executeSync(): Promise<void> {
  scheduledTimeout = null;
  if (isRunning) {
    return;
  }

  isRunning = true;
  try {
    const { syncTrainingData } = await import('./trainingSync');
    const result = await syncTrainingData();
    if (result.remaining > 0) {
      backoffDelayMs = Math.min(backoffDelayMs * 2, MAX_BACKOFF_MS);
      scheduleTrainingSync({ delayMs: backoffDelayMs });
    } else {
      backoffDelayMs = 15_000;
    }
  } catch (error) {
    logger.warn('Scheduled training sync failed', { error });
    backoffDelayMs = Math.min(backoffDelayMs * 2, MAX_BACKOFF_MS);
    scheduleTrainingSync({ delayMs: backoffDelayMs });
  } finally {
    isRunning = false;
  }
}

export interface ScheduleOptions {
  delayMs?: number;
  force?: boolean;
}

export function scheduleTrainingSync(options: ScheduleOptions = {}): void {
  const desiredDelay = options.delayMs ?? backoffDelayMs;

  if (scheduledTimeout) {
    if (options.force && desiredDelay < backoffDelayMs) {
      clearTimeout(scheduledTimeout);
      scheduledTimeout = setTimeout(executeSync, desiredDelay);
      backoffDelayMs = desiredDelay;
    }
    return;
  }

  backoffDelayMs = desiredDelay;
  scheduledTimeout = setTimeout(executeSync, desiredDelay);
}

export function triggerTrainingSyncNow(): void {
  if (scheduledTimeout) {
    clearTimeout(scheduledTimeout);
    scheduledTimeout = null;
  }
  void executeSync();
}

export function resetTrainingSyncScheduler(): void {
  if (scheduledTimeout) {
    clearTimeout(scheduledTimeout);
    scheduledTimeout = null;
  }
  backoffDelayMs = 15_000;
  isRunning = false;
}
