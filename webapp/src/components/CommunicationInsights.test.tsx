import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunicationInsights } from './CommunicationInsights';

const mockAppState = {
  profileId: 'amy',
  recentSigns: [] as string[],
};

vi.mock('../hooks/useAppState', () => ({
  useAppState: () => mockAppState,
}));

describe('CommunicationInsights', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('zeigt Empty-State ohne gespeicherte Fortschrittsdaten', async () => {
    render(<CommunicationInsights />);

    expect(await screen.findByText('Noch keine Daten vorhanden.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zur Erkennung' })).toHaveAttribute('href', '/');
  });

  it('zeigt Erkenntnisse mit Top-Gebärden wenn Fortschrittsdaten vorliegen', async () => {
    localStorage.setItem(
      'webapp:progress:amy',
      JSON.stringify({
        totalGestures: 12,
        gestureStats: [
          { label: 'Essen', count: 6 },
          { label: 'Trinken', count: 4 },
        ],
      }),
    );

    render(<CommunicationInsights />);

    expect(await screen.findByText('📊 Wöchentliche Übersicht')).toBeInTheDocument();
    expect(screen.getByText('🏆 Top Gebärden')).toBeInTheDocument();
    expect(screen.getAllByText('Essen').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Trinken').length).toBeGreaterThan(0);
  });
});
