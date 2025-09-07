/**
 * Bundled into app/assets/gestureDetector.js for the WebView.
 * Run `npm run build:webview --prefix app` to regenerate.
 */
import { unzipSync, unzip } from 'fflate';
import { installMlp } from '../src/webview/installMlp';
import { HAND_CONNECTIONS } from '../src/constants/hand';
import type {
  GestureRecognizerLike,
  TwoHandGesture
} from './types/MediaPipeTypes';

// Import new modular components
import { GestureDetector } from './core/GestureDetector';
import { ResourceManager } from './utils/ResourceManager';
import { loadConfig } from './config/GestureConfig';
import { GestureSizeNormalizer, PartialGestureDetector, TremorCompensator } from './gestureProcessing';

// Import celebration and feedback systems
import { CelebrationSystem } from './utils/CelebrationSystem';
import { FeedbackSystem } from './utils/FeedbackSystem';

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

// Enhanced Error Recovery Manager for robust error handling
class ErrorRecoveryManager {
  private failureCount = 0;
  private lastFailureTime = 0;
  private circuitBreakerOpen = false;
  private fallbackMode = false;
  private recoveryAttempts = new Map<string, number>();
  private lastRecoveryTime = 0;
  private emergencyMode = false;

  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 30000; // 30 seconds
  private readonly FAILURE_WINDOW = 60000; // 1 minute
  private readonly MAX_RECOVERY_ATTEMPTS = 3;
  private readonly RECOVERY_COOLDOWN = 5000; // 5 seconds between recovery attempts

  getErrorInfo(error: Error, context: string): {
    message: string;
    code: string;
    recoverable: boolean;
    severity: 'low' | 'medium' | 'high' | 'critical';
    suggestedAction: string;
    userMessage: string;
  } {
    const errorMessage = error.message.toLowerCase();

    // Emergency gesture errors - highest priority
    if (context.includes('emergency') || errorMessage.includes('emergency')) {
      return {
        message: 'Emergency gesture detection failed',
        code: 'EMERGENCY_ERROR',
        recoverable: true,
        severity: 'critical',
        suggestedAction: 'immediate_retry',
        userMessage: 'Notfall-Erkennung wird wiederhergestellt...'
      };
    }

    // Network-related errors
    if (errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('timeout')) {
      return {
        message: 'Network connectivity issue detected',
        code: 'NETWORK_ERROR',
        recoverable: true,
        severity: 'medium',
        suggestedAction: 'retry_with_backoff',
        userMessage: 'Verbindungsproblem erkannt, versuche Wiederherstellung...'
      };
    }

    // Camera-related errors
    if (errorMessage.includes('camera') || errorMessage.includes('media') || errorMessage.includes('permission')) {
      return {
        message: 'Camera access issue detected',
        code: 'CAMERA_ERROR',
        recoverable: true,
        severity: 'high',
        suggestedAction: 'request_permission',
        userMessage: 'Kamera-Zugriff wird überprüft...'
      };
    }

    // MediaPipe-related errors
    if (errorMessage.includes('mediapipe') || errorMessage.includes('wasm') || errorMessage.includes('webgl')) {
      return {
        message: 'Gesture recognition system issue detected',
        code: 'MEDIAPIPE_ERROR',
        recoverable: true,
        severity: 'medium',
        suggestedAction: 'fallback_mode',
        userMessage: 'Gestenerkennung wird neu gestartet...'
      };
    }

    // Memory-related errors
    if (errorMessage.includes('memory') || errorMessage.includes('out of memory')) {
      return {
        message: 'Memory issue detected',
        code: 'MEMORY_ERROR',
        recoverable: true,
        severity: 'high',
        suggestedAction: 'cleanup_resources',
        userMessage: 'Speicher wird optimiert...'
      };
    }

    // Performance-related errors
    if (errorMessage.includes('performance') || errorMessage.includes('slow') || errorMessage.includes('timeout')) {
      return {
        message: 'Performance issue detected',
        code: 'PERFORMANCE_ERROR',
        recoverable: true,
        severity: 'low',
        suggestedAction: 'reduce_quality',
        userMessage: 'Leistung wird angepasst...'
      };
    }

    // Generic error
    return {
      message: `System issue detected during ${context}`,
      code: 'GENERIC_ERROR',
      recoverable: false,
      severity: 'medium',
      suggestedAction: 'log_and_continue',
      userMessage: 'System wird überprüft...'
    };
  }

