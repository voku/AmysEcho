/**
 * Camera management for gesture detection
 * Handles video stream initialization and cleanup
 */

import { ResourceManager } from '../utils/ResourceManager';
import { sendTelemetryEvent } from '../../telemetry/sendTelemetryEvent';

type FacingMode = 'user' | 'environment';

type CameraConstraintProfile = {
  width: number;
  height: number;
  frameRate: number;
  label: 'ideal' | 'balanced' | 'low' | 'minimal';
};

const CAMERA_CONSTRAINT_PROFILES: CameraConstraintProfile[] = [
  { width: 1280, height: 720, frameRate: 30, label: 'ideal' },
  { width: 960, height: 540, frameRate: 24, label: 'balanced' },
  { width: 640, height: 480, frameRate: 20, label: 'low' },
  { width: 426, height: 240, frameRate: 15, label: 'minimal' },
];

const PROCESSING_HISTORY_LIMIT = 60;
const ADAPTIVE_WINDOW_SIZE = 30;
const SUSTAINED_LAG_THRESHOLD_MS = 45;
const SUSTAINED_RECOVERY_THRESHOLD_MS = 28;
const ADAPTIVE_COOLDOWN_MS = 5_000;

export class CameraManager {
  private video: HTMLVideoElement;
  private resourceManager: ResourceManager;
  private lastVideoWidth = 0;
  private lastVideoHeight = 0;
  private stream: MediaStream | null = null;
  private registeredStream: MediaStream | null = null;
  private activeFacingMode: FacingMode = 'user';
  private activeConstraintTier = 0;
  private processingHistory: number[] = [];
  private lastAdaptiveUpdateAt = 0;
  private adaptingConstraints = false;
  private cameraSessionId = 0;

  constructor(video: HTMLVideoElement, resourceManager: ResourceManager) {
    this.video = video;
    this.resourceManager = resourceManager;
  }

  /**
   * Start camera stream
   */
  async startCamera(): Promise<void> {
    const sessionId = ++this.cameraSessionId;
    this.activeFacingMode = this.resolveFacingModePreference();
    this.activeConstraintTier = 0;
    this.processingHistory = [];
    this.lastAdaptiveUpdateAt = 0;
    this.adaptingConstraints = false;

    const requestClipAudio = false; // Clip capture remains visual-only
    let pendingStream: MediaStream | null = null;

    try {
      const { stream, tier } = await this.requestStreamWithFallback(
        this.activeFacingMode,
        this.activeConstraintTier,
        requestClipAudio,
      );
      pendingStream = stream;
      if (sessionId !== this.cameraSessionId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.video.srcObject = stream;

      if (requestClipAudio) {
        try {
          const audioTracks = stream.getAudioTracks();
          for (const track of audioTracks) {
            // Keep the audio track attached so MediaRecorder stays happy, but disable capture.
            track.enabled = false;
          }
        } catch (audioError) {
          console.warn('Failed to disable audio tracks for clip capture:', audioError);
        }
      }

      // Set up video properties
      this.video.muted = true;
      this.video.setAttribute('autoplay', '');
      this.video.setAttribute('playsinline', '');
      this.video.setAttribute('muted', '');

      await this.ensureVideoMetadataReady();
      await this.video.play();
      if (sessionId !== this.cameraSessionId) {
        stream.getTracks().forEach((track) => track.stop());
        if (this.video.srcObject === stream) {
          this.video.srcObject = null;
        }
        return;
      }
      this.activeConstraintTier = tier;
      this.stream = stream;
      this.replaceRegisteredStream(stream);
      pendingStream = null;

      // Update dimensions
      this.updateVideoDimensions();

      // Send telemetry
      const tracks = stream.getVideoTracks();
      void sendTelemetryEvent('camera_started', {
        tracks: tracks.map((t) => t.label),
        constraintTier: this.activeConstraintTier,
        constraintProfile: CAMERA_CONSTRAINT_PROFILES[this.activeConstraintTier]?.label ?? 'unknown',
      });
    } catch (error) {
      if (pendingStream) {
        pendingStream.getTracks().forEach((track) => track.stop());
        this.resourceManager.unregisterMediaStream(pendingStream);
        if (this.video.srcObject === pendingStream) {
          this.video.srcObject = null;
        }
      }
      // Provide specific error handling for camera access issues
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Camera access failed:', errorMessage);

      // Send specific camera error to React Native
      try {
        (window as any).ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: 'error',
            message: 'CAMERA_ERROR',
            details: {
              reason: errorMessage,
              facingMode: this.activeFacingMode,
              userAgent: navigator.userAgent,
              hasGetUserMedia: !!navigator.mediaDevices?.getUserMedia,
            },
          }),
        );
      } catch (postErr) {
        console.warn('Failed to send camera error message:', postErr);
      }

