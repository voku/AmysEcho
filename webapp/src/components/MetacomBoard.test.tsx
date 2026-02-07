import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { useEffect } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MetacomBoard } from './MetacomBoard';
import { SymbolStoreProvider } from '../context/SymbolStore';
import { ApiConfigProvider, useApiConfig } from '../hooks/useApiConfig';
import { AppStateProvider } from '../hooks/useAppState';
import { MessageProvider } from '../context/MessageContext';
import { clearMetacomMemory } from '../services/metacomMemoryService';

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location-display">{`${location.pathname}${location.search}`}</div>;
}

function ApiTokenSeeder() {
  const { setApiToken } = useApiConfig();
  useEffect(() => {
    setApiToken('token-123');
  }, [setApiToken]);
  return null;
}

const renderWithProviders = (ui: ReactElement, options?: { withToken?: boolean }) => {
  return render(
    <MemoryRouter>
      <AppStateProvider>
        <ApiConfigProvider>
          <MessageProvider>
            <SymbolStoreProvider>
              {options?.withToken ? <ApiTokenSeeder /> : null}
              {ui}
              <LocationDisplay />
            </SymbolStoreProvider>
          </MessageProvider>
        </ApiConfigProvider>
      </AppStateProvider>
    </MemoryRouter>
  );
};

