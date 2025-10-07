import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));

jest.mock('../../src/services/feedbackService', () => ({
  childHaptic: jest.fn(),
}));

jest.mock('../../src/storage', () => {
  const actual = jest.requireActual('../../src/storage');
  return {
    ...actual,
    loadProfile: jest.fn(() => Promise.resolve({ id: 'profile-1', name: 'Amy' })),
  };
});

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

  const loadProfileMock = require('../../src/storage').loadProfile as jest.Mock;

  beforeEach(() => {
    loadProfileMock.mockReset();
    loadProfileMock.mockResolvedValue({ id: 'profile-1', name: 'Amy' });
  });

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

  it('personalizes caregiver guidance with the active profile name', async () => {
    loadProfileMock.mockResolvedValueOnce({ id: 'p1', name: 'Mila' });
    const navigate = jest.fn();
    let component!: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderWithServices({ navigate, goBack: jest.fn() });
      await Promise.resolve();
    });

    const guidanceCopyNodes = component.root.findAll(
      (node) =>
        typeof node.props?.children === 'string' &&
        node.props.children.includes('Mila'),
    );

    expect(guidanceCopyNodes).not.toHaveLength(0);
  });
});
