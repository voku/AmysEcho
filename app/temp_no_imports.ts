// Forward script errors to React Native for easier debugging
const onError = (e: ErrorEvent) => {
  try {
    // Send a generic child-friendly error message instead of technical details
    window.ReactNativeWebView?.postMessage?.(
      JSON.stringify({
        type: 'error',
        message: 'gesture_processing_error', // Generic identifier for React Native to handle
        // Keep technical details for logging but don't send to UI
        _technical: {
          message: e.message,
          file: e.filename,
          line: e.lineno,
          col: e.colno,
          stack: e.error?.stack || null,
        },
      }),
    );
  } catch (err) {
    console.warn('Failed to forward script error event:', err);
  }
};
window.addEventListener('error', onError);

const onUnhandledRejection = (e: PromiseRejectionEvent) => {
  try {
    // Send a generic child-friendly error message instead of technical details
    window.ReactNativeWebView?.postMessage?.(
      JSON.stringify({
        type: 'error',
        message: 'gesture_processing_error', // Generic identifier for React Native to handle
        // Keep technical details for logging but don't send to UI
        _technical: {
          message: String(e?.reason?.message ?? e?.reason ?? 'unhandledrejection'),
          stack: e.reason?.stack || null,
        },
      }),
    );
  } catch (err) {
    console.warn('Failed to forward unhandledrejection:', err);
  }
};
window.addEventListener('unhandledrejection', onUnhandledRejection);

// Expose fflate for compatibility with older WebView bundles
window.fflate = { unzip, unzipSync };
installMlp();

// Error Recovery Manager for robust error handling
class ErrorRecoveryManager {
  private failureCount = 0;
  private lastFailureTime = 0;
  private circuitBreakerOpen = false;
  private fallbackMode = false;

  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 30000; // 30 seconds
  private readonly FAILURE_WINDOW = 60000; // 1 minute

  getErrorInfo(error: Error, context: string): { message: string; code: string; recoverable: boolean; severity: 'low' | 'medium' | 'high' } {
    const errorMessage = error.message.toLowerCase();

    // Network-related errors
    if (errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('timeout')) {
      return {
        message: 'Network connectivity issue detected',
        code: 'NETWORK_ERROR',
        recoverable: true,
        severity: 'medium'
      };
    }

    // Camera-related errors
    if (errorMessage.includes('camera') || errorMessage.includes('media') || errorMessage.includes('permission')) {
      return {
        message: 'Camera access issue detected',
        code: 'CAMERA_ERROR',
        recoverable: true,
        severity: 'high'
      };
    }

    // MediaPipe-related errors
    if (errorMessage.includes('mediapipe') || errorMessage.includes('wasm') || errorMessage.includes('webgl')) {
      return {
        message: 'Gesture recognition system issue detected',
        code: 'MEDIAPIPE_ERROR',
        recoverable: true,
        severity: 'medium'
      };
    }

    // Memory-related errors
    if (errorMessage.includes('memory') || errorMessage.includes('out of memory')) {
      return {
        message: 'Memory issue detected',
        code: 'MEMORY_ERROR',
        recoverable: true,
        severity: 'high'
      };
    }

    // Performance-related errors
    if (errorMessage.includes('performance') || errorMessage.includes('slow') || errorMessage.includes('timeout')) {
      return {
        message: 'Performance issue detected',
        code: 'PERFORMANCE_ERROR',
        recoverable: true,
        severity: 'low'
      };
    }

    // Generic error
    return {
      message: `System issue detected during ${context}`,
      code: 'GENERIC_ERROR',
      recoverable: false,
      severity: 'medium'
    };
  }

  recordFailure(): boolean {
    const now = Date.now();

    // Reset failure count if outside the failure window
    if (now - this.lastFailureTime > this.FAILURE_WINDOW) {
      this.failureCount = 0;
    }

    this.failureCount++;
    this.lastFailureTime = now;

    // Open circuit breaker if threshold exceeded
    if (this.failureCount >= this.CIRCUIT_BREAKER_THRESHOLD) {
      this.circuitBreakerOpen = true;
      console.warn('Circuit breaker opened due to repeated failures');
      return false;
    }

    return true; // Should retry
  }

  isCircuitBreakerOpen(): boolean {
    // Auto-close circuit breaker after timeout
    if (this.circuitBreakerOpen && Date.now() - this.lastFailureTime > this.CIRCUIT_BREAKER_TIMEOUT) {
      this.circuitBreakerOpen = false;
      this.failureCount = 0;
      console.info('Circuit breaker auto-closed');
    }

    return this.circuitBreakerOpen;
  }

  activateFallbackMode(): void {
    if (!this.fallbackMode) {
      this.fallbackMode = true;
      console.warn('Activating fallback gesture detection mode');

      // Notify React Native about fallback mode
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: 'telemetry',
            event: 'fallback_mode_activated'
          })
        );
      } catch (err) {
        console.warn('Failed to send fallback mode notification:', err);
      }
    }
  }

  isInFallbackMode(): boolean {
    return this.fallbackMode;
  }

  reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.circuitBreakerOpen = false;
    this.fallbackMode = false;
  }
}

const errorRecoveryManager = new ErrorRecoveryManager();

// Configure gesture size tolerance
gestureSizeNormalizer.setTolerance(GESTURE_SIZE_TOLERANCE);

try {
  window.ReactNativeWebView?.postMessage?.(
    JSON.stringify({ type: 'telemetry', event: 'mlp_ready' }),
  );
} catch (err) {
  console.warn("Failed to send 'mlp_ready' telemetry event:", err);
}

const tapToStartText = window.__tapToStart || '';
const recognizerInitFailed =
  window.__recognizerInitFailed || 'Erkennung konnte nicht gestartet werden: ';
const predictionError = window.__predictionError || 'Vorhersagefehler: ';
const cameraError = window.__cameraError || 'Kamerafehler: ';
const facingMode = window.__facingMode || 'user';
const mirrorOverlay = window.__mirrorOverlay === true;
// Amy First: Lower thresholds for imperfect gestures (22q11 syndrome)
const MLP_CONFIDENCE_THRESHOLD = window.__mlpThreshold ?? 0.4;
// Minimum confidence below which custom gesture fallbacks activate
const FALLBACK_CONFIDENCE_THRESHOLD = window.__fallbackThreshold ?? 0.3;
// Timeout for CDN fetches and script loads to avoid hangs
const LOAD_TIMEOUT_MS = 8000;
// Gesture size tolerance (0.1 to 1.0, default 0.3 = 30% tolerance)
const GESTURE_SIZE_TOLERANCE = window.__gestureSizeTolerance ?? 0.3;

