/**
 * Main orchestrator for gesture recognition system
 * Coordinates all gesture detection components and manages the processing pipeline
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
import { GestureDetector } from './GestureDetector';
import { PerformanceOptimizer } from '../utils/PerformanceOptimizer';
import { MemoryOptimizer } from '../utils/MemoryOptimizer';
import { ProcessingPipeline } from '../utils/ProcessingPipeline';
import { OptimizedTremorCompensator } from '../utils/OptimizedTremorCompensator';
import { GestureSizeNormalizer } from '../gestureProcessing';
import { PartialGestureDetector } from '../gestureProcessing';
import { ErrorRecoveryManager } from '../utils/ErrorRecoveryManager';
import { FallbackGestureDetector } from '../core/FallbackGestureDetector';
import { EmergencyGestureSystem } from '../core/EmergencyGestureSystem';
import { HandStabilityAssistant } from '../core/HandStabilityAssistant';
import { BatteryMonitor } from '../core/BatteryMonitor';
import { loadConfig } from '../config/GestureConfig';
export class GestureRecognitionOrchestrator {
    constructor(video, overlay) {
        this.video = video;
        this.overlay = overlay;
        this.gestureDetector = null;
        this.isInitialized = false;
        this.isRunning = false;
        this.performanceOptimizer = new PerformanceOptimizer();
        this.memoryOptimizer = MemoryOptimizer.getInstance();
        this.processingPipeline = new ProcessingPipeline();
        this.config = loadConfig();
        // Initialize components
        this.initializeComponents();
        this.setupProcessingPipeline();
    }
    /**
     * Initialize all gesture recognition components
     */
    initializeComponents() {
        var _a, _b, _c, _d;
        this.tremorCompensator = new OptimizedTremorCompensator();
        this.sizeNormalizer = new GestureSizeNormalizer();
        this.partialDetector = new PartialGestureDetector();
        this.errorRecoveryManager = new ErrorRecoveryManager();
        this.fallbackDetector = new FallbackGestureDetector();
        this.emergencySystem = new EmergencyGestureSystem();
        this.handStabilityAssistant = new HandStabilityAssistant();
        this.batteryMonitor = new BatteryMonitor();
        // Configure components
        this.sizeNormalizer.setTolerance((_b = (_a = this.config.processing) === null || _a === void 0 ? void 0 : _a.sizeTolerance) !== null && _b !== void 0 ? _b : 0.3);
        this.partialDetector.setThreshold((_d = (_c = this.config.processing) === null || _c === void 0 ? void 0 : _c.partialThreshold) !== null && _d !== void 0 ? _d : 0.6);
    }
    /**
     * Set up the processing pipeline with all necessary steps
     */
    setupProcessingPipeline() {
        var _a, _b, _c, _d;
        // Add processing steps in order of execution
        this.processingPipeline.addStep(new LandmarkPreprocessingStep(this.sizeNormalizer, this.tremorCompensator));
        this.processingPipeline.addStep(new StabilityAnalysisStep(this.handStabilityAssistant));
        this.processingPipeline.addStep(new GestureDetectionStep());
        this.processingPipeline.addStep(new PartialGestureAnalysisStep(this.partialDetector));
        this.processingPipeline.addStep(new EmergencyGestureCheckStep(this.emergencySystem));
        this.processingPipeline.addStep(new FallbackProcessingStep(this.fallbackDetector, this.errorRecoveryManager));
        this.processingPipeline.addStep(new ResultProcessingStep(this.errorRecoveryManager));
        // Configure pipeline optimization
        this.processingPipeline.configureOptimization({
            targetFrameRate: (_b = (_a = this.config.performance) === null || _a === void 0 ? void 0 : _a.targetFrameRate) !== null && _b !== void 0 ? _b : 30,
            landmarkChangeThreshold: (_d = (_c = this.config.processing) === null || _c === void 0 ? void 0 : _c.landmarkChangeThreshold) !== null && _d !== void 0 ? _d : 0.01,
            enableMemoryOptimization: true
        });
    }
    /**
     * Initialize the gesture recognition system
     */
    initialize() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isInitialized)
                return;
            try {
                // Create and initialize the main gesture detector
                this.gestureDetector = new GestureDetector(this.video, this.overlay);
                // Set up result callback
                this.gestureDetector.setResultCallback((results, timestamp) => {
                    this.handleGestureResults(results, timestamp);
                });
                yield this.gestureDetector.initialize();
                // Start monitoring systems
                this.batteryMonitor.startMonitoring();
                this.isInitialized = true;
            }
            catch (error) {
                console.error('Failed to initialize gesture recognition orchestrator:', error);
                throw error;
            }
        });
    }
    /**
     * Start gesture recognition
     */
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (!this.isInitialized) {
                yield this.initialize();
            }
            if (this.isRunning)
                return;
            yield ((_a = this.gestureDetector) === null || _a === void 0 ? void 0 : _a.start());
            this.isRunning = true;
        });
    }
    /**
     * Stop gesture recognition
     */
    stop() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (!this.isRunning)
                return;
            yield ((_a = this.gestureDetector) === null || _a === void 0 ? void 0 : _a.stop());
            this.isRunning = false;
        });
    }
    /**
     * Handle gesture detection results
     */
    handleGestureResults(results, timestamp) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Check if we should process this frame
                if (!this.performanceOptimizer.shouldProcessFrame()) {
                    return;
                }
                // Prepare processing context
                const context = {
                    landmarks: results.landmarks ? [results.landmarks.map(lm => { var _a; return [lm.x, lm.y, (_a = lm.z) !== null && _a !== void 0 ? _a : 0]; })] : [],
                    timestamp,
                    processingStep: 'gesture_results',
                    skipExpensiveSteps: this.shouldSkipExpensiveSteps()
                };
                // Execute processing pipeline
                const processingResult = yield this.processingPipeline.executePipeline(context);
                // Handle processing result
                if (processingResult.gesture || processingResult.confidence > 0) {
                    this.sendGestureResult(processingResult, results);
                }
                // Update performance metrics
                this.performanceOptimizer.recordProcessingTime(processingResult.processingTime);
            }
            catch (error) {
                console.error('Error handling gesture results:', error);
                this.errorRecoveryManager.recordFailure(error, 'gesture_result_processing');
            }
        });
    }
    /**
     * Determine if expensive processing steps should be skipped
     */
    shouldSkipExpensiveSteps() {
        const metrics = this.performanceOptimizer.getPerformanceMetrics();
        return metrics.averageProcessingTime > 50 || this.memoryOptimizer.getMemoryStatus().pressureLevel > 1;
    }
    /**
     * Send gesture result to React Native
     */
    sendGestureResult(processingResult, originalResults) {
        var _a, _b, _c;
        try {
            const payload = {
                type: 'gesture',
                gesture: processingResult.gesture,
                confidence: processingResult.confidence,
                landmarks: processingResult.landmarks,
                handednesses: ((_a = originalResults.handednesses) === null || _a === void 0 ? void 0 : _a.map(h => h.categoryName)) || [],
                timestamp: processingResult.timestamp,
                isFallback: processingResult.isFallback,
                systemHealth: this.errorRecoveryManager.getHealthStatus(),
                processingTime: processingResult.processingTime,
                stepsExecuted: processingResult.stepsExecuted,
                skippedSteps: processingResult.skippedSteps
            };
            (_c = (_b = window.ReactNativeWebView) === null || _b === void 0 ? void 0 : _b.postMessage) === null || _c === void 0 ? void 0 : _c.call(_b, JSON.stringify(payload));
        }
        catch (error) {
            console.warn('Failed to send gesture result:', error);
        }
    }
    /**
     * Get current system status
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            running: this.isRunning,
            performance: this.performanceOptimizer.getPerformanceMetrics(),
            memory: this.memoryOptimizer.getMemoryStatus(),
            health: this.errorRecoveryManager.getHealthStatus()
        };
    }
    /**
     * Cleanup resources
     */
    cleanup() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.stop();
            this.memoryOptimizer.performCleanup();
        });
    }
}
/**
 * Processing step for landmark preprocessing
 */
