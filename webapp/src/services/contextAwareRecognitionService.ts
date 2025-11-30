/**
 * Context-Aware Recognition Service - Amy First
 *
 * Verbessert die Gestenerkennung durch Berücksichtigung von:
 * - Tageszeitmustern (Morgen vs. Abend)
 * - Aktuelle Gestensequenzen (was Amy typischerweise als Nächstes tut)
 * - Nutzungshäufigkeitsmuster (Amys Lieblingsgesten)
 * - Vertrauensanpassungen basierend auf Kontext
 */

export type Location = 'home' | 'school' | 'playground' | 'other';

export interface GestureContext {
  gesture: string;
  confidence: number;
  timestamp: number;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: number;
  location: Location;
  previousGesture?: string;
  sessionDuration: number;
}

export interface RecognitionPattern {
  gesture: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  location: Location;
  averageConfidence: number;
  frequency: number;
  lastUsed: number;
  commonSequences: Array<{
    nextGesture: string;
    probability: number;
    confidence: number;
  }>;
}

export interface ContextAdjustment {
  confidenceMultiplier: number;
  reason: string;
  priority: 'low' | 'medium' | 'high';
}

const STORAGE_KEY = 'contextAwarePatterns';

class ContextAwareRecognitionService {
  private static instance: ContextAwareRecognitionService;
  private patterns: Map<string, RecognitionPattern> = new Map();
  private recentGestures: GestureContext[] = [];
  private sessionStartTime: number = Date.now();
  private currentLocation: Location = 'home';
  private readonly MAX_RECENT_GESTURES = 20;
  private readonly CONFIDENCE_HISTORY_SIZE = 10;

  private constructor() {
    this.loadPatterns();
  }

  static getInstance(): ContextAwareRecognitionService {
    if (!ContextAwareRecognitionService.instance) {
      ContextAwareRecognitionService.instance = new ContextAwareRecognitionService();
    }
    return ContextAwareRecognitionService.instance;
  }

  setLocation(location: Location): void {
    this.currentLocation = location;
  }

  /**
   * Gestenerkennung für Musterlernen aufzeichnen
   */
  recordGesture(gesture: string, confidence: number, previousGesture?: string): void {
    const now = Date.now();
    const timeOfDay = this.getTimeOfDay();
    const dayOfWeek = new Date().getDay();
    const sessionDuration = (now - this.sessionStartTime) / (1000 * 60);
    const location = this.currentLocation;

    const context: GestureContext = {
      gesture,
      confidence,
      timestamp: now,
      timeOfDay,
      dayOfWeek,
      location,
      sessionDuration
    };

    if (previousGesture) {
      context.previousGesture = previousGesture;
    }

    this.recentGestures.push(context);
    if (this.recentGestures.length > this.MAX_RECENT_GESTURES) {
      this.recentGestures.shift();
    }

    this.updatePattern(gesture, confidence, timeOfDay, location);
    if (previousGesture) {
      this.updateSequenceForPrevious(previousGesture, gesture, confidence, timeOfDay, location);
    }

    if (this.recentGestures.length % 10 === 0) {
      this.savePatterns();
    }
  }

  /**
   * Kontextbasierte Vertrauensanpassung für eine Geste
   */
  getContextAdjustment(gesture: string, baseConfidence: number): ContextAdjustment {
    const timeOfDay = this.getTimeOfDay();
    const patternKey = `${gesture}_${timeOfDay}_${this.currentLocation}`;
    const pattern = this.patterns.get(patternKey);

    let confidenceMultiplier = 1.0;
    let reason = 'Standarderkennung';
    let priority: 'low' | 'medium' | 'high' = 'low';

    if (pattern) {
      const timeAdjustment = this.calculateTimeOfDayAdjustment(pattern, baseConfidence);
      confidenceMultiplier *= timeAdjustment.multiplier;
      if (timeAdjustment.multiplier !== 1.0) {
        reason = timeAdjustment.reason;
        priority = timeAdjustment.priority;
      }
    } else {
      const anyPatterns = Array.from(this.patterns.values()).filter(p => p.gesture === gesture);
      if (anyPatterns.length > 0) {
        confidenceMultiplier *= 1.05;
        reason = 'Bekannte Tageszeitpräferenz erkannt';
        if (priority === 'low') priority = 'medium';
      }
    }

    const sequenceAdjustment = this.getSequenceAdjustment(gesture);
    if (sequenceAdjustment.multiplier > 1.0) {
      confidenceMultiplier *= sequenceAdjustment.multiplier;
      if (sequenceAdjustment.priority === 'high') {
        reason = sequenceAdjustment.reason;
        priority = 'high';
      }
    }

    const frequencyAdjustment = this.getFrequencyAdjustment(gesture);
    if (frequencyAdjustment.multiplier > 1.0) {
      confidenceMultiplier *= frequencyAdjustment.multiplier;
      if (frequencyAdjustment.priority === 'medium' && priority === 'low') {
        reason = frequencyAdjustment.reason;
        priority = 'medium';
      }
    }

    const sessionAdjustment = this.getSessionAdjustment();
    confidenceMultiplier *= sessionAdjustment.multiplier;

    return {
      confidenceMultiplier,
      reason,
      priority
    };
  }

