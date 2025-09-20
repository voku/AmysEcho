import { Paths } from 'expo-file-system';

export const CUSTOM_AUDIO_DIR = Paths.document.uri + 'custom_audio/';

export function getCustomAudioPath(symbolId: string): string {
  return CUSTOM_AUDIO_DIR + `${symbolId}.mp3`;
}
