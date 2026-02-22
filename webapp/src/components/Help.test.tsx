import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Help } from './Help';

const mockSymbolStoreState = {
  symbols: [
    { id: 'global-essen', name: 'Essen', category: 'food' },
    { id: 'profile-essen', name: ' essen ', category: 'food', profileId: 'amy' },
    { id: 'profile-essen-duplicate', name: 'ESSEN', category: 'food', profileId: 'amy' },
    { id: 'trinken', name: 'Trinken', category: 'food' },
  ],
  loading: false,
  syncError: null,
};

vi.mock('../context/SymbolStore', async () => {
  const actual = await vi.importActual('../context/SymbolStore');
  return {
    ...actual,
    useSymbolStore: () => mockSymbolStoreState,
  };
});

describe('Help', () => {
  it('deduplicates gesture labels across profile variants', () => {
    render(<Help />);

    expect(screen.getByText('Amy\'s Echo erkennt aktuell diese trainierten Gebärden:')).toBeInTheDocument();
    expect(screen.getAllByText(/essen/i)).toHaveLength(1);
    expect(screen.getByText('Trinken')).toBeInTheDocument();
  });
});
