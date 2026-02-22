import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileManager } from './ProfileManager';

const navigateMock = vi.fn();
const alertMock = vi.fn();

const profileRegistryMocks = vi.hoisted(() => ({
  listProfiles: vi.fn(),
  getActiveProfile: vi.fn(),
  setActiveProfile: vi.fn(),
  createProfile: vi.fn(),
  addProfile: vi.fn(),
  deleteProfile: vi.fn(),
  initializeProfileRegistry: vi.fn(),
  syncProfileToServer: vi.fn(),
  syncAllProfilesToServer: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
  useNavigate: () => navigateMock,
}));

vi.mock('../hooks/useApiConfig', () => ({
  useApiConfig: () => ({ apiToken: 'token-1' }),
}));

vi.mock('../services/profileRegistry', () => profileRegistryMocks);

describe('ProfileManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('alert', alertMock);
    vi.stubGlobal('confirm', vi.fn(() => true));

    profileRegistryMocks.initializeProfileRegistry.mockResolvedValue(undefined);
    profileRegistryMocks.syncAllProfilesToServer.mockResolvedValue(undefined);
    profileRegistryMocks.syncProfileToServer.mockResolvedValue(undefined);
  });

  it('zeigt bestehende Profile und aktiviert ein Profil', async () => {
    const profile = { uuid: 'p1', displayName: 'Amy', metadata: { avatar: '🦊', childAge: 6 } };
    profileRegistryMocks.listProfiles.mockResolvedValue([profile]);
    profileRegistryMocks.getActiveProfile.mockResolvedValue(profile);
    profileRegistryMocks.setActiveProfile.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<ProfileManager />);

    expect(await screen.findByText("Wer nutzt Amy's Echo gerade?")).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /Amy/i })[0]!);

    await waitFor(() => {
      expect(profileRegistryMocks.setActiveProfile).toHaveBeenCalledWith('p1');
      expect(navigateMock).toHaveBeenCalledWith('/');
    });
  });

  it('erstellt ein neues Profil und validiert leeren Namen', async () => {
    profileRegistryMocks.listProfiles.mockResolvedValue([]);
    profileRegistryMocks.getActiveProfile.mockResolvedValue(null);
    profileRegistryMocks.createProfile.mockResolvedValue({
      uuid: 'p2',
      displayName: 'Nora',
      metadata: { avatar: '👤', vocabularySet: 'basis' },
    });
    profileRegistryMocks.addProfile.mockResolvedValue(undefined);
    profileRegistryMocks.setActiveProfile.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<ProfileManager />);

    await screen.findByText('Willkommen!');
    await user.click(screen.getByRole('button', { name: 'Profil erstellen' }));
    expect(alertMock).toHaveBeenCalledWith('Bitte gib einen Namen für das Profil ein.');

    await user.type(screen.getByLabelText('Name des Kindes'), 'Nora');
    await user.type(screen.getByLabelText('Alter (optional)'), '5');
    await user.click(screen.getByRole('button', { name: 'Profil erstellen' }));

    await waitFor(() => {
      expect(profileRegistryMocks.createProfile).toHaveBeenCalledWith({
        displayName: 'Nora',
        metadata: { avatar: '👤', vocabularySet: 'basis', childAge: 5 },
      });
      expect(profileRegistryMocks.addProfile).toHaveBeenCalled();
      expect(profileRegistryMocks.setActiveProfile).toHaveBeenCalledWith('p2');
    });
  });
});
