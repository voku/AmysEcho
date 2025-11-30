/**
 * Personalized Confidence Threshold Service - Amy First
 *
 * Passt Vertrauensschwellen dynamisch an basierend auf Amys individuellen Mustern
 * und Lernfortschritt. Dies stellt optimale Erkennungsgenauigkeit sicher,
 * während es sich an Amys einzigartigen Gestenstil anpasst.
 */

export interface ConfidenceProfile {
  gestureId: string;
  baseThreshold: number;
  learningProgress: number; // 0-1, wie gut Amy diese Geste gelernt hat
  successRate: number; // Rollende Erfolgsrate für diese Geste
  lastUpdated: number;
  attemptCount: number;
}

export interface PersonalizedThreshold {
  threshold: number;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  adjustments: string[];
}

const STORAGE_KEY = 'confidenceProfiles';

class PersonalizedConfidenceService {
  private static instance: PersonalizedConfidenceService;
  private profiles: Map<string, ConfidenceProfile> = new Map();
  private readonly MIN_SAMPLES_FOR_ADAPTATION = 5;
  private readonly ADAPTATION_RATE = 0.1;

  private constructor() {
    this.loadProfiles();
  }

  static getInstance(): PersonalizedConfidenceService {
    if (!PersonalizedConfidenceService.instance) {
      PersonalizedConfidenceService.instance = new PersonalizedConfidenceService();
    }
    return PersonalizedConfidenceService.instance;
  }

  /**
   * Personalisierte Vertrauensschwelle für eine Geste abrufen
   */
  getPersonalizedThreshold(gestureId: string, _baseConfidence: number): PersonalizedThreshold {
    const profile = this.profiles.get(gestureId);

    let threshold = 0.5; // Standardschwelle
    const adjustments: string[] = [];
    let confidence: 'high' | 'medium' | 'low' = 'medium';

    if (profile) {
      // Mit personalisierter Basisschwelle beginnen
      threshold = profile.baseThreshold;
      adjustments.push(`Personalisierte Basis: ${threshold.toFixed(2)}`);

      // Lernfortschrittsanpassung anwenden
      if (profile.learningProgress > 0.7) {
        // Amy hat diese Geste gemeistert - kann strenger sein
        threshold += 0.1;
        adjustments.push('Gemeisterte Geste: +0.1');
        confidence = 'high';
      } else if (profile.learningProgress < 0.3) {
        // Amy lernt noch - nachsichtiger sein
        threshold -= 0.15;
        adjustments.push('Lernende Geste: -0.15');
        confidence = 'low';
      }

      // Erfolgsratenanpassung anwenden
      if (profile.successRate > 0.8) {
        threshold += 0.05;
        adjustments.push('Hohe Erfolgsrate: +0.05');
      } else if (profile.successRate < 0.5) {
        threshold -= 0.1;
        adjustments.push('Niedrige Erfolgsrate: -0.1');
      }

    } else {
      adjustments.push('Verwendung Standardschwelle: 0.5');
      confidence = 'medium';
    }

    // Sicherstellen, dass Schwelle in vernünftigen Grenzen bleibt
    threshold = Math.max(0.2, Math.min(0.9, threshold));

    return {
      threshold,
      reason: this.generateReason(adjustments),
      confidence,
      adjustments
    };
  }

