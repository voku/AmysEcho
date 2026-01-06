import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAppState } from '../hooks/useAppState';

/**
 * Settings component
 * Now redirects to ProfileManager for profile management.
 */
export function Settings() {
  const { profileId, displayName } = useAppState();

  const handleExportData = useCallback(() => {
    const data = {
      profileId,
      displayName,
      exportedAt: new Date().toISOString(),
      progress: localStorage.getItem(`webapp:progress:${profileId}`),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `amys-echo-export-${profileId}-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [profileId, displayName]);

  const handleClearData = useCallback(() => {
    if (window.confirm('Alle lokalen Daten löschen? Dies kann nicht rückgängig gemacht werden.')) {
      localStorage.clear();
      window.location.reload();
    }
  }, []);

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <p className="eyebrow">Einstellungen</p>
          <h2>Profil & Konfiguration</h2>
          <p className="muted">
            Passe die App an deine Bedürfnisse an und verwalte dein Profil.
          </p>
        </div>
      </div>

      {/* Profile Management */}
      <div className="settings-section">
        <h3>Profilverwaltung</h3>
        
        <div className="notice info">
          <p>
            <strong>🔒 Sicheres Multi-Profil-System</strong>
          </p>
          <p className="muted small">
            Unterstütze mehrere Kinder im Haushalt mit individuellen Profilen. 
            Jedes Profil hat eigene Trainingsdaten, Modelle und ist kryptografisch geschützt.
          </p>
          {profileId && (
            <div style={{ marginTop: '1rem' }}>
              <p><strong>Aktuelles Profil:</strong> {displayName || profileId}</p>
              <p className="muted small">Profil-ID: {profileId}</p>
            </div>
          )}
          <Link to="/profile" className="primary-button" style={{ marginTop: '1rem', display: 'inline-block' }}>
            Profile verwalten
          </Link>
        </div>
      </div>

      {/* Data Management */}
      <div className="settings-section">
        <h3>Datenverwaltung</h3>
        <p className="muted">Exportiere oder lösche deine lokalen Daten.</p>
        <div className="controls settings-actions">
          <button className="secondary-button" onClick={handleExportData}>
            Daten exportieren
          </button>
          <button className="danger-button" onClick={handleClearData}>
            Alle Daten löschen
          </button>
        </div>
      </div>

      {/* About */}
      <div className="settings-section">
        <h3>Über Amy&apos;s Echo</h3>
        <div className="about-info">
          <p><strong>Version:</strong> Webapp Preview</p>
          {profileId && (
            <>
              <p><strong>Profil:</strong> {displayName || profileId}</p>
              <p className="muted small">ID: {profileId}</p>
            </>
          )}
          {!profileId && (
            <p className="muted">Kein Profil aktiv. Bitte erstelle ein Profil unter <Link to="/profile">Profile verwalten</Link>.</p>
          )}
          <p className="muted small" style={{ marginTop: '1rem' }}>
            Amy&apos;s Echo hilft bei der Kommunikation durch Gebärdenerkennung. 
            Die Daten werden lokal im Browser gespeichert.
          </p>
        </div>
      </div>
    </section>
  );
}
