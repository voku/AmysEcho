import { useCallback, useRef } from 'react';
import { logger } from '../utils/logger';

export const useModelInjection = (webviewRef: any, onModelUpdateStatus: any) => {
  const pendingModelRef = useRef<string | null>(null);
  const mlpReadyRef = useRef(false);
  const modelTransferLock = useRef(false);
  const queuedModelRef = useRef(false);
  const transferWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const injectModel = useCallback((b64: string | null) => {
    if (!b64 || !webviewRef.current || !mlpReadyRef.current) return;
    if (modelTransferLock.current) {
      logger.warn('Model transfer in progress, queueing new model', { hasPendingModel: !!pendingModelRef.current });
      pendingModelRef.current = b64;
      queuedModelRef.current = true;
      return;
    }
    modelTransferLock.current = true;
    queuedModelRef.current = false;
    onModelUpdateStatus?.('updating');
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
    if (transferWatchdogRef.current) clearTimeout(transferWatchdogRef.current);
    transferWatchdogRef.current = setTimeout(() => {
      logger.warn('Model transfer timed out, unlocking and retrying if needed', {
        hasQueuedModel: queuedModelRef.current,
        hasPendingModel: !!pendingModelRef.current
      });
      modelTransferLock.current = false;
      onModelUpdateStatus?.('error');
      if (queuedModelRef.current && pendingModelRef.current) {
        injectModel(pendingModelRef.current);
      }
    }, 15000);
  }, [onModelUpdateStatus]);

  return { injectModel, mlpReadyRef, pendingModelRef };
};