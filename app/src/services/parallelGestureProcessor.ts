/**
 * Parallel Gesture Processor Service
 *
 * Manages parallel processing of gesture recognition using:
 * - MediaPipe (primary, real-time)
 * - OpenAI Vision (secondary, fallback/enhancement)
 *
 * Features:
 * - Parallel frame capture and analysis
 * - Intelligent result merging
 * - Fast switching between recognition systems
 * - Confidence-based system selection
 * - Background processing for improved responsiveness
 */

import {
  validateGestureWithOpenAI,
  shouldTriggerOpenAIValidation,
  type ValidationRequest,
} from './openaiGestureValidationService';
import { computeHandRoi, processDataUrl } from '../utils/imageUtils';


// Define proper types for captured frame
type CapturedFrame =
  | string
  | { base64?: string; uri?: string; width?: number; height?: number }
  | null;
import { logger } from '../utils/logger';
import { withErrorHandling, createErrorMessage } from '../utils/errorUtils';
import { performanceMonitor } from './performanceMonitor';
import { validateWithRules, commonValidationRules, ValidationRule } from '../utils/validationUtils';

export interface GestureResult {
  gesture: string | null;
  confidence: number;
  landmarks?: number[][][];
  handedness?: string[];
  source: 'mediapipe' | 'openai' | 'combined';
  processingTime: number;
  timestamp: number;
  emergency?: boolean;
  feedback?: string;
  quality_score?: number;
  suggestions?: string[];
}

export interface ParallelProcessingOptions {
  enableParallelProcessing?: boolean;
  openaiFrameInterval?: number; // Capture every N frames for OpenAI
  confidenceThreshold?: number;
  maxConcurrentRequests?: number;
  enableSmartMerging?: boolean;
  fallbackTimeout?: number; // Max time to wait for OpenAI results
}

export interface ProcessingStats {
  mediapipeResults: number;
  openaiResults: number;
  combinedResults: number;
  averageProcessingTime: number;
  cacheHits: number;
  errors: number;
}

class ParallelGestureProcessor {
  private options: Required<ParallelProcessingOptions>;
  private frameQueue: Array<{ frame: any; timestamp: number }> = [];
  private processingQueue: Map<string, Promise<GestureResult>> = new Map();
  private resultCache: Map<string, GestureResult> = new Map();
  private stats: ProcessingStats = {
    mediapipeResults: 0,
    openaiResults: 0,
    combinedResults: 0,
    averageProcessingTime: 0,
    cacheHits: 0,
    errors: 0,
  };

  private frameCounter = 0;
  private isProcessing = false;

  constructor(options: ParallelProcessingOptions = {}) {
     this.options = {
       enableParallelProcessing: true,
       openaiFrameInterval: 5, // Every 5th frame
       confidenceThreshold: 0.6,
       maxConcurrentRequests: 2,
       enableSmartMerging: true,
       fallbackTimeout: 3000, // 3 seconds
       ...options,
     };

     // Set logging context for this processor instance
     logger.setContext({
       component: 'ParallelGestureProcessor'
     });
   }

