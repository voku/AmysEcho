import { Platform } from 'react-native';

import type { ClipReadyPayload } from '../types/frames';

type FileSystemModule = typeof import('expo-file-system');

type FileEncoding = 'utf8' | 'base64';

export type ExpoFileSystemCompat = FileSystemModule & {
  cacheDirectory?: string | null;
  documentDirectory?: string | null;
  storageDirectory?: string | null;
  externalDirectory?: string | null;
  externalCacheDirectory?: string | null;
  EncodingType?: { Base64?: FileEncoding } | null;
};

type PlatformLike = Pick<typeof Platform, 'OS' | 'Version'>;

export interface ClipPersistenceLogger {
  warn: (message: string, error?: unknown) => void;
}

export class ClipCaptureError extends Error {
  constructor(message = 'clip_capture_failed') {
    super(message);
    this.name = 'ClipCaptureError';
  }
}

export const CLIP_CAPTURE_ERROR_MESSAGES = {
  clip_capture_failed: 'Videoclip konnte nicht gespeichert werden. Versuch es nochmal!',
  clip_capture_cancelled: 'Die Videoaufnahme wurde abgebrochen. Versuch es nochmal.',
  clip_capture_timeout: 'Die Videoaufnahme hat zu lange gedauert. Versuch es bitte erneut.',
  clip_payload_invalid: 'Videodaten waren ungültig. Bitte nimm die Geste erneut auf.',
  clip_write_failed: 'Videodatei konnte nicht gespeichert werden. Prüfe den Gerätespeicher und versuche es erneut.',
  clip_directory_unavailable:
    'Amy kann auf diesem Gerät keine Videoclips speichern. Deine Handbewegungen werden trotzdem gespeichert.',
  clip_path_components_invalid: 'Videodateiname ist ungültig. Bitte Aufnahme erneut starten.',
  clip_payload_empty: 'Von der Kamera wurde kein Video übertragen. Versuch es bitte nochmal.',
  clip_stop_failed: 'Videorekorder konnte nicht gestoppt werden. Versuch die Aufnahme erneut.',
  clip_start_failed: 'Videorekorder konnte nicht gestartet werden. Versuch es bitte erneut.',
  clip_error: 'Unbekannter Fehler bei der Videoaufnahme. Versuch es bitte erneut.',
  no_active_clip_capture: 'Es läuft keine Videoaufnahme. Starte zuerst eine neue Aufnahme.',
  webview_not_ready: 'Die Kameraansicht ist noch nicht bereit. Warte kurz und versuch es erneut.',
  media_recorder_unavailable:
    'Dieses Gerät unterstützt keine Videoaufnahmen in der Kameraansicht. Amy speichert trotzdem deine Handbewegungen.',
  media_recorder_not_supported:
    'Videoaufnahmen werden auf diesem Gerät nicht unterstützt. Amy speichert trotzdem deine Handbewegungen.',
  orchestrator_unavailable:
    'Videoaufnahmen konnten nicht vorbereitet werden. Bitte starte die App neu und versuch es erneut.',
  no_camera_stream: 'Es steht kein Kamerabild zur Verfügung. Bitte prüfe die Kamera und versuch es erneut.',
  recorder_init_failed: 'Die Videoaufnahme konnte nicht vorbereitet werden. Versuch es bitte erneut.',
  recorder_start_failed: 'Die Videoaufnahme konnte nicht gestartet werden. Versuch es bitte erneut.',
  fallback_recorder_failed:
    'Amy kann aus den aktuellen Kamerabildern kein Video erstellen. Deine Handbewegung wird trotzdem gespeichert.',
  fallback_clip_empty:
    'Von der Kamera kamen zu wenige Bilder an. Versuch die Aufnahme bitte erneut.',
} as const;

export type ClipCaptureErrorCode = keyof typeof CLIP_CAPTURE_ERROR_MESSAGES;

export const DEFAULT_CLIP_CAPTURE_ERROR_MESSAGE =
  CLIP_CAPTURE_ERROR_MESSAGES.clip_capture_failed;

const ensureTrailingSlash = (directory: string): string =>
  directory.endsWith('/') ? directory : `${directory}/`;

