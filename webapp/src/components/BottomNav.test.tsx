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
    expect(screen.getByText('Betreuung')).toBeInTheDocument();
    expect(screen.getByText('Lernen')).toBeInTheDocument();
    expect(screen.getByText('Symbole')).toBeInTheDocument();
    expect(screen.getByText('Hilfe')).toBeInTheDocument();
  });

  it('has navigation role', () => {
    render(
      <BrowserRouter>
        <BottomNav />
      </BrowserRouter>
    );

    const nav = screen.getByRole('navigation', { name: 'Hauptnavigation' });
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

  it('marks verlauf route as active when on /verlauf', () => {
    render(
      <MemoryRouter initialEntries={['/verlauf']}>
        <BottomNav />
      </MemoryRouter>
    );

    const verlaufLink = screen.getByText('Verlauf').closest('a');
    expect(verlaufLink).toHaveClass('active');
  });

  it('marks symbole route as active when on /symbole', () => {
    render(
      <MemoryRouter initialEntries={['/symbole']}>
        <BottomNav />
      </MemoryRouter>
    );

    const symboleLink = screen.getByText('Symbole').closest('a');
    expect(symboleLink).toHaveClass('active');
  });

  it('renders emoji icons for each navigation item', () => {
    render(
      <BrowserRouter>
        <BottomNav />
      </BrowserRouter>
    );

    // Check that icon spans are rendered
    const iconElements = document.querySelectorAll('.bottom-nav-icon');
    expect(iconElements.length).toBe(6);
  });

  it('has correct links to all routes', () => {
    render(
      <BrowserRouter>
        <BottomNav />
      </BrowserRouter>
    );

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(6);
    expect(links[0]).toHaveAttribute('href', '/');
    expect(links[1]).toHaveAttribute('href', '/verlauf');
    expect(links[2]).toHaveAttribute('href', '/betreuung');
    expect(links[3]).toHaveAttribute('href', '/lernen');
    expect(links[4]).toHaveAttribute('href', '/symbole');
    expect(links[5]).toHaveAttribute('href', '/hilfe');
  });
});
