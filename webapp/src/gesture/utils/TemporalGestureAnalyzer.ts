/**
 * Temporal Gesture Analyzer - Amy First
 *
 * Scientific optimization strategies for gesture recognition based on:
 * - Velocity and acceleration feature extraction for dynamic gesture detection
 * - Sliding window temporal analysis for sequence-based recognition
 * - Confidence smoothing with exponential moving average (EMA)
 * - Adaptive processing based on hand movement velocity
 *
 * References:
 * - "On-device Real-time Hand Gesture Recognition" (arXiv:2111.00038)
 * - "MediaPipe with LSTM Architecture for Real-Time Hand Gesture Recognition" (Springer 2023)
 * - "Dynamic Hand Gesture Recognition Using Effective Feature Extraction" (ResearchGate)
 */

import { CircularBuffer, MemoryOptimizer } from './MemoryOptimizer';

export interface VelocityFeatures {
  /** Average velocity magnitude across all landmarks */
  averageVelocity: number;
  /** Peak velocity (max among landmarks) */
  peakVelocity: number;
  /** Palm center velocity */
  palmVelocity: number;
  /** Fingertip velocity average */
  fingertipVelocity: number;
  /** Direction of palm movement in radians */
  movementDirection: number;
  /** Acceleration (change in velocity) */
  acceleration: number;
  /** Whether movement is detected */
  isMoving: boolean;
}

export interface TemporalGestureFrame {
  landmarks: number[][];
  timestamp: number;
  velocityFeatures?: VelocityFeatures;
  gesture?: string;
  confidence?: number;
}

export interface GestureSequenceResult {
  gesture: string;
  confidence: number;
  isSequential: boolean;
  sequenceProgress: number;
  temporalConfidence: number;
}

// Landmark indices for MediaPipe hand model
const _WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_TIP = 12;
const RING_TIP = 16;
const PINKY_TIP = 20;
const FINGERTIPS = [THUMB_TIP, INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP];
const PALM_CENTER_INDICES = [0, 5, 9, 13, 17]; // Wrist + MCP joints

export class TemporalGestureAnalyzer {
  private frameBuffer: CircularBuffer<TemporalGestureFrame>;
  private confidenceHistory: CircularBuffer<{ gesture: string; confidence: number }>;
  private lastVelocityFeatures: VelocityFeatures | null = null;
  private memoryOptimizer: MemoryOptimizer;

  // Configuration based on scientific recommendations
  private readonly FRAME_BUFFER_SIZE = 30; // 30 frames for ~1 second at 30fps
  private readonly CONFIDENCE_HISTORY_SIZE = 10;
  private readonly VELOCITY_THRESHOLD = 0.005; // Minimum velocity to consider movement
  private readonly STATIC_THRESHOLD = 0.002; // Below this, hand is considered static
  private readonly EMA_ALPHA = 0.3; // Exponential moving average smoothing factor
  private readonly SEQUENCE_MATCH_THRESHOLD = 0.7;

  // Dynamic gesture patterns (velocity profiles)
  private readonly GESTURE_VELOCITY_PROFILES: Record<string, {
    minVelocity: number;
    maxVelocity: number;
    direction?: 'horizontal' | 'vertical' | 'any';
    duration: number; // in frames
  }> = {
    wave: { minVelocity: 0.01, maxVelocity: 0.1, direction: 'horizontal', duration: 15 },
    swipe_left: { minVelocity: 0.02, maxVelocity: 0.15, direction: 'horizontal', duration: 10 },
    swipe_right: { minVelocity: 0.02, maxVelocity: 0.15, direction: 'horizontal', duration: 10 },
    swipe_up: { minVelocity: 0.02, maxVelocity: 0.15, direction: 'vertical', duration: 10 },
    swipe_down: { minVelocity: 0.02, maxVelocity: 0.15, direction: 'vertical', duration: 10 },
  };

  constructor() {
    this.memoryOptimizer = MemoryOptimizer.getInstance();
    const optimizedBufferSize = this.memoryOptimizer.getOptimizedHistorySize(this.FRAME_BUFFER_SIZE);
    this.frameBuffer = new CircularBuffer<TemporalGestureFrame>(optimizedBufferSize);
    this.confidenceHistory = new CircularBuffer<{ gesture: string; confidence: number }>(
      this.CONFIDENCE_HISTORY_SIZE
    );

    // Register for memory cleanup
    this.memoryOptimizer.registerCleanupCallback('temporalGestureAnalyzer', () => this.cleanup());
  }

