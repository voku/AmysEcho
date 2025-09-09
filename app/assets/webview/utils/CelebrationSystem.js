export class CelebrationSystem {
    constructor() {
        this.attemptHistory = [];
        this.MAX_HISTORY = 20;
        this.encouragementPatterns = {
            morning: {
                success: ['🌅 Guten Morgen! Das war toll!', '🌞 Super Start in den Tag!', '☀️ Morgenstund hat Gold im Mund!'],
                effort: ['🌅 Guter Anfang! Weiter so!', '🌞 Du machst das prima!', '☀️ Morgenroutine wird besser!']
            },
            afternoon: {
                success: ['🌤️ Tolle Leistung am Nachmittag!', '🌞 Nachmittags-Erfolg!', '☀️ Du strahlst heute!'],
                effort: ['🌤️ Guter Versuch! Pause machen?', '🌞 Du gibst nicht auf - super!', '☀️ Nachmittag wird besser!']
            },
            evening: {
                success: ['🌙 Abends nochmal perfekt!', '🌃 Toller Tagesabschluss!', '⭐ Du warst heute großartig!'],
                effort: ['🌙 Guter Abendversuch!', '🌃 Morgen ist ein neuer Tag!', '⭐ Du hast heute viel gelernt!']
            }
        };
        this.progressCelebrations = [
            '🎯 Neue Bestleistung!',
            '🚀 Du wirst immer besser!',
            '💪 Starke Verbesserung!',
            '🎉 Persönlicher Rekord!',
            '🌟 Du überraschst dich selbst!'
        ];
        this.gentleEncouragements = [
            'Das wird schon - jeder fängt klein an',
            'Jeder Versuch bringt dich weiter',
            'Du lernst jeden Tag etwas Neues',
            'Es ist okay, wenn es nicht sofort klappt',
            'Du bist mutig, weil du es versuchst',
            'Jeder Experte war mal Anfänger',
            'Du machst das schon richtig gut',
            'Kleine Schritte führen zu großen Erfolgen'
        ];
    }
    generateCelebration(attemptResult) {
        // Track attempt history
        this.attemptHistory.push(attemptResult);
        if (this.attemptHistory.length > this.MAX_HISTORY) {
            this.attemptHistory.shift();
        }
        const timePatterns = this.encouragementPatterns[attemptResult.timeOfDay];
        let message = '';
        let emoji = '';
        let encouragement = '';
        if (attemptResult.success) {
            // Emergency gestures get special handling
            if (attemptResult.isEmergency) {
                message = '🆘 Notfall perfekt erkannt!';
                emoji = '🆘';
                encouragement = 'Du bist sicher - das war wichtig!';
            }
            else {
                // Regular success
                const successMessages = timePatterns.success;
                message = successMessages[Math.floor(Math.random() * successMessages.length)];
                emoji = this.getSuccessEmoji(attemptResult);
                // Check for progress improvement
                if (this.isSignificantProgress(attemptResult)) {
                    encouragement = this.progressCelebrations[Math.floor(Math.random() * this.progressCelebrations.length)];
                }
                else {
                    encouragement = this.getPersonalizedEncouragement(attemptResult);
                }
            }
        }
        else {
            // Handle non-success attempts with care
            if (attemptResult.partialSuccess) {
                message = '✨ Fast geschafft! Das war nah dran!';
                emoji = '✨';
                encouragement = 'Du bist so nah an der Lösung!';
            }
            else {
                // Pure effort-based encouragement
                const effortMessages = timePatterns.effort;
                message = effortMessages[Math.floor(Math.random() * effortMessages.length)];
                emoji = this.getEffortEmoji(attemptResult);
                encouragement = this.getGentleEncouragement(attemptResult);
            }
        }
        return {
            message,
            emoji,
            encouragement,
            showProgress: this.shouldShowProgress(attemptResult)
        };
    }
    getSuccessEmoji(result) {
        const emojis = ['🎉', '🌟', '💫', '✨', '🎊', '🏆', '👏', '🙌'];
        // Use different emojis based on success rate
        if (result.recentSuccessRate > 0.8) {
            return emojis[Math.floor(Math.random() * emojis.length)];
        }
        else {
            // More encouraging emojis for lower success rates
            return ['🌟', '💫', '✨', '🎊'][Math.floor(Math.random() * 4)];
        }
    }
    getEffortEmoji(result) {
        if (result.effort > 0.8) {
            return '💪'; // Strong effort
        }
        else if (result.effort > 0.6) {
            return '👍'; // Good effort
        }
        else {
            return '🤗'; // Gentle encouragement
        }
    }
    isSignificantProgress(result) {
        if (this.attemptHistory.length < 5)
            return false;
        const recent = this.attemptHistory.slice(-5);
        const successRate = recent.filter(r => r.success).length / recent.length;
        return successRate > result.recentSuccessRate + 0.1; // 10% improvement
    }
    getPersonalizedEncouragement(result) {
        // Analyze patterns in attempt history
        const recentAttempts = this.attemptHistory.slice(-10);
        const gestureAttempts = recentAttempts.filter(r => r.gesture === result.gesture);
        if (gestureAttempts.length > 3) {
            // Multiple attempts at same gesture - provide specific encouragement
            return `Du übst "${result.gesture}" - das wird immer besser!`;
        }
        // Time-based encouragement
        switch (result.timeOfDay) {
            case 'morning':
                return 'Guter Start! Der Tag wird super!';
            case 'afternoon':
                return 'Mittagspause? Du machst das toll!';
            case 'evening':
                return 'Toller Tagesabschluss!';
            default:
                return 'Du machst das prima!';
        }
    }
    getGentleEncouragement(result) {
        // Avoid repetitive messages by cycling through encouragements
        const recentMessages = this.attemptHistory
            .slice(-5)
            .map(r => r.effort)
            .filter(effort => effort < 0.7);
        if (recentMessages.length > 2) {
            // Multiple low-effort attempts - use gentler encouragement
            return this.gentleEncouragements[Math.floor(Math.random() * this.gentleEncouragements.length)];
        }
        // Standard effort encouragement
        if (result.effort > 0.5) {
            return 'Guter Versuch! Du lernst dazu!';
        }
        else {
            return 'Jeder Anfang ist schwer - du schaffst das!';
        }
    }
    shouldShowProgress(result) {
        // Show progress indicator for consistent practice
        const recent = this.attemptHistory.slice(-10);
        const gestureCount = recent.filter(r => r.gesture === result.gesture).length;
        return gestureCount >= 3 && result.recentSuccessRate > 0.3;
    }
    getProgressStats() {
        var _a;
        if (this.attemptHistory.length === 0) {
            return {
                totalAttempts: 0,
                successRate: 0,
                mostPracticedGesture: '',
                improvementTrend: 'stable'
            };
        }
        const totalAttempts = this.attemptHistory.length;
        const successRate = this.attemptHistory.filter(r => r.success).length / totalAttempts;
        // Find most practiced gesture
        const gestureCounts = this.attemptHistory.reduce((acc, result) => {
            acc[result.gesture] = (acc[result.gesture] || 0) + 1;
            return acc;
        }, {});
        const mostPracticedGesture = ((_a = Object.entries(gestureCounts)
            .sort(([, a], [, b]) => b - a)[0]) === null || _a === void 0 ? void 0 : _a[0]) || '';
        // Calculate improvement trend
        const recent = this.attemptHistory.slice(-10);
        const older = this.attemptHistory.slice(-20, -10);
        let improvementTrend = 'stable';
        if (recent.length >= 5 && older.length >= 5) {
            const recentRate = recent.filter(r => r.success).length / recent.length;
            const olderRate = older.filter(r => r.success).length / older.length;
            if (recentRate > olderRate + 0.1) {
                improvementTrend = 'improving';
            }
            else if (recentRate < olderRate - 0.1) {
                improvementTrend = 'needs_attention';
            }
        }
        return {
            totalAttempts,
            successRate,
            mostPracticedGesture,
            improvementTrend
        };
    }
    reset() {
        this.attemptHistory = [];
    }
}
