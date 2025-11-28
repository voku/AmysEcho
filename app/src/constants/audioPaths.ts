import { ensureDirectoryUri, getDocumentDirectoryUri, joinUriPath } from '../utils/pathUtils';

const documentBaseUri = ensureDirectoryUri(getDocumentDirectoryUri());

export const CUSTOM_AUDIO_DIR = documentBaseUri
  ? joinUriPath(documentBaseUri, 'custom_audio/')
  : null;

export function getCustomAudioPath(symbolId: string): string | null {
  return CUSTOM_AUDIO_DIR ? `${CUSTOM_AUDIO_DIR}${symbolId}.mp3` : null;
}
