/**
 * Performance Monitor Service - Amy First
 *
 * Umfassendes Performance-Monitoring für das Gestenerkennungssystem.
 * Verfolgt Latenz, Genauigkeit und Systemzustand.
 */

import { logger } from './logger';

export interface PerformanceMetrics {
  // Latenzmetriken
  averageProcessingTime: number;
  medianProcessingTime: number;
  p95ProcessingTime: number;
  maxProcessingTime: number;

  // Genauigkeitsmetriken
  overallAccuracy: number;
  gestureAccuracy: Map<string, number>;
  falsePositiveRate: number;
  falseNegativeRate: number;

  // Systemzustand
  frameRate: number;
  memoryUsage: number;
  errorRate: number;
  uptime: number;

  // Durchsatz
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
  private readonly SAMPLE_WINDOW_MS = 60000; // 1 Minute Fenster
  private startTime = Date.now();
  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;
  
  // LLM-optimized: Performance thresholds for monitoring and alerts
  private readonly SLOW_PROCESSING_THRESHOLD_MS = 100; // Warn if gesture processing takes >100ms
  private readonly LOW_FRAME_RATE_THRESHOLD = 15; // Warn if FPS drops below 15
  private readonly GOOD_FRAME_RATE_THRESHOLD = 20; // Good performance is >20 FPS
  private readonly GOOD_PROCESSING_TIME_MS = 50; // Good performance is <50ms average
  private readonly CLEANUP_INTERVAL_MS = 30000; // Clean up old samples every 30 seconds
  private readonly ACCEPTABLE_ACCURACY_THRESHOLD = 0.8; // Acceptable accuracy is >80%
  private readonly LOW_ACCURACY_THRESHOLD = 0.7; // Alert if accuracy drops below 70%
  private readonly ACCEPTABLE_ERROR_RATE = 0.1; // Acceptable error rate is <10%
  private readonly HIGH_ERROR_RATE_THRESHOLD = 0.2; // Alert if error rate exceeds 20%

