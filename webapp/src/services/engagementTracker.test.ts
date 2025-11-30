/**
 * Tests for Engagement Tracker Service
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  startSession, 
  endSession, 
  loadEngagementStats, 
  isSessionActive,
  getCurrentSessionDuration,
  resetEngagementData 
} from './engagementTracker';

describe('EngagementTracker', () => {
  beforeEach(() => {
    resetEngagementData();
  });

  describe('startSession', () => {
    it('startet eine Sitzung', () => {
      startSession();
      expect(isSessionActive()).toBe(true);
    });
  });

  describe('endSession', () => {
    it('beendet eine Sitzung und speichert Statistiken', () => {
      startSession();
      endSession('amy');
      
      expect(isSessionActive()).toBe(false);
      
      const stats = loadEngagementStats('amy');
      expect(stats.totalSessions).toBe(1);
    });

    it('speichert Sitzungsdauer', async () => {
      startSession();
      
      // Kurze Wartezeit simulieren
      await new Promise(resolve => setTimeout(resolve, 50));
      
      endSession('amy');
      
      const stats = loadEngagementStats('amy');
      expect(stats.totalDurationMs).toBeGreaterThan(0);
    });

    it('ignoriert Aufruf ohne aktive Sitzung', () => {
      endSession('amy');
      
      const stats = loadEngagementStats('amy');
      expect(stats.totalSessions).toBe(0);
    });
  });

  describe('loadEngagementStats', () => {
    it('gibt leere Statistiken für neues Profil zurück', () => {
      const stats = loadEngagementStats('new-user');
      
      expect(stats.totalSessions).toBe(0);
      expect(stats.totalDurationMs).toBe(0);
      expect(stats.averageDurationMs).toBe(0);
    });

    it('berechnet Durchschnittsdauer korrekt', () => {
      // Erste Sitzung
      startSession();
      endSession('amy');
      
      // Zweite Sitzung
      startSession();
      endSession('amy');
      
      const stats = loadEngagementStats('amy');
      expect(stats.totalSessions).toBe(2);
      expect(stats.averageDurationMs).toBe(stats.totalDurationMs / 2);
    });
  });

  describe('isSessionActive', () => {
    it('gibt false ohne aktive Sitzung', () => {
      expect(isSessionActive()).toBe(false);
    });

    it('gibt true mit aktiver Sitzung', () => {
      startSession();
      expect(isSessionActive()).toBe(true);
    });
  });

  describe('getCurrentSessionDuration', () => {
    it('gibt 0 ohne aktive Sitzung', () => {
      expect(getCurrentSessionDuration()).toBe(0);
    });

    it('gibt Dauer bei aktiver Sitzung', async () => {
      startSession();
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const duration = getCurrentSessionDuration();
      expect(duration).toBeGreaterThan(0);
    });
  });

  describe('resetEngagementData', () => {
    it('setzt alle Daten zurück', () => {
      startSession();
      endSession('amy');
      
      resetEngagementData();
      
      const stats = loadEngagementStats('amy');
      expect(stats.totalSessions).toBe(0);
      expect(isSessionActive()).toBe(false);
    });
  });
});
