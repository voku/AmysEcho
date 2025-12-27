import { useEffect, useState, useCallback } from 'react';
import { useAppState } from '../hooks/useAppState';

interface GestureStats {
  label: string;
  count: number;
  lastUsed: string | null;
}

interface ProgressData {
  totalGestures: number;
  uniqueGestures: number;
  sessionsCount: number;
  gestureStats: GestureStats[];
}

const BASELINE_GESTURES = [
  'alle', 'blau', 'essen', 'fertig', 'gelb', 'gruen',
  'nochmal', 'rot', 'satt', 'schwester', 'spielen', 'trinken',
];

const formatGestureLabel = (label: string): string => {
  const mappings: Record<string, string> = {
    'alle': 'Alle',
    'blau': 'Blau',
    'essen': 'Essen',
    'fertig': 'Fertig',
    'gelb': 'Gelb',
    'gruen': 'Grün',
    'nochmal': 'Nochmal',
    'rot': 'Rot',
    'satt': 'Satt',
    'schwester': 'Schwester',
    'spielen': 'Spielen',
    'trinken': 'Trinken',
  };
  return mappings[label] || label;
};

function loadProgressFromStorage(profileId: string): ProgressData {
  const key = `webapp:progress:${profileId}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        totalGestures: parsed.totalGestures || 0,
        uniqueGestures: parsed.uniqueGestures || 0,
        sessionsCount: parsed.sessionsCount || 0,
        gestureStats: Array.isArray(parsed.gestureStats) ? parsed.gestureStats : [],
      };
    }
  } catch (e) {
    console.warn('Could not load progress data', e);
  }
  return {
    totalGestures: 0,
    uniqueGestures: 0,
    sessionsCount: 0,
    gestureStats: [],
  };
}

function saveProgressToStorage(profileId: string, data: ProgressData): void {
  const key = `webapp:progress:${profileId}`;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn('Could not save progress data', e);
  }
}

/**
 * Progress tracking component - mirrors ProgressScreen from the Expo app.
 * Shows gesture usage statistics and learning progress.
 */
export function ProgressTracker() {
  const { profileId, recentSigns } = useAppState();
  const [progressData, setProgressData] = useState<ProgressData>(() => 
    loadProgressFromStorage(profileId || 'default')
  );

  // Update progress when gestures are recognized
  useEffect(() => {
    if (recentSigns.length === 0 || !profileId) return;

    setProgressData((prev) => {
      const statsMap = new Map<string, GestureStats>(
        prev.gestureStats.map((s) => [s.label, s])
      );

      // Update stats for recent signs
      recentSigns.forEach((sign) => {
        const existing = statsMap.get(sign);
        if (existing) {
          statsMap.set(sign, {
            ...existing,
            count: existing.count + 1,
            lastUsed: new Date().toISOString(),
          });
        } else {
          statsMap.set(sign, {
            label: sign,
            count: 1,
            lastUsed: new Date().toISOString(),
          });
        }
      });

      const newStats = Array.from(statsMap.values()).sort((a, b) => b.count - a.count);
      const newData: ProgressData = {
        totalGestures: prev.totalGestures + 1,
        uniqueGestures: statsMap.size,
        sessionsCount: prev.sessionsCount,
        gestureStats: newStats,
      };

      saveProgressToStorage(profileId, newData);
      return newData;
    });
  }, [recentSigns, profileId]);

  // Track session on mount
  useEffect(() => {
    if (!profileId) return;
    setProgressData((prev) => {
      const newData = { ...prev, sessionsCount: prev.sessionsCount + 1 };
      saveProgressToStorage(profileId, newData);
      return newData;
    });
  }, [profileId]);

  const handleReset = useCallback(() => {
    if (window.confirm('Fortschritt zurücksetzen? Alle Statistiken werden gelöscht.')) {
      if (!profileId) return;
      const newData: ProgressData = {
        totalGestures: 0,
        uniqueGestures: 0,
        sessionsCount: 0,
        gestureStats: [],
      };
      setProgressData(newData);
      saveProgressToStorage(profileId, newData);
    }
  }, [profileId]);

  const learnedGestures = progressData.gestureStats.filter((s) => s.count >= 3);
  const inProgressGestures = progressData.gestureStats.filter((s) => s.count > 0 && s.count < 3);
  const notStartedGestures = BASELINE_GESTURES.filter(
    (g) => !progressData.gestureStats.some((s) => s.label === g)
  );

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <p className="eyebrow">Fortschritt</p>
          <h2>Lernübersicht</h2>
          <p className="muted">
            Verfolge deinen Lernfortschritt und sieh, welche Gebärden du bereits beherrschst.
          </p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="progress-summary">
        <div className="stat-card">
          <p className="stat-value">{progressData.totalGestures}</p>
          <p className="stat-label">Erkannte Gebärden</p>
        </div>
        <div className="stat-card">
          <p className="stat-value">{progressData.uniqueGestures}</p>
          <p className="stat-label">Verschiedene Gebärden</p>
        </div>
        <div className="stat-card">
          <p className="stat-value">{progressData.sessionsCount}</p>
          <p className="stat-label">Sitzungen</p>
        </div>
        <div className="stat-card">
          <p className="stat-value">{learnedGestures.length}/{BASELINE_GESTURES.length}</p>
          <p className="stat-label">Gelernt</p>
        </div>
      </div>

      {/* Learned Gestures */}
      {learnedGestures.length > 0 && (
        <div className="progress-section">
          <h3>✓ Gelernt</h3>
          <p className="muted small">Diese Gebärden hast du mindestens 3x erfolgreich gezeigt.</p>
          <div className="gesture-grid">
            {learnedGestures.map((gesture) => (
              <div key={gesture.label} className="gesture-card learned">
                <span className="gesture-name">{formatGestureLabel(gesture.label)}</span>
                <span className="gesture-count">{gesture.count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* In Progress Gestures */}
      {inProgressGestures.length > 0 && (
        <div className="progress-section">
          <h3>⏳ In Arbeit</h3>
          <p className="muted small">Noch ein paar Wiederholungen und du hast sie drauf!</p>
          <div className="gesture-grid">
            {inProgressGestures.map((gesture) => (
              <div key={gesture.label} className="gesture-card in-progress">
                <span className="gesture-name">{formatGestureLabel(gesture.label)}</span>
                <span className="gesture-count">{gesture.count}/3</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Not Started Gestures */}
      {notStartedGestures.length > 0 && (
        <div className="progress-section">
          <h3>📚 Noch zu lernen</h3>
          <p className="muted small">Diese Gebärden warten noch auf dich!</p>
          <div className="gesture-grid">
            {notStartedGestures.map((gesture) => (
              <div key={gesture} className="gesture-card not-started">
                <span className="gesture-name">{formatGestureLabel(gesture)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="controls">
        <button className="ghost" onClick={handleReset}>
          Fortschritt zurücksetzen
        </button>
      </div>
    </section>
  );
}
