import { useCallback, useMemo, type ChangeEvent } from 'react';
import { useApiConfig } from '../hooks/useApiConfig';

export function ApiConfigBar() {
  const { apiBaseUrl, apiToken, setApiBaseUrl, setApiToken, uploadEndpoint } = useApiConfig();

  const obfuscatedToken = useMemo(() => {
    if (!apiToken) return '';
    if (apiToken.length <= 8) return '••••••';
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

  return (
    <section className="card profile-card">
      <div className="card-header">
        <div>
          <p className="eyebrow">Backend</p>
          <h2>API-Ziel konfigurieren</h2>
          <p className="muted">
            Nutzt dieselbe Upload-Route wie die App. Basis-URL und Token werden lokal gespeichert und für alle Uploads
            &amp; Polling-Anfragen verwendet.
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
          <p className="muted small">Wird als Authorization-Header gesetzt. {obfuscatedToken && `(Gespeichert: ${obfuscatedToken})`}</p>
        </div>

        <div className="panel panel-tight">
          <p className="eyebrow">Hinweise</p>
          <ul className="muted small bullets">
            <li>Fällt auf <code>VITE_API_URL</code> oder <code>http://localhost:3000</code> zurück.</li>
            <li>Änderungen wirken sofort auf Gestenerkennung &amp; Training.</li>
            <li>Token wird nur im Browser gespeichert, nicht auf dem Server.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
