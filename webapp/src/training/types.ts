export interface TrainingFrame {
  landmarks: number[][][];
  handedness?: ReadonlyArray<string>;
}

export interface FrameData {
  landmarks: number[][][];
  handedness?: ReadonlyArray<string>;
}

export interface TrainingBundlePayload {
  label: string;
  profileId: string;
  frames: TrainingFrame[];
  capturedAt?: string;
  source?: string;
  clipFile?: File | null;
  stillFile?: File | null;
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
