import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { CaregiverReport } from './CaregiverReport';

describe('CaregiverReport', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows profile name and aggregated learning metrics from stored data', () => {
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

    expect(screen.getByText(/Bericht für:/, { selector: 'p.profile-note' })).toHaveTextContent('Amy');
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
  });
});
