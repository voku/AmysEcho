declare module 'react-native-vision-camera' {
  import type React from 'react';
  export interface Frame { width: number; height: number; }
  export interface CameraRef {
    startRecording(options: any): void;
    stopRecording(): void;
  }
  export const Camera: React.ForwardRefExoticComponent<any & React.RefAttributes<CameraRef>>;
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

declare module '@react-native-async-storage/async-storage' {
  const AsyncStorage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
  };
  export default AsyncStorage;
}
