import { screen } from '@testing-library/dom';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { LearningHub } from './LearningHub';
import { MemoryRouter } from 'react-router-dom';
import { SymbolStoreProvider } from '../context/SymbolStore';
import { ApiConfigProvider } from '../hooks/useApiConfig';
import { AppStateProvider } from '../hooks/useAppState';
import { MessageProvider } from '../context/MessageContext';

const mockShowToast = vi.fn();

vi.mock('../context/MessageContext', async () => {
  const actual = await vi.importActual('../context/MessageContext');
  return {
    ...actual,
    useMessage: () => ({ showToast: mockShowToast }),
    MessageProvider: ({ children }: { children: ReactElement }) => <>{children}</>,
  };
});

const renderWithProviders = (ui: ReactElement) => {
  return render(
    <MemoryRouter>
      <AppStateProvider>
        <ApiConfigProvider>
          <MessageProvider>
            <SymbolStoreProvider>
              {ui}
            </SymbolStoreProvider>
          </MessageProvider>
        </ApiConfigProvider>
      </AppStateProvider>
    </MemoryRouter>
  );
};

describe('LearningHub Fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Simulate empty response from API
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ symbols: [] }),
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders BASELINE_GESTURES when symbols list is empty', async () => {
    renderWithProviders(<LearningHub />);

    // Check for some baseline gestures that should be present in the grid headings
    expect(await screen.findByRole('heading', { level: 3, name: 'Alle' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 3, name: 'Blau' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 3, name: 'Essen' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 3, name: 'Trinken' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 3, name: 'Spielen' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 3, name: 'Schwester' })).toBeInTheDocument();

    // Verify we have 12 cards (the baseline set)
    const cards = screen.getAllByRole('heading', { level: 3 });
    // Filter cards by name to ensure they are the baseline ones
    const baselineNames = [
      'Alle', 'Blau', 'Essen', 'Fertig', 'Gelb', 'Grün', 
      'Nochmal', 'Rot', 'Satt', 'Schwester', 'Spielen', 'Trinken'
    ];
    const filteredCards = cards.filter(card => baselineNames.includes(card.textContent || ''));
    expect(filteredCards.length).toBe(12);
  });

  it('uses enriched metadata from BASELINE_GESTURES', async () => {
    renderWithProviders(<LearningHub />);

    // 'Alle' heading in the card
    const alleHeading = await screen.findByRole('heading', { level: 3, name: 'Alle' });
    const alleCard = alleHeading.closest('.readiness-card');
    
    // Check for emoji 👥 (from our updated baseline)
    expect(alleCard).toHaveTextContent('👥');
    
    // Check for category tag 'person'
    expect(alleCard?.querySelector('.category-tag')).toHaveTextContent('person');
  });

  it('renders API symbols instead of fallback when they are available', async () => {
    const customSymbols = [
      { id: 'custom-1', name: 'Custom Symbol', category: 'custom', emoji: '🌟', sampleCount: 0, samplesNeeded: 5, isReady: false, status: 'registered' as const }
    ];
    
    // Simulate API response with one symbol
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ symbols: customSymbols }),
    }));

    renderWithProviders(<LearningHub />);

    // 'Custom Symbol' should be present in card heading
    expect(await screen.findByRole('heading', { level: 3, name: 'Custom Symbol' })).toBeInTheDocument();

    // Baseline gestures like 'Alle' should NOT be present in card headings if API returned something
    expect(screen.queryByRole('heading', { level: 3, name: 'Alle' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Essen' })).not.toBeInTheDocument();
  });
});
