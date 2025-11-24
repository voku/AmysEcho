import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

    await waitFor(() => {
      expect(window.ReactNativeWebView?.postMessage).toBeTypeOf('function');
    });

    act(() => {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({ type: 'gesture', gesture: 'WINKEN', confidence: 0.92 }),
      );
    });

    await waitFor(() => {
      expect(result.current.messageLog.length).toBeGreaterThan(0);
      expect(result.current.lastGesture).toBe('WINKEN');
    });
  });
});
