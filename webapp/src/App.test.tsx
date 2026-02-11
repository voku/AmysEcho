import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { act, render } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { ApiConfigProvider, useApiConfig } from './hooks/useApiConfig';
import { AppStateProvider, useAppState } from './hooks/useAppState';
import { useAppStatus } from './hooks/useAppStatus';
import { LoginScreen } from './components/LoginScreen';
import { App } from './App';
import { MessageProvider } from './context/MessageContext';
import { SymbolStoreProvider } from './context/SymbolStore';

type HarnessHandles = { expire: () => void };

type HarnessProps = { handles: React.MutableRefObject<HarnessHandles | null> };

function StatusHarness({ handles }: HarnessProps) {
  const { status } = useAppStatus();
  const { setTokens, setPersistToken } = useApiConfig();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    setPersistToken(true);
    setTokens({ accessToken: 'token', refreshToken: 'refresh' });
    handles.current = {
      expire: () => setTokens({ accessToken: '', refreshToken: '' }),
    };
  }, [handles, setPersistToken, setTokens]);

  return <div data-testid="status" data-status={status} />;
}

describe('useAppStatus session handling', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem('webapp:auth-complete', 'true');
    window.localStorage.setItem('webapp:onboarding-complete', 'true');
  });

  it('setzt den Status bei abgelaufener Sitzung zurück auf Auth', async () => {
    const handles: { current: HarnessHandles | null } = { current: null };

    render(
      <ApiConfigProvider>
        <StatusHarness handles={handles} />
      </ApiConfigProvider>,
    );

    await waitFor(() => {
      const status = screen.getByTestId('status');
      expect(status.dataset['status']).toBe('app');
    });

    act(() => {
      handles.current?.expire();
    });

    await waitFor(() => {
      const status = screen.getByTestId('status');
      expect(status.dataset['status']).toBe('auth');
    });
    expect(window.localStorage.getItem('webapp:auth-complete')).toBe('false');
  });
});

