import {
  syncTrainingData,
  __setNetInfoFetchOverride,
  __setTrainingJobPollWaitOverride,
} from '../../src/services/trainingSync';
import { listQueuedTrainingBundles, removeQueuedTrainingBundle } from '../../src/services/trainingBundleQueue';
import { uploadTrainingBundle } from '../../src/services/trainingBundleService';
import {
  loadProfile,
  loadBackendApiToken,
  updateTrainingSample,
  rehydratePendingTrainingSamples,
} from '../../src/storage';
import { API_URL } from '../../src/constants';
import * as NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system';
import { refreshDgsModel } from '../../src/services/modelUpdate';
import { logger } from '../../src/utils/logger';

jest.mock('../../src/services/trainingBundleQueue');
jest.mock('../../src/services/trainingBundleService');
jest.mock('../../src/storage');
jest.mock('@react-native-community/netinfo');
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
jest.mock('../../src/services/modelUpdate', () => ({
  refreshDgsModel: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    gestureEvent: jest.fn(),
    apiCall: jest.fn(),
    performanceMetric: jest.fn(),
    setContext: jest.fn(),
    clearContext: jest.fn(),
    setLevel: jest.fn(),
  },
}));

const mockedListQueuedTrainingBundles = listQueuedTrainingBundles as jest.Mock;
const mockedRemoveQueuedTrainingBundle = removeQueuedTrainingBundle as jest.Mock;
const mockedUploadTrainingBundle = uploadTrainingBundle as jest.Mock;
const mockedLoadProfile = loadProfile as jest.Mock;
const mockedLoadBackendApiToken = loadBackendApiToken as jest.Mock;
const mockedUpdateTrainingSample = updateTrainingSample as jest.Mock;
const mockedRehydratePendingTrainingSamples = rehydratePendingTrainingSamples as jest.Mock;
const mockedNetInfo = NetInfo as { fetch: jest.Mock };
const mockedFileSystem = FileSystem as { deleteAsync: jest.Mock };
const mockedRefreshDgsModel = refreshDgsModel as jest.Mock;
const mockedLogger = logger as jest.Mocked<typeof logger>;

function createFetchResponse(body: unknown) {
  return {
    ok: true,
    json: jest.fn().mockResolvedValue(body),
  };
}

function getTrainModelCallCount(): number {
  const endpoint = `${API_URL}/train-model`;
  return (global.fetch as jest.Mock).mock.calls.filter(([url]) => {
    const href = typeof url === 'string' ? url : (url as any)?.url ?? '';
    return href === endpoint;
  }).length;
}

