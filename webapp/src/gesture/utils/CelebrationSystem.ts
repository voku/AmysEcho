export interface AttemptResult {
  success: boolean;
  gesture: string;
  effort: number;
  attemptCount: number;
  timeOfDay: 'morning' | 'afternoon' | 'evening';
  recentSuccessRate: number;
  isEmergency: boolean;
  partialSuccess?: boolean;
}

export class CelebrationSystem {
  private attemptHistory: AttemptResult[] = [];
  private readonly MAX_HISTORY = 20;
  
  // LLM-optimized: Celebration and encouragement thresholds
  private readonly HIGH_SUCCESS_RATE_THRESHOLD = 0.8; // Celebrate exceptional performance
  private readonly HIGH_EFFORT_THRESHOLD = 0.8; // Strong effort recognition
  private readonly GOOD_EFFORT_THRESHOLD = 0.6; // Good effort recognition
  private readonly MODERATE_EFFORT_THRESHOLD = 0.5; // Moderate effort threshold
  private readonly LOW_EFFORT_THRESHOLD = 0.7; // Low effort tracking for gentle encouragement
  private readonly SIGNIFICANT_IMPROVEMENT = 0.1; // 10% improvement is significant
  private readonly MIN_PRACTICE_FOR_PROGRESS = 3; // Minimum practice count to show progress
  private readonly MIN_SUCCESS_RATE_FOR_PROGRESS = 0.3; // Minimum success rate to show progress
  
  private encouragementPatterns = {
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

  private progressCelebrations = [
    '🎯 Neue Bestleistung!',
    '🚀 Du wirst immer besser!',
    '💪 Starke Verbesserung!',
    '🎉 Persönlicher Rekord!',
    '🌟 Du überraschst dich selbst!'
  ];

  private gentleEncouragements = [
    'Das wird schon - jeder fängt klein an',
    'Jeder Versuch bringt dich weiter',
    'Du lernst jeden Tag etwas Neues',
    'Es ist okay, wenn es nicht sofort klappt',
    'Du bist mutig, weil du es versuchst',
    'Jeder Experte war mal Anfänger',
    'Du machst das schon richtig gut',
    'Kleine Schritte führen zu großen Erfolgen'
  ];

  generateCelebration(attemptResult: AttemptResult): {
    message: string;
    emoji: string;
    encouragement: string;
    showProgress: boolean;
  } {
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
      } else {
        // Regular success
        const successMessages = timePatterns.success;
        message = successMessages[Math.floor(Math.random() * successMessages.length)];
        emoji = this.getSuccessEmoji(attemptResult);

        // Check for progress improvement
        if (this.isSignificantProgress(attemptResult)) {
          encouragement = this.progressCelebrations[Math.floor(Math.random() * this.progressCelebrations.length)];
        } else {
          encouragement = this.getPersonalizedEncouragement(attemptResult);
        }
      }
    } else {
      // Handle non-success attempts with care
      if (attemptResult.partialSuccess) {
        message = '✨ Fast geschafft! Das war nah dran!';
        emoji = '✨';
        encouragement = 'Du bist so nah an der Lösung!';
      } else {
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

  private getSuccessEmoji(result: AttemptResult): string {
    const emojis = ['🎉', '🌟', '💫', '✨', '🎊', '🏆', '👏', '🙌'];
    // Use different emojis based on success rate
    if (result.recentSuccessRate > this.HIGH_SUCCESS_RATE_THRESHOLD) {
      return emojis[Math.floor(Math.random() * emojis.length)];
    } else {
      // More encouraging emojis for lower success rates
      return ['🌟', '💫', '✨', '🎊'][Math.floor(Math.random() * 4)];
    }
  }

  private getEffortEmoji(result: AttemptResult): string {
    if (result.effort > this.HIGH_EFFORT_THRESHOLD) {
      return '💪'; // Strong effort
    } else if (result.effort > this.GOOD_EFFORT_THRESHOLD) {
      return '👍'; // Good effort
    } else {
      return '🤗'; // Gentle encouragement
    }
  }

  private isSignificantProgress(result: AttemptResult): boolean {
    if (this.attemptHistory.length < 5) return false;

    const recent = this.attemptHistory.slice(-5);
    const successRate = recent.filter(r => r.success).length / recent.length;

    return successRate > result.recentSuccessRate + this.SIGNIFICANT_IMPROVEMENT;
  }

  private getPersonalizedEncouragement(result: AttemptResult): string {
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

  private getGentleEncouragement(result: AttemptResult): string {
    // Avoid repetitive messages by cycling through encouragements
    const recentMessages = this.attemptHistory
      .slice(-5)
      .map(r => r.effort)
      .filter(effort => effort < this.LOW_EFFORT_THRESHOLD);

    if (recentMessages.length > 2) {
      // Multiple low-effort attempts - use gentler encouragement
      return this.gentleEncouragements[Math.floor(Math.random() * this.gentleEncouragements.length)];
    }

    // Standard effort encouragement
    if (result.effort > this.MODERATE_EFFORT_THRESHOLD) {
      return 'Guter Versuch! Du lernst dazu!';
    } else {
      return 'Jeder Anfang ist schwer - du schaffst das!';
    }
  }

  private shouldShowProgress(result: AttemptResult): boolean {
    // Show progress indicator for consistent practice
    const recent = this.attemptHistory.slice(-10);
    const gestureCount = recent.filter(r => r.gesture === result.gesture).length;

    return gestureCount >= this.MIN_PRACTICE_FOR_PROGRESS && result.recentSuccessRate > this.MIN_SUCCESS_RATE_FOR_PROGRESS;
  }

  getProgressStats(): {
    totalAttempts: number;
    successRate: number;
    mostPracticedGesture: string;
    improvementTrend: 'improving' | 'stable' | 'needs_attention';
  } {
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
    }, {} as Record<string, number>);

    const mostPracticedGesture = Object.entries(gestureCounts)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || '';

    // Calculate improvement trend
    const recent = this.attemptHistory.slice(-10);
    const older = this.attemptHistory.slice(-20, -10);

    let improvementTrend: 'improving' | 'stable' | 'needs_attention' = 'stable';

    if (recent.length >= 5 && older.length >= 5) {
      const recentRate = recent.filter(r => r.success).length / recent.length;
      const olderRate = older.filter(r => r.success).length / older.length;

      if (recentRate > olderRate + this.SIGNIFICANT_IMPROVEMENT) {
        improvementTrend = 'improving';
      } else if (recentRate < olderRate - this.SIGNIFICANT_IMPROVEMENT) {
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

  reset(): void {
    this.attemptHistory = [];
  }
}