  recordFailure(error: Error, context: string): boolean {
    const now = Date.now();
    const errorInfo = this.getErrorInfo(error, context);

    // Track recovery attempts for this error type
    const recoveryKey = `${errorInfo.code}_${context}`;
    const attempts = this.recoveryAttempts.get(recoveryKey) || 0;

    if (attempts >= this.MAX_RECOVERY_ATTEMPTS) {
      console.warn(`Max recovery attempts reached for ${recoveryKey}`);
      return false;
    }

    // Reset failure count if outside the failure window
    if (now - this.lastFailureTime > this.FAILURE_WINDOW) {
      this.failureCount = 0;
      this.recoveryAttempts.clear();
    }

    this.failureCount++;
    this.lastFailureTime = now;
    this.recoveryAttempts.set(recoveryKey, attempts + 1);

    // Open circuit breaker if threshold exceeded
    if (this.failureCount >= this.CIRCUIT_BREAKER_THRESHOLD) {
      this.circuitBreakerOpen = true;
      console.warn('Circuit breaker opened due to repeated failures');
      this.activateEmergencyMode();
      return false;
    }

    return true; // Should retry
  }

  isCircuitBreakerOpen(): boolean {
    // Auto-close circuit breaker after timeout
    if (this.circuitBreakerOpen && Date.now() - this.lastFailureTime > this.CIRCUIT_BREAKER_TIMEOUT) {
      this.circuitBreakerOpen = false;
      this.failureCount = 0;
      this.recoveryAttempts.clear();
      console.info('Circuit breaker auto-closed');
      this.deactivateEmergencyMode();
    }

    return this.circuitBreakerOpen;
  }

  activateFallbackMode(): void {
    if (!this.fallbackMode) {
      this.fallbackMode = true;
      console.warn('Activating fallback gesture detection mode');

      // Notify React Native about fallback mode
      this.sendTelemetryEvent('fallback_mode_activated', {
        timestamp: Date.now(),
        reason: 'error_recovery'
      });
    }
  }

  activateEmergencyMode(): void {
    if (!this.emergencyMode) {
      this.emergencyMode = true;
      console.warn('🚨 EMERGENCY MODE ACTIVATED - Critical gesture detection only');

      this.sendTelemetryEvent('emergency_mode_activated', {
        timestamp: Date.now(),
        reason: 'circuit_breaker_opened'
      });
    }
  }

  deactivateEmergencyMode(): void {
    if (this.emergencyMode) {
      this.emergencyMode = false;
      console.info('✅ Emergency mode deactivated - Full functionality restored');

      this.sendTelemetryEvent('emergency_mode_deactivated', {
        timestamp: Date.now()
      });
    }
  }

  isInFallbackMode(): boolean {
    return this.fallbackMode;
  }

  isInEmergencyMode(): boolean {
    return this.emergencyMode;
  }

  canAttemptRecovery(context: string): boolean {
    const now = Date.now();
    if (now - this.lastRecoveryTime < this.RECOVERY_COOLDOWN) {
      return false; // Too soon since last recovery attempt
    }

    if (this.isCircuitBreakerOpen()) {
      return false; // Circuit breaker is open
    }

    return true;
  }

  recordSuccessfulRecovery(context: string): void {
    this.lastRecoveryTime = Date.now();
    const recoveryKey = `recovery_${context}`;
    this.recoveryAttempts.delete(recoveryKey);

    this.sendTelemetryEvent('recovery_successful', {
      context,
      timestamp: Date.now()
    });
  }

