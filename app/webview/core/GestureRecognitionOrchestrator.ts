/**
 * Main orchestrator for gesture recognition system
 * Coordinates all gesture detection components and manages the processing pipeline
 */

import { GestureDetector } from './GestureDetector';
import { PerformanceOptimizer } from '../utils/PerformanceOptimizer';
import { MemoryOptimizer } from '../utils/MemoryOptimizer';
import { ProcessingPipeline, ProcessingStep, ProcessingContext } from '../utils/ProcessingPipeline';
import { OptimizedTremorCompensator } from '../utils/OptimizedTremorCompensator';
import { GestureSizeNormalizer } from '../gestureProcessing';
import { PartialGestureDetector } from '../gestureProcessing';
import { ErrorRecoveryManager } from '../utils/ErrorRecoveryManager';
import { FallbackGestureDetector } from '../core/FallbackGestureDetector';
import { EmergencyGestureSystem } from '../core/EmergencyGestureSystem';
import { HandStabilityAssistant } from '../core/HandStabilityAssistant';
import { BatteryMonitor } from '../core/BatteryMonitor';
import { loadConfig } from '../config/GestureConfig';
import { MediaPipeGestureResult } from '../types/MediaPipeTypes';

export class GestureRecognitionOrchestrator {
  private gestureDetector: GestureDetector | null = null;
  private performanceOptimizer: PerformanceOptimizer;
  private memoryOptimizer: MemoryOptimizer;
  private processingPipeline: ProcessingPipeline;
  private tremorCompensator: OptimizedTremorCompensator;
  private sizeNormalizer: GestureSizeNormalizer;
  private partialDetector: PartialGestureDetector;
  private errorRecoveryManager: ErrorRecoveryManager;
  private fallbackDetector: FallbackGestureDetector;
  private emergencySystem: EmergencyGestureSystem;
  private handStabilityAssistant: HandStabilityAssistant;
  private batteryMonitor: BatteryMonitor;
  private config: any;

  private isInitialized = false;
  private isRunning = false;

  constructor(private video: HTMLVideoElement, private overlay: HTMLCanvasElement) {
    this.performanceOptimizer = new PerformanceOptimizer();
    this.memoryOptimizer = MemoryOptimizer.getInstance();
    this.processingPipeline = new ProcessingPipeline();
    this.config = loadConfig();

    // Initialize components
    this.initializeComponents();
    this.setupProcessingPipeline();
  }

  /**
   * Initialize all gesture recognition components
   */
  private initializeComponents(): void {
    this.tremorCompensator = new OptimizedTremorCompensator();
    this.sizeNormalizer = new GestureSizeNormalizer();
    this.partialDetector = new PartialGestureDetector();
    this.errorRecoveryManager = new ErrorRecoveryManager();
    this.fallbackDetector = new FallbackGestureDetector();
    this.emergencySystem = new EmergencyGestureSystem();
    this.handStabilityAssistant = new HandStabilityAssistant();
    this.batteryMonitor = new BatteryMonitor();

    // Configure components
    this.sizeNormalizer.setTolerance(this.config.processing?.sizeTolerance ?? 0.3);
    this.partialDetector.setThreshold(this.config.processing?.partialThreshold ?? 0.6);
  }

  /**
   * Set up the processing pipeline with all necessary steps
   */
  private setupProcessingPipeline(): void {
    // Add processing steps in order of execution
    this.processingPipeline.addStep(new LandmarkPreprocessingStep(this.sizeNormalizer, this.tremorCompensator));
    this.processingPipeline.addStep(new StabilityAnalysisStep(this.handStabilityAssistant));
    this.processingPipeline.addStep(new GestureDetectionStep());
    this.processingPipeline.addStep(new PartialGestureAnalysisStep(this.partialDetector));
    this.processingPipeline.addStep(new EmergencyGestureCheckStep(this.emergencySystem));
    this.processingPipeline.addStep(new FallbackProcessingStep(this.fallbackDetector, this.errorRecoveryManager));
    this.processingPipeline.addStep(new ResultProcessingStep(this.errorRecoveryManager));

    // Configure pipeline optimization
    this.processingPipeline.configureOptimization({
      targetFrameRate: this.config.performance?.targetFrameRate ?? 30,
      landmarkChangeThreshold: this.config.processing?.landmarkChangeThreshold ?? 0.01,
      enableMemoryOptimization: true
    });
  }

