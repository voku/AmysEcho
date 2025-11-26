import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { TrainingUploadWithRecording } from './TrainingUpload';
import { ApiConfigProvider } from '../hooks/useApiConfig';
import { AppStateProvider } from '../hooks/useAppState';

const uploadMock = vi.fn();
const syncQueuedMock = vi.fn();

vi.mock('../hooks/useTrainingUploader', () => ({
  useTrainingUploader: () => ({
    upload: uploadMock,
    state: 'idle',
    lastResult: null,
    error: null,
    queuedCount: 0,
    syncQueued: syncQueuedMock,
    syncing: false,
    syncError: null,
    lastQueuedKey: null,
    trainingJob: null,
    trainingJobError: null,
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
    <ApiConfigProvider>
      <AppStateProvider>
        <TrainingUploadWithRecording />
      </AppStateProvider>
    </ApiConfigProvider>,
  );
}

describe('TrainingUploadWithRecording', () => {
  beforeEach(() => {
    uploadMock.mockReset();
    syncQueuedMock.mockReset();
    uploadMock.mockResolvedValue({});
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('blockiert Uploads, wenn Profil oder Label fehlen', async () => {
    const user = userEvent.setup();
    renderWithProviders();

    const profileInput = screen.getByLabelText('Profil-ID');
    const labelInput = screen.getByLabelText('Gestenlabel');

    await user.clear(profileInput);
    await user.clear(labelInput);

    await user.click(screen.getByRole('button', { name: /Aufnahme abschicken/i }));

    expect(uploadMock).not.toHaveBeenCalled();
    const validationMessages = screen.getAllByText(
      'Bitte trage Profil-ID und Gestenlabel ein, bevor du eine Aufnahme startest oder hochlädst.',
    );
    expect(validationMessages.length).toBeGreaterThan(0);
  });

  it('übermittelt Aufnahmen nur mit gefüllter Profil-ID und Label', async () => {
    const user = userEvent.setup();
    renderWithProviders();

    const profileInput = screen.getByLabelText('Profil-ID');
    const labelInput = screen.getByLabelText('Gestenlabel');

    await user.clear(profileInput);
    await user.clear(labelInput);
    await user.type(profileInput, 'profil-1');
    await user.type(labelInput, 'NEUES-LABEL');

    await user.click(screen.getByRole('button', { name: /Aufnahme abschicken/i }));

    expect(uploadMock).toHaveBeenCalledTimes(1);
    const payload = uploadMock.mock.calls[0][0];
    expect(payload.profileId).toBe('profil-1');
    expect(payload.label).toBe('NEUES-LABEL');
  });
});
