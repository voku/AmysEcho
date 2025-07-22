import * as FileSystem from 'expo-file-system';

export const HAND_LANDMARKER_MODEL = require('../../assets/models/hand_landmarker.tflite');
export const GESTURE_CLASSIFIER_MODEL = require('../../assets/models/gesture_classifier.tflite');
export const CUSTOM_GESTURE_MODEL_PATH = FileSystem.documentDirectory + 'custom_model.tflite';
