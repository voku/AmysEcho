import { renderHook, waitFor } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { describe, expect, it, beforeEach } from 'vitest';
import { AUTH_KEY } from '../constants/auth';
import { ApiConfigProvider, useApiConfig } from './useApiConfig';
import { useAppStatus } from './useAppStatus';

const ONBOARDING_KEY = 'webapp:onboarding-complete';

function ApiConfigHarness({ children, persistToken }: { children: ReactNode; persistToken?: boolean }) {
  const { setPersistToken } = useApiConfig();

  useEffect(() => {
    if (typeof persistToken === 'boolean') {
      setPersistToken(persistToken);
    }
  }, [persistToken, setPersistToken]);

  return <>{children}</>;
}

describe('useAppStatus', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('bleibt im Demo-Flow ohne Token, wenn persistToken deaktiviert ist', async () => {
    window.localStorage.setItem(AUTH_KEY, 'true');
    window.localStorage.setItem(ONBOARDING_KEY, 'false');

    const { result } = renderHook(() => useAppStatus(), {
      wrapper: ({ children }) => (
        <ApiConfigProvider>
          <ApiConfigHarness persistToken={false}>{children}</ApiConfigHarness>
        </ApiConfigProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current.status).toBe('hero');
    });
  });

  it('wechselt zu Auth zurück, wenn persistente Tokens fehlen', async () => {
    window.localStorage.setItem(AUTH_KEY, 'true');
    window.localStorage.setItem(ONBOARDING_KEY, 'true');

    const { result } = renderHook(() => useAppStatus(), {
      wrapper: ({ children }) => (
        <ApiConfigProvider>
          <ApiConfigHarness persistToken={true}>{children}</ApiConfigHarness>
        </ApiConfigProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current.status).toBe('auth');
    });
  });
});
