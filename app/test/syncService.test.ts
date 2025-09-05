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

jest.mock('../src/services/modelUpdate', () => ({
  refreshDgsModel: jest.fn(async () => 'centroid'),
}));

jest.mock('../src/telemetry/recorder', () => ({
  telemetry: { dump: jest.fn(async () => []) },
}));

jest.mock('../src/services/analytics', () => ({
  uploadTelemetry: jest.fn(async () => {})
}));

import { syncService } from '../src/services/syncService';
import { refreshDgsModel } from '../src/services/modelUpdate';
import { loadProfile } from '../src/storage';
import { telemetry } from '../src/telemetry/recorder';
import { uploadTelemetry } from '../src/services/analytics';

beforeEach(() => {
  jest.clearAllMocks();
  const sample: {
    landmarkData: string;
    gestureDefinition: { id: string };
    customSyncStatus: 'pending' | 'synced';
    update: jest.Mock;
  } = {
    landmarkData: JSON.stringify([
      { landmarks: [[[1, 2, 3]], []], handedness: ['Left', 'Right'] },
    ]),
    gestureDefinition: { id: 'g1' },
    customSyncStatus: 'pending',
    update: jest.fn(),
  };
  sample.update.mockImplementation((fn: (s: typeof sample) => void) => fn(sample));
  mockSamples = [sample];
  mockDatabase.get.mockReturnValue({
    query: jest.fn(() => ({ fetch: jest.fn().mockResolvedValue(mockSamples) })),
  });
  mockDatabase.write.mockImplementation(async (fn: any) => { await fn(); });
  (global as any).fetch = jest.fn(async () => ({ ok: true }));
  (telemetry.dump as jest.Mock).mockResolvedValue([]);
  (uploadTelemetry as jest.Mock).mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllTimers();
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
    expect(mockDatabase.write).toHaveBeenCalled();
    expect(refreshDgsModel).toHaveBeenCalledWith('p1');
  });

  it('logs error and leaves samples pending on failure', async () => {
    (global as any).fetch = jest.fn(async () => ({ ok: false, status: 500, statusText: 'fail' }));
    await syncService.uploadPendingTrainingData();
    expect(mockLogger.error).toHaveBeenCalledWith('Unexpected error uploading training data:', expect.any(Error));
    expect(mockSamples[0].customSyncStatus).toBe('pending');
    expect(mockDatabase.write).not.toHaveBeenCalled();
    expect(refreshDgsModel).not.toHaveBeenCalled();
  }, 10000);

  it('retries transient failures before succeeding', async () => {
    jest.useFakeTimers();
    (global as any).fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'fail' })
      .mockResolvedValueOnce({ ok: true });

    const uploadPromise = syncService.uploadPendingTrainingData();

    // Allow the first attempt to run and schedule the retry
    await Promise.resolve();
    await jest.runOnlyPendingTimersAsync();

    await uploadPromise;

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(mockSamples[0].customSyncStatus).toBe('synced');
  });

  it('prevents concurrent uploads', async () => {
    const spy = jest.spyOn(syncService as any, '_performUpload');
    const p1 = syncService.uploadPendingTrainingData();
    const p2 = syncService.uploadPendingTrainingData();
    await Promise.all([p1, p2]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith('Upload already in progress, skipping...');
    spy.mockRestore();
  });
});

describe('consent caching', () => {
  it('caches consent status with TTL', async () => {
    jest.useFakeTimers();
    mockSamples = [];
    mockDatabase.get.mockReturnValue({
      query: jest.fn(() => ({ fetch: jest.fn().mockResolvedValue([]) })),
    });

    await jest.isolateModulesAsync(async () => {
      const { syncService: freshSyncService } = require('../src/services/syncService');
      const { loadProfile: lp } = require('../src/storage');

      await freshSyncService.uploadPendingTrainingData();
      expect(lp).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(60 * 1000); // within TTL
      await freshSyncService.uploadPendingTrainingData();
      expect(lp).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(5 * 60 * 1000 + 1);
      await freshSyncService.uploadPendingTrainingData();
      expect(lp).toHaveBeenCalledTimes(2);
    });
  });
});

describe('telemetry sync', () => {
  it('uploads telemetry events even when no training data', async () => {
    mockSamples = [];
    mockDatabase.get.mockReturnValue({
      query: jest.fn(() => ({ fetch: jest.fn().mockResolvedValue([]) })),
    });
    (telemetry.dump as jest.Mock).mockResolvedValue([{ e: 1 }]);

    await syncService.uploadPendingTrainingData();
    expect(telemetry.dump).toHaveBeenCalled();
    expect(uploadTelemetry).toHaveBeenCalledWith([{ e: 1 }]);
  });
});

