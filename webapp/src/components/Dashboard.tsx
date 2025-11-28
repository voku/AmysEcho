import { useEffect, useState } from 'react';
import { useAppState } from '../hooks/useAppState';
import { useApiConfig } from '../hooks/useApiConfig';

interface AnalyticsSummary {
  totalGestures: number;
  uniqueGestures: number;
  sessionsCount: number;
  averageConfidence: number;
  lastActivity: string | null;
}

interface ServerInsights {
  topGestures: { label: string; count: number }[];
  recentActivity: { date: string; count: number }[];
  successRate: number;
}

/**
 * Dashboard component - mirrors DashboardScreen from the Expo app.
 * Shows analytics summary and insights for caregivers.
 */
export function Dashboard() {
  const { profileId, recentGestures } = useAppState();
  const { apiUrl, authToken } = useApiConfig();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [serverInsights, setServerInsights] = useState<ServerInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load local analytics
    const localSummary = loadLocalAnalytics(profileId);
    setSummary(localSummary);

    // Fetch server analytics if configured
    if (apiUrl && authToken) {
      fetchServerInsights(apiUrl, authToken);
    }
    setLoading(false);
  }, [profileId, apiUrl, authToken]);

  const loadLocalAnalytics = (profileId: string): AnalyticsSummary => {
    const progressKey = `webapp:progress:${profileId}`;
    const appStateKey = 'webapp:app-state';
    try {
      const progressData = localStorage.getItem(progressKey);
      const appState = localStorage.getItem(appStateKey);
      const progress = progressData ? JSON.parse(progressData) : {};
      const state = appState ? JSON.parse(appState) : {};

      return {
        totalGestures: progress.totalGestures || 0,
        uniqueGestures: progress.uniqueGestures || 0,
        sessionsCount: progress.sessionsCount || 0,
        averageConfidence: 0.85, // Placeholder - could be calculated from stored data
        lastActivity: state.lastRecognizedGesture ? new Date().toISOString() : null,
      };
    } catch (e) {
      console.warn('Failed to load local analytics', e);
      return {
        totalGestures: 0,
        uniqueGestures: 0,
        sessionsCount: 0,
        averageConfidence: 0,
        lastActivity: null,
      };
    }
  };

  const fetchServerInsights = async (apiUrl: string, authToken: string) => {
    try {
      const [summaryRes, insightsRes] = await Promise.all([
        fetch(`${apiUrl}/api/analytics/summary`, {
          headers: { Authorization: `Bearer ${authToken}` },
        }),
        fetch(`${apiUrl}/api/analytics/insights`, {
          headers: { Authorization: `Bearer ${authToken}` },
        }),
      ]);

      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setSummary((prev) => ({ ...prev, ...data }));
      }

      if (insightsRes.ok) {
        const insights = await insightsRes.json();
        setServerInsights(insights);
      }
    } catch (e) {
      console.warn('Failed to fetch server insights', e);
      setError('Server-Insights konnten nicht geladen werden.');
    }
  };

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h2>Übersicht</h2>
          <p className="muted">
            Zusammenfassung der Nutzung und Lernfortschritte für {profileId}.
          </p>
        </div>
      </div>

      {loading && <div className="notice info">Lade Daten...</div>}
      {error && <div className="notice warning">{error}</div>}

      {/* Summary Stats */}
      {summary && (
        <div className="dashboard-summary">
          <div className="stat-card">
            <p className="stat-value">{summary.totalGestures}</p>
            <p className="stat-label">Gesten erkannt</p>
          </div>
          <div className="stat-card">
            <p className="stat-value">{summary.uniqueGestures}</p>
            <p className="stat-label">Verschiedene Gesten</p>
          </div>
          <div className="stat-card">
            <p className="stat-value">{summary.sessionsCount}</p>
            <p className="stat-label">Sitzungen</p>
          </div>
          <div className="stat-card">
            <p className="stat-value">{Math.round(summary.averageConfidence * 100)}%</p>
            <p className="stat-label">Ø Vertrauen</p>
          </div>
        </div>
      )}

      {/* Recent Gestures */}
      <div className="dashboard-section">
        <h3>📊 Letzte Aktivität</h3>
        {recentGestures.length > 0 ? (
          <div className="gesture-tags">
            {recentGestures.map((gesture, index) => (
              <span key={`${gesture}-${index}`} className="badge">
                {gesture}
              </span>
            ))}
          </div>
        ) : (
          <p className="muted">Noch keine Gesten in dieser Sitzung erkannt.</p>
        )}
      </div>

      {/* Server Insights */}
      {serverInsights && (
        <div className="dashboard-section">
          <h3>🔍 Server-Insights</h3>
          <div className="insights-grid">
            <div className="insight-card">
              <p className="insight-title">Erfolgsrate</p>
              <p className="insight-value">{Math.round(serverInsights.successRate * 100)}%</p>
            </div>
            {serverInsights.topGestures.slice(0, 3).map((gesture) => (
              <div key={gesture.label} className="insight-card">
                <p className="insight-title">{gesture.label}</p>
                <p className="insight-value">{gesture.count}x</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="dashboard-section">
        <h3>⚡ Schnellaktionen</h3>
        <div className="quick-actions">
          <a href="/" className="action-button">
            🎯 Erkennung starten
          </a>
          <a href="/training" className="action-button">
            📚 Training starten
          </a>
          <a href="/fortschritt" className="action-button">
            📈 Fortschritt ansehen
          </a>
        </div>
      </div>
    </section>
  );
}
