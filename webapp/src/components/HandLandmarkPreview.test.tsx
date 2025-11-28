import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HandLandmarkPreview } from './HandLandmarkPreview';

const SINGLE_HAND: number[][][] = [
  Array.from({ length: 21 }, (_, index) => [0.1 + index / 30, 0.1 + index / 40, 0]) as number[][],
];

const TWO_HANDS: number[][][] = [
  Array.from({ length: 21 }, (_, index) => [0.1 + index / 30, 0.1 + index / 40, 0]) as number[][],
  Array.from({ length: 21 }, (_, index) => [0.9 - index / 30, 0.1 + index / 40, 0]) as number[][],
];

describe('HandLandmarkPreview', () => {
  it('renders fallback when no landmarks are provided', () => {
    render(<HandLandmarkPreview landmarks={[]} />);
    expect(screen.getByText('Hände werden gesucht…')).toBeInTheDocument();
  });

  it('renders header with confidence badge', () => {
    render(<HandLandmarkPreview landmarks={SINGLE_HAND} confidence={0.75} />);
    expect(screen.getByText('Sicherheit: 75%')).toBeInTheDocument();
  });

  it('renders SVG with hand landmarks when data is provided', () => {
    const { container } = render(
      <HandLandmarkPreview landmarks={TWO_HANDS} handedness={['Left', 'Right']} />,
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();

    // Should have two hand groups
    const groups = svg?.querySelectorAll('g');
    expect(groups?.length).toBe(2);
  });

  it('mirrors the preview when mirror flag is set', () => {
    const { container } = render(
      <HandLandmarkPreview landmarks={SINGLE_HAND} mirror handedness={['Right']} />,
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();

    // Mirroring should transform x coordinates: x' = 1 - x
    // First landmark is at x = 0.1, so mirrored should be at 0.9
    const circles = svg?.querySelectorAll('circle');
    expect(circles?.length).toBeGreaterThan(0);
    const firstCircle = circles?.[0];
    expect(firstCircle).toHaveAttribute('cx');
    const cx = parseFloat(firstCircle?.getAttribute('cx') ?? '0');
    expect(cx).toBeCloseTo(0.9, 1);
  });

  it('falls back to investigation copy when confidence is invalid', () => {
    render(<HandLandmarkPreview landmarks={SINGLE_HAND} confidence={Number.NaN} />);
    expect(screen.getByText('Sicherheit: wird ermittelt…')).toBeInTheDocument();
  });

  it('rounds sanitized confidence to a percentage', () => {
    render(<HandLandmarkPreview landmarks={SINGLE_HAND} confidence={0.424} />);
    expect(screen.getByText('Sicherheit: 42%')).toBeInTheDocument();
  });

  it('clamps confidence values above 1', () => {
    render(<HandLandmarkPreview landmarks={SINGLE_HAND} confidence={1.5} />);
    expect(screen.getByText('Sicherheit: 100%')).toBeInTheDocument();
  });

  it('clamps negative confidence values to 0', () => {
    render(<HandLandmarkPreview landmarks={SINGLE_HAND} confidence={-0.5} />);
    expect(screen.getByText('Sicherheit: 0%')).toBeInTheDocument();
  });

  it('shows default title when none provided', () => {
    render(<HandLandmarkPreview landmarks={SINGLE_HAND} />);
    expect(screen.getByText('Hand-Landmarks')).toBeInTheDocument();
  });

  it('shows custom title when provided', () => {
    render(<HandLandmarkPreview landmarks={SINGLE_HAND} title="Live-Vorschau" />);
    expect(screen.getByText('Live-Vorschau')).toBeInTheDocument();
  });

  it('uses dashed lines for left hand', () => {
    const { container } = render(
      <HandLandmarkPreview landmarks={SINGLE_HAND} handedness={['Left']} />,
    );

    const lines = container.querySelectorAll('line');
    expect(lines.length).toBeGreaterThan(0);
    // Left hands should have stroke-dasharray set
    const dashedLine = Array.from(lines).find((line) => line.getAttribute('stroke-dasharray'));
    expect(dashedLine).toBeInTheDocument();
  });
});
