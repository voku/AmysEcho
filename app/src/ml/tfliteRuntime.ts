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
      // The VisionCamera resize plugin writes the model-sized float buffer
      // directly onto the frame object. Reuse that buffer to avoid extra
      // allocations.
      const buffer = (frame as any)?.resized ?? frame?.data;
      if (!buffer || !modelRef.current) {
        return null;
      }

      // Create a Float32Array view over the existing ArrayBuffer without
      // copying. Most resize plugins expose a Float32Array already, so this
      // will simply reference the same memory.
      const tensor = buffer instanceof Float32Array ? buffer : new Float32Array(buffer);
      const output = (modelRef.current.runSync([tensor]) as any[])[0] as number[];
      if (!output || output.length === 0) {
        return null;
      }
      let bestIdx = 0;
      for (let i = 1; i < output.length; i++) {
        if (output[i] > output[bestIdx]) {
          bestIdx = i;
        }
      }
      return { label: String(bestIdx), score: output[bestIdx] };
    };
  }
  return state;
}