  /**
   * Add a frame to the temporal buffer and compute velocity features
   */
  addFrame(landmarks: number[][], timestamp: number, gesture?: string, confidence?: number): VelocityFeatures {
    const velocityFeatures = this.computeVelocityFeatures(landmarks, timestamp);

    const frame: TemporalGestureFrame = {
      landmarks,
      timestamp,
      velocityFeatures,
      gesture,
      confidence,
    };

    this.frameBuffer.push(frame);

    if (gesture && confidence !== undefined) {
      this.confidenceHistory.push({ gesture, confidence });
    }

    this.lastVelocityFeatures = velocityFeatures;
    return velocityFeatures;
  }

  /**
   * Compute velocity and acceleration features from landmark positions
   * Based on: "Dynamic Hand Gesture Recognition Using Effective Feature Extraction"
   */
  private computeVelocityFeatures(landmarks: number[][], timestamp: number): VelocityFeatures {
    const previousFrame = this.frameBuffer.get(0);

    if (!previousFrame || !previousFrame.landmarks || landmarks.length === 0) {
      return this.createEmptyVelocityFeatures();
    }

    const deltaTime = Math.max(0.001, (timestamp - previousFrame.timestamp) / 1000); // in seconds
    const previousLandmarks = previousFrame.landmarks;

    // Compute palm center velocity
    const palmVelocity = this.computePalmCenterVelocity(landmarks, previousLandmarks, deltaTime);

    // Compute fingertip velocities
    const fingertipVelocities = this.computeFingertipVelocities(landmarks, previousLandmarks, deltaTime);
    const fingertipVelocity = fingertipVelocities.reduce((sum, v) => sum + v, 0) / fingertipVelocities.length;

    // Compute average velocity across all landmarks
    let totalVelocity = 0;
    let peakVelocity = 0;
    let validPoints = 0;

    for (let i = 0; i < Math.min(landmarks.length, previousLandmarks.length); i++) {
      const curr = landmarks[i];
      const prev = previousLandmarks[i];

      if (!curr || !prev || curr.length < 2 || prev.length < 2) continue;

      const dx = (curr[0] ?? 0) - (prev[0] ?? 0);
      const dy = (curr[1] ?? 0) - (prev[1] ?? 0);
      const velocity = Math.sqrt(dx * dx + dy * dy) / deltaTime;

      totalVelocity += velocity;
      peakVelocity = Math.max(peakVelocity, velocity);
      validPoints++;
    }

    const averageVelocity = validPoints > 0 ? totalVelocity / validPoints : 0;

    // Compute movement direction based on palm movement
    const movementDirection = this.computeMovementDirection(landmarks, previousLandmarks);

    // Compute acceleration (change in velocity)
    const previousVelocity = this.lastVelocityFeatures?.averageVelocity ?? 0;
    const acceleration = (averageVelocity - previousVelocity) / deltaTime;

    const isMoving = averageVelocity > this.VELOCITY_THRESHOLD;

    return {
      averageVelocity,
      peakVelocity,
      palmVelocity,
      fingertipVelocity,
      movementDirection,
      acceleration,
      isMoving,
    };
  }

  /**
   * Compute palm center velocity
   */
  private computePalmCenterVelocity(
    landmarks: number[][],
    previousLandmarks: number[][],
    deltaTime: number
  ): number {
    const currentCenter = this.computePalmCenter(landmarks);
    const previousCenter = this.computePalmCenter(previousLandmarks);

    if (!currentCenter || !previousCenter) return 0;

    const dx = currentCenter[0] - previousCenter[0];
    const dy = currentCenter[1] - previousCenter[1];

    return Math.sqrt(dx * dx + dy * dy) / deltaTime;
  }

  /**
   * Compute palm center as average of palm-related landmarks
   */
  private computePalmCenter(landmarks: number[][]): [number, number] | null {
    let sumX = 0;
    let sumY = 0;
    let count = 0;

    for (const idx of PALM_CENTER_INDICES) {
      const point = landmarks[idx];
      if (point && point[0] !== undefined && point[1] !== undefined) {
        sumX += point[0];
        sumY += point[1];
        count++;
      }
    }

    if (count === 0) return null;
    return [sumX / count, sumY / count];
  }

