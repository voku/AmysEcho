import { useState, useEffect, useCallback } from 'react';
import { TensorflowModel, loadTensorflowModel } from 'react-native-fast-tflite';
import { loadCustomModelUri } from '../storage';
import { logger } from '../utils/logger';
export interface TensorflowModelHook {
  model: TensorflowModel | null;
  isModelLoaded: boolean;
}

/**
 * Load a TensorFlow Lite model with optional personalization support.
 * If a personalized URI exists in storage, it will be loaded instead
 * of the provided default model.
 */
export function useTensorflowModel(
  defaultModel: any,
  personalized?: boolean,
): TensorflowModelHook {
  const [model, setModel] = useState<TensorflowModel | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let loaded: TensorflowModel | null = null;

    async function load() {
      try {
        let source: any = defaultModel;
        if (personalized) {
          const customUri = await loadCustomModelUri();
          if (customUri) {
            source = { url: customUri };
          }
        }
        loaded = await loadTensorflowModel(source);
        if (isMounted) {
          setModel(loaded);
          setIsModelLoaded(true);
        }
      } catch (e) {
        logger.error('Model load failed', e);
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [defaultModel, personalized]);

  return { model, isModelLoaded };
}
