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
  it('startet und stoppt den Orchestrator', async () => {
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

  it('schaltet die Audioerkennung stumm', async () => {
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

  it('fasst Bridge-Meldungen zusammen und merkt sich Gesten', async () => {
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

  it('ignoriert leere gesture_batch Meldungen ohne Gesten und Landmarks', async () => {
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

  it('ignoriert "none" und verwendet die nächste echte Gebärde aus gesture_batch Meldungen', async () => {
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

  it('übernimmt Landmark-Previews aus Bridge-Meldungen', async () => {
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

  it('merkt sich Erkennungsweg und Fallback-Status aus Meldungen', async () => {
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

  it('stabilisiert fehlende Handedness-Einträge mit Platzhaltern', async () => {
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

  it('speichert und leert MLP-Metadaten passend zur letzten Bridge-Meldung', async () => {
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
            mlp: { label: 'TRINKEN', score: 0.61 },
            mlpDecision: { selected: false, reason: 'below_override_margin', threshold: 0.4 },
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.lastMlpLabel).toBe('TRINKEN');
      expect(result.current.lastMlpScore).toBeCloseTo(0.61);
      expect(result.current.lastMlpThreshold).toBeCloseTo(0.4);
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
    });
  });

});
