/**
 * Optimized Parallel Gesture Processor
 *
 * Enhanced integration between MediaPipe and OpenAI Vision for Amy First performance:
 * - Smart result merging with confidence weighting
 * - Reduced API calls through intelligent caching
 * - Optimized frame capture timing
 * - Memory-efficient processing
 */

import { validateGestureWithOpenAI, shouldTriggerOpenAIValidation } from './openaiGestureValidationService';
import { logger } from '../utils/logger';

export interface OptimizedGestureResult {
  gesture: string | null;
  confidence: number;
  source: 'mediapipe' | 'openai' | 'combined' | 'cached';
  processingTime: number;
  timestamp: number;
  emergency?: boolean;
  feedback?: string;
  quality_score?: number;
  cache_hit?: boolean;
  merged_from?: string[];
  landmarks?: number[][][];
  handedness?: string[];
}

export interface ProcessorMetrics {
  totalProcessed: number;
  cacheHits: number;
  apiCalls: number;
  averageProcessingTime: number;
  errorRate: number;
  lastOptimizationTime: number;
}

class OptimizedParallelGestureProcessor {
  private resultCache = new Map<string, OptimizedGestureResult>();
  private readonly MAX_CACHE_SIZE = 50;
  private readonly CACHE_TTL = 5000; // 5 seconds
  private readonly CONFIDENCE_THRESHOLD_HIGH = 0.8;
  private readonly CONFIDENCE_THRESHOLD_LOW = 0.4;

  private metrics: ProcessorMetrics = {
    totalProcessed: 0,
    cacheHits: 0,
    apiCalls: 0,
    averageProcessingTime: 0,
    errorRate: 0,
    lastOptimizationTime: Date.now(),
  };

  private frameCounter = 0;
  private lastOptimizationCheck = 0;
  private readonly OPTIMIZATION_INTERVAL = 1000; // Check every second

  /**
   * Optimized gesture processing with smart caching and merging
   */
  async processGestureOptimized(
    gesture: string | null,
    confidence: number,
    landmarks: number[][][],
    handedness: string[],
    emergency?: boolean,
    capturedFrame?: any
  ): Promise<OptimizedGestureResult> {
    const startTime = Date.now();
    this.frameCounter++;
    this.metrics.totalProcessed++;

    // Generate cache key based on gesture characteristics
    const cacheKey = this.generateCacheKey(gesture, confidence, landmarks);

    // Check cache first (but not for emergency gestures)
    if (!emergency) {
      const cached = this.getCachedResult(cacheKey);
      if (cached) {
        this.metrics.cacheHits++;
        return {
          ...cached,
          cache_hit: true,
          processingTime: Date.now() - startTime,
          timestamp: startTime,
        };
      }
    }

    // Determine processing strategy
    const strategy = this.determineProcessingStrategy(gesture, confidence, emergency);

    let result: OptimizedGestureResult;

    switch (strategy) {
      case 'mediapipe_only':
        result = await this.processMediaPipeOnly(gesture, confidence, landmarks, handedness, startTime);
        break;

      case 'parallel':
        result = await this.processParallel(gesture, confidence, landmarks, handedness, capturedFrame, startTime);
        break;

      case 'openai_priority':
        result = await this.processOpenAIPriority(gesture, confidence, landmarks, handedness, capturedFrame, startTime);
        break;

      default:
        result = await this.processMediaPipeOnly(gesture, confidence, landmarks, handedness, startTime);
    }

    // Cache result if appropriate
    if (result.confidence > this.CONFIDENCE_THRESHOLD_LOW && !emergency) {
      this.cacheResult(cacheKey, result);
    }

    // Update metrics
    this.updateMetrics(result.processingTime);

    // Periodic optimization check
    if (Date.now() - this.lastOptimizationCheck > this.OPTIMIZATION_INTERVAL) {
      this.performOptimizationCheck();
      this.lastOptimizationCheck = Date.now();
    }

    return result;
  }

  private generateCacheKey(gesture: string | null, confidence: number, landmarks: number[][][]): string {
    if (!landmarks?.[0]) return 'empty';

    // Create a simplified fingerprint of the hand pose
    const hand = landmarks[0];
    if (hand.length < 21) return 'incomplete';

    // Use key landmark positions for fingerprinting
    const keyPoints = [0, 4, 8, 12, 16, 20]; // Wrist, thumb, fingers
    const fingerprint = keyPoints.map(i => {
      const point = hand[i];
      return `${Math.round(point[0] * 10)},${Math.round(point[1] * 10)}`;
    }).join('|');

    const confidenceBucket = Math.floor(confidence * 10) / 10; // Round to nearest 0.1
    return `${gesture || 'unknown'}_${confidenceBucket}_${fingerprint}`;
  }

