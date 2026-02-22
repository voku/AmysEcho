import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChangePasswordForm } from './ChangePasswordForm';

vi.mock('../hooks/useApiConfig', () => ({
  useApiConfig: () => ({ apiBaseUrl: 'http://localhost:5000', apiToken: null }),
}));

describe('ChangePasswordForm', () => {
  it('zeigt Validierungsnachricht ohne Anmeldung', async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />);

    await user.click(screen.getByRole('button', { name: 'Passwort ändern' }));
    expect(screen.getByText('Bitte melde dich an, um dein Passwort zu ändern.')).toBeInTheDocument();
  });
});
