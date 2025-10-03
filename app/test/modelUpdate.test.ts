jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(),
}));

jest.mock('../src/services/dgsModelClient', () => ({
  fetchMlpModel: jest.fn(),
  fetchCentroids: jest.fn(),
  getCachedMlpModel: jest.fn(),
  restoreMlpModelBackup: jest.fn(),
  clearMlpModelBackup: jest.fn(),
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const NetInfo = require('@react-native-community/netinfo');
const {
  fetchMlpModel,
  fetchCentroids,
  getCachedMlpModel,
  restoreMlpModelBackup,
  clearMlpModelBackup,
} = require('../src/services/dgsModelClient');
const { logger } = require('../src/utils/logger');

const {
  checkForModelUpdate,
  refreshDgsModel,
  rollbackModelUpdate,
  emergencyRollback,
  validateModelUpdate,
} = require('../src/services/modelUpdate');

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

describe('validateModelUpdate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns true when cached model meets size requirements', async () => {
    (getCachedMlpModel as jest.Mock).mockResolvedValue('a'.repeat(1500));

    const result = await validateModelUpdate('profile-1');

    expect(result).toBe(true);
    expect(getCachedMlpModel).toHaveBeenCalledWith('profile-1');
    expect(logger.info).toHaveBeenCalledWith('Model validation passed', {
      profileId: 'profile-1',
      size: 1500,
    });
  });

  it('returns false when cached model is missing', async () => {
    (getCachedMlpModel as jest.Mock).mockResolvedValue(null);

    const result = await validateModelUpdate();

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('MLP model missing after update', {
      profileId: 'global',
    });
  });

  it('returns false when cached model is too small', async () => {
    (getCachedMlpModel as jest.Mock).mockResolvedValue('short');

    const result = await validateModelUpdate('profile-2');

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('MLP model suspiciously small after update', {
      profileId: 'profile-2',
      size: 5,
    });
  });
});

describe('rollbackModelUpdate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('restores backup when available', async () => {
    (restoreMlpModelBackup as jest.Mock).mockResolvedValue(true);

    const result = await rollbackModelUpdate('profile-3');

    expect(result).toBe(true);
    expect(restoreMlpModelBackup).toHaveBeenCalledWith('profile-3');
    expect(logger.info).toHaveBeenCalledWith('Successfully rolled back to previous model', {
      profileId: 'profile-3',
    });
  });

  it('warns when no backup exists', async () => {
    (restoreMlpModelBackup as jest.Mock).mockResolvedValue(false);

    const result = await rollbackModelUpdate();

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('No backup model available for rollback', {
      profileId: 'global',
    });
  });

  it('handles thrown errors gracefully', async () => {
    const error = new Error('boom');
    (restoreMlpModelBackup as jest.Mock).mockRejectedValue(error);

    const result = await rollbackModelUpdate('profile-4');

    expect(result).toBe(false);
    expect(logger.error).toHaveBeenCalledWith('Failed to rollback model update', error);
  });
});

describe('emergencyRollback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs event when rollback succeeds', async () => {
    (restoreMlpModelBackup as jest.Mock).mockResolvedValue(true);

    const result = await emergencyRollback('profile-5');

    expect(result).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith('Emergency rollback triggered due to recognition failures', {
      profileId: 'profile-5',
    });
    expect(clearMlpModelBackup).not.toHaveBeenCalled();
  });

  it('skips cleanup when rollback fails', async () => {
    (restoreMlpModelBackup as jest.Mock).mockResolvedValue(false);

    const result = await emergencyRollback();

    expect(result).toBe(false);
    expect(clearMlpModelBackup).not.toHaveBeenCalled();
  });
});
