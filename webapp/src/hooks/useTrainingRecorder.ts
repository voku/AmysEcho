import { useCallback, useEffect, useRef, useState } from 'react';
import { WEBVIEW_MESSAGE_EVENT } from '../utils/reactNativeBridge';
import type { TrainingFrame } from '../training/types';

export type RecordingState = 'idle' | 'recording';

/**
 * Local definition matching FrameBatchPayload from app/src/types/frames.ts.
 * Keep this in sync with the canonical definition to avoid payload shape drift.
 */
interface FrameBatchPayload {
  frames?: string[];
  landmarks: number[][][][];
  handednesses?: string[][];
  timestamps?: number[];
}

interface RecordedData {
  frames: TrainingFrame[];
  stillImage: string | null;
  frameCount: number;
}

export interface TrainingRecorderResult {
  state: RecordingState;
  recordedData: RecordedData;
  startRecording: () => void;
  stopRecording: () => void;
  resetRecording: () => void;
  framesCaptured: number;
}

const MAX_BUFFERED_FRAMES = 240;

function isFrameBatchMessage(payload: unknown): payload is FrameBatchPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'landmarks' in payload &&
    Array.isArray((payload as FrameBatchPayload).landmarks)
  );
}

export function useTrainingRecorder(): TrainingRecorderResult {
  const [state, setState] = useState<RecordingState>('idle');
  const [recordedFrames, setRecordedFrames] = useState<TrainingFrame[]>([]);
  const [stillImage, setStillImage] = useState<string | null>(null);
  const [framesCaptured, setFramesCaptured] = useState(0);
  const isRecordingRef = useRef(false);

  const handleFrameBatch = useCallback((payload: FrameBatchPayload) => {
    if (!isRecordingRef.current) {
      return;
    }

    const framesToAppend: TrainingFrame[] = [];
    const handednessBatches = Array.isArray(payload.handednesses) ? payload.handednesses : [];
    const frameImages = Array.isArray(payload.frames)
      ? payload.frames.filter((frame): frame is string => typeof frame === 'string')
      : [];

    // Capture the last frame as still image
    if (frameImages.length > 0) {
      const lastFrame = frameImages[frameImages.length - 1];
      if (typeof lastFrame === 'string' && lastFrame.trim().length > 0) {
        setStillImage(lastFrame);
      }
    }

    // Process landmarks
    if (Array.isArray(payload.landmarks)) {
      payload.landmarks.forEach((frame, index) => {
        if (!Array.isArray(frame) || frame.length === 0) {
          return;
        }

        // Clone landmarks to avoid reference issues
        const cloned = frame.map((hand) =>
          Array.isArray(hand) ? hand.map((point) => (Array.isArray(point) ? [...point] : point)) : hand,
        );

        if (!cloned.some((hand) => Array.isArray(hand) && hand.length > 0)) {
          return;
        }

        const handedness = Array.isArray(handednessBatches[index])
          ? handednessBatches[index].filter((h): h is string => typeof h === 'string')
          : [];

        framesToAppend.push({
          landmarks: cloned as number[][][],
          handedness,
        });
      });
    }

    if (framesToAppend.length === 0) {
      return;
    }

    setRecordedFrames((prev) => {
      const combined = [...prev, ...framesToAppend];
      return combined.length > MAX_BUFFERED_FRAMES ? combined.slice(-MAX_BUFFERED_FRAMES) : combined;
    });
    setFramesCaptured((count) => count + framesToAppend.length);
  }, []);

  useEffect(() => {
    const handleBridgeMessage = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (!detail || !isRecordingRef.current) {
        return;
      }

      try {
        const parsed = JSON.parse(detail);
        if (parsed?.type === 'FRAME_BATCH' && isFrameBatchMessage(parsed)) {
          handleFrameBatch(parsed);
        }
      } catch (error) {
        // Ignore parse errors
      }
    };

    window.addEventListener(WEBVIEW_MESSAGE_EVENT, handleBridgeMessage as EventListener);
    return () => {
      window.removeEventListener(WEBVIEW_MESSAGE_EVENT, handleBridgeMessage as EventListener);
    };
  }, [handleFrameBatch]);

  const startRecording = useCallback(() => {
    setState('recording');
    isRecordingRef.current = true;
    setRecordedFrames([]);
    setStillImage(null);
    setFramesCaptured(0);
  }, []);

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    // Transition directly to idle - frame processing is synchronous via event listener
    setState('idle');
  }, []);

  const resetRecording = useCallback(() => {
    setState('idle');
    isRecordingRef.current = false;
    setRecordedFrames([]);
    setStillImage(null);
    setFramesCaptured(0);
  }, []);

  const recordedData: RecordedData = {
    frames: recordedFrames,
    stillImage,
    frameCount: framesCaptured,
  };

  return {
    state,
    recordedData,
    startRecording,
    stopRecording,
    resetRecording,
    framesCaptured,
  };
}
