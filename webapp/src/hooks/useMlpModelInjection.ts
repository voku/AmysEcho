import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { unzip, unzipSync } from 'fflate';
import { installMlp } from '../gesture/installMlp';
import { fetchMlpModelWithFallback, type MlpModelMeta, type MlpModelResponse } from '../gesture/modelClient';
import { HttpError, SESSION_EXPIRED_MESSAGE } from '../utils/http';
import { useApiConfig } from './useApiConfig';

export type ModelInjectionStatus = 'idle' | 'loading' | 'ready' | 'error';

const MODEL_FETCH_ERROR_MESSAGE = 'MLP-Modell konnte nicht geladen werden. Bitte Verbindung prüfen und erneut versuchen.';
const MODEL_GENERIC_ERROR_MESSAGE = 'Bei der Verbindung zum MLP-Modell ist ein Fehler aufgetreten. Bitte Verbindung prüfen und erneut versuchen.';
const MODEL_PROFILE_FALLBACK_NOTICE = 'Für dieses Profil ist noch kein persönliches Modell verfügbar. Ich nutze vorübergehend das globale Modell.';

function toModelNotice(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (error instanceof HttpError && message === SESSION_EXPIRED_MESSAGE) {
    return message;
  }

  if (normalized === 'failed to fetch' || normalized === 'network error' || normalized.includes('netzwerk')) {
    return MODEL_FETCH_ERROR_MESSAGE;
  }

  if (message.includes('Sitzung')) {
    return message;
  }

  return MODEL_GENERIC_ERROR_MESSAGE;
}

export function useMlpModelInjection(
  profileId: string | null,
  options: { autoRefreshMs?: number } = {},
) {
  const { modelEndpoint, apiToken, refreshAccessToken } = useApiConfig();
  const [status, setStatus] = useState<ModelInjectionStatus>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [lastMeta, setLastMeta] = useState<MlpModelMeta | null>(null);
  const lastSignatureRef = useRef<string | null>(null);
  const refreshInFlightRef = useRef(false);
  const autoRefreshMs = options.autoRefreshMs ?? 60000;

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

  const hashBase64 = useCallback((value: string) => {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }, []);

  const signatureFor = useCallback((result: MlpModelResponse | null) => {
    if (!result) return null;
    if (result.meta.version) {
      return `version:${result.meta.source}:${result.meta.version}`;
    }
    return `hash:${result.meta.source}:${result.b64.length}:${hashBase64(result.b64)}`;
  }, [hashBase64]);

  const injectIntoRuntime = useCallback(async (payload: MlpModelResponse | null) => {
    if (!payload) return false;
    if (typeof window.__setMlpModelB64 !== 'function') {
      console.warn('[MLP] __setMlpModelB64 fehlt, Modell kann nicht geladen werden');
      return false;
    }
    window.__mlpFeatureMode = payload.meta.featureMode ?? 'absolute';
    return window.__setMlpModelB64(payload.b64);
  }, []);

  const refreshModel = useCallback(async () => {
    if (refreshInFlightRef.current) {
      return null;
    }
    refreshInFlightRef.current = true;
    if (!profileId) {
      setStatus('idle');
      setNotice('Kein Profil aktiv, Standardmodell wird verwendet.');
      refreshInFlightRef.current = false;
      return null;
    }
    
    const hadModelBeforeRefresh = lastSignatureRef.current !== null;

    setStatus((previousStatus) => (previousStatus === 'ready' ? 'ready' : 'loading'));
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
              console.warn('Token refresh failed for MLP model', refreshError);
            }
            throw new HttpError(401, SESSION_EXPIRED_MESSAGE);
          }
          throw error;
        }
      })();
    } catch (error) {
      const reason = toModelNotice(error);
      if (hadModelBeforeRefresh) {
        setStatus('ready');
        console.warn('[MLP] Model refresh failed, keeping last active model', error);
      } else {
        setStatus('error');
      }
      setNotice(reason);
      refreshInFlightRef.current = false;
      return null;
    }

    if (!result) {
      if (hadModelBeforeRefresh) {
        setStatus('ready');
        console.warn('[MLP] Refresh returned no model, keeping last active model');
      } else {
        // MLP model is optional - gesture recognition works with MediaPipe default
        // No error shown, just log and continue
        setStatus('idle');
        console.info('[MLP] No personalized model available – using MediaPipe default');
      }
      refreshInFlightRef.current = false;
      return null;
    }

    const signature = signatureFor(result);
    const isNewModel = signature && signature !== lastSignatureRef.current;

    if (!isNewModel) {
      setLastMeta(result.meta);
      setStatus('ready');
      if (result.meta.source === 'global' && profileId) {
        setNotice(MODEL_PROFILE_FALLBACK_NOTICE);
      } else {
        setNotice(null);
      }
      refreshInFlightRef.current = false;
      return result;
    }

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
        if (result.meta.source === 'global' && profileId) {
          setNotice(MODEL_PROFILE_FALLBACK_NOTICE);
        } else {
          setNotice('Modell aktualisiert');
        }
      } else if (result.meta.source === 'global' && profileId) {
        // Keep this hint visible even when there is no version change.
        setNotice(MODEL_PROFILE_FALLBACK_NOTICE);
      }
      refreshInFlightRef.current = false;
      return result;
    }

    setStatus('error');
    setNotice('Modell konnte nicht in die Laufzeit geladen werden.');
    refreshInFlightRef.current = false;
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

  useEffect(() => {
    if (!profileId || autoRefreshMs <= 0) return undefined;
    const timer = window.setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return;
      }
      refreshModel();
    }, autoRefreshMs);
    return () => window.clearInterval(timer);
  }, [autoRefreshMs, profileId, refreshModel]);

  return useMemo(
    () => ({ status, notice, refreshModel, lastMeta }),
    [lastMeta, notice, refreshModel, status],
  );
}
