import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import type { StackNavigationProp } from '@react-navigation/stack';

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

type NavigationSubset = Pick<StackNavigationProp<RootStackParamList, 'ProfileSelect'>, 'navigate' | 'popTo'>;

const createNavigation = (): jest.Mocked<NavigationSubset> =>
  ({
    navigate: jest.fn(),
    popTo: jest.fn(),
  }) as jest.Mocked<NavigationSubset>;

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

  it('navigates to recognition with popTo when a profile is available', async () => {
    loadProfileMock.mockResolvedValue(createProfile({ id: 'amy', name: 'Amy' }));

    const { getByLabelText } = render(<ProfileSelectScreen navigation={navigation} />);

    await waitFor(() =>
      expect(getByLabelText('Zum Erkennungsmodus').props['disabled']).toBe(false),
    );

    fireEvent.press(getByLabelText('Zum Erkennungsmodus'));

    await waitFor(() => {
      expect(childHapticMock).toHaveBeenCalled();
      expect(navigation.popTo).toHaveBeenCalledWith('App', {
        screen: 'Recognition',
        params: { profileId: 'amy' },
      });
    });
  });

  it('routes learning button through popTo to keep using the existing App stack', async () => {
    loadProfileMock.mockResolvedValue(null);

    const { getByLabelText } = render(<ProfileSelectScreen navigation={navigation} />);

    fireEvent.press(getByLabelText('Zum Lernmodus'));

    await waitFor(() => {
      expect(childHapticMock).toHaveBeenCalled();
      expect(navigation.popTo).toHaveBeenCalledWith('App', { screen: 'Lernen' });
    });
  });
});
