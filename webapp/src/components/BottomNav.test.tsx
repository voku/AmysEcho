import { screen } from '@testing-library/dom';
import { render } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { BottomNav } from './BottomNav';

describe('BottomNav', () => {
  it('renders all navigation items', () => {
    render(
      <BrowserRouter>
        <BottomNav />
      </BrowserRouter>
    );

    expect(screen.getByText('Kamera')).toBeInTheDocument();
    expect(screen.getByText('Verlauf')).toBeInTheDocument();
    expect(screen.getByText('Lernen')).toBeInTheDocument();
    expect(screen.getByText('Tafel')).toBeInTheDocument();
    expect(screen.getByText('Einstellungen')).toBeInTheDocument();
    expect(screen.getByText('Hilfe')).toBeInTheDocument();
    expect(screen.getByText('Betreuung')).toBeInTheDocument();
  });

  it('has navigation role', () => {
    render(
      <BrowserRouter>
        <BottomNav />
      </BrowserRouter>
    );

    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
  });

  it('marks home route as active by default', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <BottomNav />
      </MemoryRouter>
    );

    const homeLink = screen.getByText('Kamera').closest('a');
    expect(homeLink).toHaveClass('active');
  });

  it('marks lernen route as active when on /lernen', () => {
    render(
      <MemoryRouter initialEntries={['/lernen']}>
        <BottomNav />
      </MemoryRouter>
    );

    const lernenLink = screen.getByText('Lernen').closest('a');
    expect(lernenLink).toHaveClass('active');
  });

  it('marks tafel route as active when on /tafel', () => {
    render(
      <MemoryRouter initialEntries={['/tafel']}>
        <BottomNav />
      </MemoryRouter>
    );

    const tafelLink = screen.getByText('Tafel').closest('a');
    expect(tafelLink).toHaveClass('active');
  });

  it('marks einstellungen route as active when on /einstellungen', () => {
    render(
      <MemoryRouter initialEntries={['/einstellungen']}>
        <BottomNav />
      </MemoryRouter>
    );

    const einstellungenLink = screen.getByText('Einstellungen').closest('a');
    expect(einstellungenLink).toHaveClass('active');
  });

  it('renders emoji icons for each navigation item', () => {
    render(
      <BrowserRouter>
        <BottomNav />
      </BrowserRouter>
    );

    // Check that icon spans are rendered
    const iconElements = document.querySelectorAll('.bottom-nav-icon');
    expect(iconElements.length).toBe(7);
  });

  it('has correct links to all routes', () => {
    render(
      <BrowserRouter>
        <BottomNav />
      </BrowserRouter>
    );

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(7);
    expect(links[0]).toHaveAttribute('href', '/');
    expect(links[1]).toHaveAttribute('href', '/verlauf');
    expect(links[2]).toHaveAttribute('href', '/lernen');
    expect(links[3]).toHaveAttribute('href', '/tafel');
    expect(links[4]).toHaveAttribute('href', '/einstellungen');
    expect(links[5]).toHaveAttribute('href', '/hilfe');
    expect(links[6]).toHaveAttribute('href', '/betreuung');
  });
});
