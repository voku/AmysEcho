import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ParentalGate } from './ParentalGate';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useSearchParams: () => [new URLSearchParams('target=/admin')],
  };
});

describe('ParentalGate', () => {
  it('navigiert bei korrekter Antwort zum Ziel', async () => {
    const user = userEvent.setup();
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0); // 2 × 2

    try {
      render(<ParentalGate />);
      await user.type(screen.getByLabelText('Antwort auf Elternprüfung'), '4');
      await user.click(screen.getByRole('button', { name: 'Bestätigen' }));

      expect(navigateMock).toHaveBeenCalledWith('/admin');
    } finally {
      randomSpy.mockRestore();
    }
  });
});
