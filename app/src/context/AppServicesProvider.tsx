import React, { ReactNode, useEffect, useRef, useState } from 'react';
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
  const { showToast } = useMessage();
  const [isReady, setIsReady] = useState(false);
  const initializedRef = useRef(false);
  const refreshStateRef = useRef({
    promise: Promise.resolve() as Promise<void>,
    running: false,
    queued: 0,
  });

  useEffect(() => {
    if (initializedRef.current) {
      return;
    }
    initializedRef.current = true;

    let cancelled = false;
    let interval: ReturnType<typeof setInterval>;
    let telemetryTimeout: ReturnType<typeof setTimeout> | undefined;
    const refreshState = refreshStateRef.current;

    const startRefresh = async (): Promise<void> => {
      if (cancelled) {
        refreshState.queued = 0;
        refreshState.promise = Promise.resolve();
        refreshState.running = false;
        return;
      }

      refreshState.running = true;

      try {
        const allowed = await shouldAllowModelRefresh();
        if (!allowed) {
          logger.info('Skipping model refresh due to connectivity restrictions');
          return;
        }

        if (cancelled) {
          return;
        }

        const pid = await loadActiveProfileId().catch(() => null);

        if (cancelled) {
          return;
        }

        const updated = await checkForModelUpdate(pid ?? undefined, {
          skipNetworkCheck: true,
        });

        if (updated) {
          logger.info('Model refresh finished');
        }
      } catch (e) {
        logger.warn('Failed to run model refresh', e as Error);
      } finally {
        refreshState.running = false;

        if (!cancelled && refreshState.queued > 0) {
          refreshState.queued -= 1;
          refreshState.promise = startRefresh();
          await refreshState.promise;
        } else {
          if (cancelled) {
            refreshState.queued = 0;
          }
          refreshState.promise = Promise.resolve();
        }
      }
    };

    const runModelRefresh = (): Promise<void> => {
      if (cancelled) {
        return refreshState.promise;
      }

      if (refreshState.running) {
        refreshState.queued += 1;
        return refreshState.promise;
      }

      const promise = startRefresh();
      refreshState.promise = promise;
      return promise;
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
          if (!refreshState.running && refreshState.queued === 0) {
            runModelRefresh().catch(() => {});
          }

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
        showToast({
          tone: 'error',
          message: 'Dienste konnten nicht gestartet werden. Bitte Internetverbindung prüfen und erneut versuchen.',
          durationMs: 8000,
        });
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
      initializedRef.current = false;
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
  }, [offline, showToast]);

  if (!isReady) {
    return <LoadingIndicator />;
  }

  return <ServicesContext.Provider value={defaultServices}>{children}</ServicesContext.Provider>;
};