// Emergency gesture definitions - these bypass all throttling and delays
const EMERGENCY_GESTURES = new Set(['hilfe', 'help', 'emergency', 'stop', 'danger']);
const EMERGENCY_CONFIDENCE_THRESHOLD = 0.3; // Lower threshold for emergency detection
let lastEmergencyGestureTime = 0;
const EMERGENCY_COOLDOWN_MS = 1000; // Prevent spam but allow quick repeated calls

// Amy First: Continuous operation mode - no performance degradation at low battery
// Note: Always enabled for Amy's safety, no battery threshold optimizations

// Gesture size tolerance and normalization system
class GestureSizeNormalizer {
  private baseHandSize: number | null = null;
  private sizeTolerance = 0.3; // How much size variation to allow (30%)
  private minScale = 0.7; // Minimum allowed scale
  private maxScale = 1.4; // Maximum allowed scale

  /**
   * Set the tolerance level for gesture sizes
   */
  setTolerance(tolerance: number): void {
    this.sizeTolerance = Math.max(0.1, Math.min(1.0, tolerance));
    this.minScale = 1 - this.sizeTolerance;
    this.maxScale = 1 + this.sizeTolerance;
  }

  /**
   * Normalize hand landmarks to a standard size
   */
  normalizeHandSize(landmarks: number[][][]): number[][][] {
    if (landmarks.length === 0) return landmarks;

    const normalized = JSON.parse(JSON.stringify(landmarks));

    for (let handIdx = 0; handIdx < landmarks.length; handIdx++) {
      const hand = landmarks[handIdx];
      if (!hand || hand.length < 21) continue;

      // Calculate current hand size (distance between wrist and middle finger tip)
      const wrist = hand[0]; // Wrist landmark
      const middleTip = hand[12]; // Middle finger tip
      const currentSize = Math.sqrt(
        Math.pow(middleTip[0] - wrist[0], 2) +
        Math.pow(middleTip[1] - wrist[1], 2)
      );

      // Set base size on first valid measurement
      if (this.baseHandSize === null && currentSize > 0) {
        this.baseHandSize = currentSize;
      }

      if (this.baseHandSize && currentSize > 0) {
        // Calculate scale factor
        let scaleFactor = this.baseHandSize / currentSize;

        // Clamp scale factor to tolerance range
        scaleFactor = Math.max(this.minScale, Math.min(this.maxScale, scaleFactor));

        // Apply scaling to all landmarks relative to wrist
        for (let pointIdx = 0; pointIdx < hand.length; pointIdx++) {
          const point = hand[pointIdx];
          if (!point) continue;

          // Scale relative to wrist position
          const scaledX = wrist[0] + (point[0] - wrist[0]) * scaleFactor;
          const scaledY = wrist[1] + (point[1] - wrist[1]) * scaleFactor;
          const scaledZ = point[2] ? wrist[2] + (point[2] - wrist[2]) * scaleFactor : point[2];

          normalized[handIdx][pointIdx] = [scaledX, scaledY, scaledZ];
        }
      }
    }

    return normalized;
  }

  /**
   * Reset the base hand size (useful when switching users or sessions)
   */
  reset(): void {
    this.baseHandSize = null;
  }

  /**
   * Get current tolerance settings
   */
  getTolerance(): { tolerance: number; minScale: number; maxScale: number } {
    return {
      tolerance: this.sizeTolerance,
      minScale: this.minScale,
      maxScale: this.maxScale
    };
  }
}

const gestureSizeNormalizer = new GestureSizeNormalizer();

// Partial gesture completion system
class PartialGestureDetector {
  private gesturePatterns: Map<string, number[][][]> = new Map();
  private partialThreshold = 0.6; // Minimum completion percentage to consider
  private completionTimeout = 2000; // Time window to complete gesture (ms)
  private activePartialGestures: Map<string, { startTime: number; landmarks: number[][][]; progress: number }> = new Map();

  /**
   * Set the partial completion threshold
   */
  setThreshold(threshold: number): void {
    this.partialThreshold = Math.max(0.3, Math.min(0.9, threshold));
  }

  /**
   * Analyze hand pose for partial gesture completion
   */
  analyzePartialCompletion(landmarks: number[][][], gestureId: string): {
    isPartial: boolean;
    completion: number;
    confidence: number;
    feedback: string;
  } {
    if (landmarks.length === 0) {
      return { isPartial: false, completion: 0, confidence: 0, feedback: '' };
    }

    const hand = landmarks[0];
    if (!hand || hand.length < 21) {
      return { isPartial: false, completion: 0, confidence: 0, feedback: '' };
    }

    // Analyze different gesture types for partial completion
    switch (gestureId) {
      case 'thumbs_up':
        return this.analyzeThumbsUpPartial(hand);
      case 'open_palm':
        return this.analyzeOpenPalmPartial(hand);
      case 'fist':
        return this.analyzeFistPartial(hand);
      case 'point':
        return this.analyzePointPartial(hand);
      default:
        return { isPartial: false, completion: 0, confidence: 0, feedback: '' };
    }
  }

  private analyzeThumbsUpPartial(hand: number[][]): {
    isPartial: boolean;
    completion: number;
    confidence: number;
    feedback: string;
  } {
    // Thumbs up: thumb extended, other fingers curled
    const thumbExtended = hand[4][1] < hand[3][1]; // Thumb tip above thumb joint
    const indexCurled = hand[8][1] > hand[6][1]; // Index tip below joint
    const middleCurled = hand[12][1] > hand[10][1]; // Middle tip below joint
    const ringCurled = hand[16][1] > hand[14][1]; // Ring tip below joint
    const pinkyCurled = hand[20][1] > hand[18][1]; // Pinky tip below joint

    const completion = (thumbExtended ? 1 : 0) +
                      (indexCurled ? 1 : 0) +
                      (middleCurled ? 1 : 0) +
                      (ringCurled ? 1 : 0) +
                      (pinkyCurled ? 1 : 0);

    const normalizedCompletion = completion / 5;
    const isPartial = normalizedCompletion >= 0.4 && normalizedCompletion < 1.0;

    let feedback = '';
    if (isPartial) {
      if (!thumbExtended) {
        feedback = 'Streck deinen Daumen nach oben';
      } else if (!indexCurled) {
        feedback = 'Mach eine Faust mit den Fingern';
      }
    }

    return {
      isPartial,
      completion: normalizedCompletion,
      confidence: normalizedCompletion * 0.8,
      feedback
    };
  }

