import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraManager } from './CameraManager';
import { ResourceManager } from '../utils/ResourceManager';

function createVideoElement(): HTMLVideoElement {
  const video = document.createElement('video');
  Object.defineProperty(video, 'srcObject', {
    configurable: true,
    writable: true,
    value: null,
  });
  Object.defineProperty(video, 'play', {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(video, 'pause', {
    configurable: true,
    value: vi.fn(),
  });
  return video;
}

function createMockStream(trackLabel = 'camera-track'): MediaStream {
  const track = { label: trackLabel, stop: vi.fn() } as unknown as MediaStreamTrack;
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
    getAudioTracks: () => [],
  } as unknown as MediaStream;
}

describe('CameraManager adaptive constraints', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with ideal constraints and front camera by default', async () => {
    const getUserMediaMock = vi.fn().mockResolvedValue(createMockStream());
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: getUserMediaMock },
    });

    const video = createVideoElement();
    const manager = new CameraManager(video, new ResourceManager());

    await manager.startCamera();

    expect(getUserMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        }),
      }),
    );
  });

  it('degrades constraints after sustained lag and preserves facing mode', async () => {
    window.localStorage.setItem('cameraFacingMode', 'environment');

    const getUserMediaMock = vi
      .fn()
      .mockResolvedValueOnce(createMockStream('initial-track'))
      .mockResolvedValueOnce(createMockStream('downgraded-track'));

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: getUserMediaMock },
    });

    const video = createVideoElement();
    const manager = new CameraManager(video, new ResourceManager());

    await manager.startCamera();

    for (let i = 0; i < 30; i += 1) {
      manager.reportProcessingTime(60);
    }

    await vi.waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalledTimes(2);
    });

    expect(getUserMediaMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        video: expect.objectContaining({
          facingMode: 'environment',
          width: { ideal: 960 },
          height: { ideal: 540 },
          frameRate: { ideal: 24, max: 24 },
        }),
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 1200));
    const persistedEvents = JSON.parse(window.localStorage.getItem('telemetryEvents') || '[]') as Array<{ event?: string }>;
    expect(persistedEvents.some((event) => event.event === 'camera_constraints_adapted')).toBe(true);
  });

  it('falls back to a lower tier when first downgrade attempt fails', async () => {
    const getUserMediaMock = vi
      .fn()
      .mockResolvedValueOnce(createMockStream('initial-track'))
      .mockRejectedValueOnce(new Error('Tier 1 not available'))
      .mockResolvedValueOnce(createMockStream('tier-2-track'));

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: getUserMediaMock },
    });

    const video = createVideoElement();
    const manager = new CameraManager(video, new ResourceManager());

    await manager.startCamera();

    for (let i = 0; i < 30; i += 1) {
      manager.reportProcessingTime(65);
    }

    await vi.waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalledTimes(3);
    });

    expect(getUserMediaMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        video: expect.objectContaining({ width: { ideal: 960 }, height: { ideal: 540 } }),
      }),
    );
    expect(getUserMediaMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        video: expect.objectContaining({ width: { ideal: 640 }, height: { ideal: 480 } }),
      }),
    );
  });

  it('recovers to higher-quality constraints after sustained fast processing', async () => {
    const getUserMediaMock = vi
      .fn()
      .mockResolvedValueOnce(createMockStream('initial-track'))
      .mockResolvedValueOnce(createMockStream('downgraded-track'))
      .mockResolvedValueOnce(createMockStream('recovered-track'));

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: getUserMediaMock },
    });

    let nowValue = 6_000;
    vi.spyOn(Date, 'now').mockImplementation(() => nowValue);

    const video = createVideoElement();
    const manager = new CameraManager(video, new ResourceManager());
    await manager.startCamera();

    for (let i = 0; i < 30; i += 1) {
      manager.reportProcessingTime(60);
    }

    await vi.waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalledTimes(2);
    });
    await new Promise((resolve) => setTimeout(resolve, 1200));

    nowValue = 12_000;

    for (let i = 0; i < 30; i += 1) {
      manager.reportProcessingTime(12);
    }

    await vi.waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalledTimes(3);
    });

    expect(getUserMediaMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        video: expect.objectContaining({ width: { ideal: 1280 }, height: { ideal: 720 } }),
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 1200));
    const persistedEvents = JSON.parse(window.localStorage.getItem('telemetryEvents') || '[]') as Array<{ event?: string }>;
    expect(persistedEvents.some((event) => event.event === 'camera_constraints_recovered')).toBe(true);
  });

  it('unregisters stream references when camera is stopped', async () => {
    const stream = createMockStream('cleanup-track');
    const getUserMediaMock = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: getUserMediaMock },
    });

    const resourceManager = new ResourceManager();
    const unregisterSpy = vi.spyOn(resourceManager, 'unregisterMediaStream');
    const video = createVideoElement();
    const manager = new CameraManager(video, resourceManager);

    await manager.startCamera();
    await manager.stopCamera();

    expect(unregisterSpy).toHaveBeenCalledWith(stream);
  });

  it('cleans up partially initialized streams when video playback fails during start', async () => {
    const stream = createMockStream('play-failure-track');
    const getUserMediaMock = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: getUserMediaMock },
    });

    const resourceManager = new ResourceManager();
    const unregisterSpy = vi.spyOn(resourceManager, 'unregisterMediaStream');
    const video = createVideoElement();
    Object.defineProperty(video, 'play', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error('play failed')),
    });
    const manager = new CameraManager(video, resourceManager);

    await expect(manager.startCamera()).rejects.toThrow('play failed');

    expect(unregisterSpy).toHaveBeenCalledWith(stream);
    expect(video.srcObject).toBeNull();
  });

  it('restarts playback after adaptive stream swaps', async () => {
    const getUserMediaMock = vi
      .fn()
      .mockResolvedValueOnce(createMockStream('initial-track'))
      .mockResolvedValueOnce(createMockStream('downgraded-track'));
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: getUserMediaMock },
    });

    const video = createVideoElement();
    const manager = new CameraManager(video, new ResourceManager());
    await manager.startCamera();

    for (let i = 0; i < 30; i += 1) {
      manager.reportProcessingTime(60);
    }
    await vi.waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalledTimes(2);
    });

    const playMock = video.play as unknown as { mock: { calls: unknown[][] } };
    await vi.waitFor(() => {
      expect(playMock.mock.calls.length).toBe(2);
    });
  });
});
