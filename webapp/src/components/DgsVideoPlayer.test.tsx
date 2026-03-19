import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DgsVideoPlayer } from './DgsVideoPlayer';

// Mock HTMLMediaElement methods that jsdom doesn't implement
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});

describe('DgsVideoPlayer', () => {
  const defaultProps = {
    src: '/test-video.mp4',
    title: 'Test Gebärde',
  };

  it('renders the video element without native controls', () => {
    render(<DgsVideoPlayer {...defaultProps} />);
    const video = screen.getByLabelText('Test Gebärde');
    expect(video).toBeInTheDocument();
    expect(video.tagName).toBe('VIDEO');
    // Native controls should never be shown
    expect(video).not.toHaveAttribute('controls');
  });

  it('has nodownload in controlsList to prevent downloads', () => {
    render(<DgsVideoPlayer {...defaultProps} />);
    const video = screen.getByLabelText('Test Gebärde');
    expect(video.getAttribute('controlslist')).toContain('nodownload');
  });

  it('has disablePictureInPicture to keep kids focused', () => {
    render(<DgsVideoPlayer {...defaultProps} />);
    const video = screen.getByLabelText('Test Gebärde');
    expect(video).toHaveAttribute('disablepictureinpicture');
  });

  it('renders kid-friendly control buttons', () => {
    render(<DgsVideoPlayer {...defaultProps} />);
    // Play/pause button exists (container + control button both have the label)
    const playButtons = screen.getAllByRole('button', { name: 'Abspielen' });
    expect(playButtons).toHaveLength(2); // container div + primary button
    // Restart button
    expect(screen.getByRole('button', { name: 'Neustart' })).toBeInTheDocument();
  });

  it('renders emoji speed presets (turtle, rabbit, leopard)', () => {
    render(<DgsVideoPlayer {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Langsam' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Normal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schnell' })).toBeInTheDocument();
  });

  it('shows big play overlay when video is not playing', () => {
    render(<DgsVideoPlayer {...defaultProps} />);
    // Trigger loadeddata to move past loading state
    const video = screen.getByLabelText('Test Gebärde');
    fireEvent.loadedData(video);
    // The overlay should contain the play button visual
    const overlay = document.querySelector('.dgs-play-overlay');
    expect(overlay).toBeInTheDocument();
  });

  it('renders progress bar with range input', () => {
    render(<DgsVideoPlayer {...defaultProps} />);
    expect(screen.getByRole('slider', { name: 'Videoposition' })).toBeInTheDocument();
  });

  it('clicking play control button works', () => {
    render(<DgsVideoPlayer {...defaultProps} />);
    // Find both play buttons (container + primary control) and click the actual button
    const playButtons = screen.getAllByRole('button', { name: 'Abspielen' });
    const primaryBtn = playButtons.find((btn) => btn.tagName === 'BUTTON');
    expect(primaryBtn).toBeTruthy();
    fireEvent.click(primaryBtn!);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it('renders accessibility description', () => {
    render(<DgsVideoPlayer {...defaultProps} />);
    const srText = screen.getByText(/Video pausiert: Test Gebärde/);
    expect(srText).toBeInTheDocument();
  });

  it('does not render a select dropdown (too complex for kids)', () => {
    render(<DgsVideoPlayer {...defaultProps} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

});
