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

jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: () => ({
      downloadAsync: jest.fn().mockResolvedValue(undefined),
      localUri: 'file://dummy',
    }),
  },
}));

jest.mock('../src/storage', () => ({
  loadCustomModelUri: jest.fn().mockResolvedValue(null),
}));

jest.mock('../src/constants/modelPaths', () => ({
  GESTURE_CLASSIFIER_MODEL: 1,
  HAND_LANDMARKER_MODEL: 2,
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

const loadModels = jest.fn().mockRejectedValue(new Error('init fail'));

jest.mock('../src/services/adaptiveLearningService', () => ({
  adaptiveLearningService: {},
}));

jest.mock('../src/services', () => ({
  mlService: {
    loadModels,
    isServiceReady: () => false,
  },
  audioService: {
    initialize: jest.fn().mockResolvedValue(undefined),
    dispose: jest.fn(),
  },
  adaptiveLearningService: {},
  backupService: {},
  gestureDataProtector: {},
  checkForModelUpdate: jest.fn(),
  syncTrainingData: jest.fn(),
  syncService: {
    uploadPendingTrainingData: jest.fn(),
    checkForNewModel: jest.fn(),
  },
}));

import { AppServicesProvider } from '../src/context/AppServicesProvider';
import ErrorMessage from '../src/components/ErrorMessage';

describe('AppServicesProvider', () => {
  it('displays error message when initialization fails', async () => {
    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(
        <AppServicesProvider>
          <></>
        </AppServicesProvider>,
      );
    });
    await act(async () => {});
    await act(async () => {});
    const error = (component as renderer.ReactTestRenderer).root.findByType(ErrorMessage as any);
    expect(error.props.message).toBe('init fail');
  });
});
