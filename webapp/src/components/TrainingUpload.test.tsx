import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { TrainingUploadWithRecording } from './TrainingUpload';

const uploadMock = vi.fn();
const syncQueuedMock = vi.fn();
const setPreferredSignMock = vi.fn();
let profileIdMock: string | null = '11111111-1111-4111-8111-111111111111';
let preferredSignIdMock = '';
let lastResultMock: any = null;
let trainingJobMock: any = null;
let modelMetaMock: any = { source: 'profile', version: 'p-1' };

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
    lastResult: lastResultMock,
    state: 'idle',
    trainingJob: trainingJobMock,
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
  useMlpModelInjection: () => ({
    notice: null,
    status: 'ready',
    lastMeta: modelMetaMock,
    refreshModel: vi.fn().mockResolvedValue(undefined),
  }),
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
  TrainingRecorder: ({ onRecordingComplete }: { onRecordingComplete: (payload: unknown) => void }) => (
    <button type="button" onClick={() => onRecordingComplete({ profileId: 'p', label: 'hilfe', frames: [] })}>
      Aufnahme abschicken (Test)
    </button>
  ),
}));

beforeEach(() => {
  profileIdMock = '11111111-1111-4111-8111-111111111111';
  preferredSignIdMock = '';
  lastResultMock = null;
  trainingJobMock = null;
  modelMetaMock = { source: 'profile', version: 'p-1' };
  vi.clearAllMocks();
});

describe('TrainingUpload', () => {
  it('shows validation when no gesture is selected', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TrainingUploadWithRecording />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /Aufnahme abschicken/ }));
    expect(screen.getByText('Bitte wähle ein Profil und eine Gebärde aus, bevor du eine Aufnahme startest oder hochlädst.', { selector: 'div.notice.error' })).toBeInTheDocument();
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
    expect(screen.getByText('Bitte wähle ein Profil und eine Gebärde aus, bevor du eine Aufnahme startest oder hochlädst.', { selector: 'div.notice.error' })).toBeInTheDocument();
  });

  it('syncs queue and shows result message', async () => {
    profileIdMock = '11111111-1111-4111-8111-111111111111';
    preferredSignIdMock = 'hilfe';
    syncQueuedMock.mockResolvedValue({ uploaded: 1, remaining: 0, blocked: 0, blockedAuth: 0, blockedRetryLimit: 0 });
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

  it('shows retry-pause message when bundles hit the automatic retry limit', async () => {
    profileIdMock = '11111111-1111-4111-8111-111111111111';
    preferredSignIdMock = 'hilfe';
    syncQueuedMock.mockResolvedValue({ uploaded: 0, remaining: 1, blocked: 1, blockedAuth: 0, blockedRetryLimit: 1 });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TrainingUploadWithRecording />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Jetzt synchronisieren' }));

    await waitFor(() => {
      expect(syncQueuedMock).toHaveBeenCalled();
      expect(
        screen.getByText(
          '1 Paket(e) pausieren nach mehreren Fehlversuchen. Bitte prüfe die Verbindung und starte sie bei Bedarf manuell erneut.',
        ),
      ).toBeInTheDocument();
    });
  });

  it('shows active model source and sparse label readiness from the training report', async () => {
    preferredSignIdMock = 'hilfe';
    modelMetaMock = { source: 'global', version: 'g-7' };
    lastResultMock = {
      id: 'bundle-1',
      status: 'completed',
    };
    trainingJobMock = {
      jobId: 'job-1',
      status: 'completed',
      report: {
        profiles: {
          '11111111-1111-4111-8111-111111111111': {
            label_diagnostics: [
              {
                label: 'satt',
                bundle_count: 2,
                rejected_bundle_count: 1,
                window_count: 6,
                prototype_count: 2,
                train_group_count: 1,
                validation_group_count: 1,
                confusion_scope: 'validation',
                top_confusions: [{ label: 'trinken', count: 2 }],
              },
            ],
          },
        },
      },
    };

    render(
      <MemoryRouter>
        <TrainingUploadWithRecording />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Aktive Modellquelle: Globales Ersatzmodell/)).toBeInTheDocument();
    expect(screen.getByText(/Für dieses Profil läuft die Erkennung derzeit auf dem globalen Ersatzmodell/)).toBeInTheDocument();
    expect(screen.getByText(/Label-Bereitschaft/)).toBeInTheDocument();
    expect(screen.getByText(/satt/)).toBeInTheDocument();
    expect(screen.getByText(/Mehr saubere Aufnahmen empfohlen/)).toBeInTheDocument();
  });

  it('does not fall back to global label diagnostics inside a profile training result', async () => {
    preferredSignIdMock = 'hilfe';
    lastResultMock = {
      id: 'bundle-2',
      status: 'completed',
    };
    trainingJobMock = {
      jobId: 'job-2',
      status: 'completed',
      report: {
        global: {
          label_diagnostics: [
            {
              label: 'global-only',
              bundle_count: 4,
              rejected_bundle_count: 0,
              window_count: 12,
              prototype_count: 3,
              train_group_count: 3,
              validation_group_count: 1,
              confusion_scope: 'validation',
              top_confusions: [],
            },
          ],
        },
        profiles: {},
      },
    };

    render(
      <MemoryRouter>
        <TrainingUploadWithRecording />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Für dieses Profil liegen noch keine profilbezogenen Label-Diagnosen vor/)).toBeInTheDocument();
    expect(screen.queryByText('global-only')).not.toBeInTheDocument();
    expect(screen.queryByText(/Label-Bereitschaft/)).not.toBeInTheDocument();
  });

  it('warns when a label has no independent validation bundle yet', async () => {
    preferredSignIdMock = 'hilfe';
    lastResultMock = {
      id: 'bundle-3',
      status: 'completed',
    };
    trainingJobMock = {
      jobId: 'job-3',
      status: 'completed',
      report: {
        profiles: {
          '11111111-1111-4111-8111-111111111111': {
            label_diagnostics: [
              {
                label: 'mehr',
                bundle_count: 2,
                rejected_bundle_count: 0,
                window_count: 5,
                prototype_count: 2,
                train_group_count: 2,
                validation_group_count: 0,
                confusion_scope: 'none',
                top_confusions: [],
              },
            ],
          },
        },
      },
    };

    render(
      <MemoryRouter>
        <TrainingUploadWithRecording />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Noch ohne unabhängige Prüfung/)).toBeInTheDocument();
    expect(screen.getByText(/Mindestens zwei unterschiedliche Aufnahmen helfen/)).toBeInTheDocument();
  });
});
