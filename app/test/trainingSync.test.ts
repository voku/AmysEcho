import { syncTrainingData } from '../src/services/trainingSync';

jest.mock('../src/storage', () => ({
  __esModule: true,
  loadProfile: jest.fn(async () => ({ consentHelpMeGetSmarter: false, id: 'amy' })),
  loadBackendApiToken: jest.fn(async () => 'token'),
  updateTrainingSample: jest.fn(async () => null),
}));

jest.mock('../src/services/trainingBundleQueue', () => ({
  __esModule: true,
  listQueuedTrainingBundles: jest.fn(async () => []),
  removeQueuedTrainingBundle: jest.fn(async () => {}),
}));

jest.mock('../src/services/trainingBundleService', () => ({
  __esModule: true,
  uploadTrainingBundle: jest.fn(async () => ({ status: 'queued', id: 'bundle' })),
}));

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(async () => ({
    isConnected: true,
    isInternetReachable: true,
    type: 'wifi',
  })),
}));

jest.mock('../src/services/modelUpdate', () => ({
  __esModule: true,
  refreshDgsModel: jest.fn(),
}));

jest.mock('expo-file-system', () => ({
  deleteAsync: jest.fn(async () => {}),
}));

jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn() },
}));

const { loadProfile, updateTrainingSample } = require('../src/storage');
const { listQueuedTrainingBundles, removeQueuedTrainingBundle } = require('../src/services/trainingBundleQueue');
const { uploadTrainingBundle } = require('../src/services/trainingBundleService');
const fs = require('expo-file-system');

describe('syncTrainingData', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns early when user lacks consent', async () => {
    (loadProfile as jest.Mock).mockResolvedValue({ consentHelpMeGetSmarter: false, id: 'amy' });
    const result = await syncTrainingData();
    expect(uploadTrainingBundle).not.toHaveBeenCalled();
    expect(result).toEqual({ uploaded: 0, remaining: 0 });
  });

  it('uploads queued bundles when conditions are met', async () => {
    (loadProfile as jest.Mock).mockResolvedValue({ consentHelpMeGetSmarter: true, id: 'amy' });
    (listQueuedTrainingBundles as jest.Mock)
      .mockResolvedValueOnce([
        {
          key: 'trainingBundles:amy:test',
          sampleId: 'sample-1',
          profileId: 'amy',
          label: 'HALLO',
          frames: [],
          clipUri: 'file://cache/clip.mp4',
          capturedAt: '2024-05-28T12:03:11Z',
          source: 'HIP_2',
          queuedAt: '2024-05-28T12:03:12Z',
        },
      ])
      .mockResolvedValueOnce([]);
    const onProgress = jest.fn();
    const result = await syncTrainingData({ onProgress });

    expect(listQueuedTrainingBundles).toHaveBeenCalledWith('amy');
    expect(uploadTrainingBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'HALLO',
        profileId: 'amy',
        clipUri: 'file://cache/clip.mp4',
        capturedAt: '2024-05-28T12:03:11Z',
        source: 'app://mediapipe',
      }),
      expect.any(Object),
    );
    expect(removeQueuedTrainingBundle).toHaveBeenCalledWith('trainingBundles:amy:test');
    expect(updateTrainingSample).toHaveBeenCalledWith('sample-1', 'amy', {
      syncStatus: 'synced',
      bundleKey: null,
    });
    expect(fs.deleteAsync).toHaveBeenCalledWith('file://cache/clip.mp4', { idempotent: true });
    expect(onProgress).toHaveBeenCalledWith(100);
    expect(result).toEqual({ uploaded: 1, remaining: 0 });
  });

});
