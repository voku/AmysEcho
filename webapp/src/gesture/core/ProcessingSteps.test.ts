import { describe, it, expect, vi } from 'vitest';
import {
  FallbackProcessingStep,
  LandmarkPreprocessingStep,
  PartialGestureAnalysisStep,
  ResultProcessingStep,
  StabilityAnalysisStep,
} from './ProcessingSteps';

const createContext = (overrides: Record<string, unknown> = {}) => ({
  landmarks: [],
  timestamp: 123,
  ...overrides,
});

describe('Processing steps', () => {
  it('preprocesses landmarks with normalization and tremor smoothing', async () => {
    const normalizeHandSize = vi.fn().mockReturnValue([['normalized']]);
    const smoothLandmarks = vi.fn().mockReturnValue([['smoothed']]);
    const step = new LandmarkPreprocessingStep(
      { normalizeHandSize } as any,
      { smoothLandmarks } as any
    );

    const context = createContext({ landmarks: [[['raw']]] });
    const result = await step.execute(context as any);

    expect(normalizeHandSize).toHaveBeenCalledWith(context.landmarks);
    expect(smoothLandmarks).toHaveBeenCalledWith([['normalized']]);
    expect(result).toEqual({
      landmarks: [['smoothed']],
      rawLandmarks: context.landmarks,
      preprocessing: {
        sizeNormalized: true,
        tremorCompensated: true
      }
    });
  });

  it('returns baseline stability data when landmarks are missing', async () => {
    const step = new StabilityAnalysisStep({ analyzeStability: vi.fn() } as any);

    const result = await step.execute(createContext());

    expect(result).toEqual({
      stability: {
        isStable: false,
        score: 0
      }
    });
  });

  it('returns stability feedback when landmarks are present', async () => {
    const analyzeStability = vi.fn().mockReturnValue({
      isStable: true,
      stabilityScore: 0.88,
      feedback: 'steady',
    });
    const step = new StabilityAnalysisStep({ analyzeStability } as any);

    const result = await step.execute(createContext({ landmarks: [[[]]] }) as any);

    expect(analyzeStability).toHaveBeenCalled();
    expect(result).toEqual({
      stability: {
        isStable: true,
        score: 0.88,
      },
      feedback: 'steady',
    });
  });

  it('selects the strongest partial gesture candidate', async () => {
    const analyzePartialCompletion = vi.fn((_landmarks, gesture: string) => {
      if (gesture === 'open_palm') {
        return { isPartial: true, completion: 0.75 };
      }
      if (gesture === 'thumbs_up') {
        return { isPartial: true, completion: 0.4 };
      }
      return { isPartial: false, completion: 0 };
    });
    const step = new PartialGestureAnalysisStep({ analyzePartialCompletion } as any);

    const result = await step.execute(createContext({ landmarks: [[[]]] }) as any);

    expect(result).toEqual({
      partial: {
        isPartial: true,
        completion: 0.75,
        gesture: 'open_palm',
      }
    });
  });

  it('skips fallback detection unless fallback mode is active', async () => {
    const step = new FallbackProcessingStep(
      { detectGesture: vi.fn() } as any,
      { isInFallbackMode: vi.fn().mockReturnValue(false) } as any
    );

    const result = await step.execute(createContext({ landmarks: [[[]]] }) as any);

    expect(result).toEqual({ fallback: null });
  });

  it('returns fallback metadata when fallback mode is active', async () => {
    const detectGesture = vi.fn().mockReturnValue({
      gesture: 'hilfe',
      confidence: 0.4,
      isFallback: true,
    });
    const step = new FallbackProcessingStep(
      { detectGesture } as any,
      { isInFallbackMode: vi.fn().mockReturnValue(true) } as any
    );

    const result = await step.execute(createContext({ landmarks: [[[]]] }) as any);

    expect(detectGesture).toHaveBeenCalled();
    expect(result).toEqual({
      fallback: {
        gesture: 'hilfe',
        confidence: 0.4,
        isFallback: true,
      },
      isUsingFallback: true,
    });
  });

  it('returns a validated result payload', async () => {
    const step = new ResultProcessingStep();

    const result = await step.execute(createContext({ timestamp: 999 }) as any);

    expect(result).toEqual({
      finalResult: {
        validated: true,
        timestamp: 999,
      }
    });
  });
});
