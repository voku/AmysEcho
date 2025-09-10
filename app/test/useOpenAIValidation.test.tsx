import React from 'react';
import renderer, { act } from 'react-test-renderer';
import {
  useOpenAIValidation,
  OpenAIValidationResult,
  OnGestureDetected,
} from '../src/hooks/useOpenAIValidation';
import { GestureImageCapture } from '../src/services/openaiGestureValidationService';
import * as ValidationSvc from '../src/services/openaiGestureValidationService';

type HookRef = {
  openaiValidationResult: OpenAIValidationResult | null;
  showOpenaiFeedback: boolean;
  handleOpenAIValidation: (
    gesture: string | null,
    confidence: number,
    landmarks: number[][][],
    handednesses: string[],
    emergency?: boolean
  ) => Promise<void>;
};

const TestHook = React.forwardRef<
  HookRef,
  {
    onGestureDetected: OnGestureDetected;
    captureImage?: () => Promise<GestureImageCapture | null>;
  }
>((props, ref) => {
  const hookValues = useOpenAIValidation(
    props.onGestureDetected,
    props.captureImage
  );
  React.useImperativeHandle(ref, () => hookValues as HookRef);
  return null;
});

describe('useOpenAIValidation', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('returns early when gesture is null', async () => {
    const shouldSpy = jest.spyOn(
      ValidationSvc,
      'shouldTriggerOpenAIValidation'
    );
    const validateSpy = jest.spyOn(
      ValidationSvc,
      'validateGestureWithFallback'
    );
    const onGestureDetected = jest.fn();
    const ref = React.createRef<HookRef>();

    act(() => {
      renderer.create(
        React.createElement(TestHook, { onGestureDetected, ref })
      );
    });

    await act(async () => {
      await ref.current!.handleOpenAIValidation(null, 0.8, [[[0]]], ['links']);
    });

    expect(shouldSpy).not.toHaveBeenCalled();
    expect(validateSpy).not.toHaveBeenCalled();
    expect(onGestureDetected).toHaveBeenCalledWith(
      null,
      0.8,
      [[[0]]],
      ['links'],
      undefined
    );
  });

  it('bypasses validation when not triggered', async () => {
    jest
      .spyOn(ValidationSvc, 'shouldTriggerOpenAIValidation')
      .mockReturnValue(false);
    const validateSpy = jest.spyOn(
      ValidationSvc,
      'validateGestureWithFallback'
    );
    const onGestureDetected = jest.fn();
    const ref = React.createRef<HookRef>();

    act(() => {
      renderer.create(
        React.createElement(TestHook, { onGestureDetected, ref })
      );
    });

    await act(async () => {
      await ref.current!.handleOpenAIValidation('winken', 0.8, [[[0]]], [
        'links',
      ]);
    });

    expect(ValidationSvc.shouldTriggerOpenAIValidation).toHaveBeenCalledWith(
      0.8,
      'winken'
    );
    expect(validateSpy).not.toHaveBeenCalled();
    expect(onGestureDetected).toHaveBeenCalledWith(
      'winken',
      0.8,
      [[[0]]],
      ['links'],
      undefined
    );
    expect(ref.current!.openaiValidationResult).toBeNull();
    expect(ref.current!.showOpenaiFeedback).toBe(false);
  });

  it('performs OpenAI validation when image capture is available', async () => {
    jest
      .spyOn(ValidationSvc, 'shouldTriggerOpenAIValidation')
      .mockReturnValue(true);
    jest
      .spyOn(ValidationSvc, 'validateGestureWithFallback')
      .mockResolvedValue({
        finalGesture: 'ok',
        finalConfidence: 0.9,
        validationSource: 'openai',
        feedback: 'gut',
        suggestions: ['tip'],
      });
    const onGestureDetected = jest.fn();
    const ref = React.createRef<HookRef>();
    const captureImage = jest.fn().mockResolvedValue({
      uri: '',
      base64: '',
      width: 0,
      height: 0,
      timestamp: Date.now(),
    } as GestureImageCapture);

    act(() => {
      renderer.create(
        React.createElement(TestHook, { onGestureDetected, captureImage, ref })
      );
    });

    await act(async () => {
      await ref.current!.handleOpenAIValidation('winken', 0.4, [[[0]]], [
        'rechts',
      ]);
    });

    expect(captureImage).toHaveBeenCalled();
    expect(ValidationSvc.validateGestureWithFallback).toHaveBeenCalled();
    expect(onGestureDetected).toHaveBeenCalledWith(
      'ok',
      0.9,
      [[[0]]],
      ['rechts'],
      undefined
    );
    expect(ref.current!.openaiValidationResult).toMatchObject({
      gesture: 'ok',
      confidence: 0.9,
      feedback: 'gut',
      suggestions: ['tip'],
      validation_source: 'openai',
    });
    expect(ref.current!.showOpenaiFeedback).toBe(true);
  });

  it('falls back to MediaPipe result when validation fails', async () => {
    jest
      .spyOn(ValidationSvc, 'shouldTriggerOpenAIValidation')
      .mockReturnValue(true);
    jest
      .spyOn(ValidationSvc, 'validateGestureWithFallback')
      .mockRejectedValue(new Error('fail'));
    const onGestureDetected = jest.fn();
    const ref = React.createRef<HookRef>();
    const captureImage = jest.fn().mockResolvedValue({
      uri: '',
      base64: '',
      width: 0,
      height: 0,
      timestamp: Date.now(),
    } as GestureImageCapture);

    act(() => {
      renderer.create(
        React.createElement(TestHook, { onGestureDetected, captureImage, ref })
      );
    });

    await act(async () => {
      await ref.current!.handleOpenAIValidation('winken', 0.4, [[[0]]], [
        'rechts',
      ]);
    });

    expect(captureImage).toHaveBeenCalled();
    expect(onGestureDetected).toHaveBeenCalledWith(
      'winken',
      0.4,
      [[[0]]],
      ['rechts'],
      undefined
    );
    expect(ref.current!.openaiValidationResult).toBeNull();
    expect(ref.current!.showOpenaiFeedback).toBe(false);
  });
});

