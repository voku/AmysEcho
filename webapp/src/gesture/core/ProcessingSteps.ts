import { GestureDetectorConfig } from '../config/GestureConfig';
import { GestureSizeNormalizer, PartialGestureDetector } from '../gestureProcessing';
import { FallbackGestureDetector } from './FallbackGestureDetector';
import { HandStabilityAssistant } from './HandStabilityAssistant';
import { TwoHandGesture } from '../types/MediaPipeTypes';
import { gestureDebugLog } from '../utils/DebugLogger';
import { ErrorRecoveryManager } from '../utils/ErrorRecoveryManager';
import { mapMediaPipeResult, NormalizedMediaPipeResult } from '../utils/mapMediaPipeResults';
import { OptimizedTremorCompensator } from '../utils/OptimizedTremorCompensator';
import { ProcessingContext, ProcessingStep } from '../utils/ProcessingPipeline';

export const MLP_CONFIDENCE_THRESHOLD =
  typeof window.__mlpThreshold === 'number' ? window.__mlpThreshold : 0.05;
export const MLP_NULL_LABEL = '_NULL_';

/**
 * Processing step for landmark preprocessing
 */
export class LandmarkPreprocessingStep implements ProcessingStep {
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
      rawLandmarks: context.landmarks,
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
export class StabilityAnalysisStep implements ProcessingStep {
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
export class GestureDetectionStep implements ProcessingStep {
  name = 'gesture_detection';
  isExpensive = true; // MediaPipe processing can be expensive

  constructor(private config: GestureDetectorConfig) {}

