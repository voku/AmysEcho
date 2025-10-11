import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('../../src/storage', () => ({
  createProfile: jest.fn(() => Promise.resolve({ id: '1' })),
}));
import { createProfile } from '../../src/storage';

jest.mock('../../src/model', () => ({
  availableVocabularySets: [
    { id: 'basic', label: 'Basis' },
    { id: 'feelings', label: 'Gefühle' },
  ],
  setActiveVocabularySet: jest.fn(),
}));
import { setActiveVocabularySet } from '../../src/model';

jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({
    update: jest.fn(),
    largeText: false,
    highContrast: false,
  }),
}));

jest.mock('../../src/services/hipEvents', () => ({
  logHIPEvent: jest.fn(() => Promise.resolve()),
}));
import { logHIPEvent } from '../../src/services/hipEvents';

jest.mock('../../src/services/accessibilityService', () => ({
  announceAccessibilityMessage: jest.fn(),
}));

import { announceAccessibilityMessage } from '../../src/services/accessibilityService';

import OnboardingScreen from '../../src/screens/OnboardingScreen';

describe('OnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skip button navigates to Recognition', () => {
    const replace = jest.fn();
    let component!: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(<OnboardingScreen navigation={{ replace }} />);
    });
    act(() => {
      component.root.findByProps({ testID: 'btn-skip' }).props.onPress();
    });
    expect(replace).toHaveBeenCalledWith('Recognition');
  });

  it('completes the wizard and creates a profile with chosen settings', async () => {
    const replace = jest.fn();
    let component!: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(<OnboardingScreen navigation={{ replace }} />);
    });

    await act(async () => {
      component.root.findByProps({ accessibilityLabel: 'Profilname' }).props.onChangeText('Lena');
      component.root.findByProps({ testID: 'btn-next' }).props.onPress();
    });

    await act(async () => {
      component.root.findByProps({ accessibilityLabel: 'Große Schrift' }).props.onValueChange(true);
      component.root.findByProps({ accessibilityLabel: 'Hoher Kontrast' }).props.onValueChange(true);
      component.root.findByProps({ testID: 'btn-next' }).props.onPress();
    });

    await act(async () => {
      component.root.findByProps({ accessibilityLabel: 'Datenupload erlauben' }).props.onValueChange(true);
      component.root.findByProps({ accessibilityLabel: 'Lernfunktion aktivieren' }).props.onValueChange(true);
      component.root.findByProps({ testID: 'btn-next' }).props.onPress();
    });

    await act(async () => {
      component.root.findByProps({ testID: 'vocab-feelings' }).props.onPress();
    });

    await act(async () => {
      component.root.findByProps({ testID: 'btn-next' }).props.onPress();
    });

    expect(createProfile).toHaveBeenCalledWith({
      name: 'Lena',
      consentDataUpload: true,
      consentHelpMeGetSmarter: true,
      vocabularySetId: 'feelings',
      largeText: true,
      highContrast: true,
    });
    expect(setActiveVocabularySet).toHaveBeenCalledWith('feelings');
    expect(logHIPEvent).toHaveBeenCalledWith('HIP_1', 'onboarding_completed', {
      consentDataUpload: true,
      consentHelpMeGetSmarter: true,
      vocabularySetId: 'feelings',
    });
    expect(replace).toHaveBeenCalledWith('Tutorial');
  });

  it('announces accessibility progress on step change', () => {
    const replace = jest.fn();
    let component!: renderer.ReactTestRenderer;
    const announceMock = announceAccessibilityMessage as jest.Mock;

    act(() => {
      component = renderer.create(<OnboardingScreen navigation={{ replace }} />);
    });

    expect(announceMock).toHaveBeenCalledWith(expect.stringContaining('Schritt 1 von 4'));

    act(() => {
      component.root.findByProps({ testID: 'btn-next' }).props.onPress();
    });

    expect(announceMock).toHaveBeenCalledWith(expect.stringContaining('Schritt 2 von 4'));
  });
});
