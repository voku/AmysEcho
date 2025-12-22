import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { AppStateProvider, useAppState } from './useAppState';
import * as profileRegistry from '../services/profileRegistry';

// Mock the profile registry
vi.mock('../services/profileRegistry', () => ({
  initializeProfileRegistry: vi.fn().mockResolvedValue(undefined),
  getActiveProfile: vi.fn().mockResolvedValue(null),
}));

describe('useAppState', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('provides defaults when no active profile', async () => {
    const { result } = renderHook(() => useAppState(), { wrapper: AppStateProvider });

    // Wait for initialization
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(result.current.profileUuid).toBeNull();
    expect(result.current.profileId).toBeNull();
    expect(result.current.displayName).toBeNull();
    expect(result.current.preferredGestureLabel).toBe('HILFE');
  });

  it('loads active profile on mount', async () => {
    const mockProfile = {
      uuid: 'test-uuid-123',
      profileId: 'test-profile',
      displayName: 'Test User',
      createdAt: new Date().toISOString(),
      metadata: {},
      securityToken: 'token',
    };

    vi.mocked(profileRegistry.getActiveProfile).mockResolvedValue(mockProfile);

    const { result } = renderHook(() => useAppState(), { wrapper: AppStateProvider });

    // Wait for initialization
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(result.current.profileUuid).toBe('test-uuid-123');
    expect(result.current.profileId).toBe('test-profile');
    expect(result.current.displayName).toBe('Test User');
  });

  it('records gestures and maintains recent list', () => {
    const { result } = renderHook(() => useAppState(), { wrapper: AppStateProvider });

    act(() => {
      ['EINS', 'ZWEI', 'DREI', 'VIER', 'FÜNF', 'SECHS', 'VIER'].forEach((gesture) => {
        result.current.recordGesture(gesture);
      });
    });

    expect(result.current.recentGestures).toEqual(['VIER', 'SECHS', 'FÜNF', 'DREI', 'ZWEI']);
    expect(result.current.lastRecognizedGesture).toBe('VIER');
  });

  it('refreshes from registry', async () => {
    const mockProfile = {
      uuid: 'new-uuid-456',
      profileId: 'new-profile',
      displayName: 'New User',
      createdAt: new Date().toISOString(),
      metadata: {},
      securityToken: 'token',
    };

    const { result } = renderHook(() => useAppState(), { wrapper: AppStateProvider });

    // Update mock to return new profile
    vi.mocked(profileRegistry.getActiveProfile).mockResolvedValue(mockProfile);

    await act(async () => {
      await result.current.refreshFromRegistry();
    });

    expect(result.current.profileUuid).toBe('new-uuid-456');
    expect(result.current.profileId).toBe('new-profile');
    expect(result.current.displayName).toBe('New User');
  });
});
