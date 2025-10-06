import React, { useEffect } from 'react';
import { act, render } from '@testing-library/react-native';

import { useParallelProcessing } from '../src/hooks/useParallelProcessing';
import type { GestureResult } from '../src/services/parallelGestureProcessor';

jest.mock('../src/services/parallelGestureProcessor', () => ({
  parallelGestureProcessor: {
    processMediaPipeResult: jest.fn(),
  },
}));

jest.mock('../src/services/gestureMeaningService', () => ({
  gestureMeaningService: {
    processGestureMeaning: jest.fn().mockResolvedValue(null),
  },
}));

describe('useParallelProcessing', () => {
  const processMediaPipeResultMock = jest.requireMock('../src/services/parallelGestureProcessor')
    .parallelGestureProcessor.processMediaPipeResult as jest.MockedFunction<(
      ...args: any[]
    ) => Promise<GestureResult>>;

  const onGestureDetected = jest.fn();
  const onMergedResult = jest.fn();
  const setOpenaiValidationResult = jest.fn();
  const setShowOpenaiFeedback = jest.fn();
  const runSequentialValidation = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderHookHarness = async (
    sequentialHandler: typeof runSequentialValidation = runSequentialValidation,
  ) => {
    let handler: ReturnType<typeof useParallelProcessing>['handleParallelProcessing'] | null = null;

    const Harness: React.FC<{ onReady: (cb: typeof handler) => void }> = ({ onReady }) => {
      const { handleParallelProcessing } = useParallelProcessing(
        onGestureDetected,
        onMergedResult,
        setOpenaiValidationResult,
        setShowOpenaiFeedback,
        sequentialHandler,
      );

      useEffect(() => {
        onReady(handleParallelProcessing);
      }, [handleParallelProcessing, onReady]);

      return null;
    };

    render(<Harness onReady={(cb) => { handler = cb; }} />);

    await act(async () => {});

    if (!handler) {
      throw new Error('handleParallelProcessing was not initialized');
    }

    return handler;
  };

  it('falls back to sequential validation when OpenAI was not attempted', async () => {
    processMediaPipeResultMock.mockResolvedValue({
      gesture: 'wave',
      confidence: 0.4,
      source: 'mediapipe',
      processingTime: 12,
      timestamp: Date.now(),
      openaiAttempted: false,
    });
    runSequentialValidation.mockResolvedValue(undefined);

    const handler = await renderHookHarness();

    await act(async () => {
      await handler('wave', 0.4, [[[0]]], ['Left'], null);
    });

    expect(runSequentialValidation).toHaveBeenCalledTimes(1);
    expect(onGestureDetected).not.toHaveBeenCalled();
  });

  it('skips sequential validation when OpenAI already failed for the gesture', async () => {
    processMediaPipeResultMock.mockResolvedValue({
      gesture: 'wave',
      confidence: 0.3,
      source: 'mediapipe',
      processingTime: 15,
      timestamp: Date.now(),
      openaiAttempted: true,
      openaiSuccess: false,
      openaiError: 'network error',
    });
    runSequentialValidation.mockResolvedValue(undefined);

    const handler = await renderHookHarness();

    await act(async () => {
      await handler('wave', 0.3, [[[0]]], ['Left'], null);
    });

    expect(runSequentialValidation).not.toHaveBeenCalled();
    expect(onGestureDetected).toHaveBeenCalledTimes(1);
  });
});
