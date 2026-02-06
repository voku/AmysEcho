import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { SignVideoGallery } from './SignVideoGallery';
import { ApiConfigProvider } from '../hooks/useApiConfig';
import { AppStateProvider } from '../hooks/useAppState';
import { MessageProvider } from '../context/MessageContext';

vi.mock('../context/MessageContext', async () => {
  const actual = await vi.importActual('../context/MessageContext');
  return {
    ...actual,
    useMessage: () => ({ showToast: vi.fn() }),
    MessageProvider: ({ children }: { children: ReactElement }) => <>{children}</>,
  };
});

vi.mock('../hooks/useAppState', async () => {
  const actual = await vi.importActual('../hooks/useAppState');
  return {
    ...actual,
    useAppState: () => ({
      profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      profileUuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      displayName: 'Test',
      preferredSignId: 'hilfe',
      preferredSignName: 'HILFE',
      lastRecognizedSign: null,
      recentSigns: [],
      setPreferredSign: vi.fn(),
      recordSign: vi.fn(),
      refreshFromRegistry: vi.fn(),
    }),
  };
});

const renderWithProviders = (ui: ReactElement) => {
  return render(
    <MemoryRouter>
      <AppStateProvider>
        <ApiConfigProvider>
          <MessageProvider>
            {ui}
          </MessageProvider>
        </ApiConfigProvider>
      </AppStateProvider>
    </MemoryRouter>
  );
};

describe('SignVideoGallery', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ videos: [] }),
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the gallery header', async () => {
    renderWithProviders(<SignVideoGallery />);

    expect(await screen.findByText('Gebärdenvideos')).toBeInTheDocument();
  });

  it('shows empty state when no videos are available', async () => {
    renderWithProviders(<SignVideoGallery />);

    expect(
      await screen.findByText(/Noch keine Trainingsvideos aufgenommen/),
    ).toBeInTheDocument();
  });

  it('displays video cards when videos exist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          videos: [
            {
              bundleId: 'bundle-1',
              label: 'Hallo',
              capturedAt: '2026-01-15T10:00:00Z',
              clipUrl: '/api/v1/training-videos/bundle-1/clip',
              stillUrl: '/api/v1/training-videos/bundle-1/still',
              clipDurationMs: 2000,
              clipMimeType: 'video/webm',
            },
            {
              bundleId: 'bundle-2',
              label: 'Hallo',
              capturedAt: '2026-01-16T10:00:00Z',
              clipUrl: '/api/v1/training-videos/bundle-2/clip',
              stillUrl: null,
              clipDurationMs: 1500,
              clipMimeType: 'video/webm',
            },
          ],
        }),
      }),
    );

    renderWithProviders(<SignVideoGallery />);

    // Wait for the label heading to appear
    expect(await screen.findByText('Hallo')).toBeInTheDocument();

    // Two video cards
    const playButtons = screen.getAllByRole('button', {
      name: /Video abspielen: Hallo/,
    });
    expect(playButtons).toHaveLength(2);
  });

  it('shows back link to learning hub', async () => {
    renderWithProviders(<SignVideoGallery />);

    expect(
      await screen.findByText('Zurück zum Lernbereich'),
    ).toBeInTheDocument();
  });
});
