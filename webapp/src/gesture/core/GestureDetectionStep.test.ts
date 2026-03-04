import { describe, it, expect, afterEach, vi } from 'vitest';
import { GestureDetectionStep } from './ProcessingSteps';
import type { GestureDetectorConfig } from '../config/GestureConfig';
import type { MediaPipeGestureResult } from '../types/MediaPipeTypes';

describe('GestureDetectionStep', () => {
  const baseConfig = {
    thresholds: { mlpConfidence: 0.4 },
  } as unknown as GestureDetectorConfig;

  const createStep = () => new GestureDetectionStep(baseConfig);

  afterEach(() => {
    (window as any).__mlpPredict = undefined;
  });

  const buildResult = (overrides: Partial<MediaPipeGestureResult>): MediaPipeGestureResult => ({
    gestures: [],
    landmarks: [],
    handednesses: [],
    ...overrides,
  });

  it('selects the highest confidence MediaPipe gesture per hand', async () => {
    const step = createStep();
    const context = {
      landmarks: [],
      timestamp: Date.now(),
      processingStep: 'gesture_detection',
      skipExpensiveSteps: false,
      normalizedResults: {
        hands: [
          {
            handedness: 'Left',
            landmarks: [],
            gestures: [
              { label: 'Open_Palm', score: 0.62 },
              { label: 'Fist', score: 0.3 },
            ],
          },
        ],
        landmarks: [],
        handednesses: ['Left'],
      },
      rawResults: buildResult({
        gestures: [[{ categoryName: 'Open_Palm', score: 0.62 }]],
        handednesses: [[{ categoryName: 'Left' }]],
      }),
    } as any;

    const result = await step.execute(context);

    expect(result.gesture).toBe('open_palm');
    expect(result.confidence).toBeCloseTo(0.62);
    expect(result.metadata?.method).toBe('mediapipe');
  });

  it('combines two hands into a normalized gesture string', async () => {
    const step = createStep();
    const context = {
      landmarks: [],
      timestamp: Date.now(),
      processingStep: 'gesture_detection',
      skipExpensiveSteps: false,
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
      rawResults: buildResult({
        gestures: [
          [{ categoryName: 'Thumbs_Up', score: 0.8 }],
          [{ categoryName: 'Fist', score: 0.7 }],
        ],
        handednesses: [
          [{ categoryName: 'Left' }],
          [{ categoryName: 'Right' }],
        ],
      }),
    } as any;

    const result = await step.execute(context);

    expect(result.gesture).toBe('thumbs_up+fist');
    expect(result.metadata?.twoHand).toEqual({ left: 'thumbs_up', right: 'fist' });
    expect(result.metadata?.method).toBe('mediapipe');
  });

  it('prefers MLP predictions when above threshold and stronger than MediaPipe', async () => {
    const step = createStep();
    const landmarks = [[[0.1, 0.2, 0.3]]] as any;
    const context = {
      landmarks,
      timestamp: Date.now(),
      processingStep: 'gesture_detection',
      skipExpensiveSteps: false,
      normalizedResults: {
        hands: [
          {
            handedness: 'Left',
            landmarks: [],
            gestures: [{ label: 'Open_Palm', score: 0.5 }],
          },
        ],
        landmarks: [],
        handednesses: ['Left'],
      },
      rawResults: buildResult({
        gestures: [[{ categoryName: 'Open_Palm', score: 0.5 }]],
        handednesses: [[{ categoryName: 'Left' }]],
      }),
    } as any;

    (window as any).__mlpPredict = vi.fn().mockReturnValue({ label: 'Wave', score: 0.9 });

    const result = await step.execute(context);

    expect(window.__mlpPredict).toHaveBeenCalled();
    expect(window.__mlpPredict).toHaveBeenCalledWith(
      landmarks,
      context.rawResults?.handednesses,
      undefined, // poseLandmarks
      undefined, // faceLandmarks
      undefined  // audioFeatures
    );
    expect(result.gesture).toBe('wave');
    expect(result.metadata?.mlp).toEqual({ label: 'Wave', score: 0.9 });
    expect(result.metadata?.method).toBe('mlp');
  });

  it('prefers MLP custom vocabulary labels over baseline MediaPipe labels', async () => {
    const step = createStep();
    const landmarks = [[[0.1, 0.2, 0.3]]] as any;
    const context = {
      landmarks,
      timestamp: Date.now(),
      processingStep: 'gesture_detection',
      skipExpensiveSteps: false,
      normalizedResults: {
        hands: [
          {
            handedness: 'Left',
            landmarks: [],
            gestures: [{ label: 'Closed_Fist', score: 0.78 }],
          },
        ],
        landmarks: [],
        handednesses: ['Left'],
      },
      rawResults: buildResult({
        gestures: [[{ categoryName: 'Closed_Fist', score: 0.78 }]],
        handednesses: [[{ categoryName: 'Left' }]],
      }),
    } as any;

    (window as any).__mlpPredict = vi.fn().mockReturnValue({ label: 'Trinken', score: 0.65 });

    const result = await step.execute(context);

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
    const context = {
      landmarks: [[[0.1, 0.2, 0.3]]],
      timestamp: Date.now(),
      processingStep: 'gesture_detection',
      skipExpensiveSteps: false,
      normalizedResults: {
        hands: [
          {
            handedness: 'Left',
            landmarks: [],
            gestures: [{ label: 'Closed_Fist', score: 0.73 }],
          },
        ],
        landmarks: [],
        handednesses: ['Left'],
      },
      rawResults: buildResult({
        gestures: [[{ categoryName: 'Closed_Fist', score: 0.73 }]],
        handednesses: [[{ categoryName: 'Left' }]],
      }),
    } as any;

    (window as any).__mlpPredict = vi.fn().mockReturnValue({ label: 'Trinken', score: 0.31 });

    const result = await step.execute(context);

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


  it('requires chance-adjusted threshold when only two MLP candidates exist', async () => {
    const step = createStep();
    const context = {
      landmarks: [[[0.1, 0.2, 0.3]]],
      timestamp: Date.now(),
      processingStep: 'gesture_detection',
      skipExpensiveSteps: false,
      normalizedResults: {
        hands: [],
        landmarks: [],
        handednesses: [],
      },
      rawResults: buildResult({
        gestures: [],
        handednesses: [],
      }),
    } as any;

    (window as any).__mlpPredict = vi.fn().mockReturnValue({
      label: 'Satt',
      score: 0.5,
      candidates: [
        { label: 'Satt', score: 0.5 },
        { label: 'Trinken', score: 0.5 },
      ],
    });

    const result = await step.execute(context);

    expect(result.gesture).toBeNull();
    expect(result.metadata?.mlpDecision).toMatchObject({
      selected: false,
      reason: 'below_threshold',
      threshold: 0.65,
      score: 0.5,
    });
  });

  it('still selects MLP when score beats chance-adjusted threshold', async () => {
    const step = createStep();
    const context = {
      landmarks: [[[0.1, 0.2, 0.3]]],
      timestamp: Date.now(),
      processingStep: 'gesture_detection',
      skipExpensiveSteps: false,
      normalizedResults: {
        hands: [],
        landmarks: [],
        handednesses: [],
      },
      rawResults: buildResult({
        gestures: [],
        handednesses: [],
      }),
    } as any;

    (window as any).__mlpPredict = vi.fn().mockReturnValue({
      label: 'Satt',
      score: 0.8,
      candidates: [
        { label: 'Satt', score: 0.8 },
        { label: 'Trinken', score: 0.2 },
      ],
    });

    const result = await step.execute(context);

    expect(result.gesture).toBe('satt');
    expect(result.metadata?.method).toBe('mlp');
    expect(result.metadata?.mlpDecision).toMatchObject({
      selected: true,
      reason: 'selected',
      threshold: 0.65,
      score: 0.8,
    });
  });

  it('detects audio-only gestures when visual landmarks are missing', async () => {
    const step = createStep();
    const context = {
      landmarks: [],
      timestamp: Date.now(),
      processingStep: 'gesture_detection',
      skipExpensiveSteps: false,
      normalizedResults: {
        hands: [],
        landmarks: [],
        handednesses: [],
      },
      rawResults: buildResult({
        gestures: [],
        handednesses: [],
      }),
      audioFeatures: [0.2, 0.1, 0.05],
    } as any;

    (window as any).__mlpPredict = vi.fn().mockReturnValue({ label: 'Hallo', score: 0.6 });

    const result = await step.execute(context);

    expect(window.__mlpPredict).toHaveBeenCalled();
    expect(result.gesture).toBe('hallo');
    expect(result.confidence).toBeCloseTo(0.6);
    expect(result.metadata?.method).toBe('mlp_audio_only');
    expect(result.metadata?.audioOnly).toBe(true);
  });
});
