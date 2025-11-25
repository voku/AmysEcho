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
    expect(result.current.preferredGestureLabel).toBe('HILFE');

    act(() => {
      result.current.setProfileId('browser-profile');
      result.current.setPreferredGestureLabel('BITTE');
      result.current.recordGesture('HALLO');
    });

    expect(result.current.lastRecognizedGesture).toBe('HALLO');
    expect(result.current.recentGestures).toEqual(['HALLO']);

    const raw = window.localStorage.getItem('webapp:app-state');
    expect(raw).toContain('browser-profile');
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
});
