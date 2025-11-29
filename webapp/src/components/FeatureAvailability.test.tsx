import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FeatureAvailability } from './FeatureAvailability';

describe('FeatureAvailability', () => {
  it('renders the feature availability section', () => {
    render(<FeatureAvailability />);

    expect(screen.getByText('Web-spezifische Grenzen')).toBeInTheDocument();
    expect(screen.getByText('Leitplanken')).toBeInTheDocument();
  });

  it('lists all core features', () => {
    render(<FeatureAvailability />);

    expect(screen.getByText('Sicherer Speicher')).toBeInTheDocument();
    expect(screen.getByText('Haptisches Feedback')).toBeInTheDocument();
    expect(screen.getByText('Kamera')).toBeInTheDocument();
    expect(screen.getByText('Datei-Downloads')).toBeInTheDocument();
  });

  it('shows feature descriptions', () => {
    render(<FeatureAvailability />);

    expect(
      screen.getByText(/SecureStore steht im Browser nicht zur Verfügung/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Vibration steht nur auf einigen Endgeräten zur Verfügung/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Kamera-Zugriff ist erforderlich/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Das Teilen von Clips wird im Web auf einfache Downloads beschränkt/)
    ).toBeInTheDocument();
  });

  it('marks SecureStore as always unavailable', () => {
    render(<FeatureAvailability />);

    const secureStoreItem = screen.getByText('Sicherer Speicher').closest('li');
    expect(secureStoreItem).toHaveClass('disabled');
  });

  it('correctly detects haptic feedback availability', () => {
    render(<FeatureAvailability />);

    const hapticsItem = screen.getByText('Haptisches Feedback').closest('li');
    // In jsdom, navigator.vibrate is not available, so this should be disabled
    expect(hapticsItem).toHaveClass('disabled');
  });

  it('uses pill badges to indicate feature status', () => {
    render(<FeatureAvailability />);

    const pills = document.querySelectorAll('.pill');
    expect(pills.length).toBeGreaterThan(0);

    // At least SecureStore should have pill-off class
    const disabledPills = document.querySelectorAll('.pill-off');
    expect(disabledPills.length).toBeGreaterThan(0);
  });
});
