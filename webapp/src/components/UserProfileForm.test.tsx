import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UserProfileForm } from './UserProfileForm';

vi.mock('../hooks/useApiConfig', () => ({
  useApiConfig: () => ({ apiBaseUrl: 'http://localhost:5000', apiToken: null }),
}));

describe('UserProfileForm', () => {
  it('fordert Anmeldung vor dem Speichern', async () => {
    const user = userEvent.setup();
    render(<UserProfileForm initialDisplayName="Amy" />);

    await user.click(screen.getByRole('button', { name: 'Profil speichern' }));
    expect(screen.getByText('Bitte melde dich an, um dein Profil zu bearbeiten.')).toBeInTheDocument();
  });
});
