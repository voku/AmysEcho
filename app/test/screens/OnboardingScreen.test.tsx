import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (p: any) => React.createElement('View', p, p.children),
    Text: (p: any) => React.createElement('Text', p, p.children),
    Switch: (p: any) => React.createElement('Switch', p, p.children),
    Button: (p: any) => React.createElement('Button', p, p.children),
    TextInput: (p: any) => React.createElement('TextInput', p, p.children),
    SafeAreaView: (p: any) => React.createElement('SafeAreaView', p, p.children),
    StyleSheet: { create: (s: any) => s },
  } as any;
});

jest.mock('../../src/storage', () => ({
  createProfile: jest.fn(() => Promise.resolve({ id: '1' })),
}));
import { createProfile } from '../../src/storage';

import OnboardingScreen from '../../src/screens/OnboardingScreen';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children,
}));
jest.mock('../../src/model', () => ({
  availableVocabularySets: [{ id: 'basic', label: 'Basic' }],
  setActiveVocabularySet: jest.fn(),
}));
import { setActiveVocabularySet } from '../../src/model';
jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ update: jest.fn() }),
}));

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

  it('next button creates profile and goes to Tutorial', async () => {
    const replace = jest.fn();
    let component!: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(<OnboardingScreen navigation={{ replace }} />);
    });
    await act(async () => {
      component.root.findByProps({ testID: 'btn-next' }).props.onPress();
    });
    expect(createProfile).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('Tutorial');
    expect(setActiveVocabularySet).toHaveBeenCalledWith('basic');
  });

  it('buttons expose accessibility labels', () => {
    let component!: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(<OnboardingScreen navigation={{ replace: jest.fn() }} />);
    });
    expect(component.root.findByProps({ testID: 'btn-next' }).props.accessibilityLabel).toBe('Weiter');
    expect(component.root.findByProps({ testID: 'btn-skip' }).props.accessibilityLabel).toBe('Überspringen');
  });
});
