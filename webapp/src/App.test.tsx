import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { describe, expect, it, beforeEach } from 'vitest';
import { ApiConfigProvider, useApiConfig } from './hooks/useApiConfig';
import { useAppStatus } from './App';

type HarnessHandles = { expire: () => void };

type HarnessProps = { handles: React.MutableRefObject<HarnessHandles | null> };

function StatusHarness({ handles }: HarnessProps) {
  const { status } = useAppStatus();
  const { setTokens, setPersistToken } = useApiConfig();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    setPersistToken(true);
    setTokens({ accessToken: 'token', refreshToken: 'refresh' });
    handles.current = {
      expire: () => setTokens({ accessToken: '', refreshToken: '' }),
    };
  }, [handles, setPersistToken, setTokens]);

  return <div data-testid="status" data-status={status} />;
}

describe('useAppStatus session handling', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem('webapp:auth-complete', 'true');
    window.localStorage.setItem('webapp:onboarding-complete', 'true');
  });

  it('setzt den Status bei abgelaufener Sitzung zurück auf Auth', async () => {
    const handles: { current: HarnessHandles | null } = { current: null };

    render(
      <ApiConfigProvider>
        <StatusHarness handles={handles} />
      </ApiConfigProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').dataset.status).toBe('app');
    });

    act(() => {
      handles.current?.expire();
    });

    await waitFor(() => {
      expect(screen.getByTestId('status').dataset.status).toBe('auth');
    });
    expect(window.localStorage.getItem('webapp:auth-complete')).toBe('false');
  });
});
