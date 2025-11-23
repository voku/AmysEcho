// @ts-nocheck
type GestureFeedbackKey = 'thumbs_up' | 'point' | 'open_palm' | 'fist' | 'emergency';

interface GestureFeedbackCopy {
  encouragement: string;
  tip: string;
}

export interface FeedbackAttempt {
  gesture: string;
  effort: number;
  success: boolean;
  attemptCount: number;
  timeSinceLastAttempt: number;
  userMood?: 'calm' | 'frustrated' | 'excited' | 'tired';
  gestureType: 'basic' | 'complex' | 'emergency';
}

export class FeedbackSystem {
  private feedbackHistory: FeedbackAttempt[] = [];
  private readonly MAX_HISTORY = 15;
  private frustrationThreshold = 3; // Consecutive low-effort attempts

  // Mood-aware feedback patterns
  private moodBasedFeedback = {
    calm: {
      high_effort: ['Ruhig und konzentriert - das klappt super!', 'Gelassen und präzise - weiter so!'],
      medium_effort: ['Ganz ruhig bleiben - du schaffst das!', 'Nimm dir Zeit - Qualität vor Schnelligkeit!'],
      low_effort: ['Alles okay - atme tief durch und versuche es nochmal', 'Kein Stress - jeder braucht mal eine Pause']
    },
    frustrated: {
      high_effort: ['Toll! Du gibst nicht auf - das ist der Weg!', 'Deine Beharrlichkeit zahlt sich aus!'],
      medium_effort: ['Du kämpfst weiter - das ist bewundernswert!', 'Jeder Versuch bringt dich näher ans Ziel!'],
      low_effort: ['Pause machen? Das ist völlig in Ordnung!', 'Manchmal braucht man einfach eine kurze Pause']
    },
    excited: {
      high_effort: ['Wow! Deine Energie ist ansteckend!', 'So viel Enthusiasmus - fantastisch!'],
      medium_effort: ['Dein Eifer ist toll - bleib dran!', 'Du machst das mit so viel Herz!'],
      low_effort: ['Auch bei weniger Energie - du gibst dein Bestes!', 'Jeder Moment zählt - auch die kleineren Versuche']
    },
    tired: {
      high_effort: ['Trotz Müdigkeit so präzise - beeindruckend!', 'Deine Ausdauer ist bemerkenswert!'],
      medium_effort: ['Du gibst nicht auf - das ist stark!', 'Auch müde bleibst du am Ball!'],
      low_effort: ['Müdigkeit ist normal - gönn dir eine Pause', 'Ruh dich aus - morgen ist ein neuer Tag']
    }
  };

  // Gesture-specific feedback
  private gestureSpecificFeedback: Record<GestureFeedbackKey, GestureFeedbackCopy> = {
    thumbs_up: {
      encouragement: 'Daumen hoch ist ein wichtiges Zeichen!',
      tip: 'Streck deinen Daumen gerade nach oben'
    },
    point: {
      encouragement: 'Zeigefinger ist super für Kommunikation!',
      tip: 'Streck nur den Zeigefinger aus, andere Finger einrollen'
    },
    open_palm: {
      encouragement: 'Offene Hand zeigt Vertrauen!',
      tip: 'Alle Finger ausstrecken wie zum Winken'
    },
    fist: {
      encouragement: 'Faust ist stark und klar!',
      tip: 'Alle Finger fest zur Faust schließen'
    },
    emergency: {
      encouragement: 'Notfallzeichen sind lebenswichtig!',
      tip: 'Diese Geste hat höchste Priorität'
    }
  };

  // Time-based encouragement to prevent repetition
  private timeBasedVariations = {
    short_break: ['Kurze Pause - dann weiter!', 'Atme durch - du machst das gut!'],
    long_break: ['Zurück und bereit? Super!', 'Frisch und munter - los geht\'s!'],
    consistent_practice: ['Regelmäßigkeit zahlt sich aus!', 'Du bleibst dran - das ist toll!'],
    first_attempt_today: ['Guten Start in den Tag!', 'Frisch und bereit - das wird super!']
  };

  generateFeedback(attemptResult: FeedbackAttempt): {
    primaryMessage: string;
    secondaryMessage: string;
    tip?: string;
    showBreakSuggestion: boolean;
    encouragement: string;
  } {
    // Track feedback history
    this.feedbackHistory.push(attemptResult);
    if (this.feedbackHistory.length > this.MAX_HISTORY) {
      this.feedbackHistory.shift();
    }

    const mood = attemptResult.userMood || this.detectMood(attemptResult);
    const effortLevel = this.categorizeEffort(attemptResult.effort);

    // Get mood-appropriate feedback
    const moodFeedback = this.moodBasedFeedback[mood][effortLevel];
    const primaryMessage = moodFeedback[Math.floor(Math.random() * moodFeedback.length)];

    // Add gesture-specific encouragement
    const fallbackKey: GestureFeedbackKey =
      attemptResult.gestureType === 'emergency' ? 'emergency' : 'thumbs_up';
    const gestureKey = this.isGestureFeedbackKey(attemptResult.gesture)
      ? attemptResult.gesture
      : fallbackKey;
    const gestureFeedback = this.gestureSpecificFeedback[gestureKey];

    // Generate secondary message based on context
    let secondaryMessage = gestureFeedback.encouragement;
    let tip: string | undefined;
    let showBreakSuggestion = false;

    // Check for frustration patterns
    if (this.detectFrustration()) {
      secondaryMessage = 'Manchmal braucht man einfach eine Pause - das ist völlig normal!';
      showBreakSuggestion = true;
    } else if (attemptResult.attemptCount > 5) {
      // Multiple attempts - provide variety
      const variations = this.timeBasedVariations.consistent_practice;
      secondaryMessage = variations[Math.floor(Math.random() * variations.length)];
    } else if (attemptResult.timeSinceLastAttempt > 300000) { // 5 minutes
      const variations = this.timeBasedVariations.long_break;
      secondaryMessage = variations[Math.floor(Math.random() * variations.length)];
    }

    // Add tip for unsuccessful attempts
    if (!attemptResult.success && attemptResult.effort < 0.7) {
      tip = gestureFeedback.tip;
    }

    // Generate overall encouragement
    const encouragement = this.generateEncouragement(attemptResult, mood);

    return {
      primaryMessage,
      secondaryMessage,
      tip,
      showBreakSuggestion,
      encouragement
    };
  }

