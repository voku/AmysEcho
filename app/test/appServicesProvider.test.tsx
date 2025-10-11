import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false }),
}));

jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: () => ({
      downloadAsync: jest.fn().mockResolvedValue(undefined),
      localUri: 'file://dummy',
    }),
  },
}));

jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
  isSpeakingAsync: jest.fn().mockResolvedValue(false),
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(),
  fetch: jest.fn().mockResolvedValue({ isConnected: true }),
}));

jest.mock('../src/storage', () => ({
  loadActiveProfileId: jest.fn().mockResolvedValue(null),
  loadCustomModelUri: jest.fn().mockResolvedValue(null),
}));



jest.mock('../src/constants', () => ({
  CONFIDENCE_THRESHOLD: 0.5,
  ENABLE_REMOTE_CLASSIFICATION: false,
  REMOTE_RETRY_MS: 0,
  REMOTE_TIMEOUT_MS: 0,
}));

jest.mock('../src/utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { logger } from '../src/utils/logger';

jest.mock('../src/services/adaptiveLearningService', () => ({
  adaptiveLearningService: {},
}));

const storage = require('../src/storage');
const mockTelemetry = {
  dump: jest.fn().mockResolvedValue([]),
};
jest.mock('../src/telemetry/recorder', () => ({ telemetry: mockTelemetry }));

const createResolvedMock = () => jest.fn().mockResolvedValue(undefined);

const listeners = new Set<() => void>();
const mockOnMlpModelUpdated = jest.fn((listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
});
jest.mock('../src/services/dgsModelClient', () => ({
  onMlpModelUpdated: mockOnMlpModelUpdated,
}));

const actualServices = jest.requireActual('../src/services');

const audioServiceMock = {
  ...actualServices.audioService,
  initialize: createResolvedMock(),
  dispose: createResolvedMock(),
};

const checkForModelUpdateMock = jest.fn().mockResolvedValue(true);
const shouldAllowModelRefreshMock = jest.fn().mockResolvedValue(true);

const mockServices = {
  ...actualServices,
  audioService: audioServiceMock,
  uploadTelemetry: createResolvedMock(),
  checkForModelUpdate: checkForModelUpdateMock,
  shouldAllowModelRefresh: shouldAllowModelRefreshMock,
  syncTrainingData: createResolvedMock(),
};

jest.mock('../src/services', () => ({ __esModule: true, ...mockServices }));
jest.mock('../src/services/index', () => ({ __esModule: true, ...mockServices }));
jest.mock('../services', () => ({ __esModule: true, ...mockServices }));
const { AppServicesProvider } = require('../src/context/AppServicesProvider');
const { useServices } = require('../src/context/ServicesContext');
const ErrorMessage = require('../src/components/ErrorMessage').default;
const { MessageProvider } = require('../src/context/MessageContext');

const flushAsync = async (iterations = 5) => {
  for (let i = 0; i < iterations; i++) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

const expectEventually = async (assertion: () => void, timeoutMs = 3000) => {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() - start > timeoutMs) {
        throw error;
      }
      await flushAsync();
    }
  }
};

const renderProvider = async (
  options: { offline?: boolean; child?: React.ReactElement } = {},
): Promise<renderer.ReactTestRenderer> => {
  const { offline = false, child = <div>Test Child</div> } = options;
  let component!: renderer.ReactTestRenderer;
  await act(async () => {
    component = renderer.create(
      <MessageProvider>
        <AppServicesProvider offline={offline}>{child}</AppServicesProvider>
      </MessageProvider>,
    );
  });
  return component;
};

const expectChildRendered = async (component: renderer.ReactTestRenderer) => {
  await expectEventually(() => {
    const children = component.root.findAllByType('div');
    expect(children.length).toBeGreaterThan(0);
  });
};

const expectNoErrorMessage = (component: renderer.ReactTestRenderer) => {
  const errorComponents = component.root.findAllByType(ErrorMessage as any);
  if (errorComponents.length === 0) {
    return;
  }
  errorComponents.forEach((err) => {
    expect(err.props.toasts).toHaveLength(0);
  });
};

