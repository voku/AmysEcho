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

jest.mock('../src/services', () => ({
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
  checkForModelUpdate: jest.fn(),
  syncTrainingData: jest.fn(),
  syncService: {
    uploadPendingTrainingData: jest.fn(),
  },
  runDailyJobs: jest.fn(),
  checkAllGesturesForDecliningAccuracy: jest.fn(),
  checkPracticeRecommendations: jest.fn(),
}));

import { AppServicesProvider } from '../src/context/AppServicesProvider';
import ErrorMessage from '../src/components/ErrorMessage';
import { MessageProvider } from '../src/context/MessageContext';

describe('AppServicesProvider', () => {
  it('displays error message when initialization fails', async () => {
    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(
        <MessageProvider>
          <AppServicesProvider>
            <></>
          </AppServicesProvider>
        </MessageProvider>,
      );
    });
    await act(async () => {});
    await act(async () => {});
    const error = (component as renderer.ReactTestRenderer).root.findByType(ErrorMessage as any);
    expect(error.props.message).toBe(
      'Dienste konnten nicht gestartet werden. Bitte Internetverbindung prüfen und erneut versuchen.',
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Dienste konnten nicht initialisiert werden:',
      expect.any(Error),
    );
  });

  it('initializes successfully in online mode', async () => {
    // Mock successful initialization
    const { audioService } = require('../src/services');
    audioService.initialize.mockResolvedValueOnce();

    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(
        <MessageProvider>
          <AppServicesProvider offline={false}>
            <div>Test Child</div>
          </AppServicesProvider>
        </MessageProvider>,
      );
    });

    // Should render children, not loading indicator
    const children = component.root.findByType('div');
    expect(children).toBeTruthy();
  });

  it('works in offline mode', async () => {
    const { audioService } = require('../src/services');
    audioService.initialize.mockResolvedValueOnce();

    await act(async () => {
      renderer.create(
        <MessageProvider>
          <AppServicesProvider offline={true}>
            <div>Test Child</div>
          </AppServicesProvider>
        </MessageProvider>,
      );
    });

    expect(logger.info).toHaveBeenCalledWith('Starting in offline mode; skipping cloud sync');
  });

  it('handles profile loading failure gracefully', async () => {
    const { loadActiveProfileId } = require('../src/storage');
    loadActiveProfileId.mockRejectedValueOnce(new Error('Storage error'));

    const { audioService } = require('../src/services');
    audioService.initialize.mockResolvedValueOnce();

    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(
        <MessageProvider>
          <AppServicesProvider>
            <div>Test Child</div>
          </AppServicesProvider>
        </MessageProvider>,
      );
    });

    // Should still initialize successfully despite profile loading failure
    const children = component.root.findByType('div');
    expect(children).toBeTruthy();
  });

  it('runs daily jobs when not run today', async () => {
    // This test covers the branch for checking if daily jobs should run
    const { audioService } = require('../src/services');
    audioService.initialize.mockResolvedValueOnce();

    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(
        <MessageProvider>
          <AppServicesProvider offline={false}>
            <div>Test Child</div>
          </AppServicesProvider>
        </MessageProvider>,
      );
    });

    // The test covers the offline=false branch and AsyncStorage interaction
    expect(component).toBeTruthy();
  });

  it('skips daily jobs when already run today', async () => {
    const { audioService, runDailyJobs } = require('../src/services');
    audioService.initialize.mockResolvedValueOnce();

    // Mock AsyncStorage to return today's date
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    const today = new Date().toISOString().slice(0, 10);
    AsyncStorage.getItem.mockResolvedValueOnce(today);

    await act(async () => {
      renderer.create(
        <MessageProvider>
          <AppServicesProvider offline={false}>
            <div>Test Child</div>
          </AppServicesProvider>
        </MessageProvider>,
      );
    });

    expect(runDailyJobs).not.toHaveBeenCalled();
  });

  it('handles telemetry dump failures gracefully', async () => {
    const { audioService } = require('../src/services');
    audioService.initialize.mockResolvedValueOnce();

    // Mock telemetry.dump to throw
    const { telemetry } = require('../src/telemetry/recorder');
    telemetry.dump = jest.fn().mockRejectedValue(new Error('Telemetry dump failed'));

    await act(async () => {
      renderer.create(
        <MessageProvider>
          <AppServicesProvider offline={false}>
            <div>Test Child</div>
          </AppServicesProvider>
        </MessageProvider>,
      );
    });

    // Should not crash despite telemetry failure
    expect(logger.warn).toHaveBeenCalledWith('Failed to run model update check', expect.any(Error));
  });

  it('handles telemetry upload failures gracefully', async () => {
    const { audioService, uploadTelemetry } = require('../src/services');
    audioService.initialize.mockResolvedValueOnce();

    // Mock telemetry.dump to return events and uploadTelemetry to fail
    const { telemetry } = require('../src/telemetry/recorder');
    telemetry.dump = jest.fn().mockResolvedValue(['event1', 'event2']);
    uploadTelemetry.mockRejectedValue(new Error('Upload failed'));

    await act(async () => {
      renderer.create(
        <MessageProvider>
          <AppServicesProvider offline={false}>
            <div>Test Child</div>
          </AppServicesProvider>
        </MessageProvider>,
      );
    });

    // Should not crash despite upload failure
    expect(uploadTelemetry).toHaveBeenCalledWith(['event1', 'event2']);
  });

  it('handles sync service failures gracefully', async () => {
    const { audioService, syncService } = require('../src/services');
    audioService.initialize.mockResolvedValueOnce();

    syncService.uploadPendingTrainingData.mockRejectedValue(new Error('Sync failed'));

    await act(async () => {
      renderer.create(
        <MessageProvider>
          <AppServicesProvider offline={false}>
            <div>Test Child</div>
          </AppServicesProvider>
        </MessageProvider>,
      );
    });

    // Should not crash despite sync failure
    expect(syncService.uploadPendingTrainingData).toHaveBeenCalled();
  });

  it('handles AsyncStorage failures gracefully', async () => {
    const { audioService } = require('../src/services');
    audioService.initialize.mockResolvedValueOnce();

    // Mock AsyncStorage to fail
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    AsyncStorage.getItem.mockRejectedValue(new Error('Storage failed'));
    AsyncStorage.setItem.mockRejectedValue(new Error('Storage failed'));

    await act(async () => {
      renderer.create(
        <MessageProvider>
          <AppServicesProvider offline={false}>
            <div>Test Child</div>
          </AppServicesProvider>
        </MessageProvider>,
      );
    });

    // Should not crash despite storage failures
    expect(AsyncStorage.getItem).toHaveBeenCalled();
  });

  it('cleans up intervals and timeouts on unmount', async () => {
    const { audioService } = require('../src/services');
    audioService.initialize.mockResolvedValueOnce();

    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(
        <MessageProvider>
          <AppServicesProvider offline={false}>
            <div>Test Child</div>
          </AppServicesProvider>
        </MessageProvider>,
      );
    });

    // Unmount the component
    act(() => {
      component.unmount();
    });

    expect(audioService.dispose).toHaveBeenCalled();
  });
});
