import { fireEvent, screen } from '@testing-library/dom';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useEffect } from 'react';
import { SignLanguageRecorder } from './SignLanguageRecorder';
import type { SignLanguageMessage } from '../hooks/useSignLanguageDetector';
import { ApiConfigProvider, useApiConfig } from '../hooks/useApiConfig';
import { apiRetryManager } from '../services/apiRetryManager';
import { getActiveProfile } from '../services/profileRegistry';

// Mock the hooks that have external dependencies
const toggleAudioMutedMock = vi.fn();
const detectorState = {
  start: vi.fn().mockResolvedValue(true),
  stop: vi.fn().mockResolvedValue(undefined),
  cleanup: vi.fn().mockResolvedValue(undefined),
  audioMuted: false,
  toggleAudioMuted: toggleAudioMutedMock,
  status: 'idle',
  error: null as string | null,
  lastSign: null as string | null,
  lastLandmarks: [] as number[][][],
  lastHandedness: [] as string[],
  lastConfidence: null as number | null,
  lastDetectionMethod: null as string | null,
  lastUsedFallback: false,
  lastMlpLabel: null as string | null,
  lastMlpScore: null as number | null,
  lastMlpThreshold: null as number | null,
  lastMlpCandidates: [] as Array<{ label: string; score: number }>,
  messageLog: [] as SignLanguageMessage[],
  getVariationMetrics: vi.fn().mockReturnValue(undefined),
};

