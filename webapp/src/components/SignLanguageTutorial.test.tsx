import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { SignLanguageTutorial } from './SignLanguageTutorial';

describe('SignLanguageTutorial', () => {
  it('zeigt Tutorial-Schritte und CTA-Links', () => {
    render(
      <MemoryRouter>
        <SignLanguageTutorial />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'So funktioniert die Gebärdenerkennung' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '🎯 Jetzt ausprobieren' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: '📚 Training starten' })).toHaveAttribute('href', '/training');
  });
});
