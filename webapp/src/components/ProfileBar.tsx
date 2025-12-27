import { NavLink } from 'react-router-dom';
import { useAppState } from '../hooks/useAppState';

export function ProfileBar() {
  const {
    profileId,
    displayName,
    lastRecognizedSign,
    recentSigns,
  } = useAppState();

  return (
    <section className="card profile-card">
      <div className="card-header">
        <div>
          <h2>Aktives Profil</h2>
        </div>
        <div className="status-chip" data-state={lastRecognizedSign ? 'active' : 'idle'}>
          {lastRecognizedSign ? 'Aktiv' : 'Bereit'}
        </div>
      </div>

      <div className="profile-grid">
        <div className="form-group">
          <label htmlFor="profile-name">Anzeigename</label>
          <input
            id="profile-name"
            value={displayName || ''}
            readOnly
            placeholder="Kein Profil aktiv"
          />
           <label htmlFor="profile-id">Profil-ID</label>
          <input
            id="profile-id"
            value={profileId || ''}
            readOnly
            placeholder="-"
          />
        </div>

        <div className="panel panel-tight">
          <p className="eyebrow">Letzte Gebärden</p>
          {recentSigns.length === 0 && <p className="muted">Noch keine Erkennung erfasst.</p>}
          {recentSigns.length > 0 && (
            <ul className="muted small gesture-list">
              {recentSigns.map((sign, index) => (
                <li key={`${sign}-${index}`}>
                  <span className="badge">{sign}</span>
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