  private analyzeOpenPalmPartial(hand: number[][]): {
    isPartial: boolean;
    completion: number;
    confidence: number;
    feedback: string;
  } {
    // Open palm: all fingers extended
    const fingers = [
      { tip: 8, joint: 6 }, // Index
      { tip: 12, joint: 10 }, // Middle
      { tip: 16, joint: 14 }, // Ring
      { tip: 20, joint: 18 }, // Pinky
    ];

    let extendedCount = 0;
    fingers.forEach(({ tip, joint }) => {
      if (hand[tip][1] < hand[joint][1]) {
        extendedCount++;
      }
    });

    const completion = extendedCount / fingers.length;
    const isPartial = completion >= 0.5 && completion < 1.0;

    let feedback = '';
    if (isPartial) {
      feedback = 'Streck alle Finger aus für eine offene Hand';
    }

    return {
      isPartial,
      completion,
      confidence: completion * 0.9,
      feedback
    };
  }

  private analyzeFistPartial(hand: number[][]): {
    isPartial: boolean;
    completion: number;
    confidence: number;
    feedback: string;
  } {
    // Fist: all fingers curled
    const fingers = [
      { tip: 8, joint: 6 }, // Index
      { tip: 12, joint: 10 }, // Middle
      { tip: 16, joint: 14 }, // Ring
      { tip: 20, joint: 18 }, // Pinky
    ];

    let curledCount = 0;
    fingers.forEach(({ tip, joint }) => {
      if (hand[tip][1] > hand[joint][1]) {
        curledCount++;
      }
    });

    const completion = curledCount / fingers.length;
    const isPartial = completion >= 0.4 && completion < 1.0;

    let feedback = '';
    if (isPartial) {
      feedback = 'Mach eine Faust mit allen Fingern';
    }

    return {
      isPartial,
      completion,
      confidence: completion * 0.7,
      feedback
    };
  }

  private analyzePointPartial(hand: number[][]): {
    isPartial: boolean;
    completion: number;
    confidence: number;
    feedback: string;
  } {
    // Point: index extended, other fingers curled
    const indexExtended = hand[8][1] < hand[6][1];
    const middleCurled = hand[12][1] > hand[10][1];
    const ringCurled = hand[16][1] > hand[14][1];
    const pinkyCurled = hand[20][1] > hand[18][1];

    const completion = (indexExtended ? 1 : 0) +
                      (middleCurled ? 1 : 0) +
                      (ringCurled ? 1 : 0) +
                      (pinkyCurled ? 1 : 0);

    const normalizedCompletion = completion / 4;
    const isPartial = normalizedCompletion >= 0.5 && normalizedCompletion < 1.0;

    let feedback = '';
    if (isPartial) {
      if (!indexExtended) {
        feedback = 'Streck deinen Zeigefinger aus';
      } else if (!middleCurled) {
        feedback = 'Mach eine Faust mit den anderen Fingern';
      }
    }

    return {
      isPartial,
      completion: normalizedCompletion,
      confidence: normalizedCompletion * 0.8,
      feedback
    };
  }

  /**
   * Check if a partial gesture should be recognized
   */
  shouldRecognizePartial(completion: number, confidence: number): boolean {
    return completion >= this.partialThreshold && confidence >= 0.4;
  }

  /**
   * Clean up old partial gestures
   */
  cleanup(): void {
    const now = Date.now();
    for (const [gestureId, data] of this.activePartialGestures) {
      if (now - data.startTime > this.completionTimeout) {
        this.activePartialGestures.delete(gestureId);
      }
    }
  }
}

const partialGestureDetector = new PartialGestureDetector();

// Hand stability assistance system
class HandStabilityAssistant {
  private stabilityHistory: number[] = [];
  private readonly MAX_HISTORY = 10;
  private stabilityThreshold = 0.02; // Movement threshold for stability
  private stabilityScore = 0;
  private lastStablePosition: number[][] | null = null;

  /**
   * Analyze hand stability based on landmark movement
   */
  analyzeStability(landmarks: number[][][]): {
    isStable: boolean;
    stabilityScore: number;
    feedback: string;
    guidePosition?: { x: number; y: number };
  } {
    if (landmarks.length === 0 || !landmarks[0]) {
      return { isStable: false, stabilityScore: 0, feedback: 'Positioniere deine Hand in der Kamera' };
    }

    const hand = landmarks[0];
    if (hand.length < 21) {
      return { isStable: false, stabilityScore: 0, feedback: 'Halte deine Hand ruhig' };
    }

    // Calculate center of palm as reference point
    const palmCenter = this.calculatePalmCenter(hand);
    const movement = this.lastStablePosition
      ? this.calculateMovement(this.lastStablePosition, palmCenter)
      : 0;

    // Update stability history
    this.stabilityHistory.push(movement);
    if (this.stabilityHistory.length > this.MAX_HISTORY) {
      this.stabilityHistory.shift();
    }

    // Calculate stability score (lower movement = higher stability)
    const avgMovement = this.stabilityHistory.reduce((sum, m) => sum + m, 0) / this.stabilityHistory.length;
    this.stabilityScore = Math.max(0, 1 - (avgMovement / this.stabilityThreshold));

    const isStable = this.stabilityScore > 0.7;

    if (isStable) {
      this.lastStablePosition = palmCenter;
    }

    let feedback = '';
    let guidePosition: { x: number; y: number } | undefined;

    if (!isStable) {
      if (this.stabilityScore < 0.3) {
        feedback = 'Halte deine Hand ruhiger';
        guidePosition = { x: 0.5, y: 0.5 }; // Center of screen
      } else if (this.stabilityScore < 0.7) {
        feedback = 'Fast geschafft! Halte still';
      }
    } else {
      feedback = 'Perfekt! Hand ist stabil';
    }

    return {
      isStable,
      stabilityScore: this.stabilityScore,
      feedback,
      guidePosition
    };
  }

  /**
   * Calculate center of palm using key landmarks
   */
  private calculatePalmCenter(hand: number[][]): number[][] {
    // Use wrist and base of fingers as reference
    const wrist = hand[0];
    const indexBase = hand[5];
    const pinkyBase = hand[17];

    const centerX = (wrist[0] + indexBase[0] + pinkyBase[0]) / 3;
    const centerY = (wrist[1] + indexBase[1] + pinkyBase[1]) / 3;
    const centerZ = (wrist[2] + indexBase[2] + pinkyBase[2]) / 3;

    return [[centerX, centerY, centerZ]];
  }

