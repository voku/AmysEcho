import { useState, useEffect } from 'react';
import { loadTensorflowModel, TensorflowModel } from 'react-native-fast-tflite';
import { loadCustomModelUri } from '../storage';

/**
 * Load a TensorFlow Lite model with optional personalization support.
 * If a personalized URI exists in storage, it will be loaded instead
 * of the provided default model.
 */
export function useTensorflowModel(
  defaultModel: any,
  personalized?: boolean,
): TensorflowModel | null {
  const [model, setModel] = useState<TensorflowModel | null>(null);

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
        if (isMounted) setModel(loaded);
      } catch (e) {
        console.error('Model load failed', e);
      }
    }

    load();

    return () => {
      isMounted = false;
      loaded?.close?.();
    };
  }, [defaultModel, personalized]);

  return model;
}
