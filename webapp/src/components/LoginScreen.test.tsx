import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginScreen } from './LoginScreen';

const setTokensMock = vi.fn();
const setPersistTokenMock = vi.fn();
const refreshFromRegistryMock = vi.fn();
const mocks = vi.hoisted(() => ({ replaceWithBackendProfile: vi.fn(), fetch: vi.fn() }));

vi.mock('../hooks/useApiConfig', () => ({
  useApiConfig: () => ({
    apiBaseUrl: 'http://localhost:5000',
    setTokens: setTokensMock,
    setPersistToken: setPersistTokenMock,
  }),
}));

vi.mock('../hooks/useAppState', () => ({
  useAppState: () => ({ refreshFromRegistry: refreshFromRegistryMock }),
}));

vi.mock('../services/profileRegistry', () => ({
  PROFILE_ID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  replaceWithBackendProfile: mocks.replaceWithBackendProfile,
}));

describe('LoginScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('zeigt Validierungsfehler bei leerem Login und unterstützt Demo-Weiter', async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<LoginScreen onComplete={onComplete} />);

    await user.click(screen.getAllByRole('button', { name: 'Anmelden' })[1]!);
    expect(screen.getByText('Bitte fülle Nutzername und Passwort aus.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Ohne Anmeldung fortfahren/ }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('führt erfolgreichen Login aus und setzt Token/Profile', async () => {
    const onComplete = vi.fn();
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tokens: { accessToken: 'access-1', refreshToken: 'refresh-1' },
        user: { id: '11111111-1111-4111-8111-111111111111' },
      }),
    });
    mocks.replaceWithBackendProfile.mockResolvedValue(undefined);
    refreshFromRegistryMock.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<LoginScreen onComplete={onComplete} />);

    await user.type(screen.getByLabelText('Nutzername'), 'amy');
    await user.type(screen.getByLabelText('Passwort'), 'secret123');
    await user.click(screen.getAllByRole('button', { name: 'Anmelden' })[1]!);

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalled();
      expect(mocks.replaceWithBackendProfile).toHaveBeenCalledWith({
        displayName: 'amy',
        profileId: '11111111-1111-4111-8111-111111111111',
      });
      expect(setPersistTokenMock).toHaveBeenCalledWith(true);
      expect(setTokensMock).toHaveBeenCalledWith({ accessToken: 'access-1', refreshToken: 'refresh-1' });
      expect(refreshFromRegistryMock).toHaveBeenCalled();
    });
  });

  it('wechselt in den Reset-Flow und fordert eine E-Mail an', async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ message: 'Reset gesendet' }) });
    const user = userEvent.setup();
    render(<LoginScreen onComplete={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Passwort vergessen?' }));
    expect(await screen.findByText('Passwort zurücksetzen')).toBeInTheDocument();

    await user.type(screen.getByLabelText('E-Mail-Adresse'), 'amy@example.org');
    await user.click(screen.getByRole('button', { name: 'Reset-Code anfordern' }));

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/auth/password-reset/request'),
        expect.objectContaining({ method: 'POST' }),
      );
      expect(screen.getByText('Reset gesendet')).toBeInTheDocument();
    });
  });
});
