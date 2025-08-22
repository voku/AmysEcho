import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ModelVersion {
  version: string;
  downloadUrl: string;
  checksum: string;
}

export class ModelUpdateService {
  private static readonly MODEL_VERSION_KEY = 'gesture_model_version';
  private static readonly UPDATE_CHECK_URL = 'https://your-server.com/api/model-version';
  
  async checkForUpdates(): Promise<boolean> {
    try {
      // Get current model version
      const currentVersion = await AsyncStorage.getItem(ModelUpdateService.MODEL_VERSION_KEY);
      
      // Check server for latest version
      const response = await fetch(ModelUpdateService.UPDATE_CHECK_URL);
      const latestInfo: ModelVersion = await response.json();
      
      // Compare versions
      if (!currentVersion || currentVersion !== latestInfo.version) {
        console.log('New model version available:', latestInfo.version);
        return true;
      }
      
      return false;
    } catch (error) {
      console.warn('Failed to check for model updates:', error);
      return false;
    }
  }
  
  async downloadLatestModel(): Promise<string | null> {
    try {
      const response = await fetch(ModelUpdateService.UPDATE_CHECK_URL);
      const modelInfo: ModelVersion = await response.json();

      // Create local file paths
      const localPath = `${FileSystem.documentDirectory}gesture_model_${modelInfo.version}.tflite`;
      const tmpPath = `${localPath}.tmp`;

      // Download the model to a temporary file
      console.log('Downloading model version:', modelInfo.version);
      const downloadResult = await FileSystem.downloadAsync(
        modelInfo.downloadUrl,
        tmpPath
        // Optional: include ETag header if your server uses checksum as ETag
        // { headers: { 'If-None-Match': modelInfo.checksum } }
      );

      if (downloadResult.status === 200) {
        // Verify checksum if expo-crypto is available; otherwise skip (best-effort)
        try {
          const crypto = await import('expo-crypto');
          const computed = await crypto.digestFileAsync(
            crypto.CryptoDigestAlgorithm.SHA256,
            tmpPath
          );
          if (
            typeof computed === 'string' &&
            modelInfo.checksum &&
            computed.toLowerCase() !== modelInfo.checksum.toLowerCase()
          ) {
            await FileSystem.deleteAsync(tmpPath, { idempotent: true });
            throw new Error('Checksum mismatch for downloaded model');
          }
        } catch (_e) {
          // expo-crypto not present; proceed without checksum validation
        }
        // Atomically move tmp -> final
        await FileSystem.moveAsync({ from: tmpPath, to: localPath });

        // Save version info
        await AsyncStorage.setItem(ModelUpdateService.MODEL_VERSION_KEY, modelInfo.version);

        console.log('Model downloaded successfully to:', localPath);
        return localPath;
      } else {
        throw new Error(`Download failed with status: ${downloadResult.status}`);
      }
    } catch (error) {
      console.error('Failed to download model:', error);
      return null;
    }
  }
  
  async getLocalModelPath(): Promise<string | null> {
    try {
      const version = await AsyncStorage.getItem(ModelUpdateService.MODEL_VERSION_KEY);
      
      if (version) {
        const localPath = `${FileSystem.documentDirectory}gesture_model_${version}.tflite`;
        const fileInfo = await FileSystem.getInfoAsync(localPath);
        
        if (fileInfo.exists) {
          return localPath;
        }
      }
      
      return null;
    } catch (error) {
      console.warn('Failed to get local model path:', error);
      return null;
    }
  }
}

export const modelUpdateService = new ModelUpdateService();
