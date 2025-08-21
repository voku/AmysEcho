import * as FileSystem from 'expo-file-system';

// TFLite models are deprecated in the current WebView + MediaPipe Tasks path.
// These placeholders remain to satisfy legacy code paths and tests; they are not used at runtime.
export const HAND_LANDMARKER_MODEL: any = null;
export const GESTURE_CLASSIFIER_MODEL: any = null;
export const CUSTOM_GESTURE_MODEL_PATH = FileSystem.documentDirectory + 'custom_model.tflite';
