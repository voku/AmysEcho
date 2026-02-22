import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LoadingIndicator from './LoadingIndicator';

describe('LoadingIndicator', () => {
  it('zeigt den Standardtext und den Status-Rollencontainer', () => {
    render(<LoadingIndicator />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Wird geladen...')).toBeInTheDocument();
  });

  it('rendert einen benutzerdefinierten Text', () => {
    render(<LoadingIndicator label="Bitte warten" fullscreen={false} size="small" />);

    expect(screen.getByText('Bitte warten')).toBeInTheDocument();
  });
});
