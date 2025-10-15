import { syncTrainingData, __setTrainingJobPollWaitOverride } from '../src/services/trainingSync';

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
  __esModule: true,
  deleteAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  uploadAsync: jest.fn(),
  FileSystemUploadType: { BINARY_CONTENT: 'BINARY_CONTENT' },
  EncodingType: { Base64: 'base64' },
  Paths: {
    document: { uri: 'file://document/' },
    cache: { uri: 'file://cache/' },
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn() },
}));

const { loadProfile, updateTrainingSample } = require('../src/storage');
const { listQueuedTrainingBundles, removeQueuedTrainingBundle } = require('../src/services/trainingBundleQueue');
const { uploadTrainingBundle } = require('../src/services/trainingBundleService');
const { API_URL } = require('../src/constants');
const fs = require('expo-file-system');
const { logger } = require('../src/utils/logger');
const { loadBackendApiToken } = require('../src/storage');

describe('syncTrainingData', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    __setTrainingJobPollWaitOverride(async () => {});
    (loadBackendApiToken as jest.Mock).mockResolvedValue('token');
    (listQueuedTrainingBundles as jest.Mock).mockResolvedValue([]);
    (uploadTrainingBundle as jest.Mock).mockResolvedValue({ status: 'queued', id: 'bundle' });
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo) => {
      const href = typeof input === 'string' ? input : (input as { url?: string }).url ?? '';
      if (href === `${API_URL}/train-model`) {
        return Promise.resolve({
          ok: true,
          json: jest.fn().mockResolvedValue({ jobId: 'job-1', status: 'queued' }),
        } as any);
      }
      if (href === `${API_URL}/api/training-status/job-1`) {
        return Promise.resolve({
          ok: true,
          json: jest.fn().mockResolvedValue({ status: 'completed', jobId: 'job-1' }),
        } as any);
      }
      return Promise.resolve({ ok: true, json: jest.fn().mockResolvedValue({}) } as any);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    fetchSpy.mockRestore();
    __setTrainingJobPollWaitOverride();
  });

  it('returns early when user lacks consent', async () => {
    (loadProfile as jest.Mock).mockResolvedValue({ consentHelpMeGetSmarter: false, id: 'amy' });
    const result = await syncTrainingData();
    expect(uploadTrainingBundle).not.toHaveBeenCalled();
    expect(result).toEqual({ uploaded: 0, remaining: 0 });
    expect(global.fetch).not.toHaveBeenCalled();
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
    expect(fetchSpy).toHaveBeenCalledWith(
      `${API_URL}/train-model`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      'Training job triggered for uploaded bundles',
      expect.objectContaining({ jobId: 'job-1' }),
    );
  });

});