const getModelRefreshLogCount = () =>
  (logger.info as jest.Mock).mock.calls.filter(([message]) => message === 'Model refresh finished').length;

describe('AppServicesProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    audioServiceMock.initialize.mockReset().mockResolvedValue(undefined);
    audioServiceMock.dispose.mockReset().mockResolvedValue(undefined);
    checkForModelUpdateMock.mockReset().mockResolvedValue(true);
    shouldAllowModelRefreshMock.mockReset().mockResolvedValue(true);
    mockServices.syncTrainingData.mockReset().mockResolvedValue(undefined);
    mockServices.uploadTelemetry.mockReset().mockResolvedValue(undefined);

    mockOnMlpModelUpdated.mockClear();
    listeners.clear();

    storage.loadActiveProfileId.mockReset().mockResolvedValue(null);
    storage.loadCustomModelUri.mockReset().mockResolvedValue(null);

    mockTelemetry.dump.mockReset().mockResolvedValue([]);
  });

  it('displays error message when initialization fails', async () => {
    audioServiceMock.initialize.mockRejectedValueOnce(new Error('init fail'));

    const component = await renderProvider({ child: <></> });
    await act(async () => {});
    await act(async () => {});
    const error = (component as renderer.ReactTestRenderer).root.findByType(ErrorMessage as any);
    expect(error.props.toasts).toHaveLength(1);
    expect(error.props.toasts[0].message).toBe(
      'Dienste konnten nicht gestartet werden. Bitte Internetverbindung prüfen und erneut versuchen.',
    );
    expect(error.props.toasts[0].tone).toBe('error');
    expect(logger.error).toHaveBeenCalledWith(
      'Dienste konnten nicht initialisiert werden:',
      expect.any(Error),
    );
  });

  it('initializes successfully in online mode', async () => {
    // Mock successful initialization
    audioServiceMock.initialize.mockResolvedValueOnce();

    const component = await renderProvider();

    await expectChildRendered(component);
  });

  it('works in offline mode', async () => {
    audioServiceMock.initialize.mockResolvedValueOnce();

    const component = await renderProvider({ offline: true });

    await expectChildRendered(component);

    await expectEventually(() => {
      expect(logger.info).toHaveBeenCalledWith('Starting in offline mode; skipping cloud sync');
    });
  });

  it('handles profile loading failure gracefully', async () => {
    const { loadActiveProfileId } = require('../src/storage');
    loadActiveProfileId.mockRejectedValueOnce(new Error('Storage error'));

    audioServiceMock.initialize.mockResolvedValueOnce();

    const component = await renderProvider();

    await expectChildRendered(component);
  });

  it('handles telemetry dump failures gracefully', async () => {
    audioServiceMock.initialize.mockResolvedValueOnce();

    // Mock telemetry.dump to throw
    mockTelemetry.dump.mockRejectedValue(new Error('Telemetry dump failed'));

    const component = await renderProvider();

    await expectChildRendered(component);

    await expectEventually(() => {
      expect(mockTelemetry.dump).toHaveBeenCalled();
    });

    expectNoErrorMessage(component);
    await expectEventually(() => {
      expect(logger.warn).toHaveBeenCalledWith('Failed to upload telemetry batch', expect.any(Error));
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('handles telemetry upload failures gracefully', async () => {
    audioServiceMock.initialize.mockResolvedValueOnce();

    // Mock telemetry.dump to return events and uploadTelemetry to fail
    mockTelemetry.dump.mockResolvedValue(['event1', 'event2']);
    mockServices.uploadTelemetry.mockRejectedValue(new Error('Upload failed'));

    const component = await renderProvider();

    await expectChildRendered(component);

    await expectEventually(() => {
      expect(mockTelemetry.dump).toHaveBeenCalled();
    });

    await expectEventually(() => {
      expect(mockServices.uploadTelemetry).toHaveBeenCalledWith(['event1', 'event2']);
    });

    expectNoErrorMessage(component);
    await expectEventually(() => {
      expect(logger.warn).toHaveBeenCalledWith('Failed to upload telemetry batch', expect.any(Error));
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('cleans up intervals and timeouts on unmount', async () => {
    audioServiceMock.initialize.mockResolvedValueOnce();

    const component = await renderProvider();

    await expectChildRendered(component);

    expect(() =>
      act(() => {
        component.unmount();
      }),
    ).not.toThrow();

    await expectEventually(() => {
      expect(audioServiceMock.dispose).toHaveBeenCalled();
    });
  });

  it('refreshes models when an update event is emitted', async () => {
    audioServiceMock.initialize.mockResolvedValueOnce();

    const component = await renderProvider();
    await expectChildRendered(component);

    await expectEventually(() => {
      expect(mockOnMlpModelUpdated).toHaveBeenCalled();
    });

    await expectEventually(() => {
      expect(checkForModelUpdateMock).toHaveBeenCalled();
    });
    await expectEventually(() => {
      expect(shouldAllowModelRefreshMock).toHaveBeenCalled();
    });
    await expectEventually(() => {
      expect(logger.info).toHaveBeenCalledWith('Model refresh finished');
    });
    const initialRefreshLogCount = getModelRefreshLogCount();
    checkForModelUpdateMock.mockClear();

    const listener = mockOnMlpModelUpdated.mock.calls.at(-1)?.[0];
    expect(listener).toBeDefined();
    await act(async () => {
      listener?.();
      await Promise.resolve();
    });

    await expectEventually(() => {
      expect(checkForModelUpdateMock).toHaveBeenCalled();
    });
    await expectEventually(() => {
      expect(getModelRefreshLogCount()).toBeGreaterThan(initialRefreshLogCount);
    });

    await act(async () => {
      component.unmount();
    });
  });

  it('queues model refresh requests when an event arrives during an active refresh', async () => {
    audioServiceMock.initialize.mockResolvedValueOnce();

    let resolveFirstRefresh: (() => void) | undefined;
    checkForModelUpdateMock
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirstRefresh = resolve;
          }),
      )
      .mockResolvedValue(true);

    const component = await renderProvider();
    await expectChildRendered(component);

    await expectEventually(() => {
      expect(checkForModelUpdateMock).toHaveBeenCalled();
    });

    const initialCalls = checkForModelUpdateMock.mock.calls.length;

    const listener = mockOnMlpModelUpdated.mock.calls.at(-1)?.[0];
    expect(listener).toBeDefined();

    await act(async () => {
      listener?.();
    });

    expect(checkForModelUpdateMock.mock.calls.length).toBe(initialCalls);

    await act(async () => {
      resolveFirstRefresh?.();
    });

    await expectEventually(() => {
      expect(checkForModelUpdateMock.mock.calls.length).toBe(initialCalls + 1);
    });

    await act(async () => {
      component.unmount();
    });
  });

  it('skips model refresh when connectivity disallows downloads', async () => {
    audioServiceMock.initialize.mockResolvedValueOnce();
    shouldAllowModelRefreshMock.mockResolvedValue(false);

    const component = await renderProvider();
    await expectChildRendered(component);

    await expectEventually(() => {
      expect(shouldAllowModelRefreshMock).toHaveBeenCalled();
    });
    expect(checkForModelUpdateMock).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalledWith('Model refresh finished');

    await act(async () => {
      component.unmount();
    });
  });

  it('provides initialized services through context', async () => {
    audioServiceMock.initialize.mockResolvedValueOnce();

    const Consumer = () => {
      const services = useServices();
      return (
        <div
          data-audio-service-ready={services.audioService?.initialize === audioServiceMock.initialize}
        />
      );
    };

    const component = await renderProvider({ child: <Consumer /> });

    await expectEventually(() => {
      const nodes = component.root.findAll(
        (node) => node.props['data-audio-service-ready'] === true,
      );
      expect(nodes.length).toBeGreaterThan(0);
    });
  });

});
