/**
 * Tests for Health Score Service
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { 
  getGestureHealth, 
  shouldPromptPractice, 
  saveInteractionLog,
  saveHistoricalHealthData,
  loadHistoricalHealthData,
  checkForDecliningAccuracy,
  generateProgressReport,
  resetHealthData
} from './healthScore';

describe('HealthScore', () => {
  beforeEach(() => {
    resetHealthData();
  });

  describe('getGestureHealth', () => {
    it('gibt 100% Erfolg ohne Daten zurück', () => {
      const health = getGestureHealth('essen');
      expect(health.successRate).toBe(1);
      expect(health.count).toBe(0);
    });

    it('berechnet Erfolgsrate korrekt', () => {
      saveInteractionLog({
        id: '1',
        gestureDefinitionId: 'essen',
        wasSuccessful: true,
        confidenceScore: 0.9,
        timestamp: Date.now(),
        processedBy: 'local'
      });
      saveInteractionLog({
        id: '2',
        gestureDefinitionId: 'essen',
        wasSuccessful: false,
        confidenceScore: 0.3,
        timestamp: Date.now(),
        processedBy: 'local'
      });
      
      const health = getGestureHealth('essen');
      expect(health.successRate).toBe(0.5);
      expect(health.count).toBe(2);
    });

    it('filtert nach Zeitfenster', () => {
      const oldTime = Date.now() - 48 * 60 * 60 * 1000; // 48 Stunden alt
      
      saveInteractionLog({
        id: '1',
        gestureDefinitionId: 'essen',
        wasSuccessful: false,
        confidenceScore: 0.3,
        timestamp: oldTime,
        processedBy: 'local'
      });
      saveInteractionLog({
        id: '2',
        gestureDefinitionId: 'essen',
        wasSuccessful: true,
        confidenceScore: 0.9,
        timestamp: Date.now(),
        processedBy: 'local'
      });
      
      const health = getGestureHealth('essen', { windowMs: 24 * 60 * 60 * 1000 });
      expect(health.successRate).toBe(1);
      expect(health.count).toBe(1);
    });

    it('filtert nach letzten N Einträgen', () => {
      for (let i = 0; i < 5; i++) {
        saveInteractionLog({
          id: `old-${i}`,
          gestureDefinitionId: 'essen',
          wasSuccessful: false,
          confidenceScore: 0.3,
          timestamp: Date.now() - 1000,
          processedBy: 'local'
        });
      }
      for (let i = 0; i < 5; i++) {
        saveInteractionLog({
          id: `new-${i}`,
          gestureDefinitionId: 'essen',
          wasSuccessful: true,
          confidenceScore: 0.9,
          timestamp: Date.now(),
          processedBy: 'local'
        });
      }
      
      const health = getGestureHealth('essen', { lastN: 5 });
      expect(health.successRate).toBe(1);
      expect(health.count).toBe(5);
    });
  });

  describe('shouldPromptPractice', () => {
    it('gibt false ohne genug Daten', () => {
      saveInteractionLog({
        id: '1',
        gestureDefinitionId: 'essen',
        wasSuccessful: false,
        confidenceScore: 0.3,
        timestamp: Date.now(),
        processedBy: 'local'
      });
      
      expect(shouldPromptPractice('essen')).toBe(false);
    });

    it('gibt true bei niedriger Erfolgsrate und genug Daten', () => {
      for (let i = 0; i < 10; i++) {
        saveInteractionLog({
          id: `log-${i}`,
          gestureDefinitionId: 'essen',
          wasSuccessful: false,
          confidenceScore: 0.3,
          timestamp: Date.now(),
          processedBy: 'local'
        });
      }
      
      expect(shouldPromptPractice('essen')).toBe(true);
    });

    it('gibt false bei hoher Erfolgsrate', () => {
      for (let i = 0; i < 10; i++) {
        saveInteractionLog({
          id: `log-${i}`,
          gestureDefinitionId: 'essen',
          wasSuccessful: true,
          confidenceScore: 0.9,
          timestamp: Date.now(),
          processedBy: 'local'
        });
      }
      
      expect(shouldPromptPractice('essen')).toBe(false);
    });
  });

  describe('Historical Health Data', () => {
    it('speichert und lädt historische Daten', () => {
      saveHistoricalHealthData('essen', {
        date: '2024-01-15',
        successRate: 0.8,
        count: 10
      });
      
      const data = loadHistoricalHealthData('essen');
      expect(data.length).toBe(1);
      const firstData = data[0];
      if (firstData) {
        expect(firstData.successRate).toBe(0.8);
      }
    });

    it('gibt leeres Array für unbekannte Geste', () => {
      const data = loadHistoricalHealthData('unbekannt');
      expect(data).toEqual([]);
    });
  });

  describe('checkForDecliningAccuracy', () => {
    it('gibt false ohne genug Daten', () => {
      expect(checkForDecliningAccuracy('essen')).toBe(false);
    });

    it('erkennt abfallende Genauigkeit', () => {
      // Simuliere abfallenden Trend
      for (let i = 0; i < 7; i++) {
        saveHistoricalHealthData('essen', {
          date: `2024-01-${15 + i}`,
          successRate: 0.9 - (i * 0.1),
          count: 10
        });
      }
      
      expect(checkForDecliningAccuracy('essen')).toBe(true);
    });

    it('erkennt stabile Genauigkeit', () => {
      for (let i = 0; i < 7; i++) {
        saveHistoricalHealthData('essen', {
          date: `2024-01-${15 + i}`,
          successRate: 0.8,
          count: 10
        });
      }
      
      expect(checkForDecliningAccuracy('essen')).toBe(false);
    });
  });

  describe('generateProgressReport', () => {
    it('gibt leeren Bericht ohne Daten', () => {
      const report = generateProgressReport('essen');
      expect(report.averageSuccessRate).toBe(0);
      expect(report.totalSamples).toBe(0);
      expect(report.trend).toBe(0);
    });

    it('berechnet gewichteten Durchschnitt', () => {
      saveHistoricalHealthData('essen', {
        date: '2024-01-15',
        successRate: 0.6,
        count: 10
      });
      saveHistoricalHealthData('essen', {
        date: '2024-01-16',
        successRate: 1.0,
        count: 10
      });
      
      const report = generateProgressReport('essen');
      expect(report.averageSuccessRate).toBe(0.8);
      expect(report.totalSamples).toBe(20);
    });
  });
});
