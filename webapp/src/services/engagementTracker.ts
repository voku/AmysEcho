/**
 * Engagement Tracker Service - Amy First
 *
 * Verfolgt Sitzungsengagement für Benutzerprofile
 */

const STORAGE_KEY = 'engagementStats';
let sessionStart: number | null = null;

interface StoredStats {
  sessions: number;
  totalMs: number;
}

export interface EngagementStats {
  totalSessions: number;
  totalDurationMs: number;
  averageDurationMs: number;
}

/**
 * Sitzung starten
 */
export function startSession(): void {
  sessionStart = Date.now();
}

/**
 * Sitzung beenden und Statistiken speichern
 */
export function endSession(profileId: string): void {
  if (sessionStart === null) return;
  const duration = Date.now() - sessionStart;
  sessionStart = null;
  
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data: Record<string, StoredStats> = raw ? JSON.parse(raw) : {};
    const stats = data[profileId] || { sessions: 0, totalMs: 0 };
    stats.sessions += 1;
    stats.totalMs += duration;
    data[profileId] = stats;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('[Engagement] Fehler beim Speichern:', error);
  }
}

/**
 * Engagement-Statistiken laden
 */
export function loadEngagementStats(profileId: string): EngagementStats {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data: Record<string, StoredStats> = raw ? JSON.parse(raw) : {};
    const stats = data[profileId] || { sessions: 0, totalMs: 0 };
    return {
      totalSessions: stats.sessions,
      totalDurationMs: stats.totalMs,
      averageDurationMs: stats.sessions ? stats.totalMs / stats.sessions : 0,
    };
  } catch (error) {
    console.warn('[Engagement] Fehler beim Laden:', error);
    return {
      totalSessions: 0,
      totalDurationMs: 0,
      averageDurationMs: 0,
    };
  }
}

/**
 * Prüfen ob Sitzung aktiv ist
 */
export function isSessionActive(): boolean {
  return sessionStart !== null;
}

/**
 * Aktuelle Sitzungsdauer abrufen (in Millisekunden)
 */
export function getCurrentSessionDuration(): number {
  if (sessionStart === null) return 0;
  return Date.now() - sessionStart;
}

/**
 * Alle Engagement-Daten zurücksetzen
 */
export function resetEngagementData(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    sessionStart = null;
  } catch {
    // Ignorieren
  }
}
