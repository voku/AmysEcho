const mockNetInfo = {
  fetch: jest.fn(),
};

const mockFileSystem = {
  downloadAsync: jest.fn().mockResolvedValue({ uri: '/tmp/model.json' }),
  getInfoAsync: jest.fn((path: string) => {
    if (path === '/tmp/model.json' && !path.includes('.backup')) {
      return Promise.resolve({ exists: true, size: 5000 });
    }
    if (path.includes('.backup')) {
      return Promise.resolve({ exists: true, size: 5000 });
    }
    return Promise.resolve({ exists: false, size: 0 });
  }),
  copyAsync: jest.fn().mockResolvedValue(undefined),
};

const mockStorage = {
  loadBackendApiToken: jest.fn().mockResolvedValue('token'),
  saveCustomModelUri: jest.fn().mockResolvedValue(undefined),
  loadCustomModelHash: jest.fn().mockResolvedValue('old-hash'),
  saveCustomModelHash: jest.fn().mockResolvedValue(undefined),
};

const mockLogger = {
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('@react-native-community/netinfo', () => mockNetInfo);
jest.mock('expo-file-system/legacy', () => mockFileSystem);
jest.mock('../src/storage', () => mockStorage);
jest.mock('../storage', () => mockStorage, { virtual: true });
jest.mock('../src/constants', () => ({
  API_URL: 'https://example.com',
  CUSTOM_GESTURE_MODEL_PATH: '/tmp/model.json',
}));
jest.mock('../src/utils/logger', () => ({
  logger: mockLogger,
}));

const { checkForModelUpdate } = require('../src/services/modelUpdate');

describe('checkForModelUpdate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.loadBackendApiToken.mockResolvedValue('token');
    mockStorage.loadCustomModelHash.mockResolvedValue('old-hash');
  });

  it('returns false when not on wifi', async () => {
    mockNetInfo.fetch.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
      type: 'cellular',
    });

    const result = await checkForModelUpdate();
    expect(result).toBe(false);
    expect(mockFileSystem.downloadAsync).not.toHaveBeenCalled();
  });

  it('downloads model when on wifi', async () => {
    mockNetInfo.fetch.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
    });

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sha256: 'new-hash' }),
    });
    (global as any).fetch = fetchMock;

    const result = await checkForModelUpdate();
    expect(result).toBe(false); // Validation fails in test environment
    expect(mockStorage.loadBackendApiToken).toHaveBeenCalled();
    const [, options] = fetchMock.mock.calls[0];
    const token = await mockStorage.loadBackendApiToken.mock.results[0].value;
    expect(token).toBe('token');
    expect(options.headers.Authorization).toBe(`Bearer ${token}`);
  });

  it('includes profileId in requests when provided', async () => {
    mockNetInfo.fetch.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ sha256: 'h' }) });
    (global as any).fetch = fetchMock;

    await checkForModelUpdate('p1');
    expect(mockStorage.loadBackendApiToken).toHaveBeenCalled();
    const [, options] = fetchMock.mock.calls[0];
    const token = await mockStorage.loadBackendApiToken.mock.results[0].value;
    expect(token).toBe('token');
    expect(options.headers.Authorization).toBe(`Bearer ${token}`);
  });

  it('returns false and logs when metadata request fails', async () => {
    mockNetInfo.fetch.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
    });
    (global as any).fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 500 });

    const result = await checkForModelUpdate();
    expect(result).toBe(false);
    expect(mockFileSystem.downloadAsync).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith('model metadata request failed', {
      status: 500,
    });
  });
});
