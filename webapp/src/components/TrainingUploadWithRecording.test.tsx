import { screen, waitFor } from '@testing-library/dom';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { TrainingUploadWithRecording } from './TrainingUpload';
import { ApiConfigProvider } from '../hooks/useApiConfig';
import { AppStateProvider } from '../hooks/useAppState';
import { MemoryRouter } from 'react-router-dom';
import { SymbolStoreProvider } from '../context/SymbolStore';
import { MessageProvider } from '../context/MessageContext';
import { createProfile, addProfile, setActiveProfile } from '../services/profileRegistry';

const TEST_PROFILE_ID = '11111111-1111-4111-8111-111111111111';

const uploadMock = vi.fn();
const syncQueuedMock = vi.fn();
const syncBundleMock = vi.fn();
const removeBundleMock = vi.fn();
const fetchMock = vi.fn();

let mockTrainingJob: any = null;
let mockTrainingJobError: string | null = null;
let mockMetacomSymbols: Array<{ id: string; label: string; emoji: string; category?: string; color?: string }> = [];

vi.mock('../hooks/useTrainingUploader', () => ({
  useTrainingUploader: () => ({
    upload: uploadMock,
    state: 'idle',
    lastResult: null,
    error: null,
    queuedCount: 0,
    queuedBundles: [],
    syncQueued: syncQueuedMock,
    syncBundle: syncBundleMock,
    removeBundle: removeBundleMock,
    syncing: false,
    syncError: null,
    lastQueuedKey: null,
    trainingJob: mockTrainingJob,
    trainingJobError: mockTrainingJobError,
  }),
}));

vi.mock('./TrainingRecorder', () => ({
  TrainingRecorder: ({ profileId, label, onRecordingComplete }: any) => (
    <button
      type="button"
      onClick={() =>
        onRecordingComplete({
          profileId,
          label,
          frames: [],
          capturedAt: new Date().toISOString(),
          source: 'web://mediapipe',
        })
      }
    >
      Aufnahme abschicken (Test)
    </button>
  ),
}));

vi.mock('../hooks/useMetacomBundle', () => ({
  useMetacomBundle: () => ({ symbols: mockMetacomSymbols }),
}));

function renderWithProviders() {
  return render(
    <MemoryRouter>
      <MessageProvider>
        <ApiConfigProvider>
          <AppStateProvider>
            <SymbolStoreProvider>
              <TrainingUploadWithRecording />
            </SymbolStoreProvider>
          </AppStateProvider>
        </ApiConfigProvider>
      </MessageProvider>
    </MemoryRouter>,
  );
}