  private sendTelemetryEvent(event: string, data: any = {}): void {
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: 'telemetry',
          event,
          data
        })
      );
    } catch (err) {
      console.warn(`Failed to send telemetry event ${event}:`, err);
    }
  }

  reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.circuitBreakerOpen = false;
    this.fallbackMode = false;
    this.emergencyMode = false;
    this.recoveryAttempts.clear();
    this.lastRecoveryTime = 0;
  }

  getHealthStatus(): {
    healthy: boolean;
    fallbackActive: boolean;
    emergencyActive: boolean;
    failureCount: number;
    lastFailure: number;
    circuitBreakerOpen: boolean;
  } {
    return {
      healthy: !this.circuitBreakerOpen && !this.emergencyMode,
      fallbackActive: this.fallbackMode,
      emergencyActive: this.emergencyMode,
      failureCount: this.failureCount,
      lastFailure: this.lastFailureTime,
      circuitBreakerOpen: this.circuitBreakerOpen
    };
  }
}

const errorRecoveryManager = new ErrorRecoveryManager();

// Fallback Gesture Detection System - Amy First
class FallbackGestureDetector {
  private lastLandmarks: number[][][] | null = null;
  private gestureHistory: Array<{gesture: string; confidence: number; timestamp: number}> = [];
  private readonly HISTORY_SIZE = 5;
  private ruleBasedConfidence = 0.0;

  /**
   * Simple rule-based gesture detection as fallback
   */
  detectGesture(landmarks: number[][][]): {
    gesture: string;
    confidence: number;
    isFallback: boolean;
    feedback?: string;
  } {
    if (!landmarks || landmarks.length === 0) {
      return { gesture: '', confidence: 0, isFallback: true };
    }

    this.lastLandmarks = landmarks;

    // Basic gesture detection using simple heuristics
    const gesture = this.detectBasicGesture(landmarks[0]); // Use first hand
    const confidence = this.calculateRuleBasedConfidence(landmarks[0], gesture);

    // Store in history for smoothing
    this.gestureHistory.push({
      gesture,
      confidence,
      timestamp: Date.now()
    });

    if (this.gestureHistory.length > this.HISTORY_SIZE) {
      this.gestureHistory.shift();
    }

    // Smooth confidence over recent detections
    const smoothedConfidence = this.smoothConfidence();

    return {
      gesture,
      confidence: smoothedConfidence,
      isFallback: true,
      feedback: this.getGestureFeedback(gesture, smoothedConfidence)
    };
  }

  private detectBasicGesture(hand: number[][]): string {
    if (!hand || hand.length < 21) return '';

    // Simple finger counting for basic gestures
    const fingerTips = [8, 12, 16, 20]; // Index, middle, ring, pinky tips
    const fingerJoints = [6, 10, 14, 18]; // Corresponding joints
    const thumbTip = hand[4];
    const thumbJoint = hand[3];

    let extendedFingers = 0;

    // Count extended fingers
    for (let i = 0; i < fingerTips.length; i++) {
      if (hand[fingerTips[i]][1] < hand[fingerJoints[i]][1]) {
        extendedFingers++;
      }
    }

    // Check thumb
    const thumbExtended = thumbTip[1] < thumbJoint[1];

    // Basic gesture classification
    if (extendedFingers === 0 && !thumbExtended) {
      return 'fist';
    } else if (extendedFingers === 1 && !thumbExtended) {
      return 'point';
    } else if (extendedFingers === 2 && !thumbExtended) {
      return 'peace';
    } else if (extendedFingers >= 3 && thumbExtended) {
      return 'open_palm';
    } else if (extendedFingers === 0 && thumbExtended) {
      return 'thumbs_up';
    }

    return 'unknown';
  }

  private calculateRuleBasedConfidence(hand: number[][], gesture: string): number {
    if (!hand || gesture === 'unknown') return 0.3;

    // Simple confidence based on gesture clarity
    let confidence = 0.5;

    // Add confidence based on hand stability (compare with previous frame)
    if (this.lastLandmarks && this.lastLandmarks[0]) {
      const movement = this.calculateMovement(this.lastLandmarks[0], hand);
      if (movement < 0.05) confidence += 0.2; // Stable hand = higher confidence
    }

    // Add confidence based on gesture-specific rules
    switch (gesture) {
      case 'fist':
        confidence += this.checkFistClarity(hand) ? 0.2 : -0.1;
        break;
      case 'point':
        confidence += this.checkPointClarity(hand) ? 0.2 : -0.1;
        break;
      case 'thumbs_up':
        confidence += this.checkThumbsUpClarity(hand) ? 0.2 : -0.1;
        break;
    }

    return Math.max(0.1, Math.min(0.8, confidence));
  }

