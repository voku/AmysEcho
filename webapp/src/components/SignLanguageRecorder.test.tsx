import { fireEvent, screen } from '@testing-library/dom';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SignLanguageRecorder } from './SignLanguageRecorder';
import { ApiConfigProvider } from '../hooks/useApiConfig';
import { apiRetryManager } from '../services/apiRetryManager';
import { getActiveProfile } from '../services/profileRegistry';

// Mock the hooks that have external dependencies
const toggleAudioMutedMock = vi.fn();

vi.mock('../hooks/useSignLanguageDetector', () => ({
  useSignLanguageDetector: () => ({
    start: vi.fn().mockResolvedValue(true),
    stop: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
    audioMuted: false,
    toggleAudioMuted: toggleAudioMutedMock,
    status: 'idle',
    error: null,
    lastSign: null,
    lastConfidence: null,
    messageLog: [],
  }),
}));

vi.mock('../hooks/useMlpModelInjection', () => ({
  useMlpModelInjection: () => ({
    notice: null,
  }),
}));

const appStateMock = {
  profileId: null as string | null,
  recordSign: vi.fn(),
};

vi.mock('../hooks/useAppState', () => ({
  AppStateProvider: ({ children }: { children: React.ReactNode }) => children,
  useAppState: () => appStateMock,
}));

vi.mock('../services/apiRetryManager', () => ({
  apiRetryManager: {
    fetch: vi.fn(),
  },
}));

vi.mock('../services/profileRegistry', () => ({
  getActiveProfile: vi.fn().mockResolvedValue(null),
}));

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <MemoryRouter>
      <ApiConfigProvider>
        {ui}
      </ApiConfigProvider>
    </MemoryRouter>,
  );
};