      // Re-throw to allow caller to handle
      throw error;
    }
  }

  reportProcessingTime(processingTimeMs: number): void {
    if (!Number.isFinite(processingTimeMs) || processingTimeMs <= 0 || !this.stream) {
      return;
    }

    this.processingHistory.push(processingTimeMs);
    if (this.processingHistory.length > PROCESSING_HISTORY_LIMIT) {
      this.processingHistory = this.processingHistory.slice(-PROCESSING_HISTORY_LIMIT);
    }

    if (this.processingHistory.length < ADAPTIVE_WINDOW_SIZE || this.adaptingConstraints) {
      return;
    }

    const now = Date.now();
    if (now - this.lastAdaptiveUpdateAt < ADAPTIVE_COOLDOWN_MS) {
      return;
    }

    const recentWindow = this.processingHistory.slice(-ADAPTIVE_WINDOW_SIZE);
    const averageProcessingTime = recentWindow.reduce((total, value) => total + value, 0) / recentWindow.length;
    if (
      this.activeConstraintTier < CAMERA_CONSTRAINT_PROFILES.length - 1 &&
      averageProcessingTime > SUSTAINED_LAG_THRESHOLD_MS
    ) {
      void this.degradeCameraConstraints(averageProcessingTime);
      return;
    }

    if (this.activeConstraintTier > 0 && averageProcessingTime <= SUSTAINED_RECOVERY_THRESHOLD_MS) {
      void this.upgradeCameraConstraints(averageProcessingTime);
    }
  }

  /**
   * Stop camera stream
   */
  async stopCamera(): Promise<void> {
    this.cameraSessionId += 1;
    try {
      this.video.pause();
    } catch (e) {
      console.warn('Failed to pause video during cleanup:', e);
    }

    try {
      const s = this.video.srcObject as MediaStream | null;
      if (s) {
        s.getTracks().forEach((t) => t.stop());
        this.video.srcObject = null;
      }
      if (this.stream) {
        try {
          this.stream.getTracks().forEach((t) => t.stop());
        } catch (err) {
          console.warn('Failed to stop stored stream:', err);
        }
      }
      this.stream = null;
      if (this.registeredStream) {
        this.resourceManager.unregisterMediaStream(this.registeredStream);
        this.registeredStream = null;
      }
    } catch (e) {
      console.warn('Failed to stop camera stream:', e);
    }
    this.processingHistory = [];
    this.adaptingConstraints = false;
  }

  /**
   * Update video dimensions tracking
   */
  updateVideoDimensions(): void {
    this.lastVideoWidth = this.video.videoWidth;
    this.lastVideoHeight = this.video.videoHeight;
  }

  /**
   * Check if video dimensions have changed
   */
  hasDimensionsChanged(): boolean {
    return (
      this.video.videoWidth !== this.lastVideoWidth ||
      this.video.videoHeight !== this.lastVideoHeight
    );
  }

  /**
   * Get current video dimensions
   */
  getVideoDimensions(): { width: number; height: number } {
    return {
      width: this.video.videoWidth,
      height: this.video.videoHeight
    };
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  /**
   * Check if video is ready for processing
   */
  isVideoReady(): boolean {
    return (
      this.video.currentTime > 0 &&
      !this.video.paused &&
      !this.video.ended &&
      this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    );
  }

  private resolveFacingModePreference(): FacingMode {
    try {
      const persisted = window.localStorage.getItem('cameraFacingMode');
      if (persisted === 'user' || persisted === 'environment') {
        return persisted;
      }
    } catch {
      // localStorage might be disabled
    }
    return 'user';
  }

  private getVideoConstraints(facingMode: FacingMode, tier: number): MediaTrackConstraints {
    const profileIndex = Math.min(tier, CAMERA_CONSTRAINT_PROFILES.length - 1);
    const profile = CAMERA_CONSTRAINT_PROFILES[profileIndex] ?? CAMERA_CONSTRAINT_PROFILES[0]!;
    return {
      facingMode,
      width: { ideal: profile.width },
      height: { ideal: profile.height },
      frameRate: { ideal: profile.frameRate, max: profile.frameRate },
    };
  }

  private async requestStreamWithFallback(
    facingMode: FacingMode,
    startTier: number,
    requestClipAudio: boolean,
  ): Promise<{ stream: MediaStream; tier: number }> {
    let lastError: unknown = null;

    for (let tier = startTier; tier < CAMERA_CONSTRAINT_PROFILES.length; tier += 1) {
      const constraints: MediaStreamConstraints = {
        video: this.getVideoConstraints(facingMode, tier),
        audio: requestClipAudio
          ? {
              echoCancellation: true,
              noiseSuppression: true,
            }
          : false,
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        return { stream, tier };
      } catch (error) {
        lastError = error;
        if (requestClipAudio) {
          try {
            const streamWithoutAudio = await navigator.mediaDevices.getUserMedia({
              video: this.getVideoConstraints(facingMode, tier),
              audio: false,
            });
            return { stream: streamWithoutAudio, tier };
          } catch (withoutAudioError) {
            lastError = withoutAudioError;
          }
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Keine unterstützten Kamera-Constraints verfügbar');
  }

  private async degradeCameraConstraints(averageProcessingTime: number): Promise<void> {
    const sessionId = this.cameraSessionId;
    this.adaptingConstraints = true;
    this.lastAdaptiveUpdateAt = Date.now();
    const previousTier = this.activeConstraintTier;
    const nextTier = Math.min(previousTier + 1, CAMERA_CONSTRAINT_PROFILES.length - 1);
    try {
      const { stream: nextStream, tier: acquiredTier } = await this.requestStreamWithFallback(
        this.activeFacingMode,
        nextTier,
        false,
      );
      if (sessionId !== this.cameraSessionId || !this.stream) {
        nextStream.getTracks().forEach((track) => track.stop());
        return;
      }
      const previousStream = this.stream;
      this.video.srcObject = nextStream;
      try {
        await this.ensureVideoMetadataReady();
        await this.video.play();
      } catch (playError) {
        nextStream.getTracks().forEach((track) => track.stop());
        if (this.video.srcObject === nextStream) {
          this.video.srcObject = previousStream;
        }
        throw playError;
      }
      if (sessionId !== this.cameraSessionId || !this.stream) {
        nextStream.getTracks().forEach((track) => track.stop());
        if (this.video.srcObject === nextStream) {
          this.video.srcObject = previousStream;
        }
        return;
      }
      if (previousStream) {
        previousStream.getTracks().forEach((track) => track.stop());
        this.resourceManager.unregisterMediaStream(previousStream);
      }
      this.stream = nextStream;
      this.replaceRegisteredStream(nextStream);
      this.activeConstraintTier = acquiredTier;
      this.processingHistory = [];

      void sendTelemetryEvent('camera_constraints_adapted', {
        source: 'camera_manager',
        averageProcessingTimeMs: Math.round(averageProcessingTime),
        constraintTier: this.activeConstraintTier,
        constraintProfile: CAMERA_CONSTRAINT_PROFILES[this.activeConstraintTier]?.label ?? 'unknown',
        facingMode: this.activeFacingMode,
      });
    } catch (error) {
      console.warn('Adaptive camera downgrade failed:', error);
    } finally {
      this.adaptingConstraints = false;
    }
  }

  private async upgradeCameraConstraints(averageProcessingTime: number): Promise<void> {
    const sessionId = this.cameraSessionId;
    this.adaptingConstraints = true;
    this.lastAdaptiveUpdateAt = Date.now();
    const previousTier = this.activeConstraintTier;
    const preferredTier = Math.max(0, previousTier - 1);
    try {
      const { stream: nextStream, tier: acquiredTier } = await this.requestStreamWithFallback(
        this.activeFacingMode,
        preferredTier,
        false,
      );
      if (sessionId !== this.cameraSessionId || !this.stream) {
        nextStream.getTracks().forEach((track) => track.stop());
        return;
      }
      if (acquiredTier >= previousTier) {
        nextStream.getTracks().forEach((track) => track.stop());
        return;
      }
      const previousStream = this.stream;
      this.video.srcObject = nextStream;
      try {
        await this.ensureVideoMetadataReady();
        await this.video.play();
      } catch (playError) {
        nextStream.getTracks().forEach((track) => track.stop());
        if (this.video.srcObject === nextStream) {
          this.video.srcObject = previousStream;
        }
        throw playError;
      }
      if (sessionId !== this.cameraSessionId || !this.stream) {
        nextStream.getTracks().forEach((track) => track.stop());
        if (this.video.srcObject === nextStream) {
          this.video.srcObject = previousStream;
        }
        return;
      }
      if (previousStream) {
        previousStream.getTracks().forEach((track) => track.stop());
        this.resourceManager.unregisterMediaStream(previousStream);
      }
      this.stream = nextStream;
      this.replaceRegisteredStream(nextStream);
      this.activeConstraintTier = acquiredTier;
      this.processingHistory = [];

      void sendTelemetryEvent('camera_constraints_recovered', {
        source: 'camera_manager',
        averageProcessingTimeMs: Math.round(averageProcessingTime),
        constraintTier: this.activeConstraintTier,
        constraintProfile: CAMERA_CONSTRAINT_PROFILES[this.activeConstraintTier]?.label ?? 'unknown',
        facingMode: this.activeFacingMode,
      });
    } catch (error) {
      console.warn('Adaptive camera recovery failed:', error);
    } finally {
      this.adaptingConstraints = false;
    }
  }

  private replaceRegisteredStream(stream: MediaStream): void {
    if (this.registeredStream) {
      this.resourceManager.unregisterMediaStream(this.registeredStream);
    }
    this.resourceManager.registerMediaStream(stream);
    this.registeredStream = stream;
  }

  private async ensureVideoMetadataReady(timeoutMs = 50): Promise<void> {
    if (this.video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      return;
    }

    await new Promise<void>((resolve) => {
      let settled = false;
      let timeoutId = 0;
      const cleanup = () => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timeoutId);
        this.video.removeEventListener('loadedmetadata', onLoadedMetadata);
        this.video.removeEventListener('canplay', onCanPlay);
      };
      const onLoadedMetadata = () => {
        cleanup();
        resolve();
      };
      const onCanPlay = () => {
        cleanup();
        resolve();
      };

      this.video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
      this.video.addEventListener('canplay', onCanPlay, { once: true });

      timeoutId = window.setTimeout(() => {
        cleanup();
        resolve();
      }, timeoutMs);
    });
  }
}
