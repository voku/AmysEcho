import { classifyGesture as recognizerClassifyGesture, ClassificationResult } from '../recognizer';

type TfliteType = {
  loadModel(opts: { path: string; numThreads: number }): Promise<void>;
  runOnModel(input: any): Promise<any[]>;
};

let TfliteCtor: { new (): TfliteType } | null = null;
try {
  // The native module is only available in the React Native environment.
  TfliteCtor = require('react-native-fast-tflite').Tflite;
} catch {
  TfliteCtor = null;
}

class MachineLearningService {
  private isReady = false;
  private gestureModel: TfliteType | null = null;

  constructor() {
    if (TfliteCtor) {
      this.gestureModel = new TfliteCtor();
    }
  }

  async loadModels(): Promise<void> {
    if (!this.gestureModel) return;
    try {
      await this.gestureModel.loadModel({
        path: process.env.TFLITE_GESTURE_MODEL || 'gestures.tflite',
        numThreads: 4,
      });
      this.isReady = true;
      console.log('ML model loaded successfully.');
    } catch (error) {
      console.error('Failed to load ML model:', error);
      this.isReady = false;
    }
  }

  isServiceReady = (): boolean => this.isReady;

  async classifyGesture(frame: any): Promise<any[] | null> {
    if (!this.isReady || !this.gestureModel) return null;
    try {
      const output = await this.gestureModel.runOnModel(frame);
      return output;
    } catch (error) {
      console.error('Local classification failed:', error);
      return null;
    }
  }
}

export const mlService = new MachineLearningService();

export async function processLandmarks(landmarks: unknown): Promise<ClassificationResult> {
  // Directly leverage the recognizer which already implements
  // the online/offline classification fallback logic.
  return recognizerClassifyGesture(landmarks);
}
