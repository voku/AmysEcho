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
    capturedFrame?: any,
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
    expect(onDetected).toHaveBeenCalledWith(null, 0.8, [], []);
  });

  it('bypasses validation when trigger is false', async () => {
    const onDetected = jest.fn();
    jest.spyOn(ValidationSvc, 'shouldTriggerOpenAIValidation').mockReturnValue(false);
    const ref = React.createRef<HookRef>();
    render(<TestHook ref={ref} onGestureDetected={onDetected} />);
    await act(async () => {
      await ref.current!.handleOpenAIValidation('winken', 0.8, [], []);
    });
    expect(onDetected).toHaveBeenCalledWith('winken', 0.8, [], []);
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
      quality_score: 9.1,
      contextual_meaning: 'DGS: Hand bewegt sich zur Seite – bedeutet Winken.',
      reference_sources: ['https://kestner.app/sign/winken'],
    });
    const captureImage = jest.fn().mockResolvedValue({ uri: 'x', base64: 'y' });
    const ref = React.createRef<HookRef>();
    render(<TestHook ref={ref} onGestureDetected={onDetected} captureImage={captureImage} />);
    await act(async () => {
      await ref.current!.handleOpenAIValidation('winken', 0.8, [], []);
    });
    expect(ValidationSvc.validateGestureWithFallback).toHaveBeenCalledWith(
      { gesture: 'winken', confidence: 0.8, landmarks: [] },
      { uri: 'x', base64: 'y' },
      expect.objectContaining({ session_id: expect.any(String), environment: 'home' })
    );
    expect(onDetected).toHaveBeenCalledWith('winken', 0.95, [], []);
    expect(ref.current!.openaiValidationResult).toMatchObject({
      gesture: 'winken',
      confidence: 0.95,
      validation_source: 'openai',
      quality_score: 9.1,
      contextual_meaning: 'DGS: Hand bewegt sich zur Seite – bedeutet Winken.',
      reference_sources: ['https://kestner.app/sign/winken'],
    });
    expect(ref.current!.showOpenaiFeedback).toBe(true);
  });

  it('uses provided captured frame without invoking captureImage', async () => {
    const onDetected = jest.fn();
    jest.spyOn(ValidationSvc, 'shouldTriggerOpenAIValidation').mockReturnValue(true);
    const validateSpy = jest
      .spyOn(ValidationSvc, 'validateGestureWithFallback')
      .mockResolvedValue({
        finalGesture: 'hilfe',
        finalConfidence: 0.7,
        validationSource: 'openai',
        quality_score: 8.4,
      });
    const captureImage = jest.fn().mockResolvedValue({ uri: 'unused', base64: 'unused' });
    const ref = React.createRef<HookRef>();
    render(<TestHook ref={ref} onGestureDetected={onDetected} captureImage={captureImage} />);

    const providedCapture = {
      uri: 'data:image/jpeg;base64,abc',
      base64: 'abc',
      width: 320,
      height: 240,
      timestamp: 123,
    };

    await act(async () => {
      await ref.current!.handleOpenAIValidation('hilfe', 0.4, [], [], providedCapture);
    });

    expect(captureImage).not.toHaveBeenCalled();
    expect(validateSpy).toHaveBeenCalledWith(
      { gesture: 'hilfe', confidence: 0.4, landmarks: [] },
      providedCapture,
      expect.objectContaining({ session_id: expect.any(String) }),
    );
    expect(onDetected).toHaveBeenCalledWith('hilfe', 0.7, [], []);
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
    expect(onDetected).toHaveBeenCalledWith('winken', 0.8, [], []);
    expect(ref.current!.openaiValidationResult).toBe(null);
  });
});
