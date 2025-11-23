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

export interface TrainingJobInfo {
  jobId: string;
  status: TrainingJobStatus;
  pollUrl?: string;
}

export interface UploadTrainingBundleResponse {
  id: string;
  status: TrainingJobStatus;
  trainingJob?: TrainingJobInfo;
}
