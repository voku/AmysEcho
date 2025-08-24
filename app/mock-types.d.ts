declare module 'expo-audio' {
  export function setAudioModeAsync(mode: any): Promise<void>;
  export function requestRecordingPermissionsAsync(): Promise<any>;
  export function createAudioPlayer(options: any): any;
  export class AudioRecorder {
    constructor(options: any);
    prepareToRecordAsync(options: any): Promise<void>;
    record(): void;
    stop(): Promise<void>;
    uri: string | null;
  }
  export const RecordingPresets: any;
}

declare module 'expo-battery' {
  export function getBatteryLevelAsync(): Promise<number>;
}

declare module 'expo-device' {
  export function getThermalStateAsync(): Promise<number>;
}

declare module '@testing-library/react-native';
declare module 'expo-camera' {
  export const Camera: any;
}
