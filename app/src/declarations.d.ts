declare module 'crypto-js';
declare module 'react-native-webview';
declare module '*.npz' {
  const value: number;
  export default value;
}
declare module '*.txt' {
  const value: number;
  export default value;
}
declare module 'expo-file-system' {
  export enum FileSystemUploadType {
    BINARY_CONTENT = 0,
    MULTIPART = 1,
  }
}

import type { GestureWindowAugmentations } from '../webview/types/windowAugmentations';

export {};

declare global {
  // Allow responsive style objects in React Native style props without TS noise
  // This keeps UI code concise while we progressively migrate to a typed responsive system.
  // It affects only type checking; runtime behavior is unchanged.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNativeStyleAugment {
    type ResponsiveValue = { sm?: any; md?: any; lg?: any; xl?: any };
  }
}

declare module 'react-native' {
  // Broadly relax style prop value types to accept responsive objects
  interface ViewStyle {
    [key: string]: any | ReactNativeStyleAugment.ResponsiveValue;
  }
  interface TextStyle {
    [key: string]: any | ReactNativeStyleAugment.ResponsiveValue;
  }
  interface ImageStyle {
    [key: string]: any | ReactNativeStyleAugment.ResponsiveValue;
  }
}

declare global {
  interface Window extends GestureWindowAugmentations {}
}