  /**
   * Initialize the gesture recognition system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Create and initialize the main gesture detector
      this.gestureDetector = new GestureDetector(this.video, this.overlay);

      // Set up result callback
      this.gestureDetector.setResultCallback((results, timestamp) => {
        this.handleGestureResults(results, timestamp);
      });

      await this.gestureDetector.initialize();

      // Start monitoring systems
      this.batteryMonitor.startMonitoring();

      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize gesture recognition orchestrator:', error);
      throw error;
    }
  }

  /**
   * Start gesture recognition
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isRunning) return;

    await this.gestureDetector?.start();
    this.isRunning = true;
  }

  /**
   * Stop gesture recognition
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    await this.gestureDetector?.stop();
    this.isRunning = false;
  }

  /**
   * Handle gesture detection results
   */
  private async handleGestureResults(results: MediaPipeGestureResult, timestamp: number): Promise<void> {
    try {
      // Check if we should process this frame
      if (!this.performanceOptimizer.shouldProcessFrame()) {
        return;
      }

      // Prepare processing context
      const context: ProcessingContext = {
        landmarks: results.landmarks ? [results.landmarks.map(lm => [lm.x, lm.y, lm.z ?? 0])] : [],
        timestamp,
        processingStep: 'gesture_results',
        skipExpensiveSteps: this.shouldSkipExpensiveSteps()
      };

      // Execute processing pipeline
      const processingResult = await this.processingPipeline.executePipeline(context);

      // Handle processing result
      if (processingResult.gesture || processingResult.confidence > 0) {
        this.sendGestureResult(processingResult, results);
      }

      // Update performance metrics
      this.performanceOptimizer.recordProcessingTime(processingResult.processingTime);

    } catch (error) {
      console.error('Error handling gesture results:', error);
      this.errorRecoveryManager.recordFailure(error as Error, 'gesture_result_processing');
    }
  }

  /**
   * Determine if expensive processing steps should be skipped
   */
  private shouldSkipExpensiveSteps(): boolean {
    const metrics = this.performanceOptimizer.getPerformanceMetrics();
    return metrics.averageProcessingTime > 50 || this.memoryOptimizer.getMemoryStatus().pressureLevel > 1;
  }

  /**
   * Send gesture result to React Native
   */
  private sendGestureResult(processingResult: any, originalResults: MediaPipeGestureResult): void {
    try {
      const payload = {
        type: 'gesture',
        gesture: processingResult.gesture,
        confidence: processingResult.confidence,
        landmarks: processingResult.landmarks,
        handednesses: originalResults.handednesses?.map(h => h.categoryName) || [],
        timestamp: processingResult.timestamp,
        isFallback: processingResult.isFallback,
        systemHealth: this.errorRecoveryManager.getHealthStatus(),
        processingTime: processingResult.processingTime,
        stepsExecuted: processingResult.stepsExecuted,
        skippedSteps: processingResult.skippedSteps
      };

      window.ReactNativeWebView?.postMessage?.(JSON.stringify(payload));
    } catch (error) {
      console.warn('Failed to send gesture result:', error);
    }
  }

  /**
   * Get current system status
   */
  getStatus(): {
    initialized: boolean;
    running: boolean;
    performance: any;
    memory: any;
    health: any;
  } {
    return {
      initialized: this.isInitialized,
      running: this.isRunning,
      performance: this.performanceOptimizer.getPerformanceMetrics(),
      memory: this.memoryOptimizer.getMemoryStatus(),
      health: this.errorRecoveryManager.getHealthStatus()
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.stop();
    this.memoryOptimizer.performCleanup();
  }
}

/**
 * Processing step for landmark preprocessing
 */
class LandmarkPreprocessingStep implements ProcessingStep {
  name = 'landmark_preprocessing';
  isExpensive = false;

  constructor(
    private sizeNormalizer: GestureSizeNormalizer,
    private tremorCompensator: OptimizedTremorCompensator
  ) {}

