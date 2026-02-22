import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Settings } from './Settings';

vi.mock('../hooks/useAppState', () => ({
  useAppState: () => ({
    profileId: 'amy-1',
    displayName: 'Amy',
  }),
}));

vi.mock('./UserSettings', () => ({
  UserSettings: () => <div>Benutzereinstellungen Platzhalter</div>,
}));

describe('Settings', () => {
  it('shows profile details and navigation to profile management', () => {
    render(
      <BrowserRouter>
        <Settings />
      </BrowserRouter>,
    );

    expect(screen.getByText('Profil & Konfiguration')).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === 'Aktuelles Profil: Amy')).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === 'Profil-ID: amy-1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Profile verwalten' })).toHaveAttribute('href', '/profile');
  });

  it('shows data-management actions', () => {
    render(
      <BrowserRouter>
        <Settings />
      </BrowserRouter>,
    );

    expect(screen.getByRole('button', { name: 'Daten exportieren' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alle Daten löschen' })).toBeInTheDocument();
  });
});
