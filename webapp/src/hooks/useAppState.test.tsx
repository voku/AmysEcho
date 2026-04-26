import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { AppStateProvider, useAppState } from './useAppState';
import * as profileRegistry from '../services/profileRegistry';

const { gestureHistoryAddMock, gestureMeaningGetMock } = vi.hoisted(() => ({
  gestureHistoryAddMock: vi.fn(),
  gestureMeaningGetMock: vi.fn().mockReturnValue({
    emoji: '🍽️',
    category: 'grundbedürfnisse',
    audioText: 'Ich möchte essen',
  }),
}));

// Mock the profile registry
vi.mock('../services/profileRegistry', () => ({
  initializeProfileRegistry: vi.fn().mockResolvedValue(undefined),
  getActiveProfile: vi.fn().mockResolvedValue(null),
}));

vi.mock('../services/gestureHistoryService', () => ({
  gestureHistoryService: {
    addGesture: gestureHistoryAddMock,
  },
}));

vi.mock('../services/gestureMeaningService', () => ({
  gestureMeaningService: {
    getMeaning: gestureMeaningGetMock,
  },
}));

describe('useAppState', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(profileRegistry.initializeProfileRegistry).mockResolvedValue(undefined);
    vi.mocked(profileRegistry.getActiveProfile).mockResolvedValue(null);
    gestureMeaningGetMock.mockReturnValue({
      emoji: '🍽️',
      category: 'grundbedürfnisse',
      audioText: 'Ich möchte essen',
    });
  });

  it('provides defaults when no active profile', async () => {
    const { result } = renderHook(() => useAppState(), { wrapper: AppStateProvider });

    await waitFor(() => {
      expect(profileRegistry.initializeProfileRegistry).toHaveBeenCalledTimes(1);
    });

    expect(result.current.profileUuid).toBeNull();
    expect(result.current.profileId).toBeNull();
    expect(result.current.displayName).toBeNull();
    expect(result.current.profileMetadata).toBeNull();
    expect(result.current.preferredSignId).toBe('hilfe');
    expect(result.current.preferredSignName).toBe('HILFE');
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

    await waitFor(() => {
      expect(profileRegistry.getActiveProfile).toHaveBeenCalledTimes(1);
    });

    expect(result.current.profileUuid).toBe('test-uuid-123');
    expect(result.current.profileId).toBe('test-profile');
    expect(result.current.displayName).toBe('Test User');
    expect(result.current.profileMetadata).toEqual({});
  });

  it('records gestures and maintains recent list', async () => {
    const { result } = renderHook(() => useAppState(), { wrapper: AppStateProvider });

    await waitFor(() => {
      expect(profileRegistry.initializeProfileRegistry).toHaveBeenCalledTimes(1);
    });

    act(() => {
      ['EINS', 'ZWEI', 'DREI', 'VIER', 'FÜNF', 'SECHS', 'VIER'].forEach((sign) => {
        result.current.recordSign(sign);
      });
    });

    expect(result.current.recentSigns).toEqual(['VIER', 'SECHS', 'FÜNF', 'DREI', 'ZWEI']);
    expect(result.current.lastRecognizedSign).toBe('VIER');
  });

  it('stores recognized gestures in the shared history service', async () => {
    const { result } = renderHook(() => useAppState(), { wrapper: AppStateProvider });

    await waitFor(() => {
      expect(profileRegistry.initializeProfileRegistry).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.recordSign('Essen');
    });

    expect(gestureMeaningGetMock).toHaveBeenCalledWith('essen');
    expect(gestureHistoryAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Essen',
        emoji: '🍽️',
        confidence: 1,
        category: 'grundbedürfnisse',
        audioResponse: 'Ich möchte essen',
      }),
    );
  });

  it('ignores empty sign input and leaves recent state untouched', async () => {
    const { result } = renderHook(() => useAppState(), { wrapper: AppStateProvider });

    await waitFor(() => {
      expect(profileRegistry.initializeProfileRegistry).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.recordSign('   ');
    });

    expect(result.current.lastRecognizedSign).toBeNull();
    expect(result.current.recentSigns).toEqual([]);
    expect(gestureHistoryAddMock).not.toHaveBeenCalled();
  });

  it('falls back to the recognized sign when no preferred sign is set', async () => {
    const { result } = renderHook(() => useAppState(), { wrapper: AppStateProvider });

    await waitFor(() => {
      expect(profileRegistry.initializeProfileRegistry).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.setPreferredSign('', '');
    });

    act(() => {
      result.current.recordSign('Bitte');
    });

    expect(result.current.preferredSignId).toBe('bitte');
    expect(result.current.preferredSignName).toBe('Bitte');
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
    expect(result.current.profileMetadata).toEqual({});
  });

  it('keeps the previous state when refreshFromRegistry fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const mockProfile = {
      uuid: 'stable-uuid',
      profileId: 'stable-profile',
      displayName: 'Stable User',
      createdAt: new Date().toISOString(),
      metadata: { notes: 'stable' },
      securityToken: 'token',
    };

    vi.mocked(profileRegistry.getActiveProfile)
      .mockResolvedValueOnce(mockProfile)
      .mockRejectedValueOnce(new Error('registry offline'));

    const { result } = renderHook(() => useAppState(), { wrapper: AppStateProvider });

    await waitFor(() => {
      expect(result.current.profileUuid).toBe('stable-uuid');
    });

    await act(async () => {
      await result.current.refreshFromRegistry();
    });

    expect(result.current.profileUuid).toBe('stable-uuid');
    expect(result.current.profileId).toBe('stable-profile');
    expect(result.current.displayName).toBe('Stable User');
    expect(result.current.profileMetadata).toEqual({ notes: 'stable' });
    expect(warnSpy).toHaveBeenCalledWith(
      '[AppState] Failed to refresh from registry:',
      expect.any(Error),
    );

    warnSpy.mockRestore();
  });
});
