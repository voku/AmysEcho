import { fireEvent, screen } from '@testing-library/dom';
import { act, render } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
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
      expect.stringContaining('/api/user/profile'),
      expect.objectContaining({ method: 'PUT' }),
    );
    await screen.findByText('Profil gespeichert.');
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
