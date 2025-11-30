/**
 * Tests for Performance Monitor Service
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { performanceMonitor } from './performanceMonitor';

describe('PerformanceMonitor', () => {
  beforeEach(() => {
    performanceMonitor.reset();
  });

  describe('recordGestureProcessing', () => {
    it('zeichnet Gestenverarbeitung auf', () => {
      performanceMonitor.recordGestureProcessing(50, 'essen', 0.8, true);
      
      const metrics = performanceMonitor.getMetrics();
      expect(metrics.averageProcessingTime).toBe(50);
    });

    it('berechnet Durchschnitt korrekt', () => {
      performanceMonitor.recordGestureProcessing(30, 'essen', 0.8, true);
      performanceMonitor.recordGestureProcessing(50, 'trinken', 0.9, true);
      
      const metrics = performanceMonitor.getMetrics();
      expect(metrics.averageProcessingTime).toBe(40);
    });

    it('berechnet Genauigkeit', () => {
      performanceMonitor.recordGestureProcessing(30, 'essen', 0.8, true);
      performanceMonitor.recordGestureProcessing(30, 'trinken', 0.9, false);
      
      const metrics = performanceMonitor.getMetrics();
      expect(metrics.overallAccuracy).toBe(0.5);
    });
  });

  describe('getPerformanceSummary', () => {
    it('gibt lesbare Zusammenfassung zurück', () => {
      performanceMonitor.recordGestureProcessing(30, 'essen', 0.8, true);
      
      const summary = performanceMonitor.getPerformanceSummary();
      expect(summary).toContain('30.0ms');
      expect(summary).toContain('100.0%');
    });
  });

  describe('isPerformanceAcceptable', () => {
    it('erkennt akzeptable Performance', () => {
      for (let i = 0; i < 10; i++) {
        performanceMonitor.recordGestureProcessing(20, 'essen', 0.9, true);
      }
      
      expect(performanceMonitor.isPerformanceAcceptable()).toBe(true);
    });

    it('erkennt schlechte Performance', () => {
      for (let i = 0; i < 10; i++) {
        performanceMonitor.recordGestureProcessing(200, 'essen', 0.3, false);
      }
      
      expect(performanceMonitor.isPerformanceAcceptable()).toBe(false);
    });
  });

  describe('getPerformanceAlerts', () => {
    it('gibt keine Alerts bei guter Performance', () => {
      for (let i = 0; i < 10; i++) {
        performanceMonitor.recordGestureProcessing(20, 'essen', 0.9, true);
      }
      
      const alerts = performanceMonitor.getPerformanceAlerts();
      expect(alerts.length).toBe(0);
    });

    it('warnt bei hoher Latenz', () => {
      for (let i = 0; i < 10; i++) {
        performanceMonitor.recordGestureProcessing(200, 'essen', 0.9, true);
      }
      
      const alerts = performanceMonitor.getPerformanceAlerts();
      expect(alerts.some(a => a.includes('Latenz'))).toBe(true);
    });

    it('warnt bei niedriger Genauigkeit', () => {
      for (let i = 0; i < 10; i++) {
        performanceMonitor.recordGestureProcessing(20, 'essen', 0.9, false);
      }
      
      const alerts = performanceMonitor.getPerformanceAlerts();
      expect(alerts.some(a => a.includes('Genauigkeit'))).toBe(true);
    });
  });

  describe('getPerformanceReport', () => {
    it('gibt vollständigen Bericht zurück', () => {
      performanceMonitor.recordGestureProcessing(30, 'essen', 0.8, true);
      
      const report = performanceMonitor.getPerformanceReport();
      expect(report.summary).toBeDefined();
      expect(report.metrics).toBeDefined();
      expect(report.alerts).toBeDefined();
      expect(typeof report.isAcceptable).toBe('boolean');
    });
  });

  describe('recordMetric', () => {
    it('zeichnet benutzerdefinierte Metrik ohne Fehler auf', () => {
      expect(() => {
        performanceMonitor.recordMetric('custom_metric', 42, { extra: 'info' });
      }).not.toThrow();
    });
  });
});
