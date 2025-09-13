import { preCachedResponseService, CachedResponse } from '../src/services/preCachedResponseService';

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
    debug: jest.fn(),
  },
}));

// Mock setInterval and clearInterval for maintenance loop
jest.useFakeTimers();

describe('PreCachedResponseService', () => {
  let service: typeof preCachedResponseService;

  beforeEach(() => {
    // Reset the singleton instance for each test
    (preCachedResponseService as any).responseCache.clear();
    (preCachedResponseService as any).currentCacheSize = 0;
    (preCachedResponseService as any).cacheStats = { hits: 0, misses: 0, totalRequests: 0 };
    (preCachedResponseService as any).MAX_CACHE_SIZE = 50 * 1024 * 1024;
    (preCachedResponseService as any).MAX_CACHE_ENTRIES = 100;
    service = preCachedResponseService;

    // Reset all mocks
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
    mockLocalStorage.setItem.mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = preCachedResponseService;
      const instance2 = preCachedResponseService;
      expect(instance1).toBe(instance2);
    });
  });

  describe('getCachedResponse', () => {
    it('should return cached response for known gesture', async () => {
      await service.cacheResponse('hello', 'Hello there!');

      const response = service.getCachedResponse('hello');

      expect(response).toBeDefined();
      expect(response?.gesture).toBe('hello');
      expect(response?.response).toBe('Hello there!');
      expect(response?.useCount).toBe(1);
      expect(response?.lastUsed).toBeDefined();
    });

    it('should return null for unknown gesture', () => {
      const response = service.getCachedResponse('unknown_gesture');
      expect(response).toBeNull();
    });

    it('should normalize gesture names', async () => {
      await service.cacheResponse('Hello World!', 'Hello there!');

      const response1 = service.getCachedResponse('hello world!');
      const response2 = service.getCachedResponse('HELLO_WORLD_');

      expect(response1?.gesture).toBe('hello_world_');
      expect(response2?.gesture).toBe('hello_world_');
    });

    it('should update usage statistics', async () => {
      await service.cacheResponse('test_gesture', 'Test response');

      // First access
      service.getCachedResponse('test_gesture');
      let response = service.getCachedResponse('test_gesture');
      expect(response?.useCount).toBe(2);

      // Second access
      service.getCachedResponse('test_gesture');
      response = service.getCachedResponse('test_gesture');
      expect(response?.useCount).toBe(4);
    });

    it('should track cache hit/miss statistics', async () => {
      await service.cacheResponse('cached_gesture', 'Cached response');

      // Hit
      service.getCachedResponse('cached_gesture');

      // Miss
      service.getCachedResponse('uncached_gesture');

      const stats = service.getCacheStats();
      expect(stats.cacheHitRate).toBe(0.5); // 1 hit out of 2 requests
    });

    it('should update lastUsed timestamp on access', async () => {
      await service.cacheResponse('timestamp_test', 'Test response');

      const beforeAccess = Date.now();
      service.getCachedResponse('timestamp_test');
      const afterAccess = Date.now();

      const response = (service as any).responseCache.get('timestamp_test');
      expect(response.lastUsed).toBeGreaterThanOrEqual(beforeAccess);
      expect(response.lastUsed).toBeLessThanOrEqual(afterAccess);
    });
  });

  describe('cacheResponse', () => {
    it('should cache response with default text', async () => {
      const result = await service.cacheResponse('hallo');

      expect(result).toBe(true);
      const response = service.getCachedResponse('hallo');
      expect(response?.response).toBe('Hallo! Schön dich zu sehen!');
    });

    it('should cache response with custom text', async () => {
      const result = await service.cacheResponse('custom', 'Custom response text');

      expect(result).toBe(true);
      const response = service.getCachedResponse('custom');
      expect(response?.response).toBe('Custom response text');
    });

    it('should calculate and track cache size', async () => {
      await service.cacheResponse('size_test', 'This is a test response');

      const response = (service as any).responseCache.get('size_test');
      expect(response.size).toBeGreaterThan(0);
      expect((service as any).currentCacheSize).toBe(response.size);
    });

    it('should handle caching errors gracefully', async () => {
      // Mock an error in caching
      const originalCache = (service as any).responseCache.set;
      (service as any).responseCache.set = jest.fn().mockImplementation(() => {
        throw new Error('Cache error');
      });

      const result = await service.cacheResponse('error_test', 'Test response');

      expect(result).toBe(false);

      // Restore original method
      (service as any).responseCache.set = originalCache;
    });

    it('should normalize gesture names when caching', async () => {
      await service.cacheResponse('Test Gesture!', 'Test response');

      const cached = (service as any).responseCache.get('test_gesture_');
      expect(cached).toBeDefined();
      expect(cached.gesture).toBe('test_gesture_');
    });
  });

  describe('Cache Size Management', () => {
    it('should evict LRU entries when cache is full', async () => {
      // Set a very small cache size for testing
      (service as any).MAX_CACHE_SIZE = 100;

      // Add entries that exceed cache size
      await service.cacheResponse('first', 'Short response'); // ~30 bytes
      await service.cacheResponse('second', 'This is a much longer response that will exceed cache size'); // ~70+ bytes

      // First entry should be evicted
      expect((service as any).responseCache.has('first')).toBe(false);
      expect((service as any).responseCache.has('second')).toBe(true);
    });

    it('should evict entries when exceeding max entries', async () => {
      // Set small max entries for testing
      (service as any).MAX_CACHE_ENTRIES = 2;

      await service.cacheResponse('first', 'Response 1');
      await service.cacheResponse('second', 'Response 2');
      await service.cacheResponse('third', 'Response 3'); // Should trigger eviction

      expect((service as any).responseCache.size).toBe(2);
      expect((service as any).responseCache.has('first')).toBe(false); // LRU evicted
      expect((service as any).responseCache.has('second')).toBe(true);
      expect((service as any).responseCache.has('third')).toBe(true);
    });

    it('should evict based on recency', async () => {
      (service as any).MAX_CACHE_ENTRIES = 2;

      await service.cacheResponse('first', 'Response 1');
      jest.advanceTimersByTime(1);
      await service.cacheResponse('second', 'Response 2');
      jest.advanceTimersByTime(1);

      // Access first to make it more recent
      service.getCachedResponse('first');
      jest.advanceTimersByTime(1);

      await service.cacheResponse('third', 'Response 3'); // Should evict second (least recently used)

      expect((service as any).responseCache.has('first')).toBe(true);
      expect((service as any).responseCache.has('second')).toBe(false);
      expect((service as any).responseCache.has('third')).toBe(true);
    });
  });

  describe('getCacheStats', () => {
    it('should return correct statistics', async () => {
      await service.cacheResponse('gesture1', 'Response 1');
      await service.cacheResponse('gesture2', 'Response 2');

      // Generate some usage
      service.getCachedResponse('gesture1'); // hit
      service.getCachedResponse('gesture1'); // hit
      service.getCachedResponse('unknown'); // miss

      const stats = service.getCacheStats();

      expect(stats.totalResponses).toBe(2);
      expect(stats.cacheHitRate).toBe(2/3); // 2 hits out of 3 requests
      expect(stats.totalSize).toBeGreaterThan(0);
      expect(stats.averageResponseTime).toBe(10);
      expect(stats.mostUsedGesture).toBe('gesture1');
    });

    it('should handle empty cache', () => {
      const stats = service.getCacheStats();

      expect(stats.totalResponses).toBe(0);
      expect(stats.cacheHitRate).toBe(0);
      expect(stats.totalSize).toBe(0);
      expect(stats.mostUsedGesture).toBe('');
    });

    it('should identify most used gesture', async () => {
      await service.cacheResponse('rare', 'Rare response');
      await service.cacheResponse('popular', 'Popular response');

      // Access popular gesture multiple times
      service.getCachedResponse('popular');
      service.getCachedResponse('popular');
      service.getCachedResponse('popular');

      // Access rare gesture once
      service.getCachedResponse('rare');

      const stats = service.getCacheStats();
      expect(stats.mostUsedGesture).toBe('popular');
    });
  });

  describe('clearCache', () => {
    it('should clear all cached responses', async () => {
      await service.cacheResponse('gesture1', 'Response 1');
      await service.cacheResponse('gesture2', 'Response 2');

      expect((service as any).responseCache.size).toBe(2);
      expect((service as any).currentCacheSize).toBeGreaterThan(0);

      service.clearCache();

      expect((service as any).responseCache.size).toBe(0);
      expect((service as any).currentCacheSize).toBe(0);
      expect((service as any).cacheStats.hits).toBe(0);
      expect((service as any).cacheStats.misses).toBe(0);
      expect((service as any).cacheStats.totalRequests).toBe(0);
    });
  });

  describe('warmUpCache', () => {
    it('should cache predicted gestures', async () => {
      const predictedGestures = ['predicted1', 'predicted2', 'predicted3'];

      await service.warmUpCache(predictedGestures);

      expect(service.isGestureCached('predicted1')).toBe(true);
      expect(service.isGestureCached('predicted2')).toBe(true);
      expect(service.isGestureCached('predicted3')).toBe(true);
    });

    it('should limit number of gestures to warm up', async () => {
      const manyPredictedGestures = Array.from({ length: 15 }, (_, i) => `gesture${i}`);

      await service.warmUpCache(manyPredictedGestures);

      // Should only cache first 10
      expect((service as any).responseCache.size).toBe(10);
      expect(service.isGestureCached('gesture0')).toBe(true);
      expect(service.isGestureCached('gesture9')).toBe(true);
      expect(service.isGestureCached('gesture10')).toBe(false);
    });

    it('should not re-cache already cached gestures', async () => {
      await service.cacheResponse('already_cached', 'Already cached');

      const predictedGestures = ['already_cached', 'new_gesture'];
      await service.warmUpCache(predictedGestures);

      // Should only add the new gesture
      expect((service as any).responseCache.size).toBe(2);
      expect(service.isGestureCached('already_cached')).toBe(true);
      expect(service.isGestureCached('new_gesture')).toBe(true);
    });
  });

  describe('getCachedGestures', () => {
    it('should return all cached gesture names', async () => {
      await service.cacheResponse('gesture1', 'Response 1');
      await service.cacheResponse('gesture2', 'Response 2');
      await service.cacheResponse('gesture3', 'Response 3');

      const cachedGestures = service.getCachedGestures();

      expect(cachedGestures).toHaveLength(3);
      expect(cachedGestures).toContain('gesture1');
      expect(cachedGestures).toContain('gesture2');
      expect(cachedGestures).toContain('gesture3');
    });

    it('should return empty array when cache is empty', () => {
      const cachedGestures = service.getCachedGestures();
      expect(cachedGestures).toEqual([]);
    });
  });

  describe('isGestureCached', () => {
    it('should return true for cached gestures', async () => {
      await service.cacheResponse('cached_gesture', 'Cached response');

      expect(service.isGestureCached('cached_gesture')).toBe(true);
    });

    it('should return false for non-cached gestures', () => {
      expect(service.isGestureCached('not_cached')).toBe(false);
    });

    it('should handle gesture normalization', async () => {
      await service.cacheResponse('Test Gesture!', 'Test response');

      expect(service.isGestureCached('test gesture!')).toBe(true);
      expect(service.isGestureCached('TEST_GESTURE_')).toBe(true);
    });
  });

  describe('preCacheCommonResponses', () => {
    it('should pre-cache common gestures', async () => {
      await (service as any).preCacheCommonResponses();

      const commonGestures = (service as any).COMMON_GESTURES;
      expect(commonGestures.length).toBeGreaterThan(0);

      // Check that some common gestures are cached
      expect(service.isGestureCached('hallo')).toBe(true);
      expect(service.isGestureCached('danke')).toBe(true);
      expect(service.isGestureCached('ja')).toBe(true);
    });

    it('should not re-cache already cached common gestures', async () => {
      // Pre-cache one gesture manually
      await service.cacheResponse('hallo', 'Custom hello');

      await (service as any).preCacheCommonResponses();

      // Should still have the custom response
      const response = service.getCachedResponse('hallo');
      expect(response?.response).toBe('Custom hello');
    });
  });

  describe('Private Methods', () => {
    describe('generateDefaultResponse', () => {
      it('should generate correct default responses for common gestures', () => {
        expect((service as any).generateDefaultResponse('hallo')).toBe('Hallo! Schön dich zu sehen!');
        expect((service as any).generateDefaultResponse('danke')).toBe('Bitte! Gern geschehen!');
        expect((service as any).generateDefaultResponse('ja')).toBe('Ja, genau!');
        expect((service as any).generateDefaultResponse('help')).toBe('I\'ll help you! What do you need?');
      });

      it('should generate fallback response for unknown gestures', () => {
        expect((service as any).generateDefaultResponse('unknown_gesture')).toBe('unknown_gesture!');
      });

      it('should handle normalized gestures', () => {
        expect((service as any).generateDefaultResponse('HALLO')).toBe('Hallo! Schön dich zu sehen!');
        expect((service as any).generateDefaultResponse('  hallo  ')).toBe('Hallo! Schön dich zu sehen!');
      });
    });

    describe('normalizeGesture', () => {
      it('should normalize gesture names correctly', () => {
        expect((service as any).normalizeGesture('Hello World!')).toBe('hello_world_');
        expect((service as any).normalizeGesture('TEST-GESTURE')).toBe('test_gesture');
        expect((service as any).normalizeGesture('  spaced  ')).toBe('spaced');
        expect((service as any).normalizeGesture('MixedCase')).toBe('mixedcase');
      });

      it('should handle empty and special characters', () => {
        expect((service as any).normalizeGesture('')).toBe('');
        expect((service as any).normalizeGesture('!@#$%^&*()')).toBe('__________');
        expect((service as any).normalizeGesture('a1b2c3')).toBe('a1b2c3');
      });
    });

    describe('evictLeastRecentlyUsed', () => {
      it('should evict oldest entries first', async () => {
        jest.useRealTimers();
        // Add entries with different timestamps
        await service.cacheResponse('oldest', 'Oldest');
        await new Promise(resolve => setTimeout(resolve, 10));
        await service.cacheResponse('middle', 'Middle');
        await new Promise(resolve => setTimeout(resolve, 10));
        await service.cacheResponse('newest', 'Newest');

        // Manually set timestamps to control order
        const oldestEntry = (service as any).responseCache.get('oldest');
        const middleEntry = (service as any).responseCache.get('middle');
        const newestEntry = (service as any).responseCache.get('newest');

        oldestEntry.lastUsed = Date.now() - 3000;
        middleEntry.lastUsed = Date.now() - 2000;
        newestEntry.lastUsed = Date.now() - 1000;

        // Force eviction by setting small limits
        (service as any).MAX_CACHE_ENTRIES = 2;
        await service.cacheResponse('trigger_eviction', 'Trigger');

        expect((service as any).responseCache.has('oldest')).toBe(false); // Should be evicted
        expect((service as any).responseCache.has('middle')).toBe(true);
        expect((service as any).responseCache.has('newest')).toBe(true);
        expect((service as any).responseCache.has('trigger_eviction')).toBe(true);
        jest.useFakeTimers();
      });

      it('should evict until required space is available', async () => {
        (service as any).MAX_CACHE_SIZE = 50;

        await service.cacheResponse('small1', 'x'); // Small entry
        await service.cacheResponse('small2', 'x'); // Small entry
        await service.cacheResponse('large', 'This is a very large response that will exceed the cache size limit when added');

        expect((service as any).responseCache.has('small1')).toBe(false); // Should be evicted to make space
        expect((service as any).responseCache.has('small2')).toBe(false);
        expect((service as any).responseCache.has('large')).toBe(true);
      });
    });

    describe('loadPersistentCache', () => {
      it('should load cached responses from localStorage', async () => {
        const storedCache = {
          gesture1: {
            gesture: 'gesture1',
            response: 'Stored response 1',
            lastUsed: Date.now(),
            useCount: 5,
            size: 100
          },
          gesture2: {
            gesture: 'gesture2',
            response: 'Stored response 2',
            lastUsed: Date.now(),
            useCount: 3,
            size: 80
          }
        };

        mockLocalStorage.getItem.mockReturnValue(JSON.stringify(storedCache));

        await (service as any).loadPersistentCache();

        expect((service as any).responseCache.size).toBe(2);
        expect(service.getCachedResponse('gesture1')?.response).toBe('Stored response 1');
        expect(service.getCachedResponse('gesture2')?.response).toBe('Stored response 2');
        expect((service as any).currentCacheSize).toBe(180);
      });

      it('should filter out old entries', async () => {
        const now = Date.now();
        const storedCache = {
          recent: {
            gesture: 'recent',
            response: 'Recent response',
            lastUsed: now - (2 * 60 * 60 * 1000), // 2 hours ago
            useCount: 1,
            size: 50
          },
          old: {
            gesture: 'old',
            response: 'Old response',
            lastUsed: now - (25 * 60 * 60 * 1000), // 25 hours ago
            useCount: 1,
            size: 40
          }
        };

        mockLocalStorage.getItem.mockReturnValue(JSON.stringify(storedCache));

        await (service as any).loadPersistentCache();

        expect((service as any).responseCache.size).toBe(1);
        expect(service.isGestureCached('recent')).toBe(true);
        expect(service.isGestureCached('old')).toBe(false);
      });

      it('should handle localStorage errors gracefully', async () => {
        mockLocalStorage.getItem.mockImplementation(() => {
          throw new Error('Storage error');
        });

        await (service as any).loadPersistentCache();

        expect((service as any).responseCache.size).toBe(0);
      });

      it('should handle invalid JSON gracefully', async () => {
        mockLocalStorage.getItem.mockReturnValue('invalid json');

        await (service as any).loadPersistentCache();

        expect((service as any).responseCache.size).toBe(0);
      });
    });

    describe('savePersistentCache', () => {
      it('should save cache to localStorage', async () => {
        await service.cacheResponse('test_gesture', 'Test response');

        await (service as any).savePersistentCache();

        expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
          'amys_echo_response_cache',
          expect.stringContaining('test_gesture')
        );
      });

      it('should handle localStorage errors gracefully', async () => {
        mockLocalStorage.setItem.mockImplementation(() => {
          throw new Error('Storage full');
        });

        await (service as any).savePersistentCache();

        // Should not throw
        expect(mockLocalStorage.setItem).toHaveBeenCalled();
      });
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete cache lifecycle', async () => {
      // 1. Cache some responses
      await service.cacheResponse('lifecycle1', 'Response 1');
      await service.cacheResponse('lifecycle2', 'Response 2');

      expect(service.getCachedGestures()).toHaveLength(2);

      // 2. Use some responses
      service.getCachedResponse('lifecycle1');
      service.getCachedResponse('lifecycle1');
      service.getCachedResponse('lifecycle2');

      // 3. Check statistics
      const stats = service.getCacheStats();
      expect(stats.totalResponses).toBe(2);
      expect(stats.mostUsedGesture).toBe('lifecycle1');

      // 4. Warm up with predictions
      await service.warmUpCache(['lifecycle3', 'lifecycle4']);
      expect(service.getCachedGestures()).toHaveLength(4);

      // 5. Clear cache
      service.clearCache();
      expect(service.getCachedGestures()).toHaveLength(0);
    });

    it('should maintain cache integrity under load', async () => {
      // Simulate high load with many cache operations
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(service.cacheResponse(`load_test_${i}`, `Response ${i}`));
      }

      await Promise.all(promises);

      // Cache should respect size limits
      expect((service as any).responseCache.size).toBeLessThanOrEqual(20);
      expect((service as any).currentCacheSize).toBeLessThanOrEqual((service as any).MAX_CACHE_SIZE);

      // All operations should have succeeded
      promises.forEach(promise => {
        expect(promise).resolves.toBe(true);
      });
    });

    it('should handle concurrent access correctly', async () => {
      jest.useRealTimers();
      await service.cacheResponse('concurrent', 'Base response');

      // Simulate concurrent access
      const accessPromises = [];
      for (let i = 0; i < 10; i++) {
        accessPromises.push(
          new Promise(resolve => {
            setTimeout(() => {
              service.getCachedResponse('concurrent');
              resolve(undefined);
            }, Math.random() * 10);
          })
        );
      }

      await Promise.all(accessPromises);

      const response = service.getCachedResponse('concurrent');
      expect(response?.useCount).toBe(11); // 1 initial + 10 concurrent accesses
      jest.useFakeTimers();
    });
  });

  describe('Error Handling', () => {
    it('should handle undefined window.localStorage', () => {
      const originalLocalStorage = window.localStorage;
      delete (window as any).localStorage;

      expect(() => service.getCachedResponse('test')).not.toThrow();
      expect(() => service.clearCache()).not.toThrow();

      // Restore
      window.localStorage = originalLocalStorage;
    });

    it('should handle malformed cache entries gracefully', async () => {
      const malformedCache = {
        valid_entry: {
          gesture: 'valid_entry',
          response: 'Valid response',
          lastUsed: Date.now(),
          useCount: 1,
          size: 50
        },
        malformed_entry: {
          // Missing required fields
          gesture: 'malformed_entry'
        }
      };

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(malformedCache));

      await (service as any).loadPersistentCache();

      // Should only load the valid entry
      expect((service as any).responseCache.size).toBe(1);
      expect(service.isGestureCached('valid_entry')).toBe(true);
      expect(service.isGestureCached('malformed_entry')).toBe(false);
    });

    it('should handle extremely long gesture names', async () => {
      const longGesture = 'a'.repeat(1000);
      const result = await service.cacheResponse(longGesture, 'Response');

      expect(result).toBe(true);
      expect(service.isGestureCached(longGesture)).toBe(true);
    });

    it('should handle empty responses', async () => {
      const result = await service.cacheResponse('empty_response', '');

      expect(result).toBe(true);
      const response = service.getCachedResponse('empty_response');
      expect(response?.response).toBe('');
    });
  });
});