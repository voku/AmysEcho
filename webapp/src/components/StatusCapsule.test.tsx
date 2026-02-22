import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConnectionStatus, FeatureStatus, StatusCapsule } from './StatusCapsule';

describe('StatusCapsule', () => {
  it('zeigt Label und Standard-Statussymbol', () => {
    render(<StatusCapsule status="online" label="API" />);

    expect(screen.getByRole('status', { name: 'API: online' })).toBeInTheDocument();
    expect(screen.getByText('🟢')).toBeInTheDocument();
    expect(screen.getByText('API')).toBeInTheDocument();
  });

  it('versteckt das Label im compact-Modus', () => {
    render(<StatusCapsule status="warning" label="Mikrofon" compact />);

    expect(screen.getByRole('status', { name: 'Mikrofon: warning' })).toBeInTheDocument();
    expect(screen.queryByText('Mikrofon')).not.toBeInTheDocument();
  });

  it('ruft onClick auf wenn die Kapsel angeklickt wird', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(<StatusCapsule status="idle" label="Bereit" onClick={onClick} />);

    await user.click(screen.getByRole('status', { name: 'Bereit: idle' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('ConnectionStatus', () => {
  it('zeigt Ladezustand während der Prüfung', () => {
    render(<ConnectionStatus isConnected={false} isChecking serverName="Server" />);

    expect(screen.getByRole('status', { name: 'Verbinde...: loading' })).toBeInTheDocument();
  });
});

describe('FeatureStatus', () => {
  it('zeigt Warnstatus mit Grund wenn Feature nicht verfügbar ist', () => {
    render(<FeatureStatus featureName="Kamera" isAvailable={false} reason="Berechtigung fehlt" />);

    const capsule = screen.getByRole('status', { name: 'Kamera: warning' });
    expect(capsule).toHaveAttribute('title', 'Berechtigung fehlt');
    expect(screen.getByText('⚠️')).toBeInTheDocument();
  });
});
