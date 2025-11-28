/**
 * Optimized processing pipeline for gesture recognition
 * Manages processing steps efficiently and reduces redundant operations
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
import { PerformanceOptimizer } from './PerformanceOptimizer';
import { MemoryOptimizer } from './MemoryOptimizer';
export class ProcessingPipeline {
    constructor() {
        this.processingSteps = [];
        this.lastProcessingResult = null;
        this.performanceOptimizer = new PerformanceOptimizer();
        this.memoryOptimizer = MemoryOptimizer.getInstance();
    }
    /**
     * Add a processing step to the pipeline
     */
    addStep(step) {
        this.processingSteps.push(step);
    }
    /**
     * Execute the processing pipeline with optimizations
     */
    executePipeline(context) {
        return __awaiter(this, void 0, void 0, function* () {
            const startTime = performance.now();
            const stepsExecuted = [];
            const skippedSteps = [];
            // Check if we should skip processing entirely
            if (!this.performanceOptimizer.shouldProcessFrame()) {
                return this.createSkippedResult(context, startTime);
            }
            let currentLandmarks = context.landmarks;
            let currentConfidence = 0;
            let detectedGesture;
            // Execute each step with optimization
            for (const step of this.processingSteps) {
                const stepStartTime = performance.now();
                try {
                    // Check if we should skip expensive steps
                    if (context.skipExpensiveSteps && step.isExpensive && this.shouldSkipExpensiveStep(step, context)) {
                        skippedSteps.push(step.name);
                        continue;
                    }
                    // Execute the step
                    const stepResult = yield step.execute(Object.assign(Object.assign({}, context), { landmarks: currentLandmarks }));
                    stepsExecuted.push(step.name);
                    // Update context with step results
                    if (stepResult.landmarks) {
                        currentLandmarks = stepResult.landmarks;
                    }
                    if (stepResult.gesture && stepResult.confidence > currentConfidence) {
                        detectedGesture = stepResult.gesture;
                        currentConfidence = stepResult.confidence;
                    }
                    // Record step performance
                    const stepTime = performance.now() - stepStartTime;
                    this.recordStepPerformance(step.name, stepTime);
                }
                catch (error) {
                    console.warn(`Processing step ${step.name} failed:`, error);
                    // Record as executed even if failed (for tracking purposes)
                    stepsExecuted.push(step.name);
                    // Continue with other steps
                }
            }
            const totalTime = performance.now() - startTime;
            this.performanceOptimizer.recordProcessingTime(totalTime);
            const result = {
                gesture: detectedGesture,
                confidence: currentConfidence,
                landmarks: currentLandmarks,
                processingTime: totalTime,
                stepsExecuted,
                skippedSteps
            };
            this.lastProcessingResult = result;
            return result;
        });
    }
    /**
     * Determine if an expensive step should be skipped
     */
    shouldSkipExpensiveStep(step, context) {
        // Skip if we already have a high-confidence result
        if (this.lastProcessingResult && this.lastProcessingResult.confidence > 0.8) {
            return true;
        }
        // Skip if landmarks haven't changed significantly
        if (context.previousLandmarks && this.landmarksUnchanged(context.landmarks, context.previousLandmarks)) {
            return true;
        }
        // Skip based on performance constraints
        const metrics = this.performanceOptimizer.getPerformanceMetrics();
        if (metrics.averageProcessingTime > 50) { // If processing is slow
            return Math.random() < 0.5; // 50% chance to skip expensive steps
        }
        return false;
    }
    /**
     * Check if landmarks have changed significantly
     */
    landmarksUnchanged(current, previous) {
        if (current.length !== previous.length)
            return false;
        for (let handIdx = 0; handIdx < current.length; handIdx++) {
            const currentHand = current[handIdx];
            const previousHand = previous[handIdx];
            if (!currentHand || !previousHand || currentHand.length !== previousHand.length) {
                return false;
            }
            for (let pointIdx = 0; pointIdx < currentHand.length; pointIdx++) {
                const currentPoint = currentHand[pointIdx];
                const previousPoint = previousHand[pointIdx];
                if (!currentPoint || !previousPoint)
                    continue;
                // Check if any coordinate changed significantly
                for (let coord = 0; coord < Math.min(currentPoint.length, previousPoint.length); coord++) {
                    if (Math.abs(currentPoint[coord] - previousPoint[coord]) > 0.01) { // 1% change threshold
                        return false;
                    }
                }
            }
        }
        return true;
    }
    /**
     * Create a result when processing is skipped
     */
    createSkippedResult(context, startTime) {
        var _a, _b;
        return {
            gesture: (_a = this.lastProcessingResult) === null || _a === void 0 ? void 0 : _a.gesture,
            confidence: ((_b = this.lastProcessingResult) === null || _b === void 0 ? void 0 : _b.confidence) || 0,
            landmarks: context.landmarks,
            processingTime: performance.now() - startTime,
            stepsExecuted: [],
            skippedSteps: ['frame_skipped']
        };
    }
    /**
     * Record performance metrics for a processing step
     */
    recordStepPerformance(stepName, executionTime) {
        // Could be enhanced to track per-step performance metrics
        if (executionTime > 100) { // Log slow steps
            console.warn(`Slow processing step: ${stepName} (${executionTime.toFixed(2)}ms)`);
        }
    }
    /**
     * Get pipeline performance metrics
     */
    getPerformanceMetrics() {
        return {
            pipelineMetrics: this.performanceOptimizer.getPerformanceMetrics(),
            stepMetrics: {}, // Could be enhanced to track per-step metrics
            memoryMetrics: this.memoryOptimizer.getMemoryStatus()
        };
    }
    /**
     * Reset pipeline state
     */
    reset() {
        this.lastProcessingResult = null;
        this.performanceOptimizer.reset();
    }
    /**
     * Configure pipeline optimization settings
     */
    configureOptimization(settings) {
        if (settings.targetFrameRate) {
            this.performanceOptimizer.setTargetFrameRate(settings.targetFrameRate);
        }
        if (settings.landmarkChangeThreshold) {
            this.performanceOptimizer.setLandmarkChangeThreshold(settings.landmarkChangeThreshold);
        }
    }
}
