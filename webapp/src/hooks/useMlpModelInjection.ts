import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { unzip, unzipSync } from 'fflate';
import { installMlp } from '../gesture/installMlp';
import { fetchMlpModelWithFallback, type MlpModelMeta, type MlpModelResponse } from '../gesture/modelClient';
import { useApiConfig } from './useApiConfig';

export type ModelInjectionStatus = 'idle' | 'loading' | 'ready' | 'error';

export function useMlpModelInjection(profileId: string) {
  const { modelEndpoint, apiToken } = useApiConfig();
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

    const result = await fetchMlpModelWithFallback({
      endpoint: modelEndpoint,
      ...(apiToken ? { token: apiToken } : {}),
      profileId,
    });

    if (!result) {
      setStatus('error');
      setNotice('Modell konnte nicht geladen werden. Bitte prüfe die API-URL.');
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
        setNotice(
          `Neues ${result.meta.source === 'profile' ? 'profilgebundenes' : 'globales'} Modell geladen – danke für deine Gesten! (${result.meta.version ?? 'Version unbekannt'})`,
        );
      }
      return result;
    }

    setStatus('error');
    setNotice('Modell konnte nicht in die Laufzeit geladen werden.');
    return null;
  }, [apiToken, ensureRuntimeReady, injectIntoRuntime, modelEndpoint, profileId, signatureFor]);

  useEffect(() => {
    refreshModel();
  }, [refreshModel]);

  return useMemo(
    () => ({ status, notice, refreshModel, lastMeta }),
    [lastMeta, notice, refreshModel, status],
  );
}
