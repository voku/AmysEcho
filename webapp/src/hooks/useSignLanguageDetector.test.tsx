import { waitFor } from '@testing-library/dom';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WEBVIEW_MESSAGE_EVENT } from '../utils/reactNativeBridge';
import type { GestureRecognitionOrchestrator } from '../gesture/core/GestureRecognitionOrchestrator';
import { useSignLanguageDetector } from './useSignLanguageDetector';

function createStubOrchestrator() {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
    setAudioMuted: vi.fn().mockResolvedValue(undefined),
  } as unknown as GestureRecognitionOrchestrator;
}

describe('useSignLanguageDetector', () => {
  it('starts and stops the orchestrator', async () => {
    const orchestrator = createStubOrchestrator();
    const videoRef = { current: document.createElement('video') } as React.RefObject<HTMLVideoElement>;
    const overlayRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement>;

    const { result } = renderHook(() =>
      useSignLanguageDetector(videoRef, overlayRef, {
        orchestratorFactory: () => orchestrator,
      }),
    );

    await act(async () => {
      const ok = await result.current.start();
      expect(ok).toBe(true);
    });

    expect(orchestrator.initialize).toHaveBeenCalled();
    expect(orchestrator.setAudioMuted).toHaveBeenCalledWith(false);
    expect(orchestrator.start).toHaveBeenCalled();

    await act(async () => {
      await result.current.stop();
    });

    expect(orchestrator.stop).toHaveBeenCalled();
  });

  it('toggles audio mute for recognition', async () => {
    const orchestrator = createStubOrchestrator();
    const videoRef = { current: document.createElement('video') } as React.RefObject<HTMLVideoElement>;
    const overlayRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement>;

    const { result } = renderHook(() =>
      useSignLanguageDetector(videoRef, overlayRef, {
        orchestratorFactory: () => orchestrator,
      }),
    );

    await act(async () => {
      await result.current.start();
    });

    act(() => {
      result.current.toggleAudioMuted();
    });

    expect(result.current.audioMuted).toBe(true);
    expect(orchestrator.setAudioMuted).toHaveBeenLastCalledWith(true);
  });

  it('aggregates bridge messages and stores gesture state', async () => {
    const orchestrator = createStubOrchestrator();
    const videoRef = { current: document.createElement('video') } as React.RefObject<HTMLVideoElement>;
    const overlayRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement>;

    const { result } = renderHook(() =>
      useSignLanguageDetector(videoRef, overlayRef, {
        orchestratorFactory: () => orchestrator,
      }),
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent(WEBVIEW_MESSAGE_EVENT, {
          detail: JSON.stringify({ type: 'gesture', gesture: 'WINKEN', confidence: 0.92 }),
        }),
      );

      window.dispatchEvent(
        new CustomEvent(WEBVIEW_MESSAGE_EVENT, {
          detail: JSON.stringify({ type: 'gesture', gesture: 'WINKEN', confidence: 0.92 }),
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.messageLog.length).toBe(1);
      expect(result.current.messageLog[0]?.count).toBe(2);
      expect(result.current.lastSign).toBe('WINKEN');
      expect(result.current.lastConfidence).toBeCloseTo(0.92);
    });
  });

  it('ignores empty gesture_batch messages without gestures and landmarks', async () => {
    const orchestrator = createStubOrchestrator();
    const videoRef = { current: document.createElement('video') } as React.RefObject<HTMLVideoElement>;
    const overlayRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement>;

    const { result } = renderHook(() =>
      useSignLanguageDetector(videoRef, overlayRef, {
        orchestratorFactory: () => orchestrator,
      }),
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent(WEBVIEW_MESSAGE_EVENT, {
          detail: JSON.stringify({
            type: 'gesture_batch',
            messages: [
              { gesture: null, landmarks: [] },
              { gesture: undefined, landmarks: [] },
            ],
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.messageLog.length).toBe(0);
      expect(result.current.lastSign).toBeNull();
    });
  });

  it('ignores "none" and uses the next meaningful gesture from gesture_batch messages', async () => {
    const orchestrator = createStubOrchestrator();
    const videoRef = { current: document.createElement('video') } as React.RefObject<HTMLVideoElement>;
    const overlayRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement>;

    const { result } = renderHook(() =>
      useSignLanguageDetector(videoRef, overlayRef, {
        orchestratorFactory: () => orchestrator,
      }),
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent(WEBVIEW_MESSAGE_EVENT, {
          detail: JSON.stringify({
            type: 'gesture_batch',
            confidence: 0.81,
            messages: [
              { gesture: 'none', landmarks: [] },
              { gesture: 'TRINKEN', landmarks: [[[0.1, 0.2, 0]]] },
            ],
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.lastSign).toBe('TRINKEN');
      expect(result.current.lastConfidence).toBeCloseTo(0.81);
      expect(result.current.messageLog[0]?.summary).toContain('Gebärde: TRINKEN');
      expect(result.current.messageLog[0]?.summary).not.toContain('Gebärde: none');
    });
  });

  it('reads confidence from nested message when batch-level confidence is missing', async () => {
    const orchestrator = createStubOrchestrator();
    const videoRef = { current: document.createElement('video') } as React.RefObject<HTMLVideoElement>;
    const overlayRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement>;

    const { result } = renderHook(() =>
      useSignLanguageDetector(videoRef, overlayRef, {
        orchestratorFactory: () => orchestrator,
      }),
    );

    // Realistic batch format: MessageBatcher does NOT include top-level confidence
    act(() => {
      window.dispatchEvent(
        new CustomEvent(WEBVIEW_MESSAGE_EVENT, {
          detail: JSON.stringify({
            type: 'gesture_batch',
            messageCount: 2,
            frameCount: 4,
            lastSentAt: Date.now(),
            messages: [
              { type: 'gesture', gesture: 'none', confidence: 0.1, landmarks: [] },
              { type: 'gesture', gesture: 'ESSEN', confidence: 0.75, landmarks: [[[0.3, 0.4, 0]]] },
            ],
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.lastSign).toBe('ESSEN');
      expect(result.current.lastConfidence).toBeCloseTo(0.75);
      expect(result.current.messageLog[0]?.summary).toContain('Gebärde: ESSEN');
      expect(result.current.messageLog[0]?.summary).toContain('Score: 0.75');
    });
  });

  it('uses landmark previews from bridge messages', async () => {
    const orchestrator = createStubOrchestrator();
    const videoRef = { current: document.createElement('video') } as React.RefObject<HTMLVideoElement>;
    const overlayRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement>;

    const { result } = renderHook(() =>
      useSignLanguageDetector(videoRef, overlayRef, {
        orchestratorFactory: () => orchestrator,
      }),
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent(WEBVIEW_MESSAGE_EVENT, {
          detail: JSON.stringify({
            type: 'landmarks',
            landmarks: [[[0.1, 0.2, 0], [0.2, 0.3, 0]]],
            handednesses: ['left'],
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.lastLandmarks.length).toBeGreaterThan(0);
      expect(result.current.lastHandedness[0]).toBe('Left');
    });
  });

  it('tracks detection method and fallback status from messages', async () => {
    const orchestrator = createStubOrchestrator();
    const videoRef = { current: document.createElement('video') } as React.RefObject<HTMLVideoElement>;
    const overlayRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement>;

    const { result } = renderHook(() =>
      useSignLanguageDetector(videoRef, overlayRef, {
        orchestratorFactory: () => orchestrator,
      }),
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent(WEBVIEW_MESSAGE_EVENT, {
          detail: JSON.stringify({
            type: 'gesture_batch',
            messages: [
              {
                gesture: 'TRINKEN',
                detectionMethod: 'mlp',
                isFallback: true,
                landmarks: [[[0.2, 0.3, 0]]],
              },
            ],
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.lastDetectionMethod).toBe('mlp');
      expect(result.current.lastUsedFallback).toBe(true);
    });
  });

  it('stabilizes missing handedness entries with placeholders', async () => {
    const orchestrator = createStubOrchestrator();
    const videoRef = { current: document.createElement('video') } as React.RefObject<HTMLVideoElement>;
    const overlayRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement>;

    const { result } = renderHook(() =>
      useSignLanguageDetector(videoRef, overlayRef, {
        orchestratorFactory: () => orchestrator,
      }),
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent(WEBVIEW_MESSAGE_EVENT, {
          detail: JSON.stringify({
            type: 'landmarks',
            landmarks: [[[0.4, 0.5, 0], [0.5, 0.6, 0]]],
            handednesses: [],
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.lastLandmarks.length).toBe(1);
      expect(result.current.lastHandedness[0]).toBe('Hand 1');
    });
  });

  it('resets MLP metadata when the next message from MediaPipe has no mlp field', async () => {
    const orchestrator = createStubOrchestrator();
    const videoRef = { current: document.createElement('video') } as React.RefObject<HTMLVideoElement>;
    const overlayRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement>;

    const { result } = renderHook(() =>
      useSignLanguageDetector(videoRef, overlayRef, {
        orchestratorFactory: () => orchestrator,
      }),
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent(WEBVIEW_MESSAGE_EVENT, {
          detail: JSON.stringify({
            type: 'gesture',
            gesture: 'closed_fist',
            detectionMethod: 'mediapipe',
            mlp: { label: 'TRINKEN', score: 0.61, candidates: [{ label: 'TRINKEN', score: 0.61 }] },
            mlpDecision: { selected: false, reason: 'below_override_margin', threshold: 0.4 },
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.lastMlpLabel).toBe('TRINKEN');
      expect(result.current.lastMlpScore).toBeCloseTo(0.61);
      expect(result.current.lastMlpThreshold).toBeCloseTo(0.4);
      expect(result.current.lastMlpCandidates).toEqual([{ label: 'TRINKEN', score: 0.61 }]);
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent(WEBVIEW_MESSAGE_EVENT, {
          detail: JSON.stringify({
            type: 'gesture',
            gesture: 'closed_fist',
            detectionMethod: 'mediapipe',
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.lastMlpLabel).toBeNull();
      expect(result.current.lastMlpScore).toBeNull();
      expect(result.current.lastMlpThreshold).toBeNull();
      expect(result.current.lastMlpCandidates).toEqual([]);
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent(WEBVIEW_MESSAGE_EVENT, {
          detail: JSON.stringify({
            type: 'gesture',
            gesture: 'closed_fist',
            detectionMethod: 'mediapipe',
            mlp: null,
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.lastMlpLabel).toBeNull();
      expect(result.current.lastMlpScore).toBeNull();
      expect(result.current.lastMlpCandidates).toEqual([]);
    });
  });


  it('reads MLP metadata from gesture_batch messages', async () => {
    const orchestrator = createStubOrchestrator();
    const videoRef = { current: document.createElement('video') } as React.RefObject<HTMLVideoElement>;
    const overlayRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement>;

    const { result } = renderHook(() =>
      useSignLanguageDetector(videoRef, overlayRef, {
        orchestratorFactory: () => orchestrator,
      }),
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent(WEBVIEW_MESSAGE_EVENT, {
          detail: JSON.stringify({
            type: 'gesture_batch',
            messages: [
              {
                type: 'gesture',
                gesture: 'open_palm',
                detectionMethod: 'mediapipe',
                mlpDecision: { selected: false, reason: 'below_override_margin', threshold: 0.4 },
                mlp: { label: 'TRINKEN', score: 0.57, candidates: [{ label: 'TRINKEN', score: 0.57 }] },
                thresholds: { mlp: 0.4 },
              },
            ],
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.lastMlpLabel).toBe('TRINKEN');
      expect(result.current.lastMlpScore).toBeCloseTo(0.57);
      expect(result.current.lastMlpThreshold).toBeCloseTo(0.4);
      expect(result.current.lastMlpCandidates).toEqual([{ label: 'TRINKEN', score: 0.57 }]);
      expect(result.current.lastDetectionMethod).toBe('mediapipe');
      expect(result.current.lastSign).toBe('open_palm');
    });
  });

  it('prefers batch confidence over nested message confidence', async () => {
    const orchestrator = createStubOrchestrator();
    const videoRef = { current: document.createElement('video') } as React.RefObject<HTMLVideoElement>;
    const overlayRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement>;

    const { result } = renderHook(() =>
      useSignLanguageDetector(videoRef, overlayRef, {
        orchestratorFactory: () => orchestrator,
      }),
    );

    // When both batch-level and message-level confidence exist, batch takes precedence
    act(() => {
      window.dispatchEvent(
        new CustomEvent(WEBVIEW_MESSAGE_EVENT, {
          detail: JSON.stringify({
            type: 'gesture_batch',
            confidence: 0.95,
            messages: [
              { type: 'gesture', gesture: 'WINKEN', confidence: 0.60, landmarks: [[[0.1, 0.2, 0]]] },
            ],
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.lastSign).toBe('WINKEN');
      expect(result.current.lastConfidence).toBeCloseTo(0.95);
    });
  });

  it('handles confidence=0 correctly at batch level', async () => {
    const orchestrator = createStubOrchestrator();
    const videoRef = { current: document.createElement('video') } as React.RefObject<HTMLVideoElement>;
    const overlayRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement>;

    const { result } = renderHook(() =>
      useSignLanguageDetector(videoRef, overlayRef, {
        orchestratorFactory: () => orchestrator,
      }),
    );

    // confidence=0 is a valid number, so it should be used over message-level
    act(() => {
      window.dispatchEvent(
        new CustomEvent(WEBVIEW_MESSAGE_EVENT, {
          detail: JSON.stringify({
            type: 'gesture_batch',
            confidence: 0,
            messages: [
              { type: 'gesture', gesture: 'TRINKEN', confidence: 0.88, landmarks: [[[0.1, 0.2, 0]]] },
            ],
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.lastSign).toBe('TRINKEN');
      // confidence=0 at batch level takes precedence (it's a valid number)
      expect(result.current.lastConfidence).toBe(0);
    });
  });

  it('chooses the highest-confidence meaningful gesture from multiple messages', async () => {
    const orchestrator = createStubOrchestrator();
    const videoRef = { current: document.createElement('video') } as React.RefObject<HTMLVideoElement>;
    const overlayRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement>;

    const { result } = renderHook(() =>
      useSignLanguageDetector(videoRef, overlayRef, {
        orchestratorFactory: () => orchestrator,
      }),
    );

    // Multiple meaningful gestures - latest meaningful one should be selected
    act(() => {
      window.dispatchEvent(
        new CustomEvent(WEBVIEW_MESSAGE_EVENT, {
          detail: JSON.stringify({
            type: 'gesture_batch',
            messageCount: 3,
            frameCount: 3,
            lastSentAt: Date.now(),
            messages: [
              { type: 'gesture', gesture: 'none', confidence: 0.1, landmarks: [] },
              { type: 'gesture', gesture: 'TRINKEN', confidence: 0.9, landmarks: [[[0.1, 0.2, 0]]] },
              { type: 'gesture', gesture: 'ESSEN', confidence: 0.5, landmarks: [[[0.3, 0.4, 0]]] },
            ],
          }),
        }),
      );
    });

    await waitFor(() => {
      // Highest-confidence gesture should win even if it is not the latest frame in the batch
      expect(result.current.lastSign).toBe('TRINKEN');
      expect(result.current.lastConfidence).toBeCloseTo(0.9);
    });
  });



  it('uses the latest detection method from a gesture_batch message', async () => {
    const orchestrator = createStubOrchestrator();
    const videoRef = { current: document.createElement('video') } as React.RefObject<HTMLVideoElement>;
    const overlayRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement>;

    const { result } = renderHook(() =>
      useSignLanguageDetector(videoRef, overlayRef, {
        orchestratorFactory: () => orchestrator,
      }),
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent(WEBVIEW_MESSAGE_EVENT, {
          detail: JSON.stringify({
            type: 'gesture_batch',
            messages: [
              { type: 'gesture', gesture: 'THUMBS_UP', detectionMethod: 'mediapipe', landmarks: [[[0.1, 0.2, 0]]] },
              { type: 'gesture', gesture: 'TRINKEN', detectionMethod: 'mlp', landmarks: [[[0.3, 0.4, 0]]] },
            ],
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.lastDetectionMethod).toBe('mlp');
      expect(result.current.lastSign).toBe('TRINKEN');
    });
  });

  it('filters _NULL_ labels from gesture_batch messages', async () => {
    const orchestrator = createStubOrchestrator();
    const videoRef = { current: document.createElement('video') } as React.RefObject<HTMLVideoElement>;
    const overlayRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement>;

    const { result } = renderHook(() =>
      useSignLanguageDetector(videoRef, overlayRef, {
        orchestratorFactory: () => orchestrator,
      }),
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent(WEBVIEW_MESSAGE_EVENT, {
          detail: JSON.stringify({
            type: 'gesture_batch',
            messageCount: 2,
            frameCount: 2,
            lastSentAt: Date.now(),
            messages: [
              { type: 'gesture', gesture: '_NULL_', confidence: 0.9, landmarks: [[[0.1, 0.2, 0]]] },
              { type: 'gesture', gesture: 'DANKE', confidence: 0.65, landmarks: [[[0.3, 0.4, 0]]] },
            ],
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.lastSign).toBe('DANKE');
      expect(result.current.lastConfidence).toBeCloseTo(0.65);
      expect(result.current.messageLog[0]?.summary).toContain('Gebärde: DANKE');
      expect(result.current.messageLog[0]?.summary).not.toContain('_NULL_');
    });
  });

  it('shows landmark data when batch has only landmarks and no gesture', async () => {
    const orchestrator = createStubOrchestrator();
    const videoRef = { current: document.createElement('video') } as React.RefObject<HTMLVideoElement>;
    const overlayRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement>;

    const { result } = renderHook(() =>
      useSignLanguageDetector(videoRef, overlayRef, {
        orchestratorFactory: () => orchestrator,
      }),
    );

    // Batch with landmarks but no meaningful gesture (e.g. hands visible but no recognized sign)
    act(() => {
      window.dispatchEvent(
        new CustomEvent(WEBVIEW_MESSAGE_EVENT, {
          detail: JSON.stringify({
            type: 'gesture_batch',
            messageCount: 1,
            frameCount: 1,
            lastSentAt: Date.now(),
            messages: [
              {
                type: 'gesture',
                gesture: 'none',
                confidence: 0.05,
                landmarks: [[[0.5, 0.5, 0], [0.6, 0.6, 0]]],
                handednesses: ['Right'],
              },
            ],
          }),
        }),
      );
    });

    await waitFor(() => {
      // No meaningful gesture so lastSign stays null
      expect(result.current.lastSign).toBeNull();
      // But landmarks should still be updated
      expect(result.current.lastLandmarks.length).toBeGreaterThan(0);
      // Message should still appear in log (has landmarks)
      expect(result.current.messageLog.length).toBe(1);
    });
  });

  it('handles real orchestrator payload with MLP selection correctly', async () => {
    const orchestrator = createStubOrchestrator();
    const videoRef = { current: document.createElement('video') } as React.RefObject<HTMLVideoElement>;
    const overlayRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement>;

    const { result } = renderHook(() =>
      useSignLanguageDetector(videoRef, overlayRef, {
        orchestratorFactory: () => orchestrator,
      }),
    );

    // Realistic payload matching GestureMessagePayload from the orchestrator
    act(() => {
      window.dispatchEvent(
        new CustomEvent(WEBVIEW_MESSAGE_EVENT, {
          detail: JSON.stringify({
            type: 'gesture_batch',
            messageCount: 1,
            frameCount: 1,
            lastSentAt: Date.now(),
            messages: [
              {
                type: 'gesture',
                gesture: 'HALLO',
                confidence: 0.82,
                landmarks: [[[0.5, 0.5, 0]]],
                handednesses: ['Right'],
                timestamp: Date.now(),
                isFallback: false,
                processingTime: 15,
                stepsExecuted: ['preprocessing', 'detection', 'mlp'],
                skippedSteps: [],
                thresholds: { fallback: 0.35, mlp: 0.05 },
                detectionMethod: 'mlp',
                mlpDecision: {
                  selected: true,
                  reason: 'selected',
                  threshold: 0.05,
                  margin: 0,
                  score: 0.82,
                  selectedConfidenceBeforeMlp: 0,
                  selectedGestureBeforeMlp: null,
                },
                mlp: {
                  label: 'HALLO',
                  score: 0.82,
                  candidates: [
                    { label: 'HALLO', score: 0.82 },
                    { label: 'TRINKEN', score: 0.12 },
                    { label: '_NULL_', score: 0.06 },
                  ],
                },
              },
            ],
          }),
        }),
      );
    });

    await waitFor(() => {
      // Sign and confidence from message
      expect(result.current.lastSign).toBe('HALLO');
      expect(result.current.lastConfidence).toBeCloseTo(0.82);
      // MLP metadata from nested message
      expect(result.current.lastMlpLabel).toBe('HALLO');
      expect(result.current.lastMlpScore).toBeCloseTo(0.82);
      expect(result.current.lastMlpThreshold).toBeCloseTo(0.05);
      expect(result.current.lastMlpCandidates).toHaveLength(3);
      // Detection method
      expect(result.current.lastDetectionMethod).toBe('mlp');
      expect(result.current.lastUsedFallback).toBe(false);
      // Summary should contain all relevant info
      expect(result.current.messageLog[0]?.summary).toContain('Gebärde: HALLO');
      expect(result.current.messageLog[0]?.summary).toContain('Score: 0.82');
    });
  });

  it('sets MLP data to null when batch message sends mlp:null', async () => {
    const orchestrator = createStubOrchestrator();
    const videoRef = { current: document.createElement('video') } as React.RefObject<HTMLVideoElement>;
    const overlayRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement>;

    const { result } = renderHook(() =>
      useSignLanguageDetector(videoRef, overlayRef, {
        orchestratorFactory: () => orchestrator,
      }),
    );

    // First: set some MLP data
    act(() => {
      window.dispatchEvent(
        new CustomEvent(WEBVIEW_MESSAGE_EVENT, {
          detail: JSON.stringify({
            type: 'gesture',
            gesture: 'closed_fist',
            confidence: 0.8,
            mlp: { label: 'WINKEN', score: 0.7, candidates: [{ label: 'WINKEN', score: 0.7 }] },
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.lastMlpLabel).toBe('WINKEN');
    });

    // Then: send batch with explicit mlp:null in a nested message
    act(() => {
      window.dispatchEvent(
        new CustomEvent(WEBVIEW_MESSAGE_EVENT, {
          detail: JSON.stringify({
            type: 'gesture_batch',
            messageCount: 1,
            frameCount: 1,
            lastSentAt: Date.now(),
            messages: [
              {
                type: 'gesture',
                gesture: 'open_palm',
                confidence: 0.5,
                landmarks: [[[0.1, 0.2, 0]]],
                mlp: null,
              },
            ],
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.lastSign).toBe('open_palm');
      expect(result.current.lastMlpLabel).toBeNull();
      expect(result.current.lastMlpScore).toBeNull();
      expect(result.current.lastMlpCandidates).toEqual([]);
    });
  });



  it('uses highest-confidence gesture for summary in gesture batches', async () => {
    const orchestrator = createStubOrchestrator();
    const videoRef = { current: document.createElement('video') } as React.RefObject<HTMLVideoElement>;
    const overlayRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement>;

    const { result } = renderHook(() =>
      useSignLanguageDetector(videoRef, overlayRef, {
        orchestratorFactory: () => orchestrator,
      }),
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent(WEBVIEW_MESSAGE_EVENT, {
          detail: JSON.stringify({
            type: 'gesture_batch',
            messages: [
              { type: 'gesture', gesture: 'SATT', confidence: 0.83, landmarks: [[[0.1, 0.2, 0]]] },
              { type: 'gesture', gesture: 'TRINKEN', confidence: 0.5, landmarks: [[[0.2, 0.3, 0]]] },
            ],
          }),
        }),
      );
    });

    await waitFor(() => {
      const summary = result.current.messageLog[0]?.summary ?? '';
      expect(summary).toContain('Gebärde: SATT');
      expect(summary).toContain('Score: 0.83');
    });
  });

  it('strips UUID suffixes from summary gesture labels', async () => {
    const orchestrator = createStubOrchestrator();
    const videoRef = { current: document.createElement('video') } as React.RefObject<HTMLVideoElement>;
    const overlayRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement>;

    const { result } = renderHook(() =>
      useSignLanguageDetector(videoRef, overlayRef, {
        orchestratorFactory: () => orchestrator,
      }),
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent(WEBVIEW_MESSAGE_EVENT, {
          detail: JSON.stringify({
            type: 'gesture_batch',
            messages: [
              {
                type: 'gesture',
                gesture: 'trinken-485184eb-267e-4340-87d3-55d9bd530437',
                confidence: 0.5,
                landmarks: [[[0.1, 0.2, 0]]],
              },
            ],
          }),
        }),
      );
    });

    await waitFor(() => {
      const summary = result.current.messageLog[0]?.summary ?? '';
      expect(summary).toContain('Gebärde: trinken');
      expect(summary).not.toContain('55d9bd530437');
    });
  });

  it('propagates confidence summary when message has confidence but batch does not', async () => {
    const orchestrator = createStubOrchestrator();
    const videoRef = { current: document.createElement('video') } as React.RefObject<HTMLVideoElement>;
    const overlayRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement>;

    const { result } = renderHook(() =>
      useSignLanguageDetector(videoRef, overlayRef, {
        orchestratorFactory: () => orchestrator,
      }),
    );

    // No top-level confidence, no gesture label in first message
    act(() => {
      window.dispatchEvent(
        new CustomEvent(WEBVIEW_MESSAGE_EVENT, {
          detail: JSON.stringify({
            type: 'gesture_batch',
            messageCount: 2,
            frameCount: 2,
            lastSentAt: Date.now(),
            messages: [
              { type: 'gesture', gesture: 'none', confidence: 0.02, landmarks: [] },
              { type: 'gesture', gesture: 'SPIELEN', confidence: 0.91, landmarks: [[[0.2, 0.3, 0]]] },
            ],
          }),
        }),
      );
    });

    await waitFor(() => {
      const summary = result.current.messageLog[0]?.summary ?? '';
      // Summary should include score from the meaningful message (SPIELEN has 0.91)
      expect(summary).toContain('Score: 0.91');
      expect(summary).toContain('Gebärde: SPIELEN');
      expect(summary).toContain('2 Meldungen gesammelt');
    });
  });

  it('propagates handedness from nested message', async () => {
    const orchestrator = createStubOrchestrator();
    const videoRef = { current: document.createElement('video') } as React.RefObject<HTMLVideoElement>;
    const overlayRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement>;

    const { result } = renderHook(() =>
      useSignLanguageDetector(videoRef, overlayRef, {
        orchestratorFactory: () => orchestrator,
      }),
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent(WEBVIEW_MESSAGE_EVENT, {
          detail: JSON.stringify({
            type: 'gesture_batch',
            messageCount: 1,
            frameCount: 1,
            lastSentAt: Date.now(),
            messages: [
              {
                type: 'gesture',
                gesture: 'WINKEN',
                confidence: 0.7,
                landmarks: [[[0.4, 0.5, 0], [0.5, 0.6, 0]]],
                handednesses: ['left'],
              },
            ],
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.lastSign).toBe('WINKEN');
      expect(result.current.lastLandmarks.length).toBeGreaterThan(0);
      expect(result.current.lastHandedness[0]).toBe('Left');
    });
  });

});
