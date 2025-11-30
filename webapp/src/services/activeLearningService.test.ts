/**
 * Tests for Active Learning Service
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ActiveLearningService } from './activeLearningService';

describe('ActiveLearningService', () => {
  let service: ActiveLearningService;

  beforeEach(() => {
    localStorage.clear();
    service = new ActiveLearningService();
  });

  describe('recordUncertainSample', () => {
    it('zeichnet unsichere Proben auf', () => {
      const context = { timeOfDay: 8, activityLevel: 'normal' as const, consecutiveFailures: 0 };
      service.recordUncertainSample('essen', 0.3, [[[0, 0, 0]]], context);
      
      const analytics = service.getLearningAnalytics();
      expect(analytics.totalUncertainSamples).toBe(1);
    });

    it('aktualisiert Lernprioritäten nach unsicheren Proben', () => {
      const context = { timeOfDay: 8, activityLevel: 'normal' as const, consecutiveFailures: 0 };
      service.recordUncertainSample('essen', 0.3, [[[0, 0, 0]]], context);
      
      const analytics = service.getLearningAnalytics();
      expect(analytics.topPriorityGestures.length).toBeGreaterThan(0);
    });
  });

  describe('recordMisclassification', () => {
    it('zeichnet Fehlklassifizierungen auf', () => {
      const context = { timeOfDay: 8, activityLevel: 'normal' as const, consecutiveFailures: 0 };
      service.recordMisclassification('essen', 'trinken', 0.5, 'user', context);
      
      const analytics = service.getLearningAnalytics();
      expect(analytics.totalMisclassifications).toBe(1);
    });

    it('aktualisiert Prioritäten für beide Gesten', () => {
      const context = { timeOfDay: 8, activityLevel: 'normal' as const, consecutiveFailures: 0 };
      service.recordMisclassification('essen', 'trinken', 0.5, 'user', context);
      
      const analytics = service.getLearningAnalytics();
      const gestures = analytics.topPriorityGestures.map(p => p.gesture);
      expect(gestures).toContain('essen');
      expect(gestures).toContain('trinken');
    });
  });

  describe('getPracticeSuggestion', () => {
    it('gibt keine Vorschläge ohne Daten', () => {
      const suggestion = service.getPracticeSuggestion('normal');
      expect(suggestion.shouldSuggest).toBe(false);
    });

    it('schlägt Übung nach Fehlern vor', () => {
      const context = { timeOfDay: 8, activityLevel: 'normal' as const, consecutiveFailures: 3 };
      // Mehrere Fehler aufzeichnen
      for (let i = 0; i < 5; i++) {
        service.recordMisclassification('essen', 'trinken', 0.3, 'user', context);
      }
      
      // Cooldown umgehen durch lange Wartezeit-Simulation
      const data = service.exportLearningData();
      const priority = data.learningPriorities['essen'];
      if (priority) {
        priority.lastPrompted = 0; // Reset Cooldown
      }
      service.importLearningData(data);
      
      const suggestion = service.getPracticeSuggestion('normal');
      expect(suggestion.shouldSuggest).toBe(true);
    });
  });

  describe('recordPracticeResults', () => {
    it('verbessert Erfolgsrate nach erfolgreicher Übung', () => {
      const context = { timeOfDay: 8, activityLevel: 'normal' as const, consecutiveFailures: 0 };
      service.recordMisclassification('essen', 'trinken', 0.3, 'user', context);
      
      const beforeAnalytics = service.getLearningAnalytics();
      const beforeGesture = beforeAnalytics.topPriorityGestures.find(p => p.gesture === 'essen');
      
      service.recordPracticeResults('essen', 0.9);
      
      const afterAnalytics = service.getLearningAnalytics();
      const afterGesture = afterAnalytics.topPriorityGestures.find(p => p.gesture === 'essen');
      
      expect(afterGesture?.successRate).toBeGreaterThanOrEqual(beforeGesture?.successRate ?? 0);
    });
  });

  describe('getLearningAnalytics', () => {
    it('gibt empfohlene Übungszeit zurück', () => {
      const analytics = service.getLearningAnalytics();
      expect(analytics.recommendedPracticeTime).toBeGreaterThanOrEqual(5);
    });

    it('identifiziert Verbesserungsbereiche', () => {
      const context = { timeOfDay: 8, activityLevel: 'normal' as const, consecutiveFailures: 5 };
      for (let i = 0; i < 10; i++) {
        service.recordMisclassification('schwierig', 'falsch', 0.2, 'user', context);
      }
      
      const analytics = service.getLearningAnalytics();
      expect(analytics.improvementAreas).toContain('schwierig');
    });
  });

  describe('exportLearningData / importLearningData', () => {
    it('exportiert und importiert Daten korrekt', () => {
      const context = { timeOfDay: 8, activityLevel: 'normal' as const, consecutiveFailures: 0 };
      service.recordMisclassification('essen', 'trinken', 0.5, 'user', context);
      
      const exported = service.exportLearningData();
      expect(exported.misclassifications.length).toBe(1);
      
      const newService = new ActiveLearningService();
      newService.importLearningData(exported);
      
      const analytics = newService.getLearningAnalytics();
      expect(analytics.totalMisclassifications).toBe(1);
    });
  });

  describe('reset', () => {
    it('setzt alle Daten zurück', () => {
      const context = { timeOfDay: 8, activityLevel: 'normal' as const, consecutiveFailures: 0 };
      service.recordMisclassification('essen', 'trinken', 0.5, 'user', context);
      
      service.reset();
      
      const analytics = service.getLearningAnalytics();
      expect(analytics.totalMisclassifications).toBe(0);
      expect(analytics.totalUncertainSamples).toBe(0);
    });
  });
});
