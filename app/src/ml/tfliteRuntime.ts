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
      // TODO: integrate VisionCamera resize plugin for zero-copy tensors
      // const input = resizePlugin.yuvToRgbaResize(frame, 224, 224);
      // const out = model.run(input) as number[];
      // let best = -1, idx = -1;
      // for (let i = 0; i < out.length; i++) {
      //   if (out[i] > best) { best = out[i]; idx = i; }
      // }
      // return { label: `cls_${idx}`, score: best };
      return null;
    };
  }
  return state;
}