  /**
   * Compute velocities of all fingertips
   */
  private computeFingertipVelocities(
    landmarks: number[][],
    previousLandmarks: number[][],
    deltaTime: number
  ): number[] {
    const velocities: number[] = [];

    for (const tipIdx of FINGERTIPS) {
      const curr = landmarks[tipIdx];
      const prev = previousLandmarks[tipIdx];

      if (!curr || !prev || curr.length < 2 || prev.length < 2) {
        velocities.push(0);
        continue;
      }

      const dx = (curr[0] ?? 0) - (prev[0] ?? 0);
      const dy = (curr[1] ?? 0) - (prev[1] ?? 0);
      velocities.push(Math.sqrt(dx * dx + dy * dy) / deltaTime);
    }

    return velocities;
  }

  /**
   * Compute movement direction in radians
   */
  private computeMovementDirection(landmarks: number[][], previousLandmarks: number[][]): number {
    const currentCenter = this.computePalmCenter(landmarks);
    const previousCenter = this.computePalmCenter(previousLandmarks);

    if (!currentCenter || !previousCenter) return 0;

    const dx = currentCenter[0] - previousCenter[0];
    const dy = currentCenter[1] - previousCenter[1];

    return Math.atan2(dy, dx);
  }

  /**
   * Create empty velocity features for initial frame
   */
  private createEmptyVelocityFeatures(): VelocityFeatures {
    return {
      averageVelocity: 0,
      peakVelocity: 0,
      palmVelocity: 0,
      fingertipVelocity: 0,
      movementDirection: 0,
      acceleration: 0,
      isMoving: false,
    };
  }

  /**
   * Detect dynamic gestures based on velocity patterns
   * Based on: "On-device Real-time Hand Gesture Recognition"
   */
  detectDynamicGesture(): GestureSequenceResult | null {
    const frames = this.frameBuffer.toArray();
    if (frames.length < 5) return null;

    // Check each gesture pattern
    for (const [gestureName, profile] of Object.entries(this.GESTURE_VELOCITY_PROFILES)) {
      const match = this.matchVelocityProfile(frames, profile);
      if (match.confidence > this.SEQUENCE_MATCH_THRESHOLD) {
        return {
          gesture: gestureName,
          confidence: match.confidence,
          isSequential: true,
          sequenceProgress: match.progress,
          temporalConfidence: this.computeTemporalConfidence(gestureName),
        };
      }
    }

    return null;
  }

  /**
   * Match a velocity profile against recent frames
   */
  private matchVelocityProfile(
    frames: TemporalGestureFrame[],
    profile: { minVelocity: number; maxVelocity: number; direction?: string; duration: number }
  ): { confidence: number; progress: number } {
    const recentFrames = frames.slice(0, profile.duration);
    if (recentFrames.length < Math.min(5, profile.duration)) {
      return { confidence: 0, progress: 0 };
    }

    let matchingFrames = 0;
    let totalVelocityMatch = 0;
    let directionMatch = 0;

    for (const frame of recentFrames) {
      if (!frame.velocityFeatures) continue;

      const velocity = frame.velocityFeatures.palmVelocity;
      const inRange = velocity >= profile.minVelocity && velocity <= profile.maxVelocity;

      if (inRange) {
        matchingFrames++;
        // Compute how well velocity matches expected range
        const midpoint = (profile.minVelocity + profile.maxVelocity) / 2;
        const deviation = Math.abs(velocity - midpoint) / (profile.maxVelocity - profile.minVelocity);
        totalVelocityMatch += 1 - deviation;
      }

      // Check direction match
      if (profile.direction) {
        const direction = frame.velocityFeatures.movementDirection;
        const isHorizontal = Math.abs(Math.cos(direction)) > 0.7;
        const isVertical = Math.abs(Math.sin(direction)) > 0.7;

        if (
          (profile.direction === 'horizontal' && isHorizontal) ||
          (profile.direction === 'vertical' && isVertical) ||
          profile.direction === 'any'
        ) {
          directionMatch++;
        }
      }
    }

    const velocityConfidence = matchingFrames > 0 ? totalVelocityMatch / matchingFrames : 0;
    const directionConfidence = profile.direction
      ? directionMatch / recentFrames.length
      : 1;
    const progress = matchingFrames / profile.duration;

    const confidence = (velocityConfidence * 0.6 + directionConfidence * 0.4) * Math.min(1, progress);

    return { confidence, progress };
  }