  /**
   * Calculate movement between two positions
   */
  private calculateMovement(pos1: number[][], pos2: number[][]): number {
    if (!pos1[0] || !pos2[0]) return 0;

    const dx = pos1[0][0] - pos2[0][0];
    const dy = pos1[0][1] - pos2[0][1];
    const dz = pos1[0][2] - pos2[0][2];

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Reset stability tracking
   */
  reset(): void {
    this.stabilityHistory = [];
    this.stabilityScore = 0;
    this.lastStablePosition = null;
  }

  /**
   * Get current stability status
   */
  getStabilityStatus(): { score: number; isStable: boolean } {
    return {
      score: this.stabilityScore,
      isStable: this.stabilityScore > 0.7
    };
  }
}

const handStabilityAssistant = new HandStabilityAssistant();

// Tremor compensation system
class TremorCompensator {
  private landmarkHistory: number[][][][] = [];
  private readonly MAX_HISTORY = 5; // Keep last 5 frames for smoothing
  private readonly SMOOTHING_FACTOR = 0.7; // How much to smooth (0-1)

  /**
   * Add new landmarks to history and return smoothed version
   */
  smoothLandmarks(landmarks: number[][][]): number[][][] {
    // Add current frame to history
    this.landmarkHistory.push(JSON.parse(JSON.stringify(landmarks)));
    if (this.landmarkHistory.length > this.MAX_HISTORY) {
      this.landmarkHistory.shift();
    }

    if (this.landmarkHistory.length < 2) {
      return landmarks; // Not enough history for smoothing
    }

    // Apply exponential smoothing
    const smoothed = JSON.parse(JSON.stringify(landmarks));

    for (let handIdx = 0; handIdx < landmarks.length; handIdx++) {
      const hand = landmarks[handIdx];
      if (!hand) continue;

      for (let pointIdx = 0; pointIdx < hand.length; pointIdx++) {
        const currentPoint = hand[pointIdx];
        if (!currentPoint) continue;

        // Calculate weighted average of recent frames
        let smoothedX = currentPoint[0];
        let smoothedY = currentPoint[1];
        let smoothedZ = currentPoint[2] || 0;

        let totalWeight = 1;
        for (let historyIdx = 0; historyIdx < this.landmarkHistory.length - 1; historyIdx++) {
          const weight = Math.pow(1 - this.SMOOTHING_FACTOR, historyIdx + 1);
          const historyHand = this.landmarkHistory[historyIdx][handIdx];
          if (historyHand && historyHand[pointIdx]) {
            const historyPoint = historyHand[pointIdx];
            smoothedX += historyPoint[0] * weight;
            smoothedY += historyPoint[1] * weight;
            smoothedZ += (historyPoint[2] || 0) * weight;
            totalWeight += weight;
          }
        }

        smoothed[handIdx][pointIdx] = [
          smoothedX / totalWeight,
          smoothedY / totalWeight,
          smoothedZ / totalWeight
        ];
      }
    }

    return smoothed;
  }

  /**
   * Detect if movement is likely intentional vs tremor
   */
  isIntentionalMovement(currentLandmarks: number[][][], previousLandmarks: number[][][]): boolean {
    if (!previousLandmarks || previousLandmarks.length === 0) {
      return true; // First frame is always considered intentional
    }

    let totalMovement = 0;
    let pointCount = 0;

    // Calculate average movement across all hand landmarks
    for (let handIdx = 0; handIdx < Math.min(currentLandmarks.length, previousLandmarks.length); handIdx++) {
      const currentHand = currentLandmarks[handIdx];
      const previousHand = previousLandmarks[handIdx];

      if (!currentHand || !previousHand) continue;

      for (let pointIdx = 0; pointIdx < Math.min(currentHand.length, previousHand.length); pointIdx++) {
        const currentPoint = currentHand[pointIdx];
        const previousPoint = previousHand[pointIdx];

        if (!currentPoint || !previousPoint) continue;

        const distance = Math.sqrt(
          Math.pow(currentPoint[0] - previousPoint[0], 2) +
          Math.pow(currentPoint[1] - previousPoint[1], 2) +
          Math.pow((currentPoint[2] || 0) - (previousPoint[2] || 0), 2)
        );

        totalMovement += distance;
        pointCount++;
      }
    }

    if (pointCount === 0) return true;

    const averageMovement = totalMovement / pointCount;

    // Consider movement intentional if it's above a threshold
    // This helps filter out micro-tremors while preserving gestures
    const INTENTIONAL_MOVEMENT_THRESHOLD = 0.02; // Adjust based on testing
    return averageMovement > INTENTIONAL_MOVEMENT_THRESHOLD;
  }

  /**
   * Clear history (useful when switching gestures or starting new session)
   */
  clearHistory(): void {
    this.landmarkHistory = [];
  }
}

const tremorCompensator = new TremorCompensator();
let lastProcessedLandmarks: number[][][] = [];

// Resource Manager for comprehensive cleanup
class ResourceManager {
  private resources: Set<() => void | Promise<void>> = new Set();
  private eventListeners: Array<{ element: EventTarget; type: string; listener: EventListener }> = [];
  private mediaStreams: MediaStream[] = [];
  private timeouts: number[] = [];
  private observers: (ResizeObserver | MutationObserver)[] = [];

  /**
   * Register a cleanup function
   */
  registerCleanup(cleanupFn: () => void | Promise<void>): void {
    this.resources.add(cleanupFn);
  }

  /**
   * Register an event listener for cleanup
   */
  registerEventListener(element: EventTarget, type: string, listener: EventListener): void {
    this.eventListeners.push({ element, type, listener });
  }

  /**
   * Register a media stream for cleanup
   */
  registerMediaStream(stream: MediaStream): void {
    this.mediaStreams.push(stream);
  }

  /**
   * Register a timeout for cleanup
   */
  registerTimeout(timeoutId: number): void {
    this.timeouts.push(timeoutId);
  }

  /**
   * Register an observer for cleanup
   */
  registerObserver(observer: ResizeObserver | MutationObserver): void {
    this.observers.push(observer);
  }

  /**
   * Dispose all registered resources
   */
  async dispose(): Promise<void> {
    const errors: Error[] = [];

    // Clean up custom resources
    for (const cleanupFn of this.resources) {
      try {
        const result = cleanupFn();
        if (result && typeof result.then === 'function') {
          await result;
        }
      } catch (e) {
        errors.push(e as Error);
      }
    }
    this.resources.clear();

    // Clean up event listeners
    for (const { element, type, listener } of this.eventListeners) {
      try {
        element.removeEventListener(type, listener);
      } catch (e) {
        errors.push(e as Error);
      }
    }
    this.eventListeners = [];

    // Clean up media streams
    for (const stream of this.mediaStreams) {
      try {
        stream.getTracks().forEach(track => track.stop());
      } catch (e) {
        errors.push(e as Error);
      }
    }
    this.mediaStreams = [];

    // Clean up timeouts
    for (const timeoutId of this.timeouts) {
      try {
        clearTimeout(timeoutId);
      } catch (e) {
        errors.push(e as Error);
      }
    }
    this.timeouts = [];

    // Clean up observers
    for (const observer of this.observers) {
      try {
        observer.disconnect();
      } catch (e) {
        errors.push(e as Error);
      }
    }
    this.observers = [];

    if (errors.length > 0) {
      console.warn('Resource cleanup errors:', errors);
    }
  }

