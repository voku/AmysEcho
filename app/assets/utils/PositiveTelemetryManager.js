/**
 * Positive-Only Telemetry Manager - Amy First Phase 2
 * Focuses exclusively on communication successes and achievements
 * Provides insights for caregivers without highlighting failures
 */
export class PositiveTelemetryManager {
    constructor() {
        this.communicationMoments = [];
        this.successPatterns = new Map();
        this.dailyHighlights = new Map();
        this.MAX_MOMENTS = 1000; // Keep extensive history for patterns
        this.SUCCESS_THRESHOLD = 0.7; // Only track high-confidence successes
        // Achievement tracking
        this.achievements = new Map();
    }
    /**
     * Record a successful communication moment
     */
    recordCommunicationMoment(gesture, confidence, context, duration, emotionalContext) {
        // Only record high-confidence successes
        if (confidence < this.SUCCESS_THRESHOLD) {
            return;
        }
        const moment = {
            timestamp: Date.now(),
            gesture,
            confidence,
            duration,
            context,
            achievements: this.calculateAchievements(gesture, confidence, context),
            emotionalContext
        };
        this.communicationMoments.push(moment);
        // Keep history size manageable
        if (this.communicationMoments.length > this.MAX_MOMENTS) {
            this.communicationMoments.shift();
        }
        // Update success patterns
        this.updateSuccessPattern(gesture, confidence, context);
        // Update daily highlights
        this.updateDailyHighlights(moment);
        // Check for new achievements
        this.checkForAchievements();
    }
    /**
     * Calculate achievements for this communication moment
     */
    calculateAchievements(gesture, confidence, context) {
        const achievements = [];
        // High confidence achievement
        if (confidence >= 0.9) {
            achievements.push('high_confidence_master');
        }
        // Time-based achievements
        if (context.timeOfDay === 'morning' && confidence >= 0.8) {
            achievements.push('morning_communicator');
        }
        if (context.timeOfDay === 'evening' && confidence >= 0.8) {
            achievements.push('evening_expresser');
        }
        // Activity-based achievements
        if (context.activityLevel === 'high' && confidence >= 0.8) {
            achievements.push('active_communicator');
        }
        // Streak achievements
        const pattern = this.successPatterns.get(gesture);
        if (pattern && pattern.currentStreak >= 5) {
            achievements.push('streak_master');
        }
        if (pattern && pattern.currentStreak >= 10) {
            achievements.push('consistency_champion');
        }
        return achievements;
    }
    /**
     * Update success pattern for a gesture
     */
    updateSuccessPattern(gesture, confidence, context) {
        const existing = this.successPatterns.get(gesture);
        if (existing) {
            // Update existing pattern
            const totalSuccesses = existing.totalSuccesses + 1;
            const newAvgConfidence = ((existing.averageConfidence * existing.totalSuccesses) + confidence) / totalSuccesses;
            // Update streaks
            const timeSinceLastSuccess = Date.now() - existing.lastSuccess;
            const isConsecutive = timeSinceLastSuccess < 300000; // 5 minutes = consecutive
            const currentStreak = isConsecutive ? existing.currentStreak + 1 : 1;
            const bestStreak = Math.max(existing.bestStreak, currentStreak);
            // Update preferred contexts
            const timePreference = existing.preferredTimeOfDay === context.timeOfDay ? existing.preferredTimeOfDay : context.timeOfDay;
            const activityPreference = existing.preferredActivityLevel === context.activityLevel ? existing.preferredActivityLevel : context.activityLevel;
            // Calculate improvement rate (simplified)
            const improvementRate = newAvgConfidence - existing.averageConfidence;
            existing.totalSuccesses = totalSuccesses;
            existing.averageConfidence = newAvgConfidence;
            existing.currentStreak = currentStreak;
            existing.bestStreak = bestStreak;
            existing.preferredTimeOfDay = timePreference;
            existing.preferredActivityLevel = activityPreference;
            existing.lastSuccess = Date.now();
            existing.improvementRate = improvementRate;
        }
        else {
            // Create new pattern
            this.successPatterns.set(gesture, {
                gesture,
                totalSuccesses: 1,
                averageConfidence: confidence,
                bestStreak: 1,
                currentStreak: 1,
                preferredTimeOfDay: context.timeOfDay,
                preferredActivityLevel: context.activityLevel,
                lastSuccess: Date.now(),
                improvementRate: 0
            });
        }
    }
    /**
     * Update daily highlights
     */
    updateDailyHighlights(moment) {
        const today = new Date().toISOString().split('T')[0];
        const existing = this.dailyHighlights.get(today);
        if (existing) {
            existing.totalCommunicationMoments++;
            existing.peakConfidence = Math.max(existing.peakConfidence, moment.confidence);
            // Update most successful gesture
            const gestureSuccesses = this.communicationMoments
                .filter(m => m.gesture === moment.gesture && m.timestamp >= Date.now() - 86400000)
                .length;
            if (gestureSuccesses > this.getGestureSuccessCount(existing.mostSuccessfulGesture)) {
                existing.mostSuccessfulGesture = moment.gesture;
            }
            // Update unique gestures
            const uniqueGestures = new Set(this.communicationMoments
                .filter(m => new Date(m.timestamp).toISOString().split('T')[0] === today)
                .map(m => m.gesture));
            existing.uniqueGestures = uniqueGestures.size;
            // Update emotional highlights
            if (moment.emotionalContext) {
                if (!existing.emotionalHighlights.includes(moment.emotionalContext)) {
                    existing.emotionalHighlights.push(moment.emotionalContext);
                }
            }
        }
        else {
            // Create new daily highlights
            this.dailyHighlights.set(today, {
                date: today,
                totalCommunicationMoments: 1,
                uniqueGestures: 1,
                longestStreak: 1,
                peakConfidence: moment.confidence,
                mostSuccessfulGesture: moment.gesture,
                emotionalHighlights: moment.emotionalContext ? [moment.emotionalContext] : [],
                caregiverInsights: []
            });
        }
    }
    /**
     * Check for new achievements
     */
    checkForAchievements() {
        var _a, _b, _c, _d, _e;
        const totalSuccesses = this.communicationMoments.length;
        // Communication milestones
        if (totalSuccesses >= 10 && !((_a = this.achievements.get('first_steps')) === null || _a === void 0 ? void 0 : _a.unlocked)) {
            this.unlockAchievement('first_steps', 'Took first communication steps! 🎉');
        }
        if (totalSuccesses >= 50 && !((_b = this.achievements.get('growing_voice')) === null || _b === void 0 ? void 0 : _b.unlocked)) {
            this.unlockAchievement('growing_voice', 'Growing voice getting stronger! 🌱');
        }
        if (totalSuccesses >= 100 && !((_c = this.achievements.get('confident_communicator')) === null || _c === void 0 ? void 0 : _c.unlocked)) {
            this.unlockAchievement('confident_communicator', 'Confident communicator emerging! ⭐');
        }
        // Streak achievements
        const maxStreak = Math.max(...Array.from(this.successPatterns.values()).map(p => p.bestStreak));
        if (maxStreak >= 10 && !((_d = this.achievements.get('streak_star')) === null || _d === void 0 ? void 0 : _d.unlocked)) {
            this.unlockAchievement('streak_star', 'Streak star shining bright! ⭐');
        }
        // Diversity achievements
        const uniqueGestures = new Set(this.communicationMoments.map(m => m.gesture)).size;
        if (uniqueGestures >= 5 && !((_e = this.achievements.get('expressive_range')) === null || _e === void 0 ? void 0 : _e.unlocked)) {
            this.unlockAchievement('expressive_range', 'Expressive range expanding! 🎨');
        }
    }
    /**
     * Unlock an achievement
     */
    unlockAchievement(key, description) {
        const emoji = this.getAchievementEmoji(key);
        this.achievements.set(key, {
            unlocked: true,
            unlockTime: Date.now(),
            description,
            emoji
        });
        // Send achievement notification to React Native
        this.sendAchievementNotification(key, description, emoji);
    }
    /**
     * Get emoji for achievement
     */
    getAchievementEmoji(key) {
        const emojiMap = {
            first_steps: '🎉',
            growing_voice: '🌱',
            confident_communicator: '⭐',
            streak_star: '⭐',
            expressive_range: '🎨'
        };
        return emojiMap[key] || '🏆';
    }
    /**
     * Send achievement notification to React Native
     */
    sendAchievementNotification(key, description, emoji) {
        var _a, _b;
        try {
            (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({
                type: 'achievement_unlocked',
                achievement: key,
                description,
                emoji,
                timestamp: Date.now()
            }));
        }
        catch (error) {
            console.warn('Failed to send achievement notification:', error);
        }
    }
    /**
     * Get helper method for gesture success count
     */
    getGestureSuccessCount(gesture) {
        return this.communicationMoments.filter(m => m.gesture === gesture).length;
    }
    /**
     * Get positive insights for caregivers
     */
    getPositiveInsights() {
        // Get success patterns sorted by total successes
        const sortedPatterns = Array.from(this.successPatterns.values())
            .sort((a, b) => b.totalSuccesses - a.totalSuccesses)
            .slice(0, 5)
            .map(pattern => ({
            gesture: pattern.gesture,
            totalSuccesses: pattern.totalSuccesses,
            averageConfidence: pattern.averageConfidence,
            bestStreak: pattern.bestStreak,
            improvement: pattern.improvementRate > 0 ? 'improving' : 'consistent'
        }));
        // Get most recent daily highlights
        const today = new Date().toISOString().split('T')[0];
        const recentHighlights = this.dailyHighlights.get(today) || null;
        // Get unlocked achievements
        const unlockedAchievements = Array.from(this.achievements.values())
            .filter(a => a.unlocked)
            .map(a => {
            var _a;
            return ({
                key: ((_a = Array.from(this.achievements.entries()).find(([, val]) => val === a)) === null || _a === void 0 ? void 0 : _a[0]) || '',
                description: a.description,
                emoji: a.emoji,
                unlockTime: a.unlockTime
            });
        });
        // Generate caregiver tips based on patterns
        const caregiverTips = this.generateCaregiverTips(sortedPatterns, recentHighlights);
        return {
            totalCommunicationMoments: this.communicationMoments.length,
            successPatterns: sortedPatterns,
            recentHighlights,
            achievements: unlockedAchievements,
            caregiverTips
        };
    }
    /**
     * Generate helpful tips for caregivers
     */
    generateCaregiverTips(patterns, highlights) {
        const tips = [];
        if (patterns.length === 0) {
            tips.push('Every communication attempt is a victory! Keep encouraging Amy.');
            return tips;
        }
        // Pattern-based tips
        const topPattern = patterns[0];
        if (topPattern) {
            tips.push(`${topPattern.gesture} is becoming a strong communication tool with ${topPattern.totalSuccesses} successful uses!`);
        }
        // Streak-based tips
        const bestStreak = Math.max(...patterns.map(p => p.bestStreak));
        if (bestStreak >= 5) {
            tips.push(`Amy achieved a ${bestStreak}-gesture streak - consistency is building!`);
        }
        // Time-based tips
        if (highlights && highlights.totalCommunicationMoments > 0) {
            const timeOfDay = new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening';
            tips.push(`${timeOfDay} seems to be a productive time for communication.`);
        }
        // Improvement tips
        const improvingPatterns = patterns.filter(p => p.improvement === 'improving');
        if (improvingPatterns.length > 0) {
            tips.push('Amy is showing improvement in confidence - keep up the great work!');
        }
        return tips;
    }
    /**
     * Get communication timeline (positive moments only)
     */
    getCommunicationTimeline(hours = 24) {
        const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
        return this.communicationMoments
            .filter(moment => moment.timestamp > cutoffTime)
            .sort((a, b) => b.timestamp - a.timestamp);
    }
    /**
     * Export positive telemetry data
     */
    exportPositiveData() {
        return {
            communicationMoments: this.communicationMoments,
            successPatterns: Object.fromEntries(this.successPatterns),
            achievements: Object.fromEntries(this.achievements),
            dailyHighlights: Object.fromEntries(this.dailyHighlights)
        };
    }
    /**
     * Import positive telemetry data
     */
    importPositiveData(data) {
        this.communicationMoments = data.communicationMoments || [];
        this.successPatterns = new Map(Object.entries(data.successPatterns || {}));
        this.achievements = new Map(Object.entries(data.achievements || {}));
        this.dailyHighlights = new Map(Object.entries(data.dailyHighlights || {}));
    }
    /**
     * Reset all positive telemetry data
     */
    reset() {
        this.communicationMoments = [];
        this.successPatterns.clear();
        this.dailyHighlights.clear();
        this.achievements.clear();
    }
}