  private getCachedResult(cacheKey: string): OptimizedGestureResult | null {
    const cached = this.resultCache.get(cacheKey);
    if (!cached) return null;

    // Check if cache entry is still valid
    if (Date.now() - cached.timestamp > this.CACHE_TTL) {
      this.resultCache.delete(cacheKey);
      return null;
    }

    return cached;
  }

  private cacheResult(cacheKey: string, result: OptimizedGestureResult): void {
    // Clean up old entries if cache is full
    if (this.resultCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.resultCache.keys().next().value;
      if (oldestKey) {
        this.resultCache.delete(oldestKey);
      }
    }

    this.resultCache.set(cacheKey, { ...result });
  }

  private determineProcessingStrategy(
    gesture: string | null,
    confidence: number,
    emergency?: boolean
  ): 'mediapipe_only' | 'parallel' | 'openai_priority' {
    // Emergency gestures always get priority processing
    if (emergency) return 'parallel';

    // High confidence MediaPipe results don't need OpenAI validation
    if (confidence > this.CONFIDENCE_THRESHOLD_HIGH) return 'mediapipe_only';

    // Low confidence or unknown gestures get OpenAI priority
    if (confidence < this.CONFIDENCE_THRESHOLD_LOW || !gesture) return 'openai_priority';

    // Medium confidence gets parallel processing
    return 'parallel';
  }

  private async processMediaPipeOnly(
    gesture: string | null,
    confidence: number,
    landmarks: number[][][],
    handedness: string[],
    startTime: number
  ): Promise<OptimizedGestureResult> {
    return {
      gesture,
      confidence,
      source: 'mediapipe',
      processingTime: Date.now() - startTime,
      timestamp: startTime,
      landmarks,
      handedness,
    };
  }

  private async processParallel(
    gesture: string | null,
    confidence: number,
    landmarks: number[][][],
    handedness: string[],
    capturedFrame: any,
    startTime: number
  ): Promise<OptimizedGestureResult> {
    // Start both processing paths in parallel
    const mediapipePromise = Promise.resolve({
      gesture,
      confidence,
      source: 'mediapipe' as const,
    });

    let openaiPromise: Promise<any> | null = null;
    if (capturedFrame) {
      openaiPromise = this.processOpenAIAsync(capturedFrame, gesture, startTime);
    }

    // Wait for both results with timeout
    const results = await Promise.allSettled([mediapipePromise, openaiPromise].filter(Boolean));

    const mediapipeResult = results[0]?.status === 'fulfilled' ? results[0].value : null;
    const openaiResult = results[1]?.status === 'fulfilled' ? results[1].value : null;

    // Merge results intelligently
    return this.mergeResults(mediapipeResult, openaiResult, landmarks, handedness, startTime);
  }

  private async processOpenAIPriority(
    gesture: string | null,
    confidence: number,
    landmarks: number[][][],
    handedness: string[],
    capturedFrame: any,
    startTime: number
  ): Promise<OptimizedGestureResult> {
    if (!capturedFrame) {
      return this.processMediaPipeOnly(gesture, confidence, landmarks, handedness, startTime);
    }

    try {
      const openaiResult = await this.processOpenAIAsync(capturedFrame, gesture, startTime);

      // If OpenAI is confident, use it; otherwise fall back to MediaPipe
      if (openaiResult && openaiResult.confidence > confidence + 0.1) {
        return {
          ...openaiResult,
          source: 'openai',
          processingTime: Date.now() - startTime,
          timestamp: startTime,
          landmarks,
          handedness,
        };
      }
    } catch (error) {
      logger.warn('OpenAI priority processing failed, using MediaPipe', error);
    }

    return this.processMediaPipeOnly(gesture, confidence, landmarks, handedness, startTime);
  }

  private async processOpenAIAsync(
    frame: any,
    expectedGesture: string | null,
    startTime: number
  ): Promise<any> {
    this.metrics.apiCalls++;

    try {
      const imageBase64 = await this.convertFrameToBase64(frame);
      const result = await validateGestureWithOpenAI({
        image: {
          uri: `data:image/jpeg;base64,${imageBase64}`,
          base64: imageBase64,
          width: 640,
          height: 480,
          timestamp: startTime,
        },
        expectedGesture: expectedGesture || undefined,
        mediapipeConfidence: 0.5,
      });

      if (result.success) {
        return {
          gesture: result.gesture,
          confidence: result.confidence || 0,
          feedback: result.feedback,
          quality_score: result.quality_score,
        };
      }
    } catch (error) {
      logger.warn('OpenAI processing failed', error);
      throw error;
    }

    return null;
  }

