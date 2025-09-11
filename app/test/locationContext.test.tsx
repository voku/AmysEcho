import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (props: any) => React.createElement('View', props, props.children),
    Text: (props: any) => React.createElement('Text', props, props.children),
  };
});

jest.mock('../src/services/contextAwareRecognitionService', () => ({
  contextAwareRecognitionService: {
    setLocation: jest.fn(),
  },
}));

import { LocationProvider, useLocation } from '../src/context/LocationContext';
import { contextAwareRecognitionService } from '../src/services/contextAwareRecognitionService';

describe('LocationContext', () => {
  const TestComponent = () => {
    const { currentLocation, setLocation } = useLocation();
    React.useEffect(() => {
      setLocation('school');
    }, [setLocation]);
    return React.createElement('View', { 'data-location': currentLocation });
  };

  it('provides default location and updates service on change', () => {
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        React.createElement(LocationProvider, {}, React.createElement(TestComponent))
      );
    });

    const view = component.root.findByType('View');
    expect(view.props['data-location']).toBe('school');
    expect(contextAwareRecognitionService.setLocation).toHaveBeenCalledWith('school');
  });

  it('throws when used outside provider', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const OutsideComponent = () => {
      useLocation();
      return React.createElement('View');
    };
    expect(() => {
      act(() => {
        renderer.create(React.createElement(OutsideComponent));
      });
    }).toThrow('useLocation must be used within a LocationProvider');
    consoleSpy.mockRestore();
  });
});
