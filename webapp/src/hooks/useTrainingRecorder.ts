import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
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
  clipFile: File | null;
  clipSizeBytes: number;
  clipDurationMs: number;
  clipError: string | null;
}

export interface TrainingRecorderResult {
  state: RecordingState;
  recordedData: RecordedData;
  startRecording: () => void;
  stopRecording: () => void;
  resetRecording: () => void;
  framesCaptured: number;
  clipLimitExceeded: boolean;
  maxClipBytes: number;
}

const MAX_BUFFERED_FRAMES = 240;
const MAX_CLIP_BYTES = 25 * 1024 * 1024; // 25 MB

function pickMimeType(): string | undefined {
  if (typeof window.MediaRecorder === 'undefined' || typeof window.MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }

  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return candidates.find((candidate) => window.MediaRecorder.isTypeSupported(candidate));
}

function resolveRecordingStream(video?: HTMLVideoElement | null): MediaStream | null {
  const srcObject = (video as HTMLVideoElement & { srcObject?: MediaStream })?.srcObject;
  if (srcObject instanceof MediaStream) {
    return srcObject;
  }

  if (typeof video?.captureStream === 'function') {
    try {
      return video.captureStream();
    } catch (error) {
      console.warn('captureStream failed', error);
    }
  }

  return null;
}

function isFrameBatchMessage(payload: unknown): payload is FrameBatchPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'landmarks' in payload &&
    Array.isArray((payload as FrameBatchPayload).landmarks)
  );
}

export function useTrainingRecorder(videoRef?: RefObject<HTMLVideoElement>): TrainingRecorderResult {
  const [state, setState] = useState<RecordingState>('idle');
  const [recordedFrames, setRecordedFrames] = useState<TrainingFrame[]>([]);
  const [stillImage, setStillImage] = useState<string | null>(null);
  const [framesCaptured, setFramesCaptured] = useState(0);
  const [clipFile, setClipFile] = useState<File | null>(null);
  const [clipSizeBytes, setClipSizeBytes] = useState(0);
  const [clipDurationMs, setClipDurationMs] = useState(0);
  const [clipError, setClipError] = useState<string | null>(null);
  const isRecordingRef = useRef(false);
  const clipRecorderRef = useRef<MediaRecorder | null>(null);
  const clipChunksRef = useRef<Blob[]>([]);
  const clipStartRef = useRef<number | null>(null);

  const clipLimitExceeded = useMemo(() => clipSizeBytes > MAX_CLIP_BYTES, [clipSizeBytes]);

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
    setClipFile(null);
    setClipSizeBytes(0);
    setClipDurationMs(0);
    setClipError(null);
    clipChunksRef.current = [];
    clipStartRef.current = Date.now();

    const stream = resolveRecordingStream(videoRef?.current ?? null);
    if (!stream || typeof window.MediaRecorder === 'undefined') {
      setClipError('Videoaufnahme im Browser nicht verfügbar.');
      return;
    }

    const mimeType = pickMimeType();
    try {
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      clipRecorderRef.current = recorder;
      recorder.ondataavailable = (event: BlobEvent) => {
        if (!event.data || event.data.size === 0) {
          return;
        }
        clipChunksRef.current.push(event.data);
        setClipSizeBytes((prev) => prev + event.data.size);
      };
      recorder.onstop = () => {
        if (clipStartRef.current) {
          const durationMs = Date.now() - clipStartRef.current;
          setClipDurationMs(durationMs);
          clipStartRef.current = null;
        }

        const blob = new Blob(clipChunksRef.current, { type: recorder.mimeType || mimeType || 'video/webm' });
        clipChunksRef.current = [];
        clipRecorderRef.current = null;
        if (blob.size === 0) {
          setClipError('Leere Videoaufnahme erhalten.');
          return;
        }
        const file = new File([blob], 'clip.webm', { type: blob.type });
        setClipFile(file);
      };
      recorder.onerror = (event: Event) => {
        const error = (event as { error?: unknown }).error;
        const reason = error instanceof Error ? error.message : 'Recorder-Fehler';
        setClipError(reason);
      };

      try {
        recorder.start(1000);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        setClipError(`Recorder konnte nicht starten: ${reason}`);
      }
    } catch (recorderError) {
      const reason = recorderError instanceof Error ? recorderError.message : String(recorderError);
      setClipError(reason);
    }
  }, [videoRef]);

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    if (clipRecorderRef.current && clipRecorderRef.current.state === 'recording') {
      try {
        clipRecorderRef.current.stop();
      } catch (error) {
        console.warn('Fehler beim Stoppen der Videoaufnahme', error);
      }
    }
    // Transition directly to idle - frame processing is synchronous via event listener
    setState('idle');
  }, []);

  const resetRecording = useCallback(() => {
    setState('idle');
    isRecordingRef.current = false;
    if (clipRecorderRef.current) {
      clipRecorderRef.current.ondataavailable = null;
      clipRecorderRef.current.onstop = null;
      clipRecorderRef.current.onerror = null;
      if (clipRecorderRef.current.state === 'recording') {
        try {
          clipRecorderRef.current.stop();
        } catch (error) {
          console.warn('Fehler beim Zurücksetzen der Videoaufnahme', error);
        }
      }
      clipRecorderRef.current = null;
    }
    setRecordedFrames([]);
    setStillImage(null);
    setFramesCaptured(0);
    setClipFile(null);
    setClipSizeBytes(0);
    setClipDurationMs(0);
    setClipError(null);
    clipChunksRef.current = [];
    clipStartRef.current = null;
  }, []);

  const recordedData: RecordedData = {
    frames: recordedFrames,
    stillImage,
    frameCount: framesCaptured,
    clipFile,
    clipSizeBytes,
    clipDurationMs,
    clipError,
  };

  return {
    state,
    recordedData,
    startRecording,
    stopRecording,
    resetRecording,
    framesCaptured,
    clipLimitExceeded,
    maxClipBytes: MAX_CLIP_BYTES,
  };
}
