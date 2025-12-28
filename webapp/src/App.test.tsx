import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { act, render } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { ApiConfigProvider, useApiConfig } from './hooks/useApiConfig';
import { AppStateProvider, useAppState } from './hooks/useAppState';
import { useAppStatus, LoginScreen } from './App';

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
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        user: { username: 'amy-user', id: 'user-1' },
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
      .find((button) => button.getAttribute('type') === 'submit');
    if (!submitButton) {
      throw new Error('Submit-Button nicht gefunden');
    }
    fireEvent.click(submitButton);

    await waitFor(() => {
      const debug = screen.getByTestId('login-debug');
      expect(debug.dataset['token']).toBe('token-abc');
      expect(debug.dataset['profile']).toBe('amy-user');
    });

    const debug = screen.getByTestId('login-debug');
    expect(debug.dataset['refresh']).toBe('refresh-xyz');
    expect(debug.dataset['persist']).toBe('true');
  });
});
