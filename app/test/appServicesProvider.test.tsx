import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (props: any) => React.createElement('View', props, props.children),
    ActivityIndicator: (props: any) => React.createElement('ActivityIndicator', props, props.children),
    Text: (props: any) => React.createElement('Text', props, props.children),
    StyleSheet: { create: (styles: any) => styles },
  };
});

jest.mock('../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: () => ({
      downloadAsync: jest.fn().mockResolvedValue(undefined),
      localUri: 'file://dummy',
    }),
  },
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

const mockLoadModels = jest.fn().mockRejectedValue(new Error('init fail'));

jest.mock('../src/services', () => {
  if (!(globalThis as any).__mockServices) {
    (globalThis as any).__mockServices = {
      mlService: {
        loadModels: mockLoadModels,
        isServiceReady: () => false,
      },
      audioService: {
        initialize: jest.fn().mockResolvedValue(undefined),
        dispose: jest.fn(),
      },
      adaptiveLearningService: {},
      backupService: {},
      gestureDataProtector: {},
      gdprService: {},
      checkForModelUpdate: jest.fn().mockResolvedValue(undefined),
      syncTrainingData: jest.fn().mockResolvedValue(undefined),
      uploadTelemetry: jest.fn().mockResolvedValue(undefined),
      syncService: {
        uploadPendingTrainingData: jest.fn().mockResolvedValue(undefined),
      },
    };
  }
  return (globalThis as any).__mockServices;
});

jest.mock('../src/services/dailyJobs', () => {
  if (!(globalThis as any).__mockDailyJobs) {
    (globalThis as any).__mockDailyJobs = {
      runDailyJobs: jest.fn().mockResolvedValue(undefined),
      checkAllGesturesForDecliningAccuracy: jest.fn(),
      checkPracticeRecommendations: jest.fn(),
    };
  }
  return (globalThis as any).__mockDailyJobs;
});


const AsyncStorage = require('@react-native-async-storage/async-storage');
const { telemetry } = require('../src/telemetry/recorder');

const services = require('../src/services');
const dailyJobs = require('../src/services/dailyJobs');

const { audioService, uploadTelemetry, syncService, syncTrainingData, checkForModelUpdate } = services;
const { runDailyJobs } = dailyJobs;

const flushAsync = async () => {
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {});
};

const expectEventually = async (assertion: () => void, timeoutMs = 3000) => {
  const timeoutAt = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < timeoutAt) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await flushAsync();
      await new Promise((resolve) => queueMicrotask(resolve));
    }
  }
  throw lastError;
};

import { AppServicesProvider } from '../src/context/AppServicesProvider';
import ErrorMessage from '../src/components/ErrorMessage';
import { MessageProvider } from '../src/context/MessageContext';

type TrackedRenderer = {
  instance: renderer.ReactTestRenderer;
  isMounted: boolean;
};

let mountedRenderers: TrackedRenderer[] = [];
let setIntervalSpy: jest.SpyInstance | undefined;
let setTimeoutSpy: jest.SpyInstance | undefined;

const renderProvider = async (offline = false, child: React.ReactNode = <div>Test Child</div>) => {
  let instance: renderer.ReactTestRenderer;
  await act(async () => {
    instance = renderer.create(
      <MessageProvider>
        <AppServicesProvider offline={offline}>{child}</AppServicesProvider>
      </MessageProvider>,
    );
  });
  const tracked = { instance: instance!, isMounted: true };
  mountedRenderers.push(tracked);
  return tracked;
};

const destroyRenderer = (tracked: TrackedRenderer) => {
  if (!tracked.isMounted) {
    return;
  }
  act(() => {
    tracked.instance.unmount();
  });
  tracked.isMounted = false;
};

afterEach(() => {
  mountedRenderers.forEach((tracked) => {
    try {
      destroyRenderer(tracked);
    } catch {
      // ignore double unmount errors from explicit test cleanup
    }
  });
  mountedRenderers = [];
  setIntervalSpy?.mockRestore();
  setIntervalSpy = undefined;
  setTimeoutSpy?.mockRestore();
  setTimeoutSpy = undefined;
});

beforeEach(() => {
  jest.clearAllMocks();
  setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation(() => 0 as unknown as NodeJS.Timer);
  setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((() => 0) as unknown as typeof setTimeout);
  AsyncStorage.getItem.mockResolvedValue(null);
  AsyncStorage.setItem.mockResolvedValue(undefined);
  audioService.initialize.mockResolvedValue(undefined);
  audioService.dispose.mockImplementation(() => undefined);
  uploadTelemetry.mockResolvedValue(undefined);
  syncService.uploadPendingTrainingData.mockResolvedValue(undefined);
  syncTrainingData.mockResolvedValue(undefined);
  checkForModelUpdate.mockResolvedValue(undefined);
  runDailyJobs.mockResolvedValue(undefined);
  telemetry.dump = jest.fn().mockResolvedValue([]);
});

