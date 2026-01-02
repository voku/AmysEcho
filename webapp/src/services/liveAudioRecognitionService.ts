/**
 * Live Audio Recognition Service
 * Captures audio and extracts MFCC features in real-time during gesture recognition
 * 
 * This service runs alongside visual landmark detection to enable multimodal recognition.
 * It provides the same 13 MFCC coefficients used during training, ensuring consistency.
 */

import { MFCCExtractor, createMFCCExtractor } from './mfccExtractor';

export interface LiveAudioFeatures {
  mfcc: Float32Array; // 13 coefficients (time-averaged)
  timestamp: number;
  hasAudio: boolean;
}

export interface LiveAudioConfig {
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  sampleRate?: number;
}

export class LiveAudioRecognitionService {
  private audioStream: MediaStream | null = null;
  private mfccExtractor: MFCCExtractor | null = null;
  private audioSource: MediaStreamAudioSourceNode | null = null;
  private isActive = false;
  private audioContext: AudioContext | null = null;

  /**
   * Start capturing audio and extracting features
   */
  async start(config: LiveAudioConfig = {}): Promise<boolean> {
    try {
      if (this.isActive) {
        console.warn('Live audio recognition already active');
        return true;
      }

      // Request microphone access with configuration
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: config.echoCancellation ?? true,
          noiseSuppression: config.noiseSuppression ?? true,
          autoGainControl: config.autoGainControl ?? true,
          sampleRate: config.sampleRate ?? 16000,
        },
        video: false,
      };

      try {
        this.audioStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error) {
        // Microphone not available - graceful degradation
        console.info('Microphone not available for live audio recognition:', error);
        return false;
      }

      // Initialize MFCC extractor
      this.mfccExtractor = await createMFCCExtractor();
      if (!this.mfccExtractor) {
        console.error('Failed to initialize MFCC extractor');
        this.stop();
        return false;
      }

      // Create audio context and connect stream
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: config.sampleRate ?? 16000
      });

      this.audioSource = this.audioContext.createMediaStreamSource(this.audioStream);
      this.mfccExtractor.connectSource(this.audioSource);

      this.isActive = true;
      console.log('Live audio recognition started');
      return true;
    } catch (error) {
      console.error('Failed to start live audio recognition:', error);
      this.stop();
      return false;
    }
  }

  /**
   * Extract current audio features
   * Call this in sync with visual landmark extraction
   */
  extractFeatures(): LiveAudioFeatures {
    const timestamp = Date.now();

    if (!this.isActive || !this.mfccExtractor) {
      // Return zero-padded features when audio not available
      return {
        mfcc: new Float32Array(13), // 13 zeros
        timestamp,
        hasAudio: false,
      };
    }

    try {
      const result = this.mfccExtractor.extractMFCC();
      
      if (!result.success) {
        console.warn('MFCC extraction failed:', result.error);
        return {
          mfcc: new Float32Array(13),
          timestamp,
          hasAudio: false,
        };
      }

      // Check if audio has actual content (not all zeros)
      const hasAudio = result.mfcc.some(v => Math.abs(v) > 0.001);

      return {
        mfcc: result.mfcc,
        timestamp,
        hasAudio,
      };
    } catch (error) {
      console.error('Error extracting audio features:', error);
      return {
        mfcc: new Float32Array(13),
        timestamp,
        hasAudio: false,
      };
    }
  }

  /**
   * Stop capturing audio and clean up resources
   */
  stop(): void {
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }

    if (this.audioSource) {
      try {
        this.audioSource.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      this.audioSource = null;
    }

    if (this.audioContext) {
      if (this.audioContext.state !== 'closed') {
        this.audioContext.close().catch(console.error);
      }
      this.audioContext = null;
    }

    if (this.mfccExtractor) {
      this.mfccExtractor.dispose();
      this.mfccExtractor = null;
    }

    this.isActive = false;
    console.log('Live audio recognition stopped');
  }

  /**
   * Check if audio recognition is currently active
   */
  isRunning(): boolean {
    return this.isActive;
  }
}

/**
 * Create and start a new live audio recognition service
 */
export async function createLiveAudioRecognition(config?: LiveAudioConfig): Promise<LiveAudioRecognitionService> {
  const service = new LiveAudioRecognitionService();
  await service.start(config);
  return service;
}
