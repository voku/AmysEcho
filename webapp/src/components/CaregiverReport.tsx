/**
 * CaregiverReport - Learning progress summary for caregivers
 * Mirrors app/src/screens/CaregiverReportScreen.tsx
 * 
 * For Amy: Helps caregivers understand and support Amy's learning journey
 */
import React from 'react';
import { Link } from 'react-router-dom';

interface GestureProgress {
  id: string;
  label: string;
  successRate: number;
  totalAttempts: number;
  lastPracticed?: string | undefined;
}

export const CaregiverReport: React.FC = () => {
  const [gestures, setGestures] = React.useState<GestureProgress[]>([]);
  const [profile, setProfile] = React.useState<{ name: string } | null>(null);

  React.useEffect(() => {
    // Load profile
    const savedProfile = localStorage.getItem('amysecho_active_profile');
    if (savedProfile) {
      try {
        setProfile(JSON.parse(savedProfile));
      } catch {
        // Ignore
      }
    }

    // Load gesture progress
    const savedProgress = localStorage.getItem('amysecho_progress');
    if (savedProgress) {
      try {
        const progress = JSON.parse(savedProgress);
        const gestureData: GestureProgress[] = Object.entries(progress).map(([id, data]: [string, unknown]) => {
          const d = data as { successRate?: number; totalAttempts?: number; lastPracticed?: string };
          return {
            id,
            label: id.charAt(0).toUpperCase() + id.slice(1),
            successRate: d.successRate || 0,
            totalAttempts: d.totalAttempts || 0,
            lastPracticed: d.lastPracticed
          };
        });
        setGestures(gestureData);
      } catch {
        // Use sample data
        setGestures([
          { id: 'essen', label: 'Essen', successRate: 0.85, totalAttempts: 42 },
          { id: 'trinken', label: 'Trinken', successRate: 0.92, totalAttempts: 38 },
          { id: 'spielen', label: 'Spielen', successRate: 0.78, totalAttempts: 25 },
          { id: 'schlafen', label: 'Schlafen', successRate: 0.65, totalAttempts: 15 },
          { id: 'hilfe', label: 'Hilfe', successRate: 0.88, totalAttempts: 20 }
        ]);
      }
    } else {
      // Sample data if no history
      setGestures([
        { id: 'essen', label: 'Essen', successRate: 0.85, totalAttempts: 42 },
        { id: 'trinken', label: 'Trinken', successRate: 0.92, totalAttempts: 38 },
        { id: 'spielen', label: 'Spielen', successRate: 0.78, totalAttempts: 25 },
        { id: 'schlafen', label: 'Schlafen', successRate: 0.65, totalAttempts: 15 },
        { id: 'hilfe', label: 'Hilfe', successRate: 0.88, totalAttempts: 20 }
      ]);
    }
  }, []);

  const getSuccessColor = (rate: number) => {
    if (rate >= 0.8) return '#10b981'; // green
    if (rate >= 0.6) return '#f59e0b'; // amber
    return '#ef4444'; // red
  };

  const getSuccessEmoji = (rate: number) => {
    if (rate >= 0.9) return '⭐';
    if (rate >= 0.8) return '🌟';
    if (rate >= 0.6) return '💪';
    return '🌱';
  };

  const totalAttempts = gestures.reduce((sum, g) => sum + g.totalAttempts, 0);
  const avgSuccess = gestures.length > 0 
    ? gestures.reduce((sum, g) => sum + g.successRate, 0) / gestures.length 
    : 0;

  return (
    <div className="caregiver-report">
      <h2>📊 Lernfortschritt</h2>
      {profile && (
        <p className="profile-note">Bericht für: <strong>{profile.name}</strong></p>
      )}

      {/* Summary Stats */}
      <div className="report-summary">
        <div className="summary-card">
          <span className="summary-value">{gestures.length}</span>
          <span className="summary-label">Gebärden gelernt</span>
        </div>
        <div className="summary-card">
          <span className="summary-value">{totalAttempts}</span>
          <span className="summary-label">Gesamtversuche</span>
        </div>
        <div className="summary-card">
          <span className="summary-value">{Math.round(avgSuccess * 100)}%</span>
          <span className="summary-label">Durchschnittserfolg</span>
        </div>
      </div>

      {/* Gesture List */}
      <section className="report-section">
        <h3>Gebärdenübersicht</h3>
        
        {gestures.length === 0 ? (
          <p className="empty-state">Noch keine Gebärden geübt</p>
        ) : (
          <ul className="gesture-progress-list">
            {gestures.map(gesture => (
              <li key={gesture.id} className="gesture-progress-item">
                <div className="gesture-info">
                  <span className="gesture-emoji">{getSuccessEmoji(gesture.successRate)}</span>
                  <div className="gesture-details">
                    <strong>{gesture.label}</strong>
                    <span className="muted">{gesture.totalAttempts} Versuche</span>
                  </div>
                </div>
                <div className="gesture-progress">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill"
                      style={{ 
                        width: `${gesture.successRate * 100}%`,
                        backgroundColor: getSuccessColor(gesture.successRate)
                      }}
                    />
                  </div>
                  <span className="progress-value" style={{ color: getSuccessColor(gesture.successRate) }}>
                    {Math.round(gesture.successRate * 100)}%
                  </span>
                </div>
                <Link to={`/fortschritt?gesture=${gesture.id}`} className="details-link">
                  Details →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recommendations */}
      <section className="report-section">
        <h3>💡 Empfehlungen</h3>
        <div className="recommendations">
          {gestures.filter(g => g.successRate < 0.7).length > 0 && (
            <div className="recommendation-card">
              <span className="rec-icon">🎯</span>
              <div>
                <strong>Fokus auf Übung</strong>
                <p>
                  {gestures.filter(g => g.successRate < 0.7).map(g => g.label).join(', ')} könnten mehr Übung gebrauchen.
                </p>
              </div>
            </div>
          )}
          
          {gestures.filter(g => g.successRate >= 0.9).length > 0 && (
            <div className="recommendation-card success">
              <span className="rec-icon">🌟</span>
              <div>
                <strong>Großartige Fortschritte!</strong>
                <p>
                  {gestures.filter(g => g.successRate >= 0.9).map(g => g.label).join(', ')} werden sehr gut erkannt.
                </p>
              </div>
            </div>
          )}

          <div className="recommendation-card">
            <span className="rec-icon">📈</span>
            <div>
              <strong>Regelmäßiges Üben</strong>
              <p>Kurze, tägliche Übungseinheiten führen zu den besten Ergebnissen.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="report-actions">
        <Link to="/fortschritt" className="primary-button">
          Zum Fortschrittstagebuch
        </Link>
        <Link to="/" className="secondary-button">
          Zurück
        </Link>
      </div>
    </div>
  );
};
