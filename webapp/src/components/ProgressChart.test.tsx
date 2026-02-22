import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProgressChart } from './ProgressChart';

describe('ProgressChart', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('rendert Metriken aus gespeicherten Verlaufsdaten', () => {
    localStorage.setItem(
      'amysecho_history_essen',
      JSON.stringify([
        { date: '2026-01-01T12:00:00.000Z', successRate: 0.5, attempts: 8 },
        { date: '2026-01-02T12:00:00.000Z', successRate: 0.8, attempts: 12 },
      ]),
    );

    render(
      <MemoryRouter initialEntries={['/fortschritt?gesture=essen']}>
        <Routes>
          <Route path="/fortschritt" element={<ProgressChart />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: '📈 Fortschritt: Essen' })).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText(/Großartiger Fortschritt/)).toBeInTheDocument();
  });
});
