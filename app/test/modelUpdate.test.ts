import { checkForModelUpdate } from '../src/services/modelUpdate';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system';

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(),
}));

jest.mock('expo-file-system', () => ({
  downloadAsync: jest.fn().mockResolvedValue({ uri: '/tmp/model.tflite' }),
}));

jest.mock('../src/storage', () => ({
  loadBackendApiToken: jest.fn().mockResolvedValue('token'),
  saveCustomModelUri: jest.fn().mockResolvedValue(undefined),
  loadCustomModelHash: jest.fn().mockResolvedValue('old-hash'),
  saveCustomModelHash: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/constants/modelPaths', () => ({
  CUSTOM_GESTURE_MODEL_PATH: '/tmp/model.tflite',
}));

jest.mock('../src/constants', () => ({
  API_URL: 'https://example.com',
}));

jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn() },
}));

describe('checkForModelUpdate', () => {
  it('returns false when not on wifi', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
      type: 'cellular',
    });

    const result = await checkForModelUpdate();
    expect(result).toBe(false);
    expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
  });

  it('downloads model when on wifi', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
    });

    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sha256: 'new-hash' }),
    });

    const result = await checkForModelUpdate();
    expect(result).toBe(true);
    expect(FileSystem.downloadAsync).toHaveBeenCalled();
  });
});
