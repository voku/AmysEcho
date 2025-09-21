/**
 * Optimized processing pipeline for gesture recognition
 * Manages processing steps efficiently and reduces redundant operations
 */

import { PerformanceOptimizer } from './PerformanceOptimizer';
import { MemoryOptimizer } from './MemoryOptimizer';
import { MediaPipeGestureResult } from '../types/MediaPipeTypes';
import { NormalizedMediaPipeResult } from './mapMediaPipeResults';

export interface ProcessingContext {
  landmarks: number[][][];
  timestamp: number;
  previousLandmarks?: number[][][];
  processingStep: string;
  skipExpensiveSteps: boolean;
  rawResults?: MediaPipeGestureResult;
  handednesses?: string[];
  normalizedResults?: NormalizedMediaPipeResult;
}

export interface ProcessingResult {
  gesture?: string;
  confidence: number;
  landmarks: number[][][];
  processingTime: number;
  stepsExecuted: string[];
  skippedSteps: string[];
  [key: string]: any;
}

export class ProcessingPipeline {
  private performanceOptimizer: PerformanceOptimizer;
  private memoryOptimizer: MemoryOptimizer;
  private processingSteps: ProcessingStep[] = [];
  private lastProcessingResult: ProcessingResult | null = null;

  constructor() {
    this.performanceOptimizer = new PerformanceOptimizer();
    this.memoryOptimizer = MemoryOptimizer.getInstance();
  }

  /**
   * Add a processing step to the pipeline
   */
  addStep(step: ProcessingStep): void {
    this.processingSteps.push(step);
  }

  /**
   * Execute the processing pipeline with optimizations
   */
  async executePipeline(context: ProcessingContext): Promise<ProcessingResult> {
    const startTime = performance.now();
    const stepsExecuted: string[] = [];
    const skippedSteps: string[] = [];

    // Check if we should skip processing entirely
    if (!this.performanceOptimizer.shouldProcessFrame()) {
      return this.createSkippedResult(context, startTime);
    }

    let currentLandmarks = context.landmarks;
    let currentConfidence = 0;
    let detectedGesture: string | undefined;

    const aggregated: Record<string, unknown> = {};

    // Execute each step with optimization
    for (const step of this.processingSteps) {
      const stepStartTime = performance.now();

      try {
        // Check if we should skip expensive steps
        if (context.skipExpensiveSteps && step.isExpensive && this.shouldSkipExpensiveStep(step, context)) {
          skippedSteps.push(step.name);
          continue;
        }

        // Execute the step
        const stepResult = await step.execute({
          ...context,
          landmarks: currentLandmarks
        });

        stepsExecuted.push(step.name);

        if (stepResult && typeof stepResult === 'object') {
          Object.assign(aggregated, stepResult);
        }

        // Update context with step results
        if (stepResult.landmarks) {
          currentLandmarks = stepResult.landmarks;
        }
        if (stepResult.gesture && stepResult.confidence > currentConfidence) {
          detectedGesture = stepResult.gesture;
          currentConfidence = stepResult.confidence;
        }

        // Record step performance
        const stepTime = performance.now() - stepStartTime;
        this.recordStepPerformance(step.name, stepTime);

      } catch (error) {
        console.warn(`Processing step ${step.name} failed:`, error);
        // Record as executed even if failed (for tracking purposes)
        stepsExecuted.push(step.name);
        // Continue with other steps
      }
    }

    const totalTime = performance.now() - startTime;
    this.performanceOptimizer.recordProcessingTime(totalTime);

    aggregated.timestamp = aggregated.timestamp ?? context.timestamp;

    const result: ProcessingResult = {
      ...aggregated,
      gesture: detectedGesture ?? (aggregated.gesture as string | undefined),
      confidence:
        detectedGesture !== undefined
          ? currentConfidence
          : typeof aggregated.confidence === 'number'
            ? (aggregated.confidence as number)
            : currentConfidence,
      landmarks: currentLandmarks,
      processingTime: totalTime,
      stepsExecuted,
      skippedSteps
    };

    this.lastProcessingResult = result;
    return result;
  }