describe('syncTrainingData', () => {
  const defaultProfile = { id: 'profile1', consentHelpMeGetSmarter: true };
  const wifiConnection = { isConnected: true, isInternetReachable: true, type: 'wifi' as const };

  beforeEach(() => {
    jest.clearAllMocks();
    __setNetInfoFetchOverride();
    __setTrainingJobPollWaitOverride(async () => {});
    (global.fetch as jest.Mock | undefined) = jest.fn((url: RequestInfo) => {
      const href = typeof url === 'string' ? url : '';
      if (href.includes('/train-model')) {
        return Promise.resolve(createFetchResponse({ jobId: 'job-1', status: 'queued' }));
      }
      if (href.includes('training-status')) {
        return Promise.resolve(createFetchResponse({ status: 'completed', jobId: 'job-1' }));
      }
      return Promise.resolve(createFetchResponse({ status: 'completed' }));
    });
    mockedLoadProfile.mockResolvedValue(defaultProfile);
    mockedNetInfo.fetch.mockResolvedValue(wifiConnection);
    __setNetInfoFetchOverride(mockedNetInfo.fetch);
    mockedLoadBackendApiToken.mockResolvedValue('token');
    mockedRehydratePendingTrainingSamples.mockResolvedValue(undefined);
    mockedLogger.info.mockReset();
    mockedLogger.warn.mockReset();
    mockedLogger.error.mockReset();
    mockedLogger.debug.mockReset();
  });

  afterEach(() => {
    // @ts-expect-error - cleanup test stub
    delete global.fetch;
    __setTrainingJobPollWaitOverride();
  });

  it('should not upload if user has not consented', async () => {
    mockedLoadProfile.mockResolvedValue({ consentHelpMeGetSmarter: false });
    const onProgress = jest.fn();
    const result = await syncTrainingData({ onProgress });
    expect(result.uploaded).toBe(0);
    expect(mockedListQueuedTrainingBundles).not.toHaveBeenCalled();
    expect(mockedRehydratePendingTrainingSamples).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('should not upload if there are no bundles', async () => {
    mockedLoadProfile.mockResolvedValue({ id: 'profile1', consentHelpMeGetSmarter: true });
    mockedListQueuedTrainingBundles.mockResolvedValue([]);
    const result = await syncTrainingData();
    expect(result.uploaded).toBe(0);
    expect(mockedRehydratePendingTrainingSamples).toHaveBeenCalledWith('profile1');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should not upload if not on wifi', async () => {
    mockedLoadProfile.mockResolvedValue({ id: 'profile1', consentHelpMeGetSmarter: true });
    mockedListQueuedTrainingBundles.mockResolvedValue([{}]);
    mockedNetInfo.fetch.mockResolvedValue({ isConnected: true, isInternetReachable: true, type: 'cellular' });
    __setNetInfoFetchOverride(mockedNetInfo.fetch);
    const result = await syncTrainingData();
    expect(result.uploaded).toBe(0);
  });

  it('rehydrates pending samples before syncing queued bundles', async () => {
    const bundles: any[] = [];
    mockedListQueuedTrainingBundles.mockImplementation(async () => bundles.map((bundle) => ({ ...bundle })));
    mockedRemoveQueuedTrainingBundle.mockImplementation(async (key: string) => {
      const index = bundles.findIndex((bundle) => bundle.key === key);
      if (index !== -1) {
        bundles.splice(index, 1);
      }
    });
    mockedRehydratePendingTrainingSamples.mockImplementation(async () => {
      bundles.push({
        key: 'rehydrated-bundle',
        sampleId: 'sample-pending',
        profileId: 'profile1',
        clipUri: 'rehydrated://clip',
        stillUri: 'rehydrated://still',
        frames: [],
        label: 'rehydrated-label',
        capturedAt: 'rehydrated-date',
      });
    });
    mockedUploadTrainingBundle.mockResolvedValue({
      id: 'upload-rehydrated',
      status: 'queued',
      trainingJob: { jobId: 'rehydrated-job', status: 'queued' },
    });

    const result = await syncTrainingData();

    expect(mockedRehydratePendingTrainingSamples).toHaveBeenCalledWith('profile1');
    const rehydrateCall = mockedRehydratePendingTrainingSamples.mock.invocationCallOrder[0];
    const listCall = mockedListQueuedTrainingBundles.mock.invocationCallOrder[0];
    expect(rehydrateCall).toBeLessThan(listCall);
    expect(mockedUploadTrainingBundle).toHaveBeenCalledTimes(1);
    expect(mockedUploadTrainingBundle).toHaveBeenCalledWith(
      {
        label: 'rehydrated-label',
        profileId: 'profile1',
        frames: [],
        clipUri: 'rehydrated://clip',
        stillUri: 'rehydrated://still',
        capturedAt: 'rehydrated-date',
        source: 'app://mediapipe',
      },
      { tokenOverride: 'token' },
    );
    expect(mockedRemoveQueuedTrainingBundle).toHaveBeenCalledWith('rehydrated-bundle');
    expect(mockedUpdateTrainingSample).toHaveBeenCalledWith('sample-pending', 'profile1', {
      syncStatus: 'synced',
      bundleKey: null,
    });
    expect(result).toEqual({ uploaded: 1, remaining: 0 });
  });

  it('should upload bundles and clean up', async () => {
    const bundles = [
      {
        key: 'bundle1',
        sampleId: 'sample1',
        profileId: 'profile1',
        clipUri: 'uri1',
        stillUri: 'uri1-still',
        frames: [],
        label: 'test',
        capturedAt: 'date',
      },
      {
        key: 'bundle2',
        sampleId: 'sample2',
        profileId: 'profile1',
        clipUri: 'uri2',
        stillUri: 'uri2-still',
        frames: [],
        label: 'test',
        capturedAt: 'date',
      },
    ];
    mockedListQueuedTrainingBundles.mockResolvedValue(bundles);
    mockedUploadTrainingBundle.mockResolvedValue({
      id: 'upload1',
      status: 'success',
      trainingJob: { jobId: 'job-123', status: 'queued' },
    });
    mockedListQueuedTrainingBundles.mockResolvedValueOnce(bundles).mockResolvedValueOnce([]);

    const onProgress = jest.fn();
    const result = await syncTrainingData({ onProgress });

    expect(result.uploaded).toBe(2);
    expect(result.remaining).toBe(0);
    expect(mockedUploadTrainingBundle).toHaveBeenCalledTimes(2);
    expect(mockedRemoveQueuedTrainingBundle).toHaveBeenCalledTimes(2);
    expect(mockedUpdateTrainingSample).toHaveBeenCalledTimes(2);
    expect(mockedFileSystem.deleteAsync).toHaveBeenCalledTimes(4);
    expect(onProgress).toHaveBeenNthCalledWith(1, 50);
    expect(onProgress).toHaveBeenNthCalledWith(2, 100);
    expect(mockedRefreshDgsModel).toHaveBeenCalledWith('profile1');
    expect(getTrainModelCallCount()).toBe(0);
  });

  it('falls back to manual training trigger when server does not schedule a job', async () => {
    const bundles = [
      {
        key: 'bundle1',
        sampleId: 'sample1',
        profileId: 'profile1',
        clipUri: 'uri1',
        stillUri: 'uri1-still',
        frames: [],
        label: 'test',
        capturedAt: 'date',
      },
    ];
    mockedListQueuedTrainingBundles.mockResolvedValueOnce(bundles).mockResolvedValueOnce([]);
    mockedUploadTrainingBundle.mockResolvedValue({ id: 'upload1', status: 'queued' });

    const pollResponses = [{ status: 'running' }, { status: 'completed' }];
    (global.fetch as jest.Mock).mockImplementation((url: RequestInfo) => {
      const href = typeof url === 'string' ? url : '';
      if (href === `${API_URL}/train-model`) {
        return Promise.resolve(createFetchResponse({ jobId: 'job-1', status: 'queued' }));
      }
      if (href === `${API_URL}/api/training-status/job-1`) {
        const next = pollResponses.shift() ?? { status: 'completed' };
        return Promise.resolve(createFetchResponse(next));
      }
      return Promise.resolve(createFetchResponse({ status: 'completed' }));
    });

    const result = await syncTrainingData();

    expect(result.uploaded).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(3);
    const [endpoint, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(endpoint).toBe(`${API_URL}/train-model`);
    expect(options).toMatchObject({ method: 'POST' });
    expect(JSON.parse(options.body)).toEqual({ trigger: 'bundles' });
    expect(mockedLogger.info).toHaveBeenCalledWith(
      'Training job triggered for uploaded bundles',
      expect.objectContaining({ jobId: 'job-1' }),
    );
  });

  it('uploads bundles but skips training trigger when API token is missing', async () => {
    mockedLoadBackendApiToken.mockResolvedValueOnce(null);

    const bundle = {
      key: 'bundle1',
      sampleId: 'sample1',
      profileId: 'profile1',
      clipUri: 'uri1',
      stillUri: 'uri1-still',
      frames: [],
      label: 'test',
      capturedAt: 'date',
    };

    mockedListQueuedTrainingBundles.mockResolvedValueOnce([bundle]).mockResolvedValueOnce([]);
    mockedUploadTrainingBundle.mockResolvedValue({ id: 'upload1', status: 'queued' });

    const result = await syncTrainingData();

    expect(result.uploaded).toBe(1);
    expect(getTrainModelCallCount()).toBe(0);
    expect(mockedRefreshDgsModel).toHaveBeenCalledWith('profile1');
    expect(mockedLogger.warn).toHaveBeenCalledWith('Skipping training job trigger: missing API token');
  });

  it('skips manual trigger if a later upload schedules the job', async () => {
    const bundles = [
      {
        key: 'bundle1',
        sampleId: 'sample1',
        profileId: 'profile1',
        clipUri: 'uri1',
        stillUri: 'uri1-still',
        frames: [],
        label: 'test',
        capturedAt: 'date',
      },
      {
        key: 'bundle2',
        sampleId: 'sample2',
        profileId: 'profile1',
        clipUri: 'uri2',
        stillUri: 'uri2-still',
        frames: [],
        label: 'test',
        capturedAt: 'date',
      },
    ];

    mockedListQueuedTrainingBundles
      .mockResolvedValueOnce(bundles)
      .mockResolvedValueOnce([]);
    mockedUploadTrainingBundle
      .mockResolvedValueOnce({ id: 'upload1', status: 'queued' })
      .mockResolvedValueOnce({
        id: 'upload2',
        status: 'queued',
        trainingJob: { jobId: 'job-789', status: 'queued' },
      });

    const result = await syncTrainingData();

    expect(result.uploaded).toBe(2);
    expect(result.remaining).toBe(0);
    expect(getTrainModelCallCount()).toBe(0);
  });

  it('skips manual trigger when server provides a job ID', async () => {
    const bundles = [
      {
        key: 'bundle1',
        sampleId: 'sample1',
        profileId: 'profile1',
        clipUri: 'uri1',
        stillUri: 'uri1-still',
        frames: [],
        label: 'test',
        capturedAt: 'date',
      },
    ];

    mockedListQueuedTrainingBundles
      .mockResolvedValueOnce(bundles)
      .mockResolvedValueOnce([]);
    mockedUploadTrainingBundle.mockResolvedValue({
      id: 'upload1',
      status: 'queued',
      trainingJob: { jobId: 'job-999', status: 'queued' },
    });

    const result = await syncTrainingData();

    expect(result.uploaded).toBe(1);
    expect(result.remaining).toBe(0);
    expect(getTrainModelCallCount()).toBe(0);
  });

  it('polls training job until completion before refreshing model', async () => {
    const bundle = {
      key: 'bundle1',
      sampleId: 'sample1',
      profileId: 'profile1',
      clipUri: 'uri1',
      stillUri: 'uri1-still',
      frames: [],
      label: 'test',
      capturedAt: 'date',
    };
    mockedListQueuedTrainingBundles.mockResolvedValueOnce([bundle]).mockResolvedValueOnce([]);
    mockedUploadTrainingBundle.mockResolvedValue({
      id: 'upload1',
      status: 'queued',
      trainingJob: {
        jobId: 'job-123',
        status: 'queued',
        pollUrl: '/api/training-status/job-123',
      },
    });

    const pollEndpoint = `${API_URL}/api/training-status/job-123`;
    const pollResolvers: Array<(status: 'running' | 'completed') => void> = [];

    (global.fetch as jest.Mock).mockImplementation((url: RequestInfo) => {
      const href = typeof url === 'string' ? url : '';
      if (href === pollEndpoint) {
        return new Promise((resolve) => {
          pollResolvers.push((status) =>
            resolve(createFetchResponse({ status, jobId: 'job-123' })),
          );
        });
      }
      return Promise.resolve(createFetchResponse({ status: 'queued', jobId: 'job-123' }));
    });

    const syncPromise = syncTrainingData();

    await Promise.resolve();

    for (let i = 0; i < 20 && pollResolvers.length === 0; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve();
    }

    expect(pollResolvers.length).toBeGreaterThan(0);
    pollResolvers.shift()?.('running');

    await Promise.resolve();
    expect(mockedRefreshDgsModel).not.toHaveBeenCalled();

    for (let i = 0; i < 20 && pollResolvers.length === 0; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve();
    }

    expect(pollResolvers.length).toBeGreaterThan(0);
    pollResolvers.shift()?.('completed');

    await syncPromise;

    expect(mockedRefreshDgsModel).toHaveBeenCalledWith('profile1');
    const pollCalls = (global.fetch as jest.Mock).mock.calls.filter(
      ([url]) => url === pollEndpoint,
    );
    expect(pollCalls).toHaveLength(2);
  });

  it('does not refresh the model when the monitored training job fails', async () => {
    const bundle = {
      key: 'bundle1',
      sampleId: 'sample1',
      profileId: 'profile1',
      clipUri: 'uri1',
      frames: [],
      label: 'test',
      capturedAt: 'date',
    };

    mockedListQueuedTrainingBundles.mockResolvedValueOnce([bundle]).mockResolvedValueOnce([]);
    mockedUploadTrainingBundle.mockResolvedValue({
      id: 'upload1',
      status: 'queued',
      trainingJob: {
        jobId: 'job-321',
        status: 'running',
      },
    });

    (global.fetch as jest.Mock).mockImplementation((url: RequestInfo) => {
      const href = typeof url === 'string' ? url : '';
      if (href === `${API_URL}/api/training-status/job-321`) {
        return Promise.resolve(createFetchResponse({ status: 'failed', jobId: 'job-321' }));
      }
      return Promise.resolve(createFetchResponse({ status: 'queued', jobId: 'job-321' }));
    });

    const result = await syncTrainingData();

    expect(result.uploaded).toBe(1);
    expect(mockedRefreshDgsModel).not.toHaveBeenCalled();
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      'Skipped model refresh because training job did not complete',
      expect.objectContaining({ jobId: 'job-321' }),
    );
  });

  it('logs timeout and skips refresh when training job never resolves', async () => {
    const bundle = {
      key: 'bundle1',
      sampleId: 'sample1',
      profileId: 'profile1',
      clipUri: 'uri1',
      frames: [],
      label: 'test',
      capturedAt: 'date',
    };

    mockedListQueuedTrainingBundles.mockResolvedValueOnce([bundle]).mockResolvedValueOnce([]);
    mockedUploadTrainingBundle.mockResolvedValue({
      id: 'upload-timeout',
      status: 'queued',
      trainingJob: {
        jobId: 'job-timeout',
        status: 'running',
      },
    });

    const nowSpy = jest.spyOn(Date, 'now');
    const nowValues = [0, 0, 30_000, 60_000, 90_000, 120_001];
    let callIndex = 0;
    nowSpy.mockImplementation(() => {
      const value = nowValues[callIndex];
      if (callIndex < nowValues.length - 1) {
        callIndex += 1;
      }
      return value;
    });

    (global.fetch as jest.Mock).mockImplementation((url: RequestInfo) => {
      const href = typeof url === 'string' ? url : '';
      if (href === `${API_URL}/api/training-status/job-timeout`) {
        return Promise.resolve(createFetchResponse({ status: 'running', jobId: 'job-timeout' }));
      }
      return Promise.resolve(createFetchResponse({ status: 'queued', jobId: 'job-timeout' }));
    });

    try {
      const result = await syncTrainingData();

      expect(result.uploaded).toBe(1);
      expect(mockedRefreshDgsModel).not.toHaveBeenCalled();
      expect(mockedLogger.warn).toHaveBeenCalledWith(
        'Training job poll timed out',
        expect.objectContaining({ jobId: 'job-timeout', attempts: expect.any(Number) }),
      );
      expect(mockedLogger.warn).toHaveBeenCalledWith(
        'Skipped model refresh because training job did not complete',
        expect.objectContaining({ jobId: 'job-timeout' }),
      );
    } finally {
      nowSpy.mockRestore();
    }
  });
});