  private checkFistClarity(hand: number[][]): boolean {
    const fingerTips = [8, 12, 16, 20];
    const fingerJoints = [6, 10, 14, 18];
    let curledFingers = 0;

    for (let i = 0; i < fingerTips.length; i++) {
      if (hand[fingerTips[i]][1] > hand[fingerJoints[i]][1]) {
        curledFingers++;
      }
    }

    return curledFingers >= 3; // At least 3 fingers curled
  }

  private checkPointClarity(hand: number[][]): boolean {
    const indexExtended = hand[8][1] < hand[6][1];
    const otherFingersCurled =
      hand[12][1] > hand[10][1] && // Middle
      hand[16][1] > hand[14][1] && // Ring
      hand[20][1] > hand[18][1];   // Pinky

    return indexExtended && otherFingersCurled;
  }

  private checkThumbsUpClarity(hand: number[][]): boolean {
    const thumbExtended = hand[4][1] < hand[3][1];
    const otherFingersCurled =
      hand[8][1] > hand[6][1] &&   // Index
      hand[12][1] > hand[10][1] && // Middle
      hand[16][1] > hand[14][1] && // Ring
      hand[20][1] > hand[18][1];   // Pinky

    return thumbExtended && otherFingersCurled;
  }

  private calculateMovement(prevHand: number[][], currHand: number[][]): number {
    let totalMovement = 0;
    let points = 0;

    for (let i = 0; i < Math.min(prevHand.length, currHand.length); i++) {
      if (prevHand[i] && currHand[i]) {
        const dx = prevHand[i][0] - currHand[i][0];
        const dy = prevHand[i][1] - currHand[i][1];
        totalMovement += Math.sqrt(dx * dx + dy * dy);
        points++;
      }
    }

    return points > 0 ? totalMovement / points : 0;
  }

  private smoothConfidence(): number {
    if (this.gestureHistory.length === 0) return 0;

    const recent = this.gestureHistory.slice(-3); // Last 3 detections
    const avgConfidence = recent.reduce((sum, h) => sum + h.confidence, 0) / recent.length;

    // Weight recent detections more heavily
    return avgConfidence * 0.8 + (recent[recent.length - 1]?.confidence || 0) * 0.2;
  }

  private getGestureFeedback(gesture: string, confidence: number): string {
    if (confidence < 0.4) {
      return 'Versuch es nochmal, halte deine Hand ruhig';
    }

    switch (gesture) {
      case 'fist':
        return 'Faust erkannt!';
      case 'point':
        return 'Zeigefinger erkannt!';
      case 'thumbs_up':
        return 'Daumen hoch erkannt!';
      case 'open_palm':
        return 'Offene Hand erkannt!';
      default:
        return 'Geste erkannt!';
    }
  }

  reset(): void {
    this.lastLandmarks = null;
    this.gestureHistory = [];
  }
}

const fallbackGestureDetector = new FallbackGestureDetector();

// Configure gesture size tolerance (will be set after instantiation)

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

// Enhanced Emergency Gesture System - Amy First Priority
class EmergencyGestureSystem {
  private readonly EMERGENCY_GESTURES = new Set([
    'hilfe', 'help', 'emergency', 'stop', 'danger',
    'notfall', 'gefahr', 'au', 'schmerz', 'angst'
  ]);
  private readonly EMERGENCY_CONFIDENCE_THRESHOLD = 0.25; // Very low threshold for emergencies
  private lastEmergencyGestureTime = 0;
  private readonly EMERGENCY_COOLDOWN_MS = 500; // Quick response for repeated emergencies
  private emergencyHistory: Array<{gesture: string; timestamp: number; confidence: number}> = [];
  private readonly MAX_HISTORY = 10;

