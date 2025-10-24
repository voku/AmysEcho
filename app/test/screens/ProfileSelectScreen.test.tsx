import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { StackActions } from '@react-navigation/native';

jest.mock('../../src/components/ScreenBackground', () => {
  const React = require('react');
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
});

jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));

jest.mock('../../src/services/feedbackService', () => ({
  childHaptic: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/storage', () => ({
  loadProfile: jest.fn(),
}));

import ProfileSelectScreen from '../../src/screens/ProfileSelectScreen';
import { loadProfile } from '../../src/storage';
import { childHaptic } from '../../src/services/feedbackService';
import type { RootStackParamList } from '../../src/navigation/types';
import type { Profile } from '../../src/storage';

type NavigationSubset = StackNavigationProp<RootStackParamList, 'ProfileSelect'>;

const createNavigation = (index: number = 2): jest.Mocked<NavigationSubset> => {
  const state = {
    type: 'stack' as const,
    stale: false as const,
    key: 'stack-root',
    index,
    routeNames: ['Hero', 'App', 'ProfileSelect'] as const,
    routes: [
      { key: 'Hero-1', name: 'Hero' as const },
      { key: 'App-1', name: 'App' as const },
      { key: 'ProfileSelect-1', name: 'ProfileSelect' as const },
    ],
    history: [],
  };

  return {
    navigate: jest.fn(),
    dispatch: jest.fn(),
    getState: jest.fn(() => state),
  } as unknown as jest.Mocked<NavigationSubset>;
};

describe('ProfileSelectScreen', () => {
  let navigation: jest.Mocked<NavigationSubset>;
  const loadProfileMock = loadProfile as jest.MockedFunction<typeof loadProfile>;
  const childHapticMock = childHaptic as jest.MockedFunction<typeof childHaptic>;
  const createProfile = (overrides: Partial<Profile> = {}): Profile => ({
    id: 'profile-1',
    name: 'Amy',
    consentDataUpload: false,
    consentHelpMeGetSmarter: false,
    vocabularySetId: 'default',
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    navigation = createNavigation();
  });

  it('pops to the existing App route before navigating to recognition when a profile is available', async () => {
    loadProfileMock.mockResolvedValue(createProfile({ id: 'amy', name: 'Amy' }));

    const { getByLabelText } = render(<ProfileSelectScreen navigation={navigation} />);

    await waitFor(() =>
      expect(getByLabelText('Zum Erkennungsmodus').props['disabled']).toBe(false),
    );

    fireEvent.press(getByLabelText('Zum Erkennungsmodus'));

    await waitFor(() => {
      expect(childHapticMock).toHaveBeenCalled();
      expect(navigation.dispatch).toHaveBeenCalledWith(StackActions.pop(1));
      expect(navigation.navigate).toHaveBeenCalledWith('App', {
        screen: 'Recognition',
        params: { profileId: 'amy' },
      });
    });
  });

  it('keeps using the existing App stack when routing to the learning tab', async () => {
    loadProfileMock.mockResolvedValue(null);

    const { getByLabelText } = render(<ProfileSelectScreen navigation={navigation} />);

    fireEvent.press(getByLabelText('Zum Lernmodus'));

    await waitFor(() => {
      expect(childHapticMock).toHaveBeenCalled();
      expect(navigation.dispatch).toHaveBeenCalledWith(StackActions.pop(1));
      expect(navigation.navigate).toHaveBeenCalledWith('App', { screen: 'Lernen' });
    });
  });
});
