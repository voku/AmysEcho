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

  if (video.videoWidth && video.videoHeight) {
    if (captureCanvas.width !== video.videoWidth || captureCanvas.height !== video.videoHeight) {
      captureCanvas.width = video.videoWidth;
      captureCanvas.height = video.videoHeight;
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
    lastCapturedFrame = captureCanvas.toDataURL('image/jpeg', 0.7);
    lastCaptureTimestamp = now;
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