  /**
   * Check if gesture is an emergency and should be prioritized
   */
  isEmergencyGesture(gesture: string, confidence: number): boolean {
    if (!this.EMERGENCY_GESTURES.has(gesture.toLowerCase())) {
      return false;
    }

    // Emergency gestures bypass normal confidence thresholds
    return confidence >= this.EMERGENCY_CONFIDENCE_THRESHOLD;
  }

  /**
   * Process emergency gesture with priority handling
   */
  processEmergencyGesture(gesture: string, confidence: number, landmarks: number[][][]): {
    shouldProcess: boolean;
    priority: 'critical' | 'high' | 'normal';
    cooldownRemaining: number;
    feedback: string;
  } {
    const now = Date.now();
    const timeSinceLastEmergency = now - this.lastEmergencyGestureTime;

    // Track emergency history
    this.emergencyHistory.push({
      gesture,
      timestamp: now,
      confidence
    });

    if (this.emergencyHistory.length > this.MAX_HISTORY) {
      this.emergencyHistory.shift();
    }

    if (!this.isEmergencyGesture(gesture, confidence)) {
      return {
        shouldProcess: false,
        priority: 'normal',
        cooldownRemaining: 0,
        feedback: ''
      };
    }

    // Check cooldown to prevent spam
    if (timeSinceLastEmergency < this.EMERGENCY_COOLDOWN_MS) {
      return {
        shouldProcess: false,
        priority: 'critical',
        cooldownRemaining: this.EMERGENCY_COOLDOWN_MS - timeSinceLastEmergency,
        feedback: 'Notfall-Geste erkannt, wird verarbeitet...'
      };
    }

    // Process emergency gesture
    this.lastEmergencyGestureTime = now;

    // Send emergency telemetry
    this.sendEmergencyTelemetry(gesture, confidence);

    return {
      shouldProcess: true,
      priority: 'critical',
      cooldownRemaining: 0,
      feedback: this.getEmergencyFeedback(gesture)
    };
  }

  /**
   * Get appropriate feedback for emergency gesture
   */
  private getEmergencyFeedback(gesture: string): string {
    const feedbackMap: Record<string, string> = {
      'hilfe': '🆘 Hilfe wird gerufen!',
      'help': '🆘 Help is being called!',
      'emergency': '🚨 Notfall erkannt!',
      'stop': '⏹️ Stop-Signal erkannt!',
      'danger': '⚠️ Gefahr erkannt!',
      'notfall': '🚨 Notfall-Situation!',
      'gefahr': '⚠️ Gefahr-Signal!',
      'au': '😣 Schmerzsignal erkannt!',
      'schmerz': '😣 Pain signal detected!',
      'angst': '😨 Angstsignal erkannt!'
    };

    return feedbackMap[gesture.toLowerCase()] || '🚨 Notfall-Geste erkannt!';
  }

  /**
   * Send emergency telemetry to React Native
   */
  private sendEmergencyTelemetry(gesture: string, confidence: number): void {
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: 'emergency_gesture',
          gesture,
          confidence,
          timestamp: Date.now(),
          systemHealth: errorRecoveryManager.getHealthStatus()
        })
      );
    } catch (err) {
      console.error('Failed to send emergency telemetry:', err);
    }
  }

  /**
   * Check if system should enter emergency-only mode
   */
  shouldEnterEmergencyMode(): boolean {
    const recentEmergencies = this.emergencyHistory.filter(
      h => Date.now() - h.timestamp < 30000 // Last 30 seconds
    );

    // Enter emergency mode if 3+ emergencies in 30 seconds
    return recentEmergencies.length >= 3;
  }

  /**
   * Get emergency system status
   */
  getStatus(): {
    activeEmergencies: number;
    lastEmergencyTime: number;
    emergencyModeRecommended: boolean;
  } {
    const recentEmergencies = this.emergencyHistory.filter(
      h => Date.now() - h.timestamp < 60000 // Last minute
    );

    return {
      activeEmergencies: recentEmergencies.length,
      lastEmergencyTime: this.lastEmergencyGestureTime,
      emergencyModeRecommended: this.shouldEnterEmergencyMode()
    };
  }

  /**
   * Reset emergency system (for testing or recovery)
   */
  reset(): void {
    this.emergencyHistory = [];
    this.lastEmergencyGestureTime = 0;
  }
}

