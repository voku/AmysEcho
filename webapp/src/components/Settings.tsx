import { useState, useCallback } from 'react';
import { useAppState } from '../hooks/useAppState';

interface SettingsState {
  showOverlay: boolean;
  mirrorPreview: boolean;
  autoStartCamera: boolean;
  soundEnabled: boolean;
  hapticEnabled: boolean;
}

const STORAGE_KEY = 'webapp:settings';

function loadSettings(): SettingsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Could not load settings', e);
  }
  return {
    showOverlay: true,
    mirrorPreview: false,
    autoStartCamera: false,
    soundEnabled: true,
    hapticEnabled: true,
  };
}

function saveSettings(settings: SettingsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Could not save settings', e);
  }
}

/**
 * Settings component - mirrors ProfileManagerScreen from the Expo app.
 * Allows users to configure app preferences and manage their profile.
 */
export function Settings() {
  const { profileId, setProfileId, preferredGestureLabel, setPreferredGestureLabel } = useAppState();
  const [settings, setSettings] = useState<SettingsState>(() => loadSettings());
  const [newProfileId, setNewProfileId] = useState(profileId);
  const [newGestureLabel, setNewGestureLabel] = useState(preferredGestureLabel);
  const [showSaved, setShowSaved] = useState(false);

  const updateSetting = useCallback(<K extends keyof SettingsState>(
    key: K,
    value: SettingsState[K]
  ) => {
    setSettings((prev) => {
      const newSettings = { ...prev, [key]: value };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const handleSaveProfile = useCallback(() => {
    if (newProfileId.trim()) {
      setProfileId(newProfileId.trim());
    }
    if (newGestureLabel.trim()) {
      setPreferredGestureLabel(newGestureLabel.trim().toUpperCase());
    }
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
  }, [newProfileId, newGestureLabel, setProfileId, setPreferredGestureLabel]);

  const handleExportData = useCallback(() => {
    const data = {
      profileId,
      settings,
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
  }, [profileId, settings]);

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
            <label htmlFor="profile-id">Profil-ID</label>
            <input
              id="profile-id"
              type="text"
              value={newProfileId}
              onChange={(e) => setNewProfileId(e.target.value)}
              placeholder="z.B. amy-1"
            />
            <p className="muted small">Eindeutige Kennung für dein Profil</p>
          </div>
          <div className="setting-item">
            <label htmlFor="preferred-gesture">Standard-Geste</label>
            <input
              id="preferred-gesture"
              type="text"
              value={newGestureLabel}
              onChange={(e) => setNewGestureLabel(e.target.value)}
              placeholder="z.B. HILFE"
            />
            <p className="muted small">Bevorzugte Geste für neue Trainings</p>
          </div>
        </div>
        <div className="controls">
          <button className="primary" onClick={handleSaveProfile}>
            Profil speichern
          </button>
        </div>
      </div>

      {/* Display Settings */}
      <div className="settings-section">
        <h3>Anzeige</h3>
        <div className="settings-list">
          <div className="setting-toggle">
            <div>
              <label htmlFor="show-overlay">Overlay anzeigen</label>
              <p className="muted small">Zeigt Hand-Landmarks auf dem Video</p>
            </div>
            <input
              id="show-overlay"
              type="checkbox"
              checked={settings.showOverlay}
              onChange={(e) => updateSetting('showOverlay', e.target.checked)}
            />
          </div>
          <div className="setting-toggle">
            <div>
              <label htmlFor="mirror-preview">Vorschau spiegeln</label>
              <p className="muted small">Spiegelt das Kamerabild horizontal</p>
            </div>
            <input
              id="mirror-preview"
              type="checkbox"
              checked={settings.mirrorPreview}
              onChange={(e) => updateSetting('mirrorPreview', e.target.checked)}
            />
          </div>
          <div className="setting-toggle">
            <div>
              <label htmlFor="auto-start">Kamera automatisch starten</label>
              <p className="muted small">Startet die Kamera beim Öffnen der App</p>
            </div>
            <input
              id="auto-start"
              type="checkbox"
              checked={settings.autoStartCamera}
              onChange={(e) => updateSetting('autoStartCamera', e.target.checked)}
            />
          </div>
        </div>
      </div>

      {/* Feedback Settings */}
      <div className="settings-section">
        <h3>Feedback</h3>
        <div className="settings-list">
          <div className="setting-toggle">
            <div>
              <label htmlFor="sound-enabled">Ton aktivieren</label>
              <p className="muted small">Spielt Sounds bei erkannten Gesten</p>
            </div>
            <input
              id="sound-enabled"
              type="checkbox"
              checked={settings.soundEnabled}
              onChange={(e) => updateSetting('soundEnabled', e.target.checked)}
            />
          </div>
          <div className="setting-toggle">
            <div>
              <label htmlFor="haptic-enabled">Vibration aktivieren</label>
              <p className="muted small">Vibriert bei erkannten Gesten (wenn verfügbar)</p>
            </div>
            <input
              id="haptic-enabled"
              type="checkbox"
              checked={settings.hapticEnabled}
              onChange={(e) => updateSetting('hapticEnabled', e.target.checked)}
            />
          </div>
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
          <p><strong>Profil:</strong> {profileId}</p>
          <p className="muted small">
            Amy&apos;s Echo hilft bei der Kommunikation durch Gestenerkennung. 
            Die Daten werden lokal im Browser gespeichert.
          </p>
        </div>
      </div>
    </section>
  );
}
