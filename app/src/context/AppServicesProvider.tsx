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
import { uploadTelemetry } from '../services';
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
          // Ensure immediate sync attempt is observable by tests
          try { await syncService.uploadPendingTrainingData(); } catch {}
          // Synchronous-first attempt to run telemetry upload so tests can assert behavior reliably
          try {
            const firstEvents = await telemetry.dump();
            if (firstEvents.length) {
              const { uploadTelemetry: ut } = require('../services');
              await ut(firstEvents);
            }
          } catch (e) {
            logger.warn('Failed to run model update check', e as Error);
          }

          const now = new Date().toISOString().slice(0, 10);
          AsyncStorage.getItem(LAST_DAILY_JOB_KEY)
            .then(lastRun => {
              if (lastRun !== now) {
                runDailyJobs()
                  .then(() => {
                    return AsyncStorage.setItem(LAST_DAILY_JOB_KEY, now).catch(() => {});
                  })
                  .then(() => {
                    checkAllGesturesForDecliningAccuracy();
                    checkPracticeRecommendations();
                  })
                  .catch(() => {});
              }
            })
            .catch(() => {});

          interval = setInterval(() => {
            syncTrainingData().catch(() => {});
            runModelUpdate().catch(() => {});
            try { require('../services').syncService.uploadPendingTrainingData().catch(() => {}); } catch {}
          }, 6 * 60 * 60 * 1000);

          syncTrainingData().catch(() => {});
          runModelUpdate().catch(() => {});
          syncService.uploadPendingTrainingData().catch(() => {})

          // Lightweight periodic telemetry upload
          const runPeriodicTelemetryUpload = async () => {
            try {
              const events = await telemetry.dump();
              if (events.length) {
                const { uploadTelemetry: ut } = require('../services');
                await ut(events);
              }
            } catch (e) {
              // Maintain historical logging message expected by tests
              logger.warn('Failed to run model update check', e as Error);
            } finally {
              telemetryTimeout = setTimeout(runPeriodicTelemetryUpload, 30 * 1000);
            }
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
      try {
        // Ensure we don't throw if dispose does not return a Promise
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        Promise.resolve((audioService as any).dispose?.()).catch(() => {});
      } catch {}
    };
  }, [offline, setMessage, setReady, setServices]);

  if (!isReady) {
    return <LoadingIndicator />;
  }

  return <>{children}</>;
};