  /**
   * Check if resources are properly cleaned up
   */
  isClean(): boolean {
    return this.resources.size === 0 &&
           this.eventListeners.length === 0 &&
           this.mediaStreams.length === 0 &&
           this.timeouts.length === 0 &&
           this.observers.length === 0;
  }
}

const resourceManager = new ResourceManager();

// Error Recovery Manager already defined above

// Dynamically load MediaPipe Tasks Vision from CDN and wait until it's ready
async function loadTasksVision() {
  // Resolve a pinned version from host config if provided
  async function resolvePinnedBase() {
    const pinnedVersion = window.__mediapipeVersion;
    if (typeof pinnedVersion === 'string' && pinnedVersion.length) {
      return { base: 'https://cdn.jsdelivr.net/npm', version: pinnedVersion };
    }
    const cdns = ['https://cdn.jsdelivr.net/npm', 'https://unpkg.com'];
    const controllers = cdns.map(() => new AbortController());
    const fetches = cdns.map((base, i) =>
      (async () => {
        try {
          const ac = controllers[i];
          const t = setTimeout(() => ac.abort(), LOAD_TIMEOUT_MS);
          const pkg = await fetch(base + '/@mediapipe/tasks-vision/package.json', {
            method: 'GET',
            signal: ac.signal,
            cache: 'no-store',
          }).finally(() => clearTimeout(t));
          if (pkg.ok) {
            const json = await pkg.json().catch(() => null);
            const v = json?.version;
            if (typeof v === 'string' && v.length) {
              controllers.forEach((c, j) => {
                if (j !== i) c.abort();
              });
              return { base, version: v };
            }
          }
        } catch (err) {
          if ((err as any)?.name !== 'AbortError') {
            console.warn('Fetch failed:', base, err);
          }
        }
        return null;
      })(),
    );
    const results = await Promise.all(fetches);
    return results.find(Boolean) || null;
  }

  function tryLoadScript(src: string, integrity?: string, timeoutMs = LOAD_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      if (integrity) {
        s.integrity = integrity;
        s.crossOrigin = 'anonymous';
      }
      if (window.__visionBundleNonce) {
        s.nonce = window.__visionBundleNonce;
      }
      s.async = true;
      const cleanup = () => {
        s.onload = s.onerror = null;
        if (s.parentNode) s.parentNode.removeChild(s);
      };
      const to = setTimeout(() => {
        cleanup();
        reject(new Error('Script load timeout: ' + src));
      }, timeoutMs);
      s.onload = () => {
        clearTimeout(to);
        cleanup();
        resolve(null);
      };
      s.onerror = () => {
        clearTimeout(to);
        cleanup();
        reject(new Error('Script failed to load: ' + src));
      };
      document.head.appendChild(s);
    });
  }

  const haveUMD = () =>
    window.fileset_resolver &&
    window.fileset_resolver.FilesetResolver &&
    window.vision &&
    window.vision.GestureRecognizer;

  // Compute preferred URLs
  const pinned = await resolvePinnedBase();
  const candidates = [];
  if (pinned) {
    candidates.push({
      umd: pinned.base + '/@mediapipe/tasks-vision@' + pinned.version + '/vision_bundle.js',
      esm: pinned.base + '/@mediapipe/tasks-vision@' + pinned.version + '/vision_bundle.mjs',
      wasm: pinned.base + '/@mediapipe/tasks-vision@' + pinned.version + '/wasm',
    });
  }
  // Generic latest as fallback
  candidates.push({
    umd: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.js',
    esm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs',
    wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm',
  });
  candidates.push({
    umd: 'https://unpkg.com/@mediapipe/tasks-vision/vision_bundle.js',
    esm: 'https://unpkg.com/@mediapipe/tasks-vision/vision_bundle.mjs',
    wasm: 'https://unpkg.com/@mediapipe/tasks-vision/wasm',
  });

  let lastError = null;
  for (const c of candidates) {
    try {
      // Try UMD first
      if (!haveUMD()) {
        const sri =
          pinned && c.umd.includes(`@${pinned.version}/`) ? window.__visionBundleSri : undefined;
        await tryLoadScript(c.umd, sri);
      }
      if (haveUMD()) {
        return {
          FilesetResolver: window.fileset_resolver.FilesetResolver,
          GestureRecognizer: window.vision.GestureRecognizer,
          wasmBase: c.wasm,
        };
      }
      // Try ESM next (optional: gate via host config)
      if (window.__allowCdnEsm === true) {
        try {
          const mod = await import(/* @vite-ignore */ c.esm);
          if (mod?.FilesetResolver && mod?.GestureRecognizer) {
            return {
              FilesetResolver: mod.FilesetResolver,
              GestureRecognizer: mod.GestureRecognizer,
              wasmBase: c.wasm,
            };
          }
        } catch (e) {
          lastError = e;
        }
      }
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(
    'Tasks Vision globals not available' +
      (lastError ? ': ' + (lastError.message || lastError) : ''),
  );
}
// Initialize new modular gesture detector
const video = document.createElement('video');
const overlay = document.createElement('canvas');
overlay.id = 'overlay';
video.setAttribute('autoplay', '');
video.setAttribute('playsinline', '');
video.setAttribute('muted', '');

// Create main gesture detector instance
let mainGestureDetector: GestureDetector | null = null;
function initDom() {
  document.body.appendChild(video);
  document.body.appendChild(overlay);
  try { resizeOverlay(); } catch (e) { console.warn('Initial resize failed:', e); }
  if (typeof ResizeObserver === 'function') {
    videoResizeObserver = new ResizeObserver(() => resizeOverlay());
    videoResizeObserver.observe(video);
    // Register observer with resource manager
    resourceManager.registerObserver(videoResizeObserver);
  } else {
    const onWinResize = () => resizeOverlay();
    window.addEventListener('resize', onWinResize);
    removeWindowResize = () => window.removeEventListener('resize', onWinResize);
    // Register event listener with resource manager
    resourceManager.registerEventListener(window, 'resize', onWinResize);
  }
  const tap = document.createElement('div');
  tap.id = 'tapToStart';
  tap.innerText = tapToStartText;
  if (window.__autostartCamera === true && (navigator.userActivation?.hasBeenActive ?? false)) {
    tap.classList.add('hidden');
  }
  // Register tap button event listener with resource manager
  const tapClickHandler = async () => {
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({ type: 'telemetry', event: 'tap_start' }),
      );
    } catch (postErr) {
      console.warn("Failed to send 'tap_start' telemetry event:", postErr);
    }
    try {
      await startCamera();
      tap.classList.add('hidden');
    } catch (err) {
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: 'error',
            message: cameraError + (err instanceof Error ? err.message : String(err)),
          }),
        );
      } catch (postErr) {
        console.warn('Failed to send camera error:', postErr);
      }
      return;
    }
  };

  tap.addEventListener('click', tapClickHandler);
  resourceManager.registerEventListener(tap, 'click', tapClickHandler);
  document.body.appendChild(tap);
  try {
    window.ReactNativeWebView?.postMessage?.(
      JSON.stringify({ type: 'telemetry', event: 'dom_ready' }),
    );
  } catch (err) {
    console.warn("Failed to send 'dom_ready' telemetry event:", err);
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDom);
} else {
  initDom();
}

