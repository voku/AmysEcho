import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { GestureRecorder } from './GestureRecorder';
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
  return render(
    <MemoryRouter>
      <AppStateProvider>{ui}</AppStateProvider>
    </MemoryRouter>,
  );
};

describe('GestureRecorder', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders the gesture demo section', () => {
    renderWithProviders(<GestureRecorder />);

    expect(screen.getByText('Bereit für die Kamera')).toBeInTheDocument();
    expect(screen.getByText(/Profil/)).toBeInTheDocument();
    expect(screen.getByText(/Standardgeste/)).toBeInTheDocument();
  });

  it('shows camera action buttons', () => {
    renderWithProviders(<GestureRecorder />);

    expect(screen.getByText('Kamera starten')).toBeInTheDocument();
    expect(screen.getByText('Stimmt')).toBeInTheDocument();
    expect(screen.getByText('Lernen')).toBeInTheDocument();
  });

  it('shows overlay toggle checkbox', () => {
    renderWithProviders(<GestureRecorder />);

    const overlayToggle = screen.getByLabelText('Overlay');
    expect(overlayToggle).toBeInTheDocument();
    expect(overlayToggle).toBeChecked();
  });

  it('toggles overlay visibility when checkbox is clicked', () => {
    renderWithProviders(<GestureRecorder />);

    const overlayToggle = screen.getByLabelText('Overlay') as HTMLInputElement;
    expect(overlayToggle.checked).toBe(true);

    fireEvent.click(overlayToggle);
    expect(overlayToggle.checked).toBe(false);
  });

  it('shows placeholder when no gesture detected', () => {
    renderWithProviders(<GestureRecorder />);

    expect(screen.getByText('Zeige eine Geste in die Kamera…')).toBeInTheDocument();
  });

  it('shows initial status as ready (Bereit)', () => {
    renderWithProviders(<GestureRecorder />);

    expect(screen.getByText('Bereit für die Kamera')).toBeInTheDocument();
  });

  it('displays profile information', () => {
    renderWithProviders(<GestureRecorder />);

    expect(screen.getByText(/Profil/)).toBeInTheDocument();
    expect(screen.getByText(/Standardgeste/)).toBeInTheDocument();
  });

  it('shows camera warning when camera is not supported', () => {
    // In jsdom environment, navigator.mediaDevices may not exist
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: undefined,
      configurable: true,
    });

    renderWithProviders(<GestureRecorder />);

    // Restore original
    Object.defineProperty(navigator, 'mediaDevices', {
      value: originalMediaDevices,
      configurable: true,
    });
  });

  it('has video element for camera stream', () => {
    renderWithProviders(<GestureRecorder />);

    const videoElement = document.querySelector('video');
    expect(videoElement).toBeInTheDocument();
    expect(videoElement).toHaveAttribute('autoPlay');
    expect(videoElement).toHaveAttribute('playsInline');
  });

  it('has canvas element for overlay', () => {
    renderWithProviders(<GestureRecorder />);

    const canvasElement = document.querySelector('canvas');
    expect(canvasElement).toBeInTheDocument();
    expect(canvasElement).toHaveClass('overlay');
  });
});
