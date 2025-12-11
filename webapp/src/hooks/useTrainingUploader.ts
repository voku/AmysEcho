import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createTrainingZip, uploadTrainingZip, type TrainingUploadOptions } from '../training/trainingBundle';
import {
  enqueuePersistedBundle,
  listQueuedBundles,
  markBundleFailed,
  markBundleUploading,
  removeQueuedBundle,
  readBundleData,
  subscribeToBundleUpdates,
  type PersistedTrainingBundle,
} from '../training/trainingQueue';
import type { TrainingBundlePayload, TrainingJobInfo, UploadTrainingBundleResponse } from '../training/types';
import { normalizeTrainingJobStatus } from '../training/trainingBundle';
import { triggerTrainingJob } from '../training/trainingJob';
import { resolvePollUrl } from './useApiConfig';
import { HttpError, SESSION_EXPIRED_MESSAGE } from '../utils/http';

export type UploadState = 'idle' | 'preparing' | 'uploading' | 'queued' | 'success' | 'error';

type UploadOptions = TrainingUploadOptions & { apiBase?: string; refreshAccessToken?: () => Promise<string | null> };
type AuthRetryOptions = { token?: string; refreshAccessToken?: () => Promise<string | null> };

export type DefaultUploadOptions = Partial<UploadOptions>;

