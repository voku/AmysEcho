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

const uploadMock = vi.fn();
const syncQueuedMock = vi.fn();
const syncBundleMock = vi.fn();
const removeBundleMock = vi.fn();
const fetchMock = vi.fn();

let mockTrainingJob: any = null;
let mockTrainingJobError: string | null = null;

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
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ symbols: [] }),
      arrayBuffer: async () => new ArrayBuffer(0),
      headers: new Headers(),
    } as any);
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

  it('blockiert Uploads, wenn Profil oder Label fehlen', async () => {
    const user = userEvent.setup();
    renderWithProviders();

    // profileInput is read-only now, so we only clear the label
    const labelInput = screen.getByLabelText('Gebärden-Name');
    await user.clear(labelInput);

    await user.click(screen.getByRole('button', { name: /Aufnahme abschicken/i }));

    expect(uploadMock).not.toHaveBeenCalled();
    const validationMessages = screen.getAllByText(
      'Bitte trage Profil-ID und Gebärden-Name ein, bevor du eine Aufnahme startest.',
    );
    expect(validationMessages.length).toBeGreaterThan(0);
  }, TEST_TIMEOUT);

  it('übermittelt Aufnahmen nur mit gefüllter Profil-ID und Label', async () => {
    const user = userEvent.setup();
    
    // Create and set a profile before rendering
    const profile = await createProfile({ displayName: 'Test Profil', profileId: 'profil-1' });
    await addProfile(profile);
    await setActiveProfile(profile.uuid);

    renderWithProviders();

    // Wait for profile to be loaded into UI
    await waitFor(() => {
      const profileInput = screen.getByLabelText('Profil-ID') as HTMLInputElement;
      expect(profileInput.value).toBe('profil-1');
    });

    const labelInput = screen.getByLabelText('Gebärden-Name');

    await user.clear(labelInput);
    await user.type(labelInput, 'NEUES-LABEL');

    await user.click(screen.getByRole('button', { name: /Aufnahme abschicken/i }));

    await waitFor(() => {
      expect(uploadMock).toHaveBeenCalledTimes(1);
    });
    
    const payload = uploadMock.mock.calls[0]?.[0];
    expect(payload).toBeDefined();
    if (!payload) return;
    expect(payload.profileId).toBe('profil-1');
    expect(payload.label).toBe('NEUES-LABEL');
  }, TEST_TIMEOUT);

  it('zeigt Erfolgsmeldung nach erfolgreichem Upload an', async () => {
    const user = userEvent.setup();
    const profile = await createProfile({ displayName: 'Test Profil', profileId: 'profil-1' });
    await addProfile(profile);
    await setActiveProfile(profile.uuid);

    renderWithProviders();

    // Wait for async profile loading
    await waitFor(() => {
      const profileInput = screen.getByLabelText('Profil-ID') as HTMLInputElement;
      expect(profileInput.value).toBe('profil-1');
    });

    const labelInput = screen.getByLabelText('Gebärden-Name');
    await user.clear(labelInput);
    await user.type(labelInput, 'HALLO');

    uploadMock.mockResolvedValue({ id: 'bundle-123', status: 'accepted' });

    await user.click(screen.getByRole('button', { name: /Aufnahme abschicken/i }));

    await waitFor(() => {
      expect(screen.getByText(/Upload abgeschlossen\. Vielen Dank für die neue Gebärde!/i)).toBeInTheDocument();
    });
  }, TEST_TIMEOUT);

  it('zeigt Fehlermeldung nach fehlgeschlagenem Upload an', async () => {
    const user = userEvent.setup();
    const profile = await createProfile({ displayName: 'Test Profil', profileId: 'profil-1' });
    await addProfile(profile);
    await setActiveProfile(profile.uuid);

    renderWithProviders();

    // Wait for async profile loading
    await waitFor(() => {
      const profileInput = screen.getByLabelText('Profil-ID') as HTMLInputElement;
      expect(profileInput.value).toBe('profil-1');
    });

    const labelInput = screen.getByLabelText('Gebärden-Name');
    await user.clear(labelInput);
    await user.type(labelInput, 'FEHLER');

    uploadMock.mockRejectedValue(new Error('Netzwerkfehler'));

    await user.click(screen.getByRole('button', { name: /Aufnahme abschicken/i }));

    await waitFor(() => {
      expect(screen.getByText(/Upload fehlgeschlagen: Netzwerkfehler/i)).toBeInTheDocument();
    });
  }, TEST_TIMEOUT);

  it('zeigt Trainings-Fehlermeldung sauber an', async () => {
    const profile = await createProfile({ displayName: 'Test Profil', profileId: 'profil-1' });
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
});
