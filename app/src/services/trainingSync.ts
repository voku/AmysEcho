import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { loadProfile, TrainingSample, loadBackendApiToken } from '../storage';
import { API_URL } from '../constants';
import { logger } from '../utils/logger';
import { fetchCentroids } from './dgsModelClient';

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
    const samples = pending.map((p) => ({
      gestureDefinitionId: p.gestureDefinitionId,
      landmarkData: p.landmarkData,
      profileId: profile?.id,
    }));
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
    try {
      const { jobId } = await response.json().catch(() => ({} as any));
      if (jobId) {
        const headers = { Authorization: `Bearer ${token || ''}` } as any;
        const start = Date.now();
        opts?.onProgress?.(0);
        while (Date.now() - start < 30000) {
          const s = await fetch(`${API_URL}/train-status/${jobId}`, { headers });
          if (s.ok) {
            const info = await s.json();
            if (typeof info.progress === 'number') {
              opts?.onProgress?.(Math.max(0, Math.min(100, info.progress)));
            }
            if (info.status === 'completed') { opts?.onProgress?.(100); break; }
            if (info.status === 'failed') throw new Error('training failed');
          }
          await new Promise((r) => setTimeout(r, 500));
        }
        await fetchCentroids(profile?.id || undefined).catch(() => {});
      }
    } catch (e) {
      logger.warn('training status polling failed', e);
    }
    for (const p of pending) p.syncStatus = 'synced';
    await AsyncStorage.setItem(TRAINING_KEY, JSON.stringify(data));
  } catch (e) {
    logger.warn('training sync failed', e);
  }
}
