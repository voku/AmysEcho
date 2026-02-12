import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppState } from '../hooks/useAppState';
import { useApiConfig } from '../hooks/useApiConfig';
import { resolveApiUrl } from '../utils/resolveApiUrl';

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

interface TrainingQualityItem {
  label?: string;
  reasons?: string[];
  metrics?: { handCoverage?: number };
}

interface TrainingQualityPayload {
  items?: TrainingQualityItem[];
}

/**
 * Dashboard component - mirrors DashboardScreen from the Expo app.
 * Shows analytics summary and insights for caregivers.
 */
export function Dashboard() {
  const { profileId, recentSigns } = useAppState();
  const { apiBaseUrl, apiToken } = useApiConfig();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [serverInsights, setServerInsights] = useState<ServerInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const fetchServerInsights = useCallback(async (authToken: string) => {
    if (!profileId) {
      setServerInsights(null);
      return;
    }

    try {
      const endpoint = resolveApiUrl('/api/v1/dgs/training-quality', apiBaseUrl);
      const qualityUrl = new URL(endpoint, window.location.origin);
      qualityUrl.searchParams.set('profileId', profileId);
      qualityUrl.searchParams.set('limit', '50');

      const qualityRes = await fetch(qualityUrl.toString(), {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (!qualityRes.ok) {
        setServerInsights(null);
        const responseText = await qualityRes.text().catch(() => '');
        const errorDetail = responseText ? `: ${responseText.slice(0, 120)}` : '';
        console.warn('Server insights request failed', {
          status: qualityRes.status,
          statusText: qualityRes.statusText,
          endpoint: qualityUrl.toString(),
        });
        setError(`Server-Insights konnten nicht geladen werden (HTTP ${qualityRes.status})${errorDetail}`);
        return;
      }

      const payload = (await qualityRes.json()) as TrainingQualityPayload;
      const items = Array.isArray(payload.items) ? payload.items : [];
      const labelCounts = new Map<string, number>();
      let acceptedCount = 0;

      for (const item of items) {
        const label = typeof item.label === 'string' ? item.label.trim() : '';
        if (label) {
          labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
        }

        const reasons = Array.isArray(item.reasons) ? item.reasons : [];
        const isAccepted = reasons.length === 0;
        if (isAccepted) {
          acceptedCount += 1;
        }
      }

      const topGestures = Array.from(labelCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([label, count]) => ({ label, count }));

      setServerInsights({
        topGestures,
        recentActivity: [],
        successRate: items.length > 0 ? acceptedCount / items.length : 0,
      });
      setError(null);
    } catch (e) {
      console.warn('Server insights skipped due to endpoint resolution or fetch error', e);
      setServerInsights(null);
    }
  }, [apiBaseUrl, profileId]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        // Load local analytics only when a profile is active
        if (profileId) {
          const localSummary = loadLocalAnalytics(profileId);
          if (!cancelled) {
            setSummary(localSummary);
          }
        } else if (!cancelled) {
          setSummary(null); // Clear summary if no profile is active
          setServerInsights(null);
          setError(null);
        }

        // Fetch server analytics if configured
        if (!cancelled && apiBaseUrl && apiToken) {
          await fetchServerInsights(apiToken);
        }
      } catch (error) {
        console.warn('Dashboard loading failed', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [profileId, apiBaseUrl, apiToken, fetchServerInsights]);

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h2>Übersicht</h2>
          <p className="muted">
            Zusammenfassung der Nutzung und Lernfortschritte für {profileId || 'N/A'}.
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
            <p className="stat-label">Gebärden erkannt</p>
          </div>
          <div className="stat-card">
            <p className="stat-value">{summary.uniqueGestures}</p>
            <p className="stat-label">Verschiedene Gebärden</p>
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
        {recentSigns.length > 0 ? (
          <div className="gesture-tags">
            {recentSigns.map((sign, index) => (
              <span key={`${sign}-${index}`} className="badge">
                {sign}
              </span>
            ))}
          </div>
        ) : (
          <p className="muted">Noch keine Gebärden in dieser Sitzung erkannt.</p>
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
          <Link to="/" className="action-button">
            🎯 Erkennung starten
          </Link>
          <Link to="/training" className="action-button">
            📚 Training starten
          </Link>
          <Link to="/fortschritt" className="action-button">
            📈 Fortschritt ansehen
          </Link>
        </div>
      </div>
    </section>
  );
}
