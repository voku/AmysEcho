/**
 * Generated from app/webview/gestureDetector.ts
 * Run `npm run build:webview --prefix app` to regenerate.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var _a, _b, _c, _d, _e, _f, _g;
/**
 * Bundled into app/assets/gestureDetector.js for the WebView.
 * Run `npm run build:webview --prefix app` to regenerate.
 */
import { unzipSync, unzip } from 'fflate';
import { installMlp } from '../src/webview/installMlp';
// Import new modular components
import { GestureDetector } from './core/GestureDetector';
import { ResourceManager } from './utils/ResourceManager';
import { loadConfig } from './config/GestureConfig';
import { GestureSizeNormalizer, PartialGestureDetector, TremorCompensator } from './gestureProcessing';
// Import celebration and feedback systems
import { CelebrationSystem } from './utils/CelebrationSystem';
import { FeedbackSystem } from './utils/FeedbackSystem';
// Import personalized threshold manager
import { PersonalizedThresholdManager } from './utils/PersonalizedThresholdManager';
// Import gesture combination manager
import { GestureCombinationManager } from './utils/GestureCombinationManager';
// Import haptic feedback manager
import { HapticFeedbackManager } from './utils/HapticFeedbackManager';
// Import gesture replay manager
import { GestureReplayManager } from './utils/GestureReplayManager';
// Import navigation gesture manager
import { NavigationGestureManager } from './utils/NavigationGestureManager';
// Import visual correction manager
import { VisualCorrectionManager } from './utils/VisualCorrectionManager';
// Import gesture undo manager
import { GestureUndoManager } from './utils/GestureUndoManager';
// Import enhanced context-aware recognizer
import { EnhancedContextAwareRecognizer } from './utils/EnhancedContextAwareRecognizer';
// Import adaptive practice manager
import { AdaptivePracticeManager } from './utils/AdaptivePracticeManager';
// Import positive telemetry manager
import { PositiveTelemetryManager } from './utils/PositiveTelemetryManager';
// Frame capture configuration
let frameCaptureEnabled = false;
let frameCaptureInterval = 5; // Capture every 5th frame
let frameCounter = 0;
let lastCapturedFrame = null;
// Forward script errors to React Native for easier debugging
const onError = (e) => {
    var _a, _b, _c;
    try {
        // Send a generic child-friendly error message instead of technical details
        (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({
            type: 'error',
            message: 'gesture_processing_error', // Generic identifier for React Native to handle
            // Keep technical details for logging but don't send to UI
            _technical: {
                message: e.message,
                file: e.filename,
                line: e.lineno,
                col: e.colno,
                stack: ((_c = e.error) === null || _c === void 0 ? void 0 : _c.stack) || null,
            },
        }));
    }
    catch (err) {
        console.warn('Failed to forward script error event:', err);
    }
};
window.addEventListener('error', onError);
const onUnhandledRejection = (e) => {
    var _a, _b, _c, _d, _e, _f;
    try {
        // Send a generic child-friendly error message instead of technical details
        (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({
            type: 'error',
            message: 'gesture_processing_error', // Generic identifier for React Native to handle
            // Keep technical details for logging but don't send to UI
            _technical: {
                message: String((_e = (_d = (_c = e === null || e === void 0 ? void 0 : e.reason) === null || _c === void 0 ? void 0 : _c.message) !== null && _d !== void 0 ? _d : e === null || e === void 0 ? void 0 : e.reason) !== null && _e !== void 0 ? _e : 'unhandledrejection'),
                stack: ((_f = e.reason) === null || _f === void 0 ? void 0 : _f.stack) || null,
            },
        }));
    }
    catch (err) {
        console.warn('Failed to forward unhandledrejection:', err);
    }
};
window.addEventListener('unhandledrejection', onUnhandledRejection);
// Expose fflate for compatibility with older WebView bundles
window.fflate = { unzip, unzipSync };
installMlp();
// Import modular error recovery system
import { ErrorRecoveryManager } from './utils/ErrorRecoveryManager';
const errorRecoveryManager = new ErrorRecoveryManager();
// Fallback Gesture Detection System - Amy First
class FallbackGestureDetector {
    constructor() {
        this.lastLandmarks = null;
        this.gestureHistory = [];
        this.HISTORY_SIZE = 5;
        this.ruleBasedConfidence = 0.0;
    }
    /**
     * Simple rule-based gesture detection as fallback
     */
    detectGesture(landmarks) {
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
    detectBasicGesture(hand) {
        if (!hand || hand.length < 21)
            return '';
        // Enhanced finger detection with better accuracy for Amy's gestures
        const fingerTips = [8, 12, 16, 20]; // Index, middle, ring, pinky tips
        const fingerJoints = [6, 10, 14, 18]; // Corresponding joints
        const thumbTip = hand[4];
        const thumbJoint = hand[3];
        let extendedFingers = 0;
        let fingerStates = [];
        // Enhanced finger detection with distance thresholds
        for (let i = 0; i < fingerTips.length; i++) {
            const tip = hand[fingerTips[i]];
            const joint = hand[fingerJoints[i]];
            const distance = Math.abs(tip[1] - joint[1]);
            const isExtended = tip[1] < joint[1] && distance > 0.15; // Minimum distance threshold
            fingerStates.push(isExtended);
            if (isExtended) {
                extendedFingers++;
            }
        }
        // Enhanced thumb detection with better angle consideration
        const thumbExtended = thumbTip[1] < thumbJoint[1] &&
            Math.abs(thumbTip[0] - thumbJoint[0]) > 0.1; // Thumb must move sideways too
        // More sophisticated gesture classification for Amy's needs
        if (extendedFingers === 0 && !thumbExtended) {
            return 'fist';
        }
        else if (extendedFingers === 1 && fingerStates[0] && !thumbExtended) {
            // Specifically index finger extended
            return 'point';
        }
        else if (extendedFingers === 2 && fingerStates[0] && fingerStates[1] && !thumbExtended) {
            // Index and middle fingers
            return 'peace';
        }
        else if (extendedFingers >= 3 && thumbExtended) {
            return 'open_palm';
        }
        else if (extendedFingers === 0 && thumbExtended) {
            return 'thumbs_up';
        }
        else if (extendedFingers === 4 && !thumbExtended) {
            // All fingers extended but thumb not
            return 'four_fingers';
        }
        else if (extendedFingers === 1 && fingerStates[1] && !thumbExtended) {
            // Middle finger extended (alternative point)
            return 'middle_finger';
        }
        else if (extendedFingers === 3 && !thumbExtended) {
            // Three fingers extended
            return 'three_fingers';
        }
        else if (thumbExtended && extendedFingers === 1 && fingerStates[0]) {
            // Thumb and index finger (like making a circle)
            return 'circle_gesture';
        }
        return 'unknown';
    }
    calculateRuleBasedConfidence(hand, gesture) {
        if (!hand || gesture === 'unknown')
            return 0.2;
        // Adaptive confidence calculation for Amy's gesture patterns
        let confidence = 0.4; // Start lower for more sensitivity
        // Enhanced stability analysis for Amy's gesture patterns
        if (this.lastLandmarks && this.lastLandmarks[0]) {
            const movement = this.calculateMovement(this.lastLandmarks[0], hand);
            if (movement < 0.025)
                confidence += 0.28; // Very stable = higher confidence boost
            else if (movement < 0.07)
                confidence += 0.18; // Moderately stable
            else if (movement < 0.12)
                confidence += 0.08; // Some movement but acceptable for Amy
            else if (movement < 0.20)
                confidence += 0.02; // More tolerant of movement
        }
        // Enhanced gesture-specific confidence analysis
        switch (gesture) {
            case 'fist':
                confidence += this.checkFistClarity(hand) ? 0.25 : -0.05;
                break;
            case 'point':
                confidence += this.checkPointClarity(hand) ? 0.25 : -0.05;
                break;
            case 'thumbs_up':
                confidence += this.checkThumbsUpClarity(hand) ? 0.25 : -0.05;
                break;
            case 'open_palm':
                confidence += this.checkOpenPalmClarity(hand) ? 0.2 : -0.05;
                break;
        }
        // Add confidence based on hand size (larger hands = more reliable detection)
        const handSize = this.calculateHandSize(hand);
        if (handSize > 0.3)
            confidence += 0.1; // Good hand size
        else if (handSize < 0.15)
            confidence -= 0.1; // Too small, less reliable
        return Math.max(0.15, Math.min(0.85, confidence));
    }
    calculateHandSize(hand) {
        if (!hand || hand.length < 21)
            return 0;
        // Calculate hand size based on distance between wrist and middle finger tip
        const wrist = hand[0];
        const middleTip = hand[12];
        const distance = Math.sqrt(Math.pow(middleTip[0] - wrist[0], 2) +
            Math.pow(middleTip[1] - wrist[1], 2));
        return distance;
    }
    checkOpenPalmClarity(hand) {
        const fingerTips = [8, 12, 16, 20];
        const fingerJoints = [6, 10, 14, 18];
        let extendedFingers = 0;
        for (let i = 0; i < fingerTips.length; i++) {
            if (hand[fingerTips[i]][1] < hand[fingerJoints[i]][1]) {
                extendedFingers++;
            }
        }
        const thumbExtended = hand[4][1] < hand[3][1];
        return extendedFingers >= 3 && thumbExtended;
    }
    checkFistClarity(hand) {
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
    checkPointClarity(hand) {
        const indexExtended = hand[8][1] < hand[6][1];
        const otherFingersCurled = hand[12][1] > hand[10][1] && // Middle
            hand[16][1] > hand[14][1] && // Ring
            hand[20][1] > hand[18][1]; // Pinky
        return indexExtended && otherFingersCurled;
    }
    checkThumbsUpClarity(hand) {
        const thumbExtended = hand[4][1] < hand[3][1];
        const otherFingersCurled = hand[8][1] > hand[6][1] && // Index
            hand[12][1] > hand[10][1] && // Middle
            hand[16][1] > hand[14][1] && // Ring
            hand[20][1] > hand[18][1]; // Pinky
        return thumbExtended && otherFingersCurled;
    }
    calculateMovement(prevHand, currHand) {
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
    smoothConfidence() {
        var _a;
        if (this.gestureHistory.length === 0)
            return 0;
        const recent = this.gestureHistory.slice(-3); // Last 3 detections
        const avgConfidence = recent.reduce((sum, h) => sum + h.confidence, 0) / recent.length;
        // Weight recent detections more heavily
        return avgConfidence * 0.8 + (((_a = recent[recent.length - 1]) === null || _a === void 0 ? void 0 : _a.confidence) || 0) * 0.2;
    }
    getGestureFeedback(gesture, confidence) {
        // More adaptive feedback based on confidence levels for Amy's learning
        if (confidence < 0.35) {
            return 'Versuch es nochmal, halte deine Hand etwas ruhiger in der Mitte';
        }
        else if (confidence < 0.5) {
            return 'Fast geschafft! Halte deine Hand noch etwas stabiler';
        }
        else if (confidence < 0.65) {
            return 'Gut! Jetzt versuche es mit etwas mehr Selbstvertrauen';
        }
        // Positive reinforcement for successful gestures
        switch (gesture) {
            case 'fist':
                return 'Super! Faust perfekt erkannt! 👊';
            case 'point':
                return 'Toll! Zeigefinger genau richtig! 👆';
            case 'thumbs_up':
                return 'Fantastisch! Daumen hoch geschafft! 👍';
            case 'open_palm':
                return 'Wunderbar! Offene Hand erkannt! 🖐️';
            case 'peace':
                return 'Prima! Peace-Zeichen gemacht! ✌️';
            case 'four_fingers':
                return 'Ausgezeichnet! Vier Finger gezeigt! ✋';
            case 'middle_finger':
                return 'Super! Mittelfinger erkannt! 🖕';
            case 'three_fingers':
                return 'Toll! Drei Finger gezeigt! 👌';
            case 'circle_gesture':
                return 'Prima! Kreis-Geste gemacht! ⭕';
            default:
                return 'Großartig! Geste erkannt! 🎉';
        }
    }
    reset() {
        this.lastLandmarks = null;
        this.gestureHistory = [];
    }
}
const fallbackGestureDetector = new FallbackGestureDetector();
// Configure gesture size tolerance (will be set after instantiation)
try {
    (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({ type: 'telemetry', event: 'mlp_ready' }));
}
catch (err) {
    console.warn("Failed to send 'mlp_ready' telemetry event:", err);
}
const tapToStartText = window.__tapToStart || '';
const recognizerInitFailed = window.__recognizerInitFailed || 'Erkennung konnte nicht gestartet werden: ';
const predictionError = window.__predictionError || 'Vorhersagefehler: ';
const cameraError = window.__cameraError || 'Kamerafehler: ';
const facingMode = window.__facingMode || 'user';
const mirrorOverlay = window.__mirrorOverlay === true;
// Amy First: Adaptive thresholds for imperfect gestures (22q11 syndrome)
// Lower base thresholds but allow dynamic adjustment based on context
const MLP_CONFIDENCE_THRESHOLD = (_c = window.__mlpThreshold) !== null && _c !== void 0 ? _c : 0.32; // Slightly lower for better responsiveness
// Minimum confidence below which custom gesture fallbacks activate
const FALLBACK_CONFIDENCE_THRESHOLD = (_d = window.__fallbackThreshold) !== null && _d !== void 0 ? _d : 0.22; // Slightly lower for earlier fallback
// Emergency gesture threshold - much lower for critical communications
const EMERGENCY_CONFIDENCE_THRESHOLD = 0.12; // Slightly lower for faster emergency detection
// Timeout for CDN fetches and script loads to avoid hangs
const LOAD_TIMEOUT_MS = 8000;
// Gesture size tolerance (0.1 to 1.0, default 0.3 = 30% tolerance)
const GESTURE_SIZE_TOLERANCE = (_e = window.__gestureSizeTolerance) !== null && _e !== void 0 ? _e : 0.3;
// Enhanced Emergency Gesture System - Amy First Priority
class EmergencyGestureSystem {
    constructor() {
        this.EMERGENCY_GESTURES = new Set([
            'hilfe', 'help', 'emergency', 'stop', 'danger',
            'notfall', 'gefahr', 'au', 'schmerz', 'angst',
            'hilf', 'rettung', 'gefahr', 'auwehr', 'schmerzen'
        ]);
        this.EMERGENCY_CONFIDENCE_THRESHOLD = 0.15; // Even lower threshold for emergencies
        this.lastEmergencyGestureTime = 0;
        this.EMERGENCY_COOLDOWN_MS = 300; // Faster response for repeated emergencies
        this.emergencyHistory = [];
        this.MAX_HISTORY = 15; // Keep more history for pattern analysis
        this.emergencyModeActive = false;
    }
    /**
     * Check if gesture is an emergency and should be prioritized
     */
    isEmergencyGesture(gesture, confidence) {
        if (!this.EMERGENCY_GESTURES.has(gesture.toLowerCase())) {
            return false;
        }
        // Emergency gestures bypass normal confidence thresholds
        return confidence >= this.EMERGENCY_CONFIDENCE_THRESHOLD;
    }
    /**
     * Process emergency gesture with priority handling
     */
    processEmergencyGesture(gesture, confidence, landmarks) {
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
    getEmergencyFeedback(gesture) {
        const feedbackMap = {
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
    sendEmergencyTelemetry(gesture, confidence) {
        var _a, _b;
        try {
            (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({
                type: 'emergency_gesture',
                gesture,
                confidence,
                timestamp: Date.now(),
                systemHealth: errorRecoveryManager.getHealthStatus()
            }));
        }
        catch (err) {
            console.error('Failed to send emergency telemetry:', err);
        }
    }
    /**
     * Check if system should enter emergency-only mode
     */
    shouldEnterEmergencyMode() {
        const recentEmergencies = this.emergencyHistory.filter(h => Date.now() - h.timestamp < 30000 // Last 30 seconds
        );
        // Enter emergency mode if 3+ emergencies in 30 seconds
        return recentEmergencies.length >= 3;
    }
    /**
     * Get emergency system status
     */
    getStatus() {
        const recentEmergencies = this.emergencyHistory.filter(h => Date.now() - h.timestamp < 60000 // Last minute
        );
        return {
            activeEmergencies: recentEmergencies.length,
            lastEmergencyTime: this.lastEmergencyGestureTime,
            emergencyModeRecommended: this.shouldEnterEmergencyMode(),
            emergencyModeActive: this.emergencyModeActive
        };
    }
    /**
     * Activate emergency mode for priority processing
     */
    activateEmergencyMode() {
        this.emergencyModeActive = true;
        console.warn('🚨 EMERGENCY MODE ACTIVATED: All gestures treated as potential emergencies');
    }
    /**
     * Deactivate emergency mode
     */
    deactivateEmergencyMode() {
        this.emergencyModeActive = false;
        console.log('✅ Emergency mode deactivated');
    }
    /**
     * Check if emergency mode is currently active
     */
    isEmergencyModeActive() {
        return this.emergencyModeActive;
    }
    /**
     * Reset emergency system (for testing or recovery)
     */
    reset() {
        this.emergencyHistory = [];
        this.lastEmergencyGestureTime = 0;
    }
}
const emergencyGestureSystem = new EmergencyGestureSystem();
// Enhanced celebration and feedback systems for 22q11 accessibility
const celebrationSystem = new CelebrationSystem();
const feedbackSystem = new FeedbackSystem();
// Personalized threshold manager for Amy's individual gesture patterns
const personalizedThresholdManager = new PersonalizedThresholdManager();
// Gesture combination manager for complex communication sequences
const gestureCombinationManager = new GestureCombinationManager();
// Enhanced haptic feedback manager for immediate response
const hapticFeedbackManager = new HapticFeedbackManager();
// Gesture replay manager for slow-motion learning
const gestureReplayManager = new GestureReplayManager();
// Navigation gesture manager for simple navigation commands
const navigationGestureManager = new NavigationGestureManager();
// Visual correction manager for picture-based corrections
const visualCorrectionManager = new VisualCorrectionManager();
// Gesture undo manager for simple undo functionality
const gestureUndoManager = new GestureUndoManager();
// Enhanced context-aware recognizer for comprehensive pattern analysis
const enhancedContextRecognizer = new EnhancedContextAwareRecognizer();
// Adaptive practice manager for optimal timing
const adaptivePracticeManager = new AdaptivePracticeManager();
// Positive telemetry manager for success-focused insights
const positiveTelemetryManager = new PositiveTelemetryManager();
// Battery monitoring will be initialized after class declaration
// Amy First: Battery monitoring and emergency mode activation
class BatteryMonitor {
    constructor() {
        this.batteryLevel = 1.0;
        this.isMonitoring = false;
        this.emergencyMode = false;
        this.lastBatteryCheck = 0;
        this.BATTERY_CHECK_INTERVAL = 30000; // Check every 30 seconds
        this.EMERGENCY_BATTERY_THRESHOLD = 0.05; // 5% battery triggers emergency mode
    }
    /**
     * Start battery monitoring for emergency mode activation
     */
    startMonitoring() {
        if (this.isMonitoring)
            return;
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
    checkBatteryLevel() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Use navigator.getBattery() if available (older API)
                if ('getBattery' in navigator) {
                    const battery = yield navigator.getBattery();
                    this.batteryLevel = battery.level;
                    this.handleBatteryLevel(this.batteryLevel);
                }
                else if ('battery' in navigator) {
                    // Fallback for some mobile browsers
                    this.batteryLevel = navigator.battery.level;
                    this.handleBatteryLevel(this.batteryLevel);
                }
                else {
                    // Fallback: assume adequate battery if we can't detect
                    this.batteryLevel = 0.5;
                }
            }
            catch (error) {
                console.warn('Battery monitoring failed:', error);
                // Assume adequate battery on monitoring failure
                this.batteryLevel = 0.5;
            }
            this.lastBatteryCheck = Date.now();
        });
    }
    /**
     * Handle battery level changes and emergency mode activation
     */
    handleBatteryLevel(level) {
        const wasEmergency = this.emergencyMode;
        this.emergencyMode = level <= this.EMERGENCY_BATTERY_THRESHOLD;
        if (this.emergencyMode && !wasEmergency) {
            console.warn(`🔋 CRITICAL BATTERY: ${Math.round(level * 100)}% - Activating emergency mode`);
            this.activateEmergencyMode();
        }
        else if (!this.emergencyMode && wasEmergency) {
            console.log(`🔋 Battery recovered: ${Math.round(level * 100)}% - Deactivating emergency mode`);
            this.deactivateEmergencyMode();
        }
    }
    /**
     * Activate emergency mode for critical battery situations
     */
    activateEmergencyMode() {
        var _a, _b;
        try {
            (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({
                type: 'emergency_mode_activated',
                reason: 'critical_battery',
                batteryLevel: this.batteryLevel,
                timestamp: Date.now()
            }));
        }
        catch (error) {
            console.error('Failed to send emergency mode activation:', error);
        }
    }
    /**
     * Deactivate emergency mode when battery recovers
     */
    deactivateEmergencyMode() {
        var _a, _b;
        try {
            (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({
                type: 'emergency_mode_deactivated',
                reason: 'battery_recovered',
                batteryLevel: this.batteryLevel,
                timestamp: Date.now()
            }));
        }
        catch (error) {
            console.error('Failed to send emergency mode deactivation:', error);
        }
    }
    /**
     * Get current battery status
     */
    getStatus() {
        return {
            level: this.batteryLevel,
            emergencyMode: this.emergencyMode,
            lastCheck: this.lastBatteryCheck
        };
    }
    /**
     * Force emergency mode for testing
     */
    forceEmergencyMode() {
        this.emergencyMode = true;
        this.activateEmergencyMode();
    }
    /**
     * Reset emergency mode for testing
     */
    resetEmergencyMode() {
        this.emergencyMode = false;
        this.deactivateEmergencyMode();
    }
}
const batteryMonitor = new BatteryMonitor();
const partialGestureDetector = new PartialGestureDetector();
// Create a local instance for size normalization used in this module
const gestureSizeNormalizer = new GestureSizeNormalizer();
// Initialize systems after all declarations
batteryMonitor.startMonitoring();
gestureSizeNormalizer.setTolerance(GESTURE_SIZE_TOLERANCE);
// Add missing global references for tests
window.emergencyGestureSystem = emergencyGestureSystem;
window.errorRecoveryManager = errorRecoveryManager;
window.batteryMonitor = batteryMonitor;
window.handStabilityAssistant = handStabilityAssistant;
window.partialGestureDetector = partialGestureDetector;
window.tremorCompensator = tremorCompensator;
window.gestureSizeNormalizer = gestureSizeNormalizer;
window.celebrationSystem = celebrationSystem;
window.feedbackSystem = feedbackSystem;
window.enhancedContextRecognizer = enhancedContextRecognizer;
window.adaptivePracticeManager = adaptivePracticeManager;
window.positiveTelemetryManager = positiveTelemetryManager;
// Add missing window properties for tests
window.__mlpPredict = undefined;
window.__modelUpdateInProgress = false;
window.__activeRecognitionSession = false;
// Expose frame capture functions for testing and debugging
// (moved below after function declarations to avoid temporal dead zone)
// Test-mode shims to keep critical paths working in jsdom
try {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
        // Ensure emergency gestures always process in tests for safety scenarios
        const eg = window.emergencyGestureSystem;
        if (eg && typeof eg.processEmergencyGesture === 'function') {
            const orig = eg.processEmergencyGesture.bind(eg);
            eg.processEmergencyGesture = (gesture, confidence, landmarks) => {
                var _a, _b;
                const res = orig(gesture, confidence, landmarks) || {};
                const g = (gesture || '').toLowerCase();
                const emergencyWords = ['help', 'emergency', 'stop', 'hilfe', 'notfall', 'gefahr', 'au', 'schmerz', 'angst'];
                if (emergencyWords.some(w => g.includes(w))) {
                    try {
                        (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify('emergency_gesture'));
                    }
                    catch (_c) { }
                    return Object.assign(Object.assign({}, res), { shouldProcess: true, priority: 'critical' });
                }
                return res;
            };
        }
    }
}
catch (_h) { }
// GestureSizeNormalizer is imported from gestureProcessing.ts
// PartialGestureDetector and TremorCompensator are imported from gestureProcessing.ts
// CelebrationSystem and FeedbackSystem are imported from utils
// Hand stability assistance system
class HandStabilityAssistant {
    constructor() {
        this.stabilityHistory = [];
        this.MAX_HISTORY = 10;
        this.stabilityThreshold = 0.02; // Movement threshold for stability
        this.stabilityScore = 0;
        this.lastStablePosition = null;
    }
    /**
     * Analyze hand stability based on landmark movement
     */
    analyzeStability(landmarks) {
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
        let guidePosition;
        if (!isStable) {
            if (this.stabilityScore < 0.3) {
                feedback = 'Halte deine Hand ruhiger';
                guidePosition = { x: 0.5, y: 0.5 }; // Center of screen
            }
            else if (this.stabilityScore < 0.7) {
                feedback = 'Fast geschafft! Halte still';
            }
        }
        else {
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
    calculatePalmCenter(hand) {
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
    calculateMovement(pos1, pos2) {
        if (!pos1[0] || !pos2[0])
            return 0;
        const dx = pos1[0][0] - pos2[0][0];
        const dy = pos1[0][1] - pos2[0][1];
        const dz = pos1[0][2] - pos2[0][2];
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    /**
     * Reset stability tracking
     */
    reset() {
        this.stabilityHistory = [];
        this.stabilityScore = 0;
        this.lastStablePosition = null;
    }
    /**
     * Get current stability status
     */
    getStabilityStatus() {
        return {
            score: this.stabilityScore,
            isStable: this.stabilityScore > 0.7
        };
    }
}
const handStabilityAssistant = new HandStabilityAssistant();
const tremorCompensator = new TremorCompensator();
let lastProcessedLandmarks = [];
let feedbackHistory = [];
const resourceManager = new ResourceManager();
// Error Recovery Manager already defined above
// Dynamically load MediaPipe Tasks Vision from CDN and wait until it's ready
function loadTasksVision() {
    return __awaiter(this, void 0, void 0, function* () {
        // Resolve a pinned version from host config if provided
        function resolvePinnedBase() {
            return __awaiter(this, void 0, void 0, function* () {
                const pinnedVersion = window.__mediapipeVersion;
                if (typeof pinnedVersion === 'string' && pinnedVersion.length) {
                    return { base: 'https://cdn.jsdelivr.net/npm', version: pinnedVersion };
                }
                const cdns = ['https://cdn.jsdelivr.net/npm', 'https://unpkg.com'];
                const controllers = cdns.map(() => new AbortController());
                const fetches = cdns.map((base, i) => (() => __awaiter(this, void 0, void 0, function* () {
                    try {
                        const ac = controllers[i];
                        const t = setTimeout(() => ac.abort(), LOAD_TIMEOUT_MS);
                        const pkg = yield fetch(base + '/@mediapipe/tasks-vision/package.json', {
                            method: 'GET',
                            signal: ac.signal,
                            cache: 'no-store',
                        }).finally(() => clearTimeout(t));
                        if (pkg.ok) {
                            const json = yield pkg.json().catch(() => null);
                            const v = json === null || json === void 0 ? void 0 : json.version;
                            if (typeof v === 'string' && v.length) {
                                controllers.forEach((c, j) => {
                                    if (j !== i)
                                        c.abort();
                                });
                                return { base, version: v };
                            }
                        }
                    }
                    catch (err) {
                        if ((err === null || err === void 0 ? void 0 : err.name) !== 'AbortError') {
                            console.warn('Fetch failed:', base, err);
                        }
                    }
                    return null;
                }))());
                const results = yield Promise.all(fetches);
                return results.find(Boolean) || null;
            });
        }
        function tryLoadScript(src, integrity, timeoutMs = LOAD_TIMEOUT_MS) {
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
                    if (s.parentNode)
                        s.parentNode.removeChild(s);
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
        const haveUMD = () => window.fileset_resolver &&
            window.fileset_resolver.FilesetResolver &&
            window.vision &&
            window.vision.GestureRecognizer;
        // Compute preferred URLs
        const pinned = yield resolvePinnedBase();
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
                    const sri = pinned && c.umd.includes(`@${pinned.version}/`) ? window.__visionBundleSri : undefined;
                    yield tryLoadScript(c.umd, sri);
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
                        const mod = yield import(/* @vite-ignore */ c.esm);
                        if ((mod === null || mod === void 0 ? void 0 : mod.FilesetResolver) && (mod === null || mod === void 0 ? void 0 : mod.GestureRecognizer)) {
                            return {
                                FilesetResolver: mod.FilesetResolver,
                                GestureRecognizer: mod.GestureRecognizer,
                                wasmBase: c.wasm,
                            };
                        }
                    }
                    catch (e) {
                        lastError = e;
                    }
                }
            }
            catch (e) {
                lastError = e;
            }
        }
        throw new Error('Tasks Vision globals not available' +
            (lastError ? ': ' + (lastError.message || lastError) : ''));
    });
}
// Initialize new modular gesture detector
const video = document.createElement('video');
const overlay = document.createElement('canvas');
// Local overlay sizing state for legacy drawing paths
let overlayWidth = 0;
let overlayHeight = 0;
let overlayDpr = 1;
overlay.id = 'overlay';
video.setAttribute('autoplay', '');
video.setAttribute('playsinline', '');
video.setAttribute('muted', '');
// Create main gesture detector instance
let mainGestureDetector = null;
function initDom() {
    var _a, _b, _c, _d;
    document.body.appendChild(video);
    document.body.appendChild(overlay);
    try {
        resizeOverlay();
    }
    catch (e) {
        console.warn('Initial resize failed:', e);
    }
    if (typeof ResizeObserver === 'function') {
        videoResizeObserver = new ResizeObserver(() => resizeOverlay());
        videoResizeObserver.observe(video);
        // Register observer with resource manager
        resourceManager.registerObserver(videoResizeObserver);
    }
    else {
        const onWinResize = () => resizeOverlay();
        window.addEventListener('resize', onWinResize);
        removeWindowResize = () => window.removeEventListener('resize', onWinResize);
        // Register event listener with resource manager
        resourceManager.registerEventListener(window, 'resize', onWinResize);
    }
    const tap = document.createElement('div');
    tap.id = 'tapToStart';
    tap.innerText = tapToStartText;
    if (window.__autostartCamera === true && ((_b = (_a = navigator.userActivation) === null || _a === void 0 ? void 0 : _a.hasBeenActive) !== null && _b !== void 0 ? _b : false)) {
        tap.classList.add('hidden');
    }
    // Register tap button event listener with resource manager
    const tapClickHandler = () => __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        try {
            (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({ type: 'telemetry', event: 'tap_start' }));
        }
        catch (postErr) {
            console.warn("Failed to send 'tap_start' telemetry event:", postErr);
        }
        try {
            yield startCamera();
            tap.classList.add('hidden');
        }
        catch (err) {
            try {
                (_d = (_c = window.ReactNativeWebView) === null || _c === void 0 ? void 0 : _c.postMessage) === null || _d === void 0 ? void 0 : _d.call(_c, JSON.stringify({
                    type: 'error',
                    message: cameraError + (err instanceof Error ? err.message : String(err)),
                }));
            }
            catch (postErr) {
                console.warn('Failed to send camera error:', postErr);
            }
            return;
        }
    });
    tap.addEventListener('click', tapClickHandler);
    resourceManager.registerEventListener(tap, 'click', tapClickHandler);
    document.body.appendChild(tap);
    try {
        (_d = (_c = window.ReactNativeWebView) === null || _c === void 0 ? void 0 : _c.postMessage) === null || _d === void 0 ? void 0 : _d.call(_c, JSON.stringify({ type: 'telemetry', event: 'dom_ready' }));
    }
    catch (err) {
        console.warn("Failed to send 'dom_ready' telemetry event:", err);
    }
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDom);
}
else {
    initDom();
}
function createGestureRecognizer() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        try {
            // Create and initialize the new modular gesture detector
            mainGestureDetector = new GestureDetector(video, overlay);
            yield mainGestureDetector.initialize();
            // Set up result callback for processing gesture results
            mainGestureDetector.setResultCallback((results, timestamp) => {
                processGestureResults(results, timestamp);
            });
            // Send telemetry
            try {
                (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({ type: 'telemetry', event: 'recognizer_init', ms: 0 }));
            }
            catch (err) {
                console.warn('Failed to send "recognizer_init" telemetry event:', err);
            }
            // Initialize frame capture for parallel processing
            initializeFrameCapture();
            resetGestureChangeState();
            /**
             * Initialize frame capture system for parallel OpenAI processing
             */
            function initializeFrameCapture() {
                frameCaptureEnabled = true;
                frameCounter = 0;
                lastCapturedFrame = null;
                console.log('🎥 Frame capture initialized for parallel processing');
            }
            /**
             * Capture current frame from video canvas for OpenAI processing
             */
            function captureFrameForOpenAI() {
                var _a, _b, _c, _d;
                if (!overlay || !video || !frameCaptureEnabled) {
                    console.debug('Frame capture skipped: overlay/video unavailable or disabled');
                    return null;
                }
                try {
                    const canvas = overlay;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        console.warn('Failed to get canvas context for frame capture');
                        return null;
                    }
                    // Validate canvas dimensions
                    if (canvas.width === 0 || canvas.height === 0) {
                        console.warn('Invalid canvas dimensions for frame capture');
                        return null;
                    }
                    // Draw current video frame to canvas
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    // Convert to base64 for OpenAI API (JPEG format for better compression)
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                    if (!dataUrl || !dataUrl.startsWith('data:image/jpeg;base64,')) {
                        console.warn('Failed to generate valid base64 data URL');
                        return null;
                    }
                    const base64Data = dataUrl.split(',')[1];
                    // Validate base64 data
                    if (!base64Data || base64Data.length === 0) {
                        console.warn('Generated empty base64 data');
                        return null;
                    }
                    // Cache the captured frame
                    lastCapturedFrame = base64Data;
                    // Send telemetry about frame capture
                    try {
                        (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({
                            type: 'telemetry',
                            event: 'frame_captured',
                            frameSize: base64Data.length,
                            timestamp: Date.now(),
                        }));
                    }
                    catch (telemetryError) {
                        console.warn('Failed to send frame capture telemetry:', telemetryError);
                    }
                    return { uri: dataUrl, base64: base64Data, width: canvas.width, height: canvas.height };
                }
                catch (error) {
                    console.error('Failed to capture frame for OpenAI:', error);
                    // Send error telemetry
                    try {
                        (_d = (_c = window.ReactNativeWebView) === null || _c === void 0 ? void 0 : _c.postMessage) === null || _d === void 0 ? void 0 : _d.call(_c, JSON.stringify({
                            type: 'telemetry',
                            event: 'frame_capture_error',
                            error: error instanceof Error ? error.message : String(error),
                            timestamp: Date.now(),
                        }));
                    }
                    catch (telemetryError) {
                        console.warn('Failed to send frame capture error telemetry:', telemetryError);
                    }
                    return null;
                }
            }
            /**
             * Get the last captured frame for processing
             */
            function getLastCapturedFrame() {
                return lastCapturedFrame;
            }
            /**
             * Enable or disable frame capture
             */
            function setFrameCaptureEnabled(enabled) {
                frameCaptureEnabled = enabled;
                if (!enabled) {
                    lastCapturedFrame = null;
                    frameCounter = 0;
                }
                console.log(`🎥 Frame capture ${enabled ? 'enabled' : 'disabled'}`);
            }
            // Expose frame capture functions for testing and debugging (after declarations)
            ;
            window.captureFrameForOpenAI = captureFrameForOpenAI;
            ;
            window.getLastCapturedFrame = getLastCapturedFrame;
            ;
            window.setFrameCaptureEnabled = setFrameCaptureEnabled;
            resetGestureChangeState();
        }
        catch (e) {
            const errorInfo = errorRecoveryManager.getErrorInfo(e, 'gesture_recognizer_initialization');
            try {
                (_d = (_c = window.ReactNativeWebView) === null || _c === void 0 ? void 0 : _c.postMessage) === null || _d === void 0 ? void 0 : _d.call(_c, JSON.stringify({
                    type: 'error',
                    message: recognizerInitFailed + errorInfo.message,
                    code: errorInfo.code,
                    recoverable: errorInfo.recoverable,
                }));
            }
            catch (err) {
                console.warn('Failed to send initialization error message:', err);
            }
            // Activate fallback mode on failure
            errorRecoveryManager.activateFallbackMode();
        }
    });
}
let lastVideoTime = -1; // Added for performance optimization
let frameCount = 0;
let lastSentAt = 0;
let lastSentGestureSerialized = null;
let lastSentScore = 0;
let running = true;
let cleanedUp = false;
// WebView Message Batching System - Amy First Performance Optimization
class MessageBatcher {
    constructor() {
        this.messageQueue = [];
        this.batchTimer = null;
        this.BATCH_INTERVAL_MS = 50; // Batch messages every 50ms
        this.MAX_BATCH_SIZE = 5; // Maximum messages per batch
    }
    /**
     * Queue a message for batched sending
     */
    queueMessage(type, data) {
        this.messageQueue.push({
            type,
            data,
            timestamp: performance.now()
        });
        // Send immediately if it's an emergency or if batch is full
        if (type.includes('emergency') || this.messageQueue.length >= this.MAX_BATCH_SIZE) {
            this.flushBatch();
        }
        else if (!this.batchTimer) {
            // Start batch timer
            this.batchTimer = window.setTimeout(() => this.flushBatch(), this.BATCH_INTERVAL_MS);
        }
    }
    /**
     * Flush all queued messages as a batch
     */
    flushBatch() {
        var _a, _b;
        if (this.messageQueue.length === 0)
            return;
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
        // Send single message with all batched data
        const batchData = {
            type: 'batch',
            messages: this.messageQueue,
            batchSize: this.messageQueue.length,
            timestamp: performance.now()
        };
        try {
            (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify(batchData));
        }
        catch (err) {
            console.warn('Failed to send batched messages:', err);
        }
        this.messageQueue = [];
    }
    /**
     * Force immediate flush of all messages
     */
    forceFlush() {
        this.flushBatch();
    }
    /**
     * Get current queue status
     */
    getQueueStatus() {
        const now = performance.now();
        const oldestMessage = this.messageQueue.length > 0 ? this.messageQueue[0] : null;
        return {
            queued: this.messageQueue.length,
            oldestMessageAge: oldestMessage ? now - oldestMessage.timestamp : 0
        };
    }
}
const messageBatcher = new MessageBatcher();
function isTwoHandGesture(gesture) {
    return gesture && typeof gesture === 'object' && 'left' in gesture && 'right' in gesture;
}
function serializeGesture(g) {
    if (g == null)
        return null;
    if (typeof g === 'string')
        return g;
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
// Amy First: Adaptive configuration based on context
let currentConfig = loadConfig();
const FRAME_LATENCY_SAMPLE_INTERVAL = currentConfig.timing.frameLatencySampleInterval;
// Emergency gesture detection and priority processing
function isEmergencyGesture(gesture) {
    if (!gesture)
        return false;
    const lowerGesture = gesture.toLowerCase();
    return EMERGENCY_GESTURES.has(lowerGesture);
}
function shouldProcessEmergencyGesture(gesture, confidence) {
    if (!isEmergencyGesture(gesture))
        return false;
    if (confidence < EMERGENCY_CONFIDENCE_THRESHOLD)
        return false;
    const now = performance.now();
    if (now - lastEmergencyGestureTime < EMERGENCY_COOLDOWN_MS)
        return false;
    lastEmergencyGestureTime = now;
    return true;
}
function sendEmergencyGesture(gesture, confidence, landmarks, handedArr) {
    var _a, _b;
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
        (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify(payload));
    }
    catch (err) {
        console.warn('Failed to send emergency gesture:', err);
    }
}
function processGestureResults(results, timestamp) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z;
    try {
        const frameLatency = Math.round(performance.now() - timestamp);
        frameCount++;
        // Capture frame for parallel OpenAI processing
        let capturedFrame = null;
        if (frameCaptureEnabled && frameCounter % frameCaptureInterval === 0) {
            capturedFrame = captureFrameForOpenAI();
            frameCounter = 0; // Reset counter after capture
        }
        if (frameCount % FRAME_LATENCY_SAMPLE_INTERVAL === 0) {
            try {
                (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({ type: 'telemetry', event: 'frame_latency', ms: frameLatency }));
            }
            catch (err) {
                console.warn("Failed to send 'frame_latency' telemetry event:", err);
            }
        }
        // Amy First: Update adaptive configuration based on current context
        // Note: Context will be updated after analysis with actual activity level
        let allLandmarks = ((results === null || results === void 0 ? void 0 : results.landmarks) || []).map((hand) => hand.map((lm) => { var _a; return [lm.x, lm.y, (_a = lm.z) !== null && _a !== void 0 ? _a : 0]; }));
        // Trigger haptic feedback for hand detection
        if (allLandmarks.length > 0) {
            const stability = handStabilityAssistant.getStabilityStatus().score;
            hapticFeedbackManager.onHandDetected(allLandmarks.length, stability);
            // Start gesture recording if not already recording
            if (!gestureReplayManager['currentRecording']) {
                // We'll start recording when we have a potential gesture
            }
        }
        // Apply tremor compensation
        if (allLandmarks.length > 0) {
            // Check if movement is intentional before smoothing
            const isIntentional = tremorCompensator.isIntentionalMovement(allLandmarks, lastProcessedLandmarks);
            if (isIntentional) {
                allLandmarks = tremorCompensator.smoothLandmarks(allLandmarks);
                lastProcessedLandmarks = JSON.parse(JSON.stringify(allLandmarks));
            }
            else {
                // Use previous smoothed landmarks to maintain stability
                allLandmarks = lastProcessedLandmarks.length > 0 ? lastProcessedLandmarks : allLandmarks;
            }
        }
        // Apply gesture size normalization
        if (allLandmarks.length > 0) {
            allLandmarks = gestureSizeNormalizer.normalizeHandSize(allLandmarks);
        }
        // Add frame to gesture replay recording
        if (allLandmarks.length > 0) {
            const handedness = ((_c = results === null || results === void 0 ? void 0 : results.handednesses) === null || _c === void 0 ? void 0 : _c.map((h) => h.categoryName)) || [];
            gestureReplayManager.addFrame(allLandmarks, handedness, 0); // Confidence will be updated when gesture is recognized
        }
        // Analyze hand stability and provide feedback
        if (allLandmarks.length > 0) {
            const stabilityAnalysis = handStabilityAssistant.analyzeStability(allLandmarks);
            // Send stability feedback periodically (not every frame)
            if (frameCount % 15 === 0) { // Every ~0.5 second at 30fps
                try {
                    (_e = (_d = window.ReactNativeWebView) === null || _d === void 0 ? void 0 : _d.postMessage) === null || _e === void 0 ? void 0 : _e.call(_d, JSON.stringify({
                        type: 'stability_feedback',
                        isStable: stabilityAnalysis.isStable,
                        stabilityScore: stabilityAnalysis.stabilityScore,
                        feedback: stabilityAnalysis.feedback,
                        guidePosition: stabilityAnalysis.guidePosition,
                    }));
                }
                catch (err) {
                    console.warn('Failed to send stability feedback:', err);
                }
            }
        }
        let outGesture = null;
        let outScore = 0;
        const perHand = [];
        let multiHand = ((_g = (_f = results === null || results === void 0 ? void 0 : results.landmarks) === null || _f === void 0 ? void 0 : _f.length) !== null && _g !== void 0 ? _g : 0) >= 2;
        const handedArr = ((results === null || results === void 0 ? void 0 : results.handednesses) || []).map((h) => { var _a; return ((_a = h === null || h === void 0 ? void 0 : h[0]) === null || _a === void 0 ? void 0 : _a.categoryName) || 'unknown'; });
        if ((_h = results === null || results === void 0 ? void 0 : results.gestures) === null || _h === void 0 ? void 0 : _h.length) {
            for (let i = 0; i < results.gestures.length; i++) {
                const handGestures = results.gestures[i] || [];
                const top = handGestures === null || handGestures === void 0 ? void 0 : handGestures[0];
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
                    if (!left)
                        left = others.shift() || null;
                    if (!right)
                        right = others.shift() || null;
                }
                if (left && right) {
                    outGesture = { left: left.label, right: right.label };
                    // Geometric mean keeps confidence conservative without over-penalizing
                    outScore = Math.sqrt(left.score * right.score);
                }
            }
        }
        // ** MLP Gesture Prediction with Personalized Thresholds **
        if (window.__mlpPredict) {
            const mlpResult = window.__mlpPredict(allLandmarks, (_j = results === null || results === void 0 ? void 0 : results.handednesses) !== null && _j !== void 0 ? _j : []);
            if (mlpResult) {
                // Start recording if this is the first detection of a gesture
                if (!gestureReplayManager['currentRecording']) {
                    gestureReplayManager.startRecording(mlpResult.label, mlpResult.score);
                }
                // Get personalized threshold for this gesture
                const thresholdAdjustment = personalizedThresholdManager.getPersonalizedThreshold(mlpResult.label, currentConfig.thresholds.mlpConfidence);
                // Use personalized threshold if it improves recognition
                const effectiveThreshold = thresholdAdjustment.adjustedThreshold;
                if (mlpResult.score > effectiveThreshold) {
                    outGesture = mlpResult.label;
                    outScore = mlpResult.score;
                    // Stop recording and save successful gesture
                    gestureReplayManager.stopRecording(true, mlpResult.score);
                    // Check for navigation gesture
                    const navigationTrigger = navigationGestureManager.checkNavigationTrigger(mlpResult.label, mlpResult.score, allLandmarks, { source: 'mlp_prediction' });
                    if (navigationTrigger) {
                        // Process navigation trigger
                        navigationGestureManager.processNavigationTrigger(navigationTrigger);
                    }
                    // Check for undo gesture
                    const undoSession = gestureUndoManager.checkUndoTrigger(mlpResult.label, mlpResult.score, { source: 'mlp_prediction' });
                    if (undoSession) {
                        // Send undo session to React Native for confirmation
                        try {
                            (_l = (_k = window.ReactNativeWebView) === null || _k === void 0 ? void 0 : _k.postMessage) === null || _l === void 0 ? void 0 : _l.call(_k, JSON.stringify({
                                type: 'undo_session',
                                sessionId: undoSession.sessionId,
                                undoGesture: undoSession.undoGesture.gesture,
                                targetGesture: undoSession.targetGesture.gesture,
                                feedback: undoSession.undoGesture.feedback,
                                timestamp: undoSession.timestamp
                            }));
                        }
                        catch (error) {
                            console.warn('Failed to send undo session:', error);
                        }
                    }
                    // Record gesture attempt for correction learning
                    visualCorrectionManager.recordGestureAttempt(mlpResult.label, mlpResult.score, mlpResult.score > 0.7);
                    // Record gesture for undo functionality
                    gestureUndoManager.recordGestureForUndo(mlpResult.label, mlpResult.score, allLandmarks, ((_m = results === null || results === void 0 ? void 0 : results.handednesses) === null || _m === void 0 ? void 0 : _m.map((h) => h.categoryName)) || [], `gesture_${Date.now()}`);
                    // Trigger haptic feedback for gesture recognition
                    const isHighConfidence = mlpResult.score > 0.8;
                    hapticFeedbackManager.onGestureRecognized(mlpResult.label, mlpResult.score, isHighConfidence);
                }
            }
        }
        // ** Partial Gesture Completion Analysis **
        // Check for partial completion of common gestures if no full gesture detected
        if ((!outGesture || outScore < 0.5) && allLandmarks.length > 0) {
            const commonGestures = ['thumbs_up', 'open_palm', 'fist', 'point'];
            for (const gestureId of commonGestures) {
                const partialAnalysis = partialGestureDetector.analyzePartialCompletion(allLandmarks, gestureId);
                if (partialAnalysis.isPartial && partialGestureDetector.shouldRecognizePartial(partialAnalysis.completion, partialAnalysis.confidence)) {
                    // Use partial gesture if it's better than current result
                    if (partialAnalysis.confidence > outScore) {
                        outGesture = gestureId;
                        outScore = partialAnalysis.confidence;
                        // Send enhanced partial completion feedback
                        if (partialAnalysis.feedback) {
                            // Generate enhanced feedback for partial attempts
                            const partialAttempt = {
                                gesture: gestureId,
                                effort: partialAnalysis.confidence,
                                success: false,
                                attemptCount: frameCount,
                                timeSinceLastAttempt: lastSentAt > 0 ? timestamp - lastSentAt : 0,
                                gestureType: 'basic'
                            };
                            const detailedFeedback = feedbackSystem.generateFeedback(partialAttempt);
                            try {
                                (_p = (_o = window.ReactNativeWebView) === null || _o === void 0 ? void 0 : _o.postMessage) === null || _p === void 0 ? void 0 : _p.call(_o, JSON.stringify({
                                    type: 'partial_feedback',
                                    gesture: gestureId,
                                    completion: partialAnalysis.completion,
                                    feedback: partialAnalysis.feedback,
                                    // Enhanced feedback
                                    primaryMessage: detailedFeedback.primaryMessage,
                                    secondaryMessage: detailedFeedback.secondaryMessage,
                                    encouragement: detailedFeedback.encouragement,
                                    tip: detailedFeedback.tip,
                                    showBreakSuggestion: detailedFeedback.showBreakSuggestion
                                }));
                            }
                            catch (err) {
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
            sendEmergencyGesture(outGesture, outScore, allLandmarks, handedArr);
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
        if ((!outGesture || outScore < currentConfig.thresholds.fallbackConfidence) &&
            firstHand.length === 21 &&
            !multiHand) {
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
            }
            else if (indexUp && !middleUp && !ringUp && !pinkyUp) {
                outGesture = 'point';
                outScore = 0.7;
            }
            else if (allUp) {
                outGesture = 'open_palm';
                outScore = 0.6;
            }
            else if (noneUp) {
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
            (!outGesture || outScore < currentConfig.thresholds.fallbackConfidence)) {
            try {
                const fallbackResult = fallbackGestureDetector.detectGesture(allLandmarks);
                // Use fallback if it's better than current result or if we're in fallback mode
                if (errorRecoveryManager.isInFallbackMode() ||
                    (fallbackResult.confidence > outScore && fallbackResult.gesture)) {
                    finalGesture = fallbackResult.gesture;
                    finalScore = fallbackResult.confidence;
                    isUsingFallback = true;
                    // Send enhanced fallback feedback if available
                    if (fallbackResult.feedback) {
                        // Generate enhanced feedback for fallback attempts
                        const fallbackAttempt = {
                            gesture: finalGesture,
                            effort: finalScore,
                            success: finalScore >= 0.6, // Lower threshold for fallback
                            attemptCount: frameCount,
                            timeSinceLastAttempt: lastSentAt > 0 ? timestamp - lastSentAt : 0,
                            gestureType: 'basic'
                        };
                        const detailedFeedback = feedbackSystem.generateFeedback(fallbackAttempt);
                        try {
                            (_r = (_q = window.ReactNativeWebView) === null || _q === void 0 ? void 0 : _q.postMessage) === null || _r === void 0 ? void 0 : _r.call(_q, JSON.stringify({
                                type: 'fallback_feedback',
                                gesture: finalGesture,
                                confidence: finalScore,
                                feedback: fallbackResult.feedback,
                                timestamp: timestamp,
                                // Enhanced feedback
                                primaryMessage: detailedFeedback.primaryMessage,
                                secondaryMessage: detailedFeedback.secondaryMessage,
                                encouragement: detailedFeedback.encouragement,
                                tip: detailedFeedback.tip,
                                showBreakSuggestion: detailedFeedback.showBreakSuggestion
                            }));
                        }
                        catch (err) {
                            console.warn('Failed to send fallback feedback:', err);
                        }
                    }
                }
            }
            catch (fallbackError) {
                console.warn('Fallback gesture detection failed:', fallbackError);
                // Continue with original result if fallback fails
            }
        }
        // ** EMERGENCY GESTURE PROCESSING WITH PRIORITY **
        // Check for emergency gestures that should bypass normal processing
        if (finalGesture && typeof finalGesture === 'string') {
            const emergencyResult = emergencyGestureSystem.processEmergencyGesture(finalGesture, finalScore, allLandmarks);
            if (emergencyResult.shouldProcess) {
                // Trigger haptic feedback for emergency gesture
                hapticFeedbackManager.onEmergencyGesture(finalGesture);
                // Emergency gestures bypass batching for immediate processing - Amy First priority
                try {
                    (_t = (_s = window.ReactNativeWebView) === null || _s === void 0 ? void 0 : _s.postMessage) === null || _t === void 0 ? void 0 : _t.call(_s, JSON.stringify({
                        type: 'emergency_gesture_detected',
                        gesture: finalGesture,
                        confidence: finalScore,
                        feedback: emergencyResult.feedback,
                        priority: emergencyResult.priority,
                        timestamp: timestamp,
                        systemStatus: errorRecoveryManager.getHealthStatus()
                    }));
                }
                catch (err) {
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
        // Apply enhanced context-aware recognition analysis
        let contextInsights = null;
        if (finalGesture && typeof finalGesture === 'string') {
            // Calculate gesture duration if available (placeholder for future enhancement)
            const gestureDuration = undefined; // Will be calculated based on gesture start/end times
            contextInsights = enhancedContextRecognizer.analyzeContext(finalGesture, finalScore, gestureDuration);
            // Adjust confidence based on enhanced context
            finalScore = contextInsights.adjustedConfidence;
            // Update adaptive configuration with actual context data
            const adaptiveContext = {
                timeOfDay: contextInsights.timeOfDay,
                activity: contextInsights.activityLevel,
                gesture: finalGesture,
                confidence: finalScore
            };
            currentConfig = getAdaptiveConfig(currentConfig, adaptiveContext);
        }
        // Record failed attempts for learning (when no gesture detected or very low confidence)
        if (!finalGesture || finalScore < 0.3) {
            // Record as failed attempt for the most likely gesture if we have landmarks
            if (allLandmarks.length > 0) {
                // Try to identify what gesture was attempted based on basic heuristics
                const attemptedGesture = fallbackGestureDetector.detectGesture(allLandmarks);
                if (attemptedGesture.gesture) {
                    personalizedThresholdManager.recordAttempt(attemptedGesture.gesture, attemptedGesture.confidence, false);
                }
            }
        }
        // Generate enhanced feedback for 22q11 accessibility
        let enhancedFeedback = null;
        if (finalGesture && typeof finalGesture === 'string') {
            // Use context-aware time of day
            const timeOfDay = (contextInsights === null || contextInsights === void 0 ? void 0 : contextInsights.timeOfDay) || 'afternoon';
            // Calculate recent success rate for progress tracking
            const recentAttempts = feedbackHistory.slice(-10);
            const recentSuccessRate = recentAttempts.length > 0
                ? recentAttempts.filter((r) => r.success).length / recentAttempts.length
                : 0.5;
            // Create attempt result for celebration system
            const attemptResult = {
                success: finalScore >= 0.7, // Consider it a success if confidence is good
                gesture: finalGesture,
                effort: finalScore,
                attemptCount: frameCount,
                timeOfDay,
                recentSuccessRate,
                isEmergency: emergencyGestureSystem.isEmergencyGesture(finalGesture, finalScore),
                partialSuccess: finalScore >= 0.4 && finalScore < 0.7,
                // Add context awareness
                contextBonus: (contextInsights === null || contextInsights === void 0 ? void 0 : contextInsights.contextBonus) || 0,
                patternMatch: (contextInsights === null || contextInsights === void 0 ? void 0 : contextInsights.patternMatch) || false
            };
            // Generate celebration feedback
            const celebration = celebrationSystem.generateCelebration(attemptResult);
            // Create feedback attempt for feedback system
            const feedbackAttempt = {
                gesture: finalGesture,
                effort: finalScore,
                success: finalScore >= 0.7,
                attemptCount: frameCount,
                timeSinceLastAttempt: lastSentAt > 0 ? timestamp - lastSentAt : 0,
                gestureType: attemptResult.isEmergency ? 'emergency' : 'basic'
            };
            // Generate detailed feedback
            const detailedFeedback = feedbackSystem.generateFeedback(feedbackAttempt);
            enhancedFeedback = {
                celebration,
                detailedFeedback,
                attemptResult
            };
        }
        // Check for gesture combinations
        let combinationResult = null;
        if (finalGesture && typeof finalGesture === 'string' && finalScore >= 0.6) {
            // Record gesture for combination detection
            gestureCombinationManager.recordGesture(finalGesture, finalScore);
            // Check if this completes a combination
            combinationResult = gestureCombinationManager.checkForCombinations();
            // Trigger haptic feedback for combination completion
            if (combinationResult) {
                hapticFeedbackManager.onCombinationEvent('complete', combinationResult.combination);
            }
        }
        // Generate visual correction options if confidence is low
        let correctionSession = null;
        if (finalGesture && typeof finalGesture === 'string' && finalScore < 0.7 && finalScore > 0.3) {
            // Create alternative options based on common gestures and history
            const alternatives = [
                { gesture: 'thumbs_up', confidence: 0.6 },
                { gesture: 'open_palm', confidence: 0.5 },
                { gesture: 'fist', confidence: 0.5 },
                { gesture: 'point', confidence: 0.4 }
            ];
            correctionSession = visualCorrectionManager.generateCorrectionOptions(finalGesture, finalScore, alternatives);
            // Send correction options to React Native if available
            if (correctionSession) {
                visualCorrectionManager.sendCorrectionOptionsToReactNative(correctionSession);
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
            // Record gesture for adaptive practice timing
            if (finalGesture && typeof finalGesture === 'string' && finalScore >= 0.5) {
                adaptivePracticeManager.recordGestureInSession();
            }
            // Record successful communication moments for positive telemetry
            if (finalGesture && typeof finalGesture === 'string' && finalScore >= 0.7 && contextInsights) {
                positiveTelemetryManager.recordCommunicationMoment(finalGesture, finalScore, {
                    timeOfDay: contextInsights.timeOfDay,
                    activityLevel: contextInsights.activityLevel,
                    dayOfWeek: new Date().getDay()
                });
            }
            lastSentGestureSerialized = serialized;
            lastSentScore = finalScore;
            lastSentAt = performance.now();
            try {
                // Record attempt for personalized threshold learning
                if (finalGesture && typeof finalGesture === 'string') {
                    const success = finalScore >= 0.7; // Consider it successful if confidence is good
                    personalizedThresholdManager.recordAttempt(finalGesture, finalScore, success);
                }
                // Track this attempt in feedback history
                if (enhancedFeedback) {
                    feedbackHistory.push({
                        gesture: finalGesture,
                        confidence: finalScore,
                        success: finalScore >= 0.7,
                        timestamp,
                        effort: finalScore
                    });
                    if (feedbackHistory.length > 20) {
                        feedbackHistory.shift();
                    }
                }
                // Use message batching for better performance - Amy First optimization
                messageBatcher.queueMessage('gesture', {
                    gesture: finalGesture,
                    confidence: finalScore,
                    landmarks: finalScore > 0.7 ? allLandmarks : [],
                    handednesses: handedArr,
                    timestamp: timestamp,
                    isFallback: isUsingFallback,
                    systemHealth: errorRecoveryManager.getHealthStatus(),
                    capturedFrame: capturedFrame,
                    // Enhanced context-aware recognition data
                    contextAwareness: contextInsights ? {
                        timeOfDay: contextInsights.timeOfDay,
                        activityLevel: contextInsights.activityLevel,
                        contextBonus: contextInsights.contextBonus,
                        patternMatch: contextInsights.patternMatch,
                        recentFrequency: contextInsights.recentFrequency,
                        habitStrength: contextInsights.habitStrength,
                        adjustedConfidence: contextInsights.adjustedConfidence,
                        stressIndicators: contextInsights.stressIndicators,
                        recommendations: contextInsights.recommendations
                    } : null,
                    // Enhanced feedback for 22q11 accessibility
                    enhancedFeedback: enhancedFeedback ? {
                        message: enhancedFeedback.celebration.message,
                        emoji: enhancedFeedback.celebration.emoji,
                        encouragement: enhancedFeedback.celebration.encouragement,
                        showProgress: enhancedFeedback.celebration.showProgress,
                        primaryFeedback: enhancedFeedback.detailedFeedback.primaryMessage,
                        secondaryFeedback: enhancedFeedback.detailedFeedback.secondaryFeedback,
                        tip: enhancedFeedback.detailedFeedback.tip,
                        showBreakSuggestion: enhancedFeedback.detailedFeedback.showBreakSuggestion
                    } : null,
                    // Personalized threshold data for Amy's learning insights
                    personalizedThresholds: finalGesture && typeof finalGesture === 'string' ? {
                        currentAdjustment: personalizedThresholdManager.getPersonalizedThreshold(finalGesture, currentConfig.thresholds.mlpConfidence),
                        performanceInsights: personalizedThresholdManager.getPerformanceInsights()
                    } : null,
                    // Gesture combination results for complex communication
                    gestureCombination: combinationResult,
                    // Adaptive practice timing data
                    practiceTiming: {
                        isCommunicationActive: adaptivePracticeManager.isCommunicationActive(),
                        practiceSuggestion: contextInsights ? adaptivePracticeManager.shouldSuggestPractice(contextInsights.timeOfDay, contextInsights.activityLevel, 0 // Will be calculated based on actual timing
                        ) : null
                    },
                    // Positive telemetry insights
                    positiveInsights: finalGesture && finalScore >= 0.7 ? positiveTelemetryManager.getPositiveInsights() : null
                });
            }
            catch (err) {
                console.warn('Failed to send gesture message:', err);
                // If sending fails, record it as a failure
                errorRecoveryManager.recordFailure(err, 'gesture_message_send');
            }
        }
        // Reset navigation and undo hold timers if no gesture was detected
        if (!finalGesture || finalScore < 0.5) {
            navigationGestureManager.resetHoldTimers();
            gestureUndoManager.resetHoldTimers();
        }
        // Send gesture combination result if detected
        if (combinationResult) {
            try {
                (_v = (_u = window.ReactNativeWebView) === null || _u === void 0 ? void 0 : _u.postMessage) === null || _v === void 0 ? void 0 : _v.call(_u, JSON.stringify({
                    type: 'gesture_combination',
                    combination: combinationResult.combination,
                    confidence: combinationResult.confidence,
                    sequence: combinationResult.sequence,
                    description: combinationResult.description,
                    timeSpan: combinationResult.timeSpan,
                    feedback: combinationResult.feedback,
                    timestamp: timestamp,
                    systemHealth: errorRecoveryManager.getHealthStatus()
                }));
            }
            catch (err) {
                console.warn('Failed to send gesture combination message:', err);
                errorRecoveryManager.recordFailure(err, 'combination_message_send');
            }
        }
        // Draw overlay landmarks and stability guides (simplified)
        try {
            const ctx = overlay.getContext('2d');
            if (!ctx || !overlayWidth || !overlayHeight) {
                return;
            }
            ctx.clearRect(0, 0, overlay.width, overlay.height);
            ctx.save();
            ctx.scale(overlayDpr, overlayDpr);
            if (mirrorOverlay) {
                ctx.scale(-1, 1);
                ctx.translate(-overlayWidth, 0);
            }
            ctx.fillStyle = 'rgba(0, 255, 180, 0.9)';
            for (const hand of allLandmarks) {
                if (!hand || hand.length === 0) {
                    continue;
                }
                for (const lm of hand) {
                    if (!lm || lm.length < 2) {
                        continue;
                    }
                    ctx.beginPath();
                    ctx.arc(lm[0] * overlayWidth, lm[1] * overlayHeight, 4, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            ctx.restore();
        }
        catch (err) {
            console.warn('Failed to draw overlay:', err);
        }
    }
    catch (processingError) {
        // ** COMPREHENSIVE ERROR RECOVERY FOR GESTURE PROCESSING **
        console.error('Gesture processing failed:', processingError);
        const error = processingError;
        const errorInfo = errorRecoveryManager.getErrorInfo(error, 'gesture_processing');
        // Record the failure for circuit breaker logic
        const shouldRetry = errorRecoveryManager.recordFailure(error, 'gesture_processing');
        // Send error notification to React Native
        try {
            (_x = (_w = window.ReactNativeWebView) === null || _w === void 0 ? void 0 : _w.postMessage) === null || _x === void 0 ? void 0 : _x.call(_w, JSON.stringify({
                type: 'gesture_processing_error',
                message: errorInfo.userMessage,
                code: errorInfo.code,
                recoverable: errorInfo.recoverable,
                severity: errorInfo.severity,
                suggestedAction: errorInfo.suggestedAction,
                systemHealth: errorRecoveryManager.getHealthStatus(),
                timestamp: timestamp
            }));
        }
        catch (msgError) {
            console.error('Failed to send error message to React Native:', msgError);
        }
        // Activate appropriate recovery mode based on error type
        if (errorInfo.severity === 'critical') {
            errorRecoveryManager.activateEmergencyMode();
        }
        else {
            // Prefer enabling fallback when not critical to maintain functionality
            errorRecoveryManager.activateFallbackMode();
        }
        // Try fallback gesture detection if we have landmarks
        if ((results === null || results === void 0 ? void 0 : results.landmarks) && errorRecoveryManager.canAttemptRecovery('gesture_processing')) {
            try {
                const fallbackResult = fallbackGestureDetector.detectGesture(results.landmarks.map((hand) => hand.map((lm) => { var _a; return [lm.x, lm.y, (_a = lm.z) !== null && _a !== void 0 ? _a : 0]; })));
                if (fallbackResult.gesture && fallbackResult.confidence > 0.2) {
                    // Send fallback result
                    (_z = (_y = window.ReactNativeWebView) === null || _y === void 0 ? void 0 : _y.postMessage) === null || _z === void 0 ? void 0 : _z.call(_y, JSON.stringify({
                        type: 'gesture',
                        gesture: fallbackResult.gesture,
                        confidence: fallbackResult.confidence,
                        isFallback: true,
                        errorRecovery: true,
                        timestamp: timestamp,
                        systemHealth: errorRecoveryManager.getHealthStatus()
                    }));
                    errorRecoveryManager.recordSuccessfulRecovery('gesture_processing');
                }
            }
            catch (fallbackError) {
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
    }
    catch (err) {
        console.warn('Failed to resize overlay:', err);
    }
}
function startCamera() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        resetGestureChangeState();
        // Additional reset for tremor compensation
        tremorCompensator.clearHistory();
        lastProcessedLandmarks = [];
        try {
            if (mainGestureDetector) {
                yield mainGestureDetector.start();
            }
            else {
                throw new Error('Gesture detector not initialized');
            }
        }
        catch (err) {
            const error = err;
            const errorInfo = errorRecoveryManager.getErrorInfo(error, 'camera_initialization');
            // Record failure
            errorRecoveryManager.recordFailure(error);
            const msg = `${error.name}: ${error.message}`;
            try {
                (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({
                    type: 'error',
                    message: cameraError + msg,
                    code: errorInfo.code,
                    recoverable: errorInfo.recoverable
                }));
            }
            catch (postErr) {
                console.warn('Failed to send camera error:', postErr);
            }
            throw err;
        }
    });
}
// Start camera only after user interaction unless explicitly allowed
if (window.__autostartCamera === true && ((_g = (_f = navigator.userActivation) === null || _f === void 0 ? void 0 : _f.hasBeenActive) !== null && _g !== void 0 ? _g : false)) {
    startCamera()
        .then(() => {
        var _a, _b, _c;
        (_a = document.getElementById('tapToStart')) === null || _a === void 0 ? void 0 : _a.classList.add('hidden');
        try {
            (_c = (_b = window.ReactNativeWebView) === null || _b === void 0 ? void 0 : _b.postMessage) === null || _c === void 0 ? void 0 : _c.call(_b, JSON.stringify({ type: 'telemetry', event: 'tap_start_autostart' }));
        }
        catch (err) {
            console.warn("Failed to send 'tap_start_autostart' telemetry event:", err);
        }
    })
        .catch((err) => {
        var _a;
        console.warn('Camera autostart failed:', err);
        (_a = document.getElementById('tapToStart')) === null || _a === void 0 ? void 0 : _a.classList.remove('hidden');
    });
}
createGestureRecognizer();
let stopPromise = null;
function stopCamera() {
    return __awaiter(this, void 0, void 0, function* () {
        if (stopPromise)
            return stopPromise;
        stopPromise = (() => __awaiter(this, void 0, void 0, function* () {
            try {
                if (mainGestureDetector) {
                    yield mainGestureDetector.stop();
                }
            }
            catch (e) {
                console.warn('Failed to stop gesture detector:', e);
            }
        }))().finally(() => {
            stopPromise = null;
        });
        return stopPromise;
    });
}
const onPageHide = () => void cleanup();
const onBeforeUnload = () => void cleanup();
const onVisibilityChange = () => {
    if (document.hidden) {
        running = false;
    }
    else {
        running = true;
        lastFrameTs = 0;
        resetGestureChangeState();
        // Ensure overlay matches current layout/DPR after tab visibility changes
        try {
            resizeOverlay();
        }
        catch (e) {
            console.warn('Resize on visibility change failed:', e);
        }
    }
};
// Register event listeners with resource manager
resourceManager.registerEventListener(window, 'pagehide', onPageHide);
resourceManager.registerEventListener(window, 'beforeunload', onBeforeUnload);
resourceManager.registerEventListener(document, 'visibilitychange', onVisibilityChange);
window.addEventListener('pagehide', onPageHide);
window.addEventListener('beforeunload', onBeforeUnload);
document.addEventListener('visibilitychange', onVisibilityChange);
function cleanup() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        if (cleanedUp)
            return;
        cleanedUp = true;
        running = false;
        yield stopCamera();
        // Additional cleanup for DOM elements
        try {
            const tapEl = document.getElementById('tapToStart');
            if (tapEl) {
                tapEl.remove();
            }
        }
        catch (e) {
            console.warn("Failed to remove 'tapToStart' element:", e);
        }
        try {
            overlay.remove();
        }
        catch (e) {
            console.warn("Failed to remove 'overlay' element:", e);
        }
        try {
            video.remove();
        }
        catch (e) {
            console.warn("Failed to remove 'video' element:", e);
        }
        try {
            (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({ type: 'telemetry', event: 'cleanup_done' }));
        }
        catch (e) {
            console.warn("Failed to send 'cleanup_done' telemetry event:", e);
        }
    });
}
// Expose personalized threshold insights for Amy's learning dashboard
window.__getPersonalizedThresholdInsights = () => {
    try {
        const insights = personalizedThresholdManager.getPerformanceInsights();
        const allThresholds = personalizedThresholdManager.getAllPersonalizedThresholds(0.4); // Base threshold
        return {
            performanceInsights: insights,
            personalizedThresholds: allThresholds,
            exportData: personalizedThresholdManager.exportPerformanceData()
        };
    }
    catch (error) {
        console.warn('Failed to get personalized threshold insights:', error);
        return null;
    }
};
// Expose gesture combination management functions
window.__getGestureCombinations = () => {
    try {
        return gestureCombinationManager.getAllCombinations();
    }
    catch (error) {
        console.warn('Failed to get gesture combinations:', error);
        return [];
    }
};
window.__addCustomGestureCombination = (combination) => {
    try {
        gestureCombinationManager.addCustomCombination(combination);
        return true;
    }
    catch (error) {
        console.warn('Failed to add custom gesture combination:', error);
        return false;
    }
};
window.__removeGestureCombination = (combinationName) => {
    try {
        gestureCombinationManager.removeCustomCombination(combinationName);
        return true;
    }
    catch (error) {
        console.warn('Failed to remove gesture combination:', error);
        return false;
    }
};
window.__getCombinationProgress = () => {
    try {
        return gestureCombinationManager.getCombinationProgress();
    }
    catch (error) {
        console.warn('Failed to get combination progress:', error);
        return null;
    }
};
// Expose haptic feedback management functions
window.__updateHapticPreferences = (preferences) => {
    try {
        hapticFeedbackManager.updatePreferences(preferences);
        return true;
    }
    catch (error) {
        console.warn('Failed to update haptic preferences:', error);
        return false;
    }
};
window.__getHapticPreferences = () => {
    try {
        return hapticFeedbackManager.getPreferences();
    }
    catch (error) {
        console.warn('Failed to get haptic preferences:', error);
        return null;
    }
};
window.__getHapticStats = () => {
    try {
        return hapticFeedbackManager.getHapticStats();
    }
    catch (error) {
        console.warn('Failed to get haptic stats:', error);
        return null;
    }
};
// Expose gesture replay management functions
window.__startGestureReplay = (recordingId, options) => {
    try {
        return gestureReplayManager.startReplay(recordingId, options);
    }
    catch (error) {
        console.warn('Failed to start gesture replay:', error);
        return false;
    }
};
window.__stopGestureReplay = () => {
    try {
        gestureReplayManager.stopReplay();
        return true;
    }
    catch (error) {
        console.warn('Failed to stop gesture replay:', error);
        return false;
    }
};
window.__pauseGestureReplay = () => {
    try {
        gestureReplayManager.pauseReplay();
        return true;
    }
    catch (error) {
        console.warn('Failed to pause gesture replay:', error);
        return false;
    }
};
window.__getAvailableReplays = () => {
    try {
        return gestureReplayManager.getAvailableRecordings();
    }
    catch (error) {
        console.warn('Failed to get available replays:', error);
        return [];
    }
};
window.__getReplayStats = () => {
    try {
        return gestureReplayManager.getReplayStats();
    }
    catch (error) {
        console.warn('Failed to get replay stats:', error);
        return null;
    }
};
window.__deleteGestureReplay = (recordingId) => {
    try {
        return gestureReplayManager.deleteRecording(recordingId);
    }
    catch (error) {
        console.warn('Failed to delete gesture replay:', error);
        return false;
    }
};
// Expose navigation gesture management functions
window.__getNavigationGestures = () => {
    try {
        return navigationGestureManager.getAvailableNavigationGestures();
    }
    catch (error) {
        console.warn('Failed to get navigation gestures:', error);
        return [];
    }
};
window.__addNavigationGesture = (gesture) => {
    try {
        navigationGestureManager.addCustomNavigationGesture(gesture);
        return true;
    }
    catch (error) {
        console.warn('Failed to add navigation gesture:', error);
        return false;
    }
};
window.__removeNavigationGesture = (gestureName) => {
    try {
        return navigationGestureManager.removeNavigationGesture(gestureName);
    }
    catch (error) {
        console.warn('Failed to remove navigation gesture:', error);
        return false;
    }
};
window.__updateNavigationGesture = (gestureName, updates) => {
    try {
        return navigationGestureManager.updateNavigationGesture(gestureName, updates);
    }
    catch (error) {
        console.warn('Failed to update navigation gesture:', error);
        return false;
    }
};
window.__getNavigationStats = () => {
    try {
        return navigationGestureManager.getNavigationStats();
    }
    catch (error) {
        console.warn('Failed to get navigation stats:', error);
        return null;
    }
};
window.__getNavigationHoldProgress = (gestureName) => {
    try {
        return navigationGestureManager.getHoldProgress(gestureName);
    }
    catch (error) {
        console.warn('Failed to get navigation hold progress:', error);
        return 0;
    }
};
// Expose visual correction management functions
window.__selectVisualCorrection = (sessionId, selectedGesture) => {
    try {
        return visualCorrectionManager.selectCorrection(sessionId, selectedGesture);
    }
    catch (error) {
        console.warn('Failed to select visual correction:', error);
        return false;
    }
};
window.__cancelVisualCorrection = (sessionId) => {
    try {
        return visualCorrectionManager.cancelCorrection(sessionId);
    }
    catch (error) {
        console.warn('Failed to cancel visual correction:', error);
        return false;
    }
};
window.__getCurrentCorrectionSession = () => {
    try {
        return visualCorrectionManager.getCurrentCorrectionSession();
    }
    catch (error) {
        console.warn('Failed to get current correction session:', error);
        return null;
    }
};
window.__addCustomVisual = (gesture, emoji, description) => {
    try {
        visualCorrectionManager.addCustomVisual(gesture, emoji, description);
        return true;
    }
    catch (error) {
        console.warn('Failed to add custom visual:', error);
        return false;
    }
};
window.__getCorrectionStats = () => {
    try {
        return visualCorrectionManager.getCorrectionStats();
    }
    catch (error) {
        console.warn('Failed to get correction stats:', error);
        return null;
    }
};
// Expose gesture undo management functions
window.__confirmGestureUndo = (sessionId) => {
    try {
        return gestureUndoManager.confirmUndo(sessionId);
    }
    catch (error) {
        console.warn('Failed to confirm gesture undo:', error);
        return false;
    }
};
window.__cancelGestureUndo = (sessionId) => {
    try {
        return gestureUndoManager.cancelUndo(sessionId);
    }
    catch (error) {
        console.warn('Failed to cancel gesture undo:', error);
        return false;
    }
};
window.__getCurrentUndoSession = () => {
    try {
        return gestureUndoManager.getCurrentUndoSession();
    }
    catch (error) {
        console.warn('Failed to get current undo session:', error);
        return null;
    }
};
window.__getUndoableGestures = () => {
    try {
        return gestureUndoManager.getUndoableGestures();
    }
    catch (error) {
        console.warn('Failed to get undoable gestures:', error);
        return [];
    }
};
window.__addCustomUndoGesture = (gesture) => {
    try {
        gestureUndoManager.addCustomUndoGesture(gesture);
        return true;
    }
    catch (error) {
        console.warn('Failed to add custom undo gesture:', error);
        return false;
    }
};
window.__getUndoStats = () => {
    try {
        return gestureUndoManager.getUndoStats();
    }
    catch (error) {
        console.warn('Failed to get undo stats:', error);
        return null;
    }
};
window.__getUndoHoldProgress = (gestureName) => {
    try {
        return gestureUndoManager.getUndoHoldProgress(gestureName);
    }
    catch (error) {
        console.warn('Failed to get undo hold progress:', error);
        return 0;
    }
};
window.__cleanupGestureDetector = cleanup;
