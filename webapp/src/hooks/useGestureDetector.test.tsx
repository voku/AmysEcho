import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WEBVIEW_MESSAGE_EVENT } from '../utils/reactNativeBridge';
import type { GestureRecognitionOrchestrator } from '../gesture/core/GestureRecognitionOrchestrator';
import { useGestureDetector } from './useGestureDetector';

function createStubOrchestrator() {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
  } as unknown as GestureRecognitionOrchestrator;
}

describe('useGestureDetector', () => {
  it('startet und stoppt den Orchestrator', async () => {
    const orchestrator = createStubOrchestrator();
    const videoRef = { current: document.createElement('video') } as React.RefObject<HTMLVideoElement>;
    const overlayRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement>;

    const { result } = renderHook(() =>
      useGestureDetector(videoRef, overlayRef, {
        orchestratorFactory: () => orchestrator,
      }),
    );

    await act(async () => {
      const ok = await result.current.start();
      expect(ok).toBe(true);
    });

    expect(orchestrator.initialize).toHaveBeenCalled();
    expect(orchestrator.start).toHaveBeenCalled();

    await act(async () => {
      await result.current.stop();
    });

    expect(orchestrator.stop).toHaveBeenCalled();
  });

  it('fasst Bridge-Meldungen zusammen und merkt sich Gesten', async () => {
    const orchestrator = createStubOrchestrator();
    const videoRef = { current: document.createElement('video') } as React.RefObject<HTMLVideoElement>;
    const overlayRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement>;

    const { result } = renderHook(() =>
      useGestureDetector(videoRef, overlayRef, {
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
      expect(result.current.lastGesture).toBe('WINKEN');
      expect(result.current.lastConfidence).toBeCloseTo(0.92);
    });
  });

  it('übernimmt Landmark-Previews aus Bridge-Meldungen', async () => {
    const orchestrator = createStubOrchestrator();
    const videoRef = { current: document.createElement('video') } as React.RefObject<HTMLVideoElement>;
    const overlayRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement>;

    const { result } = renderHook(() =>
      useGestureDetector(videoRef, overlayRef, {
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

  it('stabilisiert fehlende Handedness-Einträge mit Platzhaltern', async () => {
    const orchestrator = createStubOrchestrator();
    const videoRef = { current: document.createElement('video') } as React.RefObject<HTMLVideoElement>;
    const overlayRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement>;

    const { result } = renderHook(() =>
      useGestureDetector(videoRef, overlayRef, {
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
});
