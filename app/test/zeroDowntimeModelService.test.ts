let mockAsyncStorage: {
  setItem: jest.Mock;
  getItem: jest.Mock;
  removeItem: jest.Mock;
};

function mockCreateAsyncStorage() {
  return {
    setItem: jest.fn(),
    getItem: jest.fn(),
    removeItem: jest.fn(),
  };
}

function mockEnsureAsyncStorage() {
  if (!mockAsyncStorage) {
    mockAsyncStorage = mockCreateAsyncStorage();
  }
  return mockAsyncStorage;
}

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  get default() {
    return mockEnsureAsyncStorage();
  },
  set default(value: typeof mockAsyncStorage) {
    mockAsyncStorage = value;
  },
  get setItem() {
    return mockEnsureAsyncStorage().setItem;
  },
  get getItem() {
    return mockEnsureAsyncStorage().getItem;
  },
  get removeItem() {
    return mockEnsureAsyncStorage().removeItem;
  },
}));

const mockDownloadAsync = jest.fn();
const mockCancelAsync = jest.fn();
const mockReadAsStringAsync = jest.fn();
const mockDeleteAsync = jest.fn();
const mockGetInfoAsync = jest.fn();
let downloadProgressCallback:
  | ((progress: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void)
  | undefined;

const mockCreateDownloadResumable = jest.fn(
  (
    url: string,
    fileUri: string,
    _options: unknown,
    callback: (progress: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void,
  ) => {
    downloadProgressCallback = callback;
    return {
      downloadAsync: mockDownloadAsync,
      cancelAsync: mockCancelAsync,
    };
  },
);

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  cacheDirectory: '/mock-cache/',
  documentDirectory: '/mock-docs/',
  EncodingType: { Base64: 'base64' },
  createDownloadResumable: mockCreateDownloadResumable,
  readAsStringAsync: mockReadAsStringAsync,
  deleteAsync: mockDeleteAsync,
  getInfoAsync: mockGetInfoAsync,
  default: {
    cacheDirectory: '/mock-cache/',
    documentDirectory: '/mock-docs/',
    EncodingType: { Base64: 'base64' },
    createDownloadResumable: mockCreateDownloadResumable,
    readAsStringAsync: mockReadAsStringAsync,
    deleteAsync: mockDeleteAsync,
    getInfoAsync: mockGetInfoAsync,
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system/legacy';

import {
  zeroDowntimeModelService,
  ModelUpdateStatus,
  ModelVersion,
  DownloadAbortedError,
} from '../src/services/zeroDowntimeModelService';

const toBase64 = (bytes: number[]) => Buffer.from(bytes).toString('base64');

const flushPromises = async () => new Promise(resolve => setTimeout(resolve, 0));

const assignFileSystemMocks = () => {
  const overrides = {
    cacheDirectory: '/mock-cache/',
    documentDirectory: '/mock-docs/',
    EncodingType: { Base64: 'base64' },
    createDownloadResumable: mockCreateDownloadResumable,
    readAsStringAsync: mockReadAsStringAsync,
    deleteAsync: mockDeleteAsync,
    getInfoAsync: mockGetInfoAsync,
  };

  Object.assign(FileSystem as any, overrides);
  if ((FileSystem as any).default) {
    Object.assign((FileSystem as any).default, overrides);
  }
};

assignFileSystemMocks();

describe('ZeroDowntimeModelService (React Native implementation)', () => {
  let service: typeof zeroDowntimeModelService;

  beforeAll(() => {
    Object.defineProperty(global, 'crypto', {
      value: {
        subtle: {
          digest: jest.fn().mockResolvedValue(new ArrayBuffer(32)),
        },
      },
      writable: true,
    });
  });

  beforeEach(() => {
    service = zeroDowntimeModelService;

    (service as any).currentModel = null;
    (service as any).pendingModel = null;
    (service as any).updateStatus = { status: 'idle', progress: 0, message: 'Ready' };
    (service as any).updateCallbacks = [];
    (service as any).isUpdating = false;
    (service as any).abortController = null;
    (service as any).downloadStartTime = null;
    (service as any).currentDownloadTask = null;

    const storage = mockEnsureAsyncStorage();
    storage.setItem.mockReset();
    storage.getItem.mockReset();
    storage.removeItem.mockReset();

    storage.setItem.mockResolvedValue(undefined);
    storage.getItem.mockResolvedValue(null);
    storage.removeItem.mockResolvedValue(undefined);

    mockDownloadAsync.mockReset();
    mockCancelAsync.mockReset();
    mockReadAsStringAsync.mockReset();
    mockDeleteAsync.mockReset();
    mockGetInfoAsync.mockReset();
    mockCreateDownloadResumable.mockClear();
    mockCreateDownloadResumable.mockImplementation((
      _url: string,
      _fileUri: string,
      _options: unknown,
      callback: (progress: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void,
    ) => {
      downloadProgressCallback = callback;
      return {
        downloadAsync: mockDownloadAsync,
        cancelAsync: mockCancelAsync,
      };
    });

    mockDeleteAsync.mockResolvedValue(undefined);
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 1024 });
    mockCancelAsync.mockResolvedValue(undefined);
    downloadProgressCallback = undefined;
    assignFileSystemMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('startBackgroundUpdate', () => {
    const mockDownloadSuccess = (options?: { bytes?: number[]; expectedSize?: number }) => {
      const bytes = options?.bytes ?? new Array(1024).fill(1);
      const totalBytes = bytes.length;

      mockDownloadAsync.mockImplementation(async () => {
        if (downloadProgressCallback) {
          downloadProgressCallback({ totalBytesWritten: totalBytes, totalBytesExpectedToWrite: totalBytes });
        }
        return { uri: 'file://mock-model', status: 200 } as any;
      });

      mockReadAsStringAsync.mockResolvedValue(toBase64(bytes));
      if (options?.expectedSize) {
        mockGetInfoAsync.mockResolvedValue({ exists: true, size: options.expectedSize });
      }
    };

    it('downloads and prepares a model using FileSystem', async () => {
      mockDownloadSuccess();

      const result = await service.startBackgroundUpdate('http://example.com/model', 1024);

      expect(result).toBe(true);
      expect(mockDownloadAsync).toHaveBeenCalled();
      expect(mockReadAsStringAsync).toHaveBeenCalledWith('file://mock-model', {
        encoding: FileSystem.EncodingType.Base64,
      });
      expect(mockDeleteAsync).toHaveBeenCalledWith('file://mock-model', { idempotent: true });
      const storage = mockEnsureAsyncStorage();
      const pendingCall = storage.setItem.mock.calls.find(([key]) => key === 'amys_echo_pending_model');
      expect(pendingCall).toBeDefined();
      const pendingStored = JSON.parse(pendingCall![1]);
      expect(pendingStored.id).toContain('model_');
      expect(service.getUpdateStatus().status).toBe('ready');
      expect(service.getPendingModel()).not.toBeNull();
      expect(service.getPendingModel()?.size).toBe(1024);
    });

    it('prevents concurrent updates', async () => {
      mockDownloadSuccess();

      mockDownloadAsync.mockImplementationOnce(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return { uri: 'file://mock-model', status: 200 } as any;
      });

      const first = service.startBackgroundUpdate('http://example.com/model');
      const second = await service.startBackgroundUpdate('http://example.com/other');

      expect(second).toBe(false);
      await first;
    });

    it('handles download failures gracefully', async () => {
      const error = new Error('network error');
      mockDownloadAsync.mockRejectedValue(error);

      const result = await service.startBackgroundUpdate('http://example.com/model');

      expect(result).toBe(false);
      expect(service.getUpdateStatus().status).toBe('failed');
      expect(service.getUpdateStatus().message).toContain('network error');
    });

    it('rejects non-successful HTTP responses', async () => {
      mockDownloadAsync.mockResolvedValue({ uri: 'file://mock-model', status: 404 } as any);

      const result = await service.startBackgroundUpdate('http://example.com/model');

      expect(result).toBe(false);
      expect(service.getUpdateStatus().status).toBe('failed');
      expect(service.getUpdateStatus().message).toContain('status 404');
      expect(mockReadAsStringAsync).not.toHaveBeenCalled();
      expect(mockDeleteAsync).toHaveBeenCalledWith('file://mock-model', { idempotent: true });
    });

    it('handles validation failures', async () => {
      mockDownloadSuccess({ bytes: new Array(512).fill(0) });

      const result = await service.startBackgroundUpdate('http://example.com/model');

      expect(result).toBe(false);
      expect(service.getUpdateStatus().status).toBe('failed');
      expect(service.getUpdateStatus().message).toContain('Model file too small');
    });

    it('tracks progress with elapsed time estimation', async () => {
      mockDownloadAsync.mockImplementation(async () => {
        if (downloadProgressCallback) {
          downloadProgressCallback({ totalBytesWritten: 512, totalBytesExpectedToWrite: 1024 });
        }
        return { uri: 'file://mock-model', status: 200 } as any;
      });
      mockReadAsStringAsync.mockResolvedValue(toBase64(new Array(1024).fill(1)));

      const statuses: ModelUpdateStatus[] = [];
      const unsubscribe = service.onUpdateStatus(status => statuses.push({ ...status }));

      await service.startBackgroundUpdate('http://example.com/model', 1024);

      expect(statuses.some(status => status.status === 'downloading')).toBe(true);
      const downloadingStatus = statuses.find(status => status.status === 'downloading');
      expect(downloadingStatus?.estimatedTimeRemaining).toBeGreaterThanOrEqual(0);
      unsubscribe();
    });

    it('supports cancellation', async () => {
      let rejectDownload: ((error?: unknown) => void) | undefined;
      mockDownloadAsync.mockImplementation(() => new Promise((_resolve, reject) => {
        rejectDownload = reject;
      }));

      const updatePromise = service.startBackgroundUpdate('http://example.com/model');
      await flushPromises();

      service.cancelUpdate();
      rejectDownload?.(new DownloadAbortedError());

      const result = await updatePromise;

      expect(result).toBe(false);
      expect(mockCancelAsync).toHaveBeenCalled();
      expect(service.getUpdateStatus().status).toBe('idle');
    });
  });

  describe('activatePendingModel', () => {
    it('activates pending model and persists metadata', async () => {
      const pending: ModelVersion = {
        id: 'pending-model',
        timestamp: Date.now(),
        size: 2048,
        hash: 'hash',
      };
      (service as any).pendingModel = pending;

      const result = await service.activatePendingModel();

      expect(result).toBe(true);
      expect(service.getCurrentModel()).toEqual(expect.objectContaining({ id: 'pending-model' }));
      const storage = mockEnsureAsyncStorage();
      const savedCurrentCall = storage.setItem.mock.calls.find(([key]) => key === 'amys_echo_current_model');
      expect(savedCurrentCall).toBeDefined();
      const savedCurrent = JSON.parse(savedCurrentCall![1]);
      expect(savedCurrent).toEqual(expect.objectContaining({ id: 'pending-model' }));
      expect(storage.removeItem).toHaveBeenCalledWith('amys_echo_pending_model');
    });

    it('returns false when no pending model', async () => {
      const result = await service.activatePendingModel();
      expect(result).toBe(false);
    });
  });

  describe('rollbackModel', () => {
    it('restores from backup metadata', async () => {
      const backup: ModelVersion = {
        id: 'backup-model',
        timestamp: Date.now(),
        size: 512,
        hash: 'backup-hash',
      };
      const storage = mockEnsureAsyncStorage();
      storage.getItem.mockImplementation(async (key: string) => {
        if (key === 'amys_echo_backup_model') {
          return JSON.stringify(backup);
        }
        return null;
      });

      const result = await service.rollbackModel();

      expect(result).toBe(true);
      expect(service.getCurrentModel()?.id).toBe('backup-model');
      const savedCurrentCall = storage.setItem.mock.calls.find(([key]) => key === 'amys_echo_current_model');
      expect(savedCurrentCall).toBeDefined();
      const savedCurrent = JSON.parse(savedCurrentCall![1]);
      expect(savedCurrent).toEqual(expect.objectContaining({ id: 'backup-model' }));
    });
  });

  describe('persistence helpers', () => {
    it('loads persisted current and pending models', async () => {
      const current: ModelVersion = {
        id: 'current-model',
        timestamp: Date.now(),
        size: 256,
        hash: 'current-hash',
      };
      const pending: ModelVersion = {
        id: 'pending-model',
        timestamp: Date.now(),
        size: 512,
        hash: 'pending-hash',
      };

      const storage = mockEnsureAsyncStorage();
      storage.getItem.mockImplementation(async (key: string) => {
        if (key === 'amys_echo_current_model') {
          return JSON.stringify(current);
        }
        if (key === 'amys_echo_pending_model') {
          return JSON.stringify(pending);
        }
        return null;
      });

      await (service as any).loadCurrentModel();

      expect(service.getCurrentModel()).toEqual(current);
      expect(service.getPendingModel()).toEqual(pending);
    });

    it('loads backup model metadata', async () => {
      const backup: ModelVersion = {
        id: 'backup-model',
        timestamp: Date.now(),
        size: 1024,
        hash: 'backup',
      };
      mockEnsureAsyncStorage().getItem.mockResolvedValueOnce(JSON.stringify(backup));

      const result = await (service as any).loadBackupModel();

      expect(result).toEqual(backup);
    });

    it('saves backup model during cleanup', async () => {
      const current: ModelVersion = {
        id: 'current-model',
        timestamp: Date.now(),
        size: 512,
        hash: 'hash',
      };
      (service as any).currentModel = current;

      await (service as any).cleanupOldModel({
        id: 'old',
        timestamp: Date.now() - 1000,
        size: 256,
        hash: 'old-hash',
      });

      expect(mockEnsureAsyncStorage().setItem).toHaveBeenCalledWith(
        'amys_echo_backup_model',
        JSON.stringify(current),
      );
    });
  });

  describe('private helpers', () => {
    it('downloads a model file and returns its bytes', async () => {
      const bytes = [1, 2, 3, 4];
      mockDownloadAsync.mockImplementation(async () => {
        if (downloadProgressCallback) {
          downloadProgressCallback({ totalBytesWritten: 4, totalBytesExpectedToWrite: 4 });
        }
        return { uri: 'file://mock-model', status: 200 } as any;
      });
      mockReadAsStringAsync.mockResolvedValue(toBase64(bytes));

      const result = await (service as any).downloadModel('http://example.com/model', 4);

      expect(Array.from(new Uint8Array(result))).toEqual(bytes);
    });

    it('throws DownloadAbortedError when cancelled during download', async () => {
      let rejectDownload: (error: unknown) => void = () => {};
      mockDownloadAsync.mockImplementation(() => new Promise((_resolve, reject) => {
        rejectDownload = reject;
      }));

      (service as any).abortController = new AbortController();
      const downloadPromise = (service as any).downloadModel('http://example.com/model');
      await flushPromises();

      (service as any).abortController.abort();
      rejectDownload(new Error('cancelled'));

      await expect(downloadPromise).rejects.toBeInstanceOf(DownloadAbortedError);
    });

    it('estimates remaining time based on tracked start time', () => {
      (service as any).downloadStartTime = Date.now() - 1000;
      const estimate = (service as any).estimateTimeRemaining(512, 1024);
      expect(estimate).toBeGreaterThan(0);
    });
  });
});
