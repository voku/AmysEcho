import { GestureDetectorConfig } from '../config/GestureConfig';
import { GestureSizeNormalizer, PartialGestureDetector } from '../gestureProcessing';
import { LandmarkTemplateDetector, type TemplateMatchResult } from '../landmarkTemplateDetector';
import { FallbackGestureDetector } from './FallbackGestureDetector';
import { HandStabilityAssistant } from './HandStabilityAssistant';
import { HandednessCategory, MLPPrediction, TwoHandGesture } from '../types/MediaPipeTypes';
import { gestureDebugLog } from '../utils/DebugLogger';
import { ErrorRecoveryManager } from '../utils/ErrorRecoveryManager';
import { mapMediaPipeResult, NormalizedMediaPipeResult } from '../utils/mapMediaPipeResults';
import { OptimizedTremorCompensator } from '../utils/OptimizedTremorCompensator';
import {
  ProcessingContext,
  ProcessingResult,
  ProcessingStep,
} from '../utils/ProcessingPipeline';

const DEFAULT_MLP_CONFIDENCE_THRESHOLD = 0.45;

function resolveRuntimeMlpThreshold(): number {
  if (typeof window.__mlpThreshold !== 'number' || !Number.isFinite(window.__mlpThreshold)) {
    return DEFAULT_MLP_CONFIDENCE_THRESHOLD;
  }

  return Math.min(1, Math.max(0, window.__mlpThreshold));
}

export const MLP_CONFIDENCE_THRESHOLD = resolveRuntimeMlpThreshold();
export const MLP_NULL_LABEL = '_NULL_';

const RELAXED_BASELINE_THRESHOLD_MIN = 0.2;
const RELAXED_BASELINE_THRESHOLD_DELTA = 0.12;
const TEMPLATE_BASELINE_OVERRIDE_MIN_CONFIDENCE = 0.2;
const MLP_MIN_CANDIDATE_MARGIN = 0.15;

const CONFIDENT_MEDIAPIPE_THRESHOLD = 0.65;
const UNSURE_MEDIAPIPE_THRESHOLD = 0.35;
const CONFIDENT_TEMPLATE_THRESHOLD = 0.3;
const UNSURE_TEMPLATE_THRESHOLD = TEMPLATE_BASELINE_OVERRIDE_MIN_CONFIDENCE;
const CONFIDENT_AUDIO_ONLY_THRESHOLD = 0.6;
const UNSURE_AUDIO_ONLY_THRESHOLD = 0.4;
const UNSURE_MLP_DELTA = 0.12;

type DetectionConfidenceState = 'confident' | 'unsure' | 'none';

function normalizeBaselineLabel(label: string): string {
  return label.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function isBaselineGesture(label: string | null): boolean {
  return label !== null && MEDIAPIPE_BASELINE_GESTURES.has(normalizeBaselineLabel(label));
}

export const MEDIAPIPE_BASELINE_GESTURES = new Set([
  'none',
  'closed_fist',
  'fist',
  'open_palm',
  'pointing_up',
  'thumb_down',
  'thumb_up',
  'thumbs_down',
  'thumbs_up',
  'victory',
  'iloveyou',
]);

interface LandmarkPreprocessingResult {
  landmarks: number[][][];
  rawLandmarks?: number[][][];
  preprocessing: NonNullable<ProcessingResult['preprocessing']>;
}

interface StabilityAnalysisResult {
  stability: NonNullable<ProcessingResult['stability']>;
  feedback?: string;
}

interface MediaPipeSelection {
  gesture: string | null;
  confidence: number;
  method: 'mediapipe' | 'none';
  twoHandMetadata: TwoHandGesture | null;
  perHand: Array<{ hand: string; label: string; score: number }>;
  handednesses: string[];
}

interface AudioOnlySelection {
  gesture: string;
  confidence: number;
}

interface MlpSelection {
  gesture: string | null;
  confidence: number;
  method: 'mediapipe' | 'mlp' | 'mlp_audio_only' | 'landmark_template' | 'none';
  mlpMetadata: MLPPrediction | null;
  mlpDecision: {
    selected: boolean;
    reason:
      | 'selected'
      | 'selected_profile_vocab_priority'
      | 'selected_profile_vocab_relaxed_threshold'
      | 'below_threshold'
      | 'below_candidate_margin'
      | 'below_override_margin'
      | 'null_label'
      | 'invalid_result'
      | 'predictor_unavailable'
      | 'predictor_error'
      | 'invalid_label';
    threshold?: number;
    margin?: number;
    top1?: number;
    top2?: number;
    threshold_used?: number;
    score?: number;
    selectedConfidenceBeforeMlp?: number;
    selectedGestureBeforeMlp?: string | null;
  } | null;
  twoHandMetadata: TwoHandGesture | null;
}

function resolveTopCandidateScores(
  candidates: MLPPrediction['candidates'],
): { top1: number | null; top2: number | null; margin: number | null } {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { top1: null, top2: null, margin: null };
  }

  const validScores = candidates
    .map((candidate) => candidate?.score)
    .filter((score): score is number => typeof score === 'number' && Number.isFinite(score))
    .sort((left, right) => right - left);

  const top1 = validScores[0] ?? null;
  const top2 = validScores[1] ?? null;

  return {
    top1,
    top2,
    margin: top1 !== null && top2 !== null ? top1 - top2 : null,
  };
}

