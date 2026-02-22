import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CorrectionPanel } from './CorrectionPanel';

const recordSignMock = vi.fn();

vi.mock('../hooks/useAppState', () => ({
  useAppState: () => ({ recordSign: recordSignMock }),
}));

describe('CorrectionPanel', () => {
  it('zeigt Hinweis wenn keine Gebärde erkannt wurde', () => {
    render(<CorrectionPanel recognizedSign={null} />);
    expect(screen.getByText(/Warte auf erkannte Gebärde/)).toBeInTheDocument();
  });

  it('korrigiert eine Gebärde und ruft Callback auf', async () => {
    const user = userEvent.setup();
    const onCorrection = vi.fn();

    render(<CorrectionPanel recognizedSign="essen" onCorrection={onCorrection} />);

    await user.click(screen.getByRole('button', { name: /War das falsch\? Korrigieren/ }));
    await user.click(screen.getByRole('button', { name: 'Trinken' }));
    await user.click(screen.getByRole('button', { name: 'Korrektur übernehmen' }));

    expect(recordSignMock).toHaveBeenCalledWith('trinken');
    expect(onCorrection).toHaveBeenCalledWith('essen', 'trinken');
    expect(screen.getByText(/Korrektur gespeichert/)).toBeInTheDocument();
  });

  it('unterstützt forceOpen + onDismiss', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();

    render(<CorrectionPanel recognizedSign="rot" forceOpen onDismiss={onDismiss} />);

    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
