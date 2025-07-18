import { TensorflowLite } from 'react-native-fast-tflite';
import { logger } from '../utils/logger';
import { GestureResult, MLServiceConfig, ProcessedFrame } from '../types/ml';

export class MLService {
  private tfliteModel: TensorflowLite | null = null;
  private isModelLoaded = false;
  private modelPath: string;
  private fallbackModelPath: string;
  private cloudEndpoint: string;
  private confidenceThreshold: number;

  constructor(config: MLServiceConfig) {
    this.modelPath = config.modelPath || 'models/gesture_recognition.tflite';
    this.fallbackModelPath = config.fallbackModelPath || 'models/fallback_model.tflite';
    this.cloudEndpoint = config.cloudEndpoint || '';
    this.confidenceThreshold = config.confidenceThreshold || 0.7;
  }

  /**
   * Initialize the TensorFlow Lite model
   */
  async initializeModel(): Promise<void> {
    try {
      logger.info('Initializing ML model...');

      // Try to load the main model first
      try {
        this.tfliteModel = await TensorflowLite.loadModel(this.modelPath);
        logger.info('Main gesture recognition model loaded successfully');
      } catch (error) {
        logger.warn('Main model failed to load, trying fallback model', error);
        this.tfliteModel = await TensorflowLite.loadModel(this.fallbackModelPath);
        logger.info('Fallback model loaded successfully');
      }

      this.isModelLoaded = true;
    } catch (error: any) {
      logger.error('Failed to initialize ML model:', error);
      throw new Error(`Model initialization failed: ${error.message}`);
    }
  }

  /**
   * Classify a gesture from processed frame data
   */
  async classifyGesture(frameData: ProcessedFrame): Promise<GestureResult> {
    if (!this.isModelLoaded || !this.tfliteModel) {
      throw new Error('Model not initialized. Call initializeModel() first.');
    }

    try {
      // Try cloud classification first for better accuracy
      const cloudResult = await this.tryCloudClassification(frameData);
      if (cloudResult) {
        return cloudResult;
      }

      // Fallback to local classification
      return await this.classifyLocally(frameData);
    } catch (error) {
      logger.error('Gesture classification failed:', error);

      // Return uncertain result instead of throwing
      return {
        gesture: 'unknown',
        confidence: 0.0,
        isLocal: true,
        timestamp: Date.now(),
        suggestions: [],
        requiresConfirmation: true,
      };
    }
  }

  /**
   * Try cloud-based classification first
   */
  private async tryCloudClassification(frameData: ProcessedFrame): Promise<GestureResult | null> {
    if (!this.cloudEndpoint) {
      return null;
    }

    try {
      const response = await fetch(this.cloudEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          frameData: frameData.landmarks,
          metadata: {
            width: frameData.width,
            height: frameData.height,
            timestamp: frameData.timestamp,
          },
        }),
        // @ts-ignore fetch timeout
        timeout: 3000,
      });

      if (!response.ok) {
        throw new Error(`Cloud service returned ${response.status}`);
      }

      const result = await response.json();

      return {
        gesture: result.gesture,
        confidence: result.confidence,
        isLocal: false,
        timestamp: Date.now(),
        suggestions: result.suggestions || [],
        requiresConfirmation: result.confidence < this.confidenceThreshold,
      };
    } catch (error) {
      logger.warn('Cloud classification failed, falling back to local:', error);
      return null;
    }
  }

  /**
   * Local TensorFlow Lite classification
   */
  private async classifyLocally(frameData: ProcessedFrame): Promise<GestureResult> {
    if (!this.tfliteModel) {
      throw new Error('Local model not available');
    }

    try {
      // Prepare input tensor from landmark data
      const inputTensor = this.prepareTensorInput(frameData.landmarks);

      // Run inference
      const outputs = await this.tfliteModel.run([inputTensor]);

      // Process outputs to get gesture classification
      const { gesture, confidence } = this.processModelOutput(outputs);

      return {
        gesture,
        confidence,
        isLocal: true,
        timestamp: Date.now(),
        suggestions: [],
        requiresConfirmation: confidence < this.confidenceThreshold,
      };
    } catch (error) {
      logger.error('Local classification failed:', error);
      throw error;
    }
  }

  /**
   * Prepare tensor input from landmark data
   */
  private prepareTensorInput(landmarks: number[][]): Float32Array {
    // Flatten and normalize landmark coordinates
    const flatLandmarks = landmarks.flat();
    const normalized = new Float32Array(flatLandmarks.length);

    for (let i = 0; i < flatLandmarks.length; i++) {
      normalized[i] = flatLandmarks[i] / 1000.0; // Normalize to [0, 1] range
    }

    return normalized;
  }

  /**
   * Process model output to extract gesture and confidence
   */
  private processModelOutput(outputs: any[]): { gesture: string; confidence: number } {
    const predictions = outputs[0];

    // Find the class with highest confidence
    let maxConfidence = 0;
    let maxIndex = 0;

    for (let i = 0; i < predictions.length; i++) {
      if (predictions[i] > maxConfidence) {
        maxConfidence = predictions[i];
        maxIndex = i;
      }
    }

    // Map index to gesture name (this would be loaded from your gesture vocabulary)
    const gestureNames = ['hello', 'thank_you', 'water', 'food', 'more', 'finished', 'help'];
    const gesture = gestureNames[maxIndex] || 'unknown';

    return { gesture, confidence: maxConfidence };
  }

  /**
   * Update the model with new training data
   */
  async updateModel(trainingData: ProcessedFrame[], labels: string[]): Promise<void> {
    // This would typically involve sending data to a training service
    // For now, we'll just log the training data
    logger.info(`Received training data: ${trainingData.length} samples`);

    // In a full implementation, this would:
    // 1. Send data to training service
    // 2. Wait for new model to be trained
    // 3. Download and replace the local model
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.tfliteModel) {
      this.tfliteModel.dispose();
      this.tfliteModel = null;
    }
    this.isModelLoaded = false;
  }
}

// Export singleton instance
export const mlService = new MLService({
  modelPath: 'models/gesture_recognition.tflite',
  fallbackModelPath: 'models/fallback_model.tflite',
  cloudEndpoint: process.env.ML_CLOUD_ENDPOINT || '',
  confidenceThreshold: 0.7,
});
