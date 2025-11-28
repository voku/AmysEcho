/**
 * Performance Monitor Service - Amy First
 *
 * Comprehensive performance monitoring for gesture detection system.
 * Tracks latency, accuracy, and system health.
 */

import { logger } from '../utils/logger';

export interface PerformanceMetrics {
  // Latency metrics
  averageProcessingTime: number;
  medianProcessingTime: number;
  p95ProcessingTime: number;
  maxProcessingTime: number;

  // Accuracy metrics
  overallAccuracy: number;
  gestureAccuracy: Map<string, number>;
  falsePositiveRate: number;
  falseNegativeRate: number;

  // System health
  frameRate: number;
  memoryUsage: number;
  errorRate: number;
  uptime: number;

  // Throughput
  gesturesProcessedPerSecond: number;
  framesProcessedPerSecond: number;
}

export interface PerformanceSample {
  timestamp: number;
  processingTime: number;
  gesture?: string;
  confidence: number;
  success: boolean;
  error?: string;
}

class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private samples: PerformanceSample[] = [];
  private readonly MAX_SAMPLES = 1000;
  private readonly SAMPLE_WINDOW_MS = 60000; // 1 minute window
  private startTime = Date.now();

  private constructor() {
    // Clean up old samples periodically without keeping Node alive
    const interval = setInterval(() => this.cleanupOldSamples(), 30000);
    if (typeof interval === 'object' && typeof (interval as any).unref === 'function') {
      (interval as any).unref();
    }
  }

  // Simple metric recorder for ad-hoc counters/timings
  recordMetric(name: string, value: number, details?: any): void {
    try {
      logger.performanceMetric(name, value, details);
    } catch {
      // no-op in environments without logger
    }
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Record a gesture processing sample
   */
  recordGestureProcessing(
    processingTime: number,
    gesture: string | null,
    confidence: number,
    success: boolean,
    error?: string
  ): void {
    const sample: PerformanceSample = {
      timestamp: Date.now(),
      processingTime,
      confidence,
      success,
    };

    if (gesture) {
      sample.gesture = gesture;
    }

    if (error) {
      sample.error = error;
    }

    this.samples.push(sample);

    // Keep only recent samples
    if (this.samples.length > this.MAX_SAMPLES) {
      this.samples.shift();
    }

    // Log performance issues
    if (processingTime > 100) {
      logger.warn(`Slow gesture processing: ${processingTime}ms for ${gesture}`);
    }

  }

  /**
   * Record frame processing metrics
   */
  recordFrameProcessing(frameCount: number, processingTime: number): void {
    // This could be extended to track frame rates
    const frameRate = frameCount / (processingTime / 1000);
    if (frameRate < 15) {
      logger.warn(`Low frame rate: ${frameRate} fps`);
    }
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    const recentSamples = this.getRecentSamples();
    const successfulSamples = recentSamples.filter(s => s.success);

    // Calculate latency metrics
    const processingTimes = recentSamples.map(s => s.processingTime);
    const averageProcessingTime = this.calculateAverage(processingTimes);
    const medianProcessingTime = this.calculateMedian(processingTimes);
    const p95ProcessingTime = this.calculatePercentile(processingTimes, 95);
    const maxProcessingTime = Math.max(...processingTimes, 0);

    // Calculate accuracy metrics
    const overallAccuracy = successfulSamples.length / Math.max(recentSamples.length, 1);
    const gestureAccuracy = this.calculateGestureAccuracy(recentSamples);
    const falsePositiveRate = this.calculateFalsePositiveRate(recentSamples);
    const falseNegativeRate = this.calculateFalseNegativeRate(recentSamples);

    // Calculate system health
    const frameRate = this.calculateFrameRate();
    const memoryUsage = this.getMemoryUsage();
    const errorRate = recentSamples.filter(s => s.error).length / Math.max(recentSamples.length, 1);
    const uptime = (Date.now() - this.startTime) / 1000;

    // Calculate throughput
    const timeWindow = this.SAMPLE_WINDOW_MS / 1000;
    const gesturesProcessedPerSecond = recentSamples.length / timeWindow;
    const framesProcessedPerSecond = frameRate;

    return {
      averageProcessingTime,
      medianProcessingTime,
      p95ProcessingTime,
      maxProcessingTime,
      overallAccuracy,
      gestureAccuracy,
      falsePositiveRate,
      falseNegativeRate,
      frameRate,
      memoryUsage,
      errorRate,
      uptime,
      gesturesProcessedPerSecond,
      framesProcessedPerSecond
    };
  }

  /**
   * Get performance summary for logging
   */
  getPerformanceSummary(): string {
    const metrics = this.getMetrics();

    return `Performance: ${metrics.averageProcessingTime.toFixed(1)}ms avg, ` +
           `${(metrics.overallAccuracy * 100).toFixed(1)}% accuracy, ` +
           `${metrics.frameRate.toFixed(1)} fps`;
  }

  /**
   * Check if performance is within acceptable limits
   */
  isPerformanceAcceptable(): boolean {
    const metrics = this.getMetrics();

    return (
      metrics.averageProcessingTime < 50 && // < 50ms average
      metrics.overallAccuracy > 0.8 && // > 80% accuracy
      metrics.frameRate > 20 && // > 20 fps
      metrics.errorRate < 0.1 // < 10% error rate
    );
  }

  /**
   * Get performance report for React Native
   */
  getPerformanceReport(): {
    summary: string;
    metrics: PerformanceMetrics;
    alerts: string[];
    isAcceptable: boolean;
  } {
    const metrics = this.getMetrics();
    const alerts = this.getPerformanceAlerts();

    return {
      summary: this.getPerformanceSummary(),
      metrics,
      alerts,
      isAcceptable: this.isPerformanceAcceptable()
    };
  }

  /**
   * Get performance alerts
   */
  getPerformanceAlerts(): string[] {
    const alerts: string[] = [];
    const metrics = this.getMetrics();

    if (metrics.averageProcessingTime > 100) {
      alerts.push(`High latency: ${metrics.averageProcessingTime.toFixed(1)}ms average`);
    }

    if (metrics.overallAccuracy < 0.7) {
      alerts.push(`Low accuracy: ${(metrics.overallAccuracy * 100).toFixed(1)}%`);
    }

    if (metrics.frameRate < 15) {
      alerts.push(`Low frame rate: ${metrics.frameRate.toFixed(1)} fps`);
    }

    if (metrics.errorRate > 0.2) {
      alerts.push(`High error rate: ${(metrics.errorRate * 100).toFixed(1)}%`);
    }

    return alerts;
  }

  private getRecentSamples(): PerformanceSample[] {
    const cutoff = Date.now() - this.SAMPLE_WINDOW_MS;
    return this.samples.filter(s => s.timestamp > cutoff);
  }

  private cleanupOldSamples(): void {
    const cutoff = Date.now() - this.SAMPLE_WINDOW_MS;
    this.samples = this.samples.filter(s => s.timestamp > cutoff);
  }

  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      const lower = sorted[mid - 1];
      const upper = sorted[mid];
      if (lower === undefined || upper === undefined) {
        return lower ?? upper ?? 0;
      }
      return (lower + upper) / 2;
    }
    return sorted[mid] ?? 0;
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    const safeIndex = Math.max(0, index);
    return sorted[safeIndex] ?? 0;
  }

  private calculateGestureAccuracy(samples: PerformanceSample[]): Map<string, number> {
    const gestureStats = new Map<string, { total: number; successful: number }>();

    for (const sample of samples) {
      if (!sample.gesture) continue;

      const stats = gestureStats.get(sample.gesture) || { total: 0, successful: 0 };
      stats.total++;
      if (sample.success) stats.successful++;
      gestureStats.set(sample.gesture, stats);
    }

    const accuracy = new Map<string, number>();
    for (const [gesture, stats] of gestureStats) {
      accuracy.set(gesture, stats.successful / stats.total);
    }

    return accuracy;
  }

  private calculateFalsePositiveRate(samples: PerformanceSample[]): number {
    // False positive: detected gesture when there shouldn't be one
    const falsePositives = samples.filter(s => s.gesture && !s.success).length;
    const totalDetections = samples.filter(s => s.gesture).length;
    return totalDetections > 0 ? falsePositives / totalDetections : 0;
  }

  private calculateFalseNegativeRate(samples: PerformanceSample[]): number {
    // False negative: missed gesture that should have been detected
    const falseNegatives = samples.filter(s => !s.gesture && s.confidence > 0.5).length;
    return samples.length > 0 ? falseNegatives / samples.length : 0;
  }

  private calculateFrameRate(): number {
    // This is a simplified calculation - in practice, you'd track actual frame timestamps
    return 30; // Assume 30 fps for now
  }

  private getMemoryUsage(): number {
    // In a real implementation, you'd use performance.memory if available
    // For now, return a placeholder
    return 50; // MB
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance();
