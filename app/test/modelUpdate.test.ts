jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(),
}));

jest.mock('../src/services/dgsModelClient', () => ({
  fetchMlpModel: jest.fn(),
  fetchCentroids: jest.fn(),
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const NetInfo = require('@react-native-community/netinfo');
const { fetchMlpModel, fetchCentroids } = require('../src/services/dgsModelClient');
const { logger } = require('../src/utils/logger');

const { checkForModelUpdate, refreshDgsModel } = require('../src/services/modelUpdate');

describe('checkForModelUpdate', () => {
  const netFetch = NetInfo.fetch as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    netFetch.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
    });
    delete process.env.EXPO_PUBLIC_ALLOW_CELLULAR_MODEL_UPDATES;
  });

  it('skips refresh when network is offline', async () => {
    netFetch.mockResolvedValueOnce({
      isConnected: false,
      isInternetReachable: false,
      type: 'cellular',
    });

    const result = await checkForModelUpdate();

    expect(result).toBe(false);
    expect(fetchMlpModel).not.toHaveBeenCalled();
    expect(fetchCentroids).not.toHaveBeenCalled();
  });

  it('returns true when MLP refresh succeeds', async () => {
    (fetchMlpModel as jest.Mock).mockResolvedValue('base64-model');

    const result = await checkForModelUpdate('profile-1');

    expect(fetchMlpModel).toHaveBeenCalledWith('profile-1');
    expect(result).toBe(true);
  });

  it('falls back to centroid when MLP unavailable', async () => {
    (fetchMlpModel as jest.Mock).mockResolvedValue(null);
    (fetchCentroids as jest.Mock).mockResolvedValue({ centroids: {}, counts: {} });

    const result = await checkForModelUpdate('profile-1');

    expect(fetchMlpModel).toHaveBeenCalledWith('profile-1');
    expect(fetchCentroids).toHaveBeenCalledWith('profile-1');
    expect(result).toBe(true);
  });

  it('returns false when no model data is available', async () => {
    (fetchMlpModel as jest.Mock).mockResolvedValue(null);
    (fetchCentroids as jest.Mock).mockResolvedValue(null);

    const result = await checkForModelUpdate();

    expect(result).toBe(false);
  });

  it('allows cellular refresh when flag enabled', async () => {
    process.env.EXPO_PUBLIC_ALLOW_CELLULAR_MODEL_UPDATES = 'true';
    netFetch.mockResolvedValueOnce({
      isConnected: true,
      isInternetReachable: true,
      type: 'cellular',
    });
    (fetchMlpModel as jest.Mock).mockResolvedValue(null);
    (fetchCentroids as jest.Mock).mockResolvedValue({ centroids: {}, counts: {} });

    const result = await checkForModelUpdate();

    expect(fetchMlpModel).toHaveBeenCalledWith(undefined);
    expect(fetchCentroids).toHaveBeenCalledWith(undefined);
    expect(result).toBe(true);
  });

  it('returns false and logs when refresh throws', async () => {
    (fetchMlpModel as jest.Mock).mockRejectedValue(new Error('boom'));

    const result = await checkForModelUpdate();

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('model refresh failed', expect.any(Error));
  });
});

describe('refreshDgsModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns mlp when available', async () => {
    (fetchMlpModel as jest.Mock).mockResolvedValue('base64-model');

    const result = await refreshDgsModel();

    expect(fetchMlpModel).toHaveBeenCalledWith(undefined);
    expect(result).toBe('mlp');
    expect(fetchCentroids).not.toHaveBeenCalled();
  });

  it('falls back to centroid when MLP unavailable', async () => {
    (fetchMlpModel as jest.Mock).mockResolvedValue(null);
    (fetchCentroids as jest.Mock).mockResolvedValue({ centroids: {}, counts: {} });

    const result = await refreshDgsModel('profile-1');

    expect(fetchMlpModel).toHaveBeenCalledWith('profile-1');
    expect(fetchCentroids).toHaveBeenCalledWith('profile-1');
    expect(result).toBe('centroid');
  });

  it('returns null when no model data is available', async () => {
    (fetchMlpModel as jest.Mock).mockResolvedValue(null);
    (fetchCentroids as jest.Mock).mockResolvedValue(null);

    const result = await refreshDgsModel();

    expect(result).toBeNull();
  });
});
