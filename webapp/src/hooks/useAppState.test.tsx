import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import { AppStateProvider, useAppState } from './useAppState';

describe('useAppState', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('provides defaults and persists changes', () => {
    const { result } = renderHook(() => useAppState(), { wrapper: AppStateProvider });

    expect(result.current.profileId).toBe('web-demo');
    expect(result.current.displayName).toBeUndefined();
    expect(result.current.preferredGestureLabel).toBe('HILFE');

    act(() => {
      result.current.setProfileId('browser-profile');
      result.current.setDisplayName('Browser User');
      result.current.setPreferredGestureLabel('BITTE');
      result.current.recordGesture('HALLO');
    });

    expect(result.current.profileId).toBe('browser-profile');
    expect(result.current.displayName).toBe('Browser User');
    expect(result.current.lastRecognizedGesture).toBe('HALLO');
    expect(result.current.recentGestures).toEqual(['HALLO']);

    const raw = window.localStorage.getItem('webapp:app-state');
    expect(raw).toContain('browser-profile');
    expect(raw).toContain('Browser User');
    expect(raw).toContain('BITTE');
  });

  it('keeps only the latest five gestures and removes duplicates', () => {
    const { result } = renderHook(() => useAppState(), { wrapper: AppStateProvider });

    act(() => {
      ['EINS', 'ZWEI', 'DREI', 'VIER', 'FÜNF', 'SECHS', 'VIER'].forEach((gesture) => {
        result.current.recordGesture(gesture);
      });
    });

    expect(result.current.recentGestures).toEqual(['VIER', 'SECHS', 'FÜNF', 'DREI', 'ZWEI']);
    expect(result.current.lastRecognizedGesture).toBe('VIER');
  });

  it('allows changing displayName without affecting profileId', () => {
    const { result } = renderHook(() => useAppState(), { wrapper: AppStateProvider });

    act(() => {
      result.current.setProfileId('amy');
      result.current.setDisplayName('Amy Marie');
    });

    expect(result.current.profileId).toBe('amy');
    expect(result.current.displayName).toBe('Amy Marie');

    act(() => {
      result.current.setDisplayName('Amy M.');
    });

    expect(result.current.profileId).toBe('amy');
    expect(result.current.displayName).toBe('Amy M.');
  });

  it('stores undefined for empty displayName', () => {
    const { result } = renderHook(() => useAppState(), { wrapper: AppStateProvider });

    act(() => {
      result.current.setDisplayName('   ');
    });

    expect(result.current.displayName).toBeUndefined();
  });
});
