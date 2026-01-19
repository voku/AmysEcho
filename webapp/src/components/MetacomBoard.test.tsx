import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MetacomBoard } from './MetacomBoard';
import { SymbolStoreProvider } from '../context/SymbolStore';
import { ApiConfigProvider } from '../hooks/useApiConfig';
import { AppStateProvider } from '../hooks/useAppState';
import { MessageProvider } from '../context/MessageContext';

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location-display">{`${location.pathname}${location.search}`}</div>;
}

const renderWithProviders = (ui: ReactElement) => {
  return render(
    <MemoryRouter>
      <AppStateProvider>
        <ApiConfigProvider>
          <MessageProvider>
            <SymbolStoreProvider>
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ symbols: [] }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the start board with core symbols', async () => {
    renderWithProviders(<MetacomBoard />);

    expect(await screen.findByText('Starttafel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ich' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Essen' })).toBeInTheDocument();
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

    expect(await screen.findByText('Letzte Auswahl')).toBeInTheDocument();
    expect(await screen.findByText('Ja')).toBeInTheDocument();
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
});
