import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from './Dashboard';

const mockUseAppState = vi.fn();
const mockUseApiConfig = vi.fn();

vi.mock('../hooks/useAppState', () => ({
  useAppState: () => mockUseAppState(),
}));

vi.mock('../hooks/useApiConfig', () => ({
  useApiConfig: () => mockUseApiConfig(),
}));

describe('Dashboard', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('zeigt lokale Statistiken und letzte Aktivität', async () => {
    mockUseAppState.mockReturnValue({ profileId: 'amy', recentSigns: ['Essen'] });
    mockUseApiConfig.mockReturnValue({ apiBaseUrl: '', apiToken: '' });

    localStorage.setItem(
      'webapp:progress:amy',
      JSON.stringify({ totalGestures: 7, uniqueGestures: 3, sessionsCount: 2 }),
    );

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Analysen')).toBeInTheDocument();
    expect(await screen.findByText('Gebärden erkannt')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Essen')).toBeInTheDocument();
  });

  it('zeigt Server-Einblicke bei erfolgreichem API-Abruf', async () => {
    mockUseAppState.mockReturnValue({ profileId: 'amy', recentSigns: [] });
    mockUseApiConfig.mockReturnValue({ apiBaseUrl: 'http://localhost:5000', apiToken: 'token' });

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            { label: 'Essen', reasons: [] },
            { label: 'Essen', reasons: ['blur'] },
            { label: 'Trinken', reasons: [] },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          profileTrends: [
            {
              profileId: 'amy',
              latestAccuracy: 0.75,
              latestF1Score: 0.72,
              accuracyDelta: 0.1,
              f1Delta: 0.08,
            },
          ],
        }),
      } as Response);

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(await screen.findByText('🔍 Server-Einblicke')).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument();
    expect(screen.getByText('2x')).toBeInTheDocument();
    expect(screen.getByText(/Profil amy: Genauigkeit 75%/)).toBeInTheDocument();
  });
});