export function useTrainingUploader(
  options: { pollIntervalMs?: number; defaultOptions?: DefaultUploadOptions; retryDelayMs?: number; maxRetryDelayMs?: number } = {},
) {
  const pollIntervalMs = options.pollIntervalMs ?? 2000;
  const retryConfig = useMemo(
    () => ({ base: options.retryDelayMs ?? 2000, max: options.maxRetryDelayMs ?? 30000 }),
    [options.maxRetryDelayMs, options.retryDelayMs],
  );
  const defaultOptions = useMemo<DefaultUploadOptions>(() => options.defaultOptions ?? {}, [options.defaultOptions]);
  const buildAuthOptions = useCallback((options: Partial<UploadOptions>): AuthRetryOptions => {
    const auth: AuthRetryOptions = {};
    if (options.token) {
      auth.token = options.token;
    }
    if (options.refreshAccessToken) {
      auth.refreshAccessToken = options.refreshAccessToken;
    }
    return auth;
  }, []);

  const pollAuthOptions = useMemo<AuthRetryOptions>(() => buildAuthOptions(defaultOptions), [buildAuthOptions, defaultOptions]);
  const [state, setState] = useState<UploadState>('idle');
  const [lastResult, setLastResult] = useState<UploadTrainingBundleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const [queuedBundles, setQueuedBundles] = useState<PersistedTrainingBundle[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastQueuedKey, setLastQueuedKey] = useState<string | null>(null);
  const [trainingJob, setTrainingJob] = useState<TrainingJobInfo | null>(null);
  const [trainingJobError, setTrainingJobError] = useState<string | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncingRef = useRef(false);
  const queuedCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelayRef = useRef(retryConfig.base);

  useEffect(() => {
    retryDelayRef.current = retryConfig.base;
  }, [retryConfig.base]);


  const refreshQueue = useCallback(async () => {
    try {
      const bundles = await listQueuedBundles();
      setQueuedCount(bundles.length);
      setQueuedBundles(bundles);
      queuedCountRef.current = bundles.length;
      return bundles;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      setSyncError((prev) => prev ?? reason);
      return [];
    }
  }, []);

  useEffect(() => {
    void refreshQueue();
  }, [refreshQueue]);

  const resolveOptions = useCallback(
    (override?: DefaultUploadOptions): UploadOptions => {
      const merged = { ...defaultOptions, ...override };
      if (!merged.endpoint) {
        throw new Error('API-Endpunkt fehlt für Trainings-Uploads.');
      }
      return merged as UploadOptions;
    },
    [defaultOptions],
  );

  const isBundleRetryable = useCallback((bundle: PersistedTrainingBundle): boolean => {
    if (bundle.status === 'pending') return true;
    if (bundle.status !== 'failed') return false;
    const reason = bundle.lastError?.toLowerCase() ?? '';
    const isAuthFailure = reason.includes('401') || reason.includes(SESSION_EXPIRED_MESSAGE.toLowerCase());
    return !isAuthFailure;
  }, []);

  const withAuthRetry = useCallback(
    async <T>(operation: (tokenOverride?: string) => Promise<T>, options: AuthRetryOptions): Promise<T> => {
      try {
        return await operation(options.token);
      } catch (error) {
        if (error instanceof HttpError && error.status === 401) {
          try {
            const refreshed = await options.refreshAccessToken?.();
            if (refreshed) {
              return await operation(refreshed);
            }
          } catch (refreshError) {
            console.warn('Token-Refresh für Trainings-Upload fehlgeschlagen', refreshError);
          }
          throw new HttpError(401, SESSION_EXPIRED_MESSAGE);
        }
        throw error;
      }
    },
    [],
  );

  const applyTrainingJob = useCallback(
    (job: TrainingJobInfo | null, apiBaseOverride?: string) => {
      if (!job) return null;
      const resolvedPollUrl = resolvePollUrl(apiBaseOverride ?? defaultOptions.apiBase ?? '', job.pollUrl, job.jobId);
      const withPoll: TrainingJobInfo = {
        ...job,
        ...(resolvedPollUrl ? { pollUrl: resolvedPollUrl } : {}),
      };
      setTrainingJob(withPoll);
      setTrainingJobError(null);
      setLastResult((prev) =>
        prev
          ? {
              ...prev,
              ...(prev.trainingJob ? { trainingJob: withPoll } : {}),
            }
          : prev,
      );
      return withPoll;
    },
    [defaultOptions.apiBase],
  );

  const maybeTriggerTrainingJob = useCallback(
    async (options?: DefaultUploadOptions) => {
      const resolvedOptions = resolveOptions(options);
      if (trainingJob && (trainingJob.status === 'running' || trainingJob.status === 'queued')) {
        return null;
      }

      try {
        const triggered = await withAuthRetry(
          (tokenOverride) =>
            triggerTrainingJob(resolvedOptions.apiBase ?? '', tokenOverride ?? resolvedOptions.token),
          buildAuthOptions(resolvedOptions),
        );
        if (triggered) {
          return applyTrainingJob(triggered, resolvedOptions.apiBase);
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        setTrainingJobError(reason);
        return null;
      }

      return null;
    },
    [applyTrainingJob, buildAuthOptions, resolveOptions, trainingJob, withAuthRetry],
  );

  const syncQueued = useCallback(
    async (options?: DefaultUploadOptions): Promise<number> => {
      if (syncingRef.current) return 0;
      syncingRef.current = true;
      setSyncing(true);
      setSyncError(null);
      let resolvedOptions: UploadOptions;
      try {
        resolvedOptions = resolveOptions(options);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        setSyncError(reason);
        setSyncing(false);
        syncingRef.current = false;
        return 0;
      }
      const bundles = await refreshQueue();
      const pending = bundles.filter(isBundleRetryable);
      let uploaded = 0;
      let encounteredError = false;
      let trainingJobFromUploads: TrainingJobInfo | null = null;

      for (const bundle of pending) {
        try {
          await markBundleUploading(bundle.key);
          const zipData = await readBundleData(bundle.key);
          if (!zipData) {
            const corrupted = 'Gespeichertes Bundle ist beschädigt oder nicht mehr verfügbar.';
            await markBundleFailed(bundle.key, corrupted);
            setSyncError(corrupted);
            encounteredError = true;
            continue;
          }
          const { apiBase, ...uploadOptions } = resolvedOptions;
          const uploadResponse = await withAuthRetry(
            (tokenOverride) =>
              uploadTrainingZip(zipData, {
                ...uploadOptions,
                ...(tokenOverride ? { token: tokenOverride } : {}),
              }),
            buildAuthOptions(resolvedOptions),
          );
          if (uploadResponse.trainingJob) {
            trainingJobFromUploads = applyTrainingJob(uploadResponse.trainingJob, apiBase) ?? trainingJobFromUploads;
          }
          await removeQueuedBundle(bundle.key);
          uploaded += 1;
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          await markBundleFailed(bundle.key, reason);
          setSyncError(reason);
          encounteredError = true;
        }
      }

      const remaining = await refreshQueue();
      const hasPending = remaining.some(isBundleRetryable);
      if (!encounteredError) {
        retryDelayRef.current = retryConfig.base;
        setSyncError(null);
      } else {
        retryDelayRef.current = Math.min(retryDelayRef.current * 2, retryConfig.max);
      }
      setSyncing(false);
      syncingRef.current = false;

      if (!hasPending) {
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = null;
        }
        retryDelayRef.current = retryConfig.base;
      } else {
        const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
        if (isOnline && !syncingRef.current) {
          if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
          }
          retryTimeoutRef.current = setTimeout(() => {
            syncQueued(options).catch((err) => {
              console.warn('Automatische Synchronisation fehlgeschlagen', err);
            });
          }, retryDelayRef.current);
        }
      }

      if (uploaded > 0 && !trainingJobFromUploads) {
        await maybeTriggerTrainingJob(resolvedOptions);
      }

      return uploaded;
    },
    [
      applyTrainingJob,
      maybeTriggerTrainingJob,
      refreshQueue,
      resolveOptions,
      retryConfig.base,
      retryConfig.max,
      buildAuthOptions,
      isBundleRetryable,
      withAuthRetry,
    ],
  );

  useEffect(() => {
    const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!isOnline || queuedCount === 0) {
      return;
    }

    syncQueued().catch((err) => {
      console.warn('Synchronisation aus Warteschlange fehlgeschlagen', err);
    });
    // syncQueued is intentionally omitted to avoid re-running when the callback is recreated
    // due to training status updates. This effect should only react to queue length changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuedCount]);

  const syncBundle = useCallback(
    async (key: string, options?: DefaultUploadOptions) => {
      setSyncError(null);
      const bundles = await refreshQueue();
      const target = bundles.find((bundle) => bundle.key === key);
      if (!target) {
        setSyncError('Bundle wurde nicht gefunden.');
        return false;
      }

      try {
        const resolvedOptions = resolveOptions(options);
        await markBundleUploading(key);
        const zipData = await readBundleData(key);
        if (!zipData) {
          await markBundleFailed(key, 'Gespeichertes Bundle ist beschädigt.');
          setSyncError('Gespeichertes Bundle ist beschädigt.');
          await refreshQueue();
          return false;
        }

        const { apiBase, ...uploadOptions } = resolvedOptions;
        const uploadResponse = await withAuthRetry(
          (tokenOverride) =>
            uploadTrainingZip(zipData, {
              ...uploadOptions,
              ...(tokenOverride ? { token: tokenOverride } : {}),
            }),
          buildAuthOptions(resolvedOptions),
        );
        if (uploadResponse.trainingJob) {
          applyTrainingJob(uploadResponse.trainingJob, apiBase);
        }
        await removeQueuedBundle(key);
        await refreshQueue();
        if (!uploadResponse.trainingJob) {
          await maybeTriggerTrainingJob(resolvedOptions);
        }
        return true;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        await markBundleFailed(key, reason);
        setSyncError(reason);
        await refreshQueue();
        return false;
      }
    },
    [applyTrainingJob, buildAuthOptions, maybeTriggerTrainingJob, refreshQueue, resolveOptions, withAuthRetry],
  );

  const removeBundle = useCallback(
    async (key: string) => {
      await removeQueuedBundle(key);
      await refreshQueue();
    },
    [refreshQueue],
  );

  useEffect(() => {
    let cancelled = false;

    const refreshAndSync = async () => {
      await refreshQueue();
      if (cancelled) return;

      const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
      if (!isOnline || syncingRef.current) return;

      syncQueued().catch((err) => {
        console.warn('Automatische Synchronisation fehlgeschlagen', err);
      });
    };

    refreshAndSync();

    return () => {
      cancelled = true;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [refreshQueue, syncQueued]);

  useEffect(() => subscribeToBundleUpdates(refreshQueue), [refreshQueue]);

  useEffect(() => {
    const handleOnline = () => {
      syncQueued().catch((err) => {
        console.warn('Automatische Synchronisation fehlgeschlagen', err);
      });
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncQueued]);

  const upload = useCallback(
    async (payload: TrainingBundlePayload, options?: DefaultUploadOptions) => {
      setState('preparing');
      setError(null);
      setLastResult(null);
      setLastQueuedKey(null);
      setTrainingJob(null);
      setTrainingJobError(null);
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
      let zip: Uint8Array | null = null;

      try {
        const createdZip = await createTrainingZip(payload);
        zip = createdZip;
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        if (offline) {
          const persisted = await enqueuePersistedBundle({
            profileId: payload.profileId,
            label: payload.label,
            capturedAt: payload.capturedAt ?? new Date().toISOString(),
            source: payload.source ?? 'web://mediapipe',
            framesCount: payload.frames?.length ?? 0,
            ...(typeof payload.clipFile?.size === 'number' ? { clipBytes: payload.clipFile.size } : {}),
            ...(typeof payload.stillFile?.size === 'number' ? { stillBytes: payload.stillFile.size } : {}),
            zip: createdZip,
          });
          if (persisted) {
            setLastQueuedKey(persisted.key);
            await refreshQueue();
            setState('queued');
            setError('Offline – Bundle wurde zwischengespeichert.');
            return null;
          }
          const storageError = 'Offline – Bundle konnte nicht zwischengespeichert werden (kein Speicher).';
          setError(storageError);
          setState('error');
          throw new Error(storageError);
        }

        setState('uploading');
        const resolvedOptions = resolveOptions(options);
        const { apiBase, ...uploadOptions } = resolvedOptions;
        const result = await withAuthRetry(
          (tokenOverride) =>
            uploadTrainingZip(createdZip, {
              ...uploadOptions,
              ...(tokenOverride ? { token: tokenOverride } : {}),
            }),
          buildAuthOptions(resolvedOptions),
        );
        const resolvedTrainingJob = result.trainingJob
          ? applyTrainingJob(result.trainingJob, apiBase)
          : null;
        setLastResult(resolvedTrainingJob ? { ...result, trainingJob: resolvedTrainingJob } : result);
        setState('success');
        await refreshQueue();
        if (!resolvedTrainingJob) {
          await maybeTriggerTrainingJob(options);
        }
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (err instanceof HttpError && err.status === 401) {
          setError(message);
          setState('error');
          return null;
        }
        if (zip) {
          const persisted = await enqueuePersistedBundle({
            profileId: payload.profileId,
            label: payload.label,
            capturedAt: payload.capturedAt ?? new Date().toISOString(),
            source: payload.source ?? 'web://mediapipe',
            framesCount: payload.frames?.length ?? 0,
            ...(typeof payload.clipFile?.size === 'number' ? { clipBytes: payload.clipFile.size } : {}),
            ...(typeof payload.stillFile?.size === 'number' ? { stillBytes: payload.stillFile.size } : {}),
            zip,
          });
          if (persisted) {
            setLastQueuedKey(persisted.key);
            await refreshQueue();
            setState('queued');
            setError(`Upload fehlgeschlagen, Bundle wurde gespeichert: ${message}`);
            return null;
          }
          const storageError = `Upload fehlgeschlagen und Bundle konnte nicht gespeichert werden: ${message}`;
          setError(storageError);
          setState('error');
          throw new Error(storageError);
        }
        setError(message);
        setState('error');
        throw err;
      }
    },
    [applyTrainingJob, buildAuthOptions, maybeTriggerTrainingJob, refreshQueue, resolveOptions, withAuthRetry],
  );

  useEffect(() => {
    if (!trainingJob?.pollUrl) return;
    if (trainingJob.status === 'completed' || trainingJob.status === 'failed') return;

    const pollUrl = trainingJob.pollUrl;

    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const response = await withAuthRetry(
          async (tokenOverride) => {
            const headers: HeadersInit = { Accept: 'application/json' };
            const authToken = tokenOverride ?? defaultOptions.token;
            if (authToken) {
              headers['Authorization'] = `Bearer ${authToken}`;
            }
            const result = await fetch(pollUrl, {
              headers,
            });
            if (result.status === 401) {
              throw new HttpError(401, SESSION_EXPIRED_MESSAGE);
            }
            if (!result.ok) {
              throw new Error(`Polling fehlgeschlagen (HTTP ${result.status}).`);
            }
            return result;
          },
          pollAuthOptions,
        );
        const body = await response.json();
        const nextStatus = normalizeTrainingJobStatus((body as { status?: string })?.status ?? '');
        if (nextStatus) {
          setTrainingJob((prev) =>
            prev ? { ...prev, status: nextStatus } : null,
          );
          setLastResult((prev) =>
            prev && prev.trainingJob
              ? {
                  ...prev,
                  trainingJob: {
                    ...prev.trainingJob,
                    status: nextStatus,
                  },
                }
              : prev,
          );
          setTrainingJobError(null);

          if (nextStatus === 'completed' || nextStatus === 'failed') {
            return;
          }
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        setTrainingJobError(reason);
        return;
      }

      pollTimeoutRef.current = setTimeout(poll, pollIntervalMs);
    };

    poll();

    return () => {
      cancelled = true;
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };
  }, [defaultOptions.token, pollAuthOptions, pollIntervalMs, trainingJob, withAuthRetry]);

  return useMemo(
    () => ({
      upload,
      state,
      lastResult,
      error,
      queuedCount,
      queuedBundles,
      syncQueued,
      syncBundle,
      syncing,
      syncError,
      lastQueuedKey,
      trainingJob,
      trainingJobError,
      removeBundle,
    }),
    [
      error,
      lastQueuedKey,
      lastResult,
      queuedCount,
      queuedBundles,
      state,
      syncError,
      syncQueued,
      syncBundle,
      syncing,
      trainingJob,
      trainingJobError,
      removeBundle,
      upload,
    ],
  );
}
