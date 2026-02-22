import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SignLanguageHistory } from './SignLanguageHistory';

const mockUseAppState = vi.fn();
const resolveGestureSymbolMock = vi.fn();

vi.mock('../hooks/useAppState', () => ({
  useAppState: () => mockUseAppState(),
}));

vi.mock('../services/metacomMappingService', () => ({
  resolveGestureSymbol: (label: string) => resolveGestureSymbolMock(label),
}));

describe('SignLanguageHistory', () => {
  it('zeigt Hinweis wenn noch keine Gebärden erkannt wurden', () => {
    mockUseAppState.mockReturnValue({ recentSigns: [], lastRecognizedSign: null });
    resolveGestureSymbolMock.mockReturnValue(null);

    render(<SignLanguageHistory />);

    expect(screen.getByText(/Noch keine Gebärden erkannt/)).toBeInTheDocument();
  });

  it('zeigt letzte Gebärde und Verlauf mit Metacom-Auflösung', () => {
    mockUseAppState.mockReturnValue({ recentSigns: ['essen'], lastRecognizedSign: 'essen' });
    resolveGestureSymbolMock.mockReturnValue({ emoji: '🍽️', label: 'Essen' });

    render(<SignLanguageHistory />);

    expect(screen.getByText('Letzte Gebärde:')).toBeInTheDocument();
    expect(screen.getAllByText('🍽️ Essen')).toHaveLength(2);
    expect(screen.getByText('Zuletzt')).toBeInTheDocument();
  });
});
