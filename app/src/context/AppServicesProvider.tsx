import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
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
import { Asset } from 'expo-asset';
import {GESTURE_CLASSIFIER_MODEL, HAND_LANDMARKER_MODEL} from '../constants/modelPaths';
import { loadCustomModelUri } from '../storage';
import {
  CONFIDENCE_THRESHOLD,
  ENABLE_REMOTE_CLASSIFICATION,
  REMOTE_RETRY_MS,
  REMOTE_TIMEOUT_MS,
} from '../constants';
import { logger } from '../utils/logger';

interface Services {
  mlService: typeof mlService;
  audioService: typeof audioService;
  adaptiveLearningService: typeof adaptiveLearningService;
  backupService: typeof backupService;
  gestureDataProtector: typeof gestureDataProtector;
}

const ServicesContext = createContext<Services | null>(null);
const gestureLabels = require('../../assets/models/gesture_labels.json');

export const useServices = () => {
  const context = useContext(ServicesContext);
  if (!context) {
    throw new Error('useServices must be used within an AppServicesProvider');
  }
  return context;
};

interface ProviderProps {
  children: ReactNode;
  offline?: boolean;
}

const services = { mlService, audioService, adaptiveLearningService, backupService, gestureDataProtector };

export const AppServicesProvider = ({ children, offline = false }: ProviderProps) => {
  const [areServicesReady, setAreServicesReady] = useState(false);

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

  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
};
