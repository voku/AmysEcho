import * as FileSystem from 'expo-file-system';
import NetInfo from '@react-native-community/netinfo';
import { loadBackendApiToken, saveCustomModelUri, loadCustomModelHash, saveCustomModelHash } from '../storage';
import { CUSTOM_GESTURE_MODEL_PATH } from '../constants';
import { API_URL } from '../constants';
import { logger } from '../utils/logger';

export async function checkForModelUpdate(profileId?: string): Promise<boolean> {
  const net = await NetInfo.fetch();
  const allowCellular =
    process.env.EXPO_PUBLIC_ALLOW_CELLULAR_MODEL_UPDATES === 'true';
  if (
    !net.isConnected ||
    net.isInternetReachable !== true ||
    (!allowCellular && net.type !== 'wifi')
  )
    return false;
  try {
    const token = await loadBackendApiToken();
    const qs = profileId ? `?profileId=${encodeURIComponent(profileId)}` : '';
    const metaRes = await fetch(`${API_URL}/model-metadata${qs}`, {
      headers: { Authorization: `Bearer ${token || ''}` },
    });
    if (!metaRes.ok) {
      logger.warn('model metadata request failed', { status: metaRes.status });
      return false;
    }
    const meta = await metaRes.json();
    if (!meta || typeof meta.sha256 !== 'string' || meta.sha256.length === 0) {
      logger.warn('invalid model metadata payload', meta);
      return false;
    }
    const currentHash = (await loadCustomModelHash()) || '';
    if (currentHash === meta.sha256) {
      return false; // up to date
    }
    const uri = CUSTOM_GESTURE_MODEL_PATH;
    const res = await FileSystem.downloadAsync(
      `${API_URL}/latest-model${qs}`,
      uri,
      { headers: { Authorization: `Bearer ${token || ''}` } }
    );
    await saveCustomModelUri(res.uri);
    await saveCustomModelHash(meta.sha256);
    return true;
  } catch (e) {
    logger.warn('model update failed', e);
    return false;
  }
}
