import * as FileSystem from 'expo-file-system';
import NetInfo from '@react-native-community/netinfo';
import { loadBackendApiToken, saveCustomModelUri, loadCustomModelHash, saveCustomModelHash } from '../storage';
import { CUSTOM_GESTURE_MODEL_PATH } from '../constants/modelPaths';
import { API_URL } from '../constants';
import { logger } from '../utils/logger';

export async function checkForModelUpdate(): Promise<boolean> {
  const net = await NetInfo.fetch();
  if (
    !net.isConnected ||
    net.isInternetReachable !== true ||
    net.type !== 'wifi'
  )
    return false;
  try {
    const token = await loadBackendApiToken();
    const metaRes = await fetch(`${API_URL}/model-metadata`, {
      headers: { Authorization: `Bearer ${token || ''}` },
    });
    if (!metaRes.ok) return false;
    const meta = await metaRes.json();
    const currentHash = (await loadCustomModelHash()) || '';
    if (currentHash === meta.sha256) {
      return false; // up to date
    }
    const uri = CUSTOM_GESTURE_MODEL_PATH;
    const res = await FileSystem.downloadAsync(
      `${API_URL}/latest-model`,
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
