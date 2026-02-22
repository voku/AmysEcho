import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProfileSelect } from './ProfileSelect';

describe('ProfileSelect', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('zeigt Hinweis und Onboarding-Link wenn kein Profil aktiv ist', () => {
    render(
      <MemoryRouter>
        <ProfileSelect />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Kein Profil gefunden/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Profil anlegen' })).toHaveAttribute('href', '/onboarding');
  });
});
