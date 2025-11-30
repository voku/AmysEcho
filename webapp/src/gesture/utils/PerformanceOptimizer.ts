/**
 * Performance optimization utilities for gesture recognition
 * Implements intelligent frame skipping and processing optimization
 *
 * Scientific optimizations based on:
 * - "On-device Real-time Hand Gesture Recognition" (arXiv:2111.00038)
 * - "Improving Real-Time Hand Gesture Recognition with Semantic Segmentation" (MDPI Sensors)
 * - "Dynamic Hand Gesture Recognition Using MediaPipe and Transformer" (MDPI)
 *
 * Key strategies:
 * - Adaptive frame skipping based on processing load
 * - Velocity-based processing intensity adjustment
 * - Landmark change detection with configurable thresholds
 * - GPU/CPU load balancing through frame rate adaptation
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

  // Scientific optimization: Velocity-based adaptive processing
  private lastVelocityScore = 0;
  private velocityAdaptiveMode = true;
  private readonly VELOCITY_LOW_THRESHOLD = 0.005;
  private readonly VELOCITY_HIGH_THRESHOLD = 0.02;

  // Processing budget management (scientific: GPU/CPU load balancing)
  private processingBudgetMs = 33; // ~30fps target
  private budgetUtilization = 0;

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
    const avgProcessingTime = this.getAverageProcessingTime();
    this.adaptiveFrameSkipping = avgProcessingTime > this.PROCESSING_TIME_THRESHOLD;
  }

  /**
   * Calculate average processing time from recorded history
   */
  private getAverageProcessingTime(): number {
    return this.processingTimes.length > 0
      ? this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length
      : 0;
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
   *
   * @deprecated Use getDiagnostics() instead, which provides a superset of this information
   * including velocity score, processing intensity, budget utilization, and optimal status.
   */
  getPerformanceMetrics(): {
    frameCount: number;
    averageProcessingTime: number;
    adaptiveFrameSkipping: boolean;
    skipFrameCount: number;
    targetFrameRate: number;
  } {
    const diagnostics = this.getDiagnostics();
    return {
      frameCount: diagnostics.frameCount,
      averageProcessingTime: diagnostics.averageProcessingTime,
      adaptiveFrameSkipping: diagnostics.adaptiveFrameSkipping,
      skipFrameCount: diagnostics.skipFrameCount,
      targetFrameRate: diagnostics.targetFrameRate
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
    this.resetLandmarkSignature();
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
    return this.getAverageProcessingTime() < targetFrameTime;
  }

  /**
   * Check if the landmark signature has been set (hands were previously detected)
   * Useful for determining if this is the first detection after a gap
   */
  hasLandmarkSignature(): boolean {
    return this.lastLandmarksSignature !== '';
  }

  /**
   * Update velocity score for adaptive processing
   * Scientific optimization: Adjust processing intensity based on movement velocity
   * Based on: "Dynamic Hand Gesture Recognition Using Effective Feature Extraction"
   */
  updateVelocityScore(velocity: number): void {
    this.lastVelocityScore = velocity;
    this.updateProcessingBudget();
  }

  /**
   * Get recommended processing intensity based on velocity
   * Returns a multiplier (0.3 to 1.0) for processing load
   * Scientific: Skip expensive processing when hand is static
   */
  getProcessingIntensity(): number {
    if (!this.velocityAdaptiveMode) return 1.0;

    if (this.lastVelocityScore < this.VELOCITY_LOW_THRESHOLD) {
      return 0.3; // Minimal processing for static hand
    } else if (this.lastVelocityScore < this.VELOCITY_HIGH_THRESHOLD) {
      return 0.6; // Moderate processing for slow movement
    } else {
      return 1.0; // Full processing for active movement
    }
  }

  /**
   * Check if expensive processing steps should be skipped
   * Scientific: Only run gesture classification when hands are detected and moving
   */
  shouldSkipExpensiveProcessing(): boolean {
    // Skip if hand is static and we already have a result
    if (this.lastVelocityScore < this.VELOCITY_LOW_THRESHOLD && this.hasLandmarkSignature()) {
      return true;
    }

    // Skip if we're over budget
    if (this.budgetUtilization > 1.2) {
      return true;
    }

    return false;
  }

  /**
   * Update processing budget based on current performance
   * Scientific: GPU/CPU load balancing through frame rate adaptation
   */
  private updateProcessingBudget(): void {
    const avgProcessingTime = this.getAverageProcessingTime();
    const targetFrameTime = 1000 / this.targetFrameRate;

    this.budgetUtilization = avgProcessingTime / targetFrameTime;

    // Adjust budget based on velocity - static hands need less processing
    if (this.lastVelocityScore < this.VELOCITY_LOW_THRESHOLD) {
      this.processingBudgetMs = targetFrameTime * 0.5; // Use only half the budget
    } else {
      this.processingBudgetMs = targetFrameTime;
    }
  }

  /**
   * Get current budget utilization (0.0 = idle, 1.0 = at budget, >1.0 = over budget)
   */
  getBudgetUtilization(): number {
    return this.budgetUtilization;
  }

  /**
   * Get current processing budget in milliseconds
   */
  getProcessingBudgetMs(): number {
    return this.processingBudgetMs;
  }

  /**
   * Enable or disable velocity-adaptive processing mode
   */
  setVelocityAdaptiveMode(enabled: boolean): void {
    this.velocityAdaptiveMode = enabled;
  }

  /**
   * Check if velocity-adaptive mode is enabled
   */
  isVelocityAdaptiveModeEnabled(): boolean {
    return this.velocityAdaptiveMode;
  }

  /**
   * Get comprehensive performance diagnostics
   * Useful for debugging and optimization tuning
   */
  getDiagnostics(): {
    frameCount: number;
    averageProcessingTime: number;
    lastProcessingTime: number;
    targetFrameRate: number;
    adaptiveFrameSkipping: boolean;
    skipFrameCount: number;
    velocityScore: number;
    processingIntensity: number;
    budgetUtilization: number;
    isOptimal: boolean;
  } {
    return {
      frameCount: this.frameCount,
      averageProcessingTime: this.getAverageProcessingTime(),
      lastProcessingTime: this.lastProcessingTime,
      targetFrameRate: this.targetFrameRate,
      adaptiveFrameSkipping: this.adaptiveFrameSkipping,
      skipFrameCount: this.skipFrameCount,
      velocityScore: this.lastVelocityScore,
      processingIntensity: this.getProcessingIntensity(),
      budgetUtilization: this.budgetUtilization,
      isOptimal: this.isPerformanceOptimal(),
    };
  }
}