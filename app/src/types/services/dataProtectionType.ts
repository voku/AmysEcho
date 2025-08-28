import { GestureRecognitionResult } from '../';

export interface GestureData extends GestureRecognitionResult {
  sessionId: string;
}

export interface AnonymizedGestureData extends GestureRecognitionResult {
  sessionId: string;
}