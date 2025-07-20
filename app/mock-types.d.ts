declare module 'react-native-vision-camera' {
  export interface Frame { width: number; height: number; }
  export const Camera: any;
  export const useCameraDevices: any;
  export const useFrameProcessor: any;
}

declare module 'react-native-fast-tflite' {
  export interface TensorflowModel {
    runSync(inputs: any[]): any[];
  }
  export function loadTensorflowModel(path: any): Promise<TensorflowModel>;
}

declare module 'react-native-worklets-core' {
  export function runOnJS(fn: Function): any;
  export function runAtTargetFps(fps: number, fn: () => void): void;
}
