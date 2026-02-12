import { useCallback, useState } from 'react';
import { useApiConfig } from '../hooks/useApiConfig';
import { resolveApiUrl } from '../utils/resolveApiUrl';

export interface UserProfileFormProps {
  initialDisplayName?: string;
}

export function UserProfileForm({ initialDisplayName = '' }: UserProfileFormProps) {
  const { apiBaseUrl, apiToken } = useApiConfig();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!apiToken) {
        setMessage('Bitte melde dich an, um dein Profil zu bearbeiten.');
        return;
      }
      if (!displayName.trim()) {
        setMessage('Bitte gib einen Namen ein.');
        return;
      }
      setIsSaving(true);
      setMessage('Profil wird gespeichert…');

      try {
        const response = await fetch(resolveApiUrl('/api/user/profile', apiBaseUrl), {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiToken}`,
          },
          body: JSON.stringify({ displayName: displayName.trim() }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || 'Profilaktualisierung fehlgeschlagen.');
        }
        setMessage('Profil gespeichert.');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Ein Fehler ist aufgetreten.');
      } finally {
        setIsSaving(false);
      }
    },
    [apiBaseUrl, apiToken, displayName],
  );

  return (
    <form onSubmit={handleSubmit} className="settings-form">
      <div className="form-group">
        <label htmlFor="display-name">Name</label>
        <input
          id="display-name"
          type="text"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Dein Name"
          autoComplete="name"
        />
      </div>
      {message && <p className="auth-message">{message}</p>}
      <button type="submit" className="primary" disabled={isSaving}>
        {isSaving ? 'Wird gespeichert…' : 'Profil speichern'}
      </button>
    </form>
  );
}
