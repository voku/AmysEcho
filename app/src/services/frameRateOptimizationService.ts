import { logger } from '../utils/logger';
import { performanceOptimizationService } from './performanceOptimizationService';

// Frame rate optimization service
export class FrameRateOptimizationService {
  private static instance: FrameRateOptimizationService;
  private currentFrameRate = 30;
  private targetFrameRate = 30;
  private adaptiveMode = true;
  private gestureComplexityHistory: number[] = [];
  private processingTimeHistory: number[] = [];
  private frameDrops = 0;
  private lastFrameTime = 0;
  private frameRateCheckInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.initializeFrameRateMonitoring();
  }

  public static getInstance(): FrameRateOptimizationService {
    if (!FrameRateOptimizationService.instance) {
      FrameRateOptimizationService.instance = new FrameRateOptimizationService();
    }
    return FrameRateOptimizationService.instance;
  }

  // Initialize frame rate monitoring
  private initializeFrameRateMonitoring(): void {
    // Monitor frame rate every second
    this.frameRateCheckInterval = setInterval(() => {
      this.adjustFrameRate();
    }, 1000);

    this.lastFrameTime = Date.now();
  }

  // Record frame processing time
  public recordFrameProcessing(startTime: number, gestureComplexity: number = 1): void {
    const processingTime = Date.now() - startTime;
    const currentTime = Date.now();

    // Record processing time
    this.processingTimeHistory.push(processingTime);
    if (this.processingTimeHistory.length > 10) {
      this.processingTimeHistory.shift();
    }

    // Record gesture complexity
    this.gestureComplexityHistory.push(gestureComplexity);
    if (this.gestureComplexityHistory.length > 10) {
      this.gestureComplexityHistory.shift();
    }

    // Calculate actual frame rate
    const timeSinceLastFrame = currentTime - this.lastFrameTime;
    if (timeSinceLastFrame > 0) {
      const instantFrameRate = 1000 / timeSinceLastFrame;
      this.currentFrameRate = Math.min(60, Math.max(10, instantFrameRate));
    }

    this.lastFrameTime = currentTime;

    // Check for frame drops
    if (processingTime > (1000 / this.targetFrameRate)) {
      this.frameDrops++;
    }
  }

  // Adjust frame rate based on performance and conditions
  private adjustFrameRate(): void {
    if (!this.adaptiveMode) return;

    const avgProcessingTime = this.getAverageProcessingTime();
    const avgComplexity = this.getAverageComplexity();
    // Base frame rate on default performance target
    let newTargetFrameRate = 30;

    // Adjust based on processing time
    if (avgProcessingTime > 0) {
      const maxProcessingTimeForTarget = 1000 / newTargetFrameRate;
      if (avgProcessingTime > maxProcessingTimeForTarget * 0.8) {
        // Reduce frame rate if processing is too slow
        newTargetFrameRate = Math.max(10, newTargetFrameRate * 0.8);
      } else if (avgProcessingTime < maxProcessingTimeForTarget * 0.5) {
        // Increase frame rate if processing is fast
        newTargetFrameRate = Math.min(60, newTargetFrameRate * 1.2);
      }
    }

    // Adjust based on gesture complexity
    if (avgComplexity > 2) {
      // Complex gestures need more processing time
      newTargetFrameRate = Math.max(15, newTargetFrameRate * 0.9);
    } else if (avgComplexity < 0.5) {
      // Simple gestures can handle higher frame rates
      newTargetFrameRate = Math.min(60, newTargetFrameRate * 1.1);
    }

    // Apply frame drop penalty
    if (this.frameDrops > 5) {
      newTargetFrameRate = Math.max(10, newTargetFrameRate * 0.7);
      this.frameDrops = 0; // Reset counter
    }

    // Smooth transitions (don't change too drastically)
    const frameRateChange = Math.abs(newTargetFrameRate - this.targetFrameRate);
    if (frameRateChange > 5) {
      // Large change - smooth it
      this.targetFrameRate = this.targetFrameRate + (newTargetFrameRate - this.targetFrameRate) * 0.3;
    } else {
      this.targetFrameRate = newTargetFrameRate;
    }

    // Ensure reasonable bounds
    this.targetFrameRate = Math.max(10, Math.min(60, Math.round(this.targetFrameRate)));

    // Update performance service
    performanceOptimizationService.updateMetrics({
      frameRate: this.targetFrameRate
    });
  }

  // Get average processing time
  private getAverageProcessingTime(): number {
    if (this.processingTimeHistory.length === 0) return 0;
    return this.processingTimeHistory.reduce((sum, time) => sum + time, 0) / this.processingTimeHistory.length;
  }

  // Get average gesture complexity
  private getAverageComplexity(): number {
    if (this.gestureComplexityHistory.length === 0) return 1;
    return this.gestureComplexityHistory.reduce((sum, complexity) => sum + complexity, 0) / this.gestureComplexityHistory.length;
  }

  // Get current target frame rate
  public getTargetFrameRate(): number {
    return this.targetFrameRate;
  }

  // Get current actual frame rate
  public getCurrentFrameRate(): number {
    return this.currentFrameRate;
  }

  // Set adaptive mode
  public setAdaptiveMode(enabled: boolean): void {
    this.adaptiveMode = enabled;
    if (!enabled) {
      this.targetFrameRate = 30; // Default frame rate
    }
    logger.info(`Frame rate adaptive mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  // Force specific frame rate
  public setFrameRate(frameRate: number): void {
    this.targetFrameRate = Math.max(10, Math.min(60, frameRate));
    this.adaptiveMode = false;
    performanceOptimizationService.updateMetrics({
      frameRate: this.targetFrameRate
    });
    logger.info(`Frame rate set to ${this.targetFrameRate} FPS`);
  }

  // Get frame rate statistics
  public getFrameRateStats(): {
    current: number;
    target: number;
    adaptiveMode: boolean;
    avgProcessingTime: number;
    avgComplexity: number;
    frameDrops: number;
  } {
    return {
      current: this.currentFrameRate,
      target: this.targetFrameRate,
      adaptiveMode: this.adaptiveMode,
      avgProcessingTime: this.getAverageProcessingTime(),
      avgComplexity: this.getAverageComplexity(),
      frameDrops: this.frameDrops
    };
  }

  // Calculate gesture complexity based on landmarks
  public calculateGestureComplexity(landmarks: number[][][], handedness: string[]): number {
    if (!landmarks || landmarks.length === 0) return 0;

    let complexity = 0;

    // Number of hands detected
    complexity += handedness.length * 0.5;

    // Landmark density (more landmarks = more complex)
    const totalLandmarks = landmarks.flat().length;
    complexity += Math.min(totalLandmarks / 21, 2); // Normalize to max 2

    // Movement complexity (would need previous frame comparison)
    // For now, use a simple heuristic based on hand count
    if (handedness.length === 2) {
      complexity += 1; // Two-hand gestures are more complex
    }

    return Math.max(0, Math.min(5, complexity));
  }

  // Reset frame rate optimization
  public reset(): void {
    this.currentFrameRate = 30;
    this.targetFrameRate = 30;
    this.gestureComplexityHistory = [];
    this.processingTimeHistory = [];
    this.frameDrops = 0;
    this.lastFrameTime = Date.now();
    logger.info('Frame rate optimization reset');
  }

  // Cleanup
  public cleanup(): void {
    if (this.frameRateCheckInterval) {
      clearInterval(this.frameRateCheckInterval);
      this.frameRateCheckInterval = null;
    }

    this.reset();
    logger.info('Frame rate optimization service cleaned up');
  }
}

// Export singleton instance
export const frameRateOptimizationService = FrameRateOptimizationService.getInstance();