import * as FileSystem from 'expo-file-system';
import NetInfo from '@react-native-community/netinfo';
import { loadBackendApiToken, saveCustomModelUri } from '../storage';

export async function checkForModelUpdate(): Promise<void> {
  const net = await NetInfo.fetch();
  if (!net.isConnected || net.type !== 'wifi') return;
  try {
    const token = await loadBackendApiToken();
    const uri = FileSystem.documentDirectory + 'custom_model.tflite';
    const res = await FileSystem.downloadAsync(
      'http://localhost:5000/latest-model',
      uri,
      { headers: { Authorization: `Bearer ${token || ''}` } }
    );
    await saveCustomModelUri(res.uri);
  } catch (e) {
    console.log('model update failed', e);
  }
}
