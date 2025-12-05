import { render, screen } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { BottomNav } from './BottomNav';

describe('BottomNav', () => {
  it('renders all navigation items', () => {
    render(
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <BottomNav />
      </BrowserRouter>
    );

    expect(screen.getByText('Zuhören')).toBeInTheDocument();
    expect(screen.getByText('Lernen')).toBeInTheDocument();
    expect(screen.getByText('Info')).toBeInTheDocument();
  });

  it('has navigation role with proper aria-label', () => {
    render(
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <BottomNav />
      </BrowserRouter>
    );

    const nav = screen.getByRole('navigation');
    expect(nav).toHaveAttribute('aria-label', 'Hauptnavigation');
  });

  it('marks home route as active by default', () => {
    render(
      <MemoryRouter initialEntries={['/']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <BottomNav />
      </MemoryRouter>
    );

    const homeLink = screen.getByText('Zuhören').closest('a');
    expect(homeLink).toHaveClass('active');
  });

  it('marks training route as active when on /training', () => {
    render(
      <MemoryRouter initialEntries={['/training']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <BottomNav />
      </MemoryRouter>
    );

    const trainingLink = screen.getByText('Lernen').closest('a');
    expect(trainingLink).toHaveClass('active');
  });

  it('marks info route as active when on /funktionen', () => {
    render(
      <MemoryRouter initialEntries={['/funktionen']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <BottomNav />
      </MemoryRouter>
    );

    const infoLink = screen.getByText('Info').closest('a');
    expect(infoLink).toHaveClass('active');
  });

  it('renders SVG icons for each navigation item', () => {
    render(
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <BottomNav />
      </BrowserRouter>
    );

    const svgElements = document.querySelectorAll('svg');
    expect(svgElements.length).toBe(3);
  });

  it('has correct links to all routes', () => {
    render(
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <BottomNav />
      </BrowserRouter>
    );

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute('href', '/');
    expect(links[1]).toHaveAttribute('href', '/training');
    expect(links[2]).toHaveAttribute('href', '/funktionen');
  });
});
