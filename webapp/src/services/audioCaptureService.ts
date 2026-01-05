/**
 * Audio Capture Service
 * 
 * Amy First: This service captures Amy's verbal utterances (e.g., "Iila" for purple)
 * alongside sign language gestures to enable multimodal recognition.
 * 
 * The service records audio during gesture training sessions and bundles it
 * with the visual gesture data for comprehensive multimodal learning.
 */

import { logger } from './logger';

export interface AudioCaptureConfig {
  // Audio constraints for recording
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  sampleRate?: number;
  channelCount?: number;
}

export interface AudioRecordingResult {
  audioFile: File | null;
  audioSizeBytes: number;
  audioDurationMs: number;
  audioError: string | null;
  mimeType: string | null;
}

const DEFAULT_AUDIO_CONFIG: AudioCaptureConfig = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 48000,
  channelCount: 1, // Mono is sufficient for speech
};

/**
 * Determine best supported audio MIME type for recording
 */
function pickAudioMimeType(): string | undefined {
  if (typeof window.MediaRecorder === 'undefined' || typeof window.MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }

  // Prioritize WebM Opus (best compression for speech), then fallback to other formats
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/wav',
  ];
  
  return candidates.find((candidate) => window.MediaRecorder.isTypeSupported(candidate));
}

/**
 * Audio Capture Service
 * Handles audio recording for multimodal gesture recognition
 */
