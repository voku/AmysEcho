import React from 'react';
import renderer, { act } from 'react-test-renderer';
import ErrorBoundary from '../src/components/ErrorBoundary';
import { AccessibilityContext } from '../src/components/AccessibilityContext';
import { Text } from 'react-native';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (props: any) => React.createElement('View', props, props.children),
    Text: (props: any) => React.createElement('Text', props, props.children),
    Pressable: (props: any) => React.createElement('Pressable', props, props.children),
    StyleSheet: { create: (styles: any) => styles },
  };
});

jest.mock('../src/utils/logger', () => ({ logger: { error: jest.fn() } }));

describe('ErrorBoundary', () => {
  it('shows fallback UI and recovers on retry', () => {
    const Faulty = ({ boom }: { boom: boolean }) => {
      if (boom) throw new Error('fail');
      return <Text>ok</Text>;
    };
    let causeError = true;
    let component: renderer.ReactTestRenderer;
    const ctx = { largeText: false, highContrast: false, update: () => {} };

    act(() => {
      component = renderer.create(
        <AccessibilityContext.Provider value={ctx}>
          <ErrorBoundary>
            <Faulty boom={causeError} />
          </ErrorBoundary>
        </AccessibilityContext.Provider>,
      );
    });

    const texts = (component as renderer.ReactTestRenderer).root.findAllByType('Text');
    expect(texts.map(t => t.props.children)).toEqual(
      expect.arrayContaining(['Oops! Something went wrong.', 'Try Again']),
    );

    causeError = false;
    act(() => {
      (component as renderer.ReactTestRenderer).update(
        <AccessibilityContext.Provider value={ctx}>
          <ErrorBoundary>
            <Faulty boom={causeError} />
          </ErrorBoundary>
        </AccessibilityContext.Provider>,
      );
    });

    const button = (component as renderer.ReactTestRenderer).root.findByType('Pressable');
    act(() => {
      button.props.onPress();
    });

    const finalTexts = (component as renderer.ReactTestRenderer).root.findAllByType('Text');
    expect(finalTexts.map(t => t.props.children)).toContain('ok');
  });
});