describe('TrainingUploadWithRecording', () => {
  beforeEach(() => {
    mockTrainingJob = null;
    mockTrainingJobError = null;
    mockMetacomSymbols = [];
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/dgs/training-quality')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                bundleId: 'bundle-rejected-1',
                label: 'HILFE',
                profileId: TEST_PROFILE_ID,
                reasons: ['too_few_frames', 'hand_coverage_low'],
                metrics: {
                  frameCount: 8,
                  handCoverage: 0.45,
                  poseCoverage: 0.7,
                  faceCoverage: 0.6,
                },
                recordedAt: '2026-01-01T10:00:00.000Z',
              },
            ],
          }),
          headers: new Headers(),
        } as any;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ symbols: [] }),
        arrayBuffer: async () => new ArrayBuffer(0),
        headers: new Headers(),
      } as any;
    });
    vi.stubGlobal('fetch', fetchMock);
    uploadMock.mockReset();
    syncQueuedMock.mockReset();
    syncBundleMock.mockReset();
    removeBundleMock.mockReset();
    uploadMock.mockResolvedValue({});
    syncBundleMock.mockResolvedValue(true);
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const TEST_TIMEOUT = 10000;

  it('blocks uploads when profile or label are missing', async () => {
    const user = userEvent.setup();
    renderWithProviders();

    // The preferredSignId defaults to 'hilfe', so we need to clear it or select nothing.
    
    await user.click(screen.getByRole('button', { name: /Aufnahme abschicken/i }));

    expect(uploadMock).not.toHaveBeenCalled();
  }, TEST_TIMEOUT);

  it('submits recordings only with a filled profile and label', async () => {
    const user = userEvent.setup();
    
    // Create and set a profile before rendering
    const profile = await createProfile({ displayName: 'Test Profil', profileId: TEST_PROFILE_ID });
    await addProfile(profile);
    await setActiveProfile(profile.uuid);

    renderWithProviders();

    // Wait for profile to be loaded into UI
    await waitFor(
      () => {
        const profileInput = screen.getByLabelText('Ausgewähltes Profil') as HTMLInputElement;
        expect(profileInput.value).toBe(TEST_PROFILE_ID);
      },
      { timeout: TEST_TIMEOUT },
    );

    const labelInput = screen.getByLabelText('Gebärde suchen oder neu anlegen');

    await user.clear(labelInput);
    await user.type(labelInput, 'NEUES-LABEL');
    
    // Click the "use as new" button
    const useAsNewButton = screen.getByText(/"NEUES-LABEL" als neue Gebärde verwenden/i);
    await user.click(useAsNewButton);

    await user.click(screen.getByRole('button', { name: /Aufnahme abschicken/i }));

    await waitFor(() => {
      expect(uploadMock).toHaveBeenCalledTimes(1);
    });
    
    const payload = uploadMock.mock.calls[0]?.[0];
    expect(payload).toBeDefined();
    if (!payload) return;
    expect(payload.profileId).toBe(TEST_PROFILE_ID);
    expect(payload.label).toBe('neues-label');
  }, TEST_TIMEOUT);

  it('shows a success message after a successful upload', async () => {
    const user = userEvent.setup();
    const profile = await createProfile({ displayName: 'Test Profil', profileId: TEST_PROFILE_ID });
    await addProfile(profile);
    await setActiveProfile(profile.uuid);

    renderWithProviders();

    // Wait for async profile loading
    await waitFor(
      () => {
        const profileInput = screen.getByLabelText('Ausgewähltes Profil') as HTMLInputElement;
        expect(profileInput.value).toBe(TEST_PROFILE_ID);
      },
      { timeout: TEST_TIMEOUT },
    );

    const labelInput = screen.getByLabelText('Gebärde suchen oder neu anlegen');
    await user.clear(labelInput);
    await user.type(labelInput, 'HALLO');
    
    // Click the "use as new" button
    const useAsNewButton = screen.getByText(/"HALLO" als neue Gebärde verwenden/i);
    await user.click(useAsNewButton);

    uploadMock.mockResolvedValue({ id: 'bundle-123', status: 'accepted' });

    await user.click(screen.getByRole('button', { name: /Aufnahme abschicken/i }));

    await waitFor(() => {
      expect(screen.getByText(/Upload abgeschlossen\. Vielen Dank für die neue Gebärde!/i)).toBeInTheDocument();
    });
  }, TEST_TIMEOUT);

  it('shows an error message after a failed upload', async () => {
    const user = userEvent.setup();
    const profile = await createProfile({ displayName: 'Test Profil', profileId: TEST_PROFILE_ID });
    await addProfile(profile);
    await setActiveProfile(profile.uuid);

    renderWithProviders();

    // Wait for async profile loading
    await waitFor(
      () => {
        const profileInput = screen.getByLabelText('Ausgewähltes Profil') as HTMLInputElement;
        expect(profileInput.value).toBe(TEST_PROFILE_ID);
      },
      { timeout: TEST_TIMEOUT },
    );

    const labelInput = screen.getByLabelText('Gebärde suchen oder neu anlegen');
    await user.clear(labelInput);
    await user.type(labelInput, 'FEHLER');
    
    // Click the "use as new" button
    const useAsNewButton = screen.getByText(/"FEHLER" als neue Gebärde verwenden/i);
    await user.click(useAsNewButton);

    uploadMock.mockRejectedValue(new Error('Netzwerkfehler'));

    await user.click(screen.getByRole('button', { name: /Aufnahme abschicken/i }));

    await waitFor(() => {
      expect(screen.getByText(/Upload fehlgeschlagen: Netzwerkfehler/i)).toBeInTheDocument();
    });
  }, TEST_TIMEOUT);



  it('shows rejected recordings with reasons', async () => {
    const profile = await createProfile({ displayName: 'Test Profil', profileId: TEST_PROFILE_ID });
    await addProfile(profile);
    await setActiveProfile(profile.uuid);

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText('Abgelehnte Aufnahmen')).toBeInTheDocument();
      expect(screen.getByText(/Zu wenige verwertbare Frames erkannt/i)).toBeInTheDocument();
      expect(screen.getByText(/Hände waren nicht durchgängig sichtbar/i)).toBeInTheDocument();
      expect(screen.getByText(/Nimm die Gebärde erneut/i)).toBeInTheDocument();
    });
  }, TEST_TIMEOUT);

  it('shows training failure details without redundant fallback text', async () => {
    const profile = await createProfile({ displayName: 'Test Profil', profileId: TEST_PROFILE_ID });
    await addProfile(profile);
    await setActiveProfile(profile.uuid);

    // Set mock state using the reactive variables defined at top level
    mockTrainingJob = {
      jobId: 'job-123',
      status: 'failed',
      error: 'Skript-Fehler in train_mlp.py',
      message: 'Training abgebrochen wegen fehlender Daten',
      progress: 0,
    };
    mockTrainingJobError = 'Skript-Fehler in train_mlp.py';

    renderWithProviders();

    // Should show the specific job message or error, but not multiple redundant fallbacks
    expect(screen.getByText(/Training abgebrochen wegen fehlender Daten/i)).toBeInTheDocument();
    
    // It should NOT show the generic fallback since message is present
    expect(screen.queryByText(/Training fehlgeschlagen\. Bitte prüfe die Logs oder versuche es erneut\./i)).not.toBeInTheDocument();
  }, TEST_TIMEOUT);

  it('shows no duplicate symbol labels after sync and remaps selection', async () => {
    const user = userEvent.setup();
    mockMetacomSymbols = [
      { id: 'metacom-essen', label: 'Essen', emoji: '🍽️', category: 'food' },
    ];

    let symbolFetchCount = 0;

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/dgs/training-quality')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [] }),
          headers: new Headers(),
        } as any;
      }

      if (url.includes('/api/v1/symbols')) {
        symbolFetchCount += 1;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            symbols:
              symbolFetchCount <= 2
                ? []
                : [
                    {
                      id: 'server-essen',
                      name: 'Essen',
                      category: 'food',
                      emoji: '🍽️',
                    },
                  ],
          }),
          headers: new Headers(),
        } as any;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ symbols: [] }),
        headers: new Headers(),
      } as any;
    });

    renderWithProviders();

    await user.click(screen.getByLabelText('Essen'));

    await waitFor(() => {
      expect(screen.getAllByLabelText('Essen')).toHaveLength(1);
    });

    await waitFor(() => {
      expect(screen.getByText('Ausgewählt:')).toBeInTheDocument();
      expect(screen.getByText('Essen')).toBeInTheDocument();
    });
  }, TEST_TIMEOUT);

  it('does not permanently suppress Metacom labels on ID collision without insertion', async () => {
    mockMetacomSymbols = [
      { id: 'symbol-kollision', label: 'Essen', emoji: '🍽️', category: 'food' },
      { id: 'symbol-eindeutig', label: 'Essen', emoji: '🍽️', category: 'food' },
    ];

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/dgs/training-quality')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [] }),
          headers: new Headers(),
        } as any;
      }

      if (url.includes('/api/v1/symbols')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            symbols: [
              {
                id: 'symbol-kollision',
                name: 'Brot',
                category: 'food',
                emoji: '🍞',
              },
            ],
          }),
          headers: new Headers(),
        } as any;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ symbols: [] }),
        headers: new Headers(),
      } as any;
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByLabelText('Brot')).toBeInTheDocument();
      expect(screen.getAllByLabelText('Essen')).toHaveLength(1);
    });
  }, TEST_TIMEOUT);

  it('shows duplicate names from the symbol store only once and keeps the profile symbol', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/dgs/training-quality')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [] }),
          headers: new Headers(),
        } as any;
      }

      if (url.includes('/api/v1/symbols')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            symbols: [
              {
                id: 'symbol-global-essen',
                name: 'Essen',
                category: 'food',
                emoji: '🍽️',
              },
              {
                id: 'symbol-profile-essen',
                name: 'Essen',
                category: 'food',
                emoji: '🍽️',
                profileId: TEST_PROFILE_ID,
              },
            ],
          }),
          headers: new Headers(),
        } as any;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ symbols: [] }),
        headers: new Headers(),
      } as any;
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getAllByLabelText('Essen')).toHaveLength(1);
    });

    const essenButton = screen.getByLabelText('Essen');
    expect(essenButton).toHaveAttribute('data-symbol-id', 'symbol-profile-essen');
  }, TEST_TIMEOUT);
});
