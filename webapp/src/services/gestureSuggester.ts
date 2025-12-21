/**
 * Sign Language Suggester Service - Amy First
 *
 * Suggests probable Deutsche Gebärdensprache (DGS) signs based on various factors:
 * - Similar hand shapes (landmark analysis)
 * - Recent recognition history
 * - Context (time of day, common patterns)
 * - Common sign confusions
 * 
 * Helps Amy communicate better when sign recognition confidence is low.
 */

import { gestureMeaningService } from './gestureMeaningService';
import { logger } from './logger';

export interface GestureSuggestion {
  id: string;
  label: string; // DGS sign label
  confidence: number;
  reason: 'similarity' | 'history' | 'context' | 'common_confusion';
}

export interface GestureContext {
  recentGestures: string[]; // Recently recognized DGS sign labels
  timeOfDay: number;
  confidence: number;
  landmarks?: number[][][]; // Hand pose landmarks from MediaPipe
  handedness?: string[];
}

/**
 * Provides intelligent DGS sign suggestions when recognition fails or confidence is low.
 */
class GestureSuggester {
  private gestureHistory: string[] = [];
  private readonly MAX_HISTORY = 10;
  private suggestionStats: Record<string, { shown: number; accepted: number }> = {};

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('gestureSuggesterStats');
      if (stored) {
        this.suggestionStats = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('[GestureSuggester] Fehler beim Laden:', error);
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem('gestureSuggesterStats', JSON.stringify(this.suggestionStats));
    } catch (error) {
      console.warn('[GestureSuggester] Fehler beim Speichern:', error);
    }
  }

  /**
   * Get DGS sign suggestions for a failed or low-confidence recognition attempt.
   * 
   * @param failedGesture - The attempted sign label (if known)
   * @param context - Recognition context including landmarks and history
   * @param maxSuggestions - Maximum number of suggestions to return
   * @returns Array of suggested DGS signs with confidence scores
   */
  getSuggestions(
    failedGesture: string | null,
    context: GestureContext,
    maxSuggestions: number = 3
  ): GestureSuggestion[] {
    const suggestions: GestureSuggestion[] = [];

    if (failedGesture) {
      this.addToHistory(failedGesture);
    }

    // 1. Verlaufsbasierte Vorschläge (kürzlich erfolgreiche Gebärden)
    const historySuggestions = this.getHistoryBasedSuggestions(context.recentGestures);
    suggestions.push(...historySuggestions);

    // 2. Ähnlichkeitsbasierte Vorschläge (Handformanalyse)
    if (context.landmarks && context.handedness) {
      const similaritySuggestions = this.getSimilarityBasedSuggestions(
        context.landmarks,
        context.handedness
      );
      suggestions.push(...similaritySuggestions);
    }

    // 3. Kontextbasierte Vorschläge (Tageszeit, Muster)
    const contextSuggestions = this.getContextBasedSuggestions(context);
    suggestions.push(...contextSuggestions);

    // 4. Häufige Verwechslungsvorschläge
    const confusionSuggestions = this.getCommonConfusionSuggestions(failedGesture);
    suggestions.push(...confusionSuggestions);

    // Duplikate entfernen und nach Vertrauen sortieren
    const uniqueSuggestions = this.deduplicateSuggestions(suggestions);
    uniqueSuggestions.forEach(s => {
      const stats = this.suggestionStats[s.id] ?? { shown: 0, accepted: 0 };
      this.suggestionStats[s.id] = stats;
      const successRate = stats.shown > 0 ? stats.accepted / stats.shown : 0;
      const weight = 0.5 + successRate / 2;
      s.confidence *= weight;
    });
    
    const sortedSuggestions = uniqueSuggestions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxSuggestions);

    // Verfolgen wie oft Vorschläge angezeigt werden
    sortedSuggestions.forEach(s => {
      const stats = this.suggestionStats[s.id] ?? { shown: 0, accepted: 0 };
      stats.shown += 1;
      this.suggestionStats[s.id] = stats;
    });

    this.saveToStorage();

    logger.debug('[GestureSuggester] Vorschläge generiert:', sortedSuggestions);
    return sortedSuggestions;
  }

  /**
   * Gebärde zum Verlauf hinzufügen
   */
  private addToHistory(gesture: string): void {
    this.gestureHistory.push(gesture);
    if (this.gestureHistory.length > this.MAX_HISTORY) {
      this.gestureHistory.shift();
    }
  }

  /**
   * Vorschläge basierend auf kürzlich erfolgreichen Gebärden
   */
  private getHistoryBasedSuggestions(recentGestures: string[]): GestureSuggestion[] {
    const suggestions: GestureSuggestion[] = [];
    const recentSet = new Set(recentGestures.slice(-5));

    Array.from(recentSet).forEach((gestureId, index) => {
      const meaning = gestureMeaningService.getMeaning(gestureId);
      if (meaning) {
        const recencyWeight = (recentSet.size - index) / recentSet.size;
        suggestions.push({
          id: meaning.gestureId,
          label: meaning.label,
          confidence: 0.6 * recencyWeight,
          reason: 'history'
        });
      }
    });

    return suggestions;
  }

  /**
   * Vorschläge basierend auf Handformähnlichkeit
   */
  private getSimilarityBasedSuggestions(
    landmarks: number[][][],
    handedness: string[]
  ): GestureSuggestion[] {
    const suggestions: GestureSuggestion[] = [];

    const primaryHand = landmarks[0];
    if (!primaryHand) {
      return suggestions;
    }
    const handShape = this.analyzeHandShape(primaryHand);
    
    // Händigkeit kann für spezifische Gebärden relevant sein
    const isDominantHand = handedness[0]?.toLowerCase() === 'right';
    const confidenceBoost = isDominantHand ? 0.1 : 0; // Dominante Hand oft genauer

    // Gebärden die ähnliche Handformen haben könnten
    const shapeMatches: Record<string, string[]> = {
      'open_palm': ['danke', 'bitte', 'ja'],
      'fist': ['nein', 'fertig'],
      'point': ['ja', 'hilfe', 'mehr'],
      'thumbs_up': ['ja', 'fertig'],
    };

    const possibleMatches = shapeMatches[handShape] || [];
    possibleMatches.forEach(gestureId => {
      const meaning = gestureMeaningService.getMeaning(gestureId);
      if (meaning) {
        suggestions.push({
          id: meaning.gestureId,
          label: meaning.label,
          confidence: 0.5 + confidenceBoost,
          reason: 'similarity'
        });
      }
    });

    return suggestions;
  }

  /**
   * Einfache Handformanalyse
   */
  private analyzeHandShape(landmarks: number[][]): string {
    if (!landmarks || landmarks.length < 21) return 'unknown';

    // Prüfen ob Finger ausgestreckt sind (offene Handfläche)
    const fingerTips = [8, 12, 16, 20];
    const fingerBases = [6, 10, 14, 18];

    let extendedFingers = 0;
    for (let i = 0; i < fingerTips.length; i++) {
      const tipIndex = fingerTips[i];
      const baseIndex = fingerBases[i];
      if (tipIndex === undefined || baseIndex === undefined) {
        continue;
      }
      const tip = landmarks[tipIndex]?.[1];
      const base = landmarks[baseIndex]?.[1];
      if (typeof tip !== 'number' || typeof base !== 'number') {
        continue;
      }
      if (tip < base) {
        extendedFingers++;
      }
    }

    if (extendedFingers >= 3) return 'open_palm';
    if (extendedFingers === 1) return 'point';
    if (extendedFingers === 0) return 'fist';

    // Daumenposition für Daumen hoch prüfen
    const thumbTip = landmarks[4]?.[0];
    const thumbBase = landmarks[2]?.[0];
    if (typeof thumbTip === 'number' && typeof thumbBase === 'number' && thumbTip > thumbBase) return 'thumbs_up';

    return 'unknown';
  }

  /**
   * Vorschläge basierend auf Kontext (Tageszeit, etc.)
   */
  private getContextBasedSuggestions(context: GestureContext): GestureSuggestion[] {
    const suggestions: GestureSuggestion[] = [];
    const hour = Math.floor(context.timeOfDay / 60);

    if (hour >= 6 && hour < 12) { // Morgen
      const meaning = gestureMeaningService.getMeaning('essen');
      if (meaning) {
        suggestions.push({
          id: meaning.gestureId,
          label: meaning.label,
          confidence: 0.4,
          reason: 'context'
        });
      }
    } else if (hour >= 18 && hour < 22) { // Abend
      const meaning = gestureMeaningService.getMeaning('schlafen');
      if (meaning) {
        suggestions.push({
          id: meaning.gestureId,
          label: meaning.label,
          confidence: 0.4,
          reason: 'context'
        });
      }
    }

    return suggestions;
  }

  /**
   * Vorschläge für häufig verwechselte Gebärden
   */
  private getCommonConfusionSuggestions(failedGesture: string | null): GestureSuggestion[] {
    const suggestions: GestureSuggestion[] = [];

    // Häufige Gebärdenverwechslungen
    const confusions: Record<string, string[]> = {
      'ja': ['nein', 'bitte', 'danke'],
      'nein': ['ja', 'fertig'],
      'bitte': ['danke', 'hilfe', 'mehr'],
      'hilfe': ['bitte', 'mehr'],
      'essen': ['trinken'],
      'trinken': ['essen', 'wasser'],
    };

    if (failedGesture && confusions[failedGesture]) {
      confusions[failedGesture].forEach(gestureId => {
        const meaning = gestureMeaningService.getMeaning(gestureId);
        if (meaning) {
          suggestions.push({
            id: meaning.gestureId,
            label: meaning.label,
            confidence: 0.3,
            reason: 'common_confusion'
          });
        }
      });
    }

    return suggestions;
  }

  /**
   * Doppelte Vorschläge entfernen, den mit höchstem Vertrauen behalten
   */
  private deduplicateSuggestions(suggestions: GestureSuggestion[]): GestureSuggestion[] {
    const seen = new Map<string, GestureSuggestion>();

    suggestions.forEach(suggestion => {
      const existing = seen.get(suggestion.id);
      if (!existing || suggestion.confidence > existing.confidence) {
        seen.set(suggestion.id, suggestion);
      }
    });

    return Array.from(seen.values());
  }

  /**
   * Gebärdenverlauf löschen
   */
  clearHistory(): void {
    this.gestureHistory = [];
    this.suggestionStats = {};
    try {
      localStorage.removeItem('gestureSuggesterStats');
    } catch {
      // Ignorieren
    }
  }

  /**
   * Aufzeichnen ob ein Vorschlag vom Benutzer akzeptiert wurde
   */
  recordSuggestionResult(id: string, accepted: boolean): void {
    if (accepted) {
      const stats = (this.suggestionStats[id] ??= { shown: 0, accepted: 0 });
      stats.accepted++;
      if (stats.shown < stats.accepted) {
        stats.shown = stats.accepted;
      }
      this.saveToStorage();
    }
  }

  /**
   * Vorschlagsstatistiken für Tests oder Analysen
   */
  getSuggestionStats(id: string): { shown: number; accepted: number } {
    return this.suggestionStats[id] || { shown: 0, accepted: 0 };
  }
}

export const gestureSuggester = new GestureSuggester();
export default gestureSuggester;
