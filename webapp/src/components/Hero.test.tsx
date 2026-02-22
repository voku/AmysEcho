import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Hero } from './Hero';

describe('Hero', () => {
  it('zeigt Start-CTA und zentrale Support-Links', () => {
    render(
      <MemoryRouter>
        <Hero />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: "Willkommen bei Amy's Echo" })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zur Gebärdenkamera' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: '❓ Hilfe & FAQ' })).toHaveAttribute('href', '/hilfe');
  });
});
