import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { LearningHub } from './LearningHub';
import { MemoryRouter } from 'react-router-dom';
import { SymbolStoreProvider } from '../context/SymbolStore';
import { ApiConfigProvider } from '../hooks/useApiConfig';
import { AppStateProvider } from '../hooks/useAppState';
import { MessageProvider } from '../context/MessageContext';

const mockSaveSymbol = vi.fn().mockResolvedValue({
  id: 'test-symbol',
  name: 'Test Symbol',
  category: 'custom',
  imageUrl: null,
});

vi.mock('../context/SymbolStore', async () => {
  const actual = await vi.importActual('../context/SymbolStore');
  return {
    ...actual,
    useSymbolStore: () => ({
      symbols: [],
      refresh: vi.fn(),
      syncError: null,
      loading: false,
      saveSymbol: mockSaveSymbol,
    }),
  };
});

const renderWithProviders = (ui: React.ReactElement) => {
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

describe('LearningHub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('render', () => {
    it('renders the learning hub section', () => {
      renderWithProviders(<LearningHub />);

      expect(screen.getByText('Gesten trainieren')).toBeInTheDocument();
      expect(screen.getByText('Lernen')).toBeInTheDocument();
    });

    it('displays gesture cards', () => {
      renderWithProviders(<LearningHub />);

      expect(screen.getByText('Alle')).toBeInTheDocument();
      expect(screen.getByText('Essen')).toBeInTheDocument();
      expect(screen.getByText('Trinken')).toBeInTheDocument();
    });

    it('shows tips section', () => {
      renderWithProviders(<LearningHub />);

      expect(screen.getByText('💡 Tipps für effektives Training')).toBeInTheDocument();
    });
  });

  describe('modal open/close behavior', () => {
    it('opens modal when "Neues Symbol speichern" is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<LearningHub />);

      await user.click(screen.getByText('Neues Symbol speichern'));

      expect(screen.getByText('Symbol für das Lernen speichern')).toBeInTheDocument();
    });

    it('closes modal when "Abbrechen" is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<LearningHub />);

      await user.click(screen.getByText('Neues Symbol speichern'));
      expect(screen.getByText('Symbol für das Lernen speichern')).toBeInTheDocument();

      await user.click(screen.getByText('Abbrechen'));
      await waitFor(() => {
        expect(screen.queryByText('Symbol für das Lernen speichern')).not.toBeInTheDocument();
      });
    });

    it('closes modal when clicking overlay background', async () => {
      const user = userEvent.setup();
      renderWithProviders(<LearningHub />);

      await user.click(screen.getByText('Neues Symbol speichern'));
      expect(screen.getByText('Symbol für das Lernen speichern')).toBeInTheDocument();

      // The modal-overlay is the element with role="dialog"
      const overlay = screen.getByRole('dialog');
      // Fire click directly on the overlay, not on child elements
      // We need to simulate clicking on the overlay itself
      fireEvent.click(overlay, { target: overlay });

      await waitFor(() => {
        expect(screen.queryByText('Symbol für das Lernen speichern')).not.toBeInTheDocument();
      });
    });

    it('closes modal when Escape key is pressed', async () => {
      const user = userEvent.setup();
      renderWithProviders(<LearningHub />);

      await user.click(screen.getByText('Neues Symbol speichern'));
      expect(screen.getByText('Symbol für das Lernen speichern')).toBeInTheDocument();

      await user.keyboard('{Escape}');
      await waitFor(() => {
        expect(screen.queryByText('Symbol für das Lernen speichern')).not.toBeInTheDocument();
      });
    });
  });

  describe('form validation', () => {
    it('disables save button when name is empty', async () => {
      const user = userEvent.setup();
      renderWithProviders(<LearningHub />);

      await user.click(screen.getByText('Neues Symbol speichern'));

      const saveButton = screen.getByRole('button', { name: 'Speichern' });
      expect(saveButton).toBeDisabled();
    });

    it('enables save button when name is filled', async () => {
      const user = userEvent.setup();
      renderWithProviders(<LearningHub />);

      await user.click(screen.getByText('Neues Symbol speichern'));
      
      const nameInput = screen.getByLabelText('Bezeichnung');
      await user.type(nameInput, 'Meine Geste');

      const saveButton = screen.getByRole('button', { name: 'Speichern' });
      expect(saveButton).not.toBeDisabled();
    });
  });

  describe('modal accessibility', () => {
    it('has correct role and aria attributes', async () => {
      const user = userEvent.setup();
      renderWithProviders(<LearningHub />);

      await user.click(screen.getByText('Neues Symbol speichern'));

      const modal = screen.getByRole('dialog');
      expect(modal).toHaveAttribute('aria-modal', 'true');
      expect(modal).toHaveAttribute('aria-labelledby', 'symbol-modal-title');
    });

    it('form labels are associated with inputs', async () => {
      const user = userEvent.setup();
      renderWithProviders(<LearningHub />);

      await user.click(screen.getByText('Neues Symbol speichern'));

      expect(screen.getByLabelText('Symbol-ID')).toBeInTheDocument();
      expect(screen.getByLabelText('Bezeichnung')).toBeInTheDocument();
      expect(screen.getByLabelText('Kategorie')).toBeInTheDocument();
      expect(screen.getByLabelText('Bild-URL')).toBeInTheDocument();
      expect(screen.getByLabelText('Bild hochladen')).toBeInTheDocument();
    });
  });

  describe('symbol save operation', () => {
    it('saves symbol and closes modal on success', async () => {
      const user = userEvent.setup();
      renderWithProviders(<LearningHub />);

      await user.click(screen.getByText('Neues Symbol speichern'));

      const nameInput = screen.getByLabelText('Bezeichnung');
      await user.type(nameInput, 'Test Geste');

      const saveButton = screen.getByRole('button', { name: 'Speichern' });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockSaveSymbol).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.queryByText('Symbol für das Lernen speichern')).not.toBeInTheDocument();
      });
    });

    it('shows saving state while submitting', async () => {
      mockSaveSymbol.mockImplementationOnce(() => new Promise((resolve) => setTimeout(resolve, 100)));
      
      const user = userEvent.setup();
      renderWithProviders(<LearningHub />);

      await user.click(screen.getByText('Neues Symbol speichern'));

      const nameInput = screen.getByLabelText('Bezeichnung');
      await user.type(nameInput, 'Test Geste');

      const saveButton = screen.getByRole('button', { name: 'Speichern' });
      await user.click(saveButton);

      expect(screen.getByText('Speichert…')).toBeInTheDocument();
    });
  });
});