  private constructor() {
    // Alte Proben regelmäßig bereinigen
    this.cleanupIntervalId = setInterval(() => this.cleanupOldSamples(), this.CLEANUP_INTERVAL_MS);
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Einfache Metrik für Ad-hoc-Zähler/Zeitmessungen aufzeichnen
   */
  recordMetric(name: string, value: number, details?: unknown): void {
    try {
      logger.debug(`[Performance] ${name}: ${value}`, details);
    } catch {
      // No-op in Umgebungen ohne Logger
    }
  }

  /**
   * Gestenverarbeitungsprobe aufzeichnen
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

    if (this.samples.length > this.MAX_SAMPLES) {
      this.samples.shift();
    }

    if (processingTime > this.SLOW_PROCESSING_THRESHOLD_MS) {
      logger.warn(`Langsame Gestenverarbeitung: ${processingTime}ms für ${gesture}`);
    }
  }

  /**
   * Frame-Verarbeitungsmetriken aufzeichnen
   */
  recordFrameProcessing(frameCount: number, processingTime: number): void {
    const frameRate = frameCount / (processingTime / 1000);
    if (frameRate < this.LOW_FRAME_RATE_THRESHOLD) {
      logger.warn(`Niedrige Frame-Rate: ${frameRate} fps`);
    }
  }

  /**
   * Aktuelle Performance-Metriken abrufen
   */
  getMetrics(): PerformanceMetrics {
    const recentSamples = this.getRecentSamples();
    const successfulSamples = recentSamples.filter(s => s.success);

    // Latenzmetriken berechnen
    const processingTimes = recentSamples.map(s => s.processingTime);
    const averageProcessingTime = this.calculateAverage(processingTimes);
    const medianProcessingTime = this.calculateMedian(processingTimes);
    const p95ProcessingTime = this.calculatePercentile(processingTimes, 95);
    const maxProcessingTime = Math.max(...processingTimes, 0);

    // Genauigkeitsmetriken berechnen
    const overallAccuracy = successfulSamples.length / Math.max(recentSamples.length, 1);
    const gestureAccuracy = this.calculateGestureAccuracy(recentSamples);
    const falsePositiveRate = this.calculateFalsePositiveRate(recentSamples);
    const falseNegativeRate = this.calculateFalseNegativeRate(recentSamples);

    // Systemzustand berechnen
    const frameRate = this.calculateFrameRate();
    const memoryUsage = this.getMemoryUsage();
    const errorRate = recentSamples.filter(s => s.error).length / Math.max(recentSamples.length, 1);
    const uptime = (Date.now() - this.startTime) / 1000;

    // Durchsatz berechnen
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
   * Performance-Zusammenfassung für Protokollierung
   */
  getPerformanceSummary(): string {
    const metrics = this.getMetrics();

    return `Performance: ${metrics.averageProcessingTime.toFixed(1)}ms Durchschnitt, ` +
           `${(metrics.overallAccuracy * 100).toFixed(1)}% Genauigkeit, ` +
           `${metrics.frameRate.toFixed(1)} fps`;
  }

  /**
   * Prüfen, ob Performance akzeptabel ist
   */
  isPerformanceAcceptable(): boolean {
    const metrics = this.getMetrics();

    return (
      metrics.averageProcessingTime < this.GOOD_PROCESSING_TIME_MS &&
      metrics.overallAccuracy > this.ACCEPTABLE_ACCURACY_THRESHOLD &&
      metrics.frameRate > this.GOOD_FRAME_RATE_THRESHOLD &&
      metrics.errorRate < this.ACCEPTABLE_ERROR_RATE
    );
  }

  /**
   * Performance-Bericht abrufen
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
   * Performance-Warnungen abrufen
   */
  getPerformanceAlerts(): string[] {
    const alerts: string[] = [];
    const metrics = this.getMetrics();

    if (metrics.averageProcessingTime > this.SLOW_PROCESSING_THRESHOLD_MS) {
      alerts.push(`Hohe Latenz: ${metrics.averageProcessingTime.toFixed(1)}ms Durchschnitt`);
    }

    if (metrics.overallAccuracy < this.LOW_ACCURACY_THRESHOLD) {
      alerts.push(`Niedrige Genauigkeit: ${(metrics.overallAccuracy * 100).toFixed(1)}%`);
    }

    if (metrics.frameRate < this.LOW_FRAME_RATE_THRESHOLD) {
      alerts.push(`Niedrige Frame-Rate: ${metrics.frameRate.toFixed(1)} fps`);
    }

    if (metrics.errorRate > this.HIGH_ERROR_RATE_THRESHOLD) {
      alerts.push(`Hohe Fehlerrate: ${(metrics.errorRate * 100).toFixed(1)}%`);
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
    const falsePositives = samples.filter(s => s.gesture && !s.success).length;
    const totalDetections = samples.filter(s => s.gesture).length;
    return totalDetections > 0 ? falsePositives / totalDetections : 0;
  }

  private calculateFalseNegativeRate(samples: PerformanceSample[]): number {
    const falseNegatives = samples.filter(s => !s.gesture && s.confidence > 0.5).length;
    return samples.length > 0 ? falseNegatives / samples.length : 0;
  }

  private calculateFrameRate(): number {
    // Vereinfachte Berechnung - in der Praxis würde man echte Frame-Zeitstempel verfolgen
    return 30; // Annahme 30 fps
  }

  private getMemoryUsage(): number {
    // In Browser, prüfen ob performance.memory verfügbar ist (Chrome-spezifische API)
    try {
      if (typeof performance !== 'undefined') {
        // Chrome/Chromium-basierte Browser bieten performance.memory an
        const perfWithMemory = performance as Performance & { 
          memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } 
        };
        if (perfWithMemory.memory && typeof perfWithMemory.memory.usedJSHeapSize === 'number') {
          return perfWithMemory.memory.usedJSHeapSize / (1024 * 1024); // In MB
        }
      }
    } catch {
      // API nicht verfügbar, Platzhalter verwenden
    }
    return 50; // Platzhalter in MB
  }

  /**
   * Zurücksetzen
   */
  reset(): void {
    this.samples = [];
    this.startTime = Date.now();
  }

  /**
   * Aufräumen
   */
  destroy(): void {
    if (this.cleanupIntervalId !== null) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance();
