import React from 'react';
import renderer, { act } from 'react-test-renderer';
import type { StackNavigationProp } from '@react-navigation/stack';

jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));

jest.mock('../../src/services/feedbackService', () => ({
  childHaptic: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
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
import type { RootStackParamList } from '../../src/navigation/types';
import type { Profile } from '../../src/storage';

type NavigationSubset = Pick<
  StackNavigationProp<RootStackParamList, 'Parent'>,
  'navigate' | 'goBack' | 'popTo'
>;

const createNavigation = (
  overrides: Partial<jest.Mocked<NavigationSubset>> = {},
): jest.Mocked<NavigationSubset> =>
  ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    popTo: jest.fn(),
    ...overrides,
  }) as jest.Mocked<NavigationSubset>;

const createProfile = (overrides: Partial<Profile> = {}): Profile => ({
  id: 'profile-1',
  name: 'Amy',
  consentDataUpload: false,
  consentHelpMeGetSmarter: false,
  vocabularySetId: 'default',
  ...overrides,
});

describe('ParentScreen interactions', () => {
  const services: Services = {
    audioService: {} as any,
    adaptiveLearningService: {} as any,
    backupService: {} as any,
    gestureDataProtector: {} as any,
    gdprService: {} as any,
  };

  const renderWithServices = (navigation: jest.Mocked<NavigationSubset>) =>
    renderer.create(
      <ServicesContext.Provider value={services}>
        <ParentScreen navigation={navigation} />
      </ServicesContext.Provider>,
    );

  const loadProfileMock = require('../../src/storage').loadProfile as jest.MockedFunction<
    typeof import('../../src/storage').loadProfile
  >;

  beforeEach(() => {
    loadProfileMock.mockReset();
    loadProfileMock.mockResolvedValue(createProfile());
  });

  it('navigates to admin management area', async () => {
    const navigation = createNavigation();
    let component!: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderWithServices(navigation);
      await Promise.resolve();
    });

    act(() => {
      component.root.findByProps({ accessibilityLabel: 'Verwaltung' }).props['onPress']?.();
    });

    expect(navigation.navigate).toHaveBeenCalledWith('Admin');
  });

  it('opens caregiver analytics', async () => {
    const navigation = createNavigation();
    let component!: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderWithServices(navigation);
      await Promise.resolve();
    });

    act(() => {
      component.root.findByProps({ accessibilityLabel: 'Analysen ansehen' }).props['onPress']?.();
    });

    expect(navigation.navigate).toHaveBeenCalledWith('Dashboard');
  });

  it('goes back when Zurück is pressed', async () => {
    const goBack = jest.fn();
    const navigation = createNavigation({ goBack });
    let component!: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderWithServices(navigation);
      await Promise.resolve();
    });

    act(() => {
      component.root.findByProps({ accessibilityLabel: 'Zurück' }).props['onPress']?.();
    });

    expect(goBack).toHaveBeenCalled();
  });

  it('personalizes caregiver guidance with the active profile name', async () => {
    loadProfileMock.mockResolvedValueOnce(createProfile({ id: 'p1', name: 'Mila' }));
    const navigation = createNavigation();
    let component!: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderWithServices(navigation);
      await Promise.resolve();
    });

    const guidanceCopyNodes = component.root.findAll(
      (node: renderer.ReactTestInstance) =>
        typeof node.props?.['children'] === 'string' &&
        node.props['children'].includes('Mila'),
    );

    expect(guidanceCopyNodes).not.toHaveLength(0);
  });

  it('returns to the existing parent menu using popTo', async () => {
    const navigation = createNavigation();
    let component!: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderWithServices(navigation);
      await Promise.resolve();
    });

    act(() => {
      component.root.findByProps({ accessibilityLabel: 'Menü öffnen' }).props['onPress']?.();
    });

    expect(navigation.popTo).toHaveBeenCalledWith('Parent');
  });
});
