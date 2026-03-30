import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { act, render } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AUTH_KEY } from '../constants/auth';
import { ApiConfigProvider, useApiConfig } from '../hooks/useApiConfig';
import { UserSettings } from './UserSettings';

function AuthHarness({ children }: { children: React.ReactNode }) {
  const { setTokens, setPersistToken } = useApiConfig();

  useEffect(() => {
    setPersistToken(true);
    setTokens({ accessToken: 'token-abc', refreshToken: 'refresh-xyz' });
  }, [setPersistToken, setTokens]);

  return <>{children}</>;
}

describe('UserSettings', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('speichert das Profil erfolgreich', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: 'user-1', displayName: 'Amy' } }),
    });
    global.fetch = fetchMock as any;

    render(
      <ApiConfigProvider>
        <AuthHarness>
          <UserSettings />
        </AuthHarness>
      </ApiConfigProvider>,
    );

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Amy' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Profil speichern' }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/user/profile'),
      expect.objectContaining({ method: 'PUT' }),
    );
    await screen.findByText('Profil gespeichert.');
  });


  it('meldet das Konto ab und leert gespeicherte Token', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as any;

    function TokenProbe() {
      const { apiToken } = useApiConfig();
      return <span data-testid="token-probe">{apiToken || 'leer'}</span>;
    }

    render(
      <ApiConfigProvider>
        <AuthHarness>
          <UserSettings />
          <TokenProbe />
        </AuthHarness>
      </ApiConfigProvider>,
    );

    await waitFor(() => {
      expect(window.localStorage.getItem('webapp:api-config:persisted-token')).toBeTruthy();
    });

    expect(screen.getByTestId('token-probe')).toHaveTextContent('token-abc');

    fireEvent.click(screen.getByRole('button', { name: 'Abmelden' }));

    expect(screen.getByTestId('token-probe')).toHaveTextContent('leer');
    expect(window.localStorage.getItem(AUTH_KEY)).toBe('false');
    expect(window.localStorage.getItem('webapp:api-config:persisted-token')).toBeNull();
    expect(window.localStorage.getItem('webapp:api-config:persisted-key')).toBeNull();
    expect(window.sessionStorage.getItem('webapp:api-config:session')).toBeNull();
    expect(window.sessionStorage.getItem('webapp:api-config:session:key')).toBeNull();
  });

  it('validiert das Sicherheitswort vor dem Konto-Löschen', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as any;

    render(
      <ApiConfigProvider>
        <AuthHarness>
          <UserSettings />
        </AuthHarness>
      </ApiConfigProvider>,
    );

    fireEvent.change(screen.getByLabelText('Nutzername zur Bestätigung'), { target: { value: 'amy' } });
    fireEvent.change(screen.getByLabelText('Passwort zur Bestätigung'), { target: { value: 'topsecret' } });
    fireEvent.change(screen.getByLabelText(/Sicherheitswort eingeben/), { target: { value: 'löschen' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Konto dauerhaft löschen' }));
    });

    await screen.findByText(/Bitte gib zur Bestätigung exakt "KONTO LÖSCHEN" ein\./);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('löscht das Konto nach erneuter Anmeldung und meldet ab', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Konto wurde gelöscht.' }),
    });
    global.fetch = fetchMock as any;

    function TokenProbe() {
      const { apiToken } = useApiConfig();
      return <span data-testid="token-probe-delete">{apiToken || 'leer'}</span>;
    }

    render(
      <ApiConfigProvider>
        <AuthHarness>
          <UserSettings />
          <TokenProbe />
        </AuthHarness>
      </ApiConfigProvider>,
    );

    fireEvent.change(screen.getByLabelText('Nutzername zur Bestätigung'), { target: { value: 'amy' } });
    fireEvent.change(screen.getByLabelText('Passwort zur Bestätigung'), { target: { value: 'topsecret' } });
    fireEvent.change(screen.getByLabelText(/Sicherheitswort eingeben/), { target: { value: 'KONTO LÖSCHEN' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Konto dauerhaft löschen' }));
    });

    await screen.findByText('Konto wurde gelöscht. Du bist jetzt abgemeldet.');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/auth/account'),
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(screen.getByTestId('token-probe-delete')).toHaveTextContent('leer');
  });

  it('zeigt einen Validierungsfehler bei nicht passenden Passwörtern', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as any;

    render(
      <ApiConfigProvider>
        <AuthHarness>
          <UserSettings />
        </AuthHarness>
      </ApiConfigProvider>,
    );

    fireEvent.change(screen.getByLabelText('Aktuelles Passwort'), { target: { value: 'alt-passwort' } });
    fireEvent.change(screen.getByLabelText('Neues Passwort'), { target: { value: 'neu-passwort' } });
    fireEvent.change(screen.getByLabelText('Neues Passwort bestätigen'), { target: { value: 'anders' } });
    fireEvent.click(screen.getByRole('button', { name: 'Passwort ändern' }));

    await screen.findByText('Die neuen Passwörter stimmen nicht überein.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
