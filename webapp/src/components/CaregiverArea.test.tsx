import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { CaregiverArea } from './CaregiverArea';

describe('CaregiverArea', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('zeigt den gespeicherten Profilnamen in der Einleitung', () => {
    localStorage.setItem('amysecho_active_profile', JSON.stringify({ name: 'Amy' }));

    render(
      <MemoryRouter>
        <CaregiverArea />
      </MemoryRouter>,
    );

    expect(screen.getByText('Amy')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '🤝 Betreuungsbereich' })).toBeInTheDocument();
  });

  it('routet geschützte Bereiche über das Elterntor', () => {
    render(
      <MemoryRouter>
        <CaregiverArea />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Adminbereich/i })).toHaveAttribute(
      'href',
      '/elterntor?target=/admin',
    );
    expect(screen.getByText('🔒 Geschützt')).toBeInTheDocument();
  });
});
