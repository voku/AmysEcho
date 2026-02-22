import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AboutAmysEcho } from './AboutAmysEcho';

describe('AboutAmysEcho', () => {
  it('zeigt Mission und zentrale Versprechen', () => {
    render(<AboutAmysEcho />);

    expect(screen.getByRole('heading', { name: "Amy's Echo" })).toBeInTheDocument();
    expect(screen.getByText('Unsere Mission')).toBeInTheDocument();
    expect(screen.getByText('Unsere Versprechen')).toBeInTheDocument();
    expect(screen.getByText('Keine Unterbrechung')).toBeInTheDocument();
    expect(screen.getByText('Kein Kompromiss')).toBeInTheDocument();
  });
});
