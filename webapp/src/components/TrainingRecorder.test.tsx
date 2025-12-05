import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrainingRecorder } from './TrainingRecorder';
import type { GestureStatus } from '../hooks/useGestureDetector';

const gestureState: { status: GestureStatus } = { status: 'idle' };

const startMock = vi.fn();
const trainingState = {
  state: 'idle' as const,
  recordedData: {
    frames: [] as unknown[],
    stillImage: null as string | null,
    frameCount: 0,
    clipFile: null as File | null,
    clipSizeBytes: 0,
    clipDurationMs: 0,
    clipError: null as string | null,
  },
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
  resetRecording: vi.fn(),
  framesCaptured: 0,
  clipLimitExceeded: false,
  maxClipBytes: 1024 * 1024,
  previewLandmarks: [] as unknown[],
  previewHandedness: [] as string[],
  lastFrameReceivedAt: null as number | null,
};

vi.mock('../hooks/useGestureDetector', () => ({
  useGestureDetector: () => ({
    start: startMock,
    stop: vi.fn(),
    cleanup: vi.fn(),
    status: gestureState.status,
    error: null,
    lastGesture: null,
    lastLandmarks: [],
    lastHandedness: [],
    lastConfidence: null,
    messageLog: [],
  }),
}));

vi.mock('../hooks/useTrainingRecorder', () => ({
  useTrainingRecorder: () => ({
    ...trainingState,
  }),
}));

describe('TrainingRecorder', () => {
  beforeEach(() => {
    gestureState.status = 'idle';
    startMock.mockReset().mockResolvedValue(true);
    Object.assign(trainingState, {
      state: 'idle' as const,
      recordedData: {
        frames: [],
        stillImage: null,
        frameCount: 0,
        clipFile: null,
        clipSizeBytes: 0,
        clipDurationMs: 0,
        clipError: null,
      },
      framesCaptured: 0,
      clipLimitExceeded: false,
      previewLandmarks: [],
      previewHandedness: [],
      lastFrameReceivedAt: null,
    });
    trainingState.startRecording.mockReset();
    trainingState.stopRecording.mockReset();
    trainingState.resetRecording.mockReset();
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
});