  async execute(context: ProcessingContext): Promise<any> {
    gestureDebugLog('detection', 'GestureDetectionStep executing', () => ({
      skipExpensive: context.skipExpensiveSteps,
    }), { sampleIntervalMs: 5000 });
    const rawResults = context.rawResults;
    const normalized = context.normalizedResults ?? mapMediaPipeResult(rawResults);
    const handednesses = normalized.handednesses;
    const rawHandednesses = rawResults?.handednesses ?? [];
    const handednessesForMlp =
      rawHandednesses.length > 0
        ? rawHandednesses
        : handednesses.map(hand => [{ categoryName: hand as 'Left' | 'Right' }]);

    const perHand = this.extractPerHandDetections(normalized);
    gestureDebugLog('detection', 'Per hand detections', () => ({
      count: perHand.length,
      detections: perHand,
    }), { sampleIntervalMs: 3000 });

    let selectedGesture: string | null = null;
    let selectedConfidence = 0;
    let detectionMethod: 'mediapipe' | 'mlp' | 'mlp_audio_only' | 'none' = 'none';
    let twoHandMetadata: TwoHandGesture | null = null;
    let audioOnlyDetection = false;

    // Determine best MediaPipe gesture candidate
    if (perHand.length > 0) {
      for (const candidate of perHand) {
        if (candidate.score > selectedConfidence) {
          selectedGesture = this.normalizeLabel(candidate.label);
          selectedConfidence = candidate.score;
          detectionMethod = 'mediapipe';
        }
      }

      // Attempt to form a two-hand gesture when both hands detected
      if (perHand.length >= 2) {
        const twoHandCandidate = this.resolveTwoHandGesture(perHand);
        if (twoHandCandidate) {
          selectedGesture = this.formatTwoHandGesture(twoHandCandidate.gesture);
          selectedConfidence = twoHandCandidate.score;
          detectionMethod = 'mediapipe';
          twoHandMetadata = twoHandCandidate.gesture;
        }
      }
    }

    // Check for audio-only detection when no visual landmarks are present
    // This enables Amy to communicate via speech when she's not signing
    const hasVisualLandmarks = (context.landmarks ?? []).some(hand => hand.length > 0);
    const hasAudioFeatures = context.audioFeatures && context.audioFeatures.some(v => Math.abs(v) > 0.001);

    if (!hasVisualLandmarks && hasAudioFeatures && typeof window.__mlpPredict === 'function') {
      gestureDebugLog('audio', 'Audio-only detection attempted', () => ({
        hasAudioFeatures: !!hasAudioFeatures,
        audioFeaturesLength: context.audioFeatures?.length,
      }), { sampleIntervalMs: 2000 });

      try {
        // Call MLP with zero-padded visual landmarks but real audio features
        // This allows detection based purely on audio (Amy speaking without signing)
        const emptyLandmarks: number[][][] = [];
        const emptyHandedness: any[] = [];
        const mlpAudioResult = window.__mlpPredict(
          emptyLandmarks,
          emptyHandedness,
          undefined,
          undefined,
          context.audioFeatures
        );

        if (mlpAudioResult && typeof mlpAudioResult.score === 'number') {
          const audioThreshold = this.config?.thresholds?.mlpConfidence ?? MLP_CONFIDENCE_THRESHOLD;

          if (mlpAudioResult.label !== MLP_NULL_LABEL && mlpAudioResult.score >= audioThreshold) {
            gestureDebugLog('audio', 'Audio-only detection successful', () => ({
              label: mlpAudioResult.label,
              score: mlpAudioResult.score,
              threshold: audioThreshold,
            }), { sampleIntervalMs: 1000 });

            selectedGesture = this.normalizeLabel(mlpAudioResult.label);
            selectedConfidence = mlpAudioResult.score;
            detectionMethod = 'mlp_audio_only';
            audioOnlyDetection = true;
          }
        }
      } catch (error) {
        gestureDebugLog('audio', 'Audio-only detection failed', () => ({
          error: String(error),
        }), { sampleIntervalMs: 5000 });
      }
    }

    // Invoke custom MLP if available and better than MediaPipe result
    let mlpMetadata: { label: string; score: number } | null = null;
    gestureDebugLog('mlp', 'Checking MLP availability', () => ({
      available: typeof window.__mlpPredict === 'function',
    }), { sampleIntervalMs: 10000 });
    if (typeof window.__mlpPredict === 'function') {
      gestureDebugLog('mlp', 'MLP function available, attempting prediction', () => ({
        landmarksCount: context.landmarks?.length ?? 0,
        poseCount: context.poseLandmarks?.length ?? 0,
        faceCount: context.faceLandmarks?.length ?? 0,
      }), { sampleIntervalMs: 5000 });
      try {
        // The embedded MLP expects MediaPipe's handedness structure to decide which
        // hand should be mirrored, so prefer the raw array when available. Fall
        // back to the normalized labels only if MediaPipe omitted handedness
        // information entirely.
        const mlpResult = window.__mlpPredict(
          context.rawLandmarks ?? context.landmarks ?? [],
          handednessesForMlp,
          context.poseLandmarks,
          context.faceLandmarks,
          context.audioFeatures
        );
        gestureDebugLog('mlp', 'MLP prediction result', () => ({
          label: mlpResult?.label,
          score: mlpResult?.score,
        }), { sampleIntervalMs: 2000 });
        if (mlpResult && typeof mlpResult.score === 'number') {
          mlpMetadata = mlpResult;
          const threshold = this.config?.thresholds?.mlpConfidence ?? MLP_CONFIDENCE_THRESHOLD;
          gestureDebugLog('mlp', 'MLP threshold check', () => ({
            score: mlpResult.score,
            threshold,
            selectedConfidence,
          }), { sampleIntervalMs: 3000 });
          // Calculate confidence margin - require higher confidence to override mediapipe
          const isMediaPipeConfident = selectedConfidence > 0.3;
          const confidenceMargin = isMediaPipeConfident ? 0.15 : 0;

          if (mlpResult.label === MLP_NULL_LABEL) {
            gestureDebugLog('mlp', `Ignoring background noise (${MLP_NULL_LABEL})`, undefined, { sampleIntervalMs: 2000 });
          } else if (mlpResult.score >= threshold &&
              (selectedGesture === null ||
               selectedGesture === 'none' ||
               mlpResult.score >= (selectedConfidence + confidenceMargin))) {
            gestureDebugLog('mlp', 'MLP gesture selected', () => ({
              label: mlpResult.label,
              score: mlpResult.score,
              margin: confidenceMargin,
            }), { sampleIntervalMs: 2000 });
            selectedGesture = this.normalizeLabel(mlpResult.label);
            selectedConfidence = mlpResult.score;
            detectionMethod = 'mlp';
            twoHandMetadata = null;
          } else {
            gestureDebugLog('mlp', 'MLP gesture not selected', () => ({
              score: mlpResult.score,
              threshold,
              selectedConfidence,
              margin: confidenceMargin,
            }), { sampleIntervalMs: 3000 });
          }
        } else {
          gestureDebugLog('mlp', 'MLP result invalid', () => ({
            hasResult: !!mlpResult,
            hasScore: typeof mlpResult?.score === 'number',
          }), { sampleIntervalMs: 5000 });
        }
      } catch (error) {
        gestureDebugLog('mlp', 'MLP prediction failed', () => ({
          error: error instanceof Error ? error.message : String(error),
        }), { sampleIntervalMs: 5000, level: 'warn' });
        const predictionPrefix = typeof window.__predictionError === 'string' && window.__predictionError.length > 0
          ? window.__predictionError
          : 'MLP prediction failed: ';
        try {
          window.ReactNativeWebView?.postMessage?.(
            JSON.stringify({
              type: 'error',
              message: `${predictionPrefix}${error instanceof Error ? error.message : String(error)}`,
              _technical: {
                stack: error instanceof Error ? error.stack ?? null : null,
              }
            })
          );
        } catch {
          // Silently ignore post message errors to React Native to avoid console spam.
          // These errors are expected when running in browser environments without the React Native WebView.
        }
      }
    }

    return {
      gesture: selectedGesture,
      confidence: selectedConfidence,
      landmarks: context.landmarks,
      metadata: {
        method: detectionMethod,
        perHand: perHand.map(({ hand, label, score }) => ({ hand, label, score })),
        handednesses,
        mlp: mlpMetadata,
        twoHand: twoHandMetadata,
        audioOnly: audioOnlyDetection
      }
    };
  }

