import { useCallback, useEffect, useState } from 'react';
import { useApiConfig } from './useApiConfig';

const AUTH_KEY = 'webapp:auth-complete';
const ONBOARDING_KEY = 'webapp:onboarding-complete';

// ========================================
// App Status Hook
// ========================================
export function useAppStatus() {
  const [status, setStatus] = useState<'loading' | 'auth' | 'hero' | 'app'>('loading');
  const { apiToken, refreshToken, isLoadingTokens } = useApiConfig();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isAuth = window.localStorage.getItem(AUTH_KEY) === 'true';
      const isOnboarded = window.localStorage.getItem(ONBOARDING_KEY) === 'true';

      if (!isAuth) {
        setStatus('auth');
      } else if (!isOnboarded) {
        setStatus('hero');
      } else {
        setStatus('app');
      }
    }
  }, []);

  const completeAuth = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(AUTH_KEY, 'true');
    }
    setStatus('hero');
  }, []);

  const completeOnboarding = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ONBOARDING_KEY, 'true');
    }
    setStatus('app');
  }, []);

  useEffect(() => {
    // Don't check tokens while they are still loading
    if (status === 'loading' || isLoadingTokens) return;

    const noActiveTokens = !apiToken && !refreshToken;
    if (noActiveTokens) {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(AUTH_KEY, 'false');
      }
      setStatus('auth');
    }
  }, [apiToken, refreshToken, status, isLoadingTokens]);

  return { status, completeAuth, completeOnboarding };
}
