import * as FileSystem from 'expo-file-system';
import { Asset } from 'expo-asset';

export const HAND_LANDMARKER_MODEL =  Asset.fromModule(require('../../assets/models/hand_landmarker.tflite')).uri;
export const GESTURE_CLASSIFIER_MODEL = Asset.fromModule(require('../../assets/models/gesture_classifier.tflite')).uri;
export const CUSTOM_GESTURE_MODEL_PATH = FileSystem.documentDirectory + 'custom_model.tflite';
