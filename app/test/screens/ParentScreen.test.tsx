import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));

jest.mock('../../src/services/feedbackService', () => ({
  childHaptic: jest.fn(),
}));

import ParentScreen from '../../src/screens/ParentScreen';
import { ServicesContext, type Services } from '../../src/context/ServicesContext';

describe('ParentScreen interactions', () => {
  const services: Services = {
    audioService: {} as any,
    adaptiveLearningService: {} as any,
    backupService: {} as any,
    gestureDataProtector: {} as any,
    gdprService: {} as any,
  };

  const renderWithServices = (navigation: any) =>
    renderer.create(
      <ServicesContext.Provider value={services}>
        <ParentScreen navigation={navigation} />
      </ServicesContext.Provider>,
    );

  it('navigates to admin management area', async () => {
    const navigate = jest.fn();
    let component!: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderWithServices({ navigate, goBack: jest.fn() });
      await Promise.resolve();
    });

    act(() => {
      component.root.findByProps({ accessibilityLabel: 'Verwaltung' }).props.onPress();
    });

    expect(navigate).toHaveBeenCalledWith('Admin');
  });

  it('opens caregiver analytics', async () => {
    const navigate = jest.fn();
    let component!: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderWithServices({ navigate, goBack: jest.fn() });
      await Promise.resolve();
    });

    act(() => {
      component.root.findByProps({ accessibilityLabel: 'Analysen ansehen' }).props.onPress();
    });

    expect(navigate).toHaveBeenCalledWith('Dashboard');
  });

  it('goes back when Zurück is pressed', async () => {
    const goBack = jest.fn();
    let component!: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderWithServices({ navigate: jest.fn(), goBack });
      await Promise.resolve();
    });

    act(() => {
      component.root.findByProps({ accessibilityLabel: 'Zurück' }).props.onPress();
    });

    expect(goBack).toHaveBeenCalled();
  });
});