  /**
   * Vorhergesagte nächste Gesten basierend auf aktuellem Kontext
   */
  getPredictedGestures(currentGesture?: string): Array<{gesture: string; probability: number; reason: string}> {
    if (!currentGesture) {
      return this.getTimeOfDayFavorites();
    }

    const timeOfDay = this.getTimeOfDay();
    const patternKey = `${currentGesture}_${timeOfDay}_${this.currentLocation}`;
    const pattern = this.patterns.get(patternKey);

    if (!pattern || !pattern.commonSequences.length) {
      return [];
    }

    return pattern.commonSequences
      .filter(seq => seq.probability > 0.3)
      .map(seq => ({
        gesture: seq.nextGesture,
        probability: seq.probability,
        reason: `Folgt oft auf ${currentGesture} am ${timeOfDay} in ${this.currentLocation}`
      }))
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 3);
  }

  /**
   * Sitzung zurücksetzen
   */
  resetSession(): void {
    this.sessionStartTime = Date.now();
    this.recentGestures = [];
  }

  /**
   * Erkennungseinblicke für Betreuer
   */
  getInsights(): {
    timeOfDayPatterns: Array<{timeOfDay: string; favoriteGesture: string; confidence: number}>;
    commonSequences: Array<{from: string; to: string; frequency: number}>;
    confidenceTrends: Array<{gesture: string; trend: 'improving' | 'stable' | 'declining'}>;
  } {
    return {
      timeOfDayPatterns: this.getTimeOfDayPatterns(),
      commonSequences: this.getCommonSequences(),
      confidenceTrends: this.getConfidenceTrends()
    };
  }

  private getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  private updatePattern(
    gesture: string,
    confidence: number,
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night',
    location: Location
  ): void {
    const patternKey = `${gesture}_${timeOfDay}_${location}`;
    const existing = this.patterns.get(patternKey);

    if (existing) {
      const newFrequency = existing.frequency + 1;
      const newAverageConfidence = (existing.averageConfidence * existing.frequency + confidence) / newFrequency;

      existing.frequency = newFrequency;
      existing.averageConfidence = newAverageConfidence;
      existing.lastUsed = Date.now();
    } else {
      this.patterns.set(patternKey, {
        gesture,
        timeOfDay,
        location,
        averageConfidence: confidence,
        frequency: 1,
        lastUsed: Date.now(),
        commonSequences: []
      });
    }
  }

  private updateSequenceForPrevious(
    previousGesture: string,
    currentGesture: string,
    confidence: number,
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night',
    location: Location
  ): void {
    const prevKey = `${previousGesture}_${timeOfDay}_${location}`;
    let pattern = this.patterns.get(prevKey);
    if (!pattern) {
      pattern = {
        gesture: previousGesture,
        timeOfDay,
        location,
        averageConfidence: confidence,
        frequency: 1,
        lastUsed: Date.now(),
        commonSequences: []
      };
      this.patterns.set(prevKey, pattern);
    }
    const existingSeq = pattern.commonSequences.find(seq => seq.nextGesture === currentGesture);

    if (existingSeq) {
      const newProbability = (existingSeq.probability * existingSeq.confidence + confidence) / (existingSeq.confidence + 1);
      existingSeq.probability = Math.min(1.0, newProbability + 0.1);
      existingSeq.confidence += 1;
    } else {
      pattern.commonSequences.push({
        nextGesture: currentGesture,
        probability: 0.5,
        confidence: 1
      });
    }

    pattern.commonSequences.sort((a, b) => b.probability - a.probability);
    pattern.commonSequences = pattern.commonSequences.slice(0, 5);
  }

  private calculateTimeOfDayAdjustment(pattern: RecognitionPattern, baseConfidence: number): {multiplier: number; reason: string; priority: 'low' | 'medium' | 'high'} {
    const confidenceDiff = baseConfidence - pattern.averageConfidence;
    const absDiff = Math.abs(confidenceDiff);

    if (pattern.frequency < 2) {
      return { multiplier: 1.0, reason: 'Unzureichende Tageszeitdaten', priority: 'low' };
    }

    if (absDiff < 0.1) {
      return { multiplier: 1.05, reason: 'Leichte Tageszeitpräferenz erkannt', priority: 'medium' };
    }

    if (confidenceDiff > 0.15) {
      return {
        multiplier: 1.15,
        reason: `Amy ist besonders sicher mit ${pattern.gesture} am ${pattern.timeOfDay}`,
        priority: 'high'
      };
    }

    if (confidenceDiff < -0.15) {
      return {
        multiplier: 0.9,
        reason: `Amy hat typischerweise Schwierigkeiten mit ${pattern.gesture} am ${pattern.timeOfDay}`,
        priority: 'medium'
      };
    }

    return { multiplier: 1.02, reason: 'Leichte Tageszeitpräferenz erkannt', priority: 'low' };
  }

  private getSequenceAdjustment(gesture: string): {multiplier: number; reason: string; priority: 'low' | 'medium' | 'high'} {
    if (this.recentGestures.length < 2) return { multiplier: 1.0, reason: 'Nicht genug Sequenzdaten', priority: 'low' };

    const lastGesture = this.recentGestures[this.recentGestures.length - 1];
    if (!lastGesture) {
      return { multiplier: 1.0, reason: 'Nicht genug Sequenzdaten', priority: 'low' };
    }
    const timeOfDay = this.getTimeOfDay();
    const prevKey = `${lastGesture.gesture}_${timeOfDay}_${lastGesture.location}`;
    const pattern = this.patterns.get(prevKey);

    if (!pattern) return { multiplier: 1.0, reason: 'Kein Sequenzmuster gefunden', priority: 'low' };

    const sequence = pattern.commonSequences.find(seq => seq.nextGesture === gesture);
    if (!sequence || sequence.probability < 0.3) {
      return { multiplier: 1.0, reason: 'Keine starke Sequenzvorhersage', priority: 'low' };
    }

    return {
      multiplier: 1.0 + (sequence.probability * 0.2),
      reason: `Folgt oft auf ${lastGesture.gesture} (${Math.round(sequence.probability * 100)}% Wahrscheinlichkeit)`,
      priority: sequence.probability > 0.6 ? 'high' : 'medium'
    };
  }

  private getFrequencyAdjustment(gesture: string): {multiplier: number; reason: string; priority: 'low' | 'medium' | 'high'} {
    const timeOfDay = this.getTimeOfDay();
    const patternKey = `${gesture}_${timeOfDay}_${this.currentLocation}`;
    const pattern = this.patterns.get(patternKey);

    if (!pattern || pattern.frequency < 3) {
      return { multiplier: 1.0, reason: 'Nicht genug Häufigkeitsdaten', priority: 'low' };
    }

    const timeOfDayPatterns = Array.from(this.patterns.values())
      .filter(p => p.timeOfDay === timeOfDay && p.location === this.currentLocation);

    if (timeOfDayPatterns.length < 2) {
      return { multiplier: 1.0, reason: 'Nicht genug Vergleichsdaten', priority: 'low' };
    }

    const avgFrequency = timeOfDayPatterns.reduce((sum, p) => sum + p.frequency, 0) / timeOfDayPatterns.length;
    const relativeFrequency = pattern.frequency / avgFrequency;

    if (relativeFrequency > 1.5) {
      return {
        multiplier: 1.1,
        reason: `${gesture} ist eine von Amys Lieblingsgesten am ${timeOfDay}`,
        priority: 'medium'
      };
    }

    return { multiplier: 1.0, reason: 'Standardhäufigkeit', priority: 'low' };
  }

  private getSessionAdjustment(): {multiplier: number; reason: string} {
    const sessionMinutes = (Date.now() - this.sessionStartTime) / (1000 * 60);

    if (sessionMinutes < 5) {
      return { multiplier: 1.0, reason: 'Frühe Sitzung' };
    }

    if (sessionMinutes > 30) {
      const recentConfidence = this.getRecentAverageConfidence();
      if (recentConfidence > 0.7) {
        return { multiplier: 1.05, reason: 'Amy wird sicherer' };
      } else {
        return { multiplier: 0.95, reason: 'Amy wird möglicherweise müde' };
      }
    }

    return { multiplier: 1.0, reason: 'Mitte der Sitzung' };
  }

  private getRecentAverageConfidence(): number {
    if (this.recentGestures.length === 0) return 0.5;

    const recent = this.recentGestures.slice(-5);
    const sum = recent.reduce((acc, g) => acc + g.confidence, 0);
    return sum / recent.length;
  }

  private getTimeOfDayFavorites(): Array<{gesture: string; probability: number; reason: string}> {
    const timeOfDay = this.getTimeOfDay();
    const location = this.currentLocation;
    const timeOfDayPatterns = Array.from(this.patterns.values())
      .filter(p => p.timeOfDay === timeOfDay && p.location === location)
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 3);

    return timeOfDayPatterns.map(pattern => ({
      gesture: pattern.gesture,
      probability: Math.min(0.8, pattern.frequency / 10),
      reason: `Amys Favorit am ${timeOfDay} (${pattern.frequency} Mal)`
    }));
  }

  private getTimeOfDayPatterns(): Array<{timeOfDay: string; favoriteGesture: string; confidence: number}> {
    const timeOfDays: Array<'morning' | 'afternoon' | 'evening' | 'night'> = ['morning', 'afternoon', 'evening', 'night'];

    return timeOfDays.map(timeOfDay => {
      const patterns = Array.from(this.patterns.values())
        .filter(p => p.timeOfDay === timeOfDay && p.location === this.currentLocation)
        .sort((a, b) => b.frequency - a.frequency);

      const favorite = patterns[0];
      return {
        timeOfDay,
        favoriteGesture: favorite?.gesture || 'keine',
        confidence: favorite?.averageConfidence || 0
      };
    });
  }

  private getCommonSequences(): Array<{from: string; to: string; frequency: number}> {
    const sequences: Array<{from: string; to: string; frequency: number}> = [];

    for (const pattern of this.patterns.values()) {
      if (pattern.location !== this.currentLocation) continue;
      for (const seq of pattern.commonSequences) {
        if (seq.probability > 0.4) {
          sequences.push({
            from: pattern.gesture,
            to: seq.nextGesture,
            frequency: seq.confidence
          });
        }
      }
    }

    return sequences.sort((a, b) => b.frequency - a.frequency).slice(0, 10);
  }

  private getConfidenceTrends(): Array<{gesture: string; trend: 'improving' | 'stable' | 'declining'}> {
    const trends: Array<{gesture: string; trend: 'improving' | 'stable' | 'declining'}> = [];

    const gestureGroups = new Map<string, number[]>();

    for (const gesture of this.recentGestures.slice(-this.CONFIDENCE_HISTORY_SIZE)) {
      if (!gestureGroups.has(gesture.gesture)) {
        gestureGroups.set(gesture.gesture, []);
      }
      gestureGroups.get(gesture.gesture)!.push(gesture.confidence);
    }

    for (const [gesture, confidences] of gestureGroups) {
      if (confidences.length < 3) continue;

      const firstHalf = confidences.slice(0, Math.floor(confidences.length / 2));
      const secondHalf = confidences.slice(Math.floor(confidences.length / 2));

      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      const diff = secondAvg - firstAvg;

      let trend: 'improving' | 'stable' | 'declining';
      if (diff > 0.1) trend = 'improving';
      else if (diff < -0.1) trend = 'declining';
      else trend = 'stable';

      trends.push({ gesture, trend });
    }

    return trends;
  }

  private loadPatterns(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.patterns = new Map(Object.entries(parsed) as [string, RecognitionPattern][]);
      }
    } catch (error) {
      console.warn('[ContextAware] Fehler beim Laden der Muster:', error);
    }
  }

  private savePatterns(): void {
    try {
      const serialized = Object.fromEntries(this.patterns);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
    } catch (error) {
      console.warn('[ContextAware] Fehler beim Speichern der Muster:', error);
    }
  }

  reset(): void {
    this.patterns.clear();
    this.recentGestures = [];
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignorieren
    }
  }
}

export const contextAwareRecognitionService = ContextAwareRecognitionService.getInstance();