  /**
   * Process MediaPipe result and potentially trigger parallel OpenAI processing
   */
  async processMediaPipeResult(
     gesture: string | null,
     confidence: number,
     landmarks: number[][][],
     handedness: string[],
     emergency?: boolean,
     capturedFrame?: any
   ): Promise<GestureResult> {
     const startTime = Date.now();
     this.frameCounter++;

     // Update context for this processing operation
     logger.setContext({
       component: 'ParallelGestureProcessor',
       gesture: gesture || 'unknown'
     });

     // Input validation
      const validationRules: ValidationRule<{
        gesture: string | null;
        confidence: number;
        landmarks: number[][][];
        handedness: string[];
      }>[] = [
       {
         name: 'confidence_valid',
         validate: (input) => typeof input.confidence === 'number' && input.confidence >= 0 && input.confidence <= 1,
         message: 'Confidence must be a number between 0 and 1',
         severity: 'error'
       },
       {
         name: 'landmarks_valid',
         validate: (input) => Array.isArray(input.landmarks),
         message: 'Landmarks must be an array',
         severity: 'error'
       },
       {
         name: 'handedness_valid',
         validate: (input) => Array.isArray(input.handedness),
         message: 'Handedness must be an array',
         severity: 'error'
       }
     ];

     const validationResult = validateWithRules({ gesture, confidence, landmarks, handedness }, validationRules, 'processMediaPipeResult');

     if (!validationResult.valid) {
       logger.warn('Input validation failed for MediaPipe result', { errors: validationResult.errors });
       // Continue processing but log the validation issues
     }

    const mediapipeResult: GestureResult = {
      gesture,
      confidence,
      landmarks,
      handedness,
      source: 'mediapipe',
      processingTime: Date.now() - startTime,
      timestamp: startTime,
    };

    if (typeof emergency === 'boolean') {
      mediapipeResult.emergency = emergency;
    }

    let finalResult: GestureResult = mediapipeResult;

    // Always count MediaPipe results
    this.stats.mediapipeResults++;

    // Check if we should trigger parallel OpenAI processing
    const shouldProcessParallel = this.shouldTriggerParallelProcessing(
      gesture,
      confidence,
      emergency
    );

    if (shouldProcessParallel && capturedFrame && this.options.enableParallelProcessing) {
      try {
        const openaiResult = await this.processWithOpenAIAsync(
          capturedFrame,
          gesture,
          startTime,
          landmarks,
          confidence
        );

        const mergedResult = this.handleOpenAIResult(openaiResult, mediapipeResult);

        if (mergedResult) {
          finalResult = mergedResult;
        } else {
          const normalizedOpenAIResult: GestureResult = {
            ...openaiResult,
            gesture: openaiResult.gesture ?? mediapipeResult.gesture ?? null,
            processingTime: Math.max(openaiResult.processingTime, mediapipeResult.processingTime),
            timestamp: Math.max(openaiResult.timestamp, mediapipeResult.timestamp),
          };

          this.mergeOptionalResultFields(normalizedOpenAIResult, mediapipeResult, openaiResult);

          finalResult = normalizedOpenAIResult;
        }
      } catch (error) {
        logger.warn('Parallel OpenAI processing failed', error);
        this.stats.errors++;
      }
    }

    // Log performance metrics
    logger.performanceMetric('mediapipe_processing', mediapipeResult.processingTime);

    // Record performance sample
    const processingTime = Date.now() - startTime;
    performanceMonitor.recordGestureProcessing(
      processingTime,
      finalResult.gesture ?? gesture,
      finalResult.confidence ?? confidence,
      finalResult.emergency ?? emergency ?? false,
      mediapipeResult.processingTime < 100, // Consider successful if under 100ms
      undefined
    );

    // Enhanced performance monitoring for emergency gestures
    if (finalResult.emergency ?? emergency) {
      this.logEmergencyPerformance(
        processingTime,
        finalResult.gesture ?? gesture,
        finalResult.confidence ?? confidence,
        mediapipeResult.processingTime < 100,
      );
    }

    // Track landmark processing complexity
    if (landmarks && landmarks.length > 0) {
      const landmarkCount = landmarks.reduce((total, hand) => total + hand.length, 0);
      this.logLandmarkProcessingMetrics(processingTime, landmarkCount, mediapipeResult.processingTime < 100);
    }

    // Clear context before returning
    logger.clearContext();

    // Return the best available result
    return finalResult;
  }

  /**
   * Determine if parallel OpenAI processing should be triggered
   */
  private shouldTriggerParallelProcessing(
    gesture: string | null,
    confidence: number,
    emergency?: boolean
  ): boolean {
    // Always process emergency gestures
    if (emergency) return true;

    // Process based on confidence threshold
    if (confidence < this.options.confidenceThreshold) return true;

    // Process every Nth frame for continuous background analysis
    if (this.frameCounter % this.options.openaiFrameInterval === 0) return true;

    // Process specific gestures that benefit from AI analysis
    if (gesture && shouldTriggerOpenAIValidation(confidence, gesture)) return true;

    return false;
  }

  /**
   * Process frame with OpenAI Vision asynchronously
   */
  private async processWithOpenAIAsync(
    frame: any,
    expectedGesture: string | null,
    startTime: number,
    landmarks?: number[][][],
    mediapipeConfidenceForOpenAI?: number
  ): Promise<GestureResult> {
    const processingId = `openai_${startTime}_${Math.random()}`;

    // Enforce concurrent request limit by waiting for one to finish when at capacity
    while (this.processingQueue.size >= this.options.maxConcurrentRequests) {
      try {
        await Promise.race(this.processingQueue.values());
      } catch {
        // Ignore individual errors here; they are handled where awaited/consumed
      }
    }

    const processingPromise = this.performOpenAIValidation(
      frame,
      expectedGesture ?? null,
      startTime,
      landmarks,
      mediapipeConfidenceForOpenAI
    );
    this.processingQueue.set(processingId, processingPromise);

    try {
      const result = await processingPromise;
      this.processingQueue.delete(processingId);
      return result;
    } catch (error) {
      this.processingQueue.delete(processingId);
      throw error;
    }
  }

