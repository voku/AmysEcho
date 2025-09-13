import { logger } from '../utils/logger';

export interface CachedResponse {
  gesture: string;
  response: string;
  audioData?: ArrayBuffer;
  lastUsed: number;
  useCount: number;
  size: number; // in bytes
}

export interface CacheStats {
  totalResponses: number;
  cacheHitRate: number;
  totalSize: number;
  averageResponseTime: number;
  mostUsedGesture: string;
}

class PreCachedResponseService {
  private static instance: PreCachedResponseService;
  private responseCache: Map<string, CachedResponse> = new Map();
  private MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB
  private MAX_CACHE_ENTRIES = 100;
  private currentCacheSize = 0;
  private cacheStats = {
    hits: 0,
    misses: 0,
    totalRequests: 0
  };

  // Most common gestures that should be pre-cached
  private readonly COMMON_GESTURES = [
    'hallo', 'hello', 'tschüss', 'bye', 'danke', 'thank_you',
    'bitte', 'please', 'ja', 'yes', 'nein', 'no',
    'essen', 'eat', 'trinken', 'drink', 'hilfe', 'help',
    'mehr', 'more', 'fertig', 'finished', 'stop', 'pause'
  ];

  static getInstance(): PreCachedResponseService {
    if (!PreCachedResponseService.instance) {
      PreCachedResponseService.instance = new PreCachedResponseService();
    }
    return PreCachedResponseService.instance;
  }

  private constructor() {
    this.initializeCache();
  }

  /**
   * Get cached response for a gesture
   */
  getCachedResponse(gesture: string): CachedResponse | null {
    this.cacheStats.totalRequests++;

    const normalizedGesture = this.normalizeGesture(gesture);
    const cached = this.responseCache.get(normalizedGesture);

    if (cached) {
      this.cacheStats.hits++;
      cached.lastUsed = Date.now();
      cached.useCount++;
      return cached;
    }

    this.cacheStats.misses++;
    return null;
  }

  /**
   * Pre-cache responses for common gestures
   */
  async preCacheCommonResponses(): Promise<void> {
    logger.info('Starting pre-cache of common gesture responses...');

    for (const gesture of this.COMMON_GESTURES) {
      if (!this.responseCache.has(gesture)) {
        await this.cacheResponse(gesture);
      }
    }

    logger.info(`Pre-cached ${this.COMMON_GESTURES.length} common gesture responses`);
  }

