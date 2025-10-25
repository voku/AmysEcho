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
import { APP_TAB_ROUTES, ROOT_STACK_ROUTES, type RootStackParamList } from '../../src/navigation/types';
import type { Profile } from '../../src/storage';

type NavigationSubset = StackNavigationProp<RootStackParamList, 'ProfileSelect'>;

const createNavigation = (): jest.Mocked<NavigationSubset> => {
  return {
    navigate: jest.fn(),
    dispatch: jest.fn(),
    getState: jest.fn(),
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
      expect(navigation.dispatch).not.toHaveBeenCalled();
      expect(navigation.navigate).toHaveBeenCalledWith(
        ROOT_STACK_ROUTES.App,
        {
          screen: APP_TAB_ROUTES.Recognition,
          params: { profileId: 'amy' },
        },
        { pop: true },
      );
    });
  });

  it('keeps using the existing App stack when routing to the learning tab', async () => {
    loadProfileMock.mockResolvedValue(null);

    const { getByLabelText } = render(<ProfileSelectScreen navigation={navigation} />);

    fireEvent.press(getByLabelText('Zum Lernmodus'));

    await waitFor(() => {
      expect(childHapticMock).toHaveBeenCalled();
      expect(navigation.dispatch).not.toHaveBeenCalled();
      expect(navigation.navigate).toHaveBeenCalledWith(
        ROOT_STACK_ROUTES.App,
        {
          screen: APP_TAB_ROUTES.Lernen,
        },
        { pop: true },
      );
    });
  });
});
