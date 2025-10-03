import { syncTrainingData, __setNetInfoFetchOverride } from '../../src/services/trainingSync';
import { listQueuedTrainingBundles, removeQueuedTrainingBundle } from '../../src/services/trainingBundleQueue';
import { uploadTrainingBundle } from '../../src/services/trainingBundleService';
import { loadProfile, loadBackendApiToken, updateTrainingSample } from '../../src/storage';
import { API_URL } from '../../src/constants';
import * as NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system';

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

const mockedListQueuedTrainingBundles = listQueuedTrainingBundles as jest.Mock;
const mockedRemoveQueuedTrainingBundle = removeQueuedTrainingBundle as jest.Mock;
const mockedUploadTrainingBundle = uploadTrainingBundle as jest.Mock;
const mockedLoadProfile = loadProfile as jest.Mock;
const mockedLoadBackendApiToken = loadBackendApiToken as jest.Mock;
const mockedUpdateTrainingSample = updateTrainingSample as jest.Mock;
const mockedNetInfo = NetInfo as { fetch: jest.Mock };
const mockedFileSystem = FileSystem as { deleteAsync: jest.Mock };

describe('syncTrainingData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setNetInfoFetchOverride();
    (global.fetch as jest.Mock | undefined) = jest
      .fn()
      .mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ jobId: 'job-1' }) });
  });

  afterEach(() => {
    // @ts-expect-error - cleanup test stub
    delete global.fetch;
  });

  it('should not upload if user has not consented', async () => {
    mockedLoadProfile.mockResolvedValue({ consentHelpMeGetSmarter: false });
    const result = await syncTrainingData();
    expect(result.uploaded).toBe(0);
    expect(mockedListQueuedTrainingBundles).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
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
    const profile = { id: 'profile1', consentHelpMeGetSmarter: true };
    const bundles = [
      { key: 'bundle1', sampleId: 'sample1', profileId: 'profile1', clipUri: 'uri1', frames: [], label: 'test', capturedAt: 'date' },
      { key: 'bundle2', sampleId: 'sample2', profileId: 'profile1', clipUri: 'uri2', frames: [], label: 'test', capturedAt: 'date' },
    ];
    mockedLoadProfile.mockResolvedValue(profile);
    mockedListQueuedTrainingBundles.mockResolvedValue(bundles);
    mockedNetInfo.fetch.mockResolvedValue({ isConnected: true, isInternetReachable: true, type: 'wifi' });
    __setNetInfoFetchOverride(mockedNetInfo.fetch);
    mockedLoadBackendApiToken.mockResolvedValue('token');
    mockedUploadTrainingBundle.mockResolvedValue({ id: 'upload1', status: 'success' });
    mockedListQueuedTrainingBundles.mockResolvedValueOnce(bundles).mockResolvedValueOnce([]);


    const result = await syncTrainingData();

    expect(result.uploaded).toBe(2);
    expect(result.remaining).toBe(0);
    expect(mockedUploadTrainingBundle).toHaveBeenCalledTimes(2);
    expect(mockedRemoveQueuedTrainingBundle).toHaveBeenCalledTimes(2);
    expect(mockedUpdateTrainingSample).toHaveBeenCalledTimes(2);
    expect(mockedFileSystem.deleteAsync).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [endpoint, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(endpoint).toBe(`${API_URL}/train-model`);
    expect(options).toMatchObject({ method: 'POST' });
    expect(JSON.parse(options.body)).toEqual({ trigger: 'bundles' });
  });
});
