import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createTrainingZip, uploadTrainingZip } from '../training/trainingBundle';
import {
  BUNDLE_KEY_PREFIX,
  decodeBundleData,
  enqueuePersistedBundle,
  listQueuedBundles,
  markBundleFailed,
  markBundleUploading,
  removeQueuedBundle,
} from '../training/trainingQueue';
import type { TrainingBundlePayload, TrainingJobInfo, UploadTrainingBundleResponse } from '../training/types';
import { normalizeTrainingJobStatus } from '../training/trainingBundle';
import { resolvePollUrl } from './useApiConfig';

export type UploadState = 'idle' | 'preparing' | 'uploading' | 'queued' | 'success' | 'error';

export interface DefaultUploadOptions {
  endpoint?: string;
  token?: string;
  apiBase?: string;
}

export function useTrainingUploader(options: { pollIntervalMs?: number; defaultOptions?: DefaultUploadOptions } = {}) {
  const pollIntervalMs = options.pollIntervalMs ?? 2000;
  const defaultOptions = options.defaultOptions ?? {};
  const [state, setState] = useState<UploadState>('idle');
  const [lastResult, setLastResult] = useState<UploadTrainingBundleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastQueuedKey, setLastQueuedKey] = useState<string | null>(null);
  const [trainingJob, setTrainingJob] = useState<TrainingJobInfo | null>(null);
  const [trainingJobError, setTrainingJobError] = useState<string | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncingRef = useRef(false);

  const refreshQueue = useCallback(async () => {
    const bundles = await listQueuedBundles();
    setQueuedCount(bundles.length);
    return bundles;
  }, []);

  const resolveOptions = useCallback(
    (override?: { endpoint?: string; token?: string; apiBase?: string }) => ({
      ...defaultOptions,
      ...override,
    }),
    [defaultOptions],
  );

  const syncQueued = useCallback(
    async (options?: { endpoint?: string; token?: string; apiBase?: string }): Promise<number> => {
      if (syncingRef.current) return 0;
      syncingRef.current = true;
      setSyncing(true);
      setSyncError(null);
      const bundles = await refreshQueue();
      const pending = bundles.filter((bundle) => bundle.status !== 'uploading');
      let uploaded = 0;

      for (const bundle of pending) {
        try {
          await markBundleUploading(bundle.key);
          await uploadTrainingZip(decodeBundleData(bundle), resolveOptions(options));
          await removeQueuedBundle(bundle.key);
          uploaded += 1;
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          await markBundleFailed(bundle.key, reason);
          setSyncError(reason);
        }
      }

      await refreshQueue();
      setSyncing(false);
      syncingRef.current = false;
      return uploaded;
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
    };
  }, [refreshQueue, syncQueued]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith(BUNDLE_KEY_PREFIX)) {
        refreshQueue();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [refreshQueue]);

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
    async (payload: TrainingBundlePayload, options?: { endpoint?: string; token?: string; apiBase?: string }) => {
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
        zip = await createTrainingZip(payload);
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
            zip,
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
        const result = await uploadTrainingZip(zip, resolvedOptions);
        const resolvedTrainingJob = result.trainingJob
          ? {
              ...result.trainingJob,
              pollUrl: resolvePollUrl(
                resolvedOptions.apiBase ?? resolvedOptions.endpoint ?? '',
                result.trainingJob.pollUrl,
                result.trainingJob.jobId,
              ),
            }
          : null;
        setTrainingJob(resolvedTrainingJob ?? null);
        setLastResult(
          resolvedTrainingJob
            ? { ...result, trainingJob: resolvedTrainingJob }
            : result,
        );
        setState('success');
        await refreshQueue();
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
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
    [refreshQueue],
  );

  useEffect(() => {
    if (!trainingJob?.pollUrl) return;
    if (trainingJob.status === 'completed' || trainingJob.status === 'failed') return;

    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const response = await fetch(trainingJob.pollUrl as string, {
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          throw new Error(`Polling fehlgeschlagen (HTTP ${response.status}).`);
        }
        const body = await response.json();
        const nextStatus = normalizeTrainingJobStatus((body as { status?: string })?.status ?? '');
        if (nextStatus) {
          setTrainingJob((prev) =>
            prev ? { ...prev, status: nextStatus, pollUrl: prev.pollUrl } : null,
          );
          setLastResult((prev) =>
            prev && prev.trainingJob
              ? {
                  ...prev,
                  trainingJob: {
                    ...prev.trainingJob,
                    status: nextStatus,
                    pollUrl: prev.trainingJob.pollUrl,
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
  }, [pollIntervalMs, trainingJob]);

  return useMemo(
    () => ({
      upload,
      state,
      lastResult,
      error,
      queuedCount,
      syncQueued,
      syncing,
      syncError,
      lastQueuedKey,
      trainingJob,
      trainingJobError,
    }),
    [
      error,
      lastQueuedKey,
      lastResult,
      queuedCount,
      state,
      syncError,
      syncQueued,
      syncing,
      trainingJob,
      trainingJobError,
      upload,
    ],
  );
}