const emergencyGestureSystem = new EmergencyGestureSystem();

// Battery monitoring will be initialized after class declaration

// Amy First: Battery monitoring and emergency mode activation
class BatteryMonitor {
  private batteryLevel = 1.0;
  private isMonitoring = false;
  private emergencyMode = false;
  private lastBatteryCheck = 0;
  private readonly BATTERY_CHECK_INTERVAL = 30000; // Check every 30 seconds
  private readonly EMERGENCY_BATTERY_THRESHOLD = 0.05; // 5% battery triggers emergency mode

  /**
   * Start battery monitoring for emergency mode activation
   */
  startMonitoring(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.checkBatteryLevel();

    // Set up periodic battery checks
    setInterval(() => {
      this.checkBatteryLevel();
    }, this.BATTERY_CHECK_INTERVAL);
  }

  /**
   * Check current battery level and activate emergency mode if critical
   */
  private async checkBatteryLevel(): Promise<void> {
    try {
      // Use navigator.getBattery() if available (older API)
      if ('getBattery' in navigator) {
        const battery = await (navigator as any).getBattery();
        this.batteryLevel = battery.level;
        this.handleBatteryLevel(this.batteryLevel);
      } else if ('battery' in navigator) {
        // Fallback for some mobile browsers
        this.batteryLevel = (navigator as any).battery.level;
        this.handleBatteryLevel(this.batteryLevel);
      } else {
        // Fallback: assume adequate battery if we can't detect
        this.batteryLevel = 0.5;
      }
    } catch (error) {
      console.warn('Battery monitoring failed:', error);
      // Assume adequate battery on monitoring failure
      this.batteryLevel = 0.5;
    }

    this.lastBatteryCheck = Date.now();
  }

  /**
   * Handle battery level changes and emergency mode activation
   */
  private handleBatteryLevel(level: number): void {
    const wasEmergency = this.emergencyMode;
    this.emergencyMode = level <= this.EMERGENCY_BATTERY_THRESHOLD;

    if (this.emergencyMode && !wasEmergency) {
      console.warn(`🔋 CRITICAL BATTERY: ${Math.round(level * 100)}% - Activating emergency mode`);
      this.activateEmergencyMode();
    } else if (!this.emergencyMode && wasEmergency) {
      console.log(`🔋 Battery recovered: ${Math.round(level * 100)}% - Deactivating emergency mode`);
      this.deactivateEmergencyMode();
    }
  }

  /**
   * Activate emergency mode for critical battery situations
   */
  private activateEmergencyMode(): void {
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: 'emergency_mode_activated',
          reason: 'critical_battery',
          batteryLevel: this.batteryLevel,
          timestamp: Date.now()
        })
      );
    } catch (error) {
      console.error('Failed to send emergency mode activation:', error);
    }
  }

  /**
   * Deactivate emergency mode when battery recovers
   */
  private deactivateEmergencyMode(): void {
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: 'emergency_mode_deactivated',
          reason: 'battery_recovered',
          batteryLevel: this.batteryLevel,
          timestamp: Date.now()
        })
      );
    } catch (error) {
      console.error('Failed to send emergency mode deactivation:', error);
    }
  }

  /**
   * Get current battery status
   */
  getStatus(): {
    level: number;
    emergencyMode: boolean;
    lastCheck: number;
  } {
    return {
      level: this.batteryLevel,
      emergencyMode: this.emergencyMode,
      lastCheck: this.lastBatteryCheck
    };
  }

  /**
   * Force emergency mode for testing
   */
  forceEmergencyMode(): void {
    this.emergencyMode = true;
    this.activateEmergencyMode();
  }

  /**
   * Reset emergency mode for testing
   */
  resetEmergencyMode(): void {
    this.emergencyMode = false;
    this.deactivateEmergencyMode();
  }
}

const batteryMonitor = new BatteryMonitor();

const partialGestureDetector = new PartialGestureDetector();

