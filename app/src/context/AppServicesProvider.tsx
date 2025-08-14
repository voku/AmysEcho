import React, { ReactNode, useEffect, useState } from 'react';
import {
  audioService,
  backupService,
  checkForModelUpdate,
  mlService,
  syncService,
  syncTrainingData,
  gestureDataProtector,
} from '../services';
import { adaptiveLearningService } from '../services/adaptiveLearningService';
import { ActivityIndicator, View } from 'react-native';
import ErrorMessage from '../components/ErrorMessage';
import { Asset } from 'expo-asset';
import { GESTURE_CLASSIFIER_MODEL, HAND_LANDMARKER_MODEL } from '../constants/modelPaths';
import { loadCustomModelUri } from '../storage';
import {
  CONFIDENCE_THRESHOLD,
  ENABLE_REMOTE_CLASSIFICATION,
  REMOTE_RETRY_MS,
  REMOTE_TIMEOUT_MS,
} from '../constants';
import { logger } from '../utils/logger';
import { ServicesContext, type Services } from './ServicesContext';

const gestureLabels = require('../../assets/models/gesture_labels.json');

interface ProviderProps {
  children: ReactNode;
  offline?: boolean;
}

const services: Services = {
  mlService,
  audioService,
  adaptiveLearningService,
  backupService,
  gestureDataProtector,
};

export const AppServicesProvider = ({ children, offline = false }: ProviderProps) => {
  const [areServicesReady, setAreServicesReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    async function initializeServices() {
      try {
        const landmarkAsset = Asset.fromModule(HAND_LANDMARKER_MODEL);
        await landmarkAsset.downloadAsync();
        if (!landmarkAsset.localUri) {
          throw new Error('Failed to get local URI for landmark model asset.');
        }

        const gestureAsset = Asset.fromModule(GESTURE_CLASSIFIER_MODEL);
        await gestureAsset.downloadAsync();
        if (!gestureAsset.localUri) {
          throw new Error('Failed to get local URI for gesture model asset.');
        }

        let customGestureModelUri = await loadCustomModelUri();
        let gestureModelSource: { url: string };

        if (customGestureModelUri) {
          gestureModelSource = { url: customGestureModelUri };
        } else {
          gestureModelSource = { url: gestureAsset.localUri };
        }

        await mlService.loadModels(
          { url: landmarkAsset.localUri },
          gestureModelSource,
          gestureLabels,
          {
            confidenceThreshold: CONFIDENCE_THRESHOLD,
            enableRemoteClassification: offline ? false : ENABLE_REMOTE_CLASSIFICATION,
            remoteRetryMs: REMOTE_RETRY_MS,
            processingTimeout: REMOTE_TIMEOUT_MS,
          },
        );
        await audioService.initialize();
        setAreServicesReady(true);
        if (!offline) {
          interval = setInterval(() => {
            syncTrainingData().catch(() => {});
            checkForModelUpdate().catch(() => {});
            syncService.uploadPendingTrainingData().catch(() => {});
            syncService.checkForNewModel().catch(() => {});
          }, 6 * 60 * 60 * 1000);

          syncTrainingData().catch(() => {});
          checkForModelUpdate().catch(() => {});
          syncService.uploadPendingTrainingData().catch(() => {});
          syncService.checkForNewModel().catch(() => {});
        } else {
          logger.info('Starting in offline mode; skipping cloud sync');
        }

      } catch (e) {
        logger.error('Failed to initialize services:', e);
        setInitError(
          'Failed to initialize services. Please check your connection and try again.',
        );
        setAreServicesReady(true);
      }
    }

    initializeServices();
    return () => {
      if (interval) clearInterval(interval);
      audioService.dispose().catch(() => {});
    };
  }, []);

  if (!areServicesReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ServicesContext.Provider value={services}>
      {children}
      <ErrorMessage message={initError} />
    </ServicesContext.Provider>
  );
};
