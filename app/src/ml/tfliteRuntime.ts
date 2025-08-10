import { useRef } from 'react';
import { useTensorflowModel, type TensorflowModel } from 'react-native-fast-tflite';
import { type Frame } from 'react-native-vision-camera';
import { useResizePlugin } from 'vision-camera-resize-plugin';

/**
 * One-time model loader; exposes a global infer function for the frame worklet.
 */
export function useAmyGestureModel(modelAsset: number) {
  const modelRef = useRef<TensorflowModel | null>(null);
  const { state, model } = useTensorflowModel(modelAsset);
  const { resize } = useResizePlugin();

  if (state === 'loaded' && model && !modelRef.current) {
    modelRef.current = model;
    // Attach a fast path for the worklet
    // @ts-ignore
    globalThis.__amy_infer = (frame: Frame): { label: string; score: number } | null => {
      'worklet';
      if (!modelRef.current) return null;

      // Convert the YUV frame into the model's expected RGB float32 tensor
      const tensor = resize(frame, {
        scale: { width: 192, height: 192 },
        pixelFormat: 'rgb',
        dataType: 'float32',
      }) as Float32Array;

      const result = modelRef.current.runSync([tensor]) as Float32Array[] | undefined;
      if (!result || result.length === 0) return null;
      const scores = result[0];
      let best = 0;
      for (let i = 1; i < scores.length; i++) {
        if (scores[i] > scores[best]) best = i;
      }
      return { label: String(best), score: scores[best] };
    };
  }
  return state;
}
