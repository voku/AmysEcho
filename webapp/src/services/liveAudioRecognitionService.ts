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

      // Connect audio stream to MFCC extractor
      // This uses the extractor's own AudioContext to avoid creating duplicates
      this.audioSource = this.mfccExtractor.connectMediaStream(this.audioStream);

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

      // Check if audio has actual content with improved quality validation
      // 1. Check for non-zero values
      const hasNonZero = result.mfcc.some(v => Math.abs(v) > 0.001);
      
      // 2. Calculate RMS energy (root mean square)
      const rms = Math.sqrt(
        result.mfcc.reduce((sum, v) => sum + v * v, 0) / result.mfcc.length
      );
      const minEnergyThreshold = 0.01;
      const hasEnergy = rms > minEnergyThreshold;
      
      // 3. Check variance (speech has pattern, noise is uniform)
      const mean = result.mfcc.reduce((sum, v) => sum + v, 0) / result.mfcc.length;
      const variance = result.mfcc.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / result.mfcc.length;
      const minVarianceThreshold = 0.001;
      const hasPattern = variance > minVarianceThreshold;
      
      // Audio is valid if it has non-zero values, sufficient energy, AND pattern
      const hasAudio = hasNonZero && hasEnergy && hasPattern;

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

    // The MFCC extractor manages its own AudioContext
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
