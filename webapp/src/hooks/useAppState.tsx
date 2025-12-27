import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getActiveProfile, initializeProfileRegistry } from '../services/profileRegistry';

type AppStateContextValue = {
  profileUuid: string | null;
  profileId: string | null;
  displayName: string | null;
  preferredSignLabel: string;
  lastRecognizedSign: string | null;
  recentSigns: string[];
  setPreferredSignLabel: (value: string) => void;
  recordSign: (sign: string) => void;
  refreshFromRegistry: () => Promise<void>;
};

// defaultState removed - was unused and causing ESLint warning

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [profileUuid, setProfileUuid] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [preferredSignLabel, setPreferredSignLabel] = useState('HILFE');
  const [lastRecognizedSign, setLastRecognizedSign] = useState<string | null>(null);
  const [recentSigns, setRecentSigns] = useState<string[]>([]);

  // Initialize profile registry and load active profile on mount
  useEffect(() => {
    const init = async () => {
      try {
        await initializeProfileRegistry();
        const activeProfile = await getActiveProfile();
        if (activeProfile) {
          setProfileUuid(activeProfile.uuid);
          setProfileId(activeProfile.profileId);
          setDisplayName(activeProfile.displayName);
        }
      } catch (error) {
        console.warn('[AppState] Failed to initialize profile registry:', error);
      }
    };
    init();
  }, []);
  const recordSign = useCallback((sign: string) => {
    const normalized = sign.trim();
    if (!normalized) return;
    
    setLastRecognizedSign(normalized);
    setRecentSigns((prev) => {
      const existing = prev.filter((entry) => entry !== normalized);
      return [normalized, ...existing].slice(0, 5);
    });
    
    // Set as preferred if not already set
    setPreferredSignLabel((prev) => prev || normalized);
  }, []);

  const refreshFromRegistry = useCallback(async () => {
    try {
      const activeProfile = await getActiveProfile();
      if (activeProfile) {
        setProfileUuid(activeProfile.uuid);
        setProfileId(activeProfile.profileId);
        setDisplayName(activeProfile.displayName);
      }
    } catch (error) {
      console.warn('[AppState] Failed to refresh from registry:', error);
    }
  }, []);

  const value = useMemo<AppStateContextValue>(
    () => ({
      profileUuid,
      profileId,
      displayName,
      preferredSignLabel,
      lastRecognizedSign,
      recentSigns,
      setPreferredSignLabel,
      recordSign,
      refreshFromRegistry,
    }),
    [profileUuid, profileId, displayName, preferredSignLabel, lastRecognizedSign, recentSigns, recordSign, refreshFromRegistry],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error('AppStateProvider fehlt. Bitte App mit Provider umschließen.');
  }
  return ctx;
}
