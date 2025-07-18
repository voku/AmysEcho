export interface AudioConfig {
  volume: number;
  speechRate: number;
  speechPitch: number;
  speechLanguage: string;
  enableHaptics: boolean;
}

export interface SpeechOptions {
  language?: string;
  pitch?: number;
  rate?: number;
  volume?: number;
}

export interface SoundEffect {
  name: string;
  path: any; // require() path
}
