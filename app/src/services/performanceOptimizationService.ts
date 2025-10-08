import { logger } from '../utils/logger';

export interface PerformanceOptimizationMetrics {
  /**
   * Rolling gesture processing time in milliseconds.
   */
  gestureProcessingTime: number;
  /**
   * Timestamp of the last metric update.
   */
  lastUpdated: number;
}

export class PerformanceOptimizationService {
  private static instance: PerformanceOptimizationService;

  private metrics!: PerformanceOptimizationMetrics;

  private constructor() {
    this.reset();
  }

  public static getInstance(): PerformanceOptimizationService {
    if (!PerformanceOptimizationService.instance) {
      PerformanceOptimizationService.instance = new PerformanceOptimizationService();
    }

    return PerformanceOptimizationService.instance;
  }

  public updateMetrics(updates: Partial<PerformanceOptimizationMetrics>): void {
    if (!updates || typeof updates !== 'object') {
      return;
    }

    const { gestureProcessingTime, lastUpdated } = updates;

    let gestureTimeUpdated = false;

    if (typeof gestureProcessingTime === 'number' && Number.isFinite(gestureProcessingTime)) {
      this.metrics.gestureProcessingTime = Math.max(gestureProcessingTime, 0);
      gestureTimeUpdated = true;
    }

    if (typeof lastUpdated === 'number' && Number.isFinite(lastUpdated)) {
      this.metrics.lastUpdated = lastUpdated;
    } else if (gestureTimeUpdated) {
      this.metrics.lastUpdated = Date.now();
    }
  }

  public getMetrics(): PerformanceOptimizationMetrics {
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