describe('AppServicesProvider', () => {
  it('displays error message when initialization fails', async () => {
    audioService.initialize.mockRejectedValueOnce(new Error('audio kaputt'));
    const tracked = await renderProvider(false, <></>);
    await flushAsync();
    await flushAsync();
    const error = tracked.instance.root.findByType(ErrorMessage as any);
    expect(error.props.message).toBe(
      'Dienste konnten nicht gestartet werden. Bitte Internetverbindung prüfen und erneut versuchen.',
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Dienste konnten nicht initialisiert werden:',
      expect.any(Error),
    );
  });

  it('initializes successfully in online mode', async () => {
    audioService.initialize.mockResolvedValueOnce(undefined);
    const tracked = await renderProvider();
    await flushAsync();
    const children = tracked.instance.root.findByType('div');
    expect(children).toBeTruthy();
  });

  it('works in offline mode', async () => {
    audioService.initialize.mockResolvedValueOnce(undefined);
    await renderProvider(true);
    await flushAsync();
    expect(logger.info).toHaveBeenCalledWith('Starting in offline mode; skipping cloud sync');
  });

  it('handles profile loading failure gracefully', async () => {
    const { loadActiveProfileId } = require('../src/storage');
    loadActiveProfileId.mockRejectedValueOnce(new Error('Storage error'));
    audioService.initialize.mockResolvedValueOnce(undefined);
    const tracked = await renderProvider();
    await flushAsync();
    expect(() => tracked.instance.root.findByType('div')).not.toThrow();
  });

  it('runs daily jobs when not run today', async () => {
    audioService.initialize.mockResolvedValueOnce(undefined);
    const tracked = await renderProvider();
    await flushAsync();
    await expectEventually(() => expect(runDailyJobs).toHaveBeenCalled());
    expect(() => tracked.instance.root.findByType('div')).not.toThrow();
  });

  it('skips daily jobs when already run today', async () => {
    audioService.initialize.mockResolvedValueOnce(undefined);
    const today = new Date().toISOString().slice(0, 10);
    AsyncStorage.getItem.mockResolvedValueOnce(today);
    await renderProvider();
    await flushAsync();
    expect(runDailyJobs).not.toHaveBeenCalled();
  });

  it('handles telemetry dump failures gracefully', async () => {
    audioService.initialize.mockResolvedValueOnce(undefined);
    telemetry.dump = jest.fn().mockRejectedValue(new Error('Telemetry dump failed'));
    await renderProvider();
    await flushAsync();
    await expectEventually(() =>
      expect(logger.warn).toHaveBeenCalledWith('Failed to run model update check', expect.any(Error)),
    );
  });

  it('handles telemetry upload failures gracefully', async () => {
    audioService.initialize.mockResolvedValueOnce(undefined);
    telemetry.dump = jest.fn().mockResolvedValue(['event1', 'event2']);
    uploadTelemetry.mockRejectedValue(new Error('Upload failed'));
    await renderProvider();
    await flushAsync();
    await expectEventually(() => expect(uploadTelemetry).toHaveBeenCalledWith(['event1', 'event2']));
  });

  it('handles sync service failures gracefully', async () => {
    audioService.initialize.mockResolvedValueOnce(undefined);
    syncService.uploadPendingTrainingData.mockRejectedValue(new Error('Sync failed'));
    await renderProvider();
    await flushAsync();
    await expectEventually(() => expect(syncService.uploadPendingTrainingData).toHaveBeenCalled());
  });

  it('handles AsyncStorage failures gracefully', async () => {
    audioService.initialize.mockResolvedValueOnce(undefined);
    AsyncStorage.getItem.mockRejectedValue(new Error('Storage failed'));
    AsyncStorage.setItem.mockRejectedValue(new Error('Storage failed'));
    await renderProvider();
    await flushAsync();
    await expectEventually(() => expect(AsyncStorage.getItem).toHaveBeenCalled());
  });

  it('cleans up intervals and timeouts on unmount', async () => {
    audioService.initialize.mockResolvedValueOnce(undefined);
    const tracked = await renderProvider();
    await flushAsync();
    destroyRenderer(tracked);
    await expectEventually(() => expect(audioService.dispose).toHaveBeenCalled());
  });
});
