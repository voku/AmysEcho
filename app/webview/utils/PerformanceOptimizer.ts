/**
 * Performance optimization utilities for gesture recognition
 * Implements intelligent frame skipping and processing optimization
 */

export class PerformanceOptimizer {
  private frameCount = 0;
  private lastProcessingTime = 0;
  private processingTimes: number[] = [];
  private readonly MAX_PROCESSING_HISTORY = 10;
  private targetFrameRate = 30; // Target FPS
  private adaptiveFrameSkipping = false;

  // Frame skipping configuration
  private skipFrameCount = 0;
  private readonly MAX_SKIP_FRAMES = 3; // Maximum consecutive frames to skip
  private readonly PROCESSING_TIME_THRESHOLD = 50; // ms - if processing takes longer, consider skipping

  // Landmark change tracking for overlay optimization
  private lastLandmarksSignature = '';
  private landmarkChangeThreshold = 0.01; // Minimum change to trigger redraw

  /**
   * Determine if current frame should be processed
   */
  shouldProcessFrame(): boolean {
    this.frameCount++;

    // Always process first few frames to establish baseline
    if (this.frameCount <= 5) {
      return true;
    }

    // If adaptive frame skipping is enabled and we're behind schedule
    if (this.adaptiveFrameSkipping && this.shouldSkipFrame()) {
      this.skipFrameCount++;
      return false;
    }

    this.skipFrameCount = 0;
    return true;
  }

  /**
   * Check if we should skip the current frame (public for testing)
   */
  public shouldSkipCurrentFrame(): boolean {
    return this.adaptiveFrameSkipping && this.shouldSkipFrame();
  }

  /**
   * Record processing time for adaptive optimization
   */
  recordProcessingTime(processingTime: number): void {
    this.lastProcessingTime = processingTime;
    this.processingTimes.push(processingTime);

    if (this.processingTimes.length > this.MAX_PROCESSING_HISTORY) {
      this.processingTimes.shift();
    }

    // Enable adaptive frame skipping if consistently slow
    const avgProcessingTime = this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length;
    this.adaptiveFrameSkipping = avgProcessingTime > this.PROCESSING_TIME_THRESHOLD;
  }

  /**
   * Determine if frame should be skipped based on performance
   */
  private shouldSkipFrame(): boolean {
    if (this.skipFrameCount >= this.MAX_SKIP_FRAMES) {
      return false; // Don't skip too many consecutive frames
    }

    const targetFrameTime = 1000 / this.targetFrameRate;
    return this.lastProcessingTime > targetFrameTime * 1.5; // Skip if 50% over target
  }

  /**
   * Check if overlay should be redrawn based on landmark changes
   */
  shouldRedrawOverlay(currentLandmarks: number[][][], processingTime: number): boolean {
    // Always redraw if processing was fast
    if (processingTime < 20) {
      return true;
    }

    // Generate signature of current landmarks
    const signature = this.generateLandmarksSignature(currentLandmarks);

    // If no significant change, skip redraw
    if (signature === this.lastLandmarksSignature) {
      return false;
    }

    // Check if change is significant enough
    const changeMagnitude = this.calculateLandmarkChange(currentLandmarks);
    if (changeMagnitude < this.landmarkChangeThreshold) {
      return false;
    }

    this.lastLandmarksSignature = signature;
    return true;
  }

  /**
   * Generate a simplified signature of landmark positions
   */
  private generateLandmarksSignature(landmarks: number[][][]): string {
    if (!landmarks || landmarks.length === 0) return '';

    const hand = landmarks[0];
    if (!hand || hand.length < 21) return '';

    // Sample key points (wrist, fingertips) for signature
    const keyPoints = [0, 4, 8, 12, 16, 20]; // wrist, thumb, index, middle, ring, pinky tips
    const signature = keyPoints.map(idx => {
      const point = hand[idx];
      if (!point || point.length < 2) return '0,0';
      // Round to reduce sensitivity to micro-changes
      return `${Math.round(point[0] * 100)},${Math.round(point[1] * 100)}`;
    }).join('|');

    return signature;
  }

  /**
   * Calculate magnitude of landmark changes
   */
  private calculateLandmarkChange(currentLandmarks: number[][][]): number {
    if (!currentLandmarks || currentLandmarks.length === 0) return 0;

    // Simplified change calculation - could be enhanced
    let totalChange = 0;
    let pointCount = 0;

    currentLandmarks.forEach(hand => {
      if (!hand) return;
      hand.forEach(point => {
        if (point && point.length >= 2) {
          // Simple change metric - could use more sophisticated distance calculation
          totalChange += Math.abs(point[0]) + Math.abs(point[1]);
          pointCount++;
        }
      });
    });

    return pointCount > 0 ? totalChange / pointCount : 0;
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(): {
    frameCount: number;
    averageProcessingTime: number;
    adaptiveFrameSkipping: boolean;
    skipFrameCount: number;
    targetFrameRate: number;
  } {
    const avgProcessingTime = this.processingTimes.length > 0
      ? this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length
      : 0;

    return {
      frameCount: this.frameCount,
      averageProcessingTime: avgProcessingTime,
      adaptiveFrameSkipping: this.adaptiveFrameSkipping,
      skipFrameCount: this.skipFrameCount,
      targetFrameRate: this.targetFrameRate
    };
  }

  /**
   * Reset performance tracking
   */
  reset(): void {
    this.frameCount = 0;
    this.processingTimes = [];
    this.skipFrameCount = 0;
    this.adaptiveFrameSkipping = false;
    this.lastLandmarksSignature = '';
  }

  /**
   * Set target frame rate for optimization
   */
  setTargetFrameRate(fps: number): void {
    this.targetFrameRate = Math.max(15, Math.min(60, fps));
  }

  /**
   * Set landmark change threshold for overlay optimization
   */
  setLandmarkChangeThreshold(threshold: number): void {
    this.landmarkChangeThreshold = Math.max(0.001, Math.min(0.1, threshold));
  }
}