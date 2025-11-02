import type { ClipReadyPayload } from '../types/frames';

type FileSystemModule = typeof import('expo-file-system');

type FileEncoding = 'utf8' | 'base64';

export type ExpoFileSystemCompat = FileSystemModule & {
  cacheDirectory?: string | null;
  documentDirectory?: string | null;
  EncodingType?: { Base64?: FileEncoding } | null;
};

export interface ClipPersistenceLogger {
  warn: (message: string, error?: unknown) => void;
}

export class ClipCaptureError extends Error {
  constructor(message = 'clip_capture_failed') {
    super(message);
    this.name = 'ClipCaptureError';
  }
}

export const getExtensionFromMime = (mimeType: string): string => {
  const normalized = mimeType?.toLowerCase() ?? '';
  const known: Record<string, string> = {
    'video/webm': 'webm',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
  };
  const mapped = known[normalized];
  if (mapped) {
    return mapped;
  }

  const [, extracted] = normalized.match(/^[\-\w+.]+\/([\-\w+.]+)/) ?? [];
  if (extracted) {
    const clean = extracted.split(';')[0]?.replace(/[^a-z0-9]/g, '');
    if (clean) {
      return clean;
    }
  }

  return 'mp4';
};

const ensureDirectory = async (
  fs: ExpoFileSystemCompat,
  directoryUri: string,
  logger?: ClipPersistenceLogger,
): Promise<void> => {
  try {
    const directoryInfo = await fs.getInfoAsync(directoryUri);
    if (!directoryInfo.exists) {
      await fs.makeDirectoryAsync(directoryUri, { intermediates: true });
      return;
    }

    if (!directoryInfo.isDirectory) {
      await fs.deleteAsync(directoryUri, { idempotent: true });
      await fs.makeDirectoryAsync(directoryUri, { intermediates: true });
    }
  } catch (directoryError) {
    logger?.warn('Clip-Verzeichnis konnte nicht vorbereitet werden', directoryError);
    throw new ClipCaptureError('clip_directory_unavailable');
  }
};

export interface PersistClipOptions {
  fs: ExpoFileSystemCompat;
  clip: ClipReadyPayload;
  directoryName: string;
  filePrefix: string;
  logger?: ClipPersistenceLogger;
}

export const persistClipToDirectory = async ({
  fs,
  clip,
  directoryName,
  filePrefix,
  logger,
}: PersistClipOptions): Promise<string> => {
  if (/[\\/]|\.\./.test(directoryName) || /[\\/]|\.\./.test(filePrefix)) {
    logger?.warn('Ungültige Pfadbestandteile für Clip-Speicherung', {
      directoryName,
      filePrefix,
    });
    throw new ClipCaptureError('clip_path_components_invalid');
  }

  const baseDirectory = fs.cacheDirectory ?? fs.documentDirectory;
  if (!baseDirectory) {
    throw new ClipCaptureError('clip_directory_unavailable');
  }

  const normalizedDirectoryName = directoryName.replace(/\/+$/, '');
  const clipDirectory = `${baseDirectory}${normalizedDirectoryName}/`;
  await ensureDirectory(fs, clipDirectory, logger);

  const extension = getExtensionFromMime(clip.mimeType);
  const targetUri = `${clipDirectory}${filePrefix}-${clip.id}.${extension}`;
  const encoding: FileEncoding = fs.EncodingType?.Base64 ?? 'base64';
  await fs.writeAsStringAsync(targetUri, clip.base64, { encoding });
  return targetUri;
};
