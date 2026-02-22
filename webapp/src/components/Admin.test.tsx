import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Admin } from './Admin';

vi.mock('../hooks/useApiConfig', () => ({
  useApiConfig: () => ({ apiBaseUrl: 'http://localhost:5000', apiToken: '' }),
}));

vi.mock('../context/MessageContext', () => ({
  useMessage: () => ({
    showToast: vi.fn(),
    showConfirmDialog: vi.fn().mockResolvedValue(true),
  }),
}));

vi.mock('../context/SymbolStore', () => ({
  useSymbolStore: () => ({
    symbols: [
      { id: 'global-essen', name: 'Essen', category: 'food' },
      { id: 'profile-essen', name: ' essen ', category: 'food', profileId: 'amy' },
    ],
    saveSymbol: vi.fn(),
    removeSymbol: vi.fn(),
    refresh: vi.fn(),
    syncError: null,
    loading: false,
    lastSyncedAt: null,
  }),
}));

vi.mock('../services/backupService', () => ({
  backupService: {
    createBackup: vi.fn(),
    restoreBackup: vi.fn(),
  },
}));

vi.mock('../services/metacomBundleService', () => ({
  clearMetacomBundle: vi.fn(),
  storeMetacomBundle: vi.fn(),
}));

describe('Admin', () => {
  it('renders admin tools and symbol management', () => {
    render(
      <MemoryRouter>
        <Admin />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /Adminbereich/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Backend-Token speichern/i })).toBeInTheDocument();
  });

  it('shows duplicate symbol names only once in Symbolsammlung', () => {
    render(
      <MemoryRouter>
        <Admin />
      </MemoryRouter>,
    );

    expect(screen.getAllByText(/essen/i)).toHaveLength(1);
  });
});
