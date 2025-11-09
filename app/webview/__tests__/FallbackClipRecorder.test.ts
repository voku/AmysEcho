const mockFrameCaptureState = {
  enabled: false,
  interval: 180,
  lastCapturedFrame: null as string | null,
};

const mockCaptureFrameForOpenAI = jest.fn<string | null, [HTMLVideoElement]>();
const mockSetFrameCaptureEnabled = jest.fn<void, [boolean, number | undefined]>();

jest.mock('../utils/FrameCaptureManager', () => ({
  __esModule: true,
  captureFrameForOpenAI: (video: HTMLVideoElement) => mockCaptureFrameForOpenAI(video),
  getLastCapturedFrame: () => mockFrameCaptureState.lastCapturedFrame,
  setFrameCaptureEnabled: (enabled: boolean, interval?: number) => {
    mockFrameCaptureState.enabled = enabled;
    if (typeof interval === 'number') {
      mockFrameCaptureState.interval = interval;
    }
    mockSetFrameCaptureEnabled(enabled, interval);
  },
  frameCaptureState: {
    get frameCaptureEnabled() {
      return mockFrameCaptureState.enabled;
    },
    get frameCaptureInterval() {
      return mockFrameCaptureState.interval;
    },
    get lastCapturedFrame() {
      return mockFrameCaptureState.lastCapturedFrame;
    },
  },
}));

import { FallbackClipRecorder } from '../utils/FallbackClipRecorder';

// Minimal SOI/EOI JPEG payload; enough for the encoder to treat as a distinct frame
const SAMPLE_FRAME = 'data:image/jpeg;base64,/9j/2Q==';

describe('FallbackClipRecorder', () => {
  let video: HTMLVideoElement;

  beforeEach(() => {
    jest.useFakeTimers();
    mockCaptureFrameForOpenAI.mockReset();
    mockSetFrameCaptureEnabled.mockClear();
    mockFrameCaptureState.enabled = false;
    mockFrameCaptureState.interval = 220;
    mockFrameCaptureState.lastCapturedFrame = null;

    video = document.createElement('video');
    Object.defineProperty(video, 'videoWidth', { value: 320, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 240, configurable: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('encodes captured JPEG frames into an MJPEG AVI clip', async () => {
    mockCaptureFrameForOpenAI.mockImplementation(() => {
      mockFrameCaptureState.lastCapturedFrame = SAMPLE_FRAME;
      return SAMPLE_FRAME;
    });

    const recorder = new FallbackClipRecorder(video, { frameIntervalMs: 100 });
    recorder.start();

    const result = await recorder.stop();

    expect(result.mimeType).toBe('video/avi');
    expect(result.frameCount).toBe(1);
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThan(0);
    expect(new Date(result.capturedAt).toString()).not.toBe('Invalid Date');

    expect(mockCaptureFrameForOpenAI).toHaveBeenCalled();
    expect(mockSetFrameCaptureEnabled).toHaveBeenNthCalledWith(1, true, 100);
    expect(mockSetFrameCaptureEnabled).toHaveBeenLastCalledWith(false, 220);

    const bytes = Buffer.from(result.base64, 'base64');
    expect(bytes.slice(0, 4).toString('ascii')).toBe('RIFF');
    expect(bytes.slice(8, 11).toString('ascii')).toBe('AVI');
  });

  it('restores previous capture settings even when no frames are recorded', async () => {
    mockCaptureFrameForOpenAI.mockReturnValue(null);

    const recorder = new FallbackClipRecorder(video, { frameIntervalMs: 90 });
    recorder.start();

    await expect(recorder.stop()).rejects.toThrow('fallback_no_frames');

    expect(mockSetFrameCaptureEnabled).toHaveBeenNthCalledWith(1, true, 90);
    expect(mockSetFrameCaptureEnabled).toHaveBeenLastCalledWith(false, 220);
  });
});
