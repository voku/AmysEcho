import { render, screen, fireEvent } from '@testing-library/react';
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

/** Mock fetch that returns different responses based on URL */
function mockFetchBoth(
  recordedVideos: unknown[] = [],
  referenceVideos: unknown[] = [],
) {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes('/dgs-videos')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ videos: referenceVideos }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({ videos: recordedVideos }),
    });
  });
}

describe('SignVideoGallery', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetchBoth());
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the gallery header', async () => {
    renderWithProviders(<SignVideoGallery />);

    expect(await screen.findByText('Gebärdenvideos')).toBeInTheDocument();
  });

  it('renders source tabs', async () => {
    renderWithProviders(<SignVideoGallery />);

    expect(await screen.findByRole('tab', { name: /Alle/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Referenzvideos/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Eigene Aufnahmen/ })).toBeInTheDocument();
  });

  it('displays reference video cards from DGS manifest', async () => {
    vi.stubGlobal('fetch', mockFetchBoth([], [
      {
        label: 'alle',
        filename: 'alle.mp4',
        clipUrl: '/api/v1/dgs-videos/alle.mp4',
      },
      {
        label: 'alle',
        filename: 'alle_main_alle.mp4',
        clipUrl: '/api/v1/dgs-videos/alle_main_alle.mp4',
      },
    ]));

    renderWithProviders(<SignVideoGallery />);

    expect(await screen.findByText('alle')).toBeInTheDocument();
    const playButtons = screen.getAllByRole('button', {
      name: /Video abspielen: alle/,
    });
    expect(playButtons).toHaveLength(2);
  });

  it('displays recorded video cards', async () => {
    vi.stubGlobal('fetch', mockFetchBoth([
      {
        bundleId: 'bundle-1',
        label: 'Hallo',
        capturedAt: '2026-01-15T10:00:00Z',
        clipUrl: '/api/v1/training-videos/bundle-1/clip',
        stillUrl: null,
        clipDurationMs: 2000,
        clipMimeType: 'video/webm',
      },
    ]));

    renderWithProviders(<SignVideoGallery />);

    expect(await screen.findByText('Hallo')).toBeInTheDocument();
  });

  it('filters by tab to only reference videos', async () => {
    vi.stubGlobal('fetch', mockFetchBoth(
      [{ bundleId: 'b1', label: 'Hallo', capturedAt: null, clipUrl: '/x', stillUrl: null, clipDurationMs: null, clipMimeType: null }],
      [{ label: 'alle', filename: 'alle.mp4', clipUrl: '/api/v1/dgs-videos/alle.mp4' }],
    ));

    renderWithProviders(<SignVideoGallery />);

    // Wait for load to finish
    expect(await screen.findByText('alle')).toBeInTheDocument();

    // Switch to reference tab
    fireEvent.click(screen.getByRole('tab', { name: /Referenzvideos/ }));

    // Should only show reference video, not "Hallo"
    expect(screen.queryByText('Hallo')).not.toBeInTheDocument();
    expect(screen.getByText('alle')).toBeInTheDocument();
  });

  it('shows back link to learning hub', async () => {
    renderWithProviders(<SignVideoGallery />);

    expect(
      await screen.findByText('Zurück zum Lernbereich'),
    ).toBeInTheDocument();
  });
});