  /**
   * Cache a response for a gesture
   */
  async cacheResponse(gesture: string, customResponse?: string): Promise<boolean> {
    try {
      const normalizedGesture = this.normalizeGesture(gesture);
      const response = customResponse ?? this.generateDefaultResponse(gesture);

      // Estimate size (rough approximation)
      const size = (response.length * 2) + (gesture.length * 2) + 100; // 2 bytes per char + overhead

      // Check if we have space
      while (this.currentCacheSize + size > this.MAX_CACHE_SIZE && this.responseCache.size > 0) {
        const needed = this.currentCacheSize + size - this.MAX_CACHE_SIZE;
        this.evictLeastRecentlyUsed(needed);
      }

      // Check entry limit
      if (this.responseCache.size >= this.MAX_CACHE_ENTRIES) {
        this.evictLeastRecentlyUsed();
      }

      const cachedResponse: CachedResponse = {
        gesture: normalizedGesture,
        response,
        lastUsed: Date.now(),
        useCount: 0,
        size
      };

      this.responseCache.set(normalizedGesture, cachedResponse);
      this.currentCacheSize += size;

      logger.debug(`Cached response for gesture: ${gesture}`);
      return true;

    } catch (error) {
      logger.warn(`Failed to cache response for gesture: ${gesture}`, error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats {
    const entries = Array.from(this.responseCache.values());
    const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
    const mostUsed = entries.sort((a, b) => b.useCount - a.useCount)[0];

    return {
      totalResponses: this.responseCache.size,
      cacheHitRate: this.cacheStats.totalRequests > 0
        ? this.cacheStats.hits / this.cacheStats.totalRequests
        : 0,
      totalSize,
      averageResponseTime: 10, // Placeholder - would measure actual response times
      mostUsedGesture: mostUsed?.gesture || ''
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.responseCache.clear();
    this.currentCacheSize = 0;
    this.cacheStats = { hits: 0, misses: 0, totalRequests: 0 };
    logger.info('Response cache cleared');
  }

  /**
   * Warm up cache with predicted gestures
   */
  async warmUpCache(predictedGestures: string[]): Promise<void> {
    logger.info(`Warming up cache with ${predictedGestures.length} predicted gestures`);

    for (const gesture of predictedGestures.slice(0, 10)) { // Limit to 10 to avoid overwhelming
      if (!this.responseCache.has(this.normalizeGesture(gesture))) {
        await this.cacheResponse(gesture);
      }
    }
  }

  /**
   * Get all cached gestures
   */
  getCachedGestures(): string[] {
    return Array.from(this.responseCache.keys());
  }

  /**
   * Check if gesture is cached
   */
  isGestureCached(gesture: string): boolean {
    return this.responseCache.has(this.normalizeGesture(gesture));
  }

  /**
   * Initialize cache with common responses
   */
  private async initializeCache(): Promise<void> {
    try {
      // Load from persistent storage if available
      await this.loadPersistentCache();

      // Pre-cache common responses
      await this.preCacheCommonResponses();

      logger.info('Response cache initialized');
    } catch (error) {
      logger.warn('Failed to initialize response cache:', error);
    }
  }

  /**
   * Generate default response for a gesture
   */
  private generateDefaultResponse(gesture: string): string {
    const normalizedGesture = this.normalizeGesture(gesture);

    // German responses for common gestures
    const responses: Record<string, string> = {
      'hallo': 'Hallo! Schön dich zu sehen!',
      'hello': 'Hello! Nice to see you!',
      'tschüss': 'Tschüss! Bis bald!',
      'bye': 'Bye! See you soon!',
      'danke': 'Bitte! Gern geschehen!',
      'thank_you': 'You\'re welcome!',
      'bitte': 'Hier bitte!',
      'please': 'Here you go!',
      'ja': 'Ja, genau!',
      'yes': 'Yes, exactly!',
      'nein': 'Nein, das stimmt nicht.',
      'no': 'No, that\'s not right.',
      'essen': 'Möchtest du etwas essen?',
      'eat': 'Would you like something to eat?',
      'trinken': 'Möchtest du etwas trinken?',
      'drink': 'Would you like something to drink?',
      'hilfe': 'Ich helfe dir! Was brauchst du?',
      'help': 'I\'ll help you! What do you need?',
      'mehr': 'Möchtest du mehr?',
      'more': 'Would you like more?',
      'fertig': 'Alles fertig! Gut gemacht!',
      'finished': 'All done! Well done!',
      'stop': 'Okay, ich stoppe.',
      'pause': 'Okay, ich mache eine Pause.'
    };

    return responses[normalizedGesture] || `${gesture}!`;
  }

  /**
   * Normalize gesture name for consistent caching
   */
  private normalizeGesture(gesture: string): string {
    return gesture.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
  }

  /**
   * Evict least recently used entries to make space
   */
  private evictLeastRecentlyUsed(requiredSpace?: number): void {
    const entries = Array.from(this.responseCache.entries()).sort(([, a], [, b]) => a.lastUsed - b.lastUsed);

    let freedSpace = 0;
    for (const [gesture, entry] of entries) {
      this.responseCache.delete(gesture);
      this.currentCacheSize -= entry.size;
      freedSpace += entry.size;

      if (requiredSpace && freedSpace >= requiredSpace) break;
      if (!requiredSpace && this.responseCache.size <= this.MAX_CACHE_ENTRIES) break;
    }

    logger.debug(`Evicted ${freedSpace} bytes from cache`);
  }

  /**
   * Load cache from persistent storage
   */
  private async loadPersistentCache(): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const data = window.localStorage.getItem('amys_echo_response_cache');
        if (data) {
          const parsed = JSON.parse(data);
          // Only load recent entries (last 24 hours)
          const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);

          for (const [gesture, entry] of Object.entries(parsed)) {
            const cachedEntry = entry as CachedResponse;
            if (cachedEntry.lastUsed > oneDayAgo) {
              this.responseCache.set(gesture, cachedEntry);
              this.currentCacheSize += cachedEntry.size;
            }
          }

          logger.info(`Loaded ${this.responseCache.size} cached responses from storage`);
        }
      }
    } catch (error) {
      logger.warn('Failed to load persistent cache:', error);
    }
  }

  /**
   * Save cache to persistent storage
   */
  private async savePersistentCache(): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const data = Object.fromEntries(this.responseCache);
        window.localStorage.setItem('amys_echo_response_cache', JSON.stringify(data));
      }
    } catch (error) {
      logger.warn('Failed to save persistent cache:', error);
    }
  }

  /**
   * Periodic cleanup and persistence
   */
  private startMaintenanceLoop(): void {
    setInterval(() => {
      // Clean up old entries (older than 7 days)
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const toRemove: string[] = [];

      for (const [gesture, entry] of this.responseCache.entries()) {
        if (entry.lastUsed < sevenDaysAgo) {
          toRemove.push(gesture);
          this.currentCacheSize -= entry.size;
        }
      }

      for (const gesture of toRemove) {
        this.responseCache.delete(gesture);
      }

      if (toRemove.length > 0) {
        logger.debug(`Cleaned up ${toRemove.length} old cache entries`);
      }

      // Save to persistent storage
      this.savePersistentCache();
    }, 5 * 60 * 1000); // Every 5 minutes
  }
}

export const preCachedResponseService = PreCachedResponseService.getInstance();