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
          <h2>Aktives Profil</h2>
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
        </div>

        <div className="form-group">
          <label htmlFor="default-label">Standard-Gestenlabel</label>
          <input
            id="default-label"
            value={preferredGestureLabel}
            onChange={(event) => setPreferredGestureLabel(event.target.value)}
            placeholder="z. B. HILFE"
          />
          {suggestedLabel && suggestedLabel !== preferredGestureLabel && (
            <button
              type="button"
              className="ghost mt-sm"
              onClick={() => setPreferredGestureLabel(suggestedLabel)}
              aria-label="Letzte erkannte Geste übernehmen"
            >
              Letzte erkannte Geste übernehmen ({suggestedLabel})
            </button>
          )}
        </div>

        <div className="panel panel-tight">
          <p className="eyebrow">Letzte Gesten</p>
          {recentGestures.length === 0 && <p className="muted">Noch keine Erkennung erfasst.</p>}
          {recentGestures.length > 0 && (
            <ul className="muted small gesture-list">
              {recentGestures.map((gesture) => (
                <li key={gesture}>
                  <span className="badge">{gesture}</span>
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
