import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Celebration, { CELEBRATION_DURATION_MS } from './Celebration';

describe('Celebration', () => {
  it('zeigt benutzerdefinierte Nachricht und ruft onComplete nach Ablauf auf', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();

    try {
      render(<Celebration message="Super!" onComplete={onComplete} />);
      expect(screen.getByText('Super!')).toBeInTheDocument();

      vi.advanceTimersByTime(CELEBRATION_DURATION_MS);
      expect(onComplete).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
