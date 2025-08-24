import React, { ReactNode, useEffect, useState } from 'react';
import { audioService, backupService, checkForModelUpdate, syncService, syncTrainingData, gestureDataProtector, gdprService } from '../services';
import { adaptiveLearningService } from '../services/adaptiveLearningService';
import { ActivityIndicator, View } from 'react-native';
import { useMessage } from './MessageContext';
import { loadCustomModelUri, loadActiveProfileId } from '../storage';
import {
  CONFIDENCE_THRESHOLD,
  ENABLE_REMOTE_CLASSIFICATION,
  REMOTE_RETRY_MS,
  REMOTE_TIMEOUT_MS,
  SOFTMAX_TEMPERATURE,
} from '../constants';
import { logger } from '../utils/logger';
import { ServicesContext, type Services } from './ServicesContext';
import { uploadTelemetry } from '../services/analytics';
import { telemetry } from '../telemetry/recorder';

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
    let telemetryInterval: ReturnType<typeof setInterval> | undefined;
    async function runModelUpdate() {
      try {
        const pid = await loadActiveProfileId().catch(() => null);
        await checkForModelUpdate(pid ?? undefined);
      } catch (e) {
        logger.warn('Failed to run model update check', e);
      }
    }
    async function initializeServices() {
      try {
        // WebView + server path: no native TensorFlow model loading here.
        await audioService.initialize();
        setAreServicesReady(true);
        if (!offline) {
          interval = setInterval(() => {
            syncTrainingData().catch(() => {});
            runModelUpdate().catch(() => {});
            syncService.uploadPendingTrainingData().catch(() => {});
          }, 6 * 60 * 60 * 1000);

          syncTrainingData().catch(() => {});
          runModelUpdate().catch(() => {});
          syncService.uploadPendingTrainingData().catch(() => {});

          // Lightweight periodic telemetry upload
          telemetryInterval = setInterval(() => {
            const events = telemetry.dump();
            if (events.length) uploadTelemetry(events).catch(() => {});
          }, 30 * 1000);
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
      if (telemetryInterval) clearInterval(telemetryInterval);
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
