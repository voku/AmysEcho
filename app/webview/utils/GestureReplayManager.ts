/**
 * Gesture Replay Manager - Amy First
 * Records and replays successful gestures in slow motion for learning
 */

export interface GestureRecording {
  gesture: string;
  confidence: number;
  timestamp: number;
  duration: number; // milliseconds
  landmarkSequence: number[][][]; // [frame][landmark][x,y,z]
  handedness: string[];
  metadata: {
    success: boolean;
    feedback?: string;
    context?: any;
  };
}

interface InProgressRecording {
  gesture: string;
  confidence: number;
  timestamp: number;
  landmarkSequence: number[][][];
  handedness: string[];
  metadata: GestureRecording['metadata'];
}

export interface ReplayOptions {
  speed: number; // 0.25 = quarter speed, 1.0 = normal speed, 2.0 = double speed
  loop: boolean;
  showLandmarks: boolean;
  showSkeleton: boolean;
  highlightKeyPoints: boolean;
}

export interface ReplaySession {
  recording: GestureRecording;
  options: ReplayOptions;
  currentFrame: number;
  isPlaying: boolean;
  startTime: number;
}

export class GestureReplayManager {
  private recordings: GestureRecording[] = [];
  private readonly MAX_RECORDINGS = 20; // Keep last 20 successful gestures
  private currentRecording: InProgressRecording | null = null;
  private recordingStartTime = 0;
  private readonly RECORDING_DURATION = 2000; // Record 2 seconds of gesture data

  private activeReplay: ReplaySession | null = null;
  private replayInterval: number | null = null;

  /**
   * Start recording a gesture sequence
   */
  startRecording(gesture: string, initialConfidence: number): void {
    this.currentRecording = {
      gesture,
      confidence: initialConfidence,
      timestamp: Date.now(),
      landmarkSequence: [],
      handedness: [],
      metadata: {
        success: false
      }
    };
    this.recordingStartTime = Date.now();
  }

  /**
   * Add a frame to the current recording
   */
  addFrame(landmarks: number[][][], handedness: string[], confidence: number): void {
    if (!this.currentRecording) {
      return;
    }

    const elapsed = Date.now() - this.recordingStartTime;
    if (elapsed > this.RECORDING_DURATION) {
      this.stopRecording(true, confidence);
      return;
    }

    // Convert landmarks to serializable format
    const frameLandmarks: number[][] = landmarks.flatMap((hand: number[][]) =>
      hand.map((lm: number[]) => [lm[0], lm[1], lm[2] ?? 0]),
    );

    this.currentRecording.landmarkSequence.push(frameLandmarks);
    this.currentRecording.handedness = handedness;
    this.currentRecording.confidence = Math.max(this.currentRecording.confidence, confidence);
  }

  /**
   * Stop recording and save if successful
   */
  stopRecording(success: boolean, finalConfidence: number): GestureRecording | null {
    if (!this.currentRecording) {
      return null;
    }

    const base = this.currentRecording;
    const recording: GestureRecording = {
      gesture: base.gesture,
      confidence: finalConfidence,
      timestamp: base.timestamp,
      duration: Date.now() - this.recordingStartTime,
      landmarkSequence: base.landmarkSequence.map(frame => frame.map(point => [...point])),
      handedness: [...base.handedness],
      metadata: {
        ...base.metadata,
        success
      }
    };

    this.currentRecording = null;
    this.recordingStartTime = 0;

    if (success && recording.landmarkSequence.length >= 5) { // At least 5 frames
      this.saveRecording(recording);
      return recording;
    }

    return null;
  }

  /**
   * Save a successful recording
   */
  private saveRecording(recording: GestureRecording): void {
    this.recordings.push(recording);

    // Maintain max recordings limit
    if (this.recordings.length > this.MAX_RECORDINGS) {
      this.recordings.shift();
    }

    // Send recording to React Native for persistent storage
    this.sendRecordingToReactNative(recording);
  }

  /**
   * Start replay of a gesture
   */
  startReplay(recordingId: string, options: Partial<ReplayOptions> = {}): boolean {
    const recording = this.recordings.find(r => r.timestamp.toString() === recordingId);
    if (!recording) {
      return false;
    }

    const defaultOptions: ReplayOptions = {
      speed: 0.5, // Half speed for learning
      loop: false,
      showLandmarks: true,
      showSkeleton: true,
      highlightKeyPoints: true
    };

    this.activeReplay = {
      recording,
      options: { ...defaultOptions, ...options },
      currentFrame: 0,
      isPlaying: true,
      startTime: Date.now()
    };

    this.startReplayLoop();
    return true;
  }

  /**
   * Stop current replay
   */
  stopReplay(): void {
    if (this.replayInterval) {
      clearInterval(this.replayInterval);
      this.replayInterval = null;
    }
    this.activeReplay = null;
  }

  /**
   * Pause/resume replay
   */
  pauseReplay(): void {
    if (this.activeReplay) {
      this.activeReplay.isPlaying = !this.activeReplay.isPlaying;
    }
  }

  /**
   * Get current replay frame
   */
  getCurrentReplayFrame(): { frame: number[][]; progress: number; isComplete: boolean } | null {
    if (!this.activeReplay) {
      return null;
    }

    const { recording, currentFrame, options } = this.activeReplay;
    const progress = currentFrame / recording.landmarkSequence.length;

    return {
      frame: recording.landmarkSequence[currentFrame] ?? [],
      progress,
      isComplete: currentFrame >= recording.landmarkSequence.length - 1
    };
  }