  async execute(context: ProcessingContext): Promise<any> {
    if (!context.landmarks || context.landmarks.length === 0) {
      return { landmarks: context.landmarks };
    }

    // Apply size normalization
    let processedLandmarks = this.sizeNormalizer.normalizeHandSize(context.landmarks);

    // Apply tremor compensation
    processedLandmarks = this.tremorCompensator.smoothLandmarks(processedLandmarks);

    return {
      landmarks: processedLandmarks,
      preprocessing: {
        sizeNormalized: true,
        tremorCompensated: true
      }
    };
  }
}

/**
 * Processing step for stability analysis
 */
class StabilityAnalysisStep implements ProcessingStep {
  name = 'stability_analysis';
  isExpensive = false;

  constructor(private stabilityAssistant: HandStabilityAssistant) {}

  async execute(context: ProcessingContext): Promise<any> {
    if (!context.landmarks || context.landmarks.length === 0) {
      return { stability: { isStable: false, score: 0 } };
    }

    const stability = this.stabilityAssistant.analyzeStability(context.landmarks);

    return {
      stability,
      feedback: stability.feedback
    };
  }
}

/**
 * Processing step for main gesture detection
 */
class GestureDetectionStep implements ProcessingStep {
  name = 'gesture_detection';
  isExpensive = true; // MediaPipe processing can be expensive

  async execute(context: ProcessingContext): Promise<any> {
    // This would integrate with the main gesture detector
    // For now, return placeholder
    return {
      gesture: null,
      confidence: 0,
      detection: {
        method: 'mediapipe',
        processed: true
      }
    };
  }
}

/**
 * Processing step for partial gesture analysis
 */
class PartialGestureAnalysisStep implements ProcessingStep {
  name = 'partial_gesture_analysis';
  isExpensive = false;

  constructor(private partialDetector: PartialGestureDetector) {}

  async execute(context: ProcessingContext): Promise<any> {
    if (!context.landmarks || context.landmarks.length === 0) {
      return { partial: null };
    }

    // Analyze common gestures for partial completion
    const commonGestures = ['thumbs_up', 'open_palm', 'fist', 'point'];
    let bestPartial: any = null;

    for (const gesture of commonGestures) {
      const partial = this.partialDetector.analyzePartialCompletion(context.landmarks, gesture);
      if (partial.isPartial && (!bestPartial || partial.completion > bestPartial.completion)) {
        bestPartial = { ...partial, gesture };
      }
    }

    return { partial: bestPartial };
  }
}

/**
 * Processing step for emergency gesture checking
 */
class EmergencyGestureCheckStep implements ProcessingStep {
  name = 'emergency_gesture_check';
  isExpensive = false;

  constructor(private emergencySystem: EmergencyGestureSystem) {}

  async execute(context: ProcessingContext): Promise<any> {
    // Emergency gesture checking would be implemented here
    return {
      emergency: {
        detected: false,
        priority: 'normal'
      }
    };
  }
}

/**
 * Processing step for fallback gesture detection
 */
class FallbackProcessingStep implements ProcessingStep {
  name = 'fallback_processing';
  isExpensive = false;

  constructor(
    private fallbackDetector: FallbackGestureDetector,
    private errorRecoveryManager: ErrorRecoveryManager
  ) {}

  async execute(context: ProcessingContext): Promise<any> {
    if (!this.errorRecoveryManager.isInFallbackMode()) {
      return { fallback: null };
    }

    if (!context.landmarks || context.landmarks.length === 0) {
      return { fallback: null };
    }

    const fallback = this.fallbackDetector.detectGesture(context.landmarks);

    return {
      fallback,
      isUsingFallback: true
    };
  }
}

/**
 * Processing step for final result processing
 */
class ResultProcessingStep implements ProcessingStep {
  name = 'result_processing';
  isExpensive = false;

  constructor(private errorRecoveryManager: ErrorRecoveryManager) {}

  async execute(context: ProcessingContext): Promise<any> {
    // Final result processing and validation
    return {
      finalResult: {
        validated: true,
        timestamp: context.timestamp
      }
    };
  }
}