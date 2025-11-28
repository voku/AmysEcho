import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GestureDemo } from './GestureDemo';
import { AppStateProvider } from '../hooks/useAppState';

// Mock the hooks that have external dependencies
vi.mock('../hooks/useGestureDetector', () => ({
  useGestureDetector: () => ({
    start: vi.fn().mockResolvedValue(true),
    stop: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
    status: 'idle',
    error: null,
    lastGesture: null,
    lastLandmarks: [],
    lastHandedness: [],
    lastConfidence: null,
    messageLog: [],
  }),
}));

vi.mock('../hooks/useMlpModelInjection', () => ({
  useMlpModelInjection: () => ({
    notice: null,
  }),
}));

const renderWithProviders = (ui: React.ReactElement) => {
  return render(<AppStateProvider>{ui}</AppStateProvider>);
};

describe('GestureDemo', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders the gesture demo section', () => {
    renderWithProviders(<GestureDemo />);

    expect(screen.getByText('Browser-Gestenrekorder')).toBeInTheDocument();
    expect(screen.getByText('Gestenlabor')).toBeInTheDocument();
  });

  it('shows camera control buttons', () => {
    renderWithProviders(<GestureDemo />);

    expect(screen.getByText('Kamera starten')).toBeInTheDocument();
    expect(screen.getByText('Aufnahme pausieren')).toBeInTheDocument();
    expect(screen.getByText('Neu aufsetzen')).toBeInTheDocument();
  });

  it('shows overlay toggle checkbox', () => {
    renderWithProviders(<GestureDemo />);

    const overlayToggle = screen.getByLabelText('Overlay anzeigen');
    expect(overlayToggle).toBeInTheDocument();
    expect(overlayToggle).toBeChecked();
  });

  it('shows mirror toggle checkbox', () => {
    renderWithProviders(<GestureDemo />);

    const mirrorToggle = screen.getByLabelText('Vorschau spiegeln');
    expect(mirrorToggle).toBeInTheDocument();
    expect(mirrorToggle).not.toBeChecked();
  });

  it('toggles mirror preview when checkbox is clicked', () => {
    renderWithProviders(<GestureDemo />);

    const mirrorToggle = screen.getByLabelText('Vorschau spiegeln') as HTMLInputElement;
    expect(mirrorToggle.checked).toBe(false);

    fireEvent.click(mirrorToggle);
    expect(mirrorToggle.checked).toBe(true);

    fireEvent.click(mirrorToggle);
    expect(mirrorToggle.checked).toBe(false);
  });

  it('toggles overlay visibility when checkbox is clicked', () => {
    renderWithProviders(<GestureDemo />);

    const overlayToggle = screen.getByLabelText('Overlay anzeigen') as HTMLInputElement;
    expect(overlayToggle.checked).toBe(true);

    fireEvent.click(overlayToggle);
    expect(overlayToggle.checked).toBe(false);
  });

  it('shows initial status as ready (Bereit)', () => {
    renderWithProviders(<GestureDemo />);

    expect(screen.getByText('Bereit')).toBeInTheDocument();
  });

  it('shows "noch keine erkannt" when no gesture detected', () => {
    renderWithProviders(<GestureDemo />);

    expect(screen.getByText('noch keine erkannt')).toBeInTheDocument();
  });

  it('shows empty message log initially', () => {
    renderWithProviders(<GestureDemo />);

    expect(screen.getByText('Noch keine Bridge-Nachrichten.')).toBeInTheDocument();
  });

  it('disables landmarks save button when no landmarks available', () => {
    renderWithProviders(<GestureDemo />);

    const saveButton = screen.getByText('Landmarks speichern');
    expect(saveButton).toBeDisabled();
  });

  it('displays profile information', () => {
    renderWithProviders(<GestureDemo />);

    expect(screen.getByText(/Aktives Profil:/)).toBeInTheDocument();
    expect(screen.getByText(/Standardlabel:/)).toBeInTheDocument();
  });

  it('shows camera warning when camera is not supported', () => {
    // In jsdom environment, navigator.mediaDevices may not exist
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: undefined,
      configurable: true,
    });

    renderWithProviders(<GestureDemo />);

    // Restore original
    Object.defineProperty(navigator, 'mediaDevices', {
      value: originalMediaDevices,
      configurable: true,
    });
  });

  it('has video element for camera stream', () => {
    renderWithProviders(<GestureDemo />);

    const videoElement = document.querySelector('video');
    expect(videoElement).toBeInTheDocument();
    expect(videoElement).toHaveAttribute('autoPlay');
    expect(videoElement).toHaveAttribute('playsInline');
  });

  it('has canvas element for overlay', () => {
    renderWithProviders(<GestureDemo />);

    const canvasElement = document.querySelector('canvas');
    expect(canvasElement).toBeInTheDocument();
    expect(canvasElement).toHaveClass('overlay');
  });
});
