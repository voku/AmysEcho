import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
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

const mockShowToast = vi.fn();

const mockSymbols = [
  { id: 'alle', name: 'Alle', category: 'basic', emoji: '👐', sampleCount: 0, samplesNeeded: 5, isReady: false, status: 'registered' },
  { id: 'essen', name: 'Essen', category: 'food', emoji: '🍽️', sampleCount: 2, samplesNeeded: 3, isReady: false, status: 'training' },
  { id: 'trinken', name: 'Trinken', category: 'food', emoji: '🥤', sampleCount: 5, samplesNeeded: 0, isReady: true, status: 'ready' },
];

vi.mock('../context/SymbolStore', async () => {
  const actual = await vi.importActual('../context/SymbolStore');
  return {
    ...actual,
    useSymbolStore: () => ({
      symbols: mockSymbols,
      refresh: vi.fn(),
      syncError: null,
      loading: false,
      saveSymbol: mockSaveSymbol,
    }),
  };
});

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

describe('LearningHub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ symbols: mockSymbols }),
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  describe('render', () => {
    it('renders the learning hub section', () => {
      renderWithProviders(<LearningHub />);

      expect(screen.getByText('Deine Gebärden')).toBeInTheDocument();
      expect(screen.getByText('Lern-Zentrum')).toBeInTheDocument();
    });

    it('displays gesture cards', () => {
      renderWithProviders(<LearningHub />);

      expect(screen.getAllByText('Alle').length).toBeGreaterThan(0);
      expect(screen.getByText('Essen')).toBeInTheDocument();
      expect(screen.getByText('Trinken')).toBeInTheDocument();
    });

    it('shows tips section', () => {
      renderWithProviders(<LearningHub />);

      expect(screen.getByText('💡 Tipps für effektives Training')).toBeInTheDocument();
    });
  });

  describe('modal open/close behavior', () => {
    it('opens modal when "➕ Neue Gebärde" is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<LearningHub />);

      await user.click(screen.getByText('➕ Neue Gebärde'));

      expect(screen.getByText('Neue Gebärde hinzufügen')).toBeInTheDocument();
    });

    it('closes modal when "Abbrechen" is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<LearningHub />);

      await user.click(screen.getByText('➕ Neue Gebärde'));
      expect(screen.getByText('Neue Gebärde hinzufügen')).toBeInTheDocument();

      await user.click(screen.getByText('Abbrechen'));
      await waitFor(() => {
        expect(screen.queryByText('Neue Gebärde hinzufügen')).not.toBeInTheDocument();
      });
    });

    it('closes modal when clicking overlay background', async () => {
      const user = userEvent.setup();
      renderWithProviders(<LearningHub />);

      await user.click(screen.getByText('➕ Neue Gebärde'));
      expect(screen.getByText('Neue Gebärde hinzufügen')).toBeInTheDocument();

      const overlay = screen.getByRole('dialog');
      fireEvent.click(overlay, { target: overlay });

      await waitFor(() => {
        expect(screen.queryByText('Neue Gebärde hinzufügen')).not.toBeInTheDocument();
      });
    });

    it('closes modal when Escape key is pressed', async () => {
      const user = userEvent.setup();
      renderWithProviders(<LearningHub />);

      await user.click(screen.getByText('➕ Neue Gebärde'));
      expect(screen.getByText('Neue Gebärde hinzufügen')).toBeInTheDocument();

      await user.keyboard('{Escape}');
      await waitFor(() => {
        expect(screen.queryByText('Neue Gebärde hinzufügen')).not.toBeInTheDocument();
      });
    });
  });

  describe('form validation', () => {
    it('disables save button when name is empty', async () => {
      const user = userEvent.setup();
      renderWithProviders(<LearningHub />);

      await user.click(screen.getByText('➕ Neue Gebärde'));

      const saveButton = screen.getByRole('button', { name: 'Speichern' });
      expect(saveButton).toBeDisabled();
    });

    it('enables save button when name is filled', async () => {
      const user = userEvent.setup();
      renderWithProviders(<LearningHub />);

      await user.click(screen.getByText('➕ Neue Gebärde'));

      const nameInput = screen.getByLabelText('Bezeichnung');
      await user.type(nameInput, 'Meine Gebärde');

      const saveButton = screen.getByRole('button', { name: 'Speichern' });
      expect(saveButton).not.toBeDisabled();
    });
  });

  describe('modal accessibility', () => {
    it('has correct role and aria attributes', async () => {
      const user = userEvent.setup();
      renderWithProviders(<LearningHub />);

      await user.click(screen.getByText('➕ Neue Gebärde'));

      const modal = screen.getByRole('dialog');
      expect(modal).toHaveAttribute('aria-modal', 'true');
      expect(modal).toHaveAttribute('aria-labelledby', 'symbol-modal-title');
    });

    it('form labels are associated with inputs', async () => {
      const user = userEvent.setup();
      renderWithProviders(<LearningHub />);

      await user.click(screen.getByText('➕ Neue Gebärde'));

      expect(screen.getByLabelText('Bezeichnung')).toBeInTheDocument();
      expect(screen.getByLabelText('Kategorie')).toBeInTheDocument();
      expect(screen.getByLabelText('Vorschaubild')).toBeInTheDocument();
    });
  });

  describe('symbol save operation', () => {
    it('saves symbol and closes modal on success', async () => {
      const user = userEvent.setup();
      renderWithProviders(<LearningHub />);

      await user.click(screen.getByText('➕ Neue Gebärde'));

      const nameInput = screen.getByLabelText('Bezeichnung');
      await user.type(nameInput, 'Test Gebärde');

      const saveButton = screen.getByRole('button', { name: 'Speichern' });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockSaveSymbol).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.queryByText('Neue Gebärde hinzufügen')).not.toBeInTheDocument();
      });
    });

    it('shows saving state while submitting', async () => {
      mockSaveSymbol.mockImplementationOnce(() => new Promise((resolve) => setTimeout(resolve, 100)));

      const user = userEvent.setup();
      renderWithProviders(<LearningHub />);

      await user.click(screen.getByText('➕ Neue Gebärde'));

      const nameInput = screen.getByLabelText('Bezeichnung');
      await user.type(nameInput, 'Test Gebärde');

      const saveButton = screen.getByRole('button', { name: 'Speichern' });
      await user.click(saveButton);

      expect(screen.getByText('Wird gespeichert…')).toBeInTheDocument();
    });

    it('allows saving without providing an image', async () => {
      const user = userEvent.setup();
      renderWithProviders(<LearningHub />);

      await user.click(screen.getByText('➕ Neue Gebärde'));

      const nameInput = screen.getByLabelText('Bezeichnung');
      await user.type(nameInput, 'Ohne Bild');

      const saveButton = screen.getByRole('button', { name: 'Speichern' });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockSaveSymbol).toHaveBeenCalledWith(
          expect.objectContaining({ imageUrl: null, imageDataUrl: null, name: 'Ohne Bild' }),
        );
      });
    });
  });

  describe('image validation', () => {
    beforeEach(() => {
      vi.stubGlobal('FileReader', class {
        public result: string | ArrayBuffer | null = null;
        public onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;
        readAsDataURL() {
          this.result = 'data:image/png;base64,TEST';
          if (this.onload) {
            const event = new ProgressEvent('load') as ProgressEvent<FileReader>;
            this.onload.call(this as unknown as FileReader, event);
          }
        }
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      mockShowToast.mockReset();
    });

    it('rejects files larger than 8MB', async () => {
      const user = userEvent.setup();
      renderWithProviders(<LearningHub />);

      await user.click(screen.getByText('➕ Neue Gebärde'));

      const fileInput = screen.getByLabelText('Vorschaubild');
      const largeFile = new File([new Uint8Array(9 * 1024 * 1024)], 'large.png', {
        type: 'image/png',
      });

      await user.upload(fileInput, largeFile);

      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({ tone: 'error', message: expect.stringContaining('8 MB') }),
      );
      expect(screen.queryByAltText('Vorschau')).not.toBeInTheDocument();
    });

    it('accepts valid image uploads and shows a preview', async () => {
      const user = userEvent.setup();
      renderWithProviders(<LearningHub />);

      await user.click(screen.getByText('➕ Neue Gebärde'));

      const fileInput = screen.getByLabelText('Vorschaubild');
      const validFile = new File([new Uint8Array(10)], 'small.png', { type: 'image/png' });

      await user.upload(fileInput, validFile);

      expect(mockShowToast).not.toHaveBeenCalled();
      expect(await screen.findByAltText('Vorschau')).toBeInTheDocument();
    });
  });
});