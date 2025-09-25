import { processFramesForUpload, HAND_LANDMARKS_PER_HAND } from '../src/services/handUtils';
import { syncTrainingData } from '../src/services/trainingSync';

jest.mock('../src/storage', () => ({
  __esModule: true,
  loadProfile: async () => ({ consentHelpMeGetSmarter: false, id: 'amy' }),
  loadBackendApiToken: async () => 'token',
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(),
  },
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

jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn() },
}));

describe('processFramesForUpload', () => {
  it('flattens frames with handedness ordering', () => {
    const left = Array.from({ length: HAND_LANDMARKS_PER_HAND }, (_, i) => [i, i, i]);
    const right = Array.from({ length: HAND_LANDMARKS_PER_HAND }, (_, i) => [i + 100, i + 100, i + 100]);

    const result = processFramesForUpload([
      { landmarks: [right, left], handedness: ['Right', 'Left'] },
    ], 'g1', 'amy');

    expect(result).toHaveLength(1);
    const [sample] = result;
    expect(sample.gestureDefinitionId).toBe('g1');
    expect(sample.profileId).toBe('amy');
    expect(sample.landmarkData[0]).toEqual([0, 0, 0]);
    expect(sample.landmarkData[HAND_LANDMARKS_PER_HAND]).toEqual([100, 100, 100]);
  });

  it('filters out empty frames', () => {
    const result = processFramesForUpload([
      { landmarks: [[], []], handedness: [] },
      { landmarks: [[[1, 2, 3]], []], handedness: [] },
    ], 'g1');

    expect(result).toHaveLength(1);
    expect(result[0].landmarkData[0]).toEqual([1, 2, 3]);
  });
});

describe('syncTrainingData', () => {
  it('returns early when user lacks consent', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as any);
    await syncTrainingData();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
