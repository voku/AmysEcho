import { runDailyJobs, checkAllGesturesForDecliningAccuracy, checkPracticeRecommendations } from '../services/dailyJobs';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_DAILY_JOB_KEY = 'lastDailyJob';
import React, { ReactNode, useEffect, useState } from 'react';
import {
  audioService,
  backupService,
  syncTrainingData,
  gestureDataProtector,
  gdprService,
  checkForModelUpdate,
  shouldAllowModelRefresh,
} from '../services';
import { onMlpModelUpdated } from '../services/dgsModelClient';
import { adaptiveLearningService } from '../services/adaptiveLearningService';
import LoadingIndicator from '../components/LoadingIndicator';
import { useMessage } from './MessageContext';
import { loadActiveProfileId } from '../storage';
import { logger } from '../utils/logger';
import { telemetry } from '../telemetry/recorder';
import { ServicesContext, type Services } from './ServicesContext';

interface ProviderProps {
  children: ReactNode;
  offline?: boolean;
}

const defaultServices: Services = {
  audioService,
  adaptiveLearningService,
  backupService,
  gestureDataProtector,
  gdprService,
};

export const AppServicesProvider = ({ children, offline = false }: ProviderProps) => {
  const { setMessage } = useMessage();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval>;
    let telemetryTimeout: ReturnType<typeof setTimeout> | undefined;
    let modelRefreshPromise: Promise<void> | null = null;
    let pendingModelRefresh = false;
    const runModelRefresh = (): Promise<void> => {
      if (modelRefreshPromise) {
        pendingModelRefresh = true;
        return modelRefreshPromise;
      }

      const execute = async () => {
        try {
          const allowed = await shouldAllowModelRefresh();
          if (!allowed) {
            logger.info('Skipping model refresh due to connectivity restrictions');
            return;
          }

          const pid = await loadActiveProfileId().catch(() => null);
          const updated = await checkForModelUpdate(pid ?? undefined, {
            skipNetworkCheck: true,
          });

          if (updated) {
            try {
              const { mlService } = require('../services');
              const loader = mlService?.loadModels;
              if (loader) {
                await Promise.resolve(loader.call(mlService));
                logger.info('Reloaded ML models after refresh');
              }
            } catch (loadError) {
              logger.warn('Failed to reload ML models after refresh', loadError as Error);
            }
          }
        } catch (e) {
          logger.warn('Failed to run model refresh', e as Error);
        }
      };

      modelRefreshPromise = execute().finally(() => {
        modelRefreshPromise = null;
        if (pendingModelRefresh && !cancelled) {
          pendingModelRefresh = false;
          runModelRefresh().catch((queuedError) => {
            logger.warn('Failed to run queued model refresh', queuedError);
          });
        } else {
          pendingModelRefresh = false;
        }
      });

      return modelRefreshPromise;
    };
    async function initializeServices(): Promise<(() => void) | undefined> {
      let unsubscribeModelUpdates: (() => void) | undefined;
      try {
        // WebView + server path: no native TensorFlow model loading here.
        await audioService.initialize();
        if (!offline) {
          // Synchronous-first attempt to run telemetry upload so tests can assert behavior reliably
          try {
            const firstEvents = await telemetry.dump();
            if (firstEvents.length) {
              const { uploadTelemetry: ut } = require('../services');
              await ut(firstEvents);
            }
          } catch (e) {
            logger.warn('Failed to upload telemetry batch', e as Error);
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

          unsubscribeModelUpdates = onMlpModelUpdated(() => {
            logger.info('MLP model update event received');
            runModelRefresh().catch((eventError) => {
              logger.warn('Failed to refresh model after update event', eventError);
            });
          });

          interval = setInterval(() => {
            syncTrainingData().catch(() => {});
            runModelRefresh().catch(() => {});
          }, 6 * 60 * 60 * 1000);

          syncTrainingData().catch(() => {});
          runModelRefresh().catch(() => {});

          // Lightweight periodic telemetry upload
          const runPeriodicTelemetryUpload = async () => {
            try {
              const events = await telemetry.dump();
              if (events.length) {
                const { uploadTelemetry: ut } = require('../services');
                await ut(events);
              }
            } catch (e) {
              logger.warn('Failed to upload telemetry batch', e as Error);
            } finally {
              if (!cancelled) {
                telemetryTimeout = setTimeout(runPeriodicTelemetryUpload, 30 * 1000);
              }
            }
          };
          runPeriodicTelemetryUpload();
        } else {
          logger.info('Starting in offline mode; skipping cloud sync');
        }

      } catch (e) {
        logger.error('Dienste konnten nicht initialisiert werden:', e);
        setMessage('Dienste konnten nicht gestartet werden. Bitte Internetverbindung prüfen und erneut versuchen.');
      } finally {
        if (!cancelled) {
          setIsReady(true);
        }
      }

      return unsubscribeModelUpdates;
    }

    const cleanupPromise = initializeServices();
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      if (telemetryTimeout) clearTimeout(telemetryTimeout);
      try {
        // Ensure we don't throw if dispose does not return a Promise
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        Promise.resolve((audioService as any).dispose?.()).catch(() => {});
      } catch {}
      cleanupPromise
        .then((cleanup) => {
          if (typeof cleanup === 'function') cleanup();
        })
        .catch(() => {});
    };
  }, [offline, setMessage]);

  if (!isReady) {
    return <LoadingIndicator />;
  }

  return <ServicesContext.Provider value={defaultServices}>{children}</ServicesContext.Provider>;
};