  private isGestureFeedbackKey(gesture: string): gesture is GestureFeedbackKey {
    return gesture in this.gestureSpecificFeedback;
  }

  private detectMood(attempt: FeedbackAttempt): 'calm' | 'frustrated' | 'excited' | 'tired' {
    if (attempt.userMood) return attempt.userMood;

    const recent = this.feedbackHistory.slice(-5);

    if (recent.length < 3) return 'calm';

    // Detect frustration from consecutive low-effort attempts
    const lowEffortCount = recent.filter(r => r.effort < 0.5).length;
    if (lowEffortCount >= 3) return 'frustrated';

    // Detect excitement from high effort with varying success
    const highEffortCount = recent.filter(r => r.effort > 0.8).length;
    if (highEffortCount >= 3) return 'excited';

    // Detect tiredness from declining effort over time
    const recentEffort = recent.slice(-3).reduce((sum, r) => sum + r.effort, 0) / 3;
    const olderEffort = recent.slice(0, 3).reduce((sum, r) => sum + r.effort, 0) / 3;
    if (recentEffort < olderEffort - 0.2) return 'tired';

    return 'calm';
  }

  private categorizeEffort(effort: number): 'high_effort' | 'medium_effort' | 'low_effort' {
    if (effort > 0.8) return 'high_effort';
    if (effort > 0.6) return 'medium_effort';
    return 'low_effort';
  }

  private detectFrustration(): boolean {
    if (this.feedbackHistory.length < this.frustrationThreshold) return false;

    const recent = this.feedbackHistory.slice(-this.frustrationThreshold);
    const lowEffortCount = recent.filter(r => r.effort < 0.5).length;

    return lowEffortCount >= this.frustrationThreshold;
  }

  private generateEncouragement(attempt: FeedbackAttempt, mood: string): string {
    const encouragements = {
      calm: [
        'Du gehst das ganz ruhig an - das ist perfekt!',
        'Gelassenheit ist deine Superkraft!',
        'Ruhig und sicher - so kommst du ans Ziel!'
      ],
      frustrated: [
        'Du gibst nicht auf - das ist bewundernswert!',
        'Jeder Experte kennt frustrierende Momente!',
        'Deine Beharrlichkeit wird belohnt werden!'
      ],
      excited: [
        'Deine Energie ist ansteckend!',
        'So viel Enthusiasmus - das macht Spaß!',
        'Du gehst mit Herzblut ran!'
      ],
      tired: [
        'Trotz Müdigkeit bleibst du dran - stark!',
        'Ausdauer ist eine der wichtigsten Eigenschaften!',
        'Du zeigst wahre Entschlossenheit!'
      ]
    };

    const moodEncouragements = encouragements[mood as keyof typeof encouragements] || encouragements.calm;
    return moodEncouragements[Math.floor(Math.random() * moodEncouragements.length)];
  }

  getFeedbackStats(): {
    averageEffort: number;
    frustrationLevel: 'low' | 'medium' | 'high';
    recommendedBreak: boolean;
    mostPracticedGesture: string;
  } {
    if (this.feedbackHistory.length === 0) {
      return {
        averageEffort: 0,
        frustrationLevel: 'low',
        recommendedBreak: false,
        mostPracticedGesture: ''
      };
    }

    const averageEffort = this.feedbackHistory.reduce((sum, r) => sum + r.effort, 0) / this.feedbackHistory.length;

    // Calculate frustration level
    const recent = this.feedbackHistory.slice(-5);
    const lowEffortCount = recent.filter(r => r.effort < 0.5).length;
    let frustrationLevel: 'low' | 'medium' | 'high' = 'low';
    if (lowEffortCount >= 3) frustrationLevel = 'high';
    else if (lowEffortCount >= 2) frustrationLevel = 'medium';

    // Find most practiced gesture
    const gestureCounts = this.feedbackHistory.reduce((acc, result) => {
      acc[result.gesture] = (acc[result.gesture] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const mostPracticedGesture = Object.entries(gestureCounts)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || '';

    return {
      averageEffort,
      frustrationLevel,
      recommendedBreak: frustrationLevel === 'high' || averageEffort < 0.4,
      mostPracticedGesture
    };
  }

  reset(): void {
    this.feedbackHistory = [];
  }
}