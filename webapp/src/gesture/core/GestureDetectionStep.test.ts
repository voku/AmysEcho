import { describe, it, expect, afterEach, vi } from 'vitest';
import { GestureDetectionStep } from './ProcessingSteps';
import { LandmarkTemplateDetector } from '../landmarkTemplateDetector';
import type { GestureDetectorConfig } from '../config/GestureConfig';
import type { MediaPipeGestureResult } from '../types/MediaPipeTypes';

function createDetectionContext({
  landmarks = [],
  handLabel,
  handScore,
  audioFeatures,
}: {
  landmarks?: number[][][];
  handLabel?: string;
  handScore?: number;
  audioFeatures?: number[];
} = {}) {
  const hasHand = typeof handLabel === 'string' && typeof handScore === 'number';

  return {
    landmarks,
    timestamp: Date.now(),
    processingStep: 'gesture_detection',
    skipExpensiveSteps: false,
    normalizedResults: {
      hands: hasHand
        ? [
            {
              handedness: 'Left',
              landmarks: [],
              gestures: [{ label: handLabel, score: handScore }],
            },
          ]
        : [],
      landmarks: [],
      handednesses: hasHand ? ['Left'] : [],
    },
    rawResults: {
      gestures: hasHand ? [[{ categoryName: handLabel, score: handScore }]] : [],
      landmarks: [],
      handednesses: hasHand ? [[{ categoryName: 'Left' }]] : [],
    } as MediaPipeGestureResult,
    ...(audioFeatures ? { audioFeatures } : {}),
  } as const;
}