export class AudioCaptureService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioStream: MediaStream | null = null;
  private startTime: number | null = null;
  private config: AudioCaptureConfig;
  private recordingPromise: Promise<AudioRecordingResult> | null = null;
  private resolveRecording: ((result: AudioRecordingResult) => void) | null = null;

  constructor(config: AudioCaptureConfig = {}) {
    this.config = { ...DEFAULT_AUDIO_CONFIG, ...config };
  }

  /**
   * Start audio recording
   * Amy First: Captures Amy's speech without interrupting her communication flow
   */
  async startRecording(): Promise<void> {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      logger.warn('Audio recording already in progress');
      return;
    }

    try {
      // Request audio stream with configured constraints
      const audioConstraints: MediaTrackConstraints = {};
      if (this.config.echoCancellation !== undefined) {
        audioConstraints.echoCancellation = this.config.echoCancellation;
      }
      if (this.config.noiseSuppression !== undefined) {
        audioConstraints.noiseSuppression = this.config.noiseSuppression;
      }
      if (this.config.autoGainControl !== undefined) {
        audioConstraints.autoGainControl = this.config.autoGainControl;
      }
      if (this.config.sampleRate !== undefined) {
        audioConstraints.sampleRate = this.config.sampleRate;
      }
      if (this.config.channelCount !== undefined) {
        audioConstraints.channelCount = this.config.channelCount;
      }
      
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });

      const mimeType = pickAudioMimeType();
      this.mediaRecorder = mimeType
        ? new MediaRecorder(this.audioStream, { mimeType })
        : new MediaRecorder(this.audioStream);

      this.audioChunks = [];
      this.startTime = Date.now();

      // Set up recording promise
      this.recordingPromise = new Promise<AudioRecordingResult>((resolve) => {
        this.resolveRecording = resolve;
      });

      // Handle data chunks
      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      // Handle recording stop
      this.mediaRecorder.onstop = () => {
        const result = this.finalizeRecording();
        if (this.resolveRecording) {
          this.resolveRecording(result);
          this.resolveRecording = null;
        }
      };

      // Handle errors
      this.mediaRecorder.onerror = (event: Event) => {
        const error = (event as { error?: unknown }).error;
        const errorMessage = error instanceof Error ? error.message : 'Audio recording error';
        logger.error('Audio recording error:', errorMessage);
        
        const result: AudioRecordingResult = {
          audioFile: null,
          audioSizeBytes: 0,
          audioDurationMs: 0,
          audioError: errorMessage,
          mimeType: null,
        };
        
        if (this.resolveRecording) {
          this.resolveRecording(result);
          this.resolveRecording = null;
        }
      };

      // Start recording with 1 second timeslice
      this.mediaRecorder.start(1000);
      logger.info('Audio recording started');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start audio recording';
      logger.error('Failed to start audio recording:', error);
      throw new Error(errorMessage);
    }
  }

  /**
   * Stop audio recording and return the recorded audio file
   */
  async stopRecording(): Promise<AudioRecordingResult> {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') {
      logger.warn('No active audio recording to stop');
      return {
        audioFile: null,
        audioSizeBytes: 0,
        audioDurationMs: 0,
        audioError: 'No active recording',
        mimeType: null,
      };
    }

    try {
      this.mediaRecorder.stop();
      logger.info('Audio recording stopped');
      
      // Wait for the recording to be finalized
      return await (this.recordingPromise || Promise.resolve({
        audioFile: null,
        audioSizeBytes: 0,
        audioDurationMs: 0,
        audioError: 'Recording promise not initialized',
        mimeType: null,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to stop audio recording';
      logger.error('Failed to stop audio recording:', error);
      return {
        audioFile: null,
        audioSizeBytes: 0,
        audioDurationMs: 0,
        audioError: errorMessage,
        mimeType: null,
      };
    }
  }

  /**
   * Finalize the recording and create the audio file
   */
  private finalizeRecording(): AudioRecordingResult {
    const durationMs = this.startTime ? Date.now() - this.startTime : 0;
    this.startTime = null;

    // Stop and clean up audio stream
    if (this.audioStream) {
      this.audioStream.getTracks().forEach((track) => track.stop());
      this.audioStream = null;
    }

    // Create blob from chunks
    if (this.audioChunks.length === 0) {
      return {
        audioFile: null,
        audioSizeBytes: 0,
        audioDurationMs: durationMs,
        audioError: 'No audio data recorded',
        mimeType: null,
      };
    }

    const mimeType = this.mediaRecorder?.mimeType || pickAudioMimeType() || 'audio/webm';
    const blob = new Blob(this.audioChunks, { type: mimeType });
    const audioSizeBytes = blob.size;
    
    // Determine file extension from mime type
    let extension = 'webm';
    if (mimeType.includes('opus')) {
      extension = 'opus';
    } else if (mimeType.includes('ogg')) {
      extension = 'ogg';
    } else if (mimeType.includes('mp4')) {
      extension = 'm4a';
    } else if (mimeType.includes('wav')) {
      extension = 'wav';
    }

    // Use timestamp to ensure unique filenames
    const timestamp = Date.now();
    const audioFile = new File([blob], `audio_${timestamp}.${extension}`, { type: mimeType });
    
    // Clean up
    this.audioChunks = [];
    this.mediaRecorder = null;
    this.recordingPromise = null;

    logger.info(`Audio recording finalized: ${audioSizeBytes} bytes, ${durationMs}ms`);

    return {
      audioFile,
      audioSizeBytes,
      audioDurationMs: durationMs,
      audioError: null,
      mimeType,
    };
  }

  /**
   * Check if audio recording is currently active
   */
  isRecording(): boolean {
    return this.mediaRecorder !== null && this.mediaRecorder.state === 'recording';
  }

  /**
   * Cancel current recording and clean up resources
   */
  cancelRecording(): void {
    if (this.mediaRecorder) {
      if (this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop();
      }
      this.mediaRecorder = null;
    }

    if (this.audioStream) {
      this.audioStream.getTracks().forEach((track) => track.stop());
      this.audioStream = null;
    }

    this.audioChunks = [];
    this.startTime = null;
    this.recordingPromise = null;
    this.resolveRecording = null;

    logger.info('Audio recording cancelled');
  }

  /**
   * Update audio capture configuration
   */
  updateConfig(newConfig: Partial<AudioCaptureConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Audio capture config updated');
  }
}
