import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { SettingsOverview } from './SettingsOverview';

describe('SettingsOverview', () => {
  it('renders overview links for core caregiver destinations', () => {
    render(
      <MemoryRouter>
        <SettingsOverview />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Einstellungen/i })).toHaveAttribute('href', '/einstellungen');
    expect(screen.getByRole('link', { name: /Hilfe/i })).toHaveAttribute('href', '/hilfe');
    expect(screen.getByRole('link', { name: /Betreuung/i })).toHaveAttribute('href', '/betreuung');
    expect(screen.getByRole('link', { name: /Adminbereich/i })).toHaveAttribute('href', '/elterntor?target=/admin');
  });
});
