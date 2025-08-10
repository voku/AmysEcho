import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (props: any) => React.createElement('View', props, props.children),
    Button: (props: any) => React.createElement('Button', props, props.children),
    Text: (props: any) => React.createElement('Text', props, props.children),
    FlatList: ({ data, renderItem }: any) =>
      React.createElement('FlatList', null, data.map((item: any, index: number) => renderItem({ item, index }))),
    StyleSheet: { create: () => ({}) },
    SafeAreaView: (props: any) => React.createElement('SafeAreaView', props, props.children),
    Animated: {
      View: ({ children, ...props }: any) => React.createElement('View', props, children),
      Value: function (v: number) {
        this.__value = v;
        return this;
      },
      timing: () => ({ start: () => {} }),
    },
  };
});

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children,
}));

jest.mock('../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));

jest.mock('../src/components/BottomNav', () => () => null);
jest.mock('../src/storage', () => ({ loadProfile: () => Promise.resolve(null) }));

import PracticeScreen from '../src/screens/PracticeScreen';

test('selecting gesture navigates to Training in practice mode', () => {
  const navigate = jest.fn();
  let component: renderer.ReactTestRenderer;
  act(() => {
    component = renderer.create(<PracticeScreen navigation={{ navigate }} />);
  });
  const btn = (component as renderer.ReactTestRenderer).root.findByProps({ testID: 'practice-hello' });
  act(() => btn.props.onPress());
  expect(navigate).toHaveBeenCalledWith('Training', {
    gestureLabel: 'hello',
    isPractice: true,
  });
});
