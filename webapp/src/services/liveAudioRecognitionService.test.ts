import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LiveAudioRecognitionService } from './liveAudioRecognitionService';

describe('LiveAudioRecognitionService', () => {
  let service: LiveAudioRecognitionService;
  let mockMediaStream: MediaStream;
  let mockAudioContext: AudioContext;

  beforeEach(() => {
    // Mock MediaStream
    mockMediaStream = {
      getTracks: vi.fn().mockReturnValue([
        { stop: vi.fn(), kind: 'audio' }
      ]),
      getAudioTracks: vi.fn().mockReturnValue([
        { stop: vi.fn() }
      ])
    } as unknown as MediaStream;

    // Mock navigator.mediaDevices
    global.navigator.mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(mockMediaStream)
    } as unknown as MediaDevices;

    // Mock AudioContext
    const mockAnalyser = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      fftSize: 2048,
      frequencyBinCount: 1024,
      getFloatTimeDomainData: vi.fn()
    };

    const mockSource = {
      connect: vi.fn(),
      disconnect: vi.fn()
    };

    mockAudioContext = {
      createMediaStreamSource: vi.fn().mockReturnValue(mockSource),
      createAnalyser: vi.fn().mockReturnValue(mockAnalyser),
      close: vi.fn().mockResolvedValue(undefined),
      sampleRate: 16000,
      state: 'running'
    } as unknown as AudioContext;

    // Use a class for AudioContext to make it a proper constructor
    (global as any).AudioContext = class {
      createMediaStreamSource = mockAudioContext.createMediaStreamSource;
      createAnalyser = mockAudioContext.createAnalyser;
      close = mockAudioContext.close;
      sampleRate = mockAudioContext.sampleRate;
      state = mockAudioContext.state;
    };

    service = new LiveAudioRecognitionService();
  });

  afterEach(() => {
    service.stop();
  });

  describe('start and stop lifecycle', () => {
    it('starts audio capture successfully', async () => {
      await service.start();
      
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        },
        video: false
      });
    });

    it('stops audio capture and releases resources', async () => {
      await service.start();
      service.stop();

      const tracks = mockMediaStream.getTracks();
      expect(tracks[0].stop).toHaveBeenCalled();
    });

    it('handles multiple start calls gracefully', async () => {
      await service.start();
      const result = await service.start();

      // Second call should return true without calling getUserMedia again
      expect(result).toBe(true);
    });

    it('handles stop when not started', () => {
      expect(() => service.stop()).not.toThrow();
    });
  });

  describe('feature extraction', () => {
    it('returns zero-padded features when not started', () => {
      const features = service.extractFeatures();
      
      expect(features.mfcc).toBeInstanceOf(Float32Array);
      expect(features.mfcc.length).toBe(13);
      expect(Array.from(features.mfcc).every(v => v === 0)).toBe(true);
      expect(features.hasAudio).toBe(false);
    });

    it('extracts MFCC features when audio is active', async () => {
      await service.start();
      const features = service.extractFeatures();
      
      expect(features.mfcc).toBeInstanceOf(Float32Array);
      expect(features.mfcc.length).toBe(13);
      expect(typeof features.timestamp).toBe('number');
    });

    it('includes timestamp with extracted features', async () => {
      await service.start();
      const features = service.extractFeatures();
      
      expect(typeof features.timestamp).toBe('number');
      expect(features.timestamp).toBeGreaterThan(0);
      expect(typeof features.hasAudio).toBe('boolean');
    });
  });

  describe('error handling', () => {
    it('handles microphone permission denial gracefully', async () => {
      const error = new Error('Permission denied');
      (error as any).name = 'NotAllowedError';
      (navigator.mediaDevices.getUserMedia as any).mockRejectedValue(error);

      await service.start();
      
      // Should not throw, graceful degradation
      const features = service.extractFeatures();
      expect(Array.from(features.mfcc).every(v => v === 0)).toBe(true);
    });

    it('handles missing getUserMedia API', async () => {
      delete (global.navigator as any).mediaDevices;

      await service.start();
      
      // Should not throw, graceful degradation
      const features = service.extractFeatures();
      expect(Array.from(features.mfcc).every(v => v === 0)).toBe(true);
    });

    it('handles AudioContext creation failure', async () => {
      (global.AudioContext as any) = undefined;

      await service.start();
      
      // Should not throw, graceful degradation
      const features = service.extractFeatures();
      expect(Array.from(features.mfcc).every(v => v === 0)).toBe(true);
    });
  });

  describe('Amy First principles', () => {
    it('never blocks visual recognition when audio fails', async () => {
      const error = new Error('Audio error');
      (navigator.mediaDevices.getUserMedia as any).mockRejectedValue(error);

      await service.start();
      
      // Audio failure should not throw
      expect(() => service.extractFeatures()).not.toThrow();
      
      // Should return zero-padded features for graceful degradation
      const features = service.extractFeatures();
      expect(features.mfcc).toBeDefined();
    });

    it('provides instant feedback with zero-padded features', () => {
      // Before starting, immediately provides zero features
      const features = service.extractFeatures();
      
      expect(features.mfcc).toBeDefined();
      expect(features.mfcc.length).toBe(13);
    });

    it('cleans up resources properly to prevent memory leaks', async () => {
      await service.start();
      service.stop();

      // Tracks should be stopped
      const tracks = mockMediaStream.getTracks();
      expect(tracks[0].stop).toHaveBeenCalled();
    });
  });
});