  /**
   * Gestenversuch für Schwellenanpassung aufzeichnen
   */
  recordGestureAttempt(gestureId: string, confidence: number, wasSuccessful: boolean): void {
    const profile = this.profiles.get(gestureId) || this.createDefaultProfile(gestureId);

    if (!Number.isFinite(profile.attemptCount)) {
      console.warn(`Korrupte attemptCount für Geste ${gestureId} zurückgesetzt. Aktueller Wert:`, profile.attemptCount);
      profile.attemptCount = this.MIN_SAMPLES_FOR_ADAPTATION;
    }

    // Erfolgsrate aktualisieren (rollender Durchschnitt)
    const currentSuccessRate = profile.successRate;
    profile.successRate = (currentSuccessRate * 9 + (wasSuccessful ? 1 : 0)) / 10;

    profile.attemptCount += 1;

    const readyForAdaptation = profile.attemptCount >= this.MIN_SAMPLES_FOR_ADAPTATION;

    // Lernfortschritt basierend auf aktueller Leistung aktualisieren
    if (wasSuccessful && confidence > profile.baseThreshold + 0.2) {
      profile.learningProgress = Math.min(1.0, profile.learningProgress + 0.05);
    } else if (!wasSuccessful && confidence < profile.baseThreshold - 0.2) {
      profile.learningProgress = Math.max(0.0, profile.learningProgress - 0.02);
    }

    if (readyForAdaptation) {
      // Basisschwelle basierend auf Erfolgsmustern anpassen
      if (profile.successRate > 0.8 && profile.learningProgress > 0.6) {
        profile.baseThreshold = Math.min(0.7, profile.baseThreshold + this.ADAPTATION_RATE * 0.1);
      } else if (profile.successRate < 0.4) {
        profile.baseThreshold = Math.max(0.3, profile.baseThreshold - this.ADAPTATION_RATE * 0.2);
      }
    }

    profile.lastUpdated = Date.now();
    this.profiles.set(gestureId, profile);

    // Periodisch speichern (alle 10 Versuche)
    if (Math.random() < 0.1) {
      this.saveProfiles();
    }
  }

  /**
   * Vertrauensschwellenstatistiken für Debugging
   */
  getThresholdStats(): {
    totalProfiles: number;
    averageThreshold: number;
    learningProgress: { mastered: number; learning: number; struggling: number };
  } {
    const profiles = Array.from(this.profiles.values());

    let mastered = 0;
    let learning = 0;
    let struggling = 0;

    profiles.forEach(profile => {
      if (profile.learningProgress > 0.7) mastered++;
      else if (profile.learningProgress > 0.3) learning++;
      else struggling++;
    });

    return {
      totalProfiles: profiles.length,
      averageThreshold: profiles.length > 0
        ? profiles.reduce((sum, p) => sum + p.baseThreshold, 0) / profiles.length
        : 0.5,
      learningProgress: { mastered, learning, struggling }
    };
  }

  /**
   * Alle Profile zurücksetzen
   */
  resetProfiles(): void {
    this.profiles.clear();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignorieren
    }
  }

  private createDefaultProfile(gestureId: string): ConfidenceProfile {
    return {
      gestureId,
      baseThreshold: 0.5,
      learningProgress: 0.5,
      successRate: 0.5,
      lastUpdated: Date.now(),
      attemptCount: 0
    };
  }

  private generateReason(adjustments: string[]): string {
    if (adjustments.length === 0) {
      return '';
    }

    const [primary = '', ...rest] = adjustments;
    if (rest.length === 0) {
      return primary;
    }

    return `${primary} (+${rest.length} Anpassungen)`;
  }

  private loadProfiles(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, Partial<ConfidenceProfile>>;
        this.profiles = new Map(
          Object.entries(parsed).map(([gestureId, value]) => [
            gestureId,
            {
              gestureId,
              baseThreshold: value.baseThreshold ?? 0.5,
              learningProgress: value.learningProgress ?? 0.5,
              successRate: value.successRate ?? 0.5,
              lastUpdated: value.lastUpdated ?? Date.now(),
              attemptCount: value.attemptCount ?? 0,
            },
          ]),
        );
      }
    } catch (error) {
      console.warn('[PersonalizedConfidence] Fehler beim Laden der Profile:', error);
    }
  }

  private saveProfiles(): void {
    try {
      const serialized = Object.fromEntries(this.profiles);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
    } catch (error) {
      console.warn('[PersonalizedConfidence] Fehler beim Speichern der Profile:', error);
    }
  }
}

export const personalizedConfidenceService = PersonalizedConfidenceService.getInstance();
