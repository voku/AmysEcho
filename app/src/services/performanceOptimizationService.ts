import { logger } from '../utils/logger';

export interface PerformanceMetrics {
  /**
   * Rolling gesture processing time in milliseconds.
   */
  gestureProcessingTime: number;
  /**
   * Timestamp of the last metric update.
   */
  lastUpdated: number;
}

class PerformanceOptimizationService {
  private static instance: PerformanceOptimizationService;

  private metrics: PerformanceMetrics;

  private constructor() {
    this.metrics = {
      gestureProcessingTime: 0,
      lastUpdated: Date.now(),
    };
  }

  public static getInstance(): PerformanceOptimizationService {
    if (!PerformanceOptimizationService.instance) {
      PerformanceOptimizationService.instance = new PerformanceOptimizationService();
    }

    return PerformanceOptimizationService.instance;
  }

  public updateMetrics(updates: Partial<PerformanceMetrics>): void {
    if (!updates || typeof updates !== 'object') {
      return;
    }

    const { gestureProcessingTime, lastUpdated } = updates;

    if (typeof gestureProcessingTime === 'number' && Number.isFinite(gestureProcessingTime)) {
      this.metrics.gestureProcessingTime = Math.max(gestureProcessingTime, 0);
    }

    if (typeof lastUpdated === 'number' && Number.isFinite(lastUpdated)) {
      this.metrics.lastUpdated = lastUpdated;
    } else if (gestureProcessingTime !== undefined) {
      this.metrics.lastUpdated = Date.now();
    }
  }

  public getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  public reset(): void {
    this.metrics = {
      gestureProcessingTime: 0,
      lastUpdated: Date.now(),
    };
  }

  public cleanup(): void {
    logger.debug('Resetting performance metrics for cleanup');
    this.reset();
  }
}

export const performanceOptimizationService = PerformanceOptimizationService.getInstance();
export { PerformanceOptimizationService };
