import { useCallback, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useApiConfig } from '../hooks/useApiConfig';

export function ApiConfigBar() {
  const {
    apiBaseUrl,
    apiToken,
    setApiBaseUrl,
    setApiToken,
    uploadEndpoint,
    persistToken,
    setPersistToken,
    clearApiToken,
  } = useApiConfig();
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const obfuscatedToken = useMemo(() => {
    if (!apiToken) return '';
    if (apiToken.length <= 4) return '••••';
    if (apiToken.length <= 8) return `${apiToken.slice(0, 2)}••••`;
    return `${apiToken.slice(0, 3)}••••${apiToken.slice(-2)}`;
  }, [apiToken]);

  const handleBaseChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setApiBaseUrl(event.target.value);
    },
    [setApiBaseUrl],
  );

  const handleTokenChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setApiToken(event.target.value);
    },
    [setApiToken],
  );

  const handlePersistToggle = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setPersistToken(event.target.checked);
    },
    [setPersistToken],
  );

  const handleAuthSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!username.trim() || !password) {
        setAuthMessage('Bitte fülle Nutzername und Passwort aus.');
        return;
      }

      setIsSubmitting(true);
      setAuthMessage('Sende Daten…');
      const target = `${apiBaseUrl}/api/v1/auth/${authMode}`;
      try {
        const response = await fetch(target, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim(), password }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const reason = typeof payload?.error === 'string' ? payload.error : 'Anmeldung fehlgeschlagen.';
          throw new Error(reason);
        }

        const accessToken: string | undefined = payload?.tokens?.accessToken;
        if (accessToken) {
          setPersistToken(true);
          setApiToken(accessToken);
          setAuthMessage(
            authMode === 'login'
              ? 'Anmeldung erfolgreich. Token wurde gespeichert.'
              : 'Registrierung abgeschlossen. Token wurde gespeichert.',
          );
        } else {
          setAuthMessage('Antwort ohne Token erhalten.');
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Anmeldung fehlgeschlagen.';
        setAuthMessage(reason);
      } finally {
        setIsSubmitting(false);
      }
    },
    [apiBaseUrl, authMode, password, setApiToken, setPersistToken, username],
  );

  return (
    <section className="card profile-card">
      <div className="card-header">
        <div>
          <p className="eyebrow">Backend</p>
          <h2>API-Ziel konfigurieren</h2>
          <p className="muted">
            Nutzt dieselbe Upload-Route wie die App. Basis-URL bleibt dauerhaft gespeichert, das Token wird nach Login oder
            Registrierung für diese Sitzung abgelegt (sessionStorage) und kann jederzeit gelöscht werden.
          </p>
        </div>
        <div className="status-chip" data-state={apiBaseUrl ? 'idle' : 'error'}>
          {apiBaseUrl ? 'Verbunden' : 'URL fehlt'}
        </div>
      </div>

      <div className="profile-grid">
        <div className="form-group">
          <label htmlFor="api-base">Basis-URL</label>
          <input
            id="api-base"
            value={apiBaseUrl}
            onChange={handleBaseChange}
            placeholder="https://dein-server.example.com"
          />
          <p className="muted small">Wird für Uploads, Polling und Modell-Endpunkte verwendet.</p>
          <p className="muted small">Aktueller Upload-Pfad: {uploadEndpoint}</p>
        </div>

        <div className="form-group">
          <label htmlFor="api-token">API-Token (optional)</label>
          <input
            id="api-token"
            value={apiToken}
            onChange={handleTokenChange}
            placeholder="Bearer-Token aus dem Backend"
            type="password"
          />
          <p className="muted small">
            Wird als Authorization-Header gesetzt. Token können pro Browsersitzung in einem separaten Speicher abgelegt
            werden ({persistToken ? 'aktiv' : 'inaktiv'}). {obfuscatedToken && `(Aktuell: ${obfuscatedToken})`}
          </p>
          <div className="toggle mt-xs">
            <input
              id="persist-token"
              type="checkbox"
              checked={persistToken}
              onChange={handlePersistToggle}
            />
            <label htmlFor="persist-token">
              Token in dieser Sitzung merken (sessionStorage, kein langfristiger Klartext-Speicher)
            </label>
          </div>
          <button className="ghost mt-xs" type="button" onClick={clearApiToken}>
            Token löschen
          </button>
        </div>

        <form className="panel panel-tight" onSubmit={handleAuthSubmit}>
          <p className="eyebrow">Registrierung / Login</p>
          <div className="toggle mb-xs">
            <input
              id="auth-mode"
              type="checkbox"
              checked={authMode === 'register'}
              onChange={(event) => {
                setAuthMode(event.target.checked ? 'register' : 'login');
                setAuthMessage('');
              }}
            />
            <label htmlFor="auth-mode">Neuen Zugang registrieren</label>
          </div>
          <label className="mt-xs" htmlFor="auth-username">
            Nutzername
          </label>
          <input
            id="auth-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="pflegekraft"
            autoComplete={authMode === 'login' ? 'username' : 'new-username'}
          />
          <label className="mt-xs" htmlFor="auth-password">
            Passwort
          </label>
          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
          />
          <p className="muted small">
            Erst Registrierung, dann Login? Nicht nötig: Beide Wege geben direkt ein Sitzungs-Token zurück, das in den Upload-
            Routen genutzt wird.
          </p>
          <button className="primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Wird gesendet…' : authMode === 'login' ? 'Login & Token holen' : 'Registrieren & Token holen'}
          </button>
          {authMessage && <p className="muted small mt-xs">{authMessage}</p>}
        </form>

        <div className="panel panel-tight">
          <p className="eyebrow">Hinweise</p>
          <ul className="muted small bullets">
            <li>Fällt auf <code>VITE_API_URL</code> oder <code>http://localhost:3000</code> zurück.</li>
            <li>Änderungen wirken sofort auf Gestenerkennung &amp; Training.</li>
            <li>
              Token werden nur nach Login/Registrierung in der aktuellen Sitzung gesichert und können jederzeit gelöscht
              werden.
            </li>
            <li>Keine dauerhafte Speicherung sensibler Tokens im Browser-Speicher.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
