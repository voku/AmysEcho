import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { loadProfile, TrainingSample, loadBackendApiToken } from '../storage';
import { API_URL } from '../constants';
import { logger } from '../utils/logger';
import { fetchCentroids } from './dgsModelClient';
import { flattenHandsWithHandedness, frameHasAnyLandmarks } from './handUtils';

const TRAINING_KEY = 'gestureTrainingData';

export interface SyncProgressOptions {
  onProgress?: (progress: number) => void;
}

export async function syncTrainingData(opts?: SyncProgressOptions): Promise<void> {
  const profile = await loadProfile();
  if (!profile?.consentHelpMeGetSmarter) return;
  const net = await NetInfo.fetch();
  if (
    !net.isConnected ||
    net.isInternetReachable !== true ||
    net.type !== 'wifi'
  )
    return;

  const raw = await AsyncStorage.getItem(TRAINING_KEY);
  const data: TrainingSample[] = raw ? JSON.parse(raw) : [];
  const pending = data.filter((d) => d.syncStatus === 'pending');
  if (pending.length === 0) return;
  try {
    const token = await loadBackendApiToken();
    const samples = pending.flatMap((p) => {
      const framesAny = (p as any).frames || (p as any).landmarkData;
      const frames = Array.isArray(framesAny) ? framesAny : [];
      return frames
        .filter((f) => frameHasAnyLandmarks((f as any).landmarks || f))
        .map((f) => ({
          gestureDefinitionId: p.gestureDefinitionId,
          landmarkData: flattenHandsWithHandedness(
            (f as any).landmarks || f,
            (f as any).handedness || [],
          ),
          profileId: profile?.id,
        }));
    });
    if (samples.length === 0) return;
    const response = await fetch(`${API_URL}/train-model`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token || ''}`,
      },
      body: JSON.stringify({ samples }),
    });
    if (!response.ok) {
      throw new Error(`Failed to sync training data: ${response.status}`);
    }

    let jobId: string | undefined;
    try {
      const parsed = await response.json();
      jobId = parsed?.jobId;
    } catch (e) {
      logger.warn('failed to parse training response', e);
    }

    if (jobId) {
      const headers = { Authorization: `Bearer ${token || ''}` } as any;
      const start = Date.now();
      const POLL_TIMEOUT_MS = 60000;
      const POLL_INTERVAL_MS = 1000;
      let failures = 0;
      let completed = false;
      opts?.onProgress?.(0);
      while (Date.now() - start < POLL_TIMEOUT_MS) {
        try {
          const s = await fetch(`${API_URL}/train-status/${jobId}`, { headers });
          if (s.ok) {
            const info = await s.json().catch(() => null);
            if (info) {
              if (typeof info.progress === 'number') {
                opts?.onProgress?.(Math.max(0, Math.min(100, info.progress)));
              }
              if (info.status === 'completed') {
                opts?.onProgress?.(100);
                completed = true;
                break;
              }
              if (info.status === 'failed') throw new Error('training failed');
              failures = 0;
            } else {
              failures += 1;
            }
          } else {
            failures += 1;
          }
        } catch (err) {
          failures += 1;
        }
        if (failures >= 3) {
          throw new Error('training status polling failed');
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
      if (!completed) {
        throw new Error('training status polling timed out');
      }
      await fetchCentroids(profile?.id || undefined).catch(() => {});
    }
    for (const p of pending) p.syncStatus = 'synced';
    await AsyncStorage.setItem(TRAINING_KEY, JSON.stringify(data));
  } catch (e) {
    logger.warn('training sync failed', e);
  }
}
