import { useRef } from 'react';
import { useTensorflowModel, type TensorflowModel } from 'react-native-fast-tflite';

/**
 * One-time model loader; exposes a global infer function for the frame worklet.
 */
export function useAmyGestureModel(modelAsset: number) {
  const modelRef = useRef<TensorflowModel | null>(null);
  const { state, model } = useTensorflowModel(modelAsset);

  if (state === 'loaded' && model && !modelRef.current) {
    modelRef.current = model;
    // Attach a fast path for the worklet
    // @ts-ignore
    globalThis.__amy_infer = (frame: any): { label: string; score: number } | null => {
      'worklet';
      // A resize plugin can convert YUV frames to the model's input tensor
      // without extra copies. When available, perform the conversion here
      // and feed the tensor into the model. This placeholder returns null
      // until proper preprocessing is supplied.
      return null;
    };
  }
  return state;
}
