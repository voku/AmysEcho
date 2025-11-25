import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'webapp:app-state';

type StoredAppState = {
  profileId: string;
  preferredGestureLabel: string;
  lastRecognizedGesture: string | null;
  recentGestures: string[];
};

type AppStateContextValue = StoredAppState & {
  setProfileId: (value: string) => void;
  setPreferredGestureLabel: (value: string) => void;
  recordGesture: (gesture: string) => void;
};

const defaultState: StoredAppState = {
  profileId: 'web-demo',
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
        ? parsed.profileId
        : defaultState.profileId,
      preferredGestureLabel: typeof parsed?.preferredGestureLabel === 'string' && parsed.preferredGestureLabel.trim()
        ? parsed.preferredGestureLabel
        : defaultState.preferredGestureLabel,
      lastRecognizedGesture:
        typeof parsed?.lastRecognizedGesture === 'string' && parsed.lastRecognizedGesture.trim()
          ? parsed.lastRecognizedGesture
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('Konnte Status nicht speichern', error);
    }
  }, [state]);

  const value = useMemo<AppStateContextValue>(
    () => ({
      ...state,
      setProfileId: (value: string) =>
        setState((prev) => ({
          ...prev,
          profileId: value,
        })),
      setPreferredGestureLabel: (value: string) =>
        setState((prev) => ({
          ...prev,
          preferredGestureLabel: value,
        })),
      recordGesture: (gesture: string) =>
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
        }),
    }),
    [state],
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
