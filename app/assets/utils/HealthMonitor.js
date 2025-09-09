/**
 * Health monitoring system for gesture detection
 * Proactively monitors system health and triggers recovery actions
 */
export class HealthMonitor {
    constructor() {
        this.metrics = {
            frameRate: 0,
            memoryUsage: 0,
            errorRate: 0,
            lastFrameTime: 0,
            consecutiveFailures: 0
        };
        this.frameTimes = [];
        this.MAX_FRAME_HISTORY = 60; // Last 60 frames (~2 seconds at 30fps)
        this.errorCount = 0;
        this.totalFrames = 0;
    }
    /**
     * Record a successful frame processing
     */
    recordFrame(timestamp) {
        this.frameTimes.push(timestamp);
        if (this.frameTimes.length > this.MAX_FRAME_HISTORY) {
            this.frameTimes.shift();
        }
        this.metrics.lastFrameTime = timestamp;
        this.totalFrames++;
        this.metrics.consecutiveFailures = 0;
    }
    /**
     * Record an error
     */
    recordError() {
        this.errorCount++;
        this.metrics.consecutiveFailures++;
    }
    /**
     * Update memory usage estimate
     */
    updateMemoryUsage() {
        // Estimate memory usage (rough approximation)
        this.metrics.memoryUsage = (this.frameTimes.length * 1000) + (this.errorCount * 500);
    }
    /**
     * Calculate current frame rate
     */
    calculateFrameRate() {
        if (this.frameTimes.length < 2)
            return 0;
        const recentFrames = this.frameTimes.slice(-10); // Last 10 frames
        if (recentFrames.length < 2)
            return 0;
        const timeSpan = recentFrames[recentFrames.length - 1] - recentFrames[0];
        const frameCount = recentFrames.length - 1;
        return (frameCount / timeSpan) * 1000; // frames per second
    }
    /**
     * Calculate error rate
     */
    calculateErrorRate() {
        if (this.totalFrames === 0)
            return 0;
        return this.errorCount / this.totalFrames;
    }
    /**
     * Get current health status
     */
    getHealthStatus() {
        this.metrics.frameRate = this.calculateFrameRate();
        this.metrics.errorRate = this.calculateErrorRate();
        this.updateMemoryUsage();
        const issues = [];
        const recommendations = [];
        // Frame rate checks
        if (this.metrics.frameRate < 15) {
            issues.push('Low frame rate detected');
            recommendations.push('Check camera performance and lighting conditions');
        }
        // Error rate checks
        if (this.metrics.errorRate > 0.1) {
            issues.push('High error rate detected');
            recommendations.push('Verify camera permissions and system resources');
        }
        // Memory usage checks
        if (this.metrics.memoryUsage > 50000) {
            issues.push('High memory usage detected');
            recommendations.push('Consider restarting the gesture detection system');
        }
        // Consecutive failures
        if (this.metrics.consecutiveFailures > 5) {
            issues.push('Multiple consecutive failures detected');
            recommendations.push('System may need recovery or fallback mode');
        }
        // Determine overall health
        let overall = 'healthy';
        if (issues.length >= 3 || this.metrics.consecutiveFailures > 10) {
            overall = 'critical';
        }
        else if (issues.length >= 1 || this.metrics.errorRate > 0.05) {
            overall = 'degraded';
        }
        return {
            overall,
            issues,
            recommendations
        };
    }
    /**
     * Get current metrics
     */
    getMetrics() {
        return Object.assign({}, this.metrics);
    }
    /**
     * Reset health monitoring
     */
    reset() {
        this.frameTimes = [];
        this.errorCount = 0;
        this.totalFrames = 0;
        this.metrics = {
            frameRate: 0,
            memoryUsage: 0,
            errorRate: 0,
            lastFrameTime: 0,
            consecutiveFailures: 0
        };
    }
    /**
     * Check if system needs recovery
     */
    needsRecovery() {
        const status = this.getHealthStatus();
        return status.overall === 'critical' || this.metrics.consecutiveFailures > 3;
    }
}