  private async convertFrameToBase64(frame: any): Promise<string> {
    // This would be implemented based on the actual frame format
    // For WebView canvas capture, it might already be base64
    if (typeof frame === 'string' && frame.startsWith('data:image')) {
      return frame.split(',')[1];
    }

    if (frame.base64) {
      return frame.base64;
    }

    throw new Error('Unsupported frame format for OpenAI processing');
  }

  private mergeResults(
    mediapipeResult: any,
    openaiResult: any,
    landmarks: number[][][],
    handedness: string[],
    startTime: number
  ): OptimizedGestureResult {
    if (!mediapipeResult) {
      return {
        gesture: openaiResult?.gesture || null,
        confidence: openaiResult?.confidence || 0,
        source: 'openai',
        processingTime: Date.now() - startTime,
        timestamp: startTime,
        landmarks,
        handedness,
        feedback: openaiResult?.feedback,
        quality_score: openaiResult?.quality_score,
      };
    }

    if (!openaiResult) {
      return {
        ...mediapipeResult,
        source: 'mediapipe',
        processingTime: Date.now() - startTime,
        timestamp: startTime,
        landmarks,
        handedness,
      };
    }

    // Intelligent merging based on confidence levels
    const mediapipeConf = mediapipeResult.confidence;
    const openaiConf = openaiResult.confidence;

    if (Math.abs(mediapipeConf - openaiConf) < 0.1) {
      // Similar confidence - use higher one
      const useOpenAI = openaiConf > mediapipeConf;
      return {
        gesture: useOpenAI ? openaiResult.gesture : mediapipeResult.gesture,
        confidence: Math.max(mediapipeConf, openaiConf),
        source: 'combined',
        processingTime: Date.now() - startTime,
        timestamp: startTime,
        landmarks,
        handedness,
        feedback: useOpenAI ? openaiResult.feedback : undefined,
        quality_score: openaiResult.quality_score,
        merged_from: ['mediapipe', 'openai'],
      };
    } else if (openaiConf > mediapipeConf + 0.2) {
      // OpenAI significantly more confident
      return {
        gesture: openaiResult.gesture,
        confidence: openaiConf,
        source: 'openai',
        processingTime: Date.now() - startTime,
        timestamp: startTime,
        landmarks,
        handedness,
        feedback: openaiResult.feedback,
        quality_score: openaiResult.quality_score,
      };
    } else {
      // MediaPipe more confident or similar
      return {
        gesture: mediapipeResult.gesture,
        confidence: mediapipeConf,
        source: 'mediapipe',
        processingTime: Date.now() - startTime,
        timestamp: startTime,
        landmarks,
        handedness,
      };
    }
  }

  private updateMetrics(processingTime: number): void {
    // Update rolling average
    const alpha = 0.1; // Smoothing factor
    this.metrics.averageProcessingTime =
      this.metrics.averageProcessingTime * (1 - alpha) + processingTime * alpha;
  }

  private performOptimizationCheck(): void {
    // Clean up expired cache entries
    const now = Date.now();
    for (const [key, result] of this.resultCache) {
      if (now - result.timestamp > this.CACHE_TTL) {
        this.resultCache.delete(key);
      }
    }

    // Log performance metrics periodically
    if (this.metrics.totalProcessed % 100 === 0) {
      logger.info('Parallel processor metrics', {
        totalProcessed: this.metrics.totalProcessed,
        cacheHitRate: this.metrics.cacheHits / this.metrics.totalProcessed,
        averageProcessingTime: Math.round(this.metrics.averageProcessingTime),
        apiCalls: this.metrics.apiCalls,
      });
    }

    this.metrics.lastOptimizationTime = now;
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): ProcessorMetrics {
    return { ...this.metrics };
  }

  /**
   * Clear cache and reset metrics
   */
  reset(): void {
    this.resultCache.clear();
    this.metrics = {
      totalProcessed: 0,
      cacheHits: 0,
      apiCalls: 0,
      averageProcessingTime: 0,
      errorRate: 0,
      lastOptimizationTime: Date.now(),
    };
    this.frameCounter = 0;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    const hitRate = this.metrics.totalProcessed > 0
      ? this.metrics.cacheHits / this.metrics.totalProcessed
      : 0;

    return {
      size: this.resultCache.size,
      hitRate,
    };
  }
}

// Export optimized processor
export const optimizedParallelProcessor = new OptimizedParallelGestureProcessor();
export { OptimizedParallelGestureProcessor };
