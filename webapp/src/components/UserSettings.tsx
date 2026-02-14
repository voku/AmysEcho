import { useCallback } from 'react';
import { useApiConfig } from '../hooks/useApiConfig';
import { ChangePasswordForm } from './ChangePasswordForm';
import { UserProfileForm } from './UserProfileForm';

const AUTH_KEY = 'webapp:auth-complete';

export function UserSettings() {
  const { clearApiToken } = useApiConfig();

  const handleLogout = useCallback(() => {
    clearApiToken();
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(AUTH_KEY, 'false');
    }
  }, [clearApiToken]);

  return (
    <>
      <div className="settings-section">
        <h3>Konto</h3>
        <p className="muted">
          Verwalte deinen Namen und dein Passwort. Nur bestätigte Konten können Änderungen speichern.
        </p>
        <div className="controls settings-actions mt-sm">
          <button type="button" className="danger-button" onClick={handleLogout}>
            Abmelden
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h3>Profil</h3>
        <UserProfileForm />
      </div>

      <div className="settings-section">
        <h3>Passwort</h3>
        <ChangePasswordForm />
      </div>
    </>
  );
}