describe('MetacomBoard', () => {
  beforeEach(() => {
    clearMetacomMemory(null);
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/api/v1/metacom/sentence-improve')) {
        return Promise.resolve(
          new Response(JSON.stringify({ improvedSentence: 'Ich esse Brot.' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ symbols: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the start board with core symbols', async () => {
    renderWithProviders(<MetacomBoard />);

    expect(await screen.findByText('Starttafel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ich' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Essen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Satzbau-Hilfe aus' })).toBeInTheDocument();
  });

  it('navigates to a category board and back', async () => {
    renderWithProviders(<MetacomBoard />);

    const essenButton = await screen.findByRole('button', { name: 'Essen' });
    fireEvent.click(essenButton);

    expect(await screen.findByRole('heading', { level: 2, name: 'Essen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apfel' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Starttafel' })).toBeInTheDocument();
  });

  it('updates the last selection label when a symbol is pressed', async () => {
    renderWithProviders(<MetacomBoard />);

    const jaButton = await screen.findByRole('button', { name: 'Ja' });
    fireEvent.click(jaButton);

    const status = await screen.findByTestId('metacom-status');
    expect(within(status).getByText('Letzte Auswahl')).toBeInTheDocument();
    expect(within(status).getByText('Ja')).toBeInTheDocument();
  });

  it('offers training for the last selected symbol', async () => {
    renderWithProviders(<MetacomBoard />);

    const jaButton = await screen.findByRole('button', { name: 'Ja' });
    fireEvent.click(jaButton);

    const useGestureButton = await screen.findByRole('button', { name: 'Als Gebärde nutzen' });
    fireEvent.click(useGestureButton);

    expect(screen.getByTestId('location-display').textContent).toContain('/training');
    expect(screen.getByTestId('location-display').textContent).toContain('gesture=Ja');
    expect(screen.getByTestId('location-display').textContent).toContain('symbolId=metacom_ja');
  });

  it('allows saving a symbol to the memory shelf', async () => {
    renderWithProviders(<MetacomBoard />);

    const jaButton = await screen.findByRole('button', { name: 'Ja' });
    fireEvent.click(jaButton);

    const memoryButton = await screen.findByRole('button', { name: 'Merken' });
    fireEvent.click(memoryButton);

    const memoryShelf = await screen.findByRole('region', { name: 'Merkliste' });
    expect(within(memoryShelf).getByText('Merkliste')).toBeInTheDocument();
    expect(within(memoryShelf).getByRole('button', { name: 'Ja' })).toBeInTheDocument();
  });

  it('adds tapped symbols to the sentence composer', async () => {
    renderWithProviders(<MetacomBoard />);

    const jaButton = await screen.findByRole('button', { name: 'Ja' });
    fireEvent.click(jaButton);

    // The sentence composer region should now contain the symbol chip
    const composer = screen.getByRole('region', { name: 'Satzkomponist' });
    expect(composer).toBeInTheDocument();
    // Query within the composer to avoid matching the grid button
    const items = composer.querySelectorAll('.sentence-strip-item');
    expect(items.length).toBe(1);
    expect(items[0]?.textContent).toContain('Ja');
  });

  it('adds category navigation with speech to the sentence composer', async () => {
    renderWithProviders(<MetacomBoard />);

    const ichButton = await screen.findByRole('button', { name: 'Ich' });
    fireEvent.click(ichButton);

    const essenButton = screen.getByRole('button', { name: 'Essen' });
    fireEvent.click(essenButton);

    const brotButton = await screen.findByRole('button', { name: 'Brot' });
    fireEvent.click(brotButton);

    const composer = screen.getByRole('region', { name: 'Satzkomponist' });
    const items = Array.from(composer.querySelectorAll('.sentence-strip-item'));
    expect(items.length).toBe(3);
    expect(items[0]?.textContent).toContain('Ich');
    expect(items[1]?.textContent).toContain('Essen');
    expect(items[2]?.textContent).toContain('Brot');
  });

  it('treats pizza modifiers as a subset of pizza', async () => {
    renderWithProviders(<MetacomBoard />);

    const ichButton = await screen.findByRole('button', { name: 'Ich' });
    fireEvent.click(ichButton);

    const essenButton = screen.getByRole('button', { name: 'Essen' });
    fireEvent.click(essenButton);

    const pizzaButton = await screen.findByRole('button', { name: 'Pizza' });
    fireEvent.click(pizzaButton);

    const ohneKaeseButton = await screen.findByRole('button', { name: 'Ohne Käse' });
    fireEvent.click(ohneKaeseButton);

    const composer = screen.getByRole('region', { name: 'Satzkomponist' });
    const items = Array.from(composer.querySelectorAll('.sentence-strip-item'));
    expect(items.length).toBe(4);
    expect(items[0]?.textContent).toContain('Ich');
    expect(items[1]?.textContent).toContain('Essen');
    expect(items[2]?.textContent).toContain('Pizza');
    expect(items[3]?.textContent).toContain('Ohne Käse');
  });

  it('renders the sentence composer with speak button', async () => {
    renderWithProviders(<MetacomBoard />);

    // Sentence composer should always be visible
    expect(screen.getByRole('region', { name: 'Satzkomponist' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Satz vorlesen' })).toBeInTheDocument();
  });

  it('shows next word recommendations after composing a word', async () => {
    renderWithProviders(<MetacomBoard />);

    const ichButton = await screen.findByRole('button', { name: 'Ich' });
    fireEvent.click(ichButton);

    const recommendations = await screen.findByRole('region', { name: 'Nächste Wörter' });
    expect(within(recommendations).getByText(/Nächste Wörter/)).toBeInTheDocument();
  });

  it('requests a sentence improvement and shows a suggestion', async () => {
    renderWithProviders(<MetacomBoard />, { withToken: true });

    const ichButton = await screen.findByRole('button', { name: 'Ich' });
    fireEvent.click(ichButton);

    const essenButton = screen.getByRole('button', { name: 'Essen' });
    fireEvent.click(essenButton);

    const brotButton = await screen.findByRole('button', { name: 'Brot' });
    fireEvent.click(brotButton);

    const improveButton = screen.getByRole('button', { name: 'Satz verbessern' });
    fireEvent.click(improveButton);

    expect(await screen.findByText('Ich esse Brot.')).toBeInTheDocument();
    expect(screen.getByText('Vorschlag:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Vorschlag sprechen/ })).toBeInTheDocument();
  });
});
