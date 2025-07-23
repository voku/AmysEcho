import * as FileSystem from 'expo-file-system';

export const CUSTOM_AUDIO_DIR = FileSystem.documentDirectory + 'custom_audio/';

export function getCustomAudioPath(symbolId: string): string {
  return CUSTOM_AUDIO_DIR + `${symbolId}.m4a`;
}
