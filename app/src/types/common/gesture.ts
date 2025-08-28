export interface GestureRecognitionResult {
  label: string;
  confidence: number;
  timestamp: number;
  isLocal?: boolean;
  requiresConfirmation?: boolean;
}
