import { screen } from '@testing-library/dom';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TrainingRecorder } from './TrainingRecorder';
import type { SignLanguageStatus } from '../hooks/useSignLanguageDetector';

const startMock = vi.fn();

type TrainingState = {
  state: 'idle' | 'recording';
  recordedData: {
    frames: unknown[];
    stillImage: string | null;
    frameCount: number;
    clipFile: File | null;
    clipSizeBytes: number;
    clipDurationMs: number;
    clipError: string | null;
  };
  startRecording: ReturnType<typeof vi.fn>;
  stopRecording: ReturnType<typeof vi.fn>;
  resetRecording: ReturnType<typeof vi.fn>;
  framesCaptured: number;
  clipLimitExceeded: boolean;
  maxClipBytes: number;
  previewLandmarks: unknown[];
  previewHandedness: string[];
  previewPoseLandmarks: number[][];
  previewFaceLandmarks: number[][];
  lastFrameReceivedAt: number | null;
};

const createTrainingState = (): TrainingState => ({
  state: 'idle',
  recordedData: {
    frames: [],
    stillImage: null,
    frameCount: 0,
    clipFile: null,
    clipSizeBytes: 0,
    clipDurationMs: 0,
    clipError: null,
  },
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
  resetRecording: vi.fn(),
  framesCaptured: 0,
  clipLimitExceeded: false,
  maxClipBytes: 1024 * 1024,
  previewLandmarks: [],
  previewHandedness: [],
  previewPoseLandmarks: [],
  previewFaceLandmarks: [],
  lastFrameReceivedAt: null,
});

let gestureState: { status: SignLanguageStatus } = { status: 'idle' };
let trainingState: TrainingState = createTrainingState();

vi.mock('../hooks/useSignLanguageDetector', () => ({
  useSignLanguageDetector: () => ({
    start: startMock,
    stop: vi.fn(),
    cleanup: vi.fn(),
    status: gestureState.status,
    error: null,
    lastSign: null,
    lastLandmarks: [],
    lastHandedness: [],
    lastConfidence: null,
    messageLog: [],
  }),
}));

vi.mock('../hooks/useTrainingRecorder', () => ({
  useTrainingRecorder: () => trainingState,
}));

describe('TrainingRecorder', () => {
  beforeEach(() => {
    gestureState = { status: 'idle' };
    startMock.mockReset().mockResolvedValue(true);
    trainingState = createTrainingState();

    // Mock camera support
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [],
          getVideoTracks: () => [],
        }),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hält das Overlay montiert und blendet es nur via CSS aus', async () => {
    const user = userEvent.setup();
    render(<TrainingRecorder profileId="p1" label="TEST" onRecordingComplete={vi.fn()} />);

    const overlay = screen.getByTestId('overlay-canvas');

    const toggle = screen.getByLabelText('Overlay anzeigen');
    await user.click(toggle);

    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveClass('overlay-hidden');
  });

  it('toggles between raw video and skeleton view', async () => {
    const user = userEvent.setup();
    render(<TrainingRecorder profileId="p1" label="TEST" onRecordingComplete={vi.fn()} />);

    const video = screen.getByTestId('training-video');
    expect(video).not.toHaveClass('video-hidden');

    const toggle = screen.getByLabelText('Rohvideo anzeigen');
    await user.click(toggle);

    expect(video).toHaveClass('video-hidden');
  });

  it('deaktiviert den Start bei laufender Initialisierung', () => {
    gestureState.status = 'initializing';
    render(<TrainingRecorder profileId="p1" label="TEST" onRecordingComplete={vi.fn()} />);

    const startButton = screen.getByRole('button', { name: 'Aufnahme starten' });
    expect(startButton).toBeDisabled();
  });

  it('zeigt einen einzigen Statuschip im HUD', () => {
    render(<TrainingRecorder profileId="p1" label="TEST" onRecordingComplete={vi.fn()} />);

    const chips = screen.getAllByTestId('status-chip');
    expect(chips.length).toBe(1);
  });

  it('fragt nicht-blockierend nach Bestätigung für das Auto-Frame', async () => {
    const user = userEvent.setup();
    trainingState.recordedData = {
      ...trainingState.recordedData,
      frames: [{}],
      stillImage: 'data:image/jpeg;base64,abc',
    };

    render(<TrainingRecorder profileId="p1" label="TEST" onRecordingComplete={vi.fn()} />);

    const useRecording = screen.getByRole('button', { name: 'Aufnahme verwenden' });
    await user.click(useRecording);

    expect(
      screen.getByText('Kein Referenzbild ausgewählt. Möchtest du das letzte Videoframe als Referenz nutzen?'),
    ).toBeInTheDocument();
  });

  it('zeigt Fotovorschau-Modus im HUD an', async () => {
    const user = userEvent.setup();
    gestureState.status = 'idle';
    render(<TrainingRecorder profileId="p1" label="TEST" onRecordingComplete={vi.fn()} />);

    const photoButton = screen.getByRole('button', { name: 'Foto mit Kamera' });
    await user.click(photoButton);

    expect(screen.getByText('Fotovorschau aktiv')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Foto aufnehmen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument();
  });

  it('zeigt Kamera-Wechsel-Button im HUD an', () => {
    render(<TrainingRecorder profileId="p1" label="TEST" onRecordingComplete={vi.fn()} />);

    const switchButton = screen.getByRole('button', { name: /Rückkamera|Frontkamera/ });
    expect(switchButton).toBeInTheDocument();
  });

  it('wechselt zwischen Front- und Rückkamera', async () => {
    const user = userEvent.setup();
    gestureState.status = 'running';
    render(<TrainingRecorder profileId="p1" label="TEST" onRecordingComplete={vi.fn()} />);

    const switchButton = screen.getByRole('button', { name: /🔄 Rückkamera/ });
    expect(switchButton).toBeInTheDocument();

    await user.click(switchButton);

    // After clicking, the button text should change
    const switchButtonAfter = screen.getByRole('button', { name: /🔄 Frontkamera/ });
    expect(switchButtonAfter).toBeInTheDocument();
  });

  it('behält das manuell gewählte Foto beim Start der Aufnahme bei', async () => {
    const user = userEvent.setup();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:manual-still');

    render(<TrainingRecorder profileId="profil-1" label="winken" onRecordingComplete={vi.fn()} />);

    const fileInput = screen.getByLabelText('Eigenes Referenzbild hochladen (optional)');
    const manualFile = new File(['inhalt'], 'referenz.jpg', { type: 'image/jpeg' });

    await user.upload(fileInput, manualFile);

    expect(await screen.findByAltText('Hochgeladenes Referenzbild')).toBeInTheDocument();

    const startButton = screen.getByRole('button', { name: 'Aufnahme starten' });
    await user.click(startButton);

    expect(trainingState.startRecording).toHaveBeenCalled();
    expect(screen.getByAltText('Hochgeladenes Referenzbild')).toBeInTheDocument();
  });
});
