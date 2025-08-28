const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockDatabase = {
  get: jest.fn(),
  write: jest.fn(async (fn: any) => { await fn(); }),
};
let mockSamples: any[] = [];

jest.mock('../db', () => ({
  database: mockDatabase,
  GestureTrainingData: class {},
}));

jest.mock('../src/storage', () => ({
  loadActiveProfileId: jest.fn(async () => 'p1'),
  loadProfile: jest.fn(async () => ({ id: 'p1', consentHelpMeGetSmarter: true })),
}));

jest.mock('../src/constants', () => ({
  API_URL: 'https://api.example',
  API_TOKEN: 'token',
}));

jest.mock('../src/utils/logger', () => ({
  logger: mockLogger,
}));

import { syncService } from '../src/services/syncService';

beforeEach(() => {
  mockSamples = [
    {
      landmarkData: JSON.stringify([
        { landmarks: [[[1, 2, 3]], []], handedness: ['Left', 'Right'] },
      ]),
      gestureDefinition: { id: 'g1' },
      customSyncStatus: 'pending',
      update: jest.fn(function (fn: any) { fn(this); }),
    },
  ];
  mockDatabase.get.mockReturnValue({
    query: jest.fn(() => ({ fetch: jest.fn().mockResolvedValue(mockSamples) })),
  });
  mockDatabase.write.mockImplementation(async (fn: any) => { await fn(); });
  (global as any).fetch = jest.fn(async () => ({ ok: true }));
  jest.clearAllMocks();
});

describe('syncService.uploadPendingTrainingData', () => {
  it('uploads samples and marks them synced', async () => {
    await syncService.uploadPendingTrainingData();
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example/train-model',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.samples).toHaveLength(1);
    expect(body.samples[0].gestureDefinitionId).toBe('g1');
    expect(body.samples[0].landmarkData[0]).toEqual([1, 2, 3]);
    expect(mockSamples[0].customSyncStatus).toBe('synced');
  });

  it('logs error and leaves samples pending on failure', async () => {
    (global as any).fetch = jest.fn(async () => ({ ok: false, status: 500, statusText: 'fail' }));
    await syncService.uploadPendingTrainingData();
    expect(mockLogger.error).toHaveBeenCalledWith('Failed to upload training data: 500 fail');
    expect(mockSamples[0].customSyncStatus).toBe('pending');
    expect(mockDatabase.write).not.toHaveBeenCalled();
  });
});

