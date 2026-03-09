/**
 * Type definitions for MediaPipe Tasks Vision results and related interfaces
 */

import type { GestureWindowAugmentations } from './windowAugmentations';

// MediaPipe Hand Landmark
export interface HandLandmark {
  x: number;
  y: number;
  z?: number;
}

export interface PoseLandmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface FaceLandmark {
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
  poseLandmarks?: PoseLandmark[][];
  faceLandmarks?: FaceLandmark[][];
}

// MediaPipe Holistic Landmarker Result
export interface HolisticLandmarkerResult {
  faceLandmarks: FaceLandmark[];
  poseLandmarks: PoseLandmark[];
  leftHandLandmarks?: HandLandmark[];
  rightHandLandmarks?: HandLandmark[];
  faceBlendshapes?: Array<{ categoryName: string; score: number }>;
  poseWorldLandmarks?: PoseLandmark[];
}

// MLP Prediction Result
export interface MlpCandidate {
  label: string;
  score: number;
}

export interface PrototypePrediction {
  label: string;
  score: number;
  support?: number;
  similarity?: number;
}

export interface MLPPrediction {
  label: string;
  score: number;
  candidates?: MlpCandidate[];
  source?: 'mlp' | 'prototype' | 'hybrid';
  mlpScore?: number;
  prototype?: PrototypePrediction | null;
}

// Gesture Detection Result
export interface GestureResult {
  gesture: string | TwoHandGesture | null;
  confidence: number;
  landmarks?: number[][][];
  handednesses?: string[];
  poseLandmarks?: number[][];
  faceLandmarks?: number[][];
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
  | 'landmarks'
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

export const LANDMARK_STREAM_SCHEMA_VERSION = 1;

export interface LandmarkStreamPayload extends WebViewMessage {
  type: 'landmarks';
  schemaVersion: number;
  timestamp: number;
  landmarks: number[][][];
  visibility: number[][];
  handednesses: string[];
  handedness?: string[];
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
  | LandmarkStreamPayload
  | ErrorMessage
  | TelemetryMessage
  | StabilityFeedbackMessage
  | PartialFeedbackMessage
  | WebViewMessage;

// Window extensions for custom properties
declare global {
  interface Window extends GestureWindowAugmentations {}
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

// MediaPipe Recognizer interfaces
export interface GestureRecognizerLike {
  recognizeForVideo(
    video: HTMLVideoElement,
    timestamp: number
  ): MediaPipeGestureResult | undefined;
  close?: () => Promise<void> | void;
}

export interface HolisticLandmarkerLike {
  detectForVideo(
    video: HTMLVideoElement,
    timestamp: number
  ): HolisticLandmarkerResult | undefined;
  close?: () => Promise<void> | void;
}

// Pose detection result
export interface PoseLandmarkerResult {
  landmarks?: PoseLandmark[][];
}

export interface PoseLandmarkerLike {
  detectForVideo(
    video: HTMLVideoElement,
    timestamp: number
  ): PoseLandmarkerResult | undefined;
  close?: () => Promise<void> | void;
}

// Face detection result
export interface FaceLandmarkerResult {
  faceLandmarks?: FaceLandmark[][];
}

export interface FaceLandmarkerLike {
  detectForVideo(
    video: HTMLVideoElement,
    timestamp: number
  ): FaceLandmarkerResult | undefined;
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
