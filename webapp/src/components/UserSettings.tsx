import { ChangePasswordForm } from './ChangePasswordForm';
import { UserProfileForm } from './UserProfileForm';

export function UserSettings() {
  return (
    <>
      <div className="settings-section">
        <h3>Konto</h3>
        <p className="muted">
          Verwalte deinen Namen und dein Passwort. Nur bestätigte Konten können Änderungen speichern.
        </p>
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
