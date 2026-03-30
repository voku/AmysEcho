import { useCallback, useState } from 'react';
import { useApiConfig } from '../hooks/useApiConfig';
import { resolveApiUrl } from '../utils/resolveApiUrl';

export function ChangePasswordForm() {
  const { apiBaseUrl, apiToken } = useApiConfig();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!apiToken) {
        setMessage('Bitte melde dich an, um dein Passwort zu ändern.');
        return;
      }
      if (!currentPassword || !newPassword || !confirmPassword) {
        setMessage('Bitte fülle alle Passwortfelder aus.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setMessage('Die neuen Passwörter stimmen nicht überein.');
        return;
      }
      setIsSaving(true);
      setMessage('Passwort wird aktualisiert…');

      try {
        const response = await fetch(resolveApiUrl('/api/v1/user/password', apiBaseUrl), {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiToken}`,
          },
          body: JSON.stringify({ currentPassword, newPassword }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || 'Passwortänderung fehlgeschlagen.');
        }
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setMessage('Passwort wurde aktualisiert.');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Ein Fehler ist aufgetreten.');
      } finally {
        setIsSaving(false);
      }
    },
    [apiBaseUrl, apiToken, confirmPassword, currentPassword, newPassword],
  );

  return (
    <form onSubmit={handleSubmit} className="settings-form">
      <div className="form-group">
        <label htmlFor="current-password">Aktuelles Passwort</label>
        <input
          id="current-password"
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
        />
      </div>
      <div className="form-group">
        <label htmlFor="new-password">Neues Passwort</label>
        <input
          id="new-password"
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
        />
      </div>
      <div className="form-group">
        <label htmlFor="confirm-password">Neues Passwort bestätigen</label>
        <input
          id="confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
        />
      </div>
      {message && <p className="auth-message">{message}</p>}
      <button type="submit" className="primary" disabled={isSaving}>
        {isSaving ? 'Wird gespeichert…' : 'Passwort ändern'}
      </button>
    </form>
  );
}
