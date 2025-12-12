import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { unzip, unzipSync } from 'fflate';
import { installMlp } from '../gesture/installMlp';
import { fetchMlpModelWithFallback, type MlpModelMeta, type MlpModelResponse } from '../gesture/modelClient';
import { HttpError, SESSION_EXPIRED_MESSAGE } from '../utils/http';
import { useApiConfig } from './useApiConfig';

export type ModelInjectionStatus = 'idle' | 'loading' | 'ready' | 'error';

export function useMlpModelInjection(profileId: string) {
  const { modelEndpoint, apiToken, refreshAccessToken } = useApiConfig();
  const [status, setStatus] = useState<ModelInjectionStatus>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [lastMeta, setLastMeta] = useState<MlpModelMeta | null>(null);
  const lastSignatureRef = useRef<string | null>(null);

  const ensureRuntimeReady = useCallback(() => {
    if (!window.fflate) {
      window.fflate = { unzip, unzipSync };
    }
    if (typeof window.__setMlpModelB64 !== 'function') {
      installMlp();
    }
  }, []);

  useEffect(() => {
    lastSignatureRef.current = null;
  }, [profileId]);

  const signatureFor = useCallback((result: MlpModelResponse | null) => {
    if (!result) return null;
    return result.meta.version ?? `${result.b64.length}:${result.meta.source}`;
  }, []);

  const injectIntoRuntime = useCallback(async (payload: MlpModelResponse | null) => {
    if (!payload) return false;
    if (typeof window.__setMlpModelB64 !== 'function') {
      console.warn('[MLP] __setMlpModelB64 fehlt, Modell kann nicht geladen werden');
      return false;
    }
    return window.__setMlpModelB64(payload.b64);
  }, []);

  const refreshModel = useCallback(async () => {
    setStatus('loading');
    setNotice(null);

    let result: MlpModelResponse | null;
    try {
      result = await (async () => {
        try {
          return await fetchMlpModelWithFallback({
            endpoint: modelEndpoint,
            ...(apiToken ? { token: apiToken } : {}),
            profileId,
          });
        } catch (error) {
          if (error instanceof HttpError && error.status === 401) {
            try {
              const refreshed = await refreshAccessToken();
              if (refreshed) {
                return await fetchMlpModelWithFallback({
                  endpoint: modelEndpoint,
                  token: refreshed,
                  profileId,
                });
              }
            } catch (refreshError) {
              console.warn('Token-Refresh für MLP-Modell fehlgeschlagen', refreshError);
            }
            throw new HttpError(401, SESSION_EXPIRED_MESSAGE);
          }
          throw error;
        }
      })();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      setStatus('error');
      setNotice(reason);
      return null;
    }

    if (!result) {
      // MLP-Modell ist optional - Gestenerkennung funktioniert mit MediaPipe-Standard
      // Kein Fehler anzeigen, nur protokollieren und weitermachen
      setStatus('idle');
      console.info('[MLP] Kein personalisiertes Modell verfügbar – MediaPipe-Standard wird verwendet');
      return null;
    }

    const signature = signatureFor(result);
    const isNewModel = signature && signature !== lastSignatureRef.current;
    ensureRuntimeReady();
    const injected = await injectIntoRuntime(result);

    if (injected) {
      lastSignatureRef.current = signature;
      setLastMeta(result.meta);
      setStatus('ready');
      console.info('[MLP] Modell injiziert', {
        source: result.meta.source,
        profileId: result.meta.profileId ?? profileId ?? null,
        version: result.meta.version ?? 'unbekannt',
      });
      if (isNewModel) {
        setNotice('Modell aktualisiert. Danke für deine Gesten!');
      }
      return result;
    }

    setStatus('error');
    setNotice('Modell konnte nicht in die Laufzeit geladen werden.');
    return null;
  }, [
    apiToken,
    ensureRuntimeReady,
    injectIntoRuntime,
    modelEndpoint,
    profileId,
    refreshAccessToken,
    signatureFor,
  ]);

  useEffect(() => {
    refreshModel();
  }, [refreshModel]);

  return useMemo(
    () => ({ status, notice, refreshModel, lastMeta }),
    [lastMeta, notice, refreshModel, status],
  );
}