describe('LoginScreen', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('persistiert Tokens und setzt das Profil nach erfolgreicher Anmeldung', async () => {
    const backendProfileId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        user: { username: 'amy-user', id: backendProfileId },
        tokens: { accessToken: 'token-abc', refreshToken: 'refresh-xyz' },
      }),
    });
    global.fetch = fetchMock as any;

    const onComplete = vi.fn();

    function DebugPanel() {
      const { apiToken, refreshToken, persistToken } = useApiConfig();
      const { profileId } = useAppState();
      return (
        <div
          data-testid="login-debug"
          data-token={apiToken}
          data-refresh={refreshToken}
          data-profile={profileId}
          data-persist={persistToken ? 'true' : 'false'}
        />
      );
    }

    render(
      <ApiConfigProvider>
        <AppStateProvider>
          <LoginScreen onComplete={onComplete} />
          <DebugPanel />
        </AppStateProvider>
      </ApiConfigProvider>,
    );

    fireEvent.change(screen.getByLabelText(/Nutzername/i), { target: { value: 'Amy-User ' } });
    fireEvent.change(screen.getByLabelText(/Passwort/i), { target: { value: 'geheim' } });
    const submitButton = screen
      .getAllByRole('button', { name: 'Anmelden' })
      .find((button: HTMLElement) => button.getAttribute('type') === 'submit');
    if (!submitButton) {
      throw new Error('Submit-Button nicht gefunden');
    }
    fireEvent.click(submitButton);

    await waitFor(() => {
      const debug = screen.getByTestId('login-debug');
      expect(debug.dataset['token']).toBe('token-abc');
      expect(debug.dataset['profile']).toBe(backendProfileId);
    });

    const debug = screen.getByTestId('login-debug');
    expect(debug.dataset['refresh']).toBe('refresh-xyz');
    expect(debug.dataset['persist']).toBe('true');
  });

  it('zeigt einen Fehler, wenn die Anmeldung keine gültige Profil-ID liefert', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        user: { username: 'amy-user', id: 'amy-user' },
        tokens: { accessToken: 'token-abc', refreshToken: 'refresh-xyz' },
      }),
    });
    global.fetch = fetchMock as any;

    render(
      <ApiConfigProvider>
        <AppStateProvider>
          <LoginScreen onComplete={vi.fn()} />
        </AppStateProvider>
      </ApiConfigProvider>,
    );

    fireEvent.change(screen.getByLabelText(/Nutzername/i), { target: { value: 'Amy-User ' } });
    fireEvent.change(screen.getByLabelText(/Passwort/i), { target: { value: 'geheim' } });
    const submitButton = screen
      .getAllByRole('button', { name: 'Anmelden' })
      .find((button: HTMLElement) => button.getAttribute('type') === 'submit');
    if (!submitButton) {
      throw new Error('Submit-Button nicht gefunden');
    }
    fireEvent.click(submitButton);

    await screen.findByText('Login-Antwort enthält keine gültige Profil-ID.');
  });

  it('fordert einen Reset-Code an und bestätigt das neue Passwort', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: 'Wenn ein Konto existiert, wurde eine E-Mail mit einem Reset-Code gesendet.',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'Passwort wurde aktualisiert.' }),
      });
    global.fetch = fetchMock as any;

    render(
      <ApiConfigProvider>
        <AppStateProvider>
          <LoginScreen onComplete={vi.fn()} />
        </AppStateProvider>
      </ApiConfigProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Passwort vergessen?' }));
    fireEvent.change(screen.getByLabelText(/E-Mail-Adresse/i), { target: { value: 'amy@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset-Code anfordern' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/auth/password-reset/request'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    await waitFor(() => {
      expect((screen.getByLabelText(/Reset-Code/i) as HTMLInputElement).value).toBe('');
    });

    fireEvent.change(screen.getByLabelText(/Reset-Code/i), { target: { value: 'reset-123' } });
    fireEvent.change(screen.getByLabelText(/Neues Passwort/i), { target: { value: 'neues-passwort' } });
    fireEvent.click(screen.getByRole('button', { name: 'Passwort speichern' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/auth/password-reset/confirm'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    await screen.findByText('Passwort wurde aktualisiert. Bitte melde dich neu an.');
  });

  it('fordert eine E-Mail-Bestätigung nach der Registrierung an', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: 'Registrierung erfolgreich. Bitte bestätige deine E-Mail-Adresse.',
      }),
    });
    global.fetch = fetchMock as any;

    const onComplete = vi.fn();

    function DebugPanel() {
      const { apiToken } = useApiConfig();
      return <div data-testid="register-debug" data-token={apiToken} />;
    }

    render(
      <ApiConfigProvider>
        <AppStateProvider>
          <LoginScreen onComplete={onComplete} />
          <DebugPanel />
        </AppStateProvider>
      </ApiConfigProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Registrieren' }));
    fireEvent.change(screen.getByLabelText(/Nutzername/i), { target: { value: 'amy' } });
    fireEvent.change(screen.getByLabelText(/E-Mail-Adresse/i), { target: { value: 'amy@example.com' } });
    fireEvent.change(screen.getByLabelText(/^Passwort$/i), { target: { value: 'geheim' } });

    const submitButton = screen
      .getAllByRole('button', { name: 'Registrieren' })
      .find((button: HTMLElement) => button.getAttribute('type') === 'submit');
    if (!submitButton) {
      throw new Error('Submit-Button nicht gefunden');
    }
    fireEvent.click(submitButton);

    await screen.findByText('Registrierung erfolgreich. Bitte bestätige deine E-Mail-Adresse.');

    const debug = screen.getByTestId('register-debug');
    expect(debug.dataset['token']).toBe('');
  });

  it('führt Demo-Login zur Hero-Ansicht und zur Gebärdenkamera', async () => {
    render(
      <MessageProvider>
        <ApiConfigProvider>
          <AppStateProvider>
            <SymbolStoreProvider>
              <App />
            </SymbolStoreProvider>
          </AppStateProvider>
        </ApiConfigProvider>
      </MessageProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ohne Anmeldung fortfahren (Demo)' }));

    await screen.findByRole('button', { name: '🖐️ Zur Gebärdenkamera' });
    fireEvent.click(screen.getByRole('button', { name: '🖐️ Zur Gebärdenkamera' }));

    await screen.findByText('Zeige eine Gebärde in die Kamera…');
  });
});
