import React, { isValidElement } from 'react';
import type { ReactNode } from 'react';
import renderer, { act } from 'react-test-renderer';

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

const resolveComponent = async () => {
  let comp!: renderer.ReactTestRenderer;
  await act(async () => {
    comp = renderer.create(<ProfileSelectScreen navigation={{ navigate: jest.fn() }} />);
    await Promise.resolve();
  });
  return comp;
};

const flattenText = (node: ReactNode): string[] => {
  if (typeof node === 'string' || typeof node === 'number') {
    return [String(node)];
  }
  if (!node) {
    return [];
  }
  if (Array.isArray(node)) {
    return node.flatMap((child) => flattenText(child));
  }
  if (isValidElement(node)) {
    return flattenText(node.props.children);
  }
  return [];
};

const collectTextContent = (instances: renderer.ReactTestInstance[]) =>
  instances.flatMap((instance) => flattenText(instance.props.children));

describe('ProfileSelectScreen accessibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadProfileMock.mockResolvedValue({ id: 'p1', name: 'Amy' });
  });

  it('renders rebranded copy and accessible navigation when a profile is available', async () => {
    const comp = await resolveComponent();
    const textNodes = comp.root.findAll((n) => n.type === 'Text');
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

    const pressables = comp.root.findAll((n) => n.type === 'Pressable');
    const a11yLabels = pressables.map((p) => p.props.accessibilityLabel);
    expect(a11yLabels).toEqual(
      expect.arrayContaining([
        'Zum Erkennungsmodus',
        'Zum Lernmodus',
        'Elternbereich öffnen',
        'Adminbereich öffnen',
        'Profile verwalten',
      ]),
    );

    const recognitionButton = pressables.find(
      (p) => p.props.accessibilityLabel === 'Zum Erkennungsmodus',
    );
    expect(recognitionButton?.props.disabled).toBe(false);
  });

  it('disables recognition and guides profile creation when no profile is stored', async () => {
    loadProfileMock.mockResolvedValueOnce(null);

    const comp = await resolveComponent();
    const textNodes = comp.root.findAll((n) => n.type === 'Text');
    const labels = collectTextContent(textNodes);

    expect(labels).toEqual(
      expect.arrayContaining([
        'Lege zuerst ein Profil an, damit wir wissen, wen wir begleiten.',
        'Kein Profil gefunden. Lege zuerst ein Profil an, damit Amy begleitet wird.',
      ]),
    );

    const pressables = comp.root.findAll((n) => n.type === 'Pressable');
    const recognitionButton = pressables.find(
      (p) => p.props.accessibilityLabel === 'Zum Erkennungsmodus',
    );
    expect(recognitionButton?.props.disabled).toBe(true);

    const a11yLabels = pressables.map((p) => p.props.accessibilityLabel);
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
