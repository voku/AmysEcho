/**
 * Enhanced Context-Aware Recognition System - Amy First Phase 2
 * Provides comprehensive context awareness for gesture recognition
 * including time-of-day patterns, activity levels, and communication habits
 */
export class EnhancedContextAwareRecognizer {
    constructor() {
        this.gestureHistory = [];
        this.communicationHabits = new Map();
        this.MAX_HISTORY = 200; // Increased for better pattern analysis
        this.PATTERN_WINDOW_HOURS = 168; // 7 days for long-term patterns
        this.SHORT_TERM_WINDOW_MINUTES = 60; // 1 hour for recent activity
        this.HABIT_UPDATE_INTERVAL = 24 * 60 * 60 * 1000; // Update habits daily
        // Activity level detection
        this.recentActivity = [];
        this.ACTIVITY_WINDOW_SIZE = 20;
        this.activityBaseline = 0.5; // Baseline activity level
        this.lastActivityUpdate = 0;
        // Stress detection patterns
        this.stressPatterns = {
            morningRush: { start: 7, end: 9, weekdays: true },
            eveningRoutine: { start: 18, end: 20, weekdays: true },
            emergencyFrequency: { threshold: 3, windowMinutes: 30 }
        };
    }
    /**
     * Analyze gesture in comprehensive context
     */
    analyzeContext(gesture, confidence, duration) {
        const now = new Date();
        const hour = now.getHours();
        const dayOfWeek = now.getDay();
        // Determine time of day with more precision
        const timeOfDay = this.determinePreciseTimeOfDay(hour);
        // Detect current activity level
        const activityLevel = this.detectActivityLevel();
        // Add current gesture to history
        const pattern = {
            gesture,
            confidence,
            timestamp: now.getTime(),
            timeOfDay,
            dayOfWeek,
            activityLevel,
            success: confidence >= 0.7,
            duration
        };
        this.addToHistory(pattern);
        this.updateCommunicationHabits(pattern);
        // Analyze patterns and context
        const contextBonus = this.calculateContextBonus(pattern);
        const habitStrength = this.getHabitStrength(gesture, timeOfDay, activityLevel);
        const stressIndicators = this.detectStressIndicators(pattern);
        const recommendations = this.generateRecommendations(pattern, habitStrength);
        // Calculate final adjusted confidence
        const adjustedConfidence = Math.min(1.0, confidence + contextBonus + (habitStrength * 0.1));
        return {
            adjustedConfidence,
            contextBonus,
            timeOfDay,
            activityLevel,
            patternMatch: habitStrength > 0.3,
            recentFrequency: this.getRecentFrequency(gesture),
            habitStrength,
            stressIndicators,
            recommendations
        };
    }
    /**
     * Determine precise time of day with Amy's routine in mind
     */
    determinePreciseTimeOfDay(hour) {
        if (hour >= 6 && hour < 12)
            return 'morning'; // 6 AM - 12 PM (including breakfast/school prep)
        if (hour >= 12 && hour < 17)
            return 'afternoon'; // 12 PM - 5 PM (school/learning time)
        if (hour >= 17 && hour < 21)
            return 'evening'; // 5 PM - 9 PM (dinner/family time)
        return 'night'; // 9 PM - 6 AM (rest time)
    }
    /**
     * Detect activity level based on recent gesture patterns
     */
    detectActivityLevel() {
        const now = Date.now();
        const recentWindow = now - (this.SHORT_TERM_WINDOW_MINUTES * 60 * 1000);
        // Get recent gestures
        const recentGestures = this.gestureHistory.filter(h => h.timestamp > recentWindow);
        if (recentGestures.length < 3) {
            return 'low'; // Not enough activity to determine
        }
        // Calculate activity metrics
        const avgConfidence = recentGestures.reduce((sum, h) => sum + h.confidence, 0) / recentGestures.length;
        const gestureFrequency = recentGestures.length / this.SHORT_TERM_WINDOW_MINUTES; // gestures per minute
        const successRate = recentGestures.filter(h => h.success).length / recentGestures.length;
        // Activity scoring (0-1 scale)
        const confidenceScore = avgConfidence;
        const frequencyScore = Math.min(1, gestureFrequency / 2); // Cap at 2 gestures/minute = high activity
        const successScore = successRate;
        const activityScore = (confidenceScore + frequencyScore + successScore) / 3;
        // Update activity baseline with exponential moving average
        this.activityBaseline = this.activityBaseline * 0.9 + activityScore * 0.1;
        // Classify activity level
        if (activityScore > this.activityBaseline + 0.2)
            return 'high';
        if (activityScore < this.activityBaseline - 0.2)
            return 'low';
        return 'normal';
    }
    /**
     * Add gesture pattern to history with cleanup
     */
    addToHistory(pattern) {
        this.gestureHistory.push(pattern);
        // Keep history size manageable
        if (this.gestureHistory.length > this.MAX_HISTORY) {
            this.gestureHistory.shift();
        }
        // Clean old entries (older than pattern window)
        const cutoffTime = Date.now() - (this.PATTERN_WINDOW_HOURS * 60 * 60 * 1000);
        this.gestureHistory = this.gestureHistory.filter(h => h.timestamp > cutoffTime);
    }
    /**
     * Update communication habits based on new pattern
     */
    updateCommunicationHabits(pattern) {
        const habit = this.communicationHabits.get(pattern.gesture) || {
            gesture: pattern.gesture,
            preferredTimeOfDay: pattern.timeOfDay,
            preferredDayOfWeek: [pattern.dayOfWeek],
            averageConfidence: pattern.confidence,
            successRate: pattern.success ? 1 : 0,
            frequencyScore: 1,
            lastUsed: pattern.timestamp,
            consecutiveSuccesses: pattern.success ? 1 : 0,
            totalAttempts: 1
        };
        // Update existing habit
        const totalAttempts = habit.totalAttempts + 1;
        const newSuccessRate = ((habit.successRate * habit.totalAttempts) + (pattern.success ? 1 : 0)) / totalAttempts;
        const newAvgConfidence = ((habit.averageConfidence * habit.totalAttempts) + pattern.confidence) / totalAttempts;
        // Update preferred time of day (weighted towards recent patterns)
        const timeWeight = pattern.success ? 0.3 : 0.1;
        const currentTimePreference = habit.preferredTimeOfDay;
        habit.preferredTimeOfDay = pattern.timeOfDay; // Simple update - could be more sophisticated
        // Update day preferences
        if (!habit.preferredDayOfWeek.includes(pattern.dayOfWeek)) {
            habit.preferredDayOfWeek.push(pattern.dayOfWeek);
        }
        // Update consecutive successes
        habit.consecutiveSuccesses = pattern.success ? habit.consecutiveSuccesses + 1 : 0;
        // Update frequency score based on recent usage
        const recentUsage = this.gestureHistory.filter(h => h.gesture === pattern.gesture &&
            h.timestamp > pattern.timestamp - (24 * 60 * 60 * 1000) // Last 24 hours
        ).length;
        habit.frequencyScore = Math.min(1, recentUsage / 10); // Normalize to 0-1
        // Update habit
        habit.averageConfidence = newAvgConfidence;
        habit.successRate = newSuccessRate;
        habit.lastUsed = pattern.timestamp;
        habit.totalAttempts = totalAttempts;
        this.communicationHabits.set(pattern.gesture, habit);
    }
    /**
     * Calculate context bonus based on multiple factors
     */
    calculateContextBonus(pattern) {
        let bonus = 0;
        // Time preference bonus
        const habit = this.communicationHabits.get(pattern.gesture);
        if (habit && habit.preferredTimeOfDay === pattern.timeOfDay) {
            bonus += 0.05;
        }
        // Activity level compatibility bonus
        if (this.isActivityCompatible(pattern.gesture, pattern.activityLevel)) {
            bonus += 0.03;
        }
        // Recent success pattern bonus
        const recentSuccesses = this.gestureHistory.filter(h => h.gesture === pattern.gesture &&
            h.success &&
            h.timestamp > pattern.timestamp - (60 * 60 * 1000) // Last hour
        ).length;
        if (recentSuccesses > 0) {
            bonus += Math.min(0.05, recentSuccesses * 0.01);
        }
        // Day of week preference bonus
        if (habit && habit.preferredDayOfWeek.includes(pattern.dayOfWeek)) {
            bonus += 0.02;
        }
        // Emergency gesture priority boost during stress periods
        if (this.isEmergencyGesture(pattern.gesture) && this.isStressPeriod()) {
            bonus += 0.1;
        }
        return bonus;
    }
    /**
     * Get habit strength for a gesture in current context
     */
    getHabitStrength(gesture, timeOfDay, activityLevel) {
        const habit = this.communicationHabits.get(gesture);
        if (!habit)
            return 0;
        let strength = 0;
        // Time preference strength
        if (habit.preferredTimeOfDay === timeOfDay) {
            strength += 0.3;
        }
        // Success rate strength
        strength += habit.successRate * 0.3;
        // Frequency strength
        strength += habit.frequencyScore * 0.2;
        // Recency strength (more recent = stronger)
        const daysSinceLastUse = (Date.now() - habit.lastUsed) / (24 * 60 * 60 * 1000);
        const recencyStrength = Math.max(0, 1 - (daysSinceLastUse / 7)); // Decay over 7 days
        strength += recencyStrength * 0.2;
        return Math.min(1, strength);
    }
    /**
     * Get recent frequency of a gesture
     */
    getRecentFrequency(gesture) {
        const now = Date.now();
        const recentWindow = now - (60 * 60 * 1000); // Last hour
        const recentGestures = this.gestureHistory.filter(h => h.gesture === gesture && h.timestamp > recentWindow);
        return recentGestures.length;
    }
    /**
     * Check if activity level is compatible with gesture
     */
    isActivityCompatible(gesture, activityLevel) {
        // High activity gestures (quick, simple)
        const highActivityGestures = ['thumbs_up', 'fist', 'point'];
        // Low activity gestures (may need more focus)
        const lowActivityGestures = ['open_palm', 'peace'];
        if (activityLevel === 'high' && highActivityGestures.includes(gesture))
            return true;
        if (activityLevel === 'low' && lowActivityGestures.includes(gesture))
            return true;
        if (activityLevel === 'normal')
            return true;
        return false;
    }
    /**
     * Detect stress indicators in current context
     */
    detectStressIndicators(pattern) {
        const indicators = [];
        const now = new Date();
        const hour = now.getHours();
        // Morning rush hour stress
        if (this.stressPatterns.morningRush.weekdays && now.getDay() >= 1 && now.getDay() <= 5) {
            if (hour >= this.stressPatterns.morningRush.start && hour <= this.stressPatterns.morningRush.end) {
                indicators.push('morning_rush');
            }
        }
        // Evening routine stress
        if (this.stressPatterns.eveningRoutine.weekdays && now.getDay() >= 1 && now.getDay() <= 5) {
            if (hour >= this.stressPatterns.eveningRoutine.start && hour <= this.stressPatterns.eveningRoutine.end) {
                indicators.push('evening_routine');
            }
        }
        // Emergency frequency stress
        const emergencyWindow = now.getTime() - (this.stressPatterns.emergencyFrequency.windowMinutes * 60 * 1000);
        const recentEmergencies = this.gestureHistory.filter(h => this.isEmergencyGesture(h.gesture) && h.timestamp > emergencyWindow);
        if (recentEmergencies.length >= this.stressPatterns.emergencyFrequency.threshold) {
            indicators.push('high_emergency_frequency');
        }
        // Low confidence stress (Amy struggling)
        if (pattern.confidence < 0.4) {
            indicators.push('low_confidence_pattern');
        }
        return indicators;
    }
    /**
     * Generate recommendations based on context and patterns
     */
    generateRecommendations(pattern, habitStrength) {
        const recommendations = [];
        // Low habit strength - suggest practice
        if (habitStrength < 0.3) {
            recommendations.push('practice_this_gesture');
        }
        // Time-based recommendations
        const timeOfDay = pattern.timeOfDay;
        if (timeOfDay === 'morning' && pattern.confidence < 0.5) {
            recommendations.push('gentle_morning_mode');
        }
        // Activity-based recommendations
        if (pattern.activityLevel === 'high' && pattern.confidence < 0.6) {
            recommendations.push('simplify_for_high_activity');
        }
        // Success pattern recommendations
        const recentSuccessRate = this.getRecentSuccessRate(pattern.gesture);
        if (recentSuccessRate < 0.5) {
            recommendations.push('focus_on_fundamentals');
        }
        return recommendations;
    }
    /**
     * Check if current period is a stress period
     */
    isStressPeriod() {
        const now = new Date();
        const hour = now.getHours();
        const dayOfWeek = now.getDay();
        // Morning rush (weekdays 7-9 AM)
        if (dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 7 && hour <= 9) {
            return true;
        }
        // Evening routine (weekdays 6-8 PM)
        if (dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 18 && hour <= 20) {
            return true;
        }
        return false;
    }
    /**
     * Check if gesture is emergency-related
     */
    isEmergencyGesture(gesture) {
        const emergencyGestures = ['hilfe', 'help', 'emergency', 'stop', 'danger',
            'notfall', 'gefahr', 'au', 'schmerz', 'angst'];
        return emergencyGestures.includes(gesture.toLowerCase());
    }
    /**
     * Get recent success rate for a gesture
     */
    getRecentSuccessRate(gesture) {
        const now = Date.now();
        const recentWindow = now - (60 * 60 * 1000); // Last hour
        const recentGestures = this.gestureHistory.filter(h => h.gesture === gesture && h.timestamp > recentWindow);
        if (recentGestures.length === 0)
            return 0;
        return recentGestures.filter(h => h.success).length / recentGestures.length;
    }
    /**
     * Get comprehensive context insights
     */
    getContextInsights() {
        const timeOfDayDistribution = {
            morning: 0,
            afternoon: 0,
            evening: 0,
            night: 0
        };
        const activityLevelDistribution = {
            high: 0,
            low: 0,
            normal: 0
        };
        const gestureCounts = {};
        this.gestureHistory.forEach(h => {
            timeOfDayDistribution[h.timeOfDay]++;
            activityLevelDistribution[h.activityLevel]++;
            gestureCounts[h.gesture] = (gestureCounts[h.gesture] || 0) + 1;
        });
        const topGestures = Object.entries(gestureCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([gesture, count]) => ({
            gesture,
            count,
            habitStrength: this.getHabitStrength(gesture, 'afternoon', 'normal') // Default context
        }));
        const patternStrength = this.gestureHistory.length > 20 ?
            (this.gestureHistory.filter(h => h.success).length / this.gestureHistory.length) : 0;
        // Get current stress indicators
        const currentPattern = this.gestureHistory[this.gestureHistory.length - 1];
        const stressPatterns = currentPattern ? this.detectStressIndicators(currentPattern) : [];
        // Get current recommendations
        const recommendations = currentPattern ?
            this.generateRecommendations(currentPattern, this.getHabitStrength(currentPattern.gesture, currentPattern.timeOfDay, currentPattern.activityLevel)) :
            [];
        return {
            totalGestures: this.gestureHistory.length,
            timeOfDayDistribution,
            activityLevelDistribution,
            topGestures,
            patternStrength,
            stressPatterns,
            recommendations
        };
    }
    /**
     * Reset context history (for testing or fresh start)
     */
    reset() {
        this.gestureHistory = [];
        this.communicationHabits.clear();
        this.recentActivity = [];
        this.activityBaseline = 0.5;
        this.lastActivityUpdate = 0;
    }
    /**
     * Export context data for persistence
     */
    exportContextData() {
        return {
            habits: Object.fromEntries(this.communicationHabits),
            baselineActivity: this.activityBaseline,
            totalPatterns: this.gestureHistory.length
        };
    }
    /**
     * Import context data from persistence
     */
    importContextData(data) {
        this.communicationHabits = new Map(Object.entries(data.habits));
        this.activityBaseline = data.baselineActivity;
    }
}