  /**
   * Compute temporally smoothed confidence using EMA
   * Based on: Confidence scoring with weighted average filtering
   */
  computeTemporalConfidence(gesture: string): number {
    const history = this.confidenceHistory.toArray();
    if (history.length === 0) return 0;

    let emaConfidence = 0;
    let weight = 1;
    let totalWeight = 0;

    for (const entry of history) {
      if (entry.gesture === gesture) {
        emaConfidence += entry.confidence * weight;
        totalWeight += weight;
      }
      weight *= (1 - this.EMA_ALPHA);
    }

    return totalWeight > 0 ? emaConfidence / totalWeight : 0;
  }

  /**
   * Smooth gesture confidence over time
   * Reduces jitter in predictions
   */
  smoothConfidence(currentGesture: string, currentConfidence: number): number {
    const temporalConfidence = this.computeTemporalConfidence(currentGesture);

    if (temporalConfidence === 0) {
      return currentConfidence;
    }

    // Blend current confidence with temporal confidence
    return currentConfidence * this.EMA_ALPHA + temporalConfidence * (1 - this.EMA_ALPHA);
  }

  /**
   * Determine if expensive processing should be skipped based on movement
   * Adaptive processing optimization from scientific literature
   */
  shouldSkipProcessing(): boolean {
    if (!this.lastVelocityFeatures) return false;

    // If hand is completely static, we can skip some processing
    return this.lastVelocityFeatures.averageVelocity < this.STATIC_THRESHOLD;
  }

  /**
   * Get recommended processing intensity based on movement
   * Returns a value from 0 to 1 indicating how much processing is needed
   */
  getProcessingIntensity(): number {
    if (!this.lastVelocityFeatures) return 1;

    const velocity = this.lastVelocityFeatures.averageVelocity;

    if (velocity < this.STATIC_THRESHOLD) {
      return 0.3; // Minimal processing for static hand
    } else if (velocity < this.VELOCITY_THRESHOLD) {
      return 0.6; // Moderate processing for slow movement
    } else {
      return 1.0; // Full processing for active movement
    }
  }

  /**
   * Get the last computed velocity features
   */
  getLastVelocityFeatures(): VelocityFeatures | null {
    return this.lastVelocityFeatures;
  }

  /**
   * Check if hand is currently moving
   */
  isHandMoving(): boolean {
    return this.lastVelocityFeatures?.isMoving ?? false;
  }

  /**
   * Get current frame buffer size
   */
  getBufferSize(): number {
    return this.frameBuffer.getSize();
  }

  /**
   * Get statistics about the temporal analysis
   */
  getStats(): {
    bufferSize: number;
    averageVelocity: number;
    isMoving: boolean;
    processingIntensity: number;
  } {
    return {
      bufferSize: this.frameBuffer.getSize(),
      averageVelocity: this.lastVelocityFeatures?.averageVelocity ?? 0,
      isMoving: this.isHandMoving(),
      processingIntensity: this.getProcessingIntensity(),
    };
  }

  /**
   * Clear all buffers
   */
  clear(): void {
    this.frameBuffer.clear();
    this.confidenceHistory.clear();
    this.lastVelocityFeatures = null;
  }

  /**
   * Cleanup for memory optimization
   */
  private cleanup(): void {
    // Reduce buffer sizes under memory pressure
    const newBufferSize = this.memoryOptimizer.getOptimizedHistorySize(this.FRAME_BUFFER_SIZE);
    this.frameBuffer.resize(newBufferSize);

    const newConfidenceSize = this.memoryOptimizer.getOptimizedHistorySize(this.CONFIDENCE_HISTORY_SIZE);
    this.confidenceHistory.resize(newConfidenceSize);
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.memoryOptimizer.unregisterCleanupCallback('temporalGestureAnalyzer');
    this.clear();
  }
}