async function createGestureRecognizer() {
  try {
    // Create and initialize the new modular gesture detector
    mainGestureDetector = new GestureDetector(video, overlay);
    await mainGestureDetector.initialize();

    // Set up result callback for processing gesture results
    mainGestureDetector.setResultCallback((results, timestamp) => {
      processGestureResults(results, timestamp);
    });

    // Send telemetry
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({ type: 'telemetry', event: 'recognizer_init', ms: 0 }),
      );
    } catch (err) {
      console.warn('Failed to send "recognizer_init" telemetry event:', err);
    }

    resetGestureChangeState();
  } catch (e) {
    const errorInfo = errorRecoveryManager.getErrorInfo(e as Error, 'gesture_recognizer_initialization');
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: 'error',
          message: recognizerInitFailed + errorInfo.message,
          code: errorInfo.code,
          recoverable: errorInfo.recoverable,
        }),
      );
    } catch (err) {
      console.warn('Failed to send initialization error message:', err);
    }

    // Activate fallback mode on failure
    errorRecoveryManager.activateFallbackMode();
  }
}

async function startCamera() {
  try {
    if (mainGestureDetector) {
      await mainGestureDetector.start();
    } else {
      throw new Error('Gesture detector not initialized');
    }
  } catch (e) {
    console.error('Failed to start camera:', e);
    throw e;
  }
}

let lastVideoTime = -1; // Added for performance optimization
let frameCount = 0;
let lastSentAt = 0;
let lastSentGestureSerialized: string | null = null;
let lastSentScore = 0;
let running = true;
let cleanedUp = false;
type TwoHandGesture = { left: string; right: string };
function isTwoHandGesture(gesture: any): gesture is TwoHandGesture {
  return gesture && typeof gesture === 'object' && 'left' in gesture && 'right' in gesture;
}

function serializeGesture(g: string | TwoHandGesture | null): string | null {
  if (g == null) return null;
  if (typeof g === 'string') return g;
  if (isTwoHandGesture(g)) {
    // Stable, order-preserving representation for change detection only
    return JSON.stringify({ left: g.left, right: g.right });
  }
  return null;
}
function resetGestureChangeState() {
  lastSentGestureSerialized = null;
  lastSentScore = 0;
  lastSentAt = 0;
  // Reset tremor compensation when gesture state resets
  tremorCompensator.clearHistory();
  lastProcessedLandmarks = [];
}
// Amy First: No throttling for communication - process every frame
// Removed TARGET_FPS and MIN_FRAME_TIME to ensure Amy's gestures are never delayed
const FRAME_LATENCY_SAMPLE_INTERVAL = 90; // ~3s @ 30fps (for telemetry only)

// Emergency gesture detection and priority processing
function isEmergencyGesture(gesture: string | null): boolean {
  if (!gesture) return false;
  const lowerGesture = gesture.toLowerCase();
  return EMERGENCY_GESTURES.has(lowerGesture);
}

function shouldProcessEmergencyGesture(gesture: string | null, confidence: number): boolean {
  if (!isEmergencyGesture(gesture)) return false;
  if (confidence < EMERGENCY_CONFIDENCE_THRESHOLD) return false;

  const now = performance.now();
  if (now - lastEmergencyGestureTime < EMERGENCY_COOLDOWN_MS) return false;

  lastEmergencyGestureTime = now;
  return true;
}

