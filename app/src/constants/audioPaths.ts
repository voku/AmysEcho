import { ensureDirectoryUri, getDocumentDirectoryUri, joinUriPath } from '../utils/pathUtils';

const documentBaseUri = ensureDirectoryUri(getDocumentDirectoryUri());

export const CUSTOM_AUDIO_DIR = documentBaseUri
  ? joinUriPath(documentBaseUri, 'custom_audio/')
  : 'custom_audio/';

export function getCustomAudioPath(symbolId: string): string {
  return `${CUSTOM_AUDIO_DIR}${symbolId}.mp3`;
}
