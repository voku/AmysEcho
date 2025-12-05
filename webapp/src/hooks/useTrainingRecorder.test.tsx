import { renderHook, act, waitFor } from '@testing-library/react';
import { useTrainingRecorder } from './useTrainingRecorder';
import { WEBVIEW_MESSAGE_EVENT } from '../utils/reactNativeBridge';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

type MockMediaRecorderState = 'inactive' | 'recording' | 'paused';

const attachStream = (video: HTMLVideoElement, stream: MediaStream) => {
  Object.defineProperty(video, 'srcObject', {
    value: stream,
    writable: true,
    configurable: true,
    enumerable: true,
  });
};

describe('useTrainingRecorder', () => {
  let OriginalMediaRecorder: typeof MediaRecorder | undefined;
  let OriginalMediaStream: typeof MediaStream | undefined;

  beforeEach(() => {
    OriginalMediaRecorder = (window as any).MediaRecorder;
    OriginalMediaStream = (window as any).MediaStream;

    if (!OriginalMediaStream) {
      (window as any).MediaStream = class extends EventTarget {} as any;
    }
  });

  afterEach(() => {
    (window as any).MediaRecorder = OriginalMediaRecorder;
    (window as any).MediaStream = OriginalMediaStream;
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

  it('wertet FRAME_BATCH-Meldungen aus gesture_batch aus', async () => {
    const { result } = renderHook(() => useTrainingRecorder());

    act(() => {
      result.current.startRecording();
    });

    const gestureBatchMessage = {
      type: 'gesture_batch',
      messages: [
        {
          type: 'FRAME_BATCH',
          landmarks: [
            [
              [
                [0, 0, 0],
                [1, 1, 1],
              ],
            ],
          ],
          handednesses: [['Right']],
          frames: ['data:image/jpeg;base64,from-batch'],
        },
      ],
    };

    act(() => {
      window.dispatchEvent(new CustomEvent(WEBVIEW_MESSAGE_EVENT, { detail: JSON.stringify(gestureBatchMessage) }));
    });

    await waitFor(() => {
      expect(result.current.framesCaptured).toBeGreaterThan(0);
    });

    expect(result.current.lastFrameReceivedAt).not.toBeNull();
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

  it('erstellt eine Clip-Datei über MediaRecorder', async () => {
    const stream = new MediaStream();
    const video = document.createElement('video') as HTMLVideoElement & { srcObject?: MediaStream };
    attachStream(video, stream);

    let mockInstance: any;
    class MockMediaRecorder {
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      state: MockMediaRecorderState = 'inactive';
      readonly mimeType = 'video/webm';
      readonly stream: MediaStream;

      constructor(recorderStream: MediaStream) {
        this.stream = recorderStream;
        mockInstance = this;
      }

      start() {
        this.state = 'recording';
        const chunk = new Blob([new Uint8Array(1024 * 1024 * 26)], { type: 'video/webm' });
        this.ondataavailable?.({ data: chunk });
      }

      stop() {
        this.state = 'inactive';
        this.onstop?.();
      }
    }

    (window as any).MediaRecorder = MockMediaRecorder as any;

    const { result } = renderHook(() => useTrainingRecorder({ current: video }));

    act(() => {
      result.current.startRecording();
    });

    expect(mockInstance).toBeDefined();
    expect(result.current.recordedData.clipSizeBytes).toBeGreaterThan(0);

    act(() => {
      result.current.stopRecording();
    });

    await waitFor(() => {
      expect(result.current.recordedData.clipFile).not.toBeNull();
    });

    expect(result.current.recordedData.clipFile?.name).toBe('clip.webm');
    expect(result.current.clipLimitExceeded).toBe(true);
    expect(result.current.maxClipBytes).toBe(25 * 1024 * 1024);
  });

  it('verwirft Clip-Daten beim Zurücksetzen einer laufenden Aufnahme', async () => {
    const stream = new MediaStream();
    const video = document.createElement('video') as HTMLVideoElement & { srcObject?: MediaStream };
    attachStream(video, stream);

    let onStopCalled = false;
    let onStopHandlerCalled = false;
    class MockMediaRecorder {
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      state: MockMediaRecorderState = 'inactive';
      readonly mimeType = 'video/webm';
      readonly stream: MediaStream;

      constructor(recorderStream: MediaStream) {
        this.stream = recorderStream;
      }

      start() {
        this.state = 'recording';
        const chunk = new Blob([new Uint8Array(1024 * 1024 * 5)], { type: 'video/webm' });
        this.ondataavailable?.({ data: chunk });
      }

      stop() {
        this.state = 'inactive';
        const handler = this.onstop;
        if (handler) {
          handler();
          onStopHandlerCalled = true;
        }
        onStopCalled = true;
      }
    }

    (window as any).MediaRecorder = MockMediaRecorder as any;

    const { result } = renderHook(() => useTrainingRecorder({ current: video }));

    act(() => {
      result.current.startRecording();
    });

    expect(result.current.recordedData.clipSizeBytes).toBeGreaterThan(0);

    act(() => {
      result.current.resetRecording();
    });

    expect(onStopHandlerCalled).toBe(false);
    expect(onStopCalled).toBe(true);
    expect(result.current.recordedData.clipFile).toBeNull();
    expect(result.current.recordedData.clipSizeBytes).toBe(0);
    expect(result.current.recordedData.clipDurationMs).toBe(0);
  });
});
