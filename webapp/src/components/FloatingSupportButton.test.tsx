import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { FloatingSupportButton } from './FloatingSupportButton';

describe('FloatingSupportButton', () => {
  it('renders the overview link with the correct label and href', () => {
    render(
      <MemoryRouter>
        <FloatingSupportButton />
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', {
      name: 'Übersicht für Einstellungen, Hilfe und Betreuung öffnen',
    });

    expect(link).toHaveAttribute('href', '/uebersicht');
    expect(screen.getByText('Übersicht')).toBeInTheDocument();
  });
});
