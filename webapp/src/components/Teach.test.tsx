import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Teach } from './Teach';

describe('Teach', () => {
  it('renders instructions and navigation links', () => {
    render(
      <MemoryRouter>
        <Teach />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Neue Gebärde beibringen' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Neue Gebärde hinzufügen' })).toHaveAttribute('href', '/training');
    expect(screen.getByRole('link', { name: 'Zurück zum Lernbereich' })).toHaveAttribute('href', '/lernen');
  });
});
