import React from 'react';
import renderer, { act } from 'react-test-renderer';

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

  it('provides all required services', () => {
    const mockServices = {
      audioService: { initialize: jest.fn() },
      adaptiveLearningService: { processGesture: jest.fn() },
      backupService: { createBackup: jest.fn() },
      gestureDataProtector: { encrypt: jest.fn() },
      gdprService: { exportData: jest.fn() },
    };

    const TestServicesComponent = () => {
      const services = useServices();
      return React.createElement('View', {
        'data-services-keys': Object.keys(services).sort().join(','),
      });
    };

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        React.createElement(ServicesContext.Provider, { value: mockServices },
          React.createElement(TestServicesComponent)
        )
      );
    });

    const view = component.root.findByType('View');
    expect(view.props['data-services-keys']).toBe('adaptiveLearningService,audioService,backupService,gdprService,gestureDataProtector');
  });

  it('handles null context value', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      act(() => {
        renderer.create(
          React.createElement(ServicesContext.Provider, { value: null },
            React.createElement(TestComponent)
          )
        );
      });
    }).toThrow('useServices must be used within an AppServicesProvider');
    consoleSpy.mockRestore();
  });

  it('handles undefined context value', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      act(() => {
        renderer.create(
          React.createElement(ServicesContext.Provider, { value: undefined },
            React.createElement(TestComponent)
          )
        );
      });
    }).toThrow('useServices must be used within an AppServicesProvider');
    consoleSpy.mockRestore();
  });

  it('maintains service references across renders', () => {
    const mockServices = {
      audioService: { initialize: jest.fn() },
      adaptiveLearningService: { processGesture: jest.fn() },
      backupService: { createBackup: jest.fn() },
      gestureDataProtector: { encrypt: jest.fn() },
      gdprService: { exportData: jest.fn() },
    };

    const TestStableComponent = () => {
      const services = useServices();
      const [renderCount, setRenderCount] = React.useState(0);
      React.useEffect(() => {
        setRenderCount(prev => prev + 1);
      }, []);
      return React.createElement('View', {
        'data-render-count': renderCount,
        'data-audio-service': services.audioService,
      });
    };

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        React.createElement(ServicesContext.Provider, { value: mockServices },
          React.createElement(TestStableComponent)
        )
      );
    });

    const view = component.root.findByType('View');
    expect(view.props['data-render-count']).toBe(1);
    expect(view.props['data-audio-service']).toBe(mockServices.audioService);
  });
});