// Initialize systems after all declarations
batteryMonitor.startMonitoring();
gestureSizeNormalizer.setTolerance(GESTURE_SIZE_TOLERANCE);

// Add missing global references for tests
(window as any).emergencyGestureSystem = emergencyGestureSystem;
(window as any).errorRecoveryManager = errorRecoveryManager;
(window as any).batteryMonitor = batteryMonitor;
(window as any).handStabilityAssistant = new HandStabilityAssistant();
(window as any).partialGestureDetector = partialGestureDetector;
(window as any).tremorCompensator = new TremorCompensator();
(window as any).gestureSizeNormalizer = gestureSizeNormalizer;
(window as any).celebrationSystem = new CelebrationSystem();
(window as any).feedbackSystem = new FeedbackSystem();

// Add missing window properties for tests
(window as any).__mlpPredict = undefined;
(window as any).__modelUpdateInProgress = false;
(window as any).__activeRecognitionSession = false;

// GestureSizeNormalizer is imported from gestureProcessing.ts

// PartialGestureDetector and TremorCompensator are imported from gestureProcessing.ts

// CelebrationSystem and FeedbackSystem are imported from utils

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

const tremorCompensator = new TremorCompensator();
let lastProcessedLandmarks: number[][][] = [];



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
  try {
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

  // ** Emergency Mode Handling - Amy First Priority **
  // In emergency mode (critical battery or system failure), prioritize emergency gestures
  const batteryStatus = batteryMonitor.getStatus();
  if (batteryStatus.emergencyMode) {
    console.warn('🔋 EMERGENCY MODE ACTIVE: Prioritizing emergency gestures');

    // If in emergency mode and no emergency gesture detected, try fallback detection
    if (!shouldProcessEmergencyGesture(outGesture, outScore)) {
      const emergencyFallback = emergencyGestureSystem.getStatus();
      if (emergencyFallback.emergencyModeRecommended) {
        // Force emergency mode processing
        console.warn('🚨 EMERGENCY FALLBACK: Activating emergency-only processing');
        // Emergency gestures will be processed even with lower confidence
      }
    }
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

  // ** ERROR RECOVERY & FALLBACK PROCESSING **
  // If main gesture detection failed or confidence is low, try fallback system
  let finalGesture = outGesture;
  let finalScore = outScore;
  let isUsingFallback = false;

  if (errorRecoveryManager.isInFallbackMode() ||
      (!outGesture || outScore < FALLBACK_CONFIDENCE_THRESHOLD)) {

    try {
      const fallbackResult = fallbackGestureDetector.detectGesture(allLandmarks);

      // Use fallback if it's better than current result or if we're in fallback mode
      if (errorRecoveryManager.isInFallbackMode() ||
          (fallbackResult.confidence > outScore && fallbackResult.gesture)) {

        finalGesture = fallbackResult.gesture;
        finalScore = fallbackResult.confidence;
        isUsingFallback = true;

        // Send fallback feedback if available
        if (fallbackResult.feedback) {
          try {
            window.ReactNativeWebView?.postMessage?.(
              JSON.stringify({
                type: 'fallback_feedback',
                gesture: finalGesture,
                confidence: finalScore,
                feedback: fallbackResult.feedback,
                timestamp: timestamp,
              })
            );
          } catch (err) {
            console.warn('Failed to send fallback feedback:', err);
          }
        }
      }
    } catch (fallbackError) {
      console.warn('Fallback gesture detection failed:', fallbackError);
      // Continue with original result if fallback fails
    }
  }

  // ** EMERGENCY GESTURE PROCESSING WITH PRIORITY **
  // Check for emergency gestures that should bypass normal processing
  if (finalGesture && typeof finalGesture === 'string') {
    const emergencyResult = emergencyGestureSystem.processEmergencyGesture(
      finalGesture,
      finalScore,
      allLandmarks
    );

    if (emergencyResult.shouldProcess) {
      // Emergency gestures get immediate processing with high priority
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: 'emergency_gesture_detected',
            gesture: finalGesture,
            confidence: finalScore,
            feedback: emergencyResult.feedback,
            priority: emergencyResult.priority,
            timestamp: timestamp,
            systemStatus: errorRecoveryManager.getHealthStatus()
          })
        );
      } catch (err) {
        console.error('Failed to send emergency gesture message:', err);
      }

      // Emergency gestures bypass normal throttling
      lastSentGestureSerialized = '';
      lastSentScore = 0;
    }

    // Check if we should enter emergency mode
    if (emergencyGestureSystem.shouldEnterEmergencyMode() &&
        !errorRecoveryManager.isInEmergencyMode()) {
      errorRecoveryManager.activateEmergencyMode();
    }
  }

  // Send gesture result if it changed or meets threshold
  const serialized = serializeGesture(finalGesture);
  const scoreChanged = Math.abs(finalScore - lastSentScore) >= 0.05;
  const gestureChanged = serialized !== lastSentGestureSerialized;
  const shouldSend = (gestureChanged || scoreChanged) &&
                     (finalScore >= 0.3 || finalGesture) &&
                     !errorRecoveryManager.isCircuitBreakerOpen();

  if (shouldSend) {
    lastSentGestureSerialized = serialized;
    lastSentScore = finalScore;
    lastSentAt = performance.now();

    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: 'gesture',
          gesture: finalGesture,
          confidence: finalScore,
          landmarks: allLandmarks,
          handednesses: handedArr,
          timestamp: timestamp,
          isFallback: isUsingFallback,
          systemHealth: errorRecoveryManager.getHealthStatus()
        }),
      );
    } catch (err) {
      console.warn('Failed to send gesture message:', err);

      // If sending fails, record it as a failure
      errorRecoveryManager.recordFailure(err, 'gesture_message_send');
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
    }
  } catch (err) {
    console.warn('Failed to draw overlay:', err);
  }

  } catch (processingError) {
    // ** COMPREHENSIVE ERROR RECOVERY FOR GESTURE PROCESSING **
    console.error('Gesture processing failed:', processingError);

    const error = processingError as Error;
    const errorInfo = errorRecoveryManager.getErrorInfo(error, 'gesture_processing');

    // Record the failure for circuit breaker logic
    const shouldRetry = errorRecoveryManager.recordFailure(error, 'gesture_processing');

    // Send error notification to React Native
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: 'gesture_processing_error',
          message: errorInfo.userMessage,
          code: errorInfo.code,
          recoverable: errorInfo.recoverable,
          severity: errorInfo.severity,
          suggestedAction: errorInfo.suggestedAction,
          systemHealth: errorRecoveryManager.getHealthStatus(),
          timestamp: timestamp
        })
      );
    } catch (msgError) {
      console.error('Failed to send error message to React Native:', msgError);
    }

    // Activate appropriate recovery mode based on error type
    if (errorInfo.severity === 'critical') {
      errorRecoveryManager.activateEmergencyMode();
    } else if (errorInfo.recoverable && shouldRetry) {
      errorRecoveryManager.activateFallbackMode();
    }

    // Try fallback gesture detection if we have landmarks
    if (results?.landmarks && errorRecoveryManager.canAttemptRecovery('gesture_processing')) {
      try {
        const fallbackResult = fallbackGestureDetector.detectGesture(
          results.landmarks.map((hand: any) =>
            hand.map((lm: any) => [lm.x, lm.y, lm.z ?? 0])
          )
        );

        if (fallbackResult.gesture && fallbackResult.confidence > 0.2) {
          // Send fallback result
          window.ReactNativeWebView?.postMessage?.(
            JSON.stringify({
              type: 'gesture',
              gesture: fallbackResult.gesture,
              confidence: fallbackResult.confidence,
              isFallback: true,
              errorRecovery: true,
              timestamp: timestamp,
              systemHealth: errorRecoveryManager.getHealthStatus()
            })
          );

          errorRecoveryManager.recordSuccessfulRecovery('gesture_processing');
        }
      } catch (fallbackError) {
        console.warn('Fallback detection also failed:', fallbackError);
      }
    }

    // If this is a critical error and we have emergency mode, ensure emergency gestures still work
    if (errorRecoveryManager.isInEmergencyMode()) {
      console.warn('System in emergency mode - prioritizing critical gesture detection');
    }
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