const toAndroidVersionNumber = (platform: PlatformLike): number | null => {
  const { Version } = platform;
  if (typeof Version === 'number') {
    return Version;
  }
  if (typeof Version === 'string') {
    const parsed = parseInt(Version, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const isScopedStorageAndroid = (platform: PlatformLike): boolean => {
  if (platform.OS !== 'android') {
    return false;
  }
  const version = toAndroidVersionNumber(platform);
  return typeof version === 'number' && version >= 30;
};

const resolveClipBaseDirectoryCandidates = (
  fs: ExpoFileSystemCompat,
  platform: PlatformLike,
): string[] => {
  const candidates = isScopedStorageAndroid(platform)
    ? [fs.cacheDirectory, fs.externalCacheDirectory, fs.documentDirectory]
    : [
        fs.documentDirectory,
        fs.storageDirectory,
        fs.externalDirectory,
        fs.cacheDirectory,
        fs.externalCacheDirectory,
      ];

  const normalized = candidates
    .filter((directory): directory is string => typeof directory === 'string' && directory.length > 0)
    .map(ensureTrailingSlash);

  return Array.from(new Set(normalized));
};

export const resolveClipBaseDirectory = (
  fs: ExpoFileSystemCompat,
  platform: PlatformLike = Platform,
): string | null => {
  return resolveClipBaseDirectoryCandidates(fs, platform)[0] ?? null;
};

export const canUseClipStorage = (
  fs: ExpoFileSystemCompat,
  platform: PlatformLike = Platform,
): boolean => {
  return resolveClipBaseDirectoryCandidates(fs, platform).length > 0;
};

const resolveClipCaptureErrorCode = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  if (value in CLIP_CAPTURE_ERROR_MESSAGES) {
    return value;
  }
  return null;
};

export const getClipCaptureErrorMessage = (error: unknown): string => {
  if (!error) {
    return DEFAULT_CLIP_CAPTURE_ERROR_MESSAGE;
  }

  let message: string | null | undefined = null;

  if (typeof error === 'string') {
    message = error;
  } else if (error instanceof Error) {
    message = error.message;
  }

  const resolved = resolveClipCaptureErrorCode(message);
  return resolved
    ? CLIP_CAPTURE_ERROR_MESSAGES[resolved as ClipCaptureErrorCode]
    : DEFAULT_CLIP_CAPTURE_ERROR_MESSAGE;
};

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

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

export const sanitizeClipBase64 = (payload: string): string => {
  if (typeof payload !== 'string') {
    return '';
  }

  const trimmed = payload.trim();
  if (!trimmed) {
    return '';
  }

  const commaIndex = trimmed.startsWith('data:') ? trimmed.indexOf(',') : -1;
  const withoutPrefix = commaIndex >= 0 ? trimmed.slice(commaIndex + 1) : trimmed;
  const sanitized = withoutPrefix.replace(/\s+/g, '');

  if (!sanitized || sanitized.length % 4 !== 0 || !BASE64_PATTERN.test(sanitized)) {
    return '';
  }

  return sanitized;
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
  platform?: PlatformLike;
}

export const persistClipToDirectory = async ({
  fs,
  clip,
  directoryName,
  filePrefix,
  logger,
  platform = Platform,
}: PersistClipOptions): Promise<string> => {
  if (/[\\/]|\.\./.test(directoryName) || /[\\/]|\.\./.test(filePrefix)) {
    logger?.warn('Ungültige Pfadbestandteile für Clip-Speicherung', {
      directoryName,
      filePrefix,
    });
    throw new ClipCaptureError('clip_path_components_invalid');
  }

  const baseDirectories = resolveClipBaseDirectoryCandidates(fs, platform);
  if (baseDirectories.length === 0) {
    throw new ClipCaptureError('clip_directory_unavailable');
  }

  const normalizedDirectoryName = directoryName.replace(/\/+$/, '');
  const extension = getExtensionFromMime(clip.mimeType);
  const encoding: FileEncoding = fs.EncodingType?.Base64 ?? 'base64';
  const base64Payload = sanitizeClipBase64(clip.base64);
  if (!base64Payload) {
    logger?.warn('Clip-base64-Payload fehlt oder ist ungültig', {
      clipId: clip.id,
      mimeType: clip.mimeType,
    });
    throw new ClipCaptureError('clip_payload_invalid');
  }

  let lastFailure: ClipCaptureError | null = null;

  for (const baseDirectory of baseDirectories) {
    const clipDirectory = `${baseDirectory}${normalizedDirectoryName}/`;

    try {
      await ensureDirectory(fs, clipDirectory, logger);
    } catch (directoryError) {
      if (directoryError instanceof ClipCaptureError && directoryError.message === 'clip_directory_unavailable') {
        lastFailure = directoryError;
        continue;
      }
      throw directoryError;
    }

    const targetUri = `${clipDirectory}${filePrefix}-${clip.id}.${extension}`;

    try {
      await fs.writeAsStringAsync(targetUri, base64Payload, { encoding });
      return targetUri;
    } catch (writeError) {
      logger?.warn('Clip konnte nicht gespeichert werden', writeError);
      lastFailure = new ClipCaptureError('clip_write_failed');
      continue;
    }
  }

  throw lastFailure ?? new ClipCaptureError('clip_directory_unavailable');
};
