import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { CaregiverReport } from './CaregiverReport';

describe('CaregiverReport', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('zeigt Profilname und zusammengefasste Lernwerte aus Speicherdaten', () => {
    localStorage.setItem('amysecho_active_profile', JSON.stringify({ name: 'Amy' }));
    localStorage.setItem(
      'amysecho_progress',
      JSON.stringify({
        essen: { successRate: 0.9, totalAttempts: 10 },
        trinken: { successRate: 0.8, totalAttempts: 5 },
      }),
    );

    render(
      <MemoryRouter>
        <CaregiverReport />
      </MemoryRouter>,
    );

    expect(screen.getByText('Bericht für:')).toBeInTheDocument();
    expect(screen.getByText('Amy')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
  });
});
