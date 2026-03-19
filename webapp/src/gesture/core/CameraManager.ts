/**
 * Camera management for gesture detection
 * Handles video stream initialization and cleanup
 */

import { ResourceManager } from '../utils/ResourceManager';
import { sendTelemetryEvent } from '../../telemetry/sendTelemetryEvent';

export class CameraManager {
  private video: HTMLVideoElement;
  private resourceManager: ResourceManager;
  private lastVideoWidth = 0;
  private lastVideoHeight = 0;
  private stream: MediaStream | null = null;

  constructor(video: HTMLVideoElement, resourceManager: ResourceManager) {
    this.video = video;
    this.resourceManager = resourceManager;
  }

  /**
   * Start camera stream
   */
  async startCamera(): Promise<void> {
    // Check localStorage for facing mode, default to 'user'
    let facingMode: 'user' | 'environment' = 'user';
    try {
      const persisted = window.localStorage.getItem('cameraFacingMode');
      if (persisted === 'user' || persisted === 'environment') {
        facingMode = persisted;
      }
    } catch {
      // localStorage might be disabled
    }
    
    const requestClipAudio = false; // Clip capture remains visual-only

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: requestClipAudio
            ? {
                echoCancellation: true,
                noiseSuppression: true,
              }
            : false,
        });
      } catch (mediaError) {
        if (requestClipAudio) {
          console.warn('getUserMedia with audio failed, retrying without audio:', mediaError);
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          });
        } else {
          throw mediaError;
        }
      }

      this.stream = stream;
      this.video.srcObject = stream;
      this.resourceManager.registerMediaStream(stream);

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

      await this.video.play();

      // Update dimensions
      this.updateVideoDimensions();

      // Send telemetry
      const tracks = stream.getVideoTracks();
      void sendTelemetryEvent('camera_started', {
        tracks: tracks.map((t) => t.label),
      });
    } catch (error) {
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
              facingMode,
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

  /**
   * Stop camera stream
   */
  async stopCamera(): Promise<void> {
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
    } catch (e) {
      console.warn('Failed to stop camera stream:', e);
    }
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
}
