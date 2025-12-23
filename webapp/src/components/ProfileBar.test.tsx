import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it, beforeEach } from 'vitest';
import { ProfileBar } from './ProfileBar';
import { AppStateProvider } from '../hooks/useAppState';

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <AppStateProvider>{ui}</AppStateProvider>
    </BrowserRouter>
  );
};

describe('ProfileBar', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders profile configuration section', () => {
    renderWithProviders(<ProfileBar />);

    expect(screen.getByText('Aktives Profil')).toBeInTheDocument();
    expect(screen.getByLabelText('Profil-ID')).toBeInTheDocument();
  });

  it('shows empty default value for profile when none active', () => {
    renderWithProviders(<ProfileBar />);

    const profileInput = screen.getByLabelText('Profil-ID') as HTMLInputElement;

    expect(profileInput.value).toBe('');
  });

  it('has read-only profile ID field', () => {
    renderWithProviders(<ProfileBar />);

    const profileInput = screen.getByLabelText('Profil-ID') as HTMLInputElement;
    expect(profileInput).toHaveAttribute('readOnly');
  });

  it('shows "Bereit" status when no gestures recognized', () => {
    renderWithProviders(<ProfileBar />);

    expect(screen.getByText('Bereit')).toBeInTheDocument();
  });

  it('shows empty gesture list message when no gestures recorded', () => {
    renderWithProviders(<ProfileBar />);

    expect(screen.getByText('Noch keine Erkennung erfasst.')).toBeInTheDocument();
  });

  it('has link to training page', () => {
    renderWithProviders(<ProfileBar />);

    const trainingLink = screen.getByText('Weiter zum Training');
    expect(trainingLink).toHaveAttribute('href', '/training');
  });

  it('has correct aria-label on profile ID field', () => {
    renderWithProviders(<ProfileBar />);

    const profileInput = screen.getByLabelText('Profil-ID');
    expect(profileInput).toHaveAttribute('id', 'profile-id');
  });
});
