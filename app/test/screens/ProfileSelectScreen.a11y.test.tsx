import React, { isValidElement } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import renderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { Pressable, Text } from 'react-native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../src/navigation/types';
import type { Profile } from '../../src/storage';

jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));

jest.mock('../../src/services/feedbackService', () => ({
  childHaptic: jest.fn(),
}));

jest.mock('../../src/storage', () => ({
  __esModule: true,
  loadProfile: jest.fn(),
}));

import ProfileSelectScreen from '../../src/screens/ProfileSelectScreen';
import { loadProfile } from '../../src/storage';

const loadProfileMock = loadProfile as jest.MockedFunction<typeof loadProfile>;

type NavigationSubset = StackNavigationProp<RootStackParamList, 'ProfileSelect'>;

const createNavigationStub = (): NavigationSubset =>
  ({
    navigate: jest.fn(),
    dispatch: jest.fn(),
    getState: jest.fn(() => ({
      type: 'stack',
      stale: false,
      key: 'stack-profile-select',
      index: 2,
      routeNames: ['Hero', 'App', 'ProfileSelect'],
      routes: [
        { key: 'Hero-1', name: 'Hero' },
        { key: 'App-1', name: 'App' },
        { key: 'ProfileSelect-1', name: 'ProfileSelect' },
      ],
      history: [],
    })),
  } as unknown as NavigationSubset);

const resolveComponent = async () => {
  const navigation = createNavigationStub();
  let comp!: renderer.ReactTestRenderer;
  await act(async () => {
    comp = renderer.create(<ProfileSelectScreen navigation={navigation} />);
    await Promise.resolve();
  });
  return { comp, navigation };
};

const flattenText = (node: ReactNode): string[] => {
  if (typeof node === 'string') {
    return node ? [node] : [];
  }
  if (typeof node === 'number') {
    return [String(node)];
  }
  if (!node || typeof node === 'boolean') {
    return [];
  }
  if (Array.isArray(node)) {
    return node.flatMap((child) => flattenText(child));
  }
  if (isValidElement(node)) {
    return flattenText((node.props as { children?: ReactNode }).children);
  }
  return [];
};

const collectTextContent = (instances: renderer.ReactTestInstance[]) =>
  instances.flatMap((instance) =>
    flattenText((instance.props as ComponentProps<typeof Text>).children),
  );

describe('ProfileSelectScreen accessibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const profile: Profile = {
      id: 'p1',
      name: 'Amy',
      consentDataUpload: true,
      consentHelpMeGetSmarter: true,
      vocabularySetId: 'default',
    };
    loadProfileMock.mockResolvedValue(profile);
  });

  it('renders rebranded copy and accessible navigation when a profile is available', async () => {
    const { comp } = await resolveComponent();
    const textNodes = comp.root.findAllByType(Text);
    const labels = collectTextContent(textNodes);

    expect(labels).toEqual(
      expect.arrayContaining([
        'Wohin möchtest du als Nächstes?',
        'Wähle den Bereich aus, der jetzt am besten hilft.',
        'Zuhören',
        'Starte den Erkennungsmodus und lass Amy sofort verstanden werden.',
        'Lernen',
        'Übe Gesten gemeinsam und sammle neue Trainingsbeispiele.',
        'Elternbereich',
        'Öffne den Elternbereich für Einstellungen und Unterstützung.',
        'Admin',
        'Verwalte Modelle und technische Details.',
        'Profile verwalten',
        'Bearbeite oder lege Profile für Kinder an.',
      ]),
    );

    const pressables = comp.root.findAllByType(Pressable);
    const getPressableProps = (instance: renderer.ReactTestInstance) =>
      instance.props as ComponentProps<typeof Pressable>;
    const a11yLabels = pressables.map((instance: ReactTestInstance) => getPressableProps(instance).accessibilityLabel);
    expect(a11yLabels).toEqual(
      expect.arrayContaining([
        'Zum Erkennungsmodus',
        'Zum Lernmodus',
        'Elternbereich öffnen',
        'Adminbereich öffnen',
        'Profile verwalten',
      ]),
    );

    const recognitionButton = pressables.find((instance: ReactTestInstance) => {
      const props = getPressableProps(instance);
      return props.accessibilityLabel === 'Zum Erkennungsmodus';
    });
    expect(getPressableProps(recognitionButton!).disabled).toBe(false);
  });

  it('disables recognition and guides profile creation when no profile is stored', async () => {
    loadProfileMock.mockResolvedValueOnce(null);

    const { comp } = await resolveComponent();
    const textNodes = comp.root.findAllByType(Text);
    const labels = collectTextContent(textNodes);

    expect(labels).toEqual(
      expect.arrayContaining([
        'Wohin möchtest du als Nächstes?',
        'Wähle den Bereich aus, der jetzt am besten hilft.',
        'Zuhören',
        'Lege zuerst ein Profil an, damit wir wissen, wen wir begleiten.',
        'Lernen',
        'Übe Gesten gemeinsam und sammle neue Trainingsbeispiele.',
        'Elternbereich',
        'Öffne den Elternbereich für Einstellungen und Unterstützung.',
        'Admin',
        'Verwalte Modelle und technische Details.',
        'Profile verwalten',
        'Bearbeite oder lege Profile für Kinder an.',
        'Kein Profil gefunden. Lege zuerst ein Profil an, damit Amy begleitet wird.',
      ]),
    );

    const pressables = comp.root.findAllByType(Pressable);
    const getPressableProps = (instance: renderer.ReactTestInstance) =>
      instance.props as ComponentProps<typeof Pressable>;
    const recognitionButton = pressables.find((instance: ReactTestInstance) => {
      const props = getPressableProps(instance);
      return props.accessibilityLabel === 'Zum Erkennungsmodus';
    });
    expect(getPressableProps(recognitionButton!).disabled).toBe(true);

    const a11yLabels = pressables.map((instance: ReactTestInstance) => getPressableProps(instance).accessibilityLabel);
    expect(a11yLabels).toEqual(
      expect.arrayContaining([
        'Zum Erkennungsmodus',
        'Zum Lernmodus',
        'Elternbereich öffnen',
        'Adminbereich öffnen',
        'Profile verwalten',
      ]),
    );
  });
});
