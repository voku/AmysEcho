import { FormEvent, useCallback, useState } from 'react';
import { useApiConfig } from '../hooks/useApiConfig';
import { AUTH_KEY } from '../constants/auth';
import { ChangePasswordForm } from './ChangePasswordForm';
import { UserProfileForm } from './UserProfileForm';
import { resolveApiUrl } from '../utils/resolveApiUrl';

const DELETE_CONFIRM_TEXT = 'KONTO LÖSCHEN';

export function UserSettings() {
  const { apiBaseUrl, apiToken, clearApiToken } = useApiConfig();
  const [deleteUsername, setDeleteUsername] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteMessage, setDeleteMessage] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleLogout = useCallback(() => {
    clearApiToken();
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(AUTH_KEY, 'false');
    }
  }, [clearApiToken]);

  const handleDeleteAccount = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!apiToken) {
      setDeleteMessage('Bitte melde dich zuerst an.');
      return;
    }

    if (!deleteUsername.trim() || !deletePassword || !deleteConfirmText.trim()) {
      setDeleteMessage('Bitte fülle Nutzername, Passwort und Bestätigung vollständig aus.');
      return;
    }

    if (deleteConfirmText.trim() !== DELETE_CONFIRM_TEXT) {
      setDeleteMessage(`Bitte gib zur Bestätigung exakt "${DELETE_CONFIRM_TEXT}" ein.`);
      return;
    }

    setIsDeleting(true);
    setDeleteMessage('Konto wird geprüft und gelöscht…');

    try {
      const response = await fetch(resolveApiUrl('/api/v1/auth/account', apiBaseUrl), {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify({
          username: deleteUsername.trim(),
          password: deletePassword,
          confirmText: deleteConfirmText.trim(),
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || 'Konto konnte nicht gelöscht werden.');
      }

      handleLogout();
      setDeleteUsername('');
      setDeletePassword('');
      setDeleteConfirmText('');
      setDeleteMessage('Konto wurde gelöscht. Du bist jetzt abgemeldet.');
    } catch (error) {
      setDeleteMessage(error instanceof Error ? error.message : 'Konto konnte nicht gelöscht werden.');
    } finally {
      setIsDeleting(false);
    }
  }, [apiBaseUrl, apiToken, deleteConfirmText, deletePassword, deleteUsername, handleLogout]);

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

      <div className="settings-section">
        <h3>Konto endgültig löschen</h3>
        <p className="muted">
          Diese Aktion löscht dein Konto dauerhaft. Bitte bestätige zur Sicherheit erneut mit deinen Zugangsdaten.
        </p>
        <form onSubmit={handleDeleteAccount} className="stack-sm mt-sm">
          <div className="form-group">
            <label htmlFor="delete-username">Nutzername zur Bestätigung</label>
            <input
              id="delete-username"
              type="text"
              autoComplete="username"
              value={deleteUsername}
              onChange={(event) => setDeleteUsername(event.target.value)}
              placeholder="Dein aktueller Nutzername"
            />
          </div>
          <div className="form-group">
            <label htmlFor="delete-password">Passwort zur Bestätigung</label>
            <input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="delete-confirm-text">Sicherheitswort eingeben: {DELETE_CONFIRM_TEXT}</label>
            <input
              id="delete-confirm-text"
              type="text"
              value={deleteConfirmText}
              onChange={(event) => setDeleteConfirmText(event.target.value)}
              placeholder={DELETE_CONFIRM_TEXT}
            />
          </div>
          {deleteMessage && <p className="muted small">{deleteMessage}</p>}
          <button type="submit" className="danger-button" disabled={isDeleting}>
            {isDeleting ? 'Konto wird gelöscht…' : 'Konto dauerhaft löschen'}
          </button>
        </form>
      </div>
    </>
  );
}
