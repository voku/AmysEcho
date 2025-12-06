import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';

import { TrainingRecorder } from './TrainingRecorder';

const startRecordingMock = vi.fn();
const stopRecordingMock = vi.fn();
const resetRecordingMock = vi.fn();

vi.mock('../hooks/useGestureDetector', () => ({
  useGestureDetector: () => ({
    start: vi.fn().mockResolvedValue(true),
    stop: vi.fn(),
    status: 'running',
    error: '',
    lastLandmarks: [],
  }),
}));

vi.mock('../hooks/useTrainingRecorder', () => ({
  useTrainingRecorder: () => ({
    state: 'idle',
    recordedData: {
      frames: [],
      clipSizeBytes: 0,
      clipDurationMs: 0,
      clipFile: null,
      stillImage: null,
      clipError: null,
    },
    startRecording: startRecordingMock,
    stopRecording: stopRecordingMock,
    resetRecording: resetRecordingMock,
    framesCaptured: 0,
    clipLimitExceeded: false,
    maxClipBytes: 1024 * 1024,
    previewLandmarks: [],
    previewHandedness: [],
    lastFrameReceivedAt: null,
  }),
}));

describe('TrainingRecorder', () => {
  beforeAll(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:manual-still');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    (global as any).navigator.mediaDevices = {
      getUserMedia: vi.fn(),
    };
  });

  afterEach(() => {
    startRecordingMock.mockClear();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('behält das manuell gewählte Foto beim Start der Aufnahme bei', async () => {
    render(
      <TrainingRecorder profileId="profil-1" label="winken" onRecordingComplete={vi.fn()} />,
    );

    const fileInput = screen.getByLabelText('Eigenes Referenzbild hochladen (optional)');
    const manualFile = new File(['inhalt'], 'referenz.jpg', { type: 'image/jpeg' });

    fireEvent.change(fileInput, { target: { files: [manualFile] } });

    expect(await screen.findByAltText('Hochgeladenes Referenzbild')).toBeInTheDocument();

    const startButton = screen.getByRole('button', { name: 'Aufnahme starten' });
    fireEvent.click(startButton);

    expect(startRecordingMock).toHaveBeenCalled();
    expect(screen.getByAltText('Hochgeladenes Referenzbild')).toBeInTheDocument();
  });
});
