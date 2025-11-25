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
import type { TrainingBundlePayload, UploadTrainingBundleResponse } from '../training/types';

export type UploadState = 'idle' | 'preparing' | 'uploading' | 'queued' | 'success' | 'error';

export function useTrainingUploader() {
  const [state, setState] = useState<UploadState>('idle');
  const [lastResult, setLastResult] = useState<UploadTrainingBundleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastQueuedKey, setLastQueuedKey] = useState<string | null>(null);
  const syncingRef = useRef(false);

  const refreshQueue = useCallback(async () => {
    const bundles = await listQueuedBundles();
    setQueuedCount(bundles.length);
    return bundles;
  }, []);

  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith(BUNDLE_KEY_PREFIX)) {
        refreshQueue();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [refreshQueue]);

  const syncQueued = useCallback(
    async (options?: { endpoint?: string; token?: string }): Promise<number> => {
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
          await uploadTrainingZip(decodeBundleData(bundle), options);
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
    const handleOnline = () => {
      syncQueued().catch((err) => {
        console.warn('Automatische Synchronisation fehlgeschlagen', err);
      });
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncQueued]);

  const upload = useCallback(
    async (payload: TrainingBundlePayload, options?: { endpoint?: string; token?: string }) => {
      setState('preparing');
      setError(null);
      setLastResult(null);
      setLastQueuedKey(null);
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
            clipBytes: payload.clipFile?.size,
            stillBytes: payload.stillFile?.size,
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
        const result = await uploadTrainingZip(zip, options);
        setLastResult(result);
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
            clipBytes: payload.clipFile?.size,
            stillBytes: payload.stillFile?.size,
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
    }),
    [error, lastQueuedKey, lastResult, queuedCount, state, syncError, syncQueued, syncing, upload],
  );
}
