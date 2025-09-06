import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (props: any) => React.createElement('View', props, props.children),
  };
});

import { ServicesContext, useServices } from '../src/context/ServicesContext';

describe('ServicesContext', () => {
  const TestComponent = () => {
    const services = useServices();
    return React.createElement('View', {
      'data-has-services': !!services,
    });
  };

  it('provides services context', () => {
    const mockServices = {
      audioService: {},
      adaptiveLearningService: {},
      backupService: {},
      gestureDataProtector: {},
      gdprService: {},
    };

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        React.createElement(ServicesContext.Provider, { value: mockServices },
          React.createElement(TestComponent)
        )
      );
    });

    const view = component.root.findByType('View');
    expect(view.props['data-has-services']).toBe(true);
  });

  it('throws error when useServices is used outside provider', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      act(() => {
        renderer.create(React.createElement(TestComponent));
      });
    }).toThrow('useServices must be used within an AppServicesProvider');
    consoleSpy.mockRestore();
  });
});