  /**
   * Perform actual OpenAI validation
   */
  private async performOpenAIValidation(
    frame: any,
    expectedGesture: string | null,
    startTime: number,
    landmarks?: number[][][],
    mediapipeConfidenceForOpenAI?: number
  ): Promise<GestureResult> {
    try {
      // Convert frame to base64 (this would be implemented based on frame format)
      const imageBase64 = await this.convertFrameToBase64(frame, landmarks);

      // Call OpenAI validation
      const hasFiniteConfidence =
        typeof mediapipeConfidenceForOpenAI === 'number' &&
        Number.isFinite(mediapipeConfidenceForOpenAI);

      const validationRequest: ValidationRequest = {
        image: {
          uri: `data:image/jpeg;base64,${imageBase64}`,
          base64: imageBase64,
          width: 640, // Assume standard size
          height: 480,
          timestamp: startTime,
        },
        mediapipeConfidence: hasFiniteConfidence
          ? Math.max(0, Math.min(1, mediapipeConfidenceForOpenAI as number))
          : 0.5,
      };

      if (expectedGesture) {
        validationRequest.expectedGesture = expectedGesture;
      }

      const validationResult = await validateGestureWithOpenAI(validationRequest);

      if (!validationResult.success) {
        throw new Error(validationResult.error || 'OpenAI validation failed');
      }

      const openaiResult: GestureResult = {
        gesture: validationResult.gesture ?? null,
        confidence: validationResult.confidence || 0,
        source: 'openai',
        processingTime: Date.now() - startTime,
        timestamp: startTime,
      };

      if (validationResult.feedback) {
        openaiResult.feedback = validationResult.feedback;
      }

      if (validationResult.quality_score !== undefined) {
        openaiResult.quality_score = validationResult.quality_score;
      }

      if (Array.isArray(validationResult.suggestions) && validationResult.suggestions.length > 0) {
        openaiResult.suggestions = [...validationResult.suggestions];
      }

      this.stats.openaiResults++;

      // Enhanced OpenAI processing performance monitoring
      const processingTime = Date.now() - startTime;
      const openaiSuccess = validationResult.success && processingTime < 3000; // 3 second timeout

      performanceMonitor.recordGestureProcessing(
        processingTime,
        validationResult.gesture ?? null,
        validationResult.confidence || 0,
        false, // OpenAI processing is not emergency
        openaiSuccess,
        validationResult.error
      );

      // Log OpenAI-specific performance metrics
      this.logOpenAIPerformance(processingTime, validationResult, expectedGesture, openaiSuccess);

      return openaiResult;

    } catch (error) {
      logger.warn('OpenAI validation error', error);

      // Record failed OpenAI processing
      const processingTime = Date.now() - startTime;
      performanceMonitor.recordGestureProcessing(
        processingTime,
        expectedGesture,
        0,
        false,
        false,
        error instanceof Error ? error.message : String(error)
      );

      throw error;
    }
  }

