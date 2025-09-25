import { useCallback, useRef } from 'react';
import { logger } from '../utils/logger';

type ModelContext = {
  profileId?: string | null;
  version?: string | null;
  source?: string;
  cached?: boolean;
};

export const useModelInjection = (webviewRef: any, onModelUpdateStatus: any) => {
  const pendingModelRef = useRef<string | null>(null);
  const pendingModelContextRef = useRef<ModelContext | null>(null);
  const mlpReadyRef = useRef(false);
  const modelTransferLock = useRef(false);
  const queuedModelRef = useRef(false);
  const transferWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTransferWatchdog = useCallback(() => {
    if (transferWatchdogRef.current) {
      clearTimeout(transferWatchdogRef.current);
      transferWatchdogRef.current = null;
    }
  }, []);

  const injectModel = useCallback((b64: string | null, context?: ModelContext) => {
    if (!b64 || !webviewRef.current || !mlpReadyRef.current) return;
    if (modelTransferLock.current) {
      logger.warn('Model transfer in progress, queueing new model', {
        hasPendingModel: !!pendingModelRef.current,
        profileId: context?.profileId ?? null,
        source: context?.source ?? 'unknown',
      });
      pendingModelRef.current = b64;
      pendingModelContextRef.current = context ?? null;
      queuedModelRef.current = true;
      return;
    }
    modelTransferLock.current = true;
    queuedModelRef.current = false;
    onModelUpdateStatus?.('updating');
    logger.info('Injecting MLP model into WebView', {
      profileId: context?.profileId ?? null,
      version: context?.version ?? null,
      source: context?.source ?? 'unknown',
      cached: context?.cached ?? false,
      payloadBytes: Math.round(b64.length / 1.333),
    });
    const CHUNK = 64 * 1024;
    // Remove any non-base64 characters to keep the payload safe for injection
    const normalized = b64.replace(/[^A-Za-z0-9+/=]/g, '');
    webviewRef.current.injectJavaScript(
      'window.__beginMlpTransfer&&window.__beginMlpTransfer();',
    );
    for (let i = 0; i < normalized.length; i += CHUNK) {
      const part = normalized.slice(i, i + CHUNK);
      webviewRef.current.injectJavaScript(
        'window.__pushMlpChunk&&window.__pushMlpChunk(' + JSON.stringify(part) + ');',
      );
    }
    webviewRef.current.injectJavaScript(
      '(async()=>{window.__commitMlpTransfer&&await window.__commitMlpTransfer();})();',
    );
    clearTransferWatchdog();
    transferWatchdogRef.current = setTimeout(() => {
      logger.warn('Model transfer timed out, unlocking and retrying if needed', {
        hasQueuedModel: queuedModelRef.current,
        hasPendingModel: !!pendingModelRef.current,
      });
      modelTransferLock.current = false;
      clearTransferWatchdog();
      onModelUpdateStatus?.('error');
      if (queuedModelRef.current && pendingModelRef.current) {
        const nextModel = pendingModelRef.current;
        pendingModelRef.current = null;
        queuedModelRef.current = false;
        const nextContext = pendingModelContextRef.current;
        pendingModelContextRef.current = null;
        injectModel(nextModel, nextContext ?? undefined);
      } else {
        queuedModelRef.current = false;
        pendingModelRef.current = null;
        pendingModelContextRef.current = null;
      }
    }, 15000);
  }, [clearTransferWatchdog, onModelUpdateStatus]);

  const markTransferComplete = useCallback(() => {
    clearTransferWatchdog();
    modelTransferLock.current = false;

    if (queuedModelRef.current && pendingModelRef.current) {
      const nextModel = pendingModelRef.current;
      pendingModelRef.current = null;
      queuedModelRef.current = false;
      const nextContext = pendingModelContextRef.current;
      pendingModelContextRef.current = null;
      injectModel(nextModel, nextContext ?? undefined);
      return;
    }

    queuedModelRef.current = false;
    pendingModelRef.current = null;
    pendingModelContextRef.current = null;
  }, [clearTransferWatchdog, injectModel]);

  return { injectModel, mlpReadyRef, pendingModelRef, markTransferComplete };
};
