import React, { ReactNode, useEffect, useState } from 'react';
import { audioService, backupService, checkForModelUpdate, syncService, syncTrainingData, gestureDataProtector, gdprService } from '../services';
import { adaptiveLearningService } from '../services/adaptiveLearningService';
import { ActivityIndicator, View } from 'react-native';
import { useMessage } from './MessageContext';
import { loadCustomModelUri } from '../storage';
import {
  CONFIDENCE_THRESHOLD,
  ENABLE_REMOTE_CLASSIFICATION,
  REMOTE_RETRY_MS,
  REMOTE_TIMEOUT_MS,
  SOFTMAX_TEMPERATURE,
} from '../constants';
import { logger } from '../utils/logger';
import { ServicesContext, type Services } from './ServicesContext';

const gestureLabels = require('../../assets/models/gesture_labels.json');

interface ProviderProps {
  children: ReactNode;
  offline?: boolean;
}

const services: Services = { audioService, adaptiveLearningService, backupService, gestureDataProtector, gdprService };

export const AppServicesProvider = ({ children, offline = false }: ProviderProps) => {
  const [areServicesReady, setAreServicesReady] = useState(false);
  const { setMessage } = useMessage();

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    async function initializeServices() {
      try {
        // WebView + server path: no native TFLite model loading here.
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
        setMessage(
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
    <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>
  );
};
