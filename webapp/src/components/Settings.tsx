import { useState, useCallback } from 'react';
import { useAppState } from '../hooks/useAppState';

/**
 * Settings component - mirrors ProfileManagerScreen from the Expo app.
 * Allows users to configure app preferences and manage their profile.
 */
export function Settings() {
  const { profileId, displayName, setDisplayName } = useAppState();
  const [newDisplayName, setNewDisplayName] = useState(displayName || '');
  const [showSaved, setShowSaved] = useState(false);

  const handleSaveProfile = useCallback(() => {
    setDisplayName(newDisplayName.trim());
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
  }, [newDisplayName, setDisplayName]);

  const handleExportData = useCallback(() => {
    const data = {
      profileId,
      exportedAt: new Date().toISOString(),
      appState: localStorage.getItem('webapp:app-state'),
      progress: localStorage.getItem(`webapp:progress:${profileId}`),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `amys-echo-export-${profileId}-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [profileId]);

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

      {showSaved && (
        <div className="notice success">
          ✓ Einstellungen gespeichert!
        </div>
      )}

      {/* Profile Settings */}
      <div className="settings-section">
        <h3>Profil</h3>
        <div className="settings-grid">
          <div className="setting-item">
            <label htmlFor="profile-name">Anzeigename</label>
            <input
              id="profile-name"
              type="text"
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              placeholder={profileId}
            />
            <p className="muted small">
              Freundlicher Name, der in der App angezeigt wird. Du kannst diesen Namen jederzeit ändern.
            </p>
          </div>
          <div className="setting-item">
            <label htmlFor="profile-id-readonly">Profil-ID (unveränderlich)</label>
            <input
              id="profile-id-readonly"
              type="text"
              value={profileId}
              disabled
              style={{ opacity: 0.6, cursor: 'not-allowed' }}
            />
            <p className="muted small">
              ⚠️ <strong>Wichtig:</strong> Die Profil-ID ist dauerhaft und mit allen Trainingsdaten,
              Modellen und aufgezeichneten Gebärden verknüpft. Sie kann nicht geändert werden,
              ohne alle Daten zu verlieren.
            </p>
          </div>
        </div>
        <div className="controls">
          <button className="primary" onClick={handleSaveProfile}>
            Anzeigename speichern
          </button>
        </div>
      </div>

      {/* Data Management */}
      <div className="settings-section">
        <h3>Datenverwaltung</h3>
        <p className="muted">Exportiere oder lösche deine lokalen Daten.</p>
        <div className="controls">
          <button className="ghost" onClick={handleExportData}>
            Daten exportieren
          </button>
          <button className="ghost danger" onClick={handleClearData}>
            Alle Daten löschen
          </button>
        </div>
      </div>

      {/* About */}
      <div className="settings-section">
        <h3>Über Amy&apos;s Echo</h3>
        <div className="about-info">
          <p><strong>Version:</strong> Webapp Preview</p>
          <p><strong>Profil:</strong> {displayName || profileId}</p>
          <p><strong>Profil-ID:</strong> {profileId}</p>
          <p className="muted small">
            Amy&apos;s Echo hilft bei der Kommunikation durch Gebärdenerkennung. 
            Die Daten werden lokal im Browser gespeichert.
          </p>
        </div>
      </div>
    </section>
  );
}
