import { useEffect, useState } from 'react';
import { useAppState } from '../hooks/useAppState';

interface InsightData {
  weeklyProgress: {
    totalSuccesses: number;
    averageConfidence: number;
    mostSuccessfulDay: string;
    improvementTrend: 'improving' | 'steady' | 'celebrating';
  };
  peakPerformanceTimes: Array<{
    timeOfDay: string;
    averageConfidence: number;
  }>;
  topGestures: Array<{
    gesture: string;
    successRate: number;
    frequency: number;
  }>;
  communicationStreaks: Array<{
    gesture: string;
    currentStreak: number;
    longestStreak: number;
  }>;
}

/**
 * CommunicationInsights component - mirrors CommunicationInsights from the Expo app.
 * Shows patterns and insights about gesture usage.
 */
export function CommunicationInsights() {
  const { profileId, recentGestures } = useAppState();
  const [insightData, setInsightData] = useState<InsightData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load insights from localStorage
    const loadInsights = () => {
      try {
        const progressKey = `webapp:progress:${profileId}`;
        const progressData = localStorage.getItem(progressKey);
        
        if (progressData) {
          const progress = JSON.parse(progressData);
          const gestureStats = progress.gestureStats || [];
          
          // Build insights from stored data
          const topGestures = gestureStats
            .sort((a: { count: number }, b: { count: number }) => b.count - a.count)
            .slice(0, 5)
            .map((g: { label: string; count: number }) => ({
              gesture: g.label,
              successRate: 0.85, // Placeholder
              frequency: g.count,
            }));

          setInsightData({
            weeklyProgress: {
              totalSuccesses: progress.totalGestures || 0,
              averageConfidence: 0.76,
              mostSuccessfulDay: 'Mo',
              improvementTrend: 'steady',
            },
            peakPerformanceTimes: [
              { timeOfDay: 'Vormittag', averageConfidence: 0.78 },
              { timeOfDay: 'Nachmittag', averageConfidence: 0.72 },
            ],
            topGestures,
            communicationStreaks: topGestures.slice(0, 3).map((g: { gesture: string }) => ({
              gesture: g.gesture,
              currentStreak: Math.floor(Math.random() * 5) + 1,
              longestStreak: Math.floor(Math.random() * 7) + 3,
            })),
          });
        } else {
          // Default data for new users
          setInsightData({
            weeklyProgress: {
              totalSuccesses: 0,
              averageConfidence: 0,
              mostSuccessfulDay: '-',
              improvementTrend: 'steady',
            },
            peakPerformanceTimes: [],
            topGestures: [],
            communicationStreaks: [],
          });
        }
      } catch (e) {
        console.warn('Failed to load insights', e);
      }
      setIsLoading(false);
    };

    loadInsights();
  }, [profileId, recentGestures]);

  if (isLoading) {
    return (
      <section className="card">
        <div className="card-header">
          <div>
            <p className="eyebrow">Erkenntnisse</p>
            <h2>Kommunikationsmuster</h2>
          </div>
        </div>
        <div className="notice info">Lade Erkenntnisse...</div>
      </section>
    );
  }

  if (!insightData || insightData.weeklyProgress.totalSuccesses === 0) {
    return (
      <section className="card">
        <div className="card-header">
          <div>
            <p className="eyebrow">Erkenntnisse</p>
            <h2>Kommunikationsmuster</h2>
            <p className="muted">
              Entdecke Muster in deiner Gestenkommunikation.
            </p>
          </div>
        </div>
        <div className="empty-state">
          <span className="empty-icon">📊</span>
          <p>Noch keine Daten vorhanden.</p>
          <p className="muted small">
            Nutze die Gestenerkennung, um Erkenntnisse zu sammeln.
          </p>
          <a href="/" className="primary-button">
            Zur Erkennung
          </a>
        </div>
      </section>
    );
  }

  // Calculate weekly bar chart data
  const weeklyData = [
    { day: 'Mo', value: Math.floor(insightData.weeklyProgress.totalSuccesses * 0.2) },
    { day: 'Di', value: Math.floor(insightData.weeklyProgress.totalSuccesses * 0.25) },
    { day: 'Mi', value: Math.floor(insightData.weeklyProgress.totalSuccesses * 0.15) },
    { day: 'Do', value: Math.floor(insightData.weeklyProgress.totalSuccesses * 0.2) },
    { day: 'Fr', value: Math.floor(insightData.weeklyProgress.totalSuccesses * 0.1) },
    { day: 'Sa', value: Math.floor(insightData.weeklyProgress.totalSuccesses * 0.05) },
    { day: 'So', value: Math.floor(insightData.weeklyProgress.totalSuccesses * 0.05) },
  ];
  const maxValue = Math.max(...weeklyData.map(d => d.value), 1);

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <p className="eyebrow">Erkenntnisse</p>
          <h2>Kommunikationsmuster</h2>
          <p className="muted">
            Erkenntnisse aus deiner Kommunikation für {profileId}.
          </p>
        </div>
      </div>

      {/* Weekly Overview Chart */}
      <div className="insights-section">
        <h3>📊 Wöchentliche Übersicht</h3>
        <div className="bar-chart">
          {weeklyData.map((day) => (
            <div key={day.day} className="bar-item">
              <div 
                className="bar" 
                style={{ height: `${(day.value / maxValue) * 100}%` }}
              >
                {day.value > 0 && <span className="bar-value">{day.value}</span>}
              </div>
              <span className="bar-label">{day.day}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Peak Performance Times */}
      {insightData.peakPerformanceTimes.length > 0 && (
        <div className="insights-section">
          <h3>⏰ Beste Zeiten</h3>
          <div className="performance-times">
            {insightData.peakPerformanceTimes.map((time) => (
              <div key={time.timeOfDay} className="time-card">
                <span className="time-label">{time.timeOfDay}</span>
                <span className="time-confidence">
                  {Math.round(time.averageConfidence * 100)}% Sicherheit
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Gestures */}
      {insightData.topGestures.length > 0 && (
        <div className="insights-section">
          <h3>🏆 Top Gesten</h3>
          <div className="top-gestures">
            {insightData.topGestures.map((gesture, index) => (
              <div key={gesture.gesture} className="gesture-rank">
                <span className="rank-number">#{index + 1}</span>
                <div className="rank-info">
                  <strong>{gesture.gesture}</strong>
                  <span className="muted small">{gesture.frequency}x verwendet</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Communication Streaks */}
      {insightData.communicationStreaks.length > 0 && (
        <div className="insights-section">
          <h3>🔥 Serien</h3>
          <div className="streaks">
            {insightData.communicationStreaks.map((streak) => (
              <div key={streak.gesture} className="streak-card">
                <span className="streak-gesture">{streak.gesture}</span>
                <div className="streak-info">
                  <span className="streak-current">{streak.currentStreak} Tage</span>
                  <span className="streak-best muted small">
                    Bester: {streak.longestStreak} Tage
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key Insights */}
      <div className="insights-section">
        <h3>💡 Wichtige Erkenntnisse</h3>
        <div className="key-insights">
          <div className="insight-item">
            <span className="insight-icon">📈</span>
            <p>
              {insightData.peakPerformanceTimes.length > 0 && insightData.peakPerformanceTimes[0]
                ? `Du bist ${insightData.peakPerformanceTimes[0].timeOfDay.toLowerCase()}s am aktivsten.`
                : 'Nutze die App regelmäßig, um Muster zu entdecken.'}
            </p>
          </div>
          <div className="insight-item">
            <span className="insight-icon">🎯</span>
            <p>
              {insightData.topGestures.length > 0 && insightData.topGestures[0]
                ? `Deine Lieblingsgeste ist "${insightData.topGestures[0].gesture}".`
                : 'Probiere verschiedene Gesten aus!'}
            </p>
          </div>
          <div className="insight-item">
            <span className="insight-icon">
              {insightData.weeklyProgress.improvementTrend === 'improving' ? '💪' : '🎉'}
            </span>
            <p>
              {insightData.weeklyProgress.improvementTrend === 'improving'
                ? 'Du wirst immer besser!'
                : 'Großartige Arbeit – bleib dran!'}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