  /**
   * Convert captured frame to base64 format for OpenAI API
   */
  private async convertFrameToBase64(frame: CapturedFrame, landmarks?: number[][][]): Promise<string> {
     const result = await withErrorHandling(
       async () => {
        // This would be implemented based on how frames are captured
        // For WebView canvas capture, it might already be base64
        // For native camera, we'd need to convert the image buffer
        if (!frame) {
          throw new Error('No frame provided for conversion');
        }

        if (typeof frame === 'string' && frame.startsWith('data:image')) {
            // Optionally crop + downscale on web
            let processed = frame;
            try {
              // Assume default capture size 640x480 when ROI is computed; allow graceful fallback
              const roi = computeHandRoi(landmarks, 640, 480);
              processed = await processDataUrl(frame, { maxWidth: 448, maxHeight: 448, roi, quality: 0.8 });
            } catch (e) {
              logger.warn('Failed to process image for ROI cropping, using original frame', e);
            }
            if (typeof processed === 'string' && processed.includes(',')) {
              return processed.split(',')[1];
            }
            throw new Error('Invalid frame data');
          }

          if (frame && typeof frame === 'object' && frame.base64) {
            // If we also have a data URL, attempt ROI processing with accurate dimensions
            if (frame.uri && frame.uri.startsWith('data:image') && (frame.width || frame.height)) {
              try {
                const w = typeof frame.width === 'number' ? frame.width : 640;
                const h = typeof frame.height === 'number' ? frame.height : 480;
                const roi = computeHandRoi(landmarks, w, h);
                const processed = await processDataUrl(frame.uri, { maxWidth: 448, maxHeight: 448, roi, quality: 0.8 });
                if (typeof processed === 'string' && processed.includes(',')) {
                  return processed.split(',')[1];
                }
              } catch (e) {
                logger.warn('Failed to process image for ROI cropping, using base64 frame', e);
              }
            }
            // Already has base64 property
            if (typeof frame.base64 === 'string') {
              return frame.base64;
            }
            throw new Error('Invalid frame data');
          }

         // Placeholder for native frame conversion logic
         throw new Error('Frame conversion not implemented for this format');
       },
       'convertFrameToBase64'
     );

     if (!result.success) {
       throw new Error(result.error || 'Failed to convert frame to base64');
     }

     return result.data!;
   }

  /**
   * Handle OpenAI result and potentially merge with MediaPipe result
   */
  private handleOpenAIResult(
    openaiResult: GestureResult,
    mediapipeResult: GestureResult
  ): GestureResult | null {
    // Cache the result for potential future use
    const cacheKey = `gesture_${mediapipeResult.timestamp}`;
    this.resultCache.set(cacheKey, openaiResult);

    // Clean up old cache entries (keep last 10)
    if (this.resultCache.size > 10) {
      const oldestKey = this.resultCache.keys().next().value;
      if (oldestKey) {
        this.resultCache.delete(oldestKey);
      }
    }

    // If smart merging is enabled, we could emit combined results
    if (this.options.enableSmartMerging) {
      return this.attemptResultMerging(mediapipeResult, openaiResult);
    }

    return null;
  }

  private mergeOptionalResultFields(
    target: GestureResult,
    mediapipeResult: GestureResult,
    openaiResult: GestureResult,
  ): void {
    if (mediapipeResult.landmarks) {
      target.landmarks = mediapipeResult.landmarks;
    }

    if (mediapipeResult.handedness) {
      target.handedness = mediapipeResult.handedness;
    }

    if (mediapipeResult.emergency !== undefined) {
      target.emergency = mediapipeResult.emergency;
    }

    const feedback = openaiResult.feedback ?? mediapipeResult.feedback;
    if (feedback) {
      target.feedback = feedback;
    }

    if (openaiResult.quality_score !== undefined) {
      target.quality_score = openaiResult.quality_score;
    }

    if (Array.isArray(openaiResult.suggestions) && openaiResult.suggestions.length > 0) {
      target.suggestions = [...openaiResult.suggestions];
    }
  }

  /**
   * Determine if two results should be merged
   */
  private shouldMergeResults(
    mediapipeResult: GestureResult,
    openaiResult: GestureResult
  ): boolean {
    // Don't merge if gestures are completely different
    if (mediapipeResult.gesture !== openaiResult.gesture &&
        mediapipeResult.gesture && openaiResult.gesture) {
      return false;
    }

    // Merge if OpenAI has significantly higher confidence
    if (openaiResult.confidence > mediapipeResult.confidence + 0.2) {
      return true;
    }

    // Merge if MediaPipe confidence is very low and OpenAI is reasonable
    if (mediapipeResult.confidence < 0.4 && openaiResult.confidence > 0.6) {
      return true;
    }

    return false;
  }

  /**
   * Select the best gesture from two results
   */
  private selectBestGesture(
    mediapipeResult: GestureResult,
    openaiResult: GestureResult
  ): string | null {
    // Prefer OpenAI if confidence is significantly higher
    if (openaiResult.confidence > mediapipeResult.confidence + 0.15) {
      return openaiResult.gesture;
    }

    // Otherwise keep MediaPipe result
    return mediapipeResult.gesture;
  }

