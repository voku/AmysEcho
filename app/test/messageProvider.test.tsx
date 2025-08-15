import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (props: any) => React.createElement('View', props, props.children),
    Text: (props: any) => React.createElement('Text', props, props.children),
    StyleSheet: { create: (styles: any) => styles },
  };
});

jest.mock('../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false }),
}));

import { MessageProvider } from '../src/context/MessageContext';
import ErrorMessage from '../src/components/ErrorMessage';

describe('MessageProvider', () => {
  it('displays console warnings', () => {
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <MessageProvider>
          <></>
        </MessageProvider>
      );
    });
    act(() => {
      console.warn('warn to display');
    });
    const error = (component as renderer.ReactTestRenderer).root.findByType(ErrorMessage as any);
    expect(error.props.message).toBe('warn to display');
    (component as renderer.ReactTestRenderer).unmount();
  });

  it('appends multiple console messages', () => {
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <MessageProvider>
          <></>
        </MessageProvider>
      );
    });
    act(() => {
      console.warn('first');
      console.error('second');
    });
    const error = (component as renderer.ReactTestRenderer).root.findByType(ErrorMessage as any);
    expect(error.props.message).toBe('first\nsecond');
    (component as renderer.ReactTestRenderer).unmount();
  });
});