  /**
   * Determine if an expensive step should be skipped
   */
  private shouldSkipExpensiveStep(step: ProcessingStep, context: ProcessingContext): boolean {
    // Skip if we already have a high-confidence result
    if (this.lastProcessingResult && this.lastProcessingResult.confidence > 0.8) {
      return true;
    }

    // Skip if landmarks haven't changed significantly
    if (context.previousLandmarks && this.landmarksUnchanged(context.landmarks, context.previousLandmarks)) {
      return true;
    }

    // Skip based on performance constraints
    const metrics = this.performanceOptimizer.getPerformanceMetrics();
    if (metrics.averageProcessingTime > 50) { // If processing is slow
      return Math.random() < 0.5; // 50% chance to skip expensive steps
    }

    return false;
  }

  /**
   * Check if landmarks have changed significantly
   */
  private landmarksUnchanged(current: number[][][], previous: number[][][]): boolean {
    if (current.length !== previous.length) return false;

    for (let handIdx = 0; handIdx < current.length; handIdx++) {
      const currentHand = current[handIdx];
      const previousHand = previous[handIdx];

      if (!currentHand || !previousHand || currentHand.length !== previousHand.length) {
        return false;
      }

      for (let pointIdx = 0; pointIdx < currentHand.length; pointIdx++) {
        const currentPoint = currentHand[pointIdx];
        const previousPoint = previousHand[pointIdx];

        if (!currentPoint || !previousPoint) continue;

        // Check if any coordinate changed significantly
        for (let coord = 0; coord < Math.min(currentPoint.length, previousPoint.length); coord++) {
          if (Math.abs(currentPoint[coord] - previousPoint[coord]) > 0.01) { // 1% change threshold
            return false;
          }
        }
      }
    }

    return true;
  }

  /**
   * Create a result when processing is skipped
   */
  private createSkippedResult(context: ProcessingContext, startTime: number): ProcessingResult {
    return {
      gesture: this.lastProcessingResult?.gesture,
      confidence: this.lastProcessingResult?.confidence || 0,
      landmarks: context.landmarks,
      processingTime: performance.now() - startTime,
      stepsExecuted: [],
      skippedSteps: ['frame_skipped']
    };
  }

  /**
   * Record performance metrics for a processing step
   */
  private recordStepPerformance(stepName: string, executionTime: number): void {
    // Could be enhanced to track per-step performance metrics
    if (executionTime > 100) { // Log slow steps
      console.warn(`Slow processing step: ${stepName} (${executionTime.toFixed(2)}ms)`);
    }
  }

  /**
   * Get pipeline performance metrics
   */
  getPerformanceMetrics(): {
    pipelineMetrics: any;
    stepMetrics: any;
    memoryMetrics: any;
  } {
    return {
      pipelineMetrics: this.performanceOptimizer.getPerformanceMetrics(),
      stepMetrics: {}, // Could be enhanced to track per-step metrics
      memoryMetrics: this.memoryOptimizer.getMemoryStatus()
    };
  }

  /**
   * Reset pipeline state
   */
  reset(): void {
    this.lastProcessingResult = null;
    this.performanceOptimizer.reset();
  }

  /**
   * Configure pipeline optimization settings
   */
  configureOptimization(settings: {
    targetFrameRate?: number;
    landmarkChangeThreshold?: number;
    enableMemoryOptimization?: boolean;
  }): void {
    if (settings.targetFrameRate) {
      this.performanceOptimizer.setTargetFrameRate(settings.targetFrameRate);
    }
    if (settings.landmarkChangeThreshold) {
      this.performanceOptimizer.setLandmarkChangeThreshold(settings.landmarkChangeThreshold);
    }
  }
}

/**
 * Interface for processing steps in the pipeline
 */
export interface ProcessingStep {
  name: string;
  isExpensive: boolean;
  execute(context: ProcessingContext): Promise<ProcessingStepResult>;
}

/**
 * Result of a processing step
 */
export interface ProcessingStepResult {
  gesture?: string;
  confidence: number;
  landmarks?: number[][][];
  metadata?: any;
}