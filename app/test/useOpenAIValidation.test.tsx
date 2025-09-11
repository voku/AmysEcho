import React from 'react';
import { render, act } from '@testing-library/react-native';
import { useOpenAIValidation, OnGestureDetected } from '../src/hooks/useOpenAIValidation';
import * as ValidationSvc from '../src/services/openaiGestureValidationService';

type HookRef = {
  handleOpenAIValidation: (
    gesture: string | null,
    confidence: number,
    landmarks: number[][][],
    handednesses: string[],
    emergency?: boolean
  ) => Promise<void>;
  openaiValidationResult: any;
  showOpenaiFeedback: boolean;
};

const TestHook = React.forwardRef<HookRef, { onGestureDetected: OnGestureDetected; captureImage?: () => Promise<any> }>(
  (props, ref) => {
    const hook = useOpenAIValidation(props.onGestureDetected, props.captureImage);
    React.useImperativeHandle(ref, () => hook);
    return null;
  }
);

describe('useOpenAIValidation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns early when gesture is null', async () => {
    const onDetected = jest.fn();
    const ref = React.createRef<HookRef>();
    render(<TestHook ref={ref} onGestureDetected={onDetected} />);
    await act(async () => {
      await ref.current!.handleOpenAIValidation(null, 0.8, [], []);
    });
    expect(onDetected).toHaveBeenCalledWith(null, 0.8, [], [], undefined);
  });

  it('bypasses validation when trigger is false', async () => {
    const onDetected = jest.fn();
    jest.spyOn(ValidationSvc, 'shouldTriggerOpenAIValidation').mockReturnValue(false);
    const ref = React.createRef<HookRef>();
    render(<TestHook ref={ref} onGestureDetected={onDetected} />);
    await act(async () => {
      await ref.current!.handleOpenAIValidation('winken', 0.8, [], []);
    });
    expect(onDetected).toHaveBeenCalledWith('winken', 0.8, [], [], undefined);
    expect(ValidationSvc.shouldTriggerOpenAIValidation).toHaveBeenCalledWith(0.8, 'winken');
  });

  it('sets result on successful validation', async () => {
    const onDetected = jest.fn();
    jest.spyOn(ValidationSvc, 'shouldTriggerOpenAIValidation').mockReturnValue(true);
    jest.spyOn(ValidationSvc, 'validateGestureWithFallback').mockResolvedValue({
      finalGesture: 'winken',
      finalConfidence: 0.95,
      feedback: 'ok',
      suggestions: ['tip'],
      validationSource: 'openai',
    });
    const captureImage = jest.fn().mockResolvedValue({ uri: 'x', base64: 'y' });
    const ref = React.createRef<HookRef>();
    render(<TestHook ref={ref} onGestureDetected={onDetected} captureImage={captureImage} />);
    await act(async () => {
      await ref.current!.handleOpenAIValidation('winken', 0.8, [], []);
    });
    expect(ValidationSvc.validateGestureWithFallback).toHaveBeenCalled();
    expect(onDetected).toHaveBeenCalledWith('winken', 0.95, [], [], undefined);
    expect(ref.current!.openaiValidationResult).toMatchObject({
      gesture: 'winken',
      confidence: 0.95,
      validation_source: 'openai',
    });
    expect(ref.current!.showOpenaiFeedback).toBe(true);
  });

  it('falls back on validation error', async () => {
    const onDetected = jest.fn();
    jest.spyOn(ValidationSvc, 'shouldTriggerOpenAIValidation').mockReturnValue(true);
    jest.spyOn(ValidationSvc, 'validateGestureWithFallback').mockRejectedValue(new Error('fail'));
    const captureImage = jest.fn().mockResolvedValue({ uri: 'x', base64: 'y' });
    const ref = React.createRef<HookRef>();
    render(<TestHook ref={ref} onGestureDetected={onDetected} captureImage={captureImage} />);
    await act(async () => {
      await ref.current!.handleOpenAIValidation('winken', 0.8, [], []);
    });
    expect(onDetected).toHaveBeenCalledWith('winken', 0.8, [], [], undefined);
    expect(ref.current!.openaiValidationResult).toBe(null);
  });
});