describe('GestureDetectionStep', () => {
  const baseConfig = {
    thresholds: { mlpConfidence: 0.4 },
  } as unknown as GestureDetectorConfig;

  const createStep = () => new GestureDetectionStep(baseConfig);

  afterEach(() => {
    (window as any).__mlpPredict = undefined;
  });

  it('selects the highest confidence MediaPipe gesture per hand', async () => {
    const step = createStep();
    const context = createDetectionContext({ handLabel: 'Open_Palm', handScore: 0.62 });

    const result = await step.execute(context as any);

    expect(result.gesture).toBe('open_palm');
    expect(result.confidence).toBeCloseTo(0.62);
    expect(result.metadata?.method).toBe('mediapipe');
  });

  it('combines two hands into a normalized gesture string', async () => {
    const step = createStep();
    const context = {
      ...createDetectionContext(),
      normalizedResults: {
        hands: [
          {
            handedness: 'Left',
            landmarks: [],
            gestures: [{ label: 'Thumbs_Up', score: 0.8 }],
          },
          {
            handedness: 'Right',
            landmarks: [],
            gestures: [{ label: 'Fist', score: 0.7 }],
          },
        ],
        landmarks: [],
        handednesses: ['Left', 'Right'],
      },
      rawResults: {
        gestures: [
          [{ categoryName: 'Thumbs_Up', score: 0.8 }],
          [{ categoryName: 'Fist', score: 0.7 }],
        ],
        landmarks: [],
        handednesses: [
          [{ categoryName: 'Left' }],
          [{ categoryName: 'Right' }],
        ],
      },
    } as any;

    const result = await step.execute(context);

    expect(result.gesture).toBe('thumbs_up+fist');
    expect(result.metadata?.twoHand).toEqual({ left: 'thumbs_up', right: 'fist' });
    expect(result.metadata?.method).toBe('mediapipe');
  });


  it('marks mediapipe detections in calibrated unsure band', async () => {
    const step = createStep();
    const context = createDetectionContext({
      landmarks: [[[0.1, 0.2, 0.3]]],
      handLabel: 'Open_Palm',
      handScore: 0.5,
    });

    const result = await step.execute(context as any);

    expect(result.gesture).toBe('open_palm');
    expect(result.metadata?.method).toBe('mediapipe');
    expect(result.metadata?.confidenceState).toBe('unsure');
  });

  it('returns explicit none state when confidence is below calibrated unsure threshold', async () => {
    const step = createStep();
    const context = createDetectionContext({
      landmarks: [[[0.1, 0.2, 0.3]]],
      handLabel: 'Open_Palm',
      handScore: 0.2,
    });

    const result = await step.execute(context as any);

    expect(result.gesture).toBeNull();
    expect(result.metadata?.method).toBe('mediapipe');
    expect(result.metadata?.confidenceState).toBe('none');
  });

  it('prefers a landmark template over baseline MediaPipe output for trained profile gestures', async () => {
    const templateDetector = {
      getTemplateCount: () => 1,
      detect: () => ({ label: 'Satt', confidence: 0.24, templateId: 'tpl-1', distance: 0.31 }),
    } as unknown as LandmarkTemplateDetector;
    const step = new GestureDetectionStep(baseConfig, templateDetector);
    const context = createDetectionContext({
      landmarks: [[[0.1, 0.2, 0.3]]],
      handLabel: 'Open_Palm',
      handScore: 0.72,
    });

    const result = await step.execute(context as any);

    expect(result.gesture).toBe('satt');
    expect(result.confidence).toBeCloseTo(0.24);
    expect(result.metadata?.method).toBe('landmark_template');
    expect(result.metadata?.templateMatch).toMatchObject({
      label: 'Satt',
      confidence: 0.24,
      templateId: 'tpl-1',
    });
  });


  it('falls back to landmark template when MLP is rejected and MediaPipe only has baseline output', async () => {
    const templateDetector = {
      getTemplateCount: () => 1,
      detect: () => ({ label: 'Satt', confidence: 0.26, templateId: 'tpl-rescue', distance: 0.29 }),
    } as unknown as LandmarkTemplateDetector;
    const step = new GestureDetectionStep(baseConfig, templateDetector);
    const context = createDetectionContext({
      landmarks: [[[0.1, 0.2, 0.3]]],
      handLabel: 'Open_Palm',
      handScore: 0.74,
    });

    (window as any).__mlpPredict = vi.fn().mockReturnValue({
      label: 'Trinken',
      score: 0.39,
      candidates: [
        { label: 'Trinken', score: 0.39 },
        { label: 'Satt', score: 0.38 },
      ],
    });

    const result = await step.execute(context as any);

    expect(result.gesture).toBe('satt');
    expect(result.metadata?.method).toBe('landmark_template');
    expect(result.metadata?.mlpDecision).toMatchObject({
      selected: false,
      reason: 'below_candidate_margin',
    });
    expect(result.metadata?.templateMatch).toMatchObject({
      label: 'Satt',
      confidence: 0.26,
      templateId: 'tpl-rescue',
    });
  });

  it('keeps baseline MediaPipe output when template confidence is too weak', async () => {
    const templateDetector = {
      getTemplateCount: () => 1,
      detect: () => ({ label: 'Satt', confidence: 0.19, templateId: 'tpl-weak', distance: 0.33 }),
    } as unknown as LandmarkTemplateDetector;
    const step = new GestureDetectionStep(baseConfig, templateDetector);
    const context = createDetectionContext({
      landmarks: [[[0.1, 0.2, 0.3]]],
      handLabel: 'Open_Palm',
      handScore: 0.72,
    });

    const result = await step.execute(context as any);

    expect(result.gesture).toBe('open_palm');
    expect(result.confidence).toBeCloseTo(0.72);
    expect(result.metadata?.method).toBe('mediapipe');
    expect(result.metadata?.templateMatch).toMatchObject({
      label: 'Satt',
      confidence: 0.19,
      templateId: 'tpl-weak',
    });
  });

  it('prefers MLP predictions when above threshold and stronger than MediaPipe', async () => {
    const step = createStep();
    const landmarks = [[[0.1, 0.2, 0.3]]] as number[][][];
    const context = createDetectionContext({
      landmarks,
      handLabel: 'Open_Palm',
      handScore: 0.5,
    });

    (window as any).__mlpPredict = vi.fn().mockReturnValue({ label: 'Wave', score: 0.9 });

    const result = await step.execute(context as any);

    expect(window.__mlpPredict).toHaveBeenCalledWith(
      landmarks,
      context.rawResults.handednesses,
      undefined,
      undefined,
      undefined,
    );
    expect(result.gesture).toBe('wave');
    expect(result.metadata?.mlp).toEqual({ label: 'Wave', score: 0.9 });
    expect(result.metadata?.method).toBe('mlp');
    expect(result.metadata?.confidenceState).toBe('confident');
  });

  it('prefers MLP custom vocabulary labels over baseline MediaPipe labels', async () => {
    const step = createStep();
    const context = createDetectionContext({
      landmarks: [[[0.1, 0.2, 0.3]]],
      handLabel: 'Closed_Fist',
      handScore: 0.78,
    });

    (window as any).__mlpPredict = vi.fn().mockReturnValue({ label: 'Trinken', score: 0.65 });

    const result = await step.execute(context as any);

    expect(result.gesture).toBe('trinken');
    expect(result.metadata?.method).toBe('mlp');
    expect(result.metadata?.mlpDecision).toMatchObject({
      selected: true,
      reason: 'selected_profile_vocab_priority',
      selectedGestureBeforeMlp: 'closed_fist',
    });
  });

  it('can select MLP profile vocabulary below threshold when MediaPipe only found baseline gesture', async () => {
    const step = createStep();
    const context = createDetectionContext({
      landmarks: [[[0.1, 0.2, 0.3]]],
      handLabel: 'Closed_Fist',
      handScore: 0.73,
    });

    (window as any).__mlpPredict = vi.fn().mockReturnValue({ label: 'Trinken', score: 0.31 });

    const result = await step.execute(context as any);

    expect(result.gesture).toBe('trinken');
    expect(result.metadata?.method).toBe('mlp');
    expect(result.metadata?.mlpDecision).toMatchObject({
      selected: true,
      reason: 'selected_profile_vocab_relaxed_threshold',
      threshold: 0.4,
      score: 0.31,
      selectedGestureBeforeMlp: 'closed_fist',
    });
  });

  it('rejects ambiguous binary MLP predictions when top candidates are tied', async () => {
    const step = createStep();
    const context = createDetectionContext({ landmarks: [[[0.1, 0.2, 0.3]]] });

    (window as any).__mlpPredict = vi.fn().mockReturnValue({
      label: 'Satt',
      score: 0.5,
      candidates: [
        { label: 'Satt', score: 0.5 },
        { label: 'Trinken', score: 0.5 },
      ],
    });

    const result = await step.execute(context as any);

    expect(result.gesture).toBeNull();
    expect(result.metadata?.method).toBe('none');
    expect(result.metadata?.mlpDecision).toMatchObject({
      selected: false,
      reason: 'below_candidate_margin',
      threshold: 0.4,
      score: 0.5,
    });
  });

  it.each([
    {
      name: 'rejects binary predictions below threshold',
      candidates: [
        { label: 'Satt', score: 0.39 },
        { label: 'Trinken', score: 0.61 },
      ],
      expectedGesture: null,
      expectedMethod: 'none',
      expectedReason: 'below_threshold',
    },
    {
      name: 'accepts three-candidate predictions above threshold',
      candidates: [
        { label: 'Satt', score: 0.41 },
        { label: 'Trinken', score: 0.31 },
        { label: 'Bitte', score: 0.28 },
      ],
      expectedGesture: 'satt',
      expectedMethod: 'mlp',
      expectedReason: 'selected',
    },
    {
      name: 'rejects three-candidate predictions below threshold',
      candidates: [
        { label: 'Satt', score: 0.39 },
        { label: 'Trinken', score: 0.31 },
        { label: 'Bitte', score: 0.30 },
      ],
      expectedGesture: null,
      expectedMethod: 'none',
      expectedReason: 'below_threshold',
    },
    {
      name: 'accepts four-candidate predictions above threshold',
      candidates: [
        { label: 'Satt', score: 0.41 },
        { label: 'Trinken', score: 0.25 },
        { label: 'Bitte', score: 0.19 },
        { label: 'Danke', score: 0.14 },
      ],
      expectedGesture: 'satt',
      expectedMethod: 'mlp',
      expectedReason: 'selected',
    },
    {
      name: 'rejects four-candidate predictions below threshold',
      candidates: [
        { label: 'Satt', score: 0.39 },
        { label: 'Trinken', score: 0.27 },
        { label: 'Bitte', score: 0.19 },
        { label: 'Danke', score: 0.15 },
      ],
      expectedGesture: null,
      expectedMethod: 'none',
      expectedReason: 'below_threshold',
    },
  ])('$name', async ({ candidates, expectedGesture, expectedMethod, expectedReason }) => {
    const step = createStep();
    const context = createDetectionContext({ landmarks: [[[0.1, 0.2, 0.3]]] });
    const topCandidate = candidates[0];

    (window as any).__mlpPredict = vi.fn().mockReturnValue({
      label: topCandidate?.label ?? 'Satt',
      score: topCandidate?.score ?? 0,
      candidates,
    });

    const result = await step.execute(context as any);

    expect(result.gesture).toBe(expectedGesture);
    expect(result.metadata?.method).toBe(expectedMethod);
    expect(result.metadata?.mlpDecision).toMatchObject({
      selected: expectedReason === 'selected',
      reason: expectedReason,
      threshold: 0.4,
      score: topCandidate?.score,
    });
  });

  it('detects audio-only gestures when visual landmarks are missing', async () => {
    const step = createStep();
    const context = createDetectionContext({ audioFeatures: [0.2, 0.1, 0.05] });

    (window as any).__mlpPredict = vi.fn().mockReturnValue({ label: 'Hallo', score: 0.6 });

    const result = await step.execute(context as any);

    expect(window.__mlpPredict).toHaveBeenCalled();
    expect(result.gesture).toBe('hallo');
    expect(result.confidence).toBeCloseTo(0.6);
    expect(result.metadata?.method).toBe('mlp_audio_only');
    expect(result.metadata?.confidenceState).toBe('confident');
    expect(result.metadata?.audioOnly).toBe(true);
  });
});
