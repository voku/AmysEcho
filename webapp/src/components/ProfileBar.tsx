import { NavLink } from 'react-router-dom';
import { useAppState } from '../hooks/useAppState';

export function ProfileBar() {
  const {
    profileId,
    setProfileId,
    preferredGestureLabel,
    setPreferredGestureLabel,
    lastRecognizedGesture,
    recentGestures,
  } = useAppState();

  const suggestedLabel = lastRecognizedGesture ?? recentGestures[0] ?? '';

  return (
    <section className="card profile-card">
      <div className="card-header">
        <div>
          <p className="eyebrow">Profil & Routing</p>
          <h2>Aktives Profil verwalten</h2>
          <p className="muted">
            Profil-ID und Standard-Label werden im Browser gespeichert. So können Gestenerkennung und Training dieselbe
            Identität nutzen – genau wie in der Expo-App.
          </p>
        </div>
        <div className="status-chip" data-state="idle">
          {lastRecognizedGesture ? 'Profil gebunden' : 'Profil bereit'}
        </div>
      </div>

      <div className="profile-grid">
        <div className="form-group">
          <label htmlFor="profile-id">Profil-ID</label>
          <input
            id="profile-id"
            value={profileId}
            onChange={(event) => setProfileId(event.target.value)}
            placeholder="z. B. amy-browser"
          />
          <p className="muted small">Wird für Uploads und Protokolle verwendet.</p>
        </div>

        <div className="form-group">
          <label htmlFor="default-label">Standard-Gestenlabel</label>
          <input
            id="default-label"
            value={preferredGestureLabel}
            onChange={(event) => setPreferredGestureLabel(event.target.value)}
            placeholder="z. B. HILFE"
          />
          <p className="muted small">Vorbelegung für neue Bundles und Aufnahmen.</p>
          {suggestedLabel && suggestedLabel !== preferredGestureLabel && (
            <button
              type="button"
              className="ghost"
              onClick={() => setPreferredGestureLabel(suggestedLabel)}
              style={{ marginTop: '0.5rem' }}
            >
              Letzte erkannte Geste übernehmen ({suggestedLabel})
            </button>
          )}
        </div>

        <div className="panel" style={{ gap: '0.35rem' }}>
          <p className="eyebrow">Letzte Gesten</p>
          {recentGestures.length === 0 && <p className="muted">Noch keine Erkennung erfasst.</p>}
          {recentGestures.length > 0 && (
            <ul className="muted small gesture-list">
              {recentGestures.map((gesture) => (
                <li key={gesture}>
                  <span className="badge">{gesture}</span>
                  <span className="muted" style={{ marginLeft: '0.35rem' }}>
                    zugewiesen an {profileId || '…'}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <NavLink to="/training" className="cta-link">
            Weiter zum Training
          </NavLink>
        </div>
      </div>
    </section>
  );
}
