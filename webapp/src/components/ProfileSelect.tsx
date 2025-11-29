/**
 * ProfileSelect - Navigation hub for different user modes
 * Mirrors app/src/screens/ProfileSelectScreen.tsx
 * 
 * For Amy: A clear starting point that adapts to who's using the app
 */
import React from 'react';
import { Link } from 'react-router-dom';

export const ProfileSelect: React.FC = () => {
  const [profile, setProfile] = React.useState<{ id: string; name: string } | null>(null);

  React.useEffect(() => {
    const savedProfile = localStorage.getItem('amysecho_active_profile');
    if (savedProfile) {
      try {
        setProfile(JSON.parse(savedProfile));
      } catch {
        // Ignore
      }
    }
  }, []);

  return (
    <div className="profile-select">
      <header className="select-header">
        <h2>Wohin möchtest du als Nächstes?</h2>
        <p className="muted">Wähle den Bereich aus, der jetzt am meisten unterstützt.</p>
      </header>

      <section className="select-section">
        <div className="option-grid">
          <Link 
            to={profile ? '/' : '/onboarding'} 
            className={`option-card ${!profile ? 'disabled' : ''}`}
          >
            <span className="option-icon">👂</span>
            <div className="option-content">
              <strong>Zuhören</strong>
              <p>
                {profile 
                  ? 'Starte den Erkennungsmodus und lass Amy sofort verstanden werden.'
                  : 'Lege zuerst ein Profil an, damit wir wissen, wen wir begleiten.'}
              </p>
            </div>
          </Link>

          <Link to="/lernen" className="option-card">
            <span className="option-icon">📚</span>
            <div className="option-content">
              <strong>Lernen</strong>
              <p>Übe Gesten gemeinsam und sammle neue Trainingsbeispiele.</p>
            </div>
          </Link>
        </div>
      </section>

      <section className="select-section">
        <h3>Für Betreuende</h3>
        <div className="option-grid">
          <Link to="/elterntor?target=/eltern" className="option-card">
            <span className="option-icon">👨‍👩‍👧</span>
            <div className="option-content">
              <strong>Elternbereich</strong>
              <p>Einstellungen, Betreuungstools und Unterstützung für Pflegepersonen.</p>
            </div>
            <span className="gate-badge">🔒</span>
          </Link>

          <Link to="/elterntor?target=/admin" className="option-card">
            <span className="option-icon">🔧</span>
            <div className="option-content">
              <strong>Adminbereich</strong>
              <p>Modelle verwalten, Updates prüfen und technische Details anpassen.</p>
            </div>
            <span className="gate-badge">🔒</span>
          </Link>

          <Link to="/einstellungen" className="option-card">
            <span className="option-icon">👤</span>
            <div className="option-content">
              <strong>Profile verwalten</strong>
              <p>Profile für Kinder anlegen, bearbeiten oder wechseln.</p>
            </div>
          </Link>
        </div>
      </section>

      {!profile && (
        <div className="no-profile-notice">
          <p>
            ⚠️ Kein Profil gefunden. Lege zuerst ein Profil an, damit Amy begleitet wird.
          </p>
          <Link to="/onboarding" className="primary-button">
            Profil anlegen
          </Link>
        </div>
      )}
    </div>
  );
};