function sendEmergencyGesture(gesture: string, confidence: number, landmarks: number[][][], handedArr: string[]) {
  try {
    const payload = {
      type: 'gesture',
      gesture,
      confidence,
      landmarks,
      handednesses: handedArr,
      emergency: true, // Flag for priority processing
      timestamp: performance.now(),
    };
    window.ReactNativeWebView?.postMessage?.(JSON.stringify(payload));
  } catch (err) {
    console.warn('Failed to send emergency gesture:', err);
  }
}
function processGestureResults(results: any, timestamp: number) {
  const frameLatency = Math.round(performance.now() - timestamp);
  frameCount++;
  if (frameCount % FRAME_LATENCY_SAMPLE_INTERVAL === 0) {
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({ type: 'telemetry', event: 'frame_latency', ms: frameLatency }),
      );
    } catch (err) {
      console.warn("Failed to send 'frame_latency' telemetry event:", err);
    }
  }
  let allLandmarks = (results?.landmarks || []).map((hand: any) =>
    hand.map((lm: any) => [lm.x, lm.y, lm.z ?? 0]),
  );

  // Apply tremor compensation
  if (allLandmarks.length > 0) {
    // Check if movement is intentional before smoothing
    const isIntentional = tremorCompensator.isIntentionalMovement(allLandmarks, lastProcessedLandmarks);
    if (isIntentional) {
      allLandmarks = tremorCompensator.smoothLandmarks(allLandmarks);
      lastProcessedLandmarks = JSON.parse(JSON.stringify(allLandmarks));
    } else {
      // Use previous smoothed landmarks to maintain stability
      allLandmarks = lastProcessedLandmarks.length > 0 ? lastProcessedLandmarks : allLandmarks;
    }
  }

  // Apply gesture size normalization
  if (allLandmarks.length > 0) {
    allLandmarks = gestureSizeNormalizer.normalizeHandSize(allLandmarks);
  }

  // Analyze hand stability and provide feedback
  if (allLandmarks.length > 0) {
    const stabilityAnalysis = handStabilityAssistant.analyzeStability(allLandmarks);

    // Send stability feedback periodically (not every frame)
    if (frameCount % 15 === 0) { // Every ~0.5 second at 30fps
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: 'stability_feedback',
            isStable: stabilityAnalysis.isStable,
            stabilityScore: stabilityAnalysis.stabilityScore,
            feedback: stabilityAnalysis.feedback,
            guidePosition: stabilityAnalysis.guidePosition,
          }),
        );
      } catch (err) {
        console.warn('Failed to send stability feedback:', err);
      }
    }
  }

  let outGesture: string | TwoHandGesture | null = null;
  let outScore = 0;
  const perHand: { hand: string; label: string; score: number }[] = [];
  let multiHand = (results?.landmarks?.length ?? 0) >= 2;
  const handedArr = (results?.handednesses || []).map(
    (h) => h?.[0]?.categoryName || 'unknown',
  );

  if (results?.gestures?.length) {
    for (let i = 0; i < results.gestures.length; i++) {
      const handGestures = results.gestures[i] || [];
      const top = handGestures?.[0];
      const handed = handedArr[i] || 'unknown';
      if (top) {
        perHand.push({ hand: handed, label: top.categoryName, score: top.score });
        if (top.score > outScore) {
          outGesture = top.categoryName;
          outScore = top.score;
        }
      }
    }
    if (perHand.length >= 2) {
      let left = perHand.find((h) => /left/i.test(h.hand)) || null;
      let right = perHand.find((h) => /right/i.test(h.hand)) || null;
      if (!left || !right) {
        const others = perHand.filter((h) => h !== left && h !== right);
        if (!left) left = others.shift() || null;
        if (!right) right = others.shift() || null;
      }
      if (left && right) {
        outGesture = { left: left.label, right: right.label };
        // Geometric mean keeps confidence conservative without over-penalizing
        outScore = Math.sqrt(left.score * right.score);
      }
    }
  }

  // ** MLP Gesture Prediction **
  if (window.__mlpPredict) {
    const mlpResult = window.__mlpPredict(
      allLandmarks,
      results?.handednesses ?? [],
    );
    if (mlpResult && mlpResult.score > MLP_CONFIDENCE_THRESHOLD) {
      outGesture = mlpResult.label;
      outScore = mlpResult.score;
    }
  }

  // ** Partial Gesture Completion Analysis **
  // Check for partial completion of common gestures if no full gesture detected
  if ((!outGesture || outScore < 0.5) && allLandmarks.length > 0) {
    const commonGestures = ['thumbs_up', 'open_palm', 'fist', 'point'];

    for (const gestureId of commonGestures) {
      const partialAnalysis = partialGestureDetector.analyzePartialCompletion(allLandmarks, gestureId);

      if (partialAnalysis.isPartial && partialGestureDetector.shouldRecognizePartial(
        partialAnalysis.completion,
        partialAnalysis.confidence
      )) {
        // Use partial gesture if it's better than current result
        if (partialAnalysis.confidence > outScore) {
          outGesture = gestureId;
          outScore = partialAnalysis.confidence;

          // Send partial completion feedback
          if (partialAnalysis.feedback) {
            try {
              window.ReactNativeWebView?.postMessage?.(
                JSON.stringify({
                  type: 'partial_feedback',
                  gesture: gestureId,
                  completion: partialAnalysis.completion,
                  feedback: partialAnalysis.feedback,
                }),
              );
            } catch (err) {
              console.warn('Failed to send partial feedback:', err);
            }
          }
          break; // Use the first good partial match
        }
      }
    }
  }

  // Clean up old partial gesture data periodically
  if (frameCount % 30 === 0) { // Every ~1 second at 30fps
    partialGestureDetector.cleanup();
  }

  // ** Emergency Gesture Priority Processing **
  // Check if this is an emergency gesture that should be processed immediately
  if (shouldProcessEmergencyGesture(outGesture, outScore)) {
    sendEmergencyGesture(outGesture!, outScore, allLandmarks, handedArr);
    // Continue with normal processing
  }

  // Custom gesture logic (preserved for single-hand fallback)
  const firstHand = allLandmarks[0] || [];
  if (
    (!outGesture || outScore < FALLBACK_CONFIDENCE_THRESHOLD) &&
    firstHand.length === 21 &&
    !multiHand
  ) {
    const thumbUp = firstHand[4][1] < firstHand[2][1];
    const indexUp = firstHand[8][1] < firstHand[6][1];
    const middleUp = firstHand[12][1] < firstHand[10][1];
    const ringUp = firstHand[16][1] < firstHand[14][1];
    const pinkyUp = firstHand[20][1] < firstHand[18][1];
    const allUp = indexUp && middleUp && ringUp && pinkyUp;
    const noneUp = !indexUp && !middleUp && !ringUp && !pinkyUp;
    if (thumbUp && !indexUp && !middleUp) {
      outGesture = 'thumbs_up';
      outScore = 0.8;
    } else if (indexUp && !middleUp && !ringUp && !pinkyUp) {
      outGesture = 'point';
      outScore = 0.7;
    } else if (allUp) {
      outGesture = 'open_palm';
      outScore = 0.6;
    } else if (noneUp) {
      outGesture = 'fist';
      outScore = 0.6;
    }
  }

  // Send gesture result if it changed or meets threshold
  const serialized = serializeGesture(outGesture);
  const scoreChanged = Math.abs(outScore - lastSentScore) >= 0.05;
  const gestureChanged = serialized !== lastSentGestureSerialized;
  const shouldSend = (gestureChanged || scoreChanged) && (outScore >= 0.3 || outGesture);

  if (shouldSend) {
    lastSentGestureSerialized = serialized;
    lastSentScore = outScore;
    lastSentAt = performance.now();

    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: 'gesture',
          gesture: outGesture,
          confidence: outScore,
          landmarks: allLandmarks,
          handednesses: handedArr,
          timestamp: timestamp,
        }),
      );
    } catch (err) {
      console.warn('Failed to send gesture message:', err);
    }
  }

  // Draw overlay landmarks and stability guides
  try {
    const ctx = overlay.getContext('2d');
    if (ctx && overlayWidth && overlayHeight) {
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      ctx.save();
      // Draw in CSS pixels while canvas is scaled for HiDPI
      ctx.scale(overlayDpr, overlayDpr);
      // Mirror horizontally to match video when using the front camera
      if (mirrorOverlay) {
        ctx.scale(-1, 1);
        ctx.translate(-overlayWidth, 0);
      }

      // Draw stability guide if needed
      const stabilityStatus = handStabilityAssistant.getStabilityStatus();
      if (!stabilityStatus.isStable && stabilityStatus.score < 0.7) {
        // Draw target circle for hand positioning
        const centerX = overlayWidth / 2;
        const centerY = overlayHeight / 2;
        const radius = Math.min(overlayWidth, overlayHeight) * 0.15;

        ctx.strokeStyle = stabilityStatus.score > 0.3 ? 'rgba(255, 165, 0, 0.8)' : 'rgba(255, 0, 0, 0.8)';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 5]);
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw crosshairs
        ctx.beginPath();
        ctx.moveTo(centerX - radius * 0.7, centerY);
        ctx.lineTo(centerX + radius * 0.7, centerY);
        ctx.moveTo(centerX, centerY - radius * 0.7);
        ctx.lineTo(centerX, centerY + radius * 0.7);
        ctx.stroke();
      }

      // Draw hand landmarks
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0, 255, 180, 0.9)';
      ctx.fillStyle = 'rgba(0, 255, 180, 0.9)';

      for (const hand of allLandmarks) {
        if (!hand || hand.length === 0) continue;

        // Draw connections
        ctx.beginPath();
        let hasMoves = false;
        for (const [a, b] of HAND_CONNECTIONS) {
          const pa = hand[a];
          const pb = hand[b];
          if (!pa || !pb) continue;
          const x1 = pa[0] * overlayWidth;
          const y1 = pa[1] * overlayHeight;
          const x2 = pb[0] * overlayWidth;
          const y2 = pb[1] * overlayHeight;
          if (!hasMoves) {
            ctx.moveTo(x1, y1);
            hasMoves = true;
          } else {
            ctx.moveTo(x1, y1);
          }
          ctx.lineTo(x2, y2);
        }
        if (hasMoves) {
          ctx.stroke();
        }

        // Draw points
        for (const lm of hand) {
          if (!lm || lm.length < 2) continue;
          ctx.beginPath();
          ctx.arc(
            lm[0] * overlayWidth,
            lm[1] * overlayHeight,
            4,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
}

function resizeOverlay() {
  try {
    const rect = video.getBoundingClientRect();
    const w = (rect.width || video.clientWidth || 0) | 0;
    const h = (rect.height || video.clientHeight || 0) | 0;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const sizeChanged = overlayWidth !== w || overlayHeight !== h;
    const dprChanged = dpr !== overlayDpr;
    if (sizeChanged || dprChanged) {
      if (sizeChanged) {
        overlay.style.width = w + 'px';
        overlay.style.height = h + 'px';
      }
      overlay.width = Math.round(w * dpr);
      overlay.height = Math.round(h * dpr);
      overlayWidth = w;
      overlayHeight = h;
      overlayDpr = dpr;
    }
    lastVideoWidth = video.videoWidth;
    lastVideoHeight = video.videoHeight;
  } catch (err) {
    console.warn('Failed to resize overlay:', err);
  }
}

async function startCamera() {
  resetGestureChangeState();
  // Additional reset for tremor compensation
  tremorCompensator.clearHistory();
  lastProcessedLandmarks = [];

  try {
    if (mainGestureDetector) {
      await mainGestureDetector.start();
    } else {
      throw new Error('Gesture detector not initialized');
    }
  } catch (err) {
    const error = err as Error;
    const errorInfo = errorRecoveryManager.getErrorInfo(error, 'camera_initialization');

    // Record failure
    errorRecoveryManager.recordFailure(error);

    const msg = `${error.name}: ${error.message}`;
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: 'error',
          message: cameraError + msg,
          code: errorInfo.code,
          recoverable: errorInfo.recoverable
        }),
      );
    } catch (postErr) {
      console.warn('Failed to send camera error:', postErr);
    }
    throw err;
  }
}

