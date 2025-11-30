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
    if (!hand || hand.length === 0) return '';

    // Use available points for signature (works with test data that has fewer points)
    const keyPoints = Math.min(hand.length, 5); // Use up to 5 points
    const signature = [];
    for (let i = 0; i < keyPoints; i++) {
      const point = hand[i];
      if (point && point.length >= 2 && point[0] !== undefined && point[1] !== undefined) {
        // Round to reduce sensitivity to micro-changes
        signature.push(`${Math.round(point[0] * 100)},${Math.round(point[1] * 100)}`);
      }
    }

    return signature.join('|');
  }

  /**
   * Calculate magnitude of landmark changes from last signature
   */
  private calculateLandmarkChange(currentLandmarks: number[][][]): number {
    if (!currentLandmarks || currentLandmarks.length === 0) return 0;
    if (!this.lastLandmarksSignature) return 1.0; // First time, consider it a change

    const currentSignature = this.generateLandmarksSignature(currentLandmarks);
    if (currentSignature === this.lastLandmarksSignature) return 0;

    // Calculate change based on signature difference
    const currentParts = currentSignature.split('|');
    const lastParts = this.lastLandmarksSignature.split('|');

    if (currentParts.length !== lastParts.length) return 1.0;

    let totalChange = 0;
    for (let i = 0; i < currentParts.length; i++) {
      const currentPart = currentParts[i];
      const lastPart = lastParts[i];
      if (!currentPart || !lastPart) continue;
      
      const currentCoords = currentPart.split(',').map(Number);
      const lastCoords = lastPart.split(',').map(Number);

      if (currentCoords.length === 2 && lastCoords.length === 2) {
        const cx = currentCoords[0];
        const cy = currentCoords[1];
        const lx = lastCoords[0];
        const ly = lastCoords[1];
        if (cx !== undefined && cy !== undefined && lx !== undefined && ly !== undefined) {
          const dx = cx - lx;
          const dy = cy - ly;
          totalChange += Math.sqrt(dx * dx + dy * dy);
        }
      }
    }

    return totalChange / currentParts.length;
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

  /**
   * Reset the landmark signature when no hands are detected
   * This ensures the next detected hand triggers a fresh overlay redraw
   */
  resetLandmarkSignature(): void {
    this.lastLandmarksSignature = '';
  }

  /**
   * Get the last recorded processing time for diagnostics
   */
  getLastProcessingTime(): number {
    return this.lastProcessingTime;
  }

  /**
   * Check if current performance is within optimal thresholds
   * Returns true if average processing time is below target frame time
   */
  isPerformanceOptimal(): boolean {
    const targetFrameTime = 1000 / this.targetFrameRate;
    const avgProcessingTime = this.processingTimes.length > 0
      ? this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length
      : 0;
    return avgProcessingTime < targetFrameTime;
  }

  /**
   * Check if the landmark signature has been set (hands were previously detected)
   * Useful for determining if this is the first detection after a gap
   */
  hasLandmarkSignature(): boolean {
    return this.lastLandmarksSignature !== '';
  }
}