const MAX_CAPTURE_DIMENSION = 640;
const MAX_DATA_URL_LENGTH = 400_000; // ~400 KB cap to protect bridge bandwidth

let frameCaptureEnabled = false;
let frameCaptureInterval = 500;
let lastCapturedFrame: string | null = null;
let lastCaptureTimestamp = 0;
let captureCanvas: HTMLCanvasElement | null = null;
let captureContext: CanvasRenderingContext2D | null = null;

function ensureCanvas(video: HTMLVideoElement): void {
  if (!captureCanvas) {
    captureCanvas = document.createElement('canvas');
    captureContext = captureCanvas.getContext('2d');
  }

  if (!captureCanvas || !captureContext) {
    throw new Error('Unable to initialize frame capture canvas');
  }

  const width = video.videoWidth;
  const height = video.videoHeight;

  if (width && height) {
    const scale = Math.min(1, MAX_CAPTURE_DIMENSION / width, MAX_CAPTURE_DIMENSION / height);
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    if (captureCanvas.width !== targetWidth || captureCanvas.height !== targetHeight) {
      captureCanvas.width = targetWidth;
      captureCanvas.height = targetHeight;
    }
  }
}

export function initializeFrameCapture(video: HTMLVideoElement): void {
  try {
    ensureCanvas(video);
    lastCapturedFrame = null;
    lastCaptureTimestamp = 0;
  } catch (error) {
    console.warn('Failed to initialize frame capture:', error);
  }
}

export function setFrameCaptureEnabled(enabled: boolean, intervalMs?: number): void {
  frameCaptureEnabled = enabled;
  if (typeof intervalMs === 'number' && intervalMs > 0) {
    frameCaptureInterval = intervalMs;
  }
  if (!enabled) {
    lastCapturedFrame = null;
  }
}

export function captureFrameForOpenAI(video: HTMLVideoElement): string | null {
  if (!frameCaptureEnabled) {
    return lastCapturedFrame;
  }

  try {
    ensureCanvas(video);
    if (!captureCanvas || !captureContext || !video.videoWidth || !video.videoHeight) {
      return lastCapturedFrame;
    }

    const now = Date.now();
    if (now - lastCaptureTimestamp < frameCaptureInterval) {
      return lastCapturedFrame;
    }

    captureContext.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);

    const qualityLevels = [0.7, 0.5, 0.3];
    let dataUrl: string | null = null;

    for (const quality of qualityLevels) {
      try {
        dataUrl = captureCanvas.toDataURL('image/jpeg', quality);
      } catch (error) {
        console.warn('Frame capture encoding failed', error);
        dataUrl = null;
        break;
      }

      if (!dataUrl || dataUrl.length <= MAX_DATA_URL_LENGTH) {
        break;
      }
    }

    if (dataUrl && dataUrl.length <= MAX_DATA_URL_LENGTH) {
      lastCapturedFrame = dataUrl;
      lastCaptureTimestamp = now;
    }
  } catch (error) {
    console.warn('Frame capture failed:', error);
  }

  return lastCapturedFrame;
}

export function getLastCapturedFrame(): string | null {
  return lastCapturedFrame;
}

export const frameCaptureState = {
  get frameCaptureEnabled() {
    return frameCaptureEnabled;
  },
  get frameCaptureInterval() {
    return frameCaptureInterval;
  },
  get lastCapturedFrame() {
    return lastCapturedFrame;
  },
};

export function disposeFrameCapture(): void {
  frameCaptureEnabled = false;
  lastCapturedFrame = null;
  captureCanvas = null;
  captureContext = null;
}
