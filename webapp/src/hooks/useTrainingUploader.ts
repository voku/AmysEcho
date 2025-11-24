import { useCallback, useMemo, useState } from 'react';
import { uploadTrainingBundle } from '../training/trainingBundle';
import type { TrainingBundlePayload, UploadTrainingBundleResponse } from '../training/types';

export type UploadState = 'idle' | 'preparing' | 'uploading' | 'success' | 'error';

export function useTrainingUploader() {
  const [state, setState] = useState<UploadState>('idle');
  const [lastResult, setLastResult] = useState<UploadTrainingBundleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (payload: TrainingBundlePayload, options?: { endpoint?: string; token?: string }) => {
    setState('preparing');
    setError(null);
    setLastResult(null);
    try {
      setState('uploading');
      const result = await uploadTrainingBundle(payload, options);
      setLastResult(result);
      setState('success');
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setState('error');
      throw err;
    }
  }, []);

  return useMemo(
    () => ({
      upload,
      state,
      lastResult,
      error,
    }),
    [upload, state, lastResult, error],
  );
}
