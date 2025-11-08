/**
 * Type definitions for MediaPipe Tasks Vision results and related interfaces
 */

// MediaPipe Hand Landmark
export interface HandLandmark {
  x: number;
  y: number;
  z?: number;
}

// MediaPipe Gesture Category
export interface GestureCategory {
  categoryName: string;
  score: number;
}

// MediaPipe Handedness Category
export interface HandednessCategory {
  categoryName: string;
}

// MediaPipe Gesture Recognition Result
export interface MediaPipeGestureResult {
  gestures?: GestureCategory[][];
  landmarks?: HandLandmark[][];
  handednesses?: HandednessCategory[][];
}

// MLP Prediction Result
export interface MLPPrediction {
  label: string;
  score: number;
}

// Gesture Detection Result
export interface GestureResult {
  gesture: string | TwoHandGesture | null;
  confidence: number;
  landmarks?: number[][][];
  handednesses?: string[];
  emergency?: boolean;
  timestamp?: number;
}

// Two-hand gesture representation
export interface TwoHandGesture {
  left: string;
  right: string;
}

// WebView Message Types
export type WebViewMessageType =
  | 'gesture'
  | 'error'
  | 'warn'
  | 'telemetry'
  | 'stability_feedback'
  | 'partial_feedback'
  | 'camera_started'
  | 'mlp_ready'
  | 'dom_ready'
  | 'tap_start'
  | 'tap_start_autostart'
  | 'recognizer_init'
  | 'recognizer_gpu_fallback'
  | 'frame_latency'
  | 'cleanup_done';

// Base WebView Message
export interface WebViewMessage {
  type: WebViewMessageType;
}

// Specific message types
export interface GestureMessage extends WebViewMessage {
  type: 'gesture';
  gesture: string | TwoHandGesture | null;
  confidence: number;
  landmarks?: number[][][];
  handednesses?: string[];
  emergency?: boolean;
  timestamp?: number;
}

export interface ErrorMessage extends WebViewMessage {
  type: 'error';
  message: string;
  _technical?: {
    message: string;
    file?: string;
    line?: number;
    col?: number;
    stack?: string;
  };
}

export interface TelemetryMessage extends WebViewMessage {
  type: 'telemetry';
  event: string;
  ms?: number;
  tracks?: string[];
}

export interface StabilityFeedbackMessage extends WebViewMessage {
  type: 'stability_feedback';
  isStable: boolean;
  stabilityScore: number;
  feedback: string;
  guidePosition?: { x: number; y: number };
}

export interface PartialFeedbackMessage extends WebViewMessage {
  type: 'partial_feedback';
  gesture: string;
  completion: number;
  feedback: string;
}

// Union type for all messages
export type WebViewMessagePayload =
  | GestureMessage
  | ErrorMessage
  | TelemetryMessage
  | StabilityFeedbackMessage
  | PartialFeedbackMessage
  | WebViewMessage;

// Window extensions for custom properties
declare global {
  interface Window {
    // MediaPipe and related
    fileset_resolver?: { FilesetResolver: any };
    vision?: { GestureRecognizer: any };

    // Custom gesture detector properties
    __tapToStart?: string;
    __recognizerInitFailed?: string;
    __predictionError?: string;
    __cameraError?: string;
    __facingMode?: string;
    __mirrorOverlay?: boolean;
    __mlpThreshold?: number;
    __fallbackThreshold?: number;
    __visionBundleNonce?: string;
    __visionBundleSri?: string;
    __mediapipeVersion?: string;
    __allowCdnEsm?: boolean;
    __autostartCamera?: boolean;
    __requestClipAudio?: boolean;
    __requestCameraStart?: (source?: string) => Promise<boolean> | boolean;
    __gestureSizeTolerance?: number;

    // MLP prediction function
    __mlpPredict?: (
      landmarks: number[][][],
      handednesses: unknown,
    ) => { label: string; score: number } | null;

    // React Native WebView
    ReactNativeWebView?: {
      postMessage?: (message: string) => void;
    };



    // Cleanup function
    __cleanupGestureDetector?: (() => void) | undefined;
  }
}

// Type guards
export function isGestureMessage(message: WebViewMessagePayload): message is GestureMessage {
  return message.type === 'gesture';
}

export function isErrorMessage(message: WebViewMessagePayload): message is ErrorMessage {
  return message.type === 'error';
}

export function isTelemetryMessage(message: WebViewMessagePayload): message is TelemetryMessage {
  return message.type === 'telemetry';
}

export function isTwoHandGesture(gesture: any): gesture is TwoHandGesture {
  return gesture && typeof gesture === 'object' && 'left' in gesture && 'right' in gesture;
}

// MediaPipe Recognizer interface
export interface GestureRecognizerLike {
  recognizeForVideo(
    video: HTMLVideoElement,
    timestamp: number
  ): MediaPipeGestureResult | undefined;
  close?: () => Promise<void> | void;
}

// Fileset Resolver interface
export interface FilesetResolver {
  forVisionTasks(wasmBase?: string): Promise<any>;
}

// Vision Tasks interface
export interface VisionTasks {
  FilesetResolver: new () => FilesetResolver;
  GestureRecognizer: new (config: any) => GestureRecognizerLike;
}