  /**
   * Get available recordings for replay
   */
  getAvailableRecordings(): Array<{
    id: string;
    gesture: string;
    confidence: number;
    timestamp: number;
    duration: number;
    frameCount: number;
  }> {
    return this.recordings.map(r => ({
      id: r.timestamp.toString(),
      gesture: r.gesture,
      confidence: r.confidence,
      timestamp: r.timestamp,
      duration: r.duration,
      frameCount: r.landmarkSequence.length
    }));
  }

  /**
   * Get recording by ID
   */
  getRecording(recordingId: string): GestureRecording | null {
    return this.recordings.find(r => r.timestamp.toString() === recordingId) || null;
  }

  /**
   * Delete a recording
   */
  deleteRecording(recordingId: string): boolean {
    const index = this.recordings.findIndex(r => r.timestamp.toString() === recordingId);
    if (index >= 0) {
      this.recordings.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Export recording data for external analysis
   */
  exportRecordingData(recordingId: string): any {
    const recording = this.getRecording(recordingId);
    if (!recording) {
      return null;
    }

    return {
      gesture: recording.gesture,
      confidence: recording.confidence,
      duration: recording.duration,
      frameCount: recording.landmarkSequence.length,
      averageLandmarksPerFrame: recording.landmarkSequence.reduce(
        (sum, frame) => sum + frame.length, 0
      ) / recording.landmarkSequence.length,
      handedness: recording.handedness,
      metadata: recording.metadata
    };
  }

  /**
   * Get replay statistics
   */
  getReplayStats(): {
    totalRecordings: number;
    mostRecordedGesture: string;
    averageConfidence: number;
    recentActivity: number; // Recordings in last hour
  } {
    if (this.recordings.length === 0) {
      return {
        totalRecordings: 0,
        mostRecordedGesture: 'none',
        averageConfidence: 0,
        recentActivity: 0
      };
    }

    const gestureCounts: Record<string, number> = {};
    let totalConfidence = 0;
    let recentCount = 0;
    const oneHourAgo = Date.now() - 3600000;

    for (const recording of this.recordings) {
      gestureCounts[recording.gesture] = (gestureCounts[recording.gesture] || 0) + 1;
      totalConfidence += recording.confidence;

      if (recording.timestamp > oneHourAgo) {
        recentCount++;
      }
    }

    const mostRecordedGesture = Object.entries(gestureCounts)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'none';

    return {
      totalRecordings: this.recordings.length,
      mostRecordedGesture,
      averageConfidence: totalConfidence / this.recordings.length,
      recentActivity: recentCount
    };
  }

  /**
   * Start the replay loop
   */
  private startReplayLoop(): void {
    if (!this.activeReplay) {
      return;
    }

    const frameInterval = 1000 / 30 / this.activeReplay.options.speed; // 30 FPS adjusted for speed

    this.replayInterval = window.setInterval(() => {
      if (!this.activeReplay || !this.activeReplay.isPlaying) {
        return;
      }

      const { recording, currentFrame } = this.activeReplay;

      if (currentFrame >= recording.landmarkSequence.length - 1) {
        if (this.activeReplay.options.loop) {
          this.activeReplay.currentFrame = 0;
          this.activeReplay.startTime = Date.now();
        } else {
          this.stopReplay();
          this.sendReplayCompleteToReactNative();
        }
        return;
      }

      this.activeReplay.currentFrame++;

      // Send current frame to React Native
      this.sendReplayFrameToReactNative();
    }, frameInterval);
  }

  /**
   * Send recording to React Native for storage
   */
  private sendRecordingToReactNative(recording: GestureRecording): void {
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: 'gesture_recording_saved',
          recording: {
            id: recording.timestamp.toString(),
            gesture: recording.gesture,
            confidence: recording.confidence,
            duration: recording.duration,
            frameCount: recording.landmarkSequence.length
          },
          timestamp: Date.now()
        })
      );
    } catch (error) {
      console.warn('Failed to send gesture recording:', error);
    }
  }

  /**
   * Send replay frame to React Native
   */
  private sendReplayFrameToReactNative(): void {
    const frameData = this.getCurrentReplayFrame();
    if (!frameData || !this.activeReplay) {
      return;
    }

    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: 'gesture_replay_frame',
          frame: frameData.frame,
          progress: frameData.progress,
          gesture: this.activeReplay.recording.gesture,
          speed: this.activeReplay.options.speed,
          timestamp: Date.now()
        })
      );
    } catch (error) {
      console.warn('Failed to send replay frame:', error);
    }
  }

  /**
   * Send replay completion to React Native
   */
  private sendReplayCompleteToReactNative(): void {
    if (!this.activeReplay) {
      return;
    }

    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: 'gesture_replay_complete',
          gesture: this.activeReplay.recording.gesture,
          duration: Date.now() - this.activeReplay.startTime,
          timestamp: Date.now()
        })
      );
    } catch (error) {
      console.warn('Failed to send replay complete:', error);
    }
  }

  /**
   * Reset manager state
   */
  reset(): void {
    this.stopReplay();
    this.recordings = [];
    this.currentRecording = null;
    this.recordingStartTime = 0;
  }

  /**
   * Import recordings from React Native
   */
  importRecordings(recordings: GestureRecording[]): void {
    this.recordings = recordings.slice(-this.MAX_RECORDINGS);
  }
}