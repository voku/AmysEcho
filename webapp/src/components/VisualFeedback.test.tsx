import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GestureRecognitionFeedback, VisualFeedback } from './VisualFeedback';

describe('VisualFeedback', () => {
  it('rendert Nachricht, Subtext und Konfidenzanzeige', () => {
    render(
      <VisualFeedback
        type="success"
        active
        message="Erkannt"
        subMessage="Weiter so"
        confidence={0.82}
        duration={0}
      />,
    );

    expect(screen.getByRole('status', { name: 'Erkannt' })).toBeInTheDocument();
    expect(screen.getByText('Weiter so')).toBeInTheDocument();
    expect(screen.getByText('82%')).toBeInTheDocument();
  });

  it('ruft onHide nach Ablauf der Dauer auf', () => {
    vi.useFakeTimers();
    const onHide = vi.fn();

    try {
      render(<VisualFeedback type="info" active message="Hinweis" duration={10} onHide={onHide} />);
      vi.advanceTimersByTime(310);
      expect(onHide).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('zeigt Gestenerkennungs-Feedback mit Gestenlabel', () => {
    render(<GestureRecognitionFeedback gesture="Essen" confidence={0.9} isActive />);
    expect(screen.getByRole('status', { name: 'Essen' })).toBeInTheDocument();
  });
});
