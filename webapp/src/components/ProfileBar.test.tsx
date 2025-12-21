import { render, screen, fireEvent } from '@testing-library/react';
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

  it('shows default value for profile', () => {
    renderWithProviders(<ProfileBar />);

    const profileInput = screen.getByLabelText('Profil-ID') as HTMLInputElement;

    expect(profileInput.value).toBe('web-demo');
  });

  it('updates profile ID when typing', () => {
    renderWithProviders(<ProfileBar />);

    const profileInput = screen.getByLabelText('Profil-ID') as HTMLInputElement;
    fireEvent.change(profileInput, { target: { value: 'new-profile' } });

    expect(profileInput.value).toBe('new-profile');
  });

  it('shows "Profil bereit" status when no gestures recognized', () => {
    renderWithProviders(<ProfileBar />);

    expect(screen.getByText('Profil bereit')).toBeInTheDocument();
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
