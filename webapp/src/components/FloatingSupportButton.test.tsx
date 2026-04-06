import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { FloatingSupportButton } from './FloatingSupportButton';

describe('FloatingSupportButton', () => {
  it('renders the caregiver link with the correct label and href', () => {
    render(
      <MemoryRouter>
        <FloatingSupportButton />
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', {
      name: 'Betreuungsbereich mit Profilen, Hilfe und Wartung öffnen',
    });

    expect(link).toHaveAttribute('href', '/betreuung');
    expect(screen.getByText('Betreuung')).toBeInTheDocument();
  });
});
