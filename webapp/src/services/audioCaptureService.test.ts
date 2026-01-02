/**
 * Tests for AudioCaptureService
 * 
 * Amy First: Verify that audio capture works reliably for multimodal recognition
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AudioCaptureService } from './audioCaptureService';

// Mock MediaRecorder
class MockMediaRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  mimeType: string;
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private dataChunks: Blob[] = [];

  constructor(stream: MediaStream, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType || 'audio/webm';
  }

  start(timeslice?: number) {
    this.state = 'recording';
    this.dataChunks = [];
    
    // Simulate data chunks being generated
    const generateChunk = () => {
      if (this.state === 'recording') {
        const blob = new Blob(['mock-audio-data-chunk'], { type: this.mimeType });
        const event = { data: blob } as BlobEvent;
        this.dataChunks.push(blob);
        this.ondataavailable?.(event);
      }
    };
    
    // Generate first chunk immediately
    setTimeout(generateChunk, 10);
    
    // Generate more chunks periodically if timeslice is set
    if (timeslice) {
      const interval = setInterval(() => {
        if (this.state !== 'recording') {
          clearInterval(interval);
          return;
        }
        generateChunk();
      }, timeslice);
    }
  }

  stop() {
    this.state = 'inactive';
    // Ensure we have at least one chunk
    if (this.dataChunks.length === 0 && this.ondataavailable) {
      const blob = new Blob(['mock-audio-data'], { type: this.mimeType });
      const event = { data: blob } as BlobEvent;
      this.ondataavailable(event);
    }
    setTimeout(() => {
      this.onstop?.();
    }, 10);
  }

  static isTypeSupported(mimeType: string): boolean {
    return mimeType === 'audio/webm;codecs=opus' || mimeType === 'audio/webm';
  }
}

// Mock getUserMedia
const mockGetUserMedia = vi.fn();

describe('AudioCaptureService', () => {
  let audioService: AudioCaptureService;
  let originalMediaRecorder: typeof MediaRecorder;
  let originalNavigator: typeof navigator;

  beforeEach(() => {
    // Save original implementations
    originalMediaRecorder = (global as any).MediaRecorder;
    originalNavigator = global.navigator;

    // Mock MediaRecorder
    (global as any).MediaRecorder = MockMediaRecorder;

    // Mock navigator.mediaDevices.getUserMedia
    const mockStream = {
      getTracks: () => [{
        stop: vi.fn(),
      }],
    } as unknown as MediaStream;
    
    mockGetUserMedia.mockResolvedValue(mockStream);
    
    // Create navigator.mediaDevices if it doesn't exist
    if (!(global as any).navigator) {
      (global as any).navigator = {};
    }
    if (!(global as any).navigator.mediaDevices) {
      (global as any).navigator.mediaDevices = {};
    }
    (global as any).navigator.mediaDevices.getUserMedia = mockGetUserMedia;

    audioService = new AudioCaptureService();
  });

  afterEach(() => {
    // Restore original implementations
    (global as any).MediaRecorder = originalMediaRecorder;
    (global as any).navigator = originalNavigator;
    
    mockGetUserMedia.mockReset();
  });

  describe('startRecording', () => {
    it('sollte Audio-Aufnahme starten', async () => {
      await audioService.startRecording();
      
      expect(mockGetUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: expect.any(Object),
          video: false,
        })
      );
      expect(audioService.isRecording()).toBe(true);
    });

    it('sollte Audio-Constraints anwenden', async () => {
      const customService = new AudioCaptureService({
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: 44100,
        channelCount: 2,
      });

      await customService.startRecording();

      expect(mockGetUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: expect.objectContaining({
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            sampleRate: 44100,
            channelCount: 2,
          }),
          video: false,
        })
      );
    });

    it('sollte keine zweite Aufnahme starten wenn bereits aktiv', async () => {
      await audioService.startRecording();
      mockGetUserMedia.mockClear();
      
      await audioService.startRecording();
      
      expect(mockGetUserMedia).not.toHaveBeenCalled();
    });

    it('sollte Fehler behandeln wenn getUserMedia fehlschlägt', async () => {
      mockGetUserMedia.mockRejectedValueOnce(new Error('Permission denied'));
      
      await expect(audioService.startRecording()).rejects.toThrow('Permission denied');
      expect(audioService.isRecording()).toBe(false);
    });
  });

  describe('stopRecording', () => {
    it('sollte Audio-Datei zurückgeben', async () => {
      await audioService.startRecording();
      
      // Wait for at least one data chunk to be generated
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const result = await audioService.stopRecording();
      
      expect(result.audioFile).toBeTruthy();
      expect(result.audioFile?.name).toContain('audio.');
      expect(result.audioError).toBeNull();
      expect(audioService.isRecording()).toBe(false);
    });

    it('sollte Dauer und Größe berechnen', async () => {
      await audioService.startRecording();
      
      // Wait a bit to simulate recording time
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const result = await audioService.stopRecording();
      
      expect(result.audioDurationMs).toBeGreaterThan(0);
      expect(result.audioSizeBytes).toBeGreaterThan(0);
    });

    it('sollte Fehler zurückgeben wenn keine aktive Aufnahme', async () => {
      const result = await audioService.stopRecording();
      
      expect(result.audioFile).toBeNull();
      expect(result.audioError).toBe('No active recording');
    });
  });

  describe('cancelRecording', () => {
    it('sollte Aufnahme abbrechen und Ressourcen freigeben', async () => {
      await audioService.startRecording();
      
      audioService.cancelRecording();
      
      expect(audioService.isRecording()).toBe(false);
    });

    it('sollte sicher sein auch wenn keine Aufnahme aktiv', () => {
      expect(() => audioService.cancelRecording()).not.toThrow();
    });
  });

  describe('updateConfig', () => {
    it('sollte Konfiguration aktualisieren', () => {
      audioService.updateConfig({
        sampleRate: 48000,
        channelCount: 1,
      });
      
      expect(() => audioService.updateConfig({ sampleRate: 48000 })).not.toThrow();
    });
  });

  describe('isRecording', () => {
    it('sollte false zurückgeben wenn nicht aufgenommen wird', () => {
      expect(audioService.isRecording()).toBe(false);
    });

    it('sollte true zurückgeben während der Aufnahme', async () => {
      await audioService.startRecording();
      
      expect(audioService.isRecording()).toBe(true);
    });

    it('sollte false zurückgeben nach dem Stoppen', async () => {
      await audioService.startRecording();
      await audioService.stopRecording();
      
      expect(audioService.isRecording()).toBe(false);
    });
  });

  describe('file format detection', () => {
    it('sollte richtige Dateiendung basierend auf MIME-Type wählen', async () => {
      await audioService.startRecording();
      
      // Wait for at least one data chunk
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const result = await audioService.stopRecording();
      
      // Default is audio/webm;codecs=opus or audio/webm
      expect(result.audioFile).toBeTruthy();
      expect(result.audioFile?.name).toMatch(/\.(webm|opus)$/);
    });
  });

  describe('Amy First principles', () => {
    it('sollte auch bei Fehler nicht die Anwendung blockieren', async () => {
      mockGetUserMedia.mockRejectedValueOnce(new Error('Hardware error'));
      
      try {
        await audioService.startRecording();
      } catch {
        // Error is expected
      }
      
      // Should still be able to use the service
      expect(() => audioService.cancelRecording()).not.toThrow();
    });

    it('sollte Ressourcen aufräumen um Speicherlecks zu vermeiden', async () => {
      const stopSpy = vi.fn();
      const mockStream = {
        getTracks: () => [{
          stop: stopSpy,
        }],
      } as unknown as MediaStream;
      
      mockGetUserMedia.mockResolvedValueOnce(mockStream);
      
      await audioService.startRecording();
      audioService.cancelRecording();
      
      // Give time for async cleanup
      await new Promise(resolve => setTimeout(resolve, 20));
      
      expect(stopSpy).toHaveBeenCalled();
    });
  });
});
