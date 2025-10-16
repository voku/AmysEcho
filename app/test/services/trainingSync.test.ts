import {
  syncTrainingData,
  __setNetInfoFetchOverride,
  __setTrainingJobPollWaitOverride,
} from '../../src/services/trainingSync';
import { listQueuedTrainingBundles, removeQueuedTrainingBundle } from '../../src/services/trainingBundleQueue';
import { uploadTrainingBundle } from '../../src/services/trainingBundleService';
import { loadProfile, loadBackendApiToken, updateTrainingSample } from '../../src/storage';
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
    expect(global.fetch).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('should not upload if there are no bundles', async () => {
    mockedLoadProfile.mockResolvedValue({ consentHelpMeGetSmarter: true });
    mockedListQueuedTrainingBundles.mockResolvedValue([]);
    const result = await syncTrainingData();
    expect(result.uploaded).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should not upload if not on wifi', async () => {
    mockedLoadProfile.mockResolvedValue({ consentHelpMeGetSmarter: true });
    mockedListQueuedTrainingBundles.mockResolvedValue([{}]);
    mockedNetInfo.fetch.mockResolvedValue({ isConnected: true, isInternetReachable: true, type: 'cellular' });
    __setNetInfoFetchOverride(mockedNetInfo.fetch);
    const result = await syncTrainingData();
    expect(result.uploaded).toBe(0);
  });

  it('should upload bundles and clean up', async () => {
    const bundles = [
      { key: 'bundle1', sampleId: 'sample1', profileId: 'profile1', clipUri: 'uri1', frames: [], label: 'test', capturedAt: 'date' },
      { key: 'bundle2', sampleId: 'sample2', profileId: 'profile1', clipUri: 'uri2', frames: [], label: 'test', capturedAt: 'date' },
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
    expect(mockedFileSystem.deleteAsync).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, 50);
    expect(onProgress).toHaveBeenNthCalledWith(2, 100);
    expect(mockedRefreshDgsModel).toHaveBeenCalledWith('profile1');
    const trainModelCalls = (global.fetch as jest.Mock).mock.calls.filter(
      ([url]) => url === `${API_URL}/train-model`,
    );
    expect(trainModelCalls).toHaveLength(0);
  });

  it('falls back to manual training trigger when server does not schedule a job', async () => {
    const bundles = [
      { key: 'bundle1', sampleId: 'sample1', profileId: 'profile1', clipUri: 'uri1', frames: [], label: 'test', capturedAt: 'date' },
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

  it('skips manual trigger if a later upload schedules the job', async () => {
    const bundles = [
      { key: 'bundle1', sampleId: 'sample1', profileId: 'profile1', clipUri: 'uri1', frames: [], label: 'test', capturedAt: 'date' },
      { key: 'bundle2', sampleId: 'sample2', profileId: 'profile1', clipUri: 'uri2', frames: [], label: 'test', capturedAt: 'date' },
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
    const trainModelCalls = (global.fetch as jest.Mock).mock.calls.filter(
      ([url]) => url === `${API_URL}/train-model`,
    );
    expect(trainModelCalls).toHaveLength(0);
  });

  it('skips manual trigger when server provides a job ID', async () => {
    const bundles = [
      { key: 'bundle1', sampleId: 'sample1', profileId: 'profile1', clipUri: 'uri1', frames: [], label: 'test', capturedAt: 'date' },
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
    const trainModelCalls = (global.fetch as jest.Mock).mock.calls.filter(
      ([url]) => url === `${API_URL}/train-model`,
    );
    expect(trainModelCalls).toHaveLength(0);
  });

  it('polls training job until completion before refreshing model', async () => {
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
});
