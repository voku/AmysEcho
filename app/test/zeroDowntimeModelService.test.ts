import { zeroDowntimeModelService, ModelUpdateStatus, ModelVersion, DownloadAbortedError } from '../src/services/zeroDowntimeModelService';

// Mock fetch
global.fetch = jest.fn();

// Mock crypto.subtle
Object.defineProperty(window, 'crypto', {
  value: {
    subtle: {
      digest: jest.fn()
    }
  }
});

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

// Mock window.localStorage
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

// Mock logger
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('ZeroDowntimeModelService', () => {
  let service: typeof zeroDowntimeModelService;

  beforeEach(() => {
    // Reset the singleton instance for each test
    (zeroDowntimeModelService as any).currentModel = null;
    (zeroDowntimeModelService as any).pendingModel = null;
    (zeroDowntimeModelService as any).updateStatus = { status: 'idle', progress: 0, message: 'Ready' };
    (zeroDowntimeModelService as any).updateCallbacks = [];
    (zeroDowntimeModelService as any).isUpdating = false;
    (zeroDowntimeModelService as any).abortController = null;
    service = zeroDowntimeModelService;

    // Reset all mocks
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
    mockLocalStorage.setItem.mockImplementation(() => undefined);

    // Reset fetch mock
    (global.fetch as jest.Mock).mockClear();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = zeroDowntimeModelService;
      const instance2 = zeroDowntimeModelService;
      expect(instance1).toBe(instance2);
    });
  });

  describe('startBackgroundUpdate', () => {
    beforeEach(() => {
      // Mock successful fetch response
      const mockResponse = {
        ok: true,
        headers: new Map([['content-length', '1024']]),
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({ done: false, value: new Uint8Array(1024) })
              .mockResolvedValueOnce({ done: true, value: undefined })
          })
        }
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      // Mock crypto.subtle.digest
      (window.crypto.subtle.digest as jest.Mock).mockResolvedValue(new ArrayBuffer(32));
    });

    it('should start background update successfully', async () => {
      const result = await service.startBackgroundUpdate('http://example.com/model', 1024);

      expect(result).toBe(true);
      expect(service.getUpdateStatus().status).toBe('ready');
      expect(service.getPendingModel()).toBeDefined();
      expect(service.getPendingModel()?.size).toBe(1024);
    });

    it('should prevent concurrent updates', async () => {
      // Start first update
      const firstUpdate = service.startBackgroundUpdate('http://example.com/model1');

      // Try to start second update
      const secondUpdate = service.startBackgroundUpdate('http://example.com/model2');

      const result = await secondUpdate;
      expect(result).toBe(false);

      // Complete first update
      await firstUpdate;
    });

    it('should handle download failure', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await service.startBackgroundUpdate('http://example.com/model');

      expect(result).toBe(false);
      expect(service.getUpdateStatus().status).toBe('failed');
      expect(service.getUpdateStatus().message).toContain('Network error');
    });

    it('should handle validation failure', async () => {
      // Mock validation to fail
      const originalValidate = (service as any).validateModel;
      (service as any).validateModel = jest.fn().mockResolvedValue({
        valid: false,
        error: 'Invalid model format'
      });

      const result = await service.startBackgroundUpdate('http://example.com/model');

      expect(result).toBe(false);
      expect(service.getUpdateStatus().status).toBe('failed');
      expect(service.getUpdateStatus().message).toContain('Invalid model format');

      // Restore original method
      (service as any).validateModel = originalValidate;
    });

    it('should update progress during download', async () => {
      let progressUpdates: ModelUpdateStatus[] = [];
      const unsubscribe = service.onUpdateStatus((status) => {
        progressUpdates.push({ ...status });
      });

      await service.startBackgroundUpdate('http://example.com/model', 1024);

      expect(progressUpdates.length).toBeGreaterThan(1);
      expect(progressUpdates.some(update => update.status === 'downloading')).toBe(true);
      expect(progressUpdates.some(update => update.status === 'validating')).toBe(true);
      expect(progressUpdates.some(update => update.status === 'ready')).toBe(true);

      unsubscribe();
    });

    it('should handle cancellation during download', async () => {
      // Mock a slow download
      const mockReader = {
        read: jest
          .fn()
          .mockImplementationOnce(
            () =>
              new Promise(resolve =>
                setTimeout(
                  () => resolve({ done: false, value: new Uint8Array([1, 2, 3]) }),
                  100,
                ),
              ),
          )
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      const mockResponse = {
        ok: true,
        headers: new Map([['content-length', '1024000']]), // Large file
        body: { getReader: () => mockReader }
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const updatePromise = service.startBackgroundUpdate('http://example.com/model');

      // Cancel after a short delay
      setTimeout(() => service.cancelUpdate(), 50);

      const result = await updatePromise;
      expect(result).toBe(false);
      expect(service.getUpdateStatus().status).toBe('idle');
      expect(service.getUpdateStatus().message).toBe('Update cancelled');
    });
  });

  describe('activatePendingModel', () => {
    it('should activate pending model successfully', async () => {
      // Set up a pending model
      const pendingModel: ModelVersion = {
        id: 'test_model',
        timestamp: Date.now(),
        size: 1024,
        hash: 'test_hash',
        performanceMetrics: { accuracy: 0.9, latency: 50, memoryUsage: 1024 }
      };
      (service as any).pendingModel = pendingModel;

      // Set up current model
      const currentModel: ModelVersion = {
        id: 'old_model',
        timestamp: Date.now() - 1000,
        size: 512,
        hash: 'old_hash'
      };
      (service as any).currentModel = currentModel;

      const result = await service.activatePendingModel();

      expect(result).toBe(true);
      expect(service.getCurrentModel()?.id).toBe('test_model');
      expect(service.getPendingModel()).toBeNull();
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'amys_echo_current_model',
        expect.stringContaining('test_model')
      );
    });

    it('should return false when no pending model', async () => {
      const result = await service.activatePendingModel();
      expect(result).toBe(false);
    });

    it('should handle activation errors gracefully', async () => {
      const pendingModel: ModelVersion = {
        id: 'test_model',
        timestamp: Date.now(),
        size: 1024,
        hash: 'test_hash'
      };
      (service as any).pendingModel = pendingModel;

      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage full');
      });

      const result = await service.activatePendingModel();
      expect(result).toBe(true);
    });

    it('should cleanup old model in background', async () => {
      const pendingModel: ModelVersion = {
        id: 'new_model',
        timestamp: Date.now(),
        size: 1024,
        hash: 'new_hash'
      };
      (service as any).pendingModel = pendingModel;

      const oldModel: ModelVersion = {
        id: 'old_model',
        timestamp: Date.now() - 1000,
        size: 512,
        hash: 'old_hash'
      };
      (service as any).currentModel = oldModel;

      await service.activatePendingModel();

      // Wait for background cleanup
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'amys_echo_backup_model',
        expect.stringContaining('new_model')
      );
    });
  });

  describe('rollbackModel', () => {
    it('should rollback to backup model successfully', async () => {
      const backupModel: ModelVersion = {
        id: 'backup_model',
        timestamp: Date.now() - 2000,
        size: 512,
        hash: 'backup_hash'
      };

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(backupModel));

      // Set current model
      const currentModel: ModelVersion = {
        id: 'bad_model',
        timestamp: Date.now(),
        size: 1024,
        hash: 'bad_hash'
      };
      (service as any).currentModel = currentModel;

      const result = await service.rollbackModel();

      expect(result).toBe(true);
      expect(service.getCurrentModel()?.id).toBe('backup_model');
      expect(service.getPendingModel()).toBeNull();
    });

    it('should return false when no backup model available', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      const result = await service.rollbackModel();
      expect(result).toBe(false);
    });

    it('should handle rollback errors gracefully', async () => {
      mockLocalStorage.getItem.mockReturnValue('invalid json');

      const result = await service.rollbackModel();
      expect(result).toBe(false);
    });
  });

  describe('Status Tracking', () => {
    it('should track update status correctly', async () => {
      const statuses: ModelUpdateStatus[] = [];
      const unsubscribe = service.onUpdateStatus((status) => {
        statuses.push({ ...status });
      });

      // Mock successful update
      const mockResponse = {
        ok: true,
        headers: new Map([['content-length', '1024']]),
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({ done: false, value: new Uint8Array(1024) })
              .mockResolvedValueOnce({ done: true, value: undefined })
          })
        }
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
      (window.crypto.subtle.digest as jest.Mock).mockResolvedValue(new ArrayBuffer(32));

      await service.startBackgroundUpdate('http://example.com/model');

      expect(statuses.length).toBeGreaterThan(0);
      expect(statuses[statuses.length - 1].status).toBe('ready');
      expect(statuses[statuses.length - 1].progress).toBe(100);

      unsubscribe();
    });

    it('should handle callback errors gracefully', async () => {
      const errorCallback = jest.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });

      service.onUpdateStatus(errorCallback);

      // Trigger status update
      (service as any).updateStatus = { status: 'downloading', progress: 50, message: 'Test' };
      (service as any).notifyCallbacks();

      // Should not throw, should log warning
      expect(errorCallback).toHaveBeenCalled();
    });

    it('should allow unsubscribing from status updates', () => {
      const callback = jest.fn();
      const unsubscribe = service.onUpdateStatus(callback);

      // Trigger update
      (service as any).updateStatus = { status: 'downloading', progress: 50, message: 'Test' };
      (service as any).notifyCallbacks();

      expect(callback).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();

      // Trigger another update
      (service as any).updateStatus = { status: 'validating', progress: 75, message: 'Test' };
      (service as any).notifyCallbacks();

      expect(callback).toHaveBeenCalledTimes(1); // Should not be called again
    });
  });

  describe('Model Information', () => {
    it('should return current model info', () => {
      const model: ModelVersion = {
        id: 'current_model',
        timestamp: Date.now(),
        size: 1024,
        hash: 'current_hash'
      };
      (service as any).currentModel = model;

      const current = service.getCurrentModel();
      expect(current?.id).toBe('current_model');
    });

    it('should return pending model info', () => {
      const model: ModelVersion = {
        id: 'pending_model',
        timestamp: Date.now(),
        size: 2048,
        hash: 'pending_hash'
      };
      (service as any).pendingModel = model;

      const pending = service.getPendingModel();
      expect(pending?.id).toBe('pending_model');
    });

    it('should return null when no current/pending model', () => {
      expect(service.getCurrentModel()).toBeNull();
      expect(service.getPendingModel()).toBeNull();
    });
  });

  describe('Update Control', () => {
    it('should cancel ongoing update', async () => {
      // Mock a slow download
      const mockReader = {
        read: jest
          .fn()
          .mockImplementationOnce(
            () =>
              new Promise(resolve =>
                setTimeout(
                  () => resolve({ done: false, value: new Uint8Array([1, 2, 3]) }),
                  100,
                ),
              ),
          )
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      const mockResponse = {
        ok: true,
        headers: new Map([['content-length', '1024000']]),
        body: { getReader: () => mockReader }
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const updatePromise = service.startBackgroundUpdate('http://example.com/model');

      expect(service.isUpdateInProgress()).toBe(true);

      service.cancelUpdate();

      expect(service.isUpdateInProgress()).toBe(false);
      expect(service.getUpdateStatus().message).toBe('Update cancelled');
    });

    it('should handle cancel when no update in progress', () => {
      expect(() => service.cancelUpdate()).not.toThrow();
      expect(service.isUpdateInProgress()).toBe(false);
    });
  });

  describe('Private Methods', () => {
    describe('downloadModel', () => {
      it('should download model with progress tracking', async () => {
        const mockReader = {
          read: jest.fn()
            .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3, 4]) })
            .mockResolvedValueOnce({ done: false, value: new Uint8Array([5, 6, 7, 8]) })
            .mockResolvedValueOnce({ done: true, value: undefined })
        };

        const mockResponse = {
          ok: true,
          headers: new Map([['content-length', '8']]),
          body: { getReader: () => mockReader }
        };
        (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

        const result = await (service as any).downloadModel('http://example.com/model', 8);

        expect(result.byteLength).toBe(8);
        expect(new Uint8Array(result)).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
      });

      it('should handle download errors', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 404
        });

        await expect((service as any).downloadModel('http://example.com/model'))
          .rejects.toThrow('Download failed: 404');
      });

      it('should handle abort signal', async () => {
        const abortController = new AbortController();
        (service as any).abortController = abortController;

        const mockReader = {
          read: jest.fn().mockImplementationOnce(() => {
            abortController.abort();
            return Promise.resolve({ done: false, value: new Uint8Array([1, 2, 3]) });
          })
        };

        const mockResponse = {
          ok: true,
          headers: new Map([['content-length', '1024']]),
          body: { getReader: () => mockReader }
        };
        (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

        await expect((service as any).downloadModel('http://example.com/model'))
          .rejects.toThrow(DownloadAbortedError);
      });
    });

    describe('validateModel', () => {
      it('should validate correct model data', async () => {
        const modelData = new ArrayBuffer(2048); // Valid size

        const result = await (service as any).validateModel(modelData);

        expect(result.valid).toBe(true);
        expect(result.metrics).toBeDefined();
        expect(result.metrics?.accuracy).toBe(0.85);
        expect(result.metrics?.memoryUsage).toBe(2048);
      });

      it('should reject empty model data', async () => {
        const modelData = new ArrayBuffer(0);

        const result = await (service as any).validateModel(modelData);

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Model file is empty');
      });

      it('should reject model data that is too small', async () => {
        const modelData = new ArrayBuffer(512); // Less than 1024

        const result = await (service as any).validateModel(modelData);

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Model file too small');
      });

      it('should handle validation errors gracefully', async () => {
        const result = await (service as any).validateModel(undefined as any);

        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    describe('calculateHash', () => {
      it('should calculate SHA-256 hash', async () => {
        const mockHash = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
                                         17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]);
        (window.crypto.subtle.digest as jest.Mock).mockResolvedValue(mockHash.buffer);

        const data = new ArrayBuffer(1024);
        const hash = await (service as any).calculateHash(data);

        expect(hash).toBe('0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20');
        expect(window.crypto.subtle.digest).toHaveBeenCalledWith('SHA-256', data);
      });

      it('should fallback when crypto.subtle is not available', async () => {
        const originalDigest = window.crypto.subtle.digest;
        delete (window.crypto as any).subtle;

        const data = new ArrayBuffer(1024);
        const hash = await (service as any).calculateHash(data);

        expect(hash).toMatch(/^fallback_\d+_\d+$/);

        // Restore
        window.crypto.subtle = { digest: originalDigest };
      });
    });

    describe('estimateTimeRemaining', () => {
      it('should estimate time remaining correctly', () => {
        const received = 512;
        const total = 1024;
        (service as any).updateStatus.startTime = Date.now() - 1000; // 1 second elapsed

        const estimate = (service as any).estimateTimeRemaining(received, total);

        // At 512 bytes per second, should take ~1 second for remaining 512 bytes
        expect(estimate).toBeCloseTo(1000, 100); // Allow some tolerance
      });

      it('should return 0 for zero received', () => {
        const estimate = (service as any).estimateTimeRemaining(0, 1024);
        expect(estimate).toBe(0);
      });
    });

    describe('saveCurrentModel', () => {
      it('should save current model to localStorage', async () => {
        const model: ModelVersion = {
          id: 'test_model',
          timestamp: Date.now(),
          size: 1024,
          hash: 'test_hash'
        };
        (service as any).currentModel = model;

        await (service as any).saveCurrentModel();

        expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
          'amys_echo_current_model',
          JSON.stringify(model)
        );
      });

      it('should handle localStorage errors gracefully', async () => {
        mockLocalStorage.setItem.mockImplementation(() => {
          throw new Error('Storage quota exceeded');
        });

        const model: ModelVersion = {
          id: 'test_model',
          timestamp: Date.now(),
          size: 1024,
          hash: 'test_hash'
        };
        (service as any).currentModel = model;

        await (service as any).saveCurrentModel();

        // Should not throw, should log warning
        expect(mockLocalStorage.setItem).toHaveBeenCalled();
      });
    });

    describe('loadCurrentModel', () => {
      it('should load current model from localStorage', async () => {
        const model: ModelVersion = {
          id: 'loaded_model',
          timestamp: Date.now(),
          size: 1024,
          hash: 'loaded_hash'
        };

        mockLocalStorage.getItem.mockReturnValue(JSON.stringify(model));

        await (service as any).loadCurrentModel();

        expect(service.getCurrentModel()?.id).toBe('loaded_model');
      });

      it('should handle localStorage errors gracefully', async () => {
        mockLocalStorage.getItem.mockImplementation(() => {
          throw new Error('Storage access denied');
        });

        await (service as any).loadCurrentModel();

        expect(service.getCurrentModel()).toBeNull();
      });

      it('should handle invalid JSON gracefully', async () => {
        mockLocalStorage.getItem.mockReturnValue('invalid json');

        await (service as any).loadCurrentModel();

        expect(service.getCurrentModel()).toBeNull();
      });
    });

    describe('loadBackupModel', () => {
      it('should load backup model from localStorage', async () => {
        const backupModel: ModelVersion = {
          id: 'backup_model',
          timestamp: Date.now() - 2000,
          size: 512,
          hash: 'backup_hash'
        };

        mockLocalStorage.getItem.mockReturnValue(JSON.stringify(backupModel));

        const result = await (service as any).loadBackupModel();

        expect(result?.id).toBe('backup_model');
      });

      it('should return null when no backup model', async () => {
        mockLocalStorage.getItem.mockReturnValue(null);

        const result = await (service as any).loadBackupModel();

        expect(result).toBeNull();
      });
    });

    describe('cleanupOldModel', () => {
      it('should cleanup old model and save current as backup', async () => {
        const oldModel: ModelVersion = {
          id: 'old_model',
          timestamp: Date.now() - 2000,
          size: 512,
          hash: 'old_hash'
        };

        const currentModel: ModelVersion = {
          id: 'current_model',
          timestamp: Date.now(),
          size: 1024,
          hash: 'current_hash'
        };

        (service as any).currentModel = currentModel;

        await (service as any).cleanupOldModel(oldModel);

        expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
          'amys_echo_backup_model',
          JSON.stringify(currentModel)
        );
      });
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete update workflow', async () => {
      // Mock successful download and validation
      const mockResponse = {
        ok: true,
        headers: new Map([['content-length', '1024']]),
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({ done: false, value: new Uint8Array(1024) })
              .mockResolvedValueOnce({ done: true, value: undefined })
          })
        }
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
      (window.crypto.subtle.digest as jest.Mock).mockResolvedValue(new ArrayBuffer(32));

      // 1. Start background update
      const updateResult = await service.startBackgroundUpdate('http://example.com/model', 1024);
      expect(updateResult).toBe(true);
      expect(service.getPendingModel()).toBeDefined();

      // 2. Activate pending model
      const activateResult = await service.activatePendingModel();
      expect(activateResult).toBe(true);
      expect(service.getCurrentModel()).toBeDefined();
      expect(service.getPendingModel()).toBeNull();

      // 3. Verify persistence
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'amys_echo_current_model',
        expect.any(String)
      );
    });

    it('should handle update failure and recovery', async () => {
      // Mock failed download
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network timeout'));

      // Attempt update
      const updateResult = await service.startBackgroundUpdate('http://example.com/model');
      expect(updateResult).toBe(false);
      expect(service.getUpdateStatus().status).toBe('failed');

      // Should be able to try again
      const mockResponse = {
        ok: true,
        headers: new Map([['content-length', '1024']]),
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({ done: false, value: new Uint8Array(1024) })
              .mockResolvedValueOnce({ done: true, value: undefined })
          })
        }
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
      (window.crypto.subtle.digest as jest.Mock).mockResolvedValue(new ArrayBuffer(32));

      const retryResult = await service.startBackgroundUpdate('http://example.com/model');
      expect(retryResult).toBe(true);
    });

    it('should maintain service availability during updates', async () => {
      // Set up current model
      const currentModel: ModelVersion = {
        id: 'current_model',
        timestamp: Date.now(),
        size: 1024,
        hash: 'current_hash'
      };
      (service as any).currentModel = currentModel;

      // Mock slow update
      const mockResponse = {
        ok: true,
        headers: new Map([['content-length', '1024000']]),
        body: {
          getReader: () => {
            const read = jest
              .fn()
              .mockImplementationOnce(
                () =>
                  new Promise(resolve =>
                    setTimeout(
                      () => resolve({ done: false, value: new Uint8Array([1, 2, 3]) }),
                      100,
                    ),
                  ),
              )
              .mockResolvedValueOnce({ done: true, value: undefined });
            return { read };
          }
        }
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
      (window.crypto.subtle.digest as jest.Mock).mockResolvedValue(new ArrayBuffer(32));

      // Start update
      const updatePromise = service.startBackgroundUpdate('http://example.com/model');

      // Service should remain available during update
      expect(service.getCurrentModel()?.id).toBe('current_model');
      expect(service.isUpdateInProgress()).toBe(true);

      // Cancel update
      service.cancelUpdate();

      await updatePromise;

      // Service should still be available
      expect(service.getCurrentModel()?.id).toBe('current_model');
      expect(service.isUpdateInProgress()).toBe(false);
    });
  });
});