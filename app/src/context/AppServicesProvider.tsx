import { runDailyJobs, checkAllGesturesForDecliningAccuracy, checkPracticeRecommendations } from '../services/dailyJobs';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_DAILY_JOB_KEY = 'lastDailyJob';
import React, { ReactNode, useEffect } from 'react';
import { audioService, backupService, checkForModelUpdate, syncService, syncTrainingData, gestureDataProtector, gdprService } from '../services';
import { adaptiveLearningService } from '../services/adaptiveLearningService';
import LoadingIndicator from '../components/LoadingIndicator';
import { useMessage } from './MessageContext';
import { loadActiveProfileId } from '../storage';
import { logger } from '../utils/logger';
import { uploadTelemetry } from '../services/analytics';
import { telemetry } from '../telemetry/recorder';
import { useServicesStore, type Services } from '../stores/servicesStore';

interface ProviderProps {
  children: ReactNode;
  offline?: boolean;
}

const services: Services = { audioService, adaptiveLearningService, backupService, gestureDataProtector, gdprService };

export const AppServicesProvider = ({ children, offline = false }: ProviderProps) => {
  const { setMessage } = useMessage();
  const { setServices, setReady, isReady } = useServicesStore();

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    let telemetryTimeout: ReturnType<typeof setTimeout> | undefined;
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
        setServices(services);
        setReady(true);
        if (!offline) {
          const now = new Date().toISOString().slice(0, 10);
          AsyncStorage.getItem(LAST_DAILY_JOB_KEY).then(lastRun => {
            if (lastRun !== now) {
              runDailyJobs().then(() => {
                AsyncStorage.setItem(LAST_DAILY_JOB_KEY, now);
                checkAllGesturesForDecliningAccuracy();
                checkPracticeRecommendations();
              });
            }
          });

          interval = setInterval(() => {
            syncTrainingData().catch(() => {});
            runModelUpdate().catch(() => {});
            syncService.uploadPendingTrainingData().catch(() => {});
          }, 6 * 60 * 60 * 1000);

          syncTrainingData().catch(() => {});
          runModelUpdate().catch(() => {});
          syncService.uploadPendingTrainingData().catch(() => {});

          // Lightweight periodic telemetry upload
          const runPeriodicTelemetryUpload = async () => {
            const events = await telemetry.dump();
            if (events.length) {
              await uploadTelemetry(events);
            }
            telemetryTimeout = setTimeout(runPeriodicTelemetryUpload, 30 * 1000);
          };
          runPeriodicTelemetryUpload();
        } else {
          logger.info('Starting in offline mode; skipping cloud sync');
        }

      } catch (e) {
        logger.error('Dienste konnten nicht initialisiert werden:', e);
        setMessage('Dienste konnten nicht gestartet werden. Bitte Internetverbindung prüfen und erneut versuchen.');
        setReady(true);
      }
    }

    initializeServices();
    return () => {
      if (interval) clearInterval(interval);
      if (telemetryTimeout) clearTimeout(telemetryTimeout);
      audioService.dispose().catch(() => {});
    };
  }, [offline, setMessage]);

  if (!isReady) {
    return <LoadingIndicator />;
  }

  return <>{children}</>;
};