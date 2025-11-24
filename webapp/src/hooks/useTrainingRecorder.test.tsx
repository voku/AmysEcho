import { renderHook, act, waitFor } from '@testing-library/react';
import { useTrainingRecorder } from './useTrainingRecorder';
import { WEBVIEW_MESSAGE_EVENT } from '../utils/reactNativeBridge';
import { describe, it, expect, beforeEach } from 'vitest';

describe('useTrainingRecorder', () => {
  beforeEach(() => {
    // Clear any event listeners before each test
    window.dispatchEvent = window.dispatchEvent;
  });

  it('startet und stoppt die Aufnahme', () => {
    const { result } = renderHook(() => useTrainingRecorder());

    expect(result.current.state).toBe('idle');
    expect(result.current.framesCaptured).toBe(0);

    act(() => {
      result.current.startRecording();
    });

    expect(result.current.state).toBe('recording');

    act(() => {
      result.current.stopRecording();
    });

    expect(result.current.state).toBe('idle');
  });

  it('erfasst Frame-Batch-Nachrichten während der Aufnahme', async () => {
    const { result } = renderHook(() => useTrainingRecorder());

    act(() => {
      result.current.startRecording();
    });

    // Simulate a FRAME_BATCH message
    const frameBatchMessage = {
      type: 'FRAME_BATCH',
      landmarks: [
        [
          [
            [0, 0, 0],
            [1, 1, 1],
          ],
        ],
      ],
      handednesses: [['Left']],
      frames: ['data:image/jpeg;base64,test'],
    };

    act(() => {
      window.dispatchEvent(new CustomEvent(WEBVIEW_MESSAGE_EVENT, { detail: JSON.stringify(frameBatchMessage) }));
    });

    await waitFor(() => {
      expect(result.current.framesCaptured).toBeGreaterThan(0);
      expect(result.current.recordedData.frames.length).toBeGreaterThan(0);
    });

    expect(result.current.recordedData.stillImage).toBe('data:image/jpeg;base64,test');
  });

  it('setzt die Aufnahme zurück', () => {
    const { result } = renderHook(() => useTrainingRecorder());

    act(() => {
      result.current.startRecording();
    });

    const frameBatchMessage = {
      type: 'FRAME_BATCH',
      landmarks: [
        [
          [
            [0, 0, 0],
            [1, 1, 1],
          ],
        ],
      ],
      handednesses: [['Left']],
    };

    act(() => {
      window.dispatchEvent(new CustomEvent(WEBVIEW_MESSAGE_EVENT, { detail: JSON.stringify(frameBatchMessage) }));
    });

    act(() => {
      result.current.resetRecording();
    });

    expect(result.current.state).toBe('idle');
    expect(result.current.framesCaptured).toBe(0);
    expect(result.current.recordedData.frames.length).toBe(0);
  });

  it('ignoriert Nachrichten wenn nicht aufgenommen wird', () => {
    const { result } = renderHook(() => useTrainingRecorder());

    const frameBatchMessage = {
      type: 'FRAME_BATCH',
      landmarks: [
        [
          [
            [0, 0, 0],
            [1, 1, 1],
          ],
        ],
      ],
    };

    act(() => {
      window.dispatchEvent(new CustomEvent(WEBVIEW_MESSAGE_EVENT, { detail: JSON.stringify(frameBatchMessage) }));
    });

    expect(result.current.framesCaptured).toBe(0);
    expect(result.current.recordedData.frames.length).toBe(0);
  });
});
