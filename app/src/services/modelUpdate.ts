import * as FileSystem from 'expo-file-system';
import NetInfo from '@react-native-community/netinfo';
import { loadBackendApiToken, saveCustomModelUri } from '../storage';
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
    const uri = CUSTOM_GESTURE_MODEL_PATH;
    const res = await FileSystem.downloadAsync(
      `${API_URL}/latest-model`,
      uri,
      { headers: { Authorization: `Bearer ${token || ''}` } }
    );
    await saveCustomModelUri(res.uri);
    return true;
  } catch (e) {
    logger.warn('model update failed', e);
    return false;
  }
}