class LandmarkPreprocessingStep {
    constructor(sizeNormalizer, tremorCompensator) {
        this.sizeNormalizer = sizeNormalizer;
        this.tremorCompensator = tremorCompensator;
        this.name = 'landmark_preprocessing';
        this.isExpensive = false;
    }
    execute(context) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!context.landmarks || context.landmarks.length === 0) {
                return { landmarks: context.landmarks };
            }
            // Apply size normalization
            let processedLandmarks = this.sizeNormalizer.normalizeHandSize(context.landmarks);
            // Apply tremor compensation
            processedLandmarks = this.tremorCompensator.smoothLandmarks(processedLandmarks);
            return {
                landmarks: processedLandmarks,
                preprocessing: {
                    sizeNormalized: true,
                    tremorCompensated: true
                }
            };
        });
    }
}
/**
 * Processing step for stability analysis
 */
class StabilityAnalysisStep {
    constructor(stabilityAssistant) {
        this.stabilityAssistant = stabilityAssistant;
        this.name = 'stability_analysis';
        this.isExpensive = false;
    }
    execute(context) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!context.landmarks || context.landmarks.length === 0) {
                return { stability: { isStable: false, score: 0 } };
            }
            const stability = this.stabilityAssistant.analyzeStability(context.landmarks);
            return {
                stability,
                feedback: stability.feedback
            };
        });
    }
}
/**
 * Processing step for main gesture detection
 */
