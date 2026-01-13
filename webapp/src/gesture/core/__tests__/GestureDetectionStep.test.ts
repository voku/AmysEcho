import { describe, it, expect, afterEach, vi } from 'vitest';
import { GestureDetectionStep } from '../ProcessingSteps';
import type { GestureDetectorConfig } from '../../config/GestureConfig';
import type { MediaPipeGestureResult } from '../../types/MediaPipeTypes';

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
