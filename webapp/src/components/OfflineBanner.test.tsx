import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import OfflineBanner from './OfflineBanner';

describe('OfflineBanner', () => {
  it('zeigt kein Banner wenn visible explizit false ist', () => {
    render(<OfflineBanner visible={false} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('zeigt das Banner wenn visible explizit true ist', () => {
    render(<OfflineBanner visible />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Offline-Modus')).toBeInTheDocument();
  });
});
