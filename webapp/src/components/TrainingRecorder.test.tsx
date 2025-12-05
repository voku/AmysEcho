import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrainingRecorder } from './TrainingRecorder';
import type { GestureStatus } from '../hooks/useGestureDetector';

const gestureState: { status: GestureStatus } = { status: 'idle' };

const startMock = vi.fn();

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
    lastFrameReceivedAt: null,
  }),
}));

describe('TrainingRecorder', () => {
  beforeEach(() => {
    gestureState.status = 'idle';
    startMock.mockReset().mockResolvedValue(true);
  });

  it('hält das Overlay montiert und blendet es nur via CSS aus', async () => {
    const user = userEvent.setup();
    render(<TrainingRecorder profileId="p1" label="TEST" onRecordingComplete={vi.fn()} />);

    const overlay = document.querySelector('canvas.overlay');
    expect(overlay).toBeInTheDocument();

    const toggle = screen.getByLabelText('Overlay anzeigen');
    await user.click(toggle);

    const overlayAfterToggle = document.querySelector('canvas.overlay');
    expect(overlayAfterToggle).toBeInTheDocument();
    expect(overlayAfterToggle).toHaveClass('overlay-hidden');
  });

  it('deaktiviert den Start bei laufender Initialisierung', () => {
    gestureState.status = 'initializing';
    render(<TrainingRecorder profileId="p1" label="TEST" onRecordingComplete={vi.fn()} />);

    const startButton = screen.getByRole('button', { name: 'Aufnahme starten' });
    expect(startButton).toBeDisabled();
  });

  it('zeigt einen einzigen Statuschip im HUD', () => {
    render(<TrainingRecorder profileId="p1" label="TEST" onRecordingComplete={vi.fn()} />);

    const chips = document.querySelectorAll('.status-chip');
    expect(chips.length).toBe(1);
  });
});