class GestureDetectionStep {
    constructor() {
        this.name = 'gesture_detection';
        this.isExpensive = true; // MediaPipe processing can be expensive
    }
    execute(context) {
        return __awaiter(this, void 0, void 0, function* () {
            // This would integrate with the main gesture detector
            // For now, return placeholder
            return {
                gesture: null,
                confidence: 0,
                detection: {
                    method: 'mediapipe',
                    processed: true
                }
            };
        });
    }
}
/**
 * Processing step for partial gesture analysis
 */
class PartialGestureAnalysisStep {
    constructor(partialDetector) {
        this.partialDetector = partialDetector;
        this.name = 'partial_gesture_analysis';
        this.isExpensive = false;
    }
    execute(context) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!context.landmarks || context.landmarks.length === 0) {
                return { partial: null };
            }
            // Analyze common gestures for partial completion
            const commonGestures = ['thumbs_up', 'open_palm', 'fist', 'point'];
            let bestPartial = null;
            for (const gesture of commonGestures) {
                const partial = this.partialDetector.analyzePartialCompletion(context.landmarks, gesture);
                if (partial.isPartial && (!bestPartial || partial.completion > bestPartial.completion)) {
                    bestPartial = Object.assign(Object.assign({}, partial), { gesture });
                }
            }
            return { partial: bestPartial };
        });
    }
}
/**
 * Processing step for emergency gesture checking
 */
class EmergencyGestureCheckStep {
    constructor(emergencySystem) {
        this.emergencySystem = emergencySystem;
        this.name = 'emergency_gesture_check';
        this.isExpensive = false;
    }
    execute(context) {
        return __awaiter(this, void 0, void 0, function* () {
            // Emergency gesture checking would be implemented here
            return {
                emergency: {
                    detected: false,
                    priority: 'normal'
                }
            };
        });
    }
}
/**
 * Processing step for fallback gesture detection
 */
class FallbackProcessingStep {
    constructor(fallbackDetector, errorRecoveryManager) {
        this.fallbackDetector = fallbackDetector;
        this.errorRecoveryManager = errorRecoveryManager;
        this.name = 'fallback_processing';
        this.isExpensive = false;
    }
    execute(context) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.errorRecoveryManager.isInFallbackMode()) {
                return { fallback: null };
            }
            if (!context.landmarks || context.landmarks.length === 0) {
                return { fallback: null };
            }
            const fallback = this.fallbackDetector.detectGesture(context.landmarks);
            return {
                fallback,
                isUsingFallback: true
            };
        });
    }
}
/**
 * Processing step for final result processing
 */
class ResultProcessingStep {
    constructor(errorRecoveryManager) {
        this.errorRecoveryManager = errorRecoveryManager;
        this.name = 'result_processing';
        this.isExpensive = false;
    }
    execute(context) {
        return __awaiter(this, void 0, void 0, function* () {
            // Final result processing and validation
            return {
                finalResult: {
                    validated: true,
                    timestamp: context.timestamp
                }
            };
        });
    }
}
