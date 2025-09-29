import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));

jest.mock('../../src/services/feedbackService', () => ({
  childHaptic: jest.fn(),
}));

import ParentalGateScreen from '../../src/screens/ParentalGateScreen';

describe('ParentalGateScreen interactions', () => {
  const targetRoute = 'Parent';

  beforeEach(() => {
    jest.spyOn(global.Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('replaces the current screen with the target when the answer is correct', async () => {
    const replace = jest.fn();
    const navigation = { replace, goBack: jest.fn() };

    let component!: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(
        <ParentalGateScreen navigation={navigation as any} route={{ params: { target: targetRoute } }} />,
      );
      await Promise.resolve();
    });

    const input = component.root.findByProps({ accessibilityLabel: 'Antwort auf Elternprüfung' });
    act(() => {
      input.props.onChangeText('4');
    });

    act(() => {
      component.root.findByProps({ accessibilityLabel: 'Antwort bestätigen' }).props.onPress();
    });

    expect(replace).toHaveBeenCalledWith(targetRoute);
  });
});
