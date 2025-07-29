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
    async function load() {
      try {
        let source: any = defaultModel;
        if (personalized) {
          const customUri = await loadCustomModelUri();
          if (customUri) {
            source = customUri;
          }
        }
        // We are no longer loading the model here, just returning the source
        if (isMounted) setModel(source);
      } catch (e) {
        console.error('Model load failed', e);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [defaultModel, personalized]);

  return model;
}
