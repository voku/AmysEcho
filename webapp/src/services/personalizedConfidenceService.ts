/**
 * Personalized Confidence Threshold Service - Amy First
 *
 * Passt Vertrauensschwellen dynamisch an basierend auf Amys individuellen Mustern,
 * Tageszeitpräferenzen und Lernfortschritt. Dies stellt optimale Erkennungsgenauigkeit
 * sicher, während es sich an Amys einzigartigen Gestenstil anpasst.
 */

import { contextAwareRecognitionService } from './contextAwareRecognitionService';

export interface ConfidenceProfile {
  gestureId: string;
  baseThreshold: number;
  timeOfDayAdjustments: Record<'morning' | 'afternoon' | 'evening' | 'night', number>;
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
  getPersonalizedThreshold(gestureId: string, baseConfidence: number): PersonalizedThreshold {
    const profile = this.profiles.get(gestureId);
    const timeOfDay = this.getTimeOfDay();
    const contextAdjustment =
      contextAwareRecognitionService.getContextAdjustment(gestureId, baseConfidence) ??
      { confidenceMultiplier: 1.0, reason: 'Keine Kontextanpassung' };

    let threshold = 0.5; // Standardschwelle
    const adjustments: string[] = [];
    let confidence: 'high' | 'medium' | 'low' = 'medium';

    if (profile) {
      // Mit personalisierter Basisschwelle beginnen
      threshold = profile.baseThreshold;
      adjustments.push(`Personalisierte Basis: ${threshold.toFixed(2)}`);

      // Tageszeitanpassung anwenden
      const timeAdjustment = profile.timeOfDayAdjustments[timeOfDay];
      if (typeof timeAdjustment === 'number' && timeAdjustment !== 0) {
        threshold += timeAdjustment;
        threshold = Math.max(0.2, Math.min(0.8, threshold));
        adjustments.push(`${timeOfDay} Anpassung: ${(timeAdjustment > 0 ? '+' : '')}${timeAdjustment.toFixed(2)}`);
      }

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

    // Kontextanpassung vom kontextbewussten Service anwenden
    if (contextAdjustment.confidenceMultiplier !== 1.0) {
      threshold *= contextAdjustment.confidenceMultiplier;
      adjustments.push(`Kontext: ×${contextAdjustment.confidenceMultiplier.toFixed(2)} (${contextAdjustment.reason})`);
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
    const timeOfDay = this.getTimeOfDay();

    const normalizedAdjustments: ConfidenceProfile['timeOfDayAdjustments'] = {
      morning: profile.timeOfDayAdjustments?.morning ?? 0,
      afternoon: profile.timeOfDayAdjustments?.afternoon ?? 0,
      evening: profile.timeOfDayAdjustments?.evening ?? 0,
      night: profile.timeOfDayAdjustments?.night ?? 0,
    };
    profile.timeOfDayAdjustments = normalizedAdjustments;

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

    // Tageszeitpräferenzen bei jedem Versuch aktualisieren
    if (wasSuccessful) {
      profile.timeOfDayAdjustments[timeOfDay] -= this.ADAPTATION_RATE * 0.05;
      profile.timeOfDayAdjustments[timeOfDay] = Math.max(-0.2, profile.timeOfDayAdjustments[timeOfDay]);
    } else if (confidence > profile.baseThreshold - 0.1) {
      profile.timeOfDayAdjustments[timeOfDay] += this.ADAPTATION_RATE * 0.03;
      profile.timeOfDayAdjustments[timeOfDay] = Math.min(0.2, profile.timeOfDayAdjustments[timeOfDay]);
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
    timeOfDayPreferences: Record<string, number>;
    learningProgress: { mastered: number; learning: number; struggling: number };
  } {
    const profiles = Array.from(this.profiles.values());
    const timeOfDayPreferences: Record<'morning' | 'afternoon' | 'evening' | 'night', number> = {
      morning: 0,
      afternoon: 0,
      evening: 0,
      night: 0
    };

    let mastered = 0;
    let learning = 0;
    let struggling = 0;

    profiles.forEach(profile => {
      if (profile.learningProgress > 0.7) mastered++;
      else if (profile.learningProgress > 0.3) learning++;
      else struggling++;

      Object.entries(profile.timeOfDayAdjustments).forEach(([time, adjustment]) => {
        const key = time as 'morning' | 'afternoon' | 'evening' | 'night';
        if (key in timeOfDayPreferences) {
          timeOfDayPreferences[key] += adjustment;
        }
      });
    });

    // Tageszeitpräferenzen mitteln
    (Object.keys(timeOfDayPreferences) as Array<'morning' | 'afternoon' | 'evening' | 'night'>).forEach(time => {
      timeOfDayPreferences[time] /= Math.max(1, profiles.length);
    });

    return {
      totalProfiles: profiles.length,
      averageThreshold: profiles.length > 0
        ? profiles.reduce((sum, p) => sum + p.baseThreshold, 0) / profiles.length
        : 0.5,
      timeOfDayPreferences,
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

  private getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  private createDefaultProfile(gestureId: string): ConfidenceProfile {
    return {
      gestureId,
      baseThreshold: 0.5,
      timeOfDayAdjustments: {
        morning: 0,
        afternoon: 0,
        evening: 0,
        night: 0
      },
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
              timeOfDayAdjustments: {
                morning: value.timeOfDayAdjustments?.morning ?? 0,
                afternoon: value.timeOfDayAdjustments?.afternoon ?? 0,
                evening: value.timeOfDayAdjustments?.evening ?? 0,
                night: value.timeOfDayAdjustments?.night ?? 0,
              },
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
