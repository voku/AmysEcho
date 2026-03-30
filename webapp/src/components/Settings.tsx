import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useApiConfig } from '../hooks/useApiConfig';
import { useAppState } from '../hooks/useAppState';
import { buildProfileLocalDataExport, clearProfileScopedLocalData } from '../services/profileLocalData';
import { resolveApiUrl } from '../utils/resolveApiUrl';
import { UserSettings } from './UserSettings';

/**
 * Settings component
 * Now redirects to ProfileManager for profile management.
 */
export function Settings() {
  const { profileId, displayName } = useAppState();
  const { apiBaseUrl, apiToken } = useApiConfig();
  const commitHash = import.meta.env['VITE_APP_COMMIT_SHA']?.trim() || 'unbekannt';

  const handleExportData = useCallback(() => {
    void (async () => {
      if (profileId && apiToken) {
        try {
          const response = await fetch(
            resolveApiUrl(`/api/v1/profiles/${encodeURIComponent(profileId)}/export`, apiBaseUrl),
            {
              headers: {
                Authorization: `Bearer ${apiToken}`,
                'X-Profile-Id': profileId,
              },
            },
          );
          if (response.ok) {
            const blob = new Blob([await response.arrayBuffer()], { type: 'application/zip' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `amys-echo-profile-export-${profileId}-${new Date().toISOString().split('T')[0]}.zip`;
            link.click();
            URL.revokeObjectURL(url);
            return;
          }
        } catch (error) {
          console.warn('[Settings] Profil-Export vom Server fehlgeschlagen, nutze lokalen Export.', error);
        }
      }

      const data = buildProfileLocalDataExport(profileId, displayName);
      if (!data) {
        return;
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `amys-echo-profile-local-${profileId}-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
    })();
  }, [apiBaseUrl, apiToken, profileId, displayName]);

  const handleClearData = useCallback(() => {
    if (!profileId) {
      return;
    }
    if (window.confirm('Lokale Daten für dieses Profil löschen? Andere Profile bleiben erhalten.')) {
      clearProfileScopedLocalData(profileId);
      window.location.reload();
    }
  }, [profileId]);

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

      <UserSettings />

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
        <p className="muted">Exportiere oder lösche nur die lokalen Daten des aktuell aktiven Profils.</p>
        <div className="controls settings-actions">
          <button className="secondary-button" onClick={handleExportData} disabled={!profileId}>
            Lokale Profildaten exportieren
          </button>
          <button className="danger-button" onClick={handleClearData} disabled={!profileId}>
            Lokale Profildaten löschen
          </button>
        </div>
      </div>

      {/* About */}
      <div className="settings-section">
        <h3>Über Amy&apos;s Echo</h3>
        <div className="about-info">
          <p><strong>Version:</strong> Webapp Preview</p>
          <p><strong>Commit:</strong> {commitHash}</p>
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
