import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { FloatingSupportButton } from './FloatingSupportButton';

describe('FloatingSupportButton', () => {
  it('renders the overview link with the correct label and href', () => {
    render(
      <BrowserRouter>
        <FloatingSupportButton />
      </BrowserRouter>,
    );

    const link = screen.getByRole('link', {
      name: 'Übersicht für Einstellungen, Hilfe und Betreuung öffnen',
    });

    expect(link).toHaveAttribute('href', '/uebersicht');
    expect(screen.getByText('Übersicht')).toBeInTheDocument();
  });
});
