import { database } from '../../db';
import { logger } from '../utils/logger';

// Database optimization service
export class DatabaseOptimizationService {
  private static instance: DatabaseOptimizationService;
  private queryCache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private batchOperations: Array<{ operation: () => Promise<any>; priority: number }> = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private isProcessingBatch = false;

  private constructor() {
    this.initializeBatchProcessing();
  }

  public static getInstance(): DatabaseOptimizationService {
    if (!DatabaseOptimizationService.instance) {
      DatabaseOptimizationService.instance = new DatabaseOptimizationService();
    }
    return DatabaseOptimizationService.instance;
  }

  // Initialize batch processing
  private initializeBatchProcessing(): void {
    // Process batches every 50ms
    this.batchTimer = setInterval(() => {
      this.processBatchOperations();
    }, 50);
  }

  // Optimized query with caching
  public async queryWithCache<T>(
    collectionName: string,
    queryFn: () => Promise<T>,
    cacheKey: string,
    ttl: number = 30000 // 30 seconds default TTL
  ): Promise<T> {
    // Check cache first
    const cached = this.queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }

    // Execute query
    const startTime = Date.now();
    const result = await queryFn();
    const queryTime = Date.now() - startTime;

    // Cache result
    this.queryCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
      ttl
    });

    // Log performance
    if (queryTime > 100) { // Log slow queries
      logger.warn(`Slow database query: ${collectionName} took ${queryTime}ms`);
    }

    return result;
  }

  // Optimized gesture definition queries
  public async getGestureDefinitions(profileId?: string): Promise<any[]> {
    const cacheKey = `gesture_definitions_${profileId || 'all'}`;

    return this.queryWithCache(
      'gesture_definitions',
      async () => {
        const collection = database.get('gesture_definitions');
        // Simplified query - in production would use proper WatermelonDB query builders
        const results = await collection.query().fetch();
        return results.slice(0, 100); // Limit to 100 for performance
      },
      cacheKey,
      60000 // 1 minute TTL
    );
  }

  // Optimized symbol queries with pagination
  public async getSymbolsPaginated(
    category?: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<any[]> {
    const cacheKey = `symbols_${category || 'all'}_${limit}_${offset}`;

    return this.queryWithCache(
      'symbols',
      async () => {
        const collection = database.get('symbols');
        const results = await collection.query().fetch();

        // Filter by category if specified
        let filtered = results;
        if (category) {
          filtered = results.filter((item: any) => item.category === category);
        }

        // Apply pagination
        return filtered.slice(offset, offset + limit);
      },
      cacheKey,
      120000 // 2 minutes TTL
    );
  }

  // Optimized interaction log queries with time-based filtering
  public async getRecentInteractions(
    profileId: string,
    hours: number = 24,
    limit: number = 100
  ): Promise<any[]> {
    const cacheKey = `interactions_${profileId}_${hours}h_${limit}`;

    return this.queryWithCache(
      'interaction_logs',
      async () => {
        const collection = database.get('interaction_logs');
        const results = await collection.query().fetch();
        const cutoffTime = new Date(Date.now() - (hours * 60 * 60 * 1000));

        // Filter by time and sort
        const filtered = results
          .filter((item: any) => item.createdAt > cutoffTime)
          .sort((a: any, b: any) => b.createdAt - a.createdAt)
          .slice(0, limit);

        return filtered;
      },
      cacheKey,
      30000 // 30 seconds TTL
    );
  }

  // Batch database operations for better performance
  public addBatchOperation(operation: () => Promise<any>, priority: number = 1): void {
    this.batchOperations.push({ operation, priority });

    // Sort by priority (higher priority first)
    this.batchOperations.sort((a, b) => b.priority - a.priority);
  }

  // Process batched operations
  private async processBatchOperations(): Promise<void> {
    if (this.isProcessingBatch || this.batchOperations.length === 0) return;

    this.isProcessingBatch = true;

    try {
      const operations = this.batchOperations.splice(0, 10); // Process up to 10 operations at once

      if (operations.length > 0) {
        const startTime = Date.now();

        // Execute operations in parallel
        const results = await Promise.allSettled(
          operations.map(op => op.operation())
        );

        const processingTime = Date.now() - startTime;

        // Log performance
        if (processingTime > 50) {
          logger.info(`Batch operations completed in ${processingTime}ms (${operations.length} operations)`);
        }

        // Handle results
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            logger.warn(`Batch operation ${index} failed:`, result.reason);
          }
        });
      }
    } catch (error) {
      logger.error('Batch processing failed:', error);
    } finally {
      this.isProcessingBatch = false;
    }
  }

  // Optimized bulk insert for training data
  public async bulkInsertTrainingData(
    gestureDefinitionId: string,
    trainingData: Array<{
      landmarkData: string;
      source: string;
      qualityScore: number;
      frameMetadata: string;
    }>
  ): Promise<void> {
    const collection = database.get('gesture_training_data');

    // Use batch operations for better performance
    const operations = trainingData.map(data =>
      () => collection.create((record: any) => {
        record.landmarkData = data.landmarkData;
        record.source = data.source;
        record.qualityScore = data.qualityScore;
        record.frameMetadata = data.frameMetadata;
        record.createdAt = new Date();
        record.customSyncStatus = 'pending';
        record.gestureDefinition.id = gestureDefinitionId;
      })
    );

    // Add to batch queue with high priority
    operations.forEach(op => this.addBatchOperation(op, 3));
  }

  // Optimized analytics queries
  public async getLearningAnalytics(gestureDefinitionId?: string): Promise<any[]> {
    const cacheKey = `analytics_${gestureDefinitionId || 'all'}`;

    return this.queryWithCache(
      'learning_analytics',
      async () => {
        const collection = database.get('learning_analytics');
        const results = await collection.query().fetch();
        const cutoffTime = new Date(Date.now() - (24 * 60 * 60 * 1000)); // Last 24 hours

        // Filter by gesture ID and time
        let filtered = results;
        if (gestureDefinitionId) {
          filtered = results.filter((item: any) => item.gestureDefinitionId === gestureDefinitionId);
        }

        return filtered.filter((item: any) => item.lastCalculated > cutoffTime);
      },
      cacheKey,
      300000 // 5 minutes TTL
    );
  }

  // Clear cache for specific patterns
  public clearCache(pattern: string): void {
    const keysToDelete: string[] = [];

    this.queryCache.forEach((_, key) => {
      if (key.includes(pattern)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.queryCache.delete(key));

    if (keysToDelete.length > 0) {
      logger.info(`Cleared ${keysToDelete.length} cache entries for pattern: ${pattern}`);
    }
  }

  // Get cache statistics
  public getCacheStats(): {
    size: number;
    hitRate: number;
    totalQueries: number;
    cacheHits: number;
  } {
    return {
      size: this.queryCache.size,
      hitRate: 0, // Would need to track hits/misses
      totalQueries: 0,
      cacheHits: 0
    };
  }

  // Preload frequently used data
  public async preloadFrequentData(profileId: string): Promise<void> {
    try {
      // Preload common symbols
      await this.getSymbolsPaginated('basic', 20, 0);

      // Preload recent gesture definitions
      await this.getGestureDefinitions(profileId);

      // Preload recent interactions
      await this.getRecentInteractions(profileId, 1, 20); // Last hour

      logger.info('Preloaded frequent database data');
    } catch (error) {
      logger.warn('Failed to preload frequent data:', error);
    }
  }

  // Optimize database connections
  public async optimizeConnections(): Promise<void> {
    try {
      // Clear old cache entries
      const cutoffTime = Date.now() - (10 * 60 * 1000); // 10 minutes ago
      const keysToDelete: string[] = [];

      this.queryCache.forEach((value, key) => {
        if (value.timestamp < cutoffTime) {
          keysToDelete.push(key);
        }
      });

      keysToDelete.forEach(key => this.queryCache.delete(key));

      if (keysToDelete.length > 0) {
        logger.info(`Cleaned up ${keysToDelete.length} expired cache entries`);
      }
    } catch (error) {
      logger.warn('Failed to optimize connections:', error);
    }
  }

  // Cleanup
  public cleanup(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }

    this.queryCache.clear();
    this.batchOperations = [];
    this.isProcessingBatch = false;

    logger.info('Database optimization service cleaned up');
  }
}

// Export singleton instance
export const databaseOptimizationService = DatabaseOptimizationService.getInstance();