/**
 * Active Learning Service - Amy First
 * Intelligently identifies weak areas in gesture recognition and prompts for targeted data collection
 */

export interface UncertainSample {
  timestamp: number;
  gesture: string;
  confidence: number;
  landmarks: number[][][];
  context: {
    timeOfDay: number;
    activityLevel: 'high' | 'low' | 'normal';
    consecutiveFailures: number;
  };
}

export interface Misclassification {
  timestamp: number;
  intendedGesture: string;
  recognizedGesture: string;
  confidence: number;
  correctionSource: 'user' | 'auto';
  context: UncertainSample['context'];
}

export interface LearningPriority {
  gesture: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  reason: string;
  suggestedFrequency: number;
  lastPrompted: number;
  successRate: number;
  totalAttempts: number;
  recentFailures: number;
}

export interface PracticeSuggestion {
  shouldSuggest: boolean;
  gesture: string;
  reason: string;
  urgency: 'immediate' | 'soon' | 'when_convenient';
  expectedImprovement: number;
  timeEstimate: number;
}

const STORAGE_KEY = 'activeLearning';

export class ActiveLearningService {
  private uncertainSamples: UncertainSample[] = [];
  private misclassifications: Misclassification[] = [];
  private learningPriorities: Map<string, LearningPriority> = new Map();
  private readonly MAX_SAMPLES = 1000;
  private readonly PROMPT_COOLDOWN_MS = 5 * 60 * 1000; // 5 Minuten zwischen Aufforderungen
  private readonly ANALYSIS_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 Stunden für Analyse

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        this.importLearningData(data);
      }
    } catch (error) {
      console.warn('[ActiveLearning] Fehler beim Laden aus Storage:', error);
    }
  }

  private saveToStorage(): void {
    try {
      const data = this.exportLearningData();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('[ActiveLearning] Fehler beim Speichern:', error);
    }
  }

  /**
   * Unsichere Erkennungsprobe aufzeichnen
   */
  recordUncertainSample(
    gesture: string,
    confidence: number,
    landmarks: number[][][],
    context: UncertainSample['context']
  ): void {
    const sample: UncertainSample = {
      timestamp: Date.now(),
      gesture,
      confidence,
      landmarks,
      context
    };

    this.uncertainSamples.push(sample);

    if (this.uncertainSamples.length > this.MAX_SAMPLES) {
      this.uncertainSamples.shift();
    }

    this.updateLearningPriority(gesture, 'uncertain_sample');
    this.saveToStorage();
  }

  /**
   * Fehlklassifizierung aufzeichnen (wenn Benutzer Erkennung korrigiert)
   */
  recordMisclassification(
    intendedGesture: string,
    recognizedGesture: string,
    confidence: number,
    correctionSource: 'user' | 'auto' = 'user',
    context: UncertainSample['context']
  ): void {
    const misclassification: Misclassification = {
      timestamp: Date.now(),
      intendedGesture,
      recognizedGesture,
      confidence,
      correctionSource,
      context
    };

    this.misclassifications.push(misclassification);

    this.updateLearningPriority(intendedGesture, 'misclassified_intended');
    this.updateLearningPriority(recognizedGesture, 'misclassified_recognized');

    this.cleanOldData();
    this.saveToStorage();
  }

  /**
   * Lernpriorität für eine Gebärde aktualisieren
   */
  private updateLearningPriority(
    gesture: string,
    reason: string
  ): void {
    const existing = this.learningPriorities.get(gesture);
    const now = Date.now();

    if (existing) {
      existing.totalAttempts++;
      existing.successRate = this.calculateSuccessRate(gesture);
      existing.recentFailures = this.countRecentFailures(gesture);
      existing.priority = this.calculatePriorityLevel(existing);
      existing.lastPrompted = now;
    } else {
      const priority: LearningPriority = {
        gesture,
        priority: 'medium',
        reason,
        suggestedFrequency: 1,
        lastPrompted: 0,
        successRate: this.calculateSuccessRate(gesture),
        totalAttempts: 1,
        recentFailures: 1
      };

      this.learningPriorities.set(gesture, priority);
    }
  }

  /**
   * Erfolgsrate für eine Gebärde berechnen
   */
  private calculateSuccessRate(gesture: string): number {
    const recentMisclassifications = this.misclassifications
      .filter(m => m.intendedGesture === gesture &&
                   m.timestamp > Date.now() - this.ANALYSIS_WINDOW_MS);

    const recentUncertain = this.uncertainSamples
      .filter(s => s.gesture === gesture &&
                   s.timestamp > Date.now() - this.ANALYSIS_WINDOW_MS);

    const totalIssues = recentMisclassifications.length + recentUncertain.length;

    if (totalIssues === 0) return 1.0;

    const estimatedTotalAttempts = totalIssues * 3;
    return Math.max(0, 1 - (totalIssues / estimatedTotalAttempts));
  }

  /**
   * Aktuelle Fehler für eine Gebärde zählen
   */
  private countRecentFailures(gesture: string): number {
    const recentWindow = Date.now() - (60 * 60 * 1000); // Letzte Stunde

    const recentMisclassifications = this.misclassifications
      .filter(m => (m.intendedGesture === gesture || m.recognizedGesture === gesture) &&
                   m.timestamp > recentWindow);

    const recentUncertain = this.uncertainSamples
      .filter(s => s.gesture === gesture && s.timestamp > recentWindow);

    return recentMisclassifications.length + recentUncertain.length;
  }

  /**
   * Prioritätsstufe für eine Gebärde berechnen
   */
  private calculatePriorityLevel(priority: LearningPriority): 'critical' | 'high' | 'medium' | 'low' {
    const { successRate, recentFailures, totalAttempts } = priority;

    if (successRate < 0.3 && recentFailures >= 3 && totalAttempts >= 5) {
      return 'critical';
    }

    if (successRate < 0.5 || recentFailures >= 5) {
      return 'high';
    }

    if (successRate < 0.7 || (totalAttempts < 10 && recentFailures >= 2)) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Übungsvorschlag für aktuellen Kontext erhalten
   */
  getPracticeSuggestion(
    currentActivity: 'high' | 'low' | 'normal'
  ): PracticeSuggestion {
    const now = Date.now();

    const eligiblePriorities = Array.from(this.learningPriorities.values())
      .filter(p => now - p.lastPrompted > this.PROMPT_COOLDOWN_MS)
      .sort((a, b) => this.getPriorityWeight(b) - this.getPriorityWeight(a));

    if (eligiblePriorities.length === 0) {
      return {
        shouldSuggest: false,
        gesture: '',
        reason: 'Keine Übungsprioritäten fällig',
        urgency: 'when_convenient',
        expectedImprovement: 0,
        timeEstimate: 0
      };
    }

    const topPriority = eligiblePriorities[0]!;

    const timeCompatibility = this.checkTimeCompatibility();
    const activityCompatibility = this.checkActivityCompatibility(topPriority.gesture, currentActivity);

    const expectedImprovement = Math.min(0.3, (1 - topPriority.successRate) * 0.5);

    let urgency: 'immediate' | 'soon' | 'when_convenient' = 'when_convenient';
    if (topPriority.priority === 'critical') {
      urgency = 'immediate';
    } else if (topPriority.priority === 'high' && timeCompatibility && activityCompatibility) {
      urgency = 'soon';
    }

    return {
      shouldSuggest: true,
      gesture: topPriority.gesture,
      reason: this.getSuggestionReason(topPriority),
      urgency,
      expectedImprovement,
      timeEstimate: Math.max(2, Math.min(10, 5 - topPriority.successRate * 5))
    };
  }

  /**
   * Prioritätsgewicht für Sortierung erhalten
   */
  private getPriorityWeight(priority: LearningPriority): number {
    const priorityWeights = { critical: 4, high: 3, medium: 2, low: 1 };
    const recencyWeight = Math.max(0, 1 - ((Date.now() - priority.lastPrompted) / (24 * 60 * 60 * 1000)));

    return priorityWeights[priority.priority] + recencyWeight + (priority.recentFailures * 0.1);
  }

  private checkTimeCompatibility(): boolean {
    return true;
  }

  private checkActivityCompatibility(_gesture: string, currentActivity: 'high' | 'low' | 'normal'): boolean {
    if (currentActivity === 'high') {
      return false;
    }
    return true;
  }

  /**
   * Menschenlesbare Begründung für Vorschlag
   */
  private getSuggestionReason(priority: LearningPriority): string {
    switch (priority.priority) {
      case 'critical':
        return `Amy hat Schwierigkeiten mit "${priority.gesture}". Übung würde sehr helfen!`;
      case 'high':
        return `Amy könnte "${priority.gesture}" besser lernen.`;
      case 'medium':
        return `"${priority.gesture}" könnte etwas Übung vertragen.`;
      case 'low':
        return `Möchtest du "${priority.gesture}" üben?`;
      default:
        return `Übungsvorschlag für "${priority.gesture}"`;
    }
  }

  /**
   * Übungsvorschlag als gezeigt markieren
   */
  markSuggestionShown(gesture: string): void {
    const priority = this.learningPriorities.get(gesture);
    if (priority) {
      priority.lastPrompted = Date.now();
      this.saveToStorage();
    }
  }

  /**
   * Übungsergebnisse aufzeichnen
   */
  recordPracticeResults(
    gesture: string,
    successRate: number
  ): void {
    const priority = this.learningPriorities.get(gesture);
    if (priority) {
      const improvement = successRate - priority.successRate;
      if (improvement > 0) {
        priority.successRate = Math.min(1.0, priority.successRate + (improvement * 0.3));
      }

      if (successRate > 0.7) {
        priority.recentFailures = Math.max(0, priority.recentFailures - 1);
      }

      priority.priority = this.calculatePriorityLevel(priority);
      this.saveToStorage();
    }
  }

  /**
   * Lernanalysen für Betreuer
   */
  getLearningAnalytics(): {
    totalUncertainSamples: number;
    totalMisclassifications: number;
    topPriorityGestures: Array<{
      gesture: string;
      priority: string;
      successRate: number;
      recentFailures: number;
    }>;
    improvementAreas: string[];
    recommendedPracticeTime: number;
  } {
    const topPriorities = Array.from(this.learningPriorities.values())
      .sort((a, b) => this.getPriorityWeight(b) - this.getPriorityWeight(a))
      .slice(0, 5)
      .map(p => ({
        gesture: p.gesture,
        priority: p.priority,
        successRate: p.successRate,
        recentFailures: p.recentFailures
      }));

    const improvementAreas = topPriorities
      .filter(p => p.successRate < 0.7)
      .map(p => p.gesture);

    const highPriorityCount = topPriorities.filter(p => p.priority === 'high' || p.priority === 'critical').length;
    const recommendedPracticeTime = Math.max(5, highPriorityCount * 3);

    return {
      totalUncertainSamples: this.uncertainSamples.length,
      totalMisclassifications: this.misclassifications.length,
      topPriorityGestures: topPriorities,
      improvementAreas,
      recommendedPracticeTime
    };
  }

  /**
   * Alte Daten bereinigen
   */
  private cleanOldData(): void {
    const cutoffTime = Date.now() - this.ANALYSIS_WINDOW_MS;

    this.uncertainSamples = this.uncertainSamples.filter(s => s.timestamp > cutoffTime);
    this.misclassifications = this.misclassifications.filter(m => m.timestamp > cutoffTime);
  }

  /**
   * Lerndaten für Persistenz exportieren
   */
  exportLearningData(): {
    uncertainSamples: UncertainSample[];
    misclassifications: Misclassification[];
    learningPriorities: Record<string, LearningPriority>;
  } {
    return {
      uncertainSamples: this.uncertainSamples,
      misclassifications: this.misclassifications,
      learningPriorities: Object.fromEntries(this.learningPriorities)
    };
  }

  /**
   * Lerndaten aus Persistenz importieren
   */
  importLearningData(data: {
    uncertainSamples?: UncertainSample[];
    misclassifications?: Misclassification[];
    learningPriorities?: Record<string, LearningPriority>;
  }): void {
    this.uncertainSamples = data.uncertainSamples || [];
    this.misclassifications = data.misclassifications || [];
    this.learningPriorities = new Map(Object.entries(data.learningPriorities || {}));
  }

  /**
   * Alle Lerndaten zurücksetzen
   */
  reset(): void {
    this.uncertainSamples = [];
    this.misclassifications = [];
    this.learningPriorities.clear();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignorieren
    }
  }
}

// Singleton-Instanz exportieren
export const activeLearningService = new ActiveLearningService();
