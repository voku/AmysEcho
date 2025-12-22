import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getActiveProfile, initializeProfileRegistry } from '../services/profileRegistry';

type AppStateContextValue = {
  profileUuid: string | null;
  profileId: string | null;
  displayName: string | null;
  preferredGestureLabel: string;
  lastRecognizedGesture: string | null;
  recentGestures: string[];
  setPreferredGestureLabel: (value: string) => void;
  recordGesture: (gesture: string) => void;
  refreshFromRegistry: () => Promise<void>;
};

const defaultState = {
  profileUuid: null,
  profileId: null,
  displayName: null,
  preferredGestureLabel: 'HILFE',
  lastRecognizedGesture: null,
  recentGestures: [],
}; 

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [profileUuid, setProfileUuid] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [preferredGestureLabel, setPreferredGestureLabel] = useState('HILFE');
  const [lastRecognizedGesture, setLastRecognizedGesture] = useState<string | null>(null);
  const [recentGestures, setRecentGestures] = useState<string[]>([]);

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
  const recordGesture = useCallback((gesture: string) => {
    const normalized = gesture.trim();
    if (!normalized) return;
    
    setLastRecognizedGesture(normalized);
    setRecentGestures((prev) => {
      const existing = prev.filter((entry) => entry !== normalized);
      return [normalized, ...existing].slice(0, 5);
    });
    
    // Set as preferred if not already set
    setPreferredGestureLabel((prev) => prev || normalized);
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
      preferredGestureLabel,
      lastRecognizedGesture,
      recentGestures,
      setPreferredGestureLabel,
      recordGesture,
      refreshFromRegistry,
    }),
    [profileUuid, profileId, displayName, preferredGestureLabel, lastRecognizedGesture, recentGestures, recordGesture, refreshFromRegistry],
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