  /**
   * Emit merged result (placeholder for UI integration)
   */
  private emitMergedResult(result: GestureResult): void {
     // This would emit the result to the UI layer
     // Could use callbacks, events, or state management
     logger.info('Merged gesture result', result);

     // Enhanced performance monitoring for merged results
     performanceMonitor.recordGestureProcessing(
       result.processingTime,
       result.gesture,
       result.confidence,
       result.emergency || false,
       true, // Merged results are considered successful
       undefined
     );
   }

  /**
   * Log emergency gesture performance metrics
   */
  private logEmergencyPerformance(
    processingTime: number,
    gesture: string | null,
    confidence: number,
    success: boolean
  ): void {
    const emergencyMetrics = {
      processingTime,
      gesture: gesture || 'unknown',
      confidence,
      success,
      timestamp: Date.now(),
      isWithinTarget: processingTime < 50, // Amy First target: <50ms for emergencies
    };

    logger.performanceMetric('emergency_gesture_processing', processingTime, emergencyMetrics);

    // Log warnings for slow emergency processing
    if (processingTime > 50) {
      logger.warn(`Slow emergency gesture processing: ${processingTime}ms for ${gesture}`, emergencyMetrics);
    }

    // Track emergency success rate
    if (success) {
      logger.info('Emergency gesture processed successfully', emergencyMetrics);
    } else {
      logger.error('Emergency gesture processing failed', emergencyMetrics);
    }
  }

  /**
   * Log landmark processing performance metrics
   */
  private logLandmarkProcessingMetrics(
    processingTime: number,
    landmarkCount: number,
    success: boolean
  ): void {
    const landmarkMetrics = {
      processingTime,
      landmarkCount,
      success,
      processingTimePerLandmark: processingTime / landmarkCount,
      timestamp: Date.now(),
    };

    logger.performanceMetric('landmark_processing', processingTime, landmarkMetrics);

    // Track processing efficiency
    const timePerLandmark = processingTime / landmarkCount;
    if (timePerLandmark > 0.5) { // More than 0.5ms per landmark
      logger.warn(`Slow landmark processing: ${timePerLandmark.toFixed(2)}ms per landmark`, landmarkMetrics);
    }
  }

  /**
   * Log OpenAI processing performance metrics
   */
  private logOpenAIPerformance(
    processingTime: number,
    validationResult: any,
    expectedGesture: string | null,
    success: boolean
  ): void {
    const openaiMetrics = {
      processingTime,
      expectedGesture,
      actualGesture: validationResult.gesture,
      confidence: validationResult.confidence,
      qualityScore: validationResult.quality_score,
      feedback: validationResult.feedback,
      success,
      isCorrect: validationResult.gesture === expectedGesture,
      timestamp: Date.now(),
      isWithinTarget: processingTime < 2000, // Target: <2 seconds for OpenAI
    };

    logger.performanceMetric('openai_processing', processingTime, openaiMetrics);

    // Log warnings for slow or incorrect OpenAI processing
    if (processingTime > 2000) {
      logger.warn(`Slow OpenAI processing: ${processingTime}ms`, openaiMetrics);
    }

    if (!success) {
      logger.warn('OpenAI processing failed', openaiMetrics);
    }

    if (validationResult.gesture !== expectedGesture && expectedGesture) {
      logger.info('OpenAI corrected gesture', {
        ...openaiMetrics,
        correction: `${expectedGesture} -> ${validationResult.gesture}`,
      });
    }
  }

  /**
   * Enhanced result merging with performance tracking
   */
  private attemptResultMerging(
    mediapipeResult: GestureResult,
    openaiResult: GestureResult
  ): GestureResult | null {
    const mergeStartTime = Date.now();

    // Only merge if results are reasonably close in time
    const timeDiff = Math.abs(openaiResult.timestamp - mediapipeResult.timestamp);
    if (timeDiff > 1000) {
      logger.debug('Skipping merge: results too far apart in time', { timeDiff });
      return null; // Don't merge if more than 1 second apart
    }

    // Determine if merging makes sense
    const shouldMerge = this.shouldMergeResults(mediapipeResult, openaiResult);

    if (shouldMerge) {
      const mergedResult: GestureResult = {
        gesture: this.selectBestGesture(mediapipeResult, openaiResult),
        confidence: Math.max(mediapipeResult.confidence, openaiResult.confidence),
        source: 'combined',
        processingTime: Math.max(mediapipeResult.processingTime, openaiResult.processingTime),
        timestamp: Math.max(mediapipeResult.timestamp, openaiResult.timestamp),
      };

      this.mergeOptionalResultFields(mergedResult, mediapipeResult, openaiResult);

      this.stats.combinedResults++;

      // Log merge performance
      const mergeTime = Date.now() - mergeStartTime;
      logger.performanceMetric('result_merging', mergeTime, {
        mediapipeConfidence: mediapipeResult.confidence,
        openaiConfidence: openaiResult.confidence,
        mergedConfidence: mergedResult.confidence,
        timeDiff,
        mergeTime,
      });

      // Emit merged result
      this.emitMergedResult(mergedResult);
      return mergedResult;
    }

    logger.debug('Skipping merge: results not suitable for merging', {
      mediapipeGesture: mediapipeResult.gesture,
      openaiGesture: openaiResult.gesture,
      mediapipeConfidence: mediapipeResult.confidence,
      openaiConfidence: openaiResult.confidence,
    });

    return null;
  }

