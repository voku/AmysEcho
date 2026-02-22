import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Onboarding } from './Onboarding';
import { ONBOARDING_KEY } from '../constants/auth';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

describe('Onboarding', () => {
  it('speichert Onboarding-Flag und navigiert zur Profilerstellung', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();

    render(<Onboarding onComplete={onComplete} />);
    await user.click(screen.getByRole('button', { name: 'Profil erstellen' }));

    expect(localStorage.getItem(ONBOARDING_KEY)).toBe('true');
    expect(navigateMock).toHaveBeenCalledWith('/profile');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
