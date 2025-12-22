import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getActiveProfile, initializeProfileRegistry, type Profile } from '../services/profileRegistry';

const STORAGE_KEY = 'webapp:app-state';

type StoredAppState = {
  profileId: string;
  displayName?: string; // User-friendly display name (can be changed)
  preferredGestureLabel: string;
  lastRecognizedGesture: string | null;
  recentGestures: string[];
};

type AppStateContextValue = StoredAppState & {
  profileUuid?: string; // UUID from profile registry (if available)
  setProfileId: (value: string) => void;
  setDisplayName: (value: string) => void;
  setPreferredGestureLabel: (value: string) => void;
  recordGesture: (gesture: string) => void;
  refreshFromRegistry: () => Promise<void>; // Sync with profile registry
};

const defaultState: StoredAppState = {
  profileId: 'web-demo',
  displayName: undefined,
  preferredGestureLabel: 'HILFE',
  lastRecognizedGesture: null,
  recentGestures: [],
}; 

function readFromStorage(): StoredAppState {
  if (typeof window === 'undefined') return defaultState;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw);
    return {
      profileId: typeof parsed?.profileId === 'string' && parsed.profileId.trim()
        ? parsed.profileId.trim()
        : defaultState.profileId,
      displayName: typeof parsed?.displayName === 'string' && parsed.displayName.trim()
        ? parsed.displayName.trim()
        : undefined,
      preferredGestureLabel: typeof parsed?.preferredGestureLabel === 'string' && parsed.preferredGestureLabel.trim()
        ? parsed.preferredGestureLabel.trim()
        : defaultState.preferredGestureLabel,
      lastRecognizedGesture:
        typeof parsed?.lastRecognizedGesture === 'string' && parsed.lastRecognizedGesture.trim()
          ? parsed.lastRecognizedGesture.trim()
          : null,
      recentGestures: Array.isArray(parsed?.recentGestures)
        ? (parsed.recentGestures as unknown[])
            .map((entry: unknown) => String(entry))
            .filter((entry: string) => entry.trim().length > 0)
            .slice(0, 5)
        : [],
    } satisfies StoredAppState;
  } catch (error) {
    console.warn('Konnte gespeicherten Status nicht lesen', error);
    return defaultState;
  }
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StoredAppState>(() => readFromStorage());
  const [profileUuid, setProfileUuid] = useState<string | undefined>();

  // Initialize profile registry on mount
  useEffect(() => {
    const init = async () => {
      try {
        await initializeProfileRegistry();
        const activeProfile = await getActiveProfile();
        if (activeProfile) {
          setProfileUuid(activeProfile.uuid);
          // Sync state with active profile
          setState((prev) => ({
            ...prev,
            profileId: activeProfile.profileId,
            displayName: activeProfile.displayName,
          }));
        }
      } catch (error) {
        console.warn('[AppState] Failed to initialize profile registry:', error);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('Konnte Status nicht speichern', error);
    }
  }, [state]);

  const setProfileId = useCallback((value: string) => {
    setState((prev) => ({
      ...prev,
      profileId: value,
    }));
  }, []);

  const setDisplayName = useCallback((value: string) => {
    setState((prev) => ({
      ...prev,
      displayName: value.trim() || undefined,
    }));
  }, []);

  const setPreferredGestureLabel = useCallback((value: string) => {
    setState((prev) => ({
      ...prev,
      preferredGestureLabel: value,
    }));
  }, []);

  const recordGesture = useCallback((gesture: string) => {
    setState((prev) => {
      const normalized = gesture.trim();
      if (!normalized) return prev;
      const existing = prev.recentGestures.filter((entry) => entry !== normalized);
      const updatedRecent = [normalized, ...existing].slice(0, 5);
      return {
        ...prev,
        lastRecognizedGesture: normalized,
        recentGestures: updatedRecent,
        preferredGestureLabel: prev.preferredGestureLabel || normalized,
      };
    });
  }, []);

  const refreshFromRegistry = useCallback(async () => {
    try {
      const activeProfile = await getActiveProfile();
      if (activeProfile) {
        setProfileUuid(activeProfile.uuid);
        setState((prev) => ({
          ...prev,
          profileId: activeProfile.profileId,
          displayName: activeProfile.displayName,
        }));
      }
    } catch (error) {
      console.warn('[AppState] Failed to refresh from registry:', error);
    }
  }, []);

  const value = useMemo<AppStateContextValue>(
    () => ({
      ...state,
      profileUuid,
      setProfileId,
      setDisplayName,
      setPreferredGestureLabel,
      recordGesture,
      refreshFromRegistry,
    }),
    [state, profileUuid, setPreferredGestureLabel, setProfileId, setDisplayName, recordGesture, refreshFromRegistry],
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
