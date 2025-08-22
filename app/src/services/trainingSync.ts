import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { loadProfile, TrainingSample, loadBackendApiToken } from '../storage';
import { API_URL } from '../constants';
import { logger } from '../utils/logger';

const TRAINING_KEY = 'gestureTrainingData';

export async function syncTrainingData(): Promise<void> {
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
    }));
    await fetch(`${API_URL}/train-model`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token || ''}`,
      },
      body: JSON.stringify({ samples }),
    });
    for (const p of pending) p.syncStatus = 'synced';
    await AsyncStorage.setItem(TRAINING_KEY, JSON.stringify(data));
  } catch (e) {
    logger.warn('training sync failed', e);
  }
}