  private extractPerHandDetections(
    normalized: NormalizedMediaPipeResult
  ): Array<{ index: number; hand: string; label: string; score: number }> {
    const detections: Array<{ index: number; hand: string; label: string; score: number }> = [];

    normalized.hands.forEach((hand, index) => {
      const topGesture = hand.gestures[0];
      if (!topGesture) {
        return;
      }

      const normalizedLabel = this.normalizeLabel(topGesture.label);
      if (!normalizedLabel) {
        return;
      }

      detections.push({
        index,
        hand: hand.handedness ?? 'unknown',
        label: normalizedLabel,
        score: topGesture.score
      });
    });

    return detections;
  }

  private resolveTwoHandGesture(
    perHand: Array<{ index: number; hand: string; label: string; score: number }>
  ): { gesture: TwoHandGesture; score: number } | null {
    if (perHand.length < 2) {
      return null;
    }

    const leftCandidate = this.findCandidate(perHand, /left/i);
    const rightCandidate = this.findCandidate(perHand, /right/i, leftCandidate?.index);

    const finalLeft = leftCandidate ?? null;
    const finalRight = rightCandidate ?? null;

    if (!finalLeft || !finalRight) {
      return null;
    }

    return {
      gesture: {
        left: finalLeft.label,
        right: finalRight.label
      },
      score: Math.sqrt(finalLeft.score * finalRight.score)
    };
  }

  private findCandidate(
    perHand: Array<{ index: number; hand: string; label: string; score: number }>,
    pattern: RegExp,
    excludeIndex?: number
  ): { index: number; hand: string; label: string; score: number } | undefined {
    return perHand.find(candidate => {
      if (excludeIndex !== undefined && candidate.index === excludeIndex) {
        return false;
      }
      return pattern.test(candidate.hand);
    });
  }

  private formatTwoHandGesture(gesture: TwoHandGesture): string {
    return `${gesture.left}+${gesture.right}`;
  }

  private normalizeLabel(label?: string | null): string | null {
    if (!label) {
      return null;
    }
    const normalized = label.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
  }
}

/**
 * Processing step for partial gesture analysis
 */
export class PartialGestureAnalysisStep implements ProcessingStep {
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
 * Processing step for fallback gesture detection
 */
export class FallbackProcessingStep implements ProcessingStep {
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
export class ResultProcessingStep implements ProcessingStep {
  name = 'result_processing';
  isExpensive = false;

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