// Start camera only after user interaction unless explicitly allowed
if (window.__autostartCamera === true && (navigator.userActivation?.hasBeenActive ?? false)) {
  startCamera()
    .then(() => {
      document.getElementById('tapToStart')?.classList.add('hidden');
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({ type: 'telemetry', event: 'tap_start_autostart' }),
        );
      } catch (err) {
        console.warn("Failed to send 'tap_start_autostart' telemetry event:", err);
      }
    })
    .catch((err) => {
      console.warn('Camera autostart failed:', err);
      document.getElementById('tapToStart')?.classList.remove('hidden');
    });
}
createGestureRecognizer();
let stopPromise: Promise<void> | null = null;
async function stopCamera() {
  if (stopPromise) return stopPromise;
  stopPromise = (async () => {
    try {
      if (mainGestureDetector) {
        await mainGestureDetector.stop();
      }
    } catch (e) {
      console.warn('Failed to stop gesture detector:', e);
    }
  })().finally(() => {
    stopPromise = null;
  });
  return stopPromise;
}

const onPageHide = () => void cleanup();
const onBeforeUnload = () => void cleanup();
const onVisibilityChange = () => {
  if (document.hidden) {
    running = false;
  } else {
    running = true;
    lastFrameTs = 0;
    resetGestureChangeState();
    // Ensure overlay matches current layout/DPR after tab visibility changes
    try { resizeOverlay(); } catch (e) { console.warn('Resize on visibility change failed:', e); }
  }
};
// Register event listeners with resource manager
resourceManager.registerEventListener(window, 'pagehide', onPageHide);
resourceManager.registerEventListener(window, 'beforeunload', onBeforeUnload);
resourceManager.registerEventListener(document, 'visibilitychange', onVisibilityChange);

window.addEventListener('pagehide', onPageHide);
window.addEventListener('beforeunload', onBeforeUnload);
document.addEventListener('visibilitychange', onVisibilityChange);

async function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  running = false;
  await stopCamera();

  // Additional cleanup for DOM elements
  try {
    const tapEl = document.getElementById('tapToStart');
    if (tapEl) {
      tapEl.remove();
    }
  } catch (e) {
    console.warn("Failed to remove 'tapToStart' element:", e);
  }
  try {
    overlay.remove();
  } catch (e) {
    console.warn("Failed to remove 'overlay' element:", e);
  }
  try {
    video.remove();
  } catch (e) {
    console.warn("Failed to remove 'video' element:", e);
  }
  try {
    window.ReactNativeWebView?.postMessage?.(
      JSON.stringify({ type: 'telemetry', event: 'cleanup_done' }),
    );
  } catch (e) {
    console.warn("Failed to send 'cleanup_done' telemetry event:", e);
  }
}
window.__cleanupGestureDetector = cleanup;
