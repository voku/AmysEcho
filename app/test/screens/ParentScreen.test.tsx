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
import { StackActions } from '@react-navigation/native';

type NavigationSubset = StackNavigationProp<RootStackParamList, 'Parent'>;

const baseState = {
  type: 'stack' as const,
  stale: false as const,
  key: 'stack-parent',
  routeNames: ['Hero', 'App', 'Parent'] as const,
};

const createNavigation = (
  overrides: Partial<jest.Mocked<NavigationSubset>> = {},
  index: number = 2,
  routes: Array<{ key: string; name: keyof RootStackParamList }> = [
    { key: 'Hero-1', name: 'Hero' },
    { key: 'App-1', name: 'App' },
    { key: 'Parent-1', name: 'Parent' },
  ],
): jest.Mocked<NavigationSubset> =>
  ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    dispatch: jest.fn(),
    getState: jest.fn(() => ({ ...baseState, index, routes })),
    ...overrides,
  }) as unknown as jest.Mocked<NavigationSubset>;

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

  it('keeps the parent screen focused without pushing a duplicate when Menü is pressed', async () => {
    const navigation = createNavigation();
    let component!: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderWithServices(navigation);
      await Promise.resolve();
    });

    act(() => {
      component.root.findByProps({ accessibilityLabel: 'Menü öffnen' }).props['onPress']?.();
    });

    expect(navigation.dispatch).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalledWith('Parent');
  });

  it('pops back to the App recognition tab when Erkennen is pressed', async () => {
    const navigation = createNavigation(
      {},
      2,
      [
        { key: 'Hero-1', name: 'Hero' },
        { key: 'App-1', name: 'App' },
        { key: 'Parent-1', name: 'Parent' },
      ],
    );
    let component!: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderWithServices(navigation);
      await Promise.resolve();
    });

    act(() => {
      component.root.findByProps({ accessibilityLabel: 'Zum Erkennungsmodus' }).props['onPress']?.();
    });

    expect(navigation.dispatch).toHaveBeenCalledWith(StackActions.pop(1));
    expect(navigation.navigate).toHaveBeenCalledWith('App', { screen: 'Recognition' });
  });

  it('pops back to App recognition with low-confidence simulation when requested', async () => {
    const navigation = createNavigation(
      {},
      2,
      [
        { key: 'Hero-1', name: 'Hero' },
        { key: 'App-1', name: 'App' },
        { key: 'Parent-1', name: 'Parent' },
      ],
    );
    let component!: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderWithServices(navigation);
      await Promise.resolve();
    });

    act(() => {
      component.root
        .findByProps({ accessibilityLabel: 'Geringe Sicherheit simulieren' })
        .props['onPress']?.();
    });

    expect(navigation.dispatch).toHaveBeenCalledWith(StackActions.pop(1));
    expect(navigation.navigate).toHaveBeenCalledWith('App', {
      screen: 'Recognition',
      params: { simulateLowConfidence: true },
    });
  });
});
