import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { TrainingUploadWithRecording } from './TrainingUpload';

const uploadMock = vi.fn();
const syncQueuedMock = vi.fn();
const setPreferredSignMock = vi.fn();
let profileIdMock: string | null = '11111111-1111-4111-8111-111111111111';
let preferredSignIdMock = '';

vi.mock('../hooks/useApiConfig', () => ({
  useApiConfig: () => ({
    apiBaseUrl: 'http://localhost:5000',
    apiToken: 'token-1',
    refreshToken: 'refresh-1',
    uploadEndpoint: 'http://localhost:5000/api/v1/dgs/sample-bundles',
    refreshAccessToken: vi.fn(),
  }),
}));

vi.mock('../hooks/useTrainingUploader', () => ({
  isAuthFailureReason: () => false,
  useTrainingUploader: () => ({
    upload: uploadMock,
    lastResult: null,
    state: 'idle',
    trainingJob: null,
    error: null,
    syncError: null,
    trainingJobError: null,
    queuedCount: 1,
    queuedBundles: [{ key: 'q1', status: 'queued' }],
    syncing: false,
    lastQueuedKey: 'q1',
    syncQueued: syncQueuedMock,
    syncBundle: vi.fn(),
    removeBundle: vi.fn(),
  }),
}));

vi.mock('../hooks/useAppState', () => ({
  useAppState: () => ({
    setPreferredSign: setPreferredSignMock,
    preferredSignId: preferredSignIdMock,
    profileId: profileIdMock,
    profileMetadata: { vocabularySet: 'basis' },
  }),
}));

vi.mock('../hooks/useMlpModelInjection', () => ({
  useMlpModelInjection: () => ({ notice: null, refreshModel: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock('../hooks/useMetacomBundle', () => ({
  useMetacomBundle: () => ({ symbols: [] }),
}));

vi.mock('../context/SymbolStore', () => ({
  useSymbolStore: () => ({
    symbols: [{ id: 'hilfe', name: 'Hilfe', category: 'basis' }],
    syncError: null,
    refresh: vi.fn(),
    loading: false,
  }),
}));

vi.mock('../training/trainingBundle', () => ({
  fetchTrainingQualityLog: vi.fn().mockResolvedValue([]),
}));

vi.mock('./TrainingRecorder', () => ({
  TrainingRecorder: ({ onRecordingComplete }: { onRecordingComplete: (payload: any) => void }) => (
    <button type="button" onClick={() => onRecordingComplete({ profileId: 'p', label: 'hilfe', frames: [] })}>
      Aufnahme abschicken (Test)
    </button>
  ),
}));

describe('TrainingUpload', () => {
  it('shows validation when no gesture is selected', async () => {
    profileIdMock = '11111111-1111-4111-8111-111111111111';
    preferredSignIdMock = '';
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TrainingUploadWithRecording />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /Aufnahme abschicken/ }));
    expect(screen.getAllByText('Bitte wähle zuerst ein Profil und eine Gebärde aus, bevor du eine Aufnahme startest.').length).toBeGreaterThan(0);
  });

  it('shows validation when account is authenticated but profile is missing', async () => {
    profileIdMock = null;
    preferredSignIdMock = 'hilfe';
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TrainingUploadWithRecording />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /Aufnahme abschicken/ }));
    expect(screen.getAllByText('Bitte wähle zuerst ein Profil und eine Gebärde aus, bevor du eine Aufnahme startest.').length).toBeGreaterThan(0);
  });

  it('syncs queue and shows result message', async () => {
    profileIdMock = '11111111-1111-4111-8111-111111111111';
    preferredSignIdMock = 'hilfe';
    syncQueuedMock.mockResolvedValue({ uploaded: 1, remaining: 0, blocked: 0 });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TrainingUploadWithRecording />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Jetzt synchronisieren' }));

    await waitFor(() => {
      expect(syncQueuedMock).toHaveBeenCalled();
      expect(screen.getByText('Synchronisierung abgeschlossen (1 Paket(e) übertragen).')).toBeInTheDocument();
    });
  });
});