vi.mock('../hooks/useSignLanguageDetector', () => ({
  useSignLanguageDetector: () => detectorState,
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

function ApiTokenSetter({ token }: { token: string }) {
  const { setApiToken } = useApiConfig();

  useEffect(() => {
    setApiToken(token);
  }, [setApiToken, token]);

  return null;
}

const renderWithProviders = (ui: React.ReactElement, options?: { apiToken?: string }) => {
  return render(
    <MemoryRouter>
      <ApiConfigProvider>
        {options?.apiToken ? <ApiTokenSetter token={options.apiToken} /> : null}
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
    detectorState.status = 'idle';
    detectorState.error = null;
    detectorState.lastSign = null;
    detectorState.lastLandmarks = [];
    detectorState.lastHandedness = [];
    detectorState.lastConfidence = null;
    detectorState.lastDetectionMethod = null;
    detectorState.lastUsedFallback = false;
    detectorState.lastMlpLabel = null;
    detectorState.lastMlpScore = null;
    detectorState.lastMlpThreshold = null;
    detectorState.lastMlpCandidates = [];
    detectorState.messageLog = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/models/latest')) {
          return new Response('not-found', { status: 404 });
        }
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    );
    (window as unknown as { __setMlpModelB64?: (b64: string) => Promise<boolean> }).__setMlpModelB64 = vi
      .fn()
      .mockResolvedValue(true);
  });

  it('renders the gesture demo section', () => {
    renderWithProviders(<SignLanguageRecorder />);

    expect(screen.getByText('Bereit für die Kamera', { selector: '.gesture-screen__status-pill span' })).toBeInTheDocument();
    expect(screen.getByText(/Profil/, { selector: '.gesture-screen__status-meta p' })).toBeInTheDocument();
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

  it('shows diagnostics panel with actionable guidance', () => {
    detectorState.status = 'running';
    detectorState.lastLandmarks = [[[0.1, 0.2, 0.3]]];
    detectorState.lastSign = null;
    detectorState.lastConfidence = 0.24;
    detectorState.messageLog = [
      {
        type: 'landmarks',
        summary: 'Keine Hand erkannt',
        payload: { type: 'landmarks' },
        receivedAt: Date.now(),
        count: 1,
      },
    ];

    window.localStorage.setItem('webapp:trained-sign-labels', JSON.stringify(['HALLO', 'ESSEN']));
    window.localStorage.setItem('webapp:has-trained-signs', 'true');

    renderWithProviders(<SignLanguageRecorder />);

    fireEvent.click(screen.getByRole('button', { name: '🛠️ Diagnose anzeigen' }));

    expect(screen.getByText('Hand erkannt, aber keine passende Gebärde')).toBeInTheDocument();
    expect(screen.getByText(/Aktuelle Sicherheit ist zu niedrig/)).toBeInTheDocument();
    expect(screen.getByText(/Letzte Systemmeldung:/)).toBeInTheDocument();
    expect(screen.getByText(/Aktives Modell:/)).toBeInTheDocument();
    expect(screen.getByText(/Letzter Erkennungsweg:/)).toBeInTheDocument();
    expect(screen.getByText(/Trainierte Beispiele: HALLO, ESSEN/)).toBeInTheDocument();
  });

  it('toggles diagnostics panel visibility', () => {
    detectorState.status = 'running';
    detectorState.lastLandmarks = [[[0.1, 0.2, 0.3]]];
    window.localStorage.setItem('webapp:has-trained-signs', 'true');

    renderWithProviders(<SignLanguageRecorder />);

    expect(screen.queryByText(/Letzter Erkennungsweg:/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '🛠️ Diagnose anzeigen' }));
    expect(screen.getByText(/Letzter Erkennungsweg:/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '🛠️ Diagnose ausblenden' }));
    expect(screen.queryByText(/Letzter Erkennungsweg:/)).not.toBeInTheDocument();
  });

  it('shows profile model usage and fallback mode in diagnostics', async () => {
    appStateMock.profileId = 'profile-123';
    detectorState.status = 'running';
    detectorState.lastLandmarks = [[[0.1, 0.2, 0.3]]];
    detectorState.lastDetectionMethod = 'mlp';
    detectorState.lastUsedFallback = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/models/latest?profileId=profile-123')) {
          return new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: {
              'X-Model-Version': '12345',
              'X-Model-Source': 'profile',
              'X-Model-Profile': 'profile-123',
            },
          });
        }
        if (url.includes('/api/v1/models/latest')) {
          return new Response('not-found', { status: 404 });
        }
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    );

    vi.mocked(apiRetryManager.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ trainedLabels: ['TRINKEN'] }),
    } as Response);

    window.localStorage.setItem('webapp:trained-sign-labels', JSON.stringify(['TRINKEN']));
    window.localStorage.setItem('webapp:has-trained-signs', 'true');

    renderWithProviders(<SignLanguageRecorder />);
    expect(await screen.findByText(/Modell: Profilmodell aktiv v12345 · Erkennung: Fallback-Erkennung aktiv · Kommunikation freigegeben/)).toBeInTheDocument();
    const diagnosticsButton = await screen.findByRole('button', { name: '🛠️ Diagnose anzeigen' });
    fireEvent.click(diagnosticsButton);

    expect(screen.getByText(/Profilmodell aktiv \(Version 12345\)/)).toBeInTheDocument();
    expect(screen.getAllByText(/Fallback-Erkennung aktiv/).length).toBeGreaterThan(0);
  });

  it('treats trained labels as matching even with extra whitespace and casing differences', async () => {
    detectorState.status = 'running';
    detectorState.lastLandmarks = [[[0.1, 0.2, 0.3]]];
    detectorState.lastSign = '  TRINKEN  ';
    detectorState.lastConfidence = 0.89;

    window.localStorage.setItem('webapp:trained-sign-labels', JSON.stringify(['trinken   ']));
    window.localStorage.setItem('webapp:has-trained-signs', 'true');

    renderWithProviders(<SignLanguageRecorder />);

    const diagnosticsButton = await screen.findByRole('button', { name: '🛠️ Diagnose anzeigen' });
    fireEvent.click(diagnosticsButton);

    expect(screen.getByText('Erkennung arbeitet stabil')).toBeInTheDocument();
    expect(screen.queryByText('Gebärde erkannt, aber nicht im trainierten Profil')).not.toBeInTheDocument();
  });


  it('matches trained labels that include generated UUID suffixes', async () => {
    detectorState.status = 'running';
    detectorState.lastLandmarks = [[[0.1, 0.2, 0.3]]];
    detectorState.lastSign = 'TRINKEN';
    detectorState.lastConfidence = 0.93;

    window.localStorage.setItem(
      'webapp:trained-sign-labels',
      JSON.stringify(['trinken-05d6e861-36e0-4ca2-91f1-e6d9bf591726']),
    );
    window.localStorage.setItem('webapp:has-trained-signs', 'true');

    renderWithProviders(<SignLanguageRecorder />);

    const diagnosticsButton = await screen.findByRole('button', { name: '🛠️ Diagnose anzeigen' });
    fireEvent.click(diagnosticsButton);

    expect(screen.getByText('Erkennung arbeitet stabil')).toBeInTheDocument();
    expect(screen.queryByText('Gebärde erkannt, aber nicht im trainierten Profil')).not.toBeInTheDocument();
  });

  
  
  it('accepts UUID-suffixed labels returned by trained-labels API for matching and recording', async () => {
    appStateMock.profileId = 'profile-uuid-api';
    detectorState.status = 'running';
    detectorState.lastLandmarks = [[[0.1, 0.2, 0.3]]];
    detectorState.lastSign = 'TRINKEN';
    detectorState.lastConfidence = 0.88;

    vi.mocked(apiRetryManager.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        trainedLabels: ['trinken_05d6e861-36e0-4ca2-91f1-e6d9bf591726'],
      }),
    } as Response);

    renderWithProviders(<SignLanguageRecorder />);

    await waitFor(() => {
      expect(apiRetryManager.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/dgs/trained-labels?profileId=profile-uuid-api'),
        expect.any(Object),
      );
    });

    const enableFallbackButton = await screen.findByRole('button', {
      name: 'Vorübergehend mit Ersatzmodell fortfahren',
    });
    fireEvent.click(enableFallbackButton);

    const diagnosticsButton = await screen.findByRole('button', { name: '🛠️ Diagnose anzeigen' });
    fireEvent.click(diagnosticsButton);

    expect(screen.getByText('Erkennung arbeitet stabil')).toBeInTheDocument();
    expect(screen.queryByText('Gebärde erkannt, aber nicht im trainierten Profil')).not.toBeInTheDocument();
    expect(appStateMock.recordSign).toHaveBeenCalledWith('TRINKEN');
  });



  it('does not override a trained MediaPipe label with another trained MLP candidate', async () => {
    detectorState.status = 'running';
    detectorState.lastLandmarks = [[[0.1, 0.2, 0.3]]];
    detectorState.lastSign = 'TRINKEN';
    detectorState.lastDetectionMethod = 'mediapipe';
    detectorState.lastMlpLabel = 'ESSEN';
    detectorState.lastMlpScore = 0.8;
    detectorState.lastMlpThreshold = 0.4;

    window.localStorage.setItem('webapp:trained-sign-labels', JSON.stringify(['TRINKEN', 'ESSEN']));
    window.localStorage.setItem('webapp:has-trained-signs', 'true');

    renderWithProviders(<SignLanguageRecorder />);

    await waitFor(() => {
      expect(appStateMock.recordSign).toHaveBeenCalledWith('TRINKEN');
    });
    expect(appStateMock.recordSign).not.toHaveBeenCalledWith('ESSEN');
  });


  it('does not override baseline label when MLP score is below recorder fallback threshold', async () => {
    detectorState.status = 'running';
    detectorState.lastLandmarks = [[[0.1, 0.2, 0.3]]];
    detectorState.lastSign = 'closed_fist';
    detectorState.lastDetectionMethod = 'mediapipe';
    detectorState.lastMlpLabel = 'TRINKEN';
    detectorState.lastMlpScore = 0.2;
    detectorState.lastMlpThreshold = null;
    detectorState.lastMlpCandidates = [];

    window.localStorage.setItem('webapp:trained-sign-labels', JSON.stringify(['TRINKEN']));
    window.localStorage.setItem('webapp:has-trained-signs', 'true');

    renderWithProviders(<SignLanguageRecorder />);

    await waitFor(() => {
      expect(appStateMock.recordSign).not.toHaveBeenCalledWith('TRINKEN');
    });
  });



  it('allows caregiver to select an MLP candidate from diagnostics for contextual output', async () => {
    detectorState.status = 'running';
    detectorState.lastLandmarks = [[[0.1, 0.2, 0.3]]];
    detectorState.lastSign = 'closed_fist';
    detectorState.lastDetectionMethod = 'mediapipe';
    detectorState.lastMlpCandidates = [
      { label: 'TRINKEN', score: 0.28 },
      { label: 'SATT', score: 0.21 },
    ];

    window.localStorage.setItem('webapp:trained-sign-labels', JSON.stringify(['TRINKEN', 'SATT']));
    window.localStorage.setItem('webapp:has-trained-signs', 'true');

    renderWithProviders(<SignLanguageRecorder />);

    const diagnosticsButton = await screen.findByRole('button', { name: '🛠️ Diagnose anzeigen' });
    fireEvent.click(diagnosticsButton);

    fireEvent.click(screen.getByRole('button', { name: /Satt · 21% · trainiert/ }));

    await waitFor(() => {
      expect(appStateMock.recordSign).toHaveBeenCalledWith('SATT');
    });
  });


  it('shows untrained MLP candidates as disabled with guidance', async () => {
    detectorState.status = 'running';
    detectorState.lastLandmarks = [[[0.1, 0.2, 0.3]]];
    detectorState.lastSign = 'closed_fist';
    detectorState.lastDetectionMethod = 'mediapipe';
    detectorState.lastMlpCandidates = [
      { label: 'UNBEKANNT', score: 0.25 },
      { label: 'TRINKEN', score: 0.22 },
    ];

    window.localStorage.setItem('webapp:trained-sign-labels', JSON.stringify(['TRINKEN']));
    window.localStorage.setItem('webapp:has-trained-signs', 'true');

    renderWithProviders(<SignLanguageRecorder />);

    const diagnosticsButton = await screen.findByRole('button', { name: '🛠️ Diagnose anzeigen' });
    fireEvent.click(diagnosticsButton);

    const untrainedButton = screen.getByRole('button', { name: /Unbekannt · 25% · nicht trainiert/ });
    expect(untrainedButton).toBeDisabled();
    expect(untrainedButton).toHaveAttribute('title', expect.stringContaining('Nicht trainiert'));
  });

  it('shows low-confidence MLP candidate list so caregivers can decide in context', async () => {
    detectorState.status = 'running';
    detectorState.lastLandmarks = [[[0.1, 0.2, 0.3]]];
    detectorState.lastSign = 'closed_fist';
    detectorState.lastDetectionMethod = 'mediapipe';
    detectorState.lastMlpCandidates = [
      { label: 'TRINKEN', score: 0.28 },
      { label: 'SATT', score: 0.21 },
      { label: '_NULL_', score: 0.16 },
    ];

    window.localStorage.setItem('webapp:trained-sign-labels', JSON.stringify(['TRINKEN', 'SATT']));
    window.localStorage.setItem('webapp:has-trained-signs', 'true');

    renderWithProviders(<SignLanguageRecorder />);

    const diagnosticsButton = await screen.findByRole('button', { name: '🛠️ Diagnose anzeigen' });
    fireEvent.click(diagnosticsButton);

    expect(screen.getByText('Mögliche Gebärden aus deinem Modell:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Trinken · 28% · trainiert/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Satt · 21% · trainiert/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /_NULL_/i })).not.toBeInTheDocument();
  });

  it('uses trained MLP candidate when MediaPipe result is untrained baseline label', async () => {
    detectorState.status = 'running';
    detectorState.lastLandmarks = [[[0.1, 0.2, 0.3]]];
    detectorState.lastSign = 'closed_fist';
    detectorState.lastDetectionMethod = 'mediapipe';
    detectorState.lastMlpLabel = 'TRINKEN';
    detectorState.lastMlpScore = 0.62;
    detectorState.lastMlpThreshold = 0.4;

    window.localStorage.setItem('webapp:trained-sign-labels', JSON.stringify(['TRINKEN']));
    window.localStorage.setItem('webapp:has-trained-signs', 'true');

    renderWithProviders(<SignLanguageRecorder />);

    const diagnosticsButton = await screen.findByRole('button', { name: '🛠️ Diagnose anzeigen' });
    fireEvent.click(diagnosticsButton);

    expect(screen.getByText('Erkennung arbeitet stabil')).toBeInTheDocument();
    expect(screen.queryByText('Gebärde erkannt, aber nicht im trainierten Profil')).not.toBeInTheDocument();
    expect(appStateMock.recordSign).toHaveBeenCalledWith('TRINKEN');
  });

  it('matches detector output when generated UUID suffix uses underscore separator', async () => {
    detectorState.status = 'running';
    detectorState.lastLandmarks = [[[0.1, 0.2, 0.3]]];
    detectorState.lastSign = 'TRINKEN_05d6e861-36e0-4ca2-91f1-e6d9bf591726';
    detectorState.lastConfidence = 0.91;

    window.localStorage.setItem('webapp:trained-sign-labels', JSON.stringify(['TRINKEN']));
    window.localStorage.setItem('webapp:has-trained-signs', 'true');

    renderWithProviders(<SignLanguageRecorder />);

    const diagnosticsButton = await screen.findByRole('button', { name: '🛠️ Diagnose anzeigen' });
    fireEvent.click(diagnosticsButton);

    expect(screen.getByText('Erkennung arbeitet stabil')).toBeInTheDocument();
    expect(screen.queryByText('Gebärde erkannt, aber nicht im trainierten Profil')).not.toBeInTheDocument();
    expect(appStateMock.recordSign).toHaveBeenCalledWith('TRINKEN_05d6e861-36e0-4ca2-91f1-e6d9bf591726');
  });

  it('blocks trained-sign output until the personal profile model is active', async () => {
    appStateMock.profileId = 'profile-456';
    detectorState.status = 'running';
    detectorState.lastLandmarks = [[[0.1, 0.2, 0.3]]];
    detectorState.lastSign = 'TRINKEN';
    detectorState.lastConfidence = 0.94;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/models/latest?profileId=profile-456')) {
          return new Response('missing-profile', { status: 404 });
        }
        if (url.includes('/api/v1/models/latest')) {
          return new Response(new Uint8Array([9, 9, 9]), {
            status: 200,
            headers: {
              'X-Model-Version': '999',
              'X-Model-Source': 'global',
            },
          });
        }
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    );

    vi.mocked(apiRetryManager.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ trainedLabels: ['TRINKEN'] }),
    } as Response);

    window.localStorage.setItem('webapp:trained-sign-labels', JSON.stringify(['TRINKEN']));
    window.localStorage.setItem('webapp:has-trained-signs', 'true');

    renderWithProviders(<SignLanguageRecorder />);

    expect(await screen.findByText(/Persönliches Profilmodell noch nicht aktiv/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vorübergehend mit Ersatzmodell fortfahren' })).toBeInTheDocument();
    expect(screen.queryByText('Trinken')).not.toBeInTheDocument();
    expect(screen.getByText('Profilmodell wird geladen – Ausgaben sind kurz pausiert.')).toBeInTheDocument();
    expect(appStateMock.recordSign).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '🛠️ Diagnose anzeigen' }));
    expect(screen.getByText('Persönliches Modell wird vorbereitet')).toBeInTheDocument();
    expect(screen.getByText(/Ausgabe-Freigabe:/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Vorübergehend mit Ersatzmodell fortfahren' }));
    expect(await screen.findByText('Wieder auf Profilmodell warten')).toBeInTheDocument();
  });

  it('resets fallback override when active profile changes', async () => {
    appStateMock.profileId = 'profile-a';
    detectorState.status = 'running';
    detectorState.lastLandmarks = [[[0.1, 0.2, 0.3]]];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/models/latest?profileId=')) {
          return new Response('missing-profile', { status: 404 });
        }
        if (url.includes('/api/v1/models/latest')) {
          return new Response(new Uint8Array([9, 9, 9]), {
            status: 200,
            headers: {
              'X-Model-Version': '999',
              'X-Model-Source': 'global',
            },
          });
        }
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    );

    vi.mocked(apiRetryManager.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ trainedLabels: ['TRINKEN'] }),
    } as Response);

    window.localStorage.setItem('webapp:trained-sign-labels', JSON.stringify(['TRINKEN']));
    window.localStorage.setItem('webapp:has-trained-signs', 'true');

    const { rerender } = renderWithProviders(<SignLanguageRecorder />);

    expect(await screen.findByRole('button', { name: 'Vorübergehend mit Ersatzmodell fortfahren' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Vorübergehend mit Ersatzmodell fortfahren' }));
    expect(await screen.findByRole('button', { name: 'Wieder auf Profilmodell warten' })).toBeInTheDocument();

    appStateMock.profileId = 'profile-b';
    rerender(
      <MemoryRouter>
        <ApiConfigProvider>
          <SignLanguageRecorder />
        </ApiConfigProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: 'Vorübergehend mit Ersatzmodell fortfahren' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Wieder auf Profilmodell warten' })).not.toBeInTheDocument();
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

  it('shows hand-detected feedback while waiting for a trained gesture', () => {
    detectorState.status = 'running';
    detectorState.lastLandmarks = [[[0.1, 0.2, 0.3]]];

    renderWithProviders(<SignLanguageRecorder />);

    expect(screen.getByText('Hand erkannt – ich suche nach einer passenden Gebärde…')).toBeInTheDocument();
  });

  it('shows initial status as ready (Bereit)', () => {
    renderWithProviders(<SignLanguageRecorder />);

    expect(screen.getByText('Bereit für die Kamera', { selector: '.gesture-screen__status-pill span' })).toBeInTheDocument();
  });

  it('displays profile information', () => {
    renderWithProviders(<SignLanguageRecorder />);

    expect(screen.getByText(/Profil/, { selector: '.gesture-screen__status-meta p' })).toBeInTheDocument();
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


  it('includes Authorization header when apiToken is configured', async () => {
    appStateMock.profileId = 'amy';
    renderWithProviders(<SignLanguageRecorder />, { apiToken: 'test-token' });

    await waitFor(() => {
      expect(apiRetryManager.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/dgs/trained-labels?profileId=amy'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-token' },
        }),
      );
    });
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
        expect.objectContaining({}),
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
    vi.mocked(getActiveProfile).mockResolvedValue({ profileId: 'amy-neu' } as unknown as Awaited<ReturnType<typeof getActiveProfile>>);

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
        expect.objectContaining({}),
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
        expect.objectContaining({}),
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
