import { screen } from '@testing-library/dom';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TrainingRecorder } from './TrainingRecorder';
import type { SignLanguageStatus } from '../hooks/useSignLanguageDetector';

const startMock = vi.fn();
const makeHand = (offset: number) =>
  Array.from({ length: 21 }, (_, i) => [i + offset, i + offset, i + offset]);

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
    getVariationMetrics: vi.fn(),
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
      frames: [{ landmarks: [[[0.1, 0.2, 0]]], handedness: ['Left'] }],
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

  it('zeigt die Banner-Message für laufende Aufnahmen', () => {
    trainingState.state = 'recording';

    render(<TrainingRecorder profileId="p1" label="TEST" onRecordingComplete={vi.fn()} />);

    expect(
      screen.getByText('Aufnahme läuft. Tippe auf „Aufnahme stoppen“, wenn du fertig bist.'),
    ).toBeInTheDocument();
  });

  it('zeigt die Banner-Message für vorhandene Aufnahmen', () => {
    trainingState.recordedData.frames = [{ landmarks: [[[0.1, 0.2, 0]]], handedness: ['Left'] }];

    render(<TrainingRecorder profileId="p1" label="TEST" onRecordingComplete={vi.fn()} />);

    expect(
      screen.getByText('Aufnahme bereit. Prüfe sie und verwende oder verwerfe sie.'),
    ).toBeInTheDocument();
  });

  it('zeigt Qualitätswarnungen für kurze oder instabile Aufnahmen', () => {
    trainingState.recordedData.frames = [
      { landmarks: [[[0.1, 0.2, 0]]], handedness: ['Left'] },
    ];

    render(<TrainingRecorder profileId="p1" label="TEST" onRecordingComplete={vi.fn()} />);

    expect(screen.getByText(/Qualitätscheck/)).toBeInTheDocument();
    expect(screen.getByText(/Nimm etwas länger auf/)).toBeInTheDocument();
  });

  it('zeigt Qualitätswarnung bei fehlender Bewegung', () => {
    const stillFrame = { landmarks: [[[0.1, 0.2, 0]]], handedness: ['Left'] };
    trainingState.recordedData.frames = Array.from({ length: 15 }, () => stillFrame);

    render(<TrainingRecorder profileId="p1" label="TEST" onRecordingComplete={vi.fn()} />);

    expect(screen.getByText(/Qualitätscheck/)).toBeInTheDocument();
    expect(screen.getByText(/Bewege Finger und Hand deutlich/)).toBeInTheDocument();
  });

  it('vereinfacht die Handauswahl auf drei klare Optionen', () => {
    render(<TrainingRecorder profileId="p1" label="TEST" onRecordingComplete={vi.fn()} />);

    expect(screen.getByLabelText('Beide Hände zusammen')).toBeInTheDocument();
    expect(screen.getByLabelText('Nur Haupthand')).toBeInTheDocument();
    expect(screen.getByLabelText('Egal links oder rechts')).toBeInTheDocument();
    expect(screen.queryByLabelText('Beide unterschiedlich')).not.toBeInTheDocument();
  });

  it('verwendet die vereinfachte Auswahl beim Speichern der Aufnahme', async () => {
    const user = userEvent.setup();
    const onRecordingComplete = vi.fn();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:manual-still');
    trainingState.recordedData.frames = [{ landmarks: [[[0.1, 0.2, 0]]], handedness: ['Left'] }];

    render(<TrainingRecorder profileId="profil-1" label="winken" onRecordingComplete={onRecordingComplete} />);

    await user.click(screen.getByLabelText('Egal links oder rechts'));
    expect(
      screen.getByText('Links/Rechts-Varianten werden für das Training automatisch gespiegelt, damit wenige Aufnahmen besser genutzt werden.'),
    ).toBeInTheDocument();

    const fileInput = screen.getByLabelText('Eigenes Referenzbild hochladen (optional)');
    const manualFile = new File(['inhalt'], 'referenz.jpg', { type: 'image/jpeg' });
    await user.upload(fileInput, manualFile);
    await user.click(screen.getByRole('button', { name: 'Aufnahme verwenden' }));

    expect(onRecordingComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        handFocus: 'either_hand',
      }),
    );
  });

  it('lässt keine alte Handsuggestion in die nächste kurze Aufnahme hineinlaufen', async () => {
    const user = userEvent.setup();
    const onRecordingComplete = vi.fn();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:manual-still');

    trainingState.state = 'recording';
    trainingState.recordedData.frames = [
      { landmarks: [makeHand(0), makeHand(100)], handedness: ['Left', 'Right'] },
      { landmarks: [makeHand(1), makeHand(102)], handedness: ['Left', 'Right'] },
      { landmarks: [makeHand(2), makeHand(104)], handedness: ['Left', 'Right'] },
    ];

    const { rerender } = render(
      <TrainingRecorder profileId="profil-1" label="winken" onRecordingComplete={onRecordingComplete} />,
    );

    await user.click(screen.getByRole('button', { name: 'Aufnahme stoppen' }));

    trainingState.state = 'idle';
    rerender(<TrainingRecorder profileId="profil-1" label="winken" onRecordingComplete={onRecordingComplete} />);

    expect(screen.getByText(/Automatische Erkennung:/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Verwerfen' }));
    expect(screen.queryByText(/Automatische Erkennung:/)).not.toBeInTheDocument();

    trainingState.recordedData.frames = [
      { landmarks: [makeHand(0), makeHand(100)], handedness: ['Left', 'Right'] },
    ];
    rerender(<TrainingRecorder profileId="profil-1" label="winken" onRecordingComplete={onRecordingComplete} />);

    const fileInput = screen.getByLabelText('Eigenes Referenzbild hochladen (optional)');
    const manualFile = new File(['inhalt'], 'referenz.jpg', { type: 'image/jpeg' });
    await user.upload(fileInput, manualFile);
    await user.click(screen.getByRole('button', { name: 'Aufnahme verwenden' }));

    expect(onRecordingComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        handFocus: 'both_equal',
      }),
    );
  });

  it('setzt die Handsuggestion beim Start einer neuen Aufnahme zurück', async () => {
    const user = userEvent.setup();

    trainingState.state = 'recording';
    trainingState.recordedData.frames = [
      { landmarks: [makeHand(0), makeHand(100)], handedness: ['Left', 'Right'] },
      { landmarks: [makeHand(1), makeHand(102)], handedness: ['Left', 'Right'] },
      { landmarks: [makeHand(2), makeHand(104)], handedness: ['Left', 'Right'] },
    ];

    const { rerender } = render(<TrainingRecorder profileId="profil-1" label="winken" onRecordingComplete={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Aufnahme stoppen' }));

    trainingState.state = 'idle';
    trainingState.recordedData.frames = [];
    rerender(<TrainingRecorder profileId="profil-1" label="winken" onRecordingComplete={vi.fn()} />);

    expect(screen.getByText(/Automatische Erkennung:/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Aufnahme starten' }));

    expect(screen.queryByText(/Automatische Erkennung:/)).not.toBeInTheDocument();
  });


  it('zeigt erkannte Probleme und Tipps aus der Validierungszusammenfassung vor dem Upload', () => {
    const stillFrame = { landmarks: [[[0.1, 0.2, 0]]], handedness: ['Left'] };
    trainingState.recordedData.frames = Array.from({ length: 2 }, () => stillFrame);

    render(<TrainingRecorder profileId="p1" label="TEST" onRecordingComplete={vi.fn()} />);

    expect(screen.getByText(/Problem: Zu kurze Aufnahme/)).toBeInTheDocument();
    expect(screen.getByText(/Tipp: Nimm etwas länger auf/)).toBeInTheDocument();
  });

  it('zeigt die Banner-Message wenn die Kamera läuft', () => {
    gestureState.status = 'running';

    render(<TrainingRecorder profileId="p1" label="TEST" onRecordingComplete={vi.fn()} />);

    expect(screen.getByText('Zeige die Gebärde gut sichtbar vor der Kamera.')).toBeInTheDocument();
  });

  it('zeigt die Banner-Message wenn die Kamera noch nicht gestartet ist', () => {
    gestureState.status = 'idle';

    render(<TrainingRecorder profileId="p1" label="TEST" onRecordingComplete={vi.fn()} />);

    expect(screen.getByText('Starte die Kamera, um eine Gebärde aufzunehmen.')).toBeInTheDocument();
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
