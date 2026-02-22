import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProgressTracker } from './ProgressTracker';

const mockUseAppState = vi.fn();
vi.mock('../hooks/useAppState', () => ({
  useAppState: () => mockUseAppState(),
}));

describe('ProgressTracker', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('zeigt Statistiken aus Speicher und gelernte Gebärden', () => {
    mockUseAppState.mockReturnValue({ profileId: 'amy', recentSigns: [] });
    localStorage.setItem(
      'webapp:progress:amy',
      JSON.stringify({
        totalGestures: 9,
        uniqueGestures: 2,
        sessionsCount: 3,
        gestureStats: [
          { label: 'essen', count: 4, lastUsed: null },
          { label: 'trinken', count: 1, lastUsed: null },
        ],
      }),
    );

    render(<ProgressTracker />);

    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('⏳ In Arbeit')).toBeInTheDocument();
    expect(screen.getByText('✓ Gelernt')).toBeInTheDocument();
    expect(screen.getByText('Essen')).toBeInTheDocument();
  });
});
