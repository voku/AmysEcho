import { useCallback, useEffect, useState } from 'react';
import { useApiConfig } from '../hooks/useApiConfig';
import { useAppState } from '../hooks/useAppState';
import { addProfile, createProfile, listProfiles, setActiveProfile } from '../services/profileRegistry';

// ========================================
// Auth/Login Screen - Erster Schritt
// ========================================
export function LoginScreen({ onComplete }: { onComplete: () => void }) {
  const { apiBaseUrl, setTokens, setPersistToken } = useApiConfig();
  const { refreshFromRegistry } = useAppState();
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'reset' | 'verify'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetAuthState = useCallback((nextMode: typeof authMode) => {
    setAuthMode(nextMode);
    setMessage('');
    setPassword('');
    setResetToken('');
    setVerificationToken('');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const { pathname, search } = window.location;
    const params = new URLSearchParams(search);
    const emailParam = params.get('email');
    const tokenParam = params.get('token');

    if (pathname.includes('/verify-email')) {
      setAuthMode('verify');
      if (emailParam) setEmail(emailParam);
      if (tokenParam) setVerificationToken(tokenParam);
    }

    if (pathname.includes('/reset-password')) {
      setAuthMode('reset');
      if (emailParam) setEmail(emailParam);
      if (tokenParam) setResetToken(tokenParam);
    }
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (authMode === 'register') {
      if (!username.trim() || !email.trim() || !password) {
        setMessage('Bitte fülle Nutzername, E-Mail-Adresse und Passwort aus.');
        return;
      }
    } else if (!username.trim() || !password) {
      setMessage('Bitte fülle Nutzername und Passwort aus.');
      return;
    }

    setIsSubmitting(true);
    setMessage('Wird gesendet…');

    try {
      const requestBody: { username: string; password: string; email?: string } = {
        username: username.trim(),
        password,
      };
      if (authMode === 'register') {
        requestBody.email = email.trim();
      }

      const response = await fetch(`${apiBaseUrl}/api/v1/auth/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || 'Anmeldung fehlgeschlagen.');
      }

      const accessToken = payload?.tokens?.accessToken;
      const refreshToken = payload?.tokens?.refreshToken ?? '';

      if (authMode === 'register') {
        setMessage(payload?.message || 'Registrierung erfolgreich. Bitte bestätige deine E-Mail-Adresse.');
        setAuthMode('verify');
        setPassword('');
        setResetToken('');
        setVerificationToken('');
        return;
      }

      if (accessToken) {
        setPersistToken(true);
        setTokens({ accessToken, refreshToken });

        // Ensure a profile exists for this user in the local registry
        try {
          const profiles = await listProfiles();
          const usernameId = username
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');

          const existing = profiles.find((p) => p.profileId === usernameId);
          if (!existing) {
            const newProfile = await createProfile({
              displayName: username.trim(),
              profileId: usernameId,
            });
            await addProfile(newProfile);
          } else {
            await setActiveProfile(existing.uuid);
          }
        } catch (profileError) {
          console.warn('[Login] Failed to sync local profile:', profileError);
        }

        // After auth, profiles are managed by the registry.
        // Refresh the app state to pick up the active profile.
        await refreshFromRegistry();
        setMessage('Erfolgreich! Weiter geht\'s…');
        setTimeout(onComplete, 500);
      } else {
        setMessage('Antwort ohne Token erhalten.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ein Fehler ist aufgetreten.');
    } finally {
      setIsSubmitting(false);
    }
  }, [apiBaseUrl, authMode, email, username, password, setPersistToken, setTokens, refreshFromRegistry, onComplete]);

  const handleResetRequest = useCallback(async () => {
    if (!email.trim()) {
      setMessage('Bitte gib deine E-Mail-Adresse ein.');
      return;
    }
    setIsSubmitting(true);
    setMessage('Reset-Code wird per E-Mail gesendet…');

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || 'Passwort-Reset fehlgeschlagen.');
      }

      setMessage(payload?.message || 'Wenn ein Konto existiert, wurde eine E-Mail mit einem Reset-Code gesendet.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ein Fehler ist aufgetreten.');
    } finally {
      setIsSubmitting(false);
    }
  }, [apiBaseUrl, email]);

  const handleResetConfirm = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !resetToken || !password) {
      setMessage('Bitte gib E-Mail-Adresse, Reset-Code und neues Passwort ein.');
      return;
    }

    setIsSubmitting(true);
    setMessage('Passwort wird aktualisiert…');

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/password-reset/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), resetToken, password }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || 'Passwort-Reset fehlgeschlagen.');
      }

      resetAuthState('login');
      setMessage('Passwort wurde aktualisiert. Bitte melde dich neu an.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ein Fehler ist aufgetreten.');
    } finally {
      setIsSubmitting(false);
    }
  }, [apiBaseUrl, email, password, resetAuthState, resetToken]);

  const handleVerifyRequest = useCallback(async () => {
    if (!email.trim()) {
      setMessage('Bitte gib deine E-Mail-Adresse ein.');
      return;
    }
    setIsSubmitting(true);
    setMessage('Bestätigungscode wird per E-Mail gesendet…');

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/verify-email/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || 'E-Mail-Bestätigung fehlgeschlagen.');
      }

      setMessage(payload?.message || 'Wenn ein Konto existiert, wurde eine E-Mail mit einem Bestätigungscode gesendet.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ein Fehler ist aufgetreten.');
    } finally {
      setIsSubmitting(false);
    }
  }, [apiBaseUrl, email]);

  const handleVerifyConfirm = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !verificationToken) {
      setMessage('Bitte gib E-Mail-Adresse und Bestätigungscode ein.');
      return;
    }

    setIsSubmitting(true);
    setMessage('E-Mail-Adresse wird bestätigt…');

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/verify-email/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), verificationToken }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || 'E-Mail-Bestätigung fehlgeschlagen.');
      }

      resetAuthState('login');
      setMessage(payload?.message || 'E-Mail-Adresse wurde bestätigt. Du kannst dich jetzt anmelden.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ein Fehler ist aufgetreten.');
    } finally {
      setIsSubmitting(false);
    }
  }, [apiBaseUrl, email, resetAuthState, verificationToken]);

  const handleSkip = useCallback(() => {
    // Ermöglicht das Überspringen für Demo-Zwecke
    onComplete();
  }, [onComplete]);

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-header">
          <span className="auth-icon">🔐</span>
          <h1>
            {authMode === 'reset'
              ? 'Passwort zurücksetzen'
              : authMode === 'verify'
                ? 'E-Mail-Adresse bestätigen'
                : 'Willkommen bei Amy&apos;s Echo'}
          </h1>
          <p className="muted">
            {authMode === 'reset'
              ? 'Fordere einen Reset-Code per E-Mail an und setze dein Passwort neu.'
              : authMode === 'verify'
                ? 'Gib den Bestätigungscode aus der E-Mail ein, um dein Konto zu aktivieren.'
                : 'Melde dich an oder erstelle ein neues Konto, um fortzufahren.'}
          </p>
        </div>

        <form
          onSubmit={
            authMode === 'reset' ? handleResetConfirm : authMode === 'verify' ? handleVerifyConfirm : handleSubmit
          }
          className="auth-form"
        >
          {authMode !== 'reset' && authMode !== 'verify' && (
            <div className="auth-mode-toggle">
              <button
                type="button"
                className={authMode === 'login' ? 'active' : ''}
                onClick={() => resetAuthState('login')}
              >
                Anmelden
              </button>
              <button
                type="button"
                className={authMode === 'register' ? 'active' : ''}
                onClick={() => resetAuthState('register')}
              >
                Registrieren
              </button>
            </div>
          )}

          {authMode !== 'reset' && authMode !== 'verify' && (
            <div className="form-group">
              <label htmlFor="username">Nutzername</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Dein Nutzername"
                autoComplete={authMode === 'register' ? 'new-username' : 'username'}
              />
            </div>
          )}

          {(authMode === 'register' || authMode === 'reset' || authMode === 'verify') && (
            <div className="form-group">
              <label htmlFor="email">E-Mail-Adresse</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@beispiel.de"
                autoComplete="email"
              />
            </div>
          )}

          {authMode === 'verify' && (
            <div className="form-group">
              <label htmlFor="verification-token">Bestätigungscode</label>
              <input
                id="verification-token"
                type="text"
                value={verificationToken}
                onChange={(e) => setVerificationToken(e.target.value)}
                placeholder="Code aus der E-Mail"
                autoComplete="one-time-code"
              />
            </div>
          )}

          {authMode === 'reset' && (
            <div className="form-group">
              <label htmlFor="reset-token">Reset-Code</label>
              <input
                id="reset-token"
                type="text"
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                placeholder="Code aus der Reset-Anfrage"
                autoComplete="one-time-code"
              />
            </div>
          )}

          {authMode !== 'verify' && (
            <div className="form-group">
              <label htmlFor="password">
                {authMode === 'reset' ? 'Neues Passwort' : 'Passwort'}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>
          )}

          {message && <p className="auth-message">{message}</p>}

          {authMode === 'reset' ? (
            <>
              <button type="button" className="secondary full-width" onClick={handleResetRequest} disabled={isSubmitting}>
                {isSubmitting ? 'Wird gesendet…' : 'Reset-Code anfordern'}
              </button>
              <button type="submit" className="primary full-width" disabled={isSubmitting}>
                {isSubmitting ? 'Wird gesendet…' : 'Passwort speichern'}
              </button>
              <button type="button" className="ghost full-width" onClick={() => resetAuthState('login')}>
                Zurück zur Anmeldung
              </button>
            </>
          ) : authMode === 'verify' ? (
            <>
              <button type="button" className="secondary full-width" onClick={handleVerifyRequest} disabled={isSubmitting}>
                {isSubmitting ? 'Wird gesendet…' : 'Bestätigungscode erneut senden'}
              </button>
              <button type="submit" className="primary full-width" disabled={isSubmitting}>
                {isSubmitting ? 'Wird gesendet…' : 'E-Mail bestätigen'}
              </button>
              <button type="button" className="ghost full-width" onClick={() => resetAuthState('login')}>
                Zurück zur Anmeldung
              </button>
            </>
          ) : (
            <>
              <button type="submit" className="primary full-width" disabled={isSubmitting}>
                {isSubmitting ? 'Wird gesendet…' : authMode === 'login' ? 'Anmelden' : 'Registrieren'}
              </button>
              {authMode === 'login' && (
                <>
                  <button type="button" className="ghost full-width" onClick={() => resetAuthState('reset')}>
                    Passwort vergessen?
                  </button>
                  <button type="button" className="ghost full-width" onClick={() => resetAuthState('verify')}>
                    E-Mail bestätigen
                  </button>
                </>
              )}
            </>
          )}

          <button type="button" className="ghost full-width" onClick={handleSkip}>
            Ohne Anmeldung fortfahren (Demo)
          </button>
        </form>
      </div>
    </div>
  );
}
