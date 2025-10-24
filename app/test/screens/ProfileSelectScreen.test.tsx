import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

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

describe('ProfileSelectScreen', () => {
  const navigation = {
    popTo: jest.fn(),
    navigate: jest.fn(),
  } as unknown as { popTo: jest.Mock; navigate: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('navigates to recognition with popTo when a profile is available', async () => {
    (loadProfile as jest.Mock).mockResolvedValue({ id: 'amy', name: 'Amy' });

    const { getByLabelText } = render(<ProfileSelectScreen navigation={navigation} />);

    await waitFor(() =>
      expect(getByLabelText('Zum Erkennungsmodus').props.disabled).toBe(false),
    );

    fireEvent.press(getByLabelText('Zum Erkennungsmodus'));

    await waitFor(() => {
      expect(childHaptic).toHaveBeenCalled();
      expect(navigation.popTo).toHaveBeenCalledWith('App', {
        screen: 'Recognition',
        params: { profileId: 'amy' },
      });
    });
  });

  it('routes learning button through popTo to keep using the existing App stack', async () => {
    (loadProfile as jest.Mock).mockResolvedValue(null);

    const { getByLabelText } = render(<ProfileSelectScreen navigation={navigation} />);

    fireEvent.press(getByLabelText('Zum Lernmodus'));

    await waitFor(() => {
      expect(childHaptic).toHaveBeenCalled();
      expect(navigation.popTo).toHaveBeenCalledWith('App', { screen: 'Lernen' });
    });
  });
});
