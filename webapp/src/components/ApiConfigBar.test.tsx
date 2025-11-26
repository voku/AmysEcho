import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiConfigProvider } from '../hooks/useApiConfig';
import { ApiConfigBar } from './ApiConfigBar';

const renderWithProvider = () =>
  render(
    <ApiConfigProvider>
      <ApiConfigBar />
    </ApiConfigProvider>,
  );

describe('ApiConfigBar authentication helpers', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('logs in and stores the returned token for the session', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tokens: { accessToken: 'jwt-token' }, user: { username: 'amy' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProvider();

    fireEvent.change(screen.getByLabelText('Nutzername'), { target: { value: 'amy' } });
    fireEvent.change(screen.getByLabelText(/^Passwort/), { target: { value: 'sehrgeheim' } });
    fireEvent.click(screen.getByRole('button', { name: /login & token holen/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => {
      const stored = window.localStorage.getItem('webapp:api-config:persisted-token');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(typeof parsed.apiToken).toBe('string');
      expect(parsed.apiToken).not.toBe('jwt-token');
      expect(typeof parsed.iv).toBe('string');
    });
    expect(screen.getByText(/Token wurde gespeichert/i)).toBeInTheDocument();
  });

  it('surfaces backend errors when authentication fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Ungültige Zugangsdaten.' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProvider();

    fireEvent.change(screen.getByLabelText('Nutzername'), { target: { value: 'amy' } });
    fireEvent.change(screen.getByLabelText(/^Passwort/), { target: { value: 'falsch' } });
    fireEvent.click(screen.getByRole('button', { name: /login & token holen/i }));

    await screen.findByText('Ungültige Zugangsdaten.');
  });
});
