import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (props: any) => React.createElement('View', props, props.children),
    Button: (props: any) => React.createElement('Button', props, props.children),
    StyleSheet: { create: () => ({}) },
    SafeAreaView: (props: any) => React.createElement('SafeAreaView', props, props.children),
  };
});

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children,
}));

jest.mock('../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));

import PracticeScreen from '../src/screens/PracticeScreen';

test('start practice navigates to Training', () => {
  const navigate = jest.fn();
  let component: renderer.ReactTestRenderer;
  act(() => {
    component = renderer.create(<PracticeScreen navigation={{ navigate }} />);
  });
  const btn = (component as renderer.ReactTestRenderer).root.findByProps({ testID: 'btn-start-practice' });
  act(() => btn.props.onPress());
  expect(navigate).toHaveBeenCalledWith('Training', { isPractice: true });
});