interface GestureDetectionResult {
  gesture: string | null;
  confidence: number;
  landmarks: number[][][];
  metadata: NonNullable<ProcessingResult['metadata']>;
}

interface PartialGestureResult {
  isPartial: boolean;
  completion: number;
  confidence: number;
  feedback: string;
  gesture: string;
}

interface PartialGestureAnalysisResult {
  partial: PartialGestureResult | null;
}

type FallbackValue = Exclude<ProcessingResult['fallback'], undefined>;

interface FallbackProcessingResult {
  fallback?: FallbackValue;
  isUsingFallback?: boolean;
}

interface ResultProcessingResult {
  finalResult: NonNullable<ProcessingResult['finalResult']>;
}

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

  async execute(context: ProcessingContext): Promise<LandmarkPreprocessingResult> {
    if (!context.landmarks || context.landmarks.length === 0) {
      return {
        landmarks: context.landmarks,
        preprocessing: {
          sizeNormalized: false,
          tremorCompensated: false,
        },
      };
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

  async execute(context: ProcessingContext): Promise<StabilityAnalysisResult> {
    if (!context.landmarks || context.landmarks.length === 0) {
      return { stability: { isStable: false, score: 0 } };
    }

    const stability = this.stabilityAssistant.analyzeStability(context.landmarks);

    return {
      stability: {
        isStable: stability.isStable,
        score: stability.stabilityScore,
      },
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
  private config: GestureDetectorConfig;
  private templateDetector: LandmarkTemplateDetector | null;

  constructor(config: GestureDetectorConfig, templateDetector?: LandmarkTemplateDetector) {
    this.config = config;
    this.templateDetector = templateDetector ?? null;
  }

  async execute(context: ProcessingContext): Promise<GestureDetectionResult> {
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

    const mediaPipeSelection = this.detectWithMediaPipe(normalized, handednesses);
    let selectedGesture = mediaPipeSelection.gesture;
    let selectedConfidence = mediaPipeSelection.confidence;
    let detectionMethod: MlpSelection['method'] = mediaPipeSelection.method;
    let twoHandMetadata = mediaPipeSelection.twoHandMetadata;
    let audioOnlyDetection = false;
    let templateMatch: TemplateMatchResult | null = null;

    // Try landmark template detection first – it is fast, reliable, and
    // specifically trained for Amy's custom gestures.
    if (this.templateDetector && this.templateDetector.getTemplateCount() > 0 && context.landmarks?.length > 0) {
      templateMatch = this.templateDetector.detect(
        context.rawLandmarks ?? context.landmarks,
        handednesses,
      );

      if (templateMatch) {
        const matchedTemplate = templateMatch;
        const normalizedTemplateLabel = this.normalizeLabel(matchedTemplate.label);
        const shouldPreferTemplateOverBaseline =
          !!normalizedTemplateLabel &&
          !!selectedGesture &&
          isBaselineGesture(selectedGesture) &&
          !isBaselineGesture(normalizedTemplateLabel) &&
          matchedTemplate.confidence >= TEMPLATE_BASELINE_OVERRIDE_MIN_CONFIDENCE;

        if (matchedTemplate.confidence > selectedConfidence || shouldPreferTemplateOverBaseline) {
          gestureDebugLog('template', 'Template match selected', () => ({
            label: matchedTemplate.label,
            confidence: matchedTemplate.confidence,
            distance: matchedTemplate.distance,
            selectedConfidence,
            shouldPreferTemplateOverBaseline,
          }), { sampleIntervalMs: 2000 });
          selectedGesture = normalizedTemplateLabel ?? matchedTemplate.label;
          selectedConfidence = matchedTemplate.confidence;
          detectionMethod = 'landmark_template';
          twoHandMetadata = null;
        }
      }
    }

    // Check for audio-only detection when no visual landmarks are present
    // This enables Amy to communicate via speech when she's not signing
    const audioOnlySelection = this.detectAudioOnly(context);
    if (audioOnlySelection) {
      selectedGesture = audioOnlySelection.gesture;
      selectedConfidence = audioOnlySelection.confidence;
      detectionMethod = 'mlp_audio_only';
      twoHandMetadata = null;
      audioOnlyDetection = true;
    }

    const mlpSelection = this.applyMlpDetection(
      context,
      handednessesForMlp,
      selectedGesture,
      selectedConfidence,
      detectionMethod,
      twoHandMetadata
    );

    selectedGesture = mlpSelection.gesture;
    selectedConfidence = mlpSelection.confidence;
    detectionMethod = mlpSelection.method;
    twoHandMetadata = mlpSelection.twoHandMetadata;

    const canRescueWithTemplate =
      templateMatch &&
      templateMatch.confidence >= TEMPLATE_BASELINE_OVERRIDE_MIN_CONFIDENCE &&
      (!selectedGesture || isBaselineGesture(selectedGesture)) &&
      mlpSelection.mlpDecision?.selected === false;

    if (canRescueWithTemplate && templateMatch) {
      const normalizedTemplateLabel = this.normalizeLabel(templateMatch.label);
      if (normalizedTemplateLabel) {
        selectedGesture = normalizedTemplateLabel;
        selectedConfidence = templateMatch.confidence;
        detectionMethod = 'landmark_template';
        twoHandMetadata = null;
      }
    }

    const confidenceState = this.resolveConfidenceState(
      detectionMethod,
      selectedConfidence,
      Boolean(selectedGesture),
    );

    return {
      gesture: confidenceState === 'none' ? null : selectedGesture,
      confidence: selectedConfidence,
      landmarks: context.landmarks,
      metadata: {
        method: detectionMethod,
        confidenceState,
        perHand: mediaPipeSelection.perHand.map(({ hand, label, score }) => ({ hand, label, score })),
        handednesses: mediaPipeSelection.handednesses,
        mlp: mlpSelection.mlpMetadata,
        mlpDecision: mlpSelection.mlpDecision,
        twoHand: twoHandMetadata,
        audioOnly: audioOnlyDetection,
        templateMatch: templateMatch ?? null,
      }
    };
  }


  private resolveConfidenceState(
    method: MlpSelection['method'],
    confidence: number,
    hasGesture: boolean,
  ): DetectionConfidenceState {
    if (!hasGesture) {
      return 'none';
    }

    const calibrated = this.getCalibratedThresholds(method);
    if (confidence >= calibrated.confident) {
      return 'confident';
    }
    if (confidence >= calibrated.unsure) {
      return 'unsure';
    }
    return 'none';
  }

  private getCalibratedThresholds(method: MlpSelection['method']): { confident: number; unsure: number } {
    const mlpThreshold = this.config?.thresholds?.mlpConfidence ?? MLP_CONFIDENCE_THRESHOLD;
    const unsureMlpThreshold = Math.max(RELAXED_BASELINE_THRESHOLD_MIN, mlpThreshold - UNSURE_MLP_DELTA);

    if (method === 'mlp') {
      return { confident: mlpThreshold, unsure: unsureMlpThreshold };
    }
    if (method === 'mlp_audio_only') {
      return { confident: CONFIDENT_AUDIO_ONLY_THRESHOLD, unsure: UNSURE_AUDIO_ONLY_THRESHOLD };
    }
    if (method === 'landmark_template') {
      return { confident: CONFIDENT_TEMPLATE_THRESHOLD, unsure: UNSURE_TEMPLATE_THRESHOLD };
    }
    if (method === 'mediapipe') {
      return { confident: CONFIDENT_MEDIAPIPE_THRESHOLD, unsure: UNSURE_MEDIAPIPE_THRESHOLD };
    }

    return { confident: 1, unsure: 1 };
  }

  private detectWithMediaPipe(
    normalized: NormalizedMediaPipeResult,
    handednesses: string[]
  ): MediaPipeSelection {
    const perHand = this.extractPerHandDetections(normalized);
    gestureDebugLog('detection', 'Per hand detections', () => ({
      count: perHand.length,
      detections: perHand,
    }), { sampleIntervalMs: 3000 });

    let selectedGesture: string | null = null;
    let selectedConfidence = 0;
    let twoHandMetadata: TwoHandGesture | null = null;

    if (perHand.length > 0) {
      for (const candidate of perHand) {
        if (candidate.score > selectedConfidence) {
          selectedGesture = this.normalizeLabel(candidate.label);
          selectedConfidence = candidate.score;
        }
      }

      if (perHand.length >= 2) {
        const twoHandCandidate = this.resolveTwoHandGesture(perHand);
        if (twoHandCandidate) {
          selectedGesture = this.formatTwoHandGesture(twoHandCandidate.gesture);
          selectedConfidence = twoHandCandidate.score;
          twoHandMetadata = twoHandCandidate.gesture;
        }
      }
    }

    return {
      gesture: selectedGesture,
      confidence: selectedConfidence,
      method: perHand.length > 0 ? 'mediapipe' : 'none',
      twoHandMetadata,
      perHand,
      handednesses,
    };
  }

  private detectAudioOnly(context: ProcessingContext): AudioOnlySelection | null {
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
        const emptyHandedness: HandednessCategory[][] = [];
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

            const normalizedLabel = this.normalizeLabel(mlpAudioResult.label);
            if (normalizedLabel) {
              return {
                gesture: normalizedLabel,
                confidence: mlpAudioResult.score,
              };
            }
          }
        }
      } catch (error) {
        gestureDebugLog('audio', 'Audio-only detection failed', () => ({
          error: String(error),
        }), { sampleIntervalMs: 5000 });
      }
    }

    return null;
  }

  private applyMlpDetection(
    context: ProcessingContext,
    handednessesForMlp: HandednessCategory[][],
    selectedGesture: string | null,
    selectedConfidence: number,
    detectionMethod: MlpSelection['method'],
    twoHandMetadata: TwoHandGesture | null,
  ): MlpSelection {
    const buildResult = (
      decision: MlpSelection['mlpDecision'],
      metadata: MLPPrediction | null,
      gesture = selectedGesture,
      confidence = selectedConfidence,
      method = detectionMethod,
      twoHand: TwoHandGesture | null = twoHandMetadata,
    ): MlpSelection => ({
      gesture,
      confidence,
      method,
      mlpMetadata: metadata,
      mlpDecision: decision,
      twoHandMetadata: twoHand,
    });

    gestureDebugLog('mlp', 'Checking MLP availability', () => ({
      available: typeof window.__mlpPredict === 'function',
    }), { sampleIntervalMs: 10000 });

    if (typeof window.__mlpPredict !== 'function') {
      return buildResult({
        selected: false,
        reason: 'predictor_unavailable',
        selectedConfidenceBeforeMlp: selectedConfidence,
        selectedGestureBeforeMlp: selectedGesture,
      }, null);
    }

    gestureDebugLog('mlp', 'MLP function available, attempting prediction', () => ({
      landmarksCount: context.landmarks?.length ?? 0,
      poseCount: context.poseLandmarks?.length ?? 0,
      faceCount: context.faceLandmarks?.length ?? 0,
    }), { sampleIntervalMs: 5000 });

    try {
      const mlpResult = window.__mlpPredict(
        context.rawLandmarks ?? context.landmarks ?? [],
        handednessesForMlp,
        context.poseLandmarks,
        context.faceLandmarks,
        context.audioFeatures,
      );
      gestureDebugLog('mlp', 'MLP prediction result', () => ({
        label: mlpResult?.label,
        score: mlpResult?.score,
      }), { sampleIntervalMs: 2000 });

      if (!mlpResult || typeof mlpResult.score !== 'number') {
        return buildResult({
          selected: false,
          reason: 'invalid_result',
          selectedConfidenceBeforeMlp: selectedConfidence,
          selectedGestureBeforeMlp: selectedGesture,
        }, null);
      }

      const threshold = this.config?.thresholds?.mlpConfidence ?? MLP_CONFIDENCE_THRESHOLD;
      const candidateScores = resolveTopCandidateScores(mlpResult.candidates);
      const topCandidateMargin = candidateScores.margin;
      const isCandidateMarginTooSmall =
        topCandidateMargin !== null && topCandidateMargin < MLP_MIN_CANDIDATE_MARGIN;
      const confidenceMargin = selectedConfidence > 0.3 ? 0.15 : 0;

      gestureDebugLog('mlp', 'MLP threshold check', () => ({
        score: mlpResult.score,
        threshold,
        selectedConfidence,
        topCandidateMargin,
      }), { sampleIntervalMs: 3000 });

      if (mlpResult.label === MLP_NULL_LABEL) {
        return buildResult({
          selected: false,
          reason: 'null_label',
          threshold,
          score: mlpResult.score,
          selectedConfidenceBeforeMlp: selectedConfidence,
          selectedGestureBeforeMlp: selectedGesture,
        }, mlpResult);
      }

      const normalizedMlpLabel = this.normalizeLabel(mlpResult.label);
      if (!normalizedMlpLabel) {
        return buildResult({
          selected: false,
          reason: 'invalid_label',
          threshold,
          score: mlpResult.score,
          selectedConfidenceBeforeMlp: selectedConfidence,
          selectedGestureBeforeMlp: selectedGesture,
        }, mlpResult);
      }

      const shouldPreferMlpOverBaseline =
        !!normalizedMlpLabel &&
        !!selectedGesture &&
        isBaselineGesture(selectedGesture) &&
        !isBaselineGesture(normalizedMlpLabel);
      const relaxedBaselineThreshold = Math.max(
        RELAXED_BASELINE_THRESHOLD_MIN,
        threshold - RELAXED_BASELINE_THRESHOLD_DELTA,
      );
      const canSelectMlpByRelaxedBaseline =
        shouldPreferMlpOverBaseline &&
        mlpResult.score < threshold &&
        mlpResult.score >= relaxedBaselineThreshold;
      const isMediaPipeBlockingMlp =
        selectedGesture !== null &&
        selectedGesture !== 'none' &&
        mlpResult.score < (selectedConfidence + confidenceMargin) &&
        !shouldPreferMlpOverBaseline;
      const canSelectMlp =
        !isCandidateMarginTooSmall &&
        (mlpResult.score >= threshold || canSelectMlpByRelaxedBaseline) &&
        !isMediaPipeBlockingMlp;

      if (!canSelectMlp) {
        const shouldAbstain =
          selectedGesture !== null &&
          isBaselineGesture(selectedGesture) &&
          (isCandidateMarginTooSmall || mlpResult.score < threshold);

        return buildResult({
          selected: false,
          reason: isCandidateMarginTooSmall
            ? 'below_candidate_margin'
            : mlpResult.score < threshold
              ? 'below_threshold'
              : 'below_override_margin',
          threshold,
          margin: confidenceMargin,
          top1: candidateScores.top1 ?? mlpResult.score,
          ...(candidateScores.top2 !== null ? { top2: candidateScores.top2 } : {}),
          threshold_used: threshold,
          score: mlpResult.score,
          selectedConfidenceBeforeMlp: selectedConfidence,
          selectedGestureBeforeMlp: selectedGesture,
        },
        mlpResult,
        shouldAbstain ? null : selectedGesture,
        shouldAbstain ? 0 : selectedConfidence,
        shouldAbstain ? 'none' : detectionMethod,
        shouldAbstain ? null : twoHandMetadata,
      );
      }

      return buildResult(
        {
          selected: true,
          reason: canSelectMlpByRelaxedBaseline
            ? 'selected_profile_vocab_relaxed_threshold'
            : (shouldPreferMlpOverBaseline ? 'selected_profile_vocab_priority' : 'selected'),
          threshold,
          margin: confidenceMargin,
          top1: candidateScores.top1 ?? mlpResult.score,
          ...(candidateScores.top2 !== null ? { top2: candidateScores.top2 } : {}),
          threshold_used: threshold,
          score: mlpResult.score,
          selectedConfidenceBeforeMlp: selectedConfidence,
          selectedGestureBeforeMlp: selectedGesture,
        },
        mlpResult,
        normalizedMlpLabel,
        mlpResult.score,
        'mlp',
        null,
      );
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
          }),
        );
      } catch {
        // Ignore postMessage failures in browser-only environments.
      }

      return buildResult({
        selected: false,
        reason: 'predictor_error',
        selectedConfidenceBeforeMlp: selectedConfidence,
        selectedGestureBeforeMlp: selectedGesture,
      }, null);
    }
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

  async execute(context: ProcessingContext): Promise<PartialGestureAnalysisResult> {
    if (!context.landmarks || context.landmarks.length === 0) {
      return { partial: null };
    }

    // Analyze common gestures for partial completion
    const commonGestures = ['thumbs_up', 'open_palm', 'fist', 'point'];
    let bestPartial: PartialGestureResult | null = null;

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

  async execute(context: ProcessingContext): Promise<FallbackProcessingResult> {
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

  async execute(context: ProcessingContext): Promise<ResultProcessingResult> {
    // Final result processing and validation
    return {
      finalResult: {
        validated: true,
        timestamp: context.timestamp
      }
    };
  }
}
