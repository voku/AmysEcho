import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TrainingFrame, TrainingSample } from '../storage';
import { scheduleTrainingSync } from './trainingSyncScheduler';

const BUNDLE_KEY_PREFIX = 'trainingBundles:';

export interface QueuedTrainingBundle {
  key: string;
  sampleId: string;
  profileId: string;
  label: string;
  frames: TrainingFrame[];
  clipUri: string;
  stillUri: string;
  capturedAt: string;
  source: string;
  queuedAt: string;
}

function buildBundleKey(profileId: string, sampleId: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${BUNDLE_KEY_PREFIX}${profileId}:${timestamp}:${sampleId}:${random}`;
}

export async function enqueueTrainingBundle(
  sample: TrainingSample,
  opts?: { scheduleSync?: boolean },
): Promise<string> {
  const key = buildBundleKey(sample.profileId, sample.id);
  const payload = {
    sampleId: sample.id,
    profileId: sample.profileId,
    label: sample.label,
    frames: sample.frames,
    clipUri: sample.clipUri,
    stillUri: sample.stillUri,
    capturedAt: sample.capturedAt,
    source: sample.source,
    queuedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(key, JSON.stringify(payload));
  if (opts?.scheduleSync !== false) {
    scheduleTrainingSync({ delayMs: 10_000 });
  }
  return key;
}

export async function removeQueuedTrainingBundle(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}

export async function listQueuedTrainingBundles(profileId?: string): Promise<QueuedTrainingBundle[]> {
  const keys = await AsyncStorage.getAllKeys();
  const bundleKeys = keys.filter((k) => k.startsWith(BUNDLE_KEY_PREFIX));
  if (profileId) {
    const prefix = `${BUNDLE_KEY_PREFIX}${profileId}:`;
    bundleKeys.splice(0, bundleKeys.length, ...bundleKeys.filter((k) => k.startsWith(prefix)));
  }
  if (bundleKeys.length === 0) {
    return [];
  }

  const entries = await AsyncStorage.multiGet(bundleKeys);
  const bundles: QueuedTrainingBundle[] = [];
  for (const [key, value] of entries) {
    if (!value) continue;
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object') continue;
      bundles.push({
        key,
        sampleId: parsed.sampleId,
        profileId: parsed.profileId,
        label: parsed.label,
        frames: parsed.frames,
        clipUri: parsed.clipUri,
        stillUri: typeof parsed.stillUri === 'string' ? parsed.stillUri : '',
        capturedAt: parsed.capturedAt,
        source: parsed.source,
        queuedAt: parsed.queuedAt,
      });
    } catch (error) {
      await AsyncStorage.removeItem(key).catch(() => undefined);
    }
  }

  return bundles.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}