  /**
   * Get cached result for a specific timestamp
   */
  getCachedResult(timestamp: number): GestureResult | null {
    const cacheKey = `gesture_${timestamp}`;
    const cached = this.resultCache.get(cacheKey);

    if (cached) {
      this.stats.cacheHits++;
    }

    return cached || null;
  }

  // (Removed duplicate processMediaPipeResult implementation)

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      mediapipeResults: 0,
      openaiResults: 0,
      combinedResults: 0,
      averageProcessingTime: 0,
      cacheHits: 0,
      errors: 0,
    };
  }

  /**
   * Get processing statistics
   */
  getStats(): ProcessingStats {
    return { ...this.stats };
  }

  /**
   * Update processing options
   */
  updateOptions(newOptions: Partial<ParallelProcessingOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }

  /**
   * Get enhanced performance metrics including system health
   */
  getEnhancedPerformanceMetrics(): {
    basic: ProcessingStats;
    systemHealth: {
      averageProcessingTime: number;
      emergencyResponseTime: number;
      cacheEfficiency: number;
      errorRate: number;
      concurrentLoad: number;
    };
    recommendations: string[];
  } {
    const basic = this.getStats();
    const performanceReport = performanceMonitor.getPerformanceReport();

    // Calculate enhanced metrics
    const emergencyResponseTime = performanceReport.metrics.emergencyResponseTime;
    const cacheEfficiency = basic.cacheHits / Math.max(basic.mediapipeResults + basic.openaiResults, 1);
    const errorRate = basic.errors / Math.max(basic.mediapipeResults + basic.openaiResults, 1);
    const concurrentLoad = this.processingQueue.size;

    // Generate recommendations based on metrics
    const recommendations: string[] = [];

    if (performanceReport.metrics.averageProcessingTime > 50) {
      recommendations.push('Erwägen Sie, die Verarbeitungslast zu reduzieren oder die MediaPipe-Konfiguration zu optimieren');
    }

    if (emergencyResponseTime > 30) {
      recommendations.push('Die Notfall-Reaktionszeit überschreitet das Amy‑First‑Ziel von 30 ms');
    }

    if (errorRate > 0.1) {
      recommendations.push('Hohe Fehlerrate erkannt – OpenAI‑API‑Konnektivität prüfen');
    }

    if (concurrentLoad > this.options.maxConcurrentRequests * 0.8) {
      recommendations.push('Grenze für gleichzeitige Anfragen wird erreicht – Erhöhung von maxConcurrentRequests in Erwägung ziehen');
    }

    if (cacheEfficiency < 0.3) {
      recommendations.push('Niedrige Cache‑Effizienz – Ergebnisse werden möglicherweise nicht optimal wiederverwendet');
    }

    return {
      basic,
      systemHealth: {
        averageProcessingTime: performanceReport.metrics.averageProcessingTime,
        emergencyResponseTime,
        cacheEfficiency,
        errorRate,
        concurrentLoad,
      },
      recommendations,
    };
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
     // Wait for any in-flight OpenAI requests to settle to avoid keeping Node's
     // event loop active in tests
     await Promise.allSettled(this.processingQueue.values());

     this.frameQueue = [];
     this.processingQueue.clear();
     this.resultCache.clear();
     this.frameCounter = 0;
     this.isProcessing = false;

     // Clear logging context
     logger.clearContext();
   }
}

// Export singleton instance
export const parallelGestureProcessor = new ParallelGestureProcessor();

// Export class for testing or custom instances
export { ParallelGestureProcessor };
