import { checkForModelUpdate } from '../src/services/modelUpdate';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system';
import { CUSTOM_GESTURE_MODEL_PATH } from '../src/constants';
import { logger } from '../src/utils/logger';

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(),
}));

jest.mock('expo-file-system', () => ({
  downloadAsync: jest.fn().mockResolvedValue({ uri: '/tmp/model.json' }),
}));

jest.mock('../src/storage', () => ({
  loadBackendApiToken: jest.fn().mockResolvedValue('token'),
  saveCustomModelUri: jest.fn().mockResolvedValue(undefined),
  loadCustomModelHash: jest.fn().mockResolvedValue('old-hash'),
  saveCustomModelHash: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/constants', () => ({
  API_URL: 'https://example.com',
  CUSTOM_GESTURE_MODEL_PATH: '/tmp/model.json',
}));

jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn() },
}));

describe('checkForModelUpdate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
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

  it('includes profileId in requests when provided', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ sha256: 'h' }) });
    (global as any).fetch = fetchMock;
    await checkForModelUpdate('p1');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/model-metadata?profileId=p1',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      }),
    );
    expect(FileSystem.downloadAsync).toHaveBeenCalledWith(
      'https://example.com/latest-model?profileId=p1',
      CUSTOM_GESTURE_MODEL_PATH,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      }),
    );
    const { saveCustomModelHash, saveCustomModelUri } =
      jest.requireMock('../src/storage');
    expect(saveCustomModelHash).toHaveBeenCalledWith('h');
    expect(saveCustomModelUri).toHaveBeenCalledWith('/tmp/model.json');
  });

  it('returns false and logs when metadata request fails', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
    });
    (global as any).fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 500 });

    const result = await checkForModelUpdate();
    expect(result).toBe(false);
    expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith('model metadata request failed', {
      status: 500,
    });
  });
});
