import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
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

    expect(screen.getByText('Aktives Profil verwalten')).toBeInTheDocument();
    expect(screen.getByLabelText('Profil-ID')).toBeInTheDocument();
    expect(screen.getByLabelText('Standard-Gestenlabel')).toBeInTheDocument();
  });

  it('shows default values for profile and label', () => {
    renderWithProviders(<ProfileBar />);

    const profileInput = screen.getByLabelText('Profil-ID') as HTMLInputElement;
    const labelInput = screen.getByLabelText('Standard-Gestenlabel') as HTMLInputElement;

    expect(profileInput.value).toBe('web-demo');
    expect(labelInput.value).toBe('HILFE');
  });

  it('updates profile ID when typing', () => {
    renderWithProviders(<ProfileBar />);

    const profileInput = screen.getByLabelText('Profil-ID') as HTMLInputElement;
    fireEvent.change(profileInput, { target: { value: 'new-profile' } });

    expect(profileInput.value).toBe('new-profile');
  });

  it('updates gesture label when typing', () => {
    renderWithProviders(<ProfileBar />);

    const labelInput = screen.getByLabelText('Standard-Gestenlabel') as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: 'DANKE' } });

    expect(labelInput.value).toBe('DANKE');
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