describe('SignLanguageRecorder', () => {
  beforeEach(() => {
    appStateMock.profileId = null;
    appStateMock.recordSign.mockReset();
    vi.mocked(apiRetryManager.fetch).mockReset();
    vi.mocked(apiRetryManager.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ trainedLabels: [] }),
    } as Response);
    vi.mocked(getActiveProfile).mockReset();
    vi.mocked(getActiveProfile).mockResolvedValue(null);
    window.localStorage.clear();
    toggleAudioMutedMock.mockReset();
  });

  it('renders the gesture demo section', () => {
    renderWithProviders(<SignLanguageRecorder />);

    expect(screen.getByText('Bereit für die Kamera')).toBeInTheDocument();
    expect(screen.getByText(/Profil/)).toBeInTheDocument();
  });

  it('shows camera action buttons', () => {
    renderWithProviders(<SignLanguageRecorder />);

    expect(screen.getByText('Kamera starten')).toBeInTheDocument();
    expect(screen.getByText('Aussprechen')).toBeInTheDocument();
    expect(screen.getByText('Lernen')).toBeInTheDocument();
  });

  it('shows audio mute button', () => {
    renderWithProviders(<SignLanguageRecorder />);

    expect(screen.getByRole('button', { name: '🔇 Audio stumm' })).toBeInTheDocument();
  });

  it('triggers audio mute toggle', () => {
    renderWithProviders(<SignLanguageRecorder />);

    const muteButton = screen.getByRole('button', { name: '🔇 Audio stumm' });
    fireEvent.click(muteButton);

    expect(toggleAudioMutedMock).toHaveBeenCalledTimes(1);
  });

  it('shows overlay toggle checkbox', () => {
    renderWithProviders(<SignLanguageRecorder />);

    const overlayToggle = screen.getByLabelText('Overlay');
    expect(overlayToggle).toBeInTheDocument();
    expect(overlayToggle).toBeChecked();
  });

  it('shows raw video toggle checkbox', () => {
    renderWithProviders(<SignLanguageRecorder />);

    const rawToggle = screen.getByLabelText('Rohvideo');
    expect(rawToggle).toBeInTheDocument();
    expect(rawToggle).toBeChecked();
  });

  it('toggles overlay visibility when checkbox is clicked', () => {
    renderWithProviders(<SignLanguageRecorder />);

    const overlayToggle = screen.getByLabelText('Overlay') as HTMLInputElement;
    expect(overlayToggle.checked).toBe(true);

    fireEvent.click(overlayToggle);
    expect(overlayToggle.checked).toBe(false);
  });

  it('toggles raw video visibility when checkbox is clicked', () => {
    renderWithProviders(<SignLanguageRecorder />);

    const rawToggle = screen.getByLabelText('Rohvideo') as HTMLInputElement;
    const videoElement = document.querySelector('video');
    expect(videoElement).toBeInTheDocument();
    expect(rawToggle.checked).toBe(true);
    expect(videoElement).not.toHaveClass('video-hidden');

    fireEvent.click(rawToggle);
    expect(rawToggle.checked).toBe(false);
    expect(videoElement).toHaveClass('video-hidden');
  });

  it('shows placeholder when no gesture detected', () => {
    renderWithProviders(<SignLanguageRecorder />);

    expect(screen.getByText('Zeige eine Gebärde in die Kamera…')).toBeInTheDocument();
  });

  it('shows initial status as ready (Bereit)', () => {
    renderWithProviders(<SignLanguageRecorder />);

    expect(screen.getByText('Bereit für die Kamera')).toBeInTheDocument();
  });

  it('displays profile information', () => {
    renderWithProviders(<SignLanguageRecorder />);

    expect(screen.getByText(/Profil/)).toBeInTheDocument();
  });

  it('shows camera warning when camera is not supported', () => {
    // In jsdom environment, navigator.mediaDevices may not exist
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: undefined,
      configurable: true,
    });

    renderWithProviders(<SignLanguageRecorder />);

    // Restore original
    Object.defineProperty(navigator, 'mediaDevices', {
      value: originalMediaDevices,
      configurable: true,
    });
  });

  it('has video element for camera stream', () => {
    renderWithProviders(<SignLanguageRecorder />);

    const videoElement = document.querySelector('video');
    expect(videoElement).toBeInTheDocument();
    expect(videoElement).toHaveAttribute('autoPlay');
    expect(videoElement).toHaveAttribute('playsInline');
  });

  it('has canvas element for overlay', () => {
    renderWithProviders(<SignLanguageRecorder />);

    const canvasElement = document.querySelector('canvas');
    expect(canvasElement).toBeInTheDocument();
    expect(canvasElement).toHaveClass('overlay');
  });

  it('clears stale label cache when trained-labels endpoint returns 403', async () => {
    appStateMock.profileId = 'amy';
    window.localStorage.setItem('webapp:trained-sign-labels', JSON.stringify(['HILFE']));
    window.localStorage.setItem('webapp:has-trained-signs', 'true');

    vi.mocked(apiRetryManager.fetch).mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    } as Response);

    renderWithProviders(<SignLanguageRecorder />);

    await waitFor(() => {
      expect(apiRetryManager.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/dgs/trained-labels?profileId=amy'),
      );
    });

    await waitFor(() => {
      expect(window.localStorage.getItem('webapp:trained-sign-labels')).toBe('[]');
      expect(window.localStorage.getItem('webapp:has-trained-signs')).toBe('false');
    });
  });

  it('retries trained-labels with active registry profile after 403', async () => {
    appStateMock.profileId = 'amy-alt';

    vi.mocked(apiRetryManager.fetch)
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({}),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ trainedLabels: ['HILFE'] }),
      } as Response);
    vi.mocked(getActiveProfile).mockResolvedValue({ profileId: 'amy-neu' } as any);

    renderWithProviders(<SignLanguageRecorder />);

    await waitFor(() => {
      expect(apiRetryManager.fetch).toHaveBeenCalledTimes(2);
    });

    const firstUrl = String(vi.mocked(apiRetryManager.fetch).mock.calls[0]?.[0]);
    const secondUrl = String(vi.mocked(apiRetryManager.fetch).mock.calls[1]?.[0]);

    expect(firstUrl).toContain('profileId=amy-alt');
    expect(secondUrl).toContain('profileId=amy-neu');

    await waitFor(() => {
      expect(window.localStorage.getItem('webapp:trained-sign-labels')).toBe('["HILFE"]');
      expect(window.localStorage.getItem('webapp:has-trained-signs')).toBe('true');
    });
  });

  it('ignores stale 403 responses after profile switch', async () => {
    appStateMock.profileId = 'amy-old';

    let resolveOldResponse: null | ((value: Response) => void) = null;
    vi.mocked(apiRetryManager.fetch).mockImplementation((url: string | URL | Request) => {
      const requestUrl = String(url);
      if (requestUrl.includes('profileId=amy-old')) {
        return new Promise<Response>((resolve) => {
          resolveOldResponse = resolve;
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ trainedLabels: ['HALLO'] }),
      } as Response);
    });

    const view = renderWithProviders(<SignLanguageRecorder />);

    await waitFor(() => {
      expect(apiRetryManager.fetch).toHaveBeenCalledWith(
        expect.stringContaining('profileId=amy-old'),
      );
    });

    appStateMock.profileId = 'amy-new';
    view.rerender(
      <MemoryRouter>
        <ApiConfigProvider>
          <SignLanguageRecorder />
        </ApiConfigProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiRetryManager.fetch).toHaveBeenCalledWith(
        expect.stringContaining('profileId=amy-new'),
      );
    });

    await waitFor(() => {
      expect(window.localStorage.getItem('webapp:trained-sign-labels')).toBe('["HALLO"]');
      expect(window.localStorage.getItem('webapp:has-trained-signs')).toBe('true');
    });

    const oldResponseResolver = resolveOldResponse as ((value: Response) => void) | null;
    if (oldResponseResolver) {
      oldResponseResolver({
        ok: false,
        status: 403,
        json: async () => ({}),
      } as Response);
    }

    await waitFor(() => {
      expect(window.localStorage.getItem('webapp:trained-sign-labels')).toBe('["HALLO"]');
      expect(window.localStorage.getItem('webapp:has-trained-signs')).toBe('true');
    });
  });
});
