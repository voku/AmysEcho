/**
 * Machine Learning Types for Deutsche Gebärdensprache (DGS) Recognition
 * 
 * These types define the data structures used throughout the sign language
 * recognition pipeline, from MediaPipe landmark extraction to MLP classification.
 */

export interface ClassificationOutput {
  probabilities: ReadonlyArray<number>; // Softmax probabilities for each DGS sign class
  maxProbability: number; // Highest confidence score
  maxIndex: number; // Index of the most likely sign in the vocabulary
}

export interface ProcessedFrame {
  landmarks: number[][][]; // MediaPipe hand landmarks (normalized)
  landmarksRaw?: number[][][]; // Original landmarks before normalization
  width: number;
  height: number;
  timestamp: number;
  processingMs: number; // Time taken to process this frame
  fps: number; // Current frames per second
  predictions?: ClassificationOutput; // MLP classification output
}

export interface GestureResult {
  label: string; // Recognized DGS sign label
  confidence: number; // MLP classifier confidence (0-1)
  timestamp: number;
  isLocal?: boolean; // Whether recognition happened locally (vs server)
  requiresConfirmation?: boolean; // Whether user should confirm this recognition
}

export interface DetailedGestureResult {
  label: string; // Recognized DGS sign label
  confidence: number; // MLP classifier confidence (0-1)
  isLocal: boolean; // Local recognition (on-device) vs server-based
  timestamp: number;
  suggestions: string[]; // Alternative DGS signs if confidence is low
  requiresConfirmation: boolean; // Whether user confirmation is needed
}

export interface MLServiceConfig {
  confidenceThreshold?: number; // Minimum confidence for accepting a DGS sign (default: 0.7)
  processingTimeout?: number;
  enableRemoteClassification?: boolean; // Whether to use server for classification (deprecated)
  remoteRetryMs?: number;
  smootherMinCutOff?: number; // One Euro Filter parameters for landmark smoothing
  smootherBeta?: number;
  smootherDerivateCutOff?: number;
  softmaxTemperature?: number; // Temperature for softmax in MLP output
}
