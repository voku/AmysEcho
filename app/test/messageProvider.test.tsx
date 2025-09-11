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

import { MessageProvider, useMessage } from '../src/context/MessageContext';
import ErrorMessage from '../src/components/ErrorMessage';

describe('MessageProvider', () => {
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
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
    });
    act(() => {
      console.error('second');
    });
    const error = (component as renderer.ReactTestRenderer).root.findByType(ErrorMessage as any);
    expect(error.props.message).toBe('first\nsecond');
    (component as renderer.ReactTestRenderer).unmount();
  });

  it('ignores logs triggered during re-render', () => {
    const Child = () => {
      const { message } = useMessage();
      if (message && !message.includes('child')) {
        console.warn('child');
      }
      return null;
    };

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <MessageProvider>
          <Child />
        </MessageProvider>
      );
    });
    act(() => {
      console.warn('parent');
    });
    const error = (component as renderer.ReactTestRenderer).root.findByType(ErrorMessage as any);
    expect(error.props.message).toBe('parent');
    (component as renderer.ReactTestRenderer).unmount();
  });
});
