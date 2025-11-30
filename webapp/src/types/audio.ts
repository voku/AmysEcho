export interface AudioConfig {
  volume: number;
  speechRate: number;
  speechPitch: number;
  speechLanguage: string;
  enableHaptics: boolean;
  duplicateSpeechDebounceMs: number;
}

export interface SpeechOptions {
  language?: string;
  pitch?: number;
  rate?: number;
  volume?: number;
}

export interface SpeakRequestOptions extends SpeechOptions {
  allowDuplicates?: boolean;
}

export interface SoundEffect {
  name: string;
  path: string;
}
