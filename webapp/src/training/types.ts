/**
 * Specifies which hand(s) are semantically important for a gesture.
 * - 'dominant_only': Only the dominant/primary hand is relevant (e.g., DGS "Papa")
 * - 'both_equal': Both hands are equally important, symmetric gestures (e.g., "Haus")
 * - 'both_asymmetric': Both hands matter but with different roles/weights (e.g., "Buch")
 * - 'either_hand': Works with either hand, no preference (e.g., pointing)
 */
export type HandFocus = 
  | 'dominant_only'      // Only one hand matters (the one that's moving)
  | 'both_equal'         // Both hands equally important
  | 'both_asymmetric'    // Both hands, but weighted differently
  | 'either_hand';       // Works with either hand

export interface TrainingFrame {
  landmarks: number[][][];
  handedness?: ReadonlyArray<string>;
  poseLandmarks?: number[][];
  faceLandmarks?: number[][];
  timestampMs?: number;
}

export interface FrameData {
  landmarks: number[][][];
  handedness?: ReadonlyArray<string>;
  poseLandmarks?: number[][];
  faceLandmarks?: number[][];
}

export interface TrainingBundlePayload {
  label: string;
  profileId: string;
  frames: TrainingFrame[];
  capturedAt?: string;
  source?: string;
  smoothingConfig?: {
    method?: string;
    minCutOff?: number;
    beta?: number;
    dCutOff?: number;
  };
  clipFile?: File | null;
  stillFile?: File | null;
  /**
   * Audio file captured during gesture recording.
   * Amy First: Enables multimodal recognition by capturing verbal utterances
   * (e.g., "Iila" for purple) alongside sign language gestures.
   */
  audioFile?: File | null;
  recording?: {
    frameCount?: number;
    usableFrameCount?: number;
    clipDurationMs?: number;
    clipBytes?: number;
    clipMimeType?: string;
    stillBytes?: number;
    stillMimeType?: string;
    /**
     * Audio recording metadata
     */
    audioDurationMs?: number;
    audioBytes?: number;
    audioMimeType?: string;
  };
  /**
   * Specifies which hand(s) are semantically important for this gesture.
   * The training pipeline will focus learning on the specified hand(s) only,
   * reducing noise from irrelevant hand data.
   */
  handFocus?: HandFocus;
  /**
   * Variation learning metadata from SignVariationTracker.
   * Helps the training pipeline identify and learn from natural sign variations.
   */
  variationData?: {
    clusterId?: string;
    variationDiversity?: number;
    canonicalTemplates?: number;
  };
}

export type TrainingJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type TrainingJobMetrics = Record<string, unknown> & {
  accuracy?: number;
  samples?: number;
};

export interface TrainingJobInfo {
  jobId: string;
  status: TrainingJobStatus;
  pollUrl?: string;
  queueDepth?: number;
  retryAfterMs?: number;
  progress?: number;
  message?: string;
  error?: string;
  startedAt?: number;
  endedAt?: number;
  metrics?: TrainingJobMetrics;
  report?: Record<string, unknown>;
}

export interface UploadTrainingBundleResponse {
  id: string;
  status: TrainingJobStatus;
  trainingJob?: TrainingJobInfo;
}
