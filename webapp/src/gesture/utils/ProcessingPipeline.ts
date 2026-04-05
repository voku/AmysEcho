/**
 * Optimized processing pipeline for gesture recognition
 * Manages processing steps efficiently and reduces redundant operations
 */

import { PerformanceOptimizer } from './PerformanceOptimizer';
import { MemoryOptimizer } from './MemoryOptimizer';
import { MediaPipeGestureResult, type MLPPrediction, TwoHandGesture } from '../types/MediaPipeTypes';
import { NormalizedMediaPipeResult } from './mapMediaPipeResults';

export interface ProcessingContext {
  landmarks: number[][][];
  timestamp: number;
  previousLandmarks?: number[][][];
  processingStep: string;
  skipExpensiveSteps: boolean;
  rawResults?: MediaPipeGestureResult;
  rawLandmarks?: number[][][];
  handednesses?: string[];
  normalizedResults?: NormalizedMediaPipeResult;
  poseLandmarks?: number[][];
  faceLandmarks?: number[][];
}

export interface ProcessingResult {
  gesture?: string | null;
  confidence: number;
  landmarks: number[][][];
  processingTime: number;
  stepsExecuted: string[];
  skippedSteps: string[];
  timestamp?: number;
  systemHealth?: Record<string, unknown>;
  rawLandmarks?: number[][][];
  preprocessing?: {
    sizeNormalized?: boolean;
    tremorCompensated?: boolean;
  };
  stability?: {
    isStable: boolean;
    score: number;
  };
  feedback?: string;
  partial?: {
    isPartial: boolean;
    completion: number;
    confidence: number;
    feedback: string;
    gesture: string;
  } | null;
  emergency?: {
    detected: boolean;
    priority: 'normal' | 'high' | 'critical';
    feedback: string;
    cooldownRemaining: number;
  };
  fallback?: {
    gesture: string;
    confidence: number;
    isFallback: boolean;
    feedback?: string;
  } | null;
  isUsingFallback?: boolean;
  isFallback?: boolean;
  finalResult?: {
    validated: boolean;
    timestamp: number;
  };
  metadata?: {
    method: 'mediapipe' | 'mlp' | 'landmark_template' | 'none';
    confidenceState?: 'confident' | 'unsure' | 'none';
    perHand: Array<{ hand: string; label: string; score: number }>;
    handednesses: string[];
    mlp: MLPPrediction | null;
    mlpDecision?: {
      selected: boolean;
      reason:
        | 'selected'
        | 'selected_profile_vocab_priority'
        | 'selected_profile_vocab_relaxed_threshold'
        | 'below_threshold'
        | 'below_label_support_threshold'
        | 'below_candidate_margin'
        | 'below_label_support_margin'
        | 'below_override_margin'
        | 'null_label'
        | 'invalid_result'
        | 'predictor_unavailable'
        | 'predictor_error'
        | 'invalid_label';
      threshold?: number;
      margin?: number;
      top1?: number;
      top2?: number | undefined;
      threshold_used?: number;
      score?: number;
      selectedConfidenceBeforeMlp?: number;
      selectedGestureBeforeMlp?: string | null;
    } | null;
    twoHand: TwoHandGesture | null;
    templateMatch?: {
      label: string;
      confidence: number;
      templateId: string;
      distance: number;
    } | null;
  } | null;
}

export class ProcessingPipeline {
  private performanceOptimizer: PerformanceOptimizer;
  private memoryOptimizer: MemoryOptimizer;
  private processingSteps: ProcessingStep[] = [];
  private lastProcessingResult: ProcessingResult | null = null;
  
  // LLM-optimized: Processing optimization thresholds
  private readonly SLOW_PROCESSING_THRESHOLD_MS = 50; // Skip expensive steps if processing is slow
  private readonly EXPENSIVE_STEP_SKIP_PROBABILITY_50_PERCENT = 0.5; // 50% chance to skip when slow
  private readonly LANDMARK_CHANGE_THRESHOLD = 0.01; // 1% change threshold for significant movement

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

    const aggregated: Partial<ProcessingResult> = {};

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
          Object.assign(aggregated, stepResult as Partial<ProcessingResult>);
        }

        // Update context with step results
        if (stepResult.landmarks) {
          currentLandmarks = stepResult.landmarks;
        }
        if (
          stepResult.gesture &&
          typeof stepResult.confidence === 'number' &&
          stepResult.confidence > currentConfidence
        ) {
          detectedGesture = stepResult.gesture;
          currentConfidence = stepResult.confidence;
        }

        // Record step performance
        const stepEnd = performance.now();
        const stepDuration = this.sanitizeDuration(stepEnd - stepStartTime);
        this.recordStepPerformance(step.name, stepDuration);

      } catch (error) {
        console.warn(`Processing step ${step.name} failed:`, error);
        // Record as executed even if failed (for tracking purposes)
        stepsExecuted.push(step.name);
        // Continue with other steps
      }
    }

    const endTime = performance.now();
    const totalTime = this.sanitizeDuration(endTime - startTime);
    this.performanceOptimizer.recordProcessingTime(totalTime);

    aggregated.timestamp = aggregated.timestamp ?? context.timestamp;

    const result: ProcessingResult = {
      ...aggregated,
      gesture: detectedGesture ?? (aggregated.gesture as string | null) ?? null,
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

  private sanitizeDuration(duration: number): number {
    if (!Number.isFinite(duration)) {
      return 0.01;
    }
    return duration <= 0 ? 0.01 : duration;
  }

  /**
   * Determine if an expensive step should be skipped
   */
  private shouldSkipExpensiveStep(_step: ProcessingStep, context: ProcessingContext): boolean {
    // Skip if we already have a high-confidence result
    if (this.lastProcessingResult && this.lastProcessingResult.confidence > 0.8) {
      return true;
    }

    // Skip if landmarks haven't changed significantly
    if (context.previousLandmarks && this.landmarksUnchanged(context.landmarks, context.previousLandmarks)) {
      return true;
    }

    // Skip based on performance constraints
    const diagnostics = this.performanceOptimizer.getDiagnostics();
    if (diagnostics.averageProcessingTime > this.SLOW_PROCESSING_THRESHOLD_MS) { // If processing is slow
      return Math.random() < this.EXPENSIVE_STEP_SKIP_PROBABILITY_50_PERCENT;
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
          const currentCoord = currentPoint[coord];
          const previousCoord = previousPoint[coord];
          if (currentCoord === undefined || previousCoord === undefined) continue;
          if (Math.abs(currentCoord - previousCoord) > this.LANDMARK_CHANGE_THRESHOLD) {
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
      gesture: this.lastProcessingResult?.gesture ?? null,
      confidence: this.lastProcessingResult?.confidence || 0,
      landmarks: context.landmarks,
      processingTime: this.sanitizeDuration(performance.now() - startTime),
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
    pipelineMetrics: ReturnType<PerformanceOptimizer['getDiagnostics']>;
    stepMetrics: Record<string, unknown>;
    memoryMetrics: ReturnType<MemoryOptimizer['getMemoryStatus']>;
  } {
    return {
      pipelineMetrics: this.performanceOptimizer.getDiagnostics(),
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
export type ProcessingStepResult = Partial<ProcessingResult>;
