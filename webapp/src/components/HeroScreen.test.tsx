import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HeroScreen } from './HeroScreen';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

describe('HeroScreen', () => {
  it('navigiert zur Kamera und triggert onStart', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();

    render(<HeroScreen onStart={onStart} />);
    await user.click(screen.getByRole('button', { name: '🖐️ Zur Gebärdenkamera' }));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/');
  });
});
