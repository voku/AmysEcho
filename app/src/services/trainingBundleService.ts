import * as FileSystem from 'expo-file-system';
import { zipSync, strToU8 } from 'fflate';
import { API_URL } from '../constants';
import { loadBackendApiToken, TrainingFrame } from '../storage';
import { flattenHandsWithHandedness } from './handUtils';
import { logger } from '../utils/logger';
import { base64ToUint8Array, uint8ArrayToBase64 } from '../utils/base64';

export interface TrainingBundlePayload {
  label: string;
  profileId: string;
  frames: TrainingFrame[];
  clipUri: string;
  capturedAt?: string;
  source?: string;
}

export interface UploadTrainingBundleOptions {
  endpointOverride?: string;
  tokenOverride?: string;
}

const TRAINING_JOB_STATUSES = ['queued', 'running', 'completed', 'failed'] as const;
export type TrainingJobStatus = (typeof TRAINING_JOB_STATUSES)[number];

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

function ensureDirPrefix(uri: string): string {
  if (!uri.endsWith('/')) {
    return `${uri}/`;
  }
  return uri;
}

function extractClipExtension(uri: string): string | null {
  if (typeof uri !== 'string' || uri.length === 0) {
    return null;
  }
  const sanitized = uri.split(/[?#]/, 1)[0] ?? '';
  const lastSegmentMatch = sanitized.match(/([^/]+)$/);
  const lastSegment = (lastSegmentMatch?.[1] ?? '').trim();
  if (!lastSegment) {
    return null;
  }
  const extensionMatch = lastSegment.match(/\.([a-z0-9]{1,8})$/i);
  const extension = extensionMatch?.[1];
  if (!extension) {
    return null;
  }
  return extension.toLowerCase();
}

function buildClipFilename(clipUri: string): string {
  const extension = extractClipExtension(clipUri) ?? 'mp4';
  return `clip.${extension}`;
}

function buildMetadata(payload: TrainingBundlePayload, clipFilename: string) {
  return {
    profileId: payload.profileId,
    label: payload.label,
    capturedAt: payload.capturedAt ?? new Date().toISOString(),
    source: payload.source ?? 'app://mediapipe',
    clipFilename,
  };
}

function alignHandednessForTimeline(
  handedness: ReadonlyArray<string> | undefined,
): string[] {
  if (!handedness) {
    return [];
  }

  const entries = handedness
    .map((label) =>
      typeof label === 'string'
        ? { raw: label, normalized: label.trim() }
        : null,
    )
    .filter((entry): entry is { raw: string; normalized: string } => !!entry && entry.normalized.length > 0);
  if (entries.length === 0) {
    return [];
  }

  const leftEntry = entries.find((entry) => /left/i.test(entry.normalized));
  const rightEntry = entries.find((entry) => /right/i.test(entry.normalized));

  const aligned: string[] = [];
  if (leftEntry) {
    aligned.push(leftEntry.raw);
  }
  if (rightEntry && rightEntry !== leftEntry) {
    aligned.push(rightEntry.raw);
  }

  entries.forEach((entry) => {
    if (entry !== leftEntry && entry !== rightEntry) {
      aligned.push(entry.raw);
    }
  });

  return aligned;
}

function buildFrameTimeline(
  frames: TrainingFrame[],
): { handedness: string[]; landmarks: number[][] }[] {
  return frames.map((frame) => {
    const rawHandedness = Array.from(frame.handedness ?? []);
    const handedness = alignHandednessForTimeline(rawHandedness);
    const landmarks = Array.isArray(frame.landmarks) ? frame.landmarks : [];
    return {
      handedness,
      landmarks: flattenHandsWithHandedness(landmarks, rawHandedness),
    };
  });
}

type LegacyFileSystemModule = Partial<typeof FileSystem> & {
  cacheDirectory?: string;
  documentDirectory?: string;
  EncodingType?: { UTF8: string; Base64: string };
};

type CryptoLike = {
  randomUUID?: () => string;
  getRandomValues?: (array: Uint8Array) => void;
};

function createUuid(): string | undefined {
  const cryptoImpl: CryptoLike | undefined =
    typeof globalThis === 'object' && 'crypto' in globalThis
      ? (globalThis.crypto as CryptoLike | undefined)
      : undefined;

  if (cryptoImpl?.randomUUID) {
    return cryptoImpl.randomUUID();
  }

  if (cryptoImpl?.getRandomValues) {
    const bytes = new Uint8Array(16);
    cryptoImpl.getRandomValues(bytes);
    // Version 4 UUID per RFC 4122
    const sixth = bytes[6] ?? 0;
    const eighth = bytes[8] ?? 0;
    bytes[6] = (sixth & 0x0f) | 0x40;
    bytes[8] = (eighth & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return undefined;
}

function createBundleId(): string {
  const uuid = createUuid();
  if (uuid) {
    return `training-bundle-${uuid}`;
  }
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2);
  return `training-bundle-${timestamp}-${random}`;
}

function isUploadResponse(obj: unknown): obj is {
  id: string;
  status?: unknown;
  trainingJob?: unknown;
} {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    typeof (obj as { id: unknown }).id === 'string'
  );
}

function isTrainingJobStatus(value: string): value is TrainingJobStatus {
  return (TRAINING_JOB_STATUSES as readonly string[]).includes(value);
}

function normalizeTrainingJobStatus(
  value: unknown,
  fallback: TrainingJobStatus = 'queued',
): TrainingJobStatus {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0 && isTrainingJobStatus(trimmed)) {
      return trimmed;
    }
  }
  return fallback;
}

function parseTrainingJob(value: unknown): TrainingJobInfo | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const jobIdRaw = (value as { jobId?: unknown }).jobId;
  const statusRaw = (value as { status?: unknown }).status;
  if (typeof jobIdRaw !== 'string' || jobIdRaw.trim().length === 0) {
    return undefined;
  }
  const pollUrlRaw = (value as { pollUrl?: unknown }).pollUrl;
  const pollUrl =
    typeof pollUrlRaw === 'string' && pollUrlRaw.trim().length > 0 ? pollUrlRaw.trim() : undefined;
  const normalizedStatus = normalizeTrainingJobStatus(statusRaw);

  return {
    jobId: jobIdRaw.trim(),
    status: normalizedStatus,
    ...(pollUrl ? { pollUrl } : {}),
  };
}

export async function uploadTrainingBundle(
  payload: TrainingBundlePayload,
  options: UploadTrainingBundleOptions = {},
): Promise<UploadTrainingBundleResponse> {
  if (!payload?.frames?.length) {
    throw new Error(
      'Ungültige Trainingsdaten: Es wurden keine Frames aufgezeichnet. (Invalid training data: no frames recorded.)',
    );
  }
  if (!payload.clipUri) {
    throw new Error(
      'Ungültige Trainingsdaten: Es wurde kein Videoclip gespeichert. (Invalid training data: missing clip.)',
    );
  }

  const token = options.tokenOverride ?? (await loadBackendApiToken());
  if (!token) {
    throw new Error(
      'Kein Zugangstoken für den Server verfügbar. (Server access token unavailable.)',
    );
  }

  const legacyFs = FileSystem as LegacyFileSystemModule;
  const baseDir = legacyFs.cacheDirectory ?? legacyFs.documentDirectory;
  if (!baseDir) {
    throw new Error(
      'Temporäres Verzeichnis für das Trainingspaket nicht verfügbar. (Temporary training bundle directory unavailable.)',
    );
  }

  const uploadType = FileSystem.FileSystemUploadType?.BINARY_CONTENT;
  if (uploadType === undefined) {
    throw new Error(
      'Datei-Upload-Typ nicht verfügbar. (FileSystem binary upload type unavailable.)',
    );
  }

  const baseDirectory = ensureDirPrefix(baseDir);
  const bundleId = createBundleId();
  const zipPath = `${baseDirectory}${bundleId}.zip`;

  // Beispiel für metadata.json:
  // {
  //   "profileId": "123",
  //   "label": "HILFE",
  //   "capturedAt": "2024-05-28T12:03:11Z",
  //   "source": "app://mediapipe"
  // }
  const clipFilename = buildClipFilename(payload.clipUri);
  const metadata = buildMetadata(payload, clipFilename);
  const frames = buildFrameTimeline(payload.frames);

  try {
    const metadataContent = JSON.stringify(metadata, null, 2);
    const landmarksContent = JSON.stringify({ frames }, null, 2);
    const clipBase64 = await FileSystem.readAsStringAsync(payload.clipUri, {
      encoding: (legacyFs.EncodingType?.Base64 ?? 'base64') as any,
    });
    const clipBinary = base64ToUint8Array(clipBase64);

    const zipped = zipSync({
      'metadata.json': strToU8(metadataContent),
      'landmarks.json': strToU8(landmarksContent),
      // Store video without extra compression (level: 0) to reduce CPU and time
      [clipFilename]: [
        clipBinary,
        { level: 0 },
      ],
    });

    const base64Zip = uint8ArrayToBase64(zipped);
    await FileSystem.writeAsStringAsync(zipPath, base64Zip, {
      encoding: (legacyFs.EncodingType?.Base64 ?? 'base64') as any,
    });

    const uploadResult = await FileSystem.uploadAsync(
      options.endpointOverride ?? `${API_URL}/api/v1/dgs/sample-bundles`,
      zipPath,
      {
        httpMethod: 'POST',
        headers: {
          'Content-Type': 'application/zip',
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        uploadType,
      },
    );

    if (uploadResult.status < 200 || uploadResult.status >= 300) {
      throw new Error(`Upload fehlgeschlagen (Status ${uploadResult.status}). (Upload failed.)`);
    }

    let responseJson: unknown;
    if (uploadResult.body) {
      try {
        responseJson = JSON.parse(uploadResult.body);
      } catch (error) {
        logger.warn(
          'Upload-Antwort konnte nicht geparst werden (Failed to parse upload response)',
          error instanceof Error ? error.message : error,
        );
      }
    }

    if (!isUploadResponse(responseJson)) {
      throw new Error(
        'Serverantwort enthält keine gültige Bundle-ID. (Server response missing bundle identifier.)',
      );
    }

    const trainingJob = parseTrainingJob(responseJson.trainingJob);

    return {
      id: responseJson.id,
      status: normalizeTrainingJobStatus(responseJson.status),
      ...(trainingJob ? { trainingJob } : {}),
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        'Zeitüberschreitung beim Hochladen des Trainingspakets. (Training bundle upload timed out.)',
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Hochladen des Trainingspakets fehlgeschlagen: ${message}. (Training bundle upload failed.)`,
    );
  } finally {
    try {
      await FileSystem.deleteAsync(zipPath, { idempotent: true } as any);
    } catch (cleanupError) {
      logger.warn('Bereinigung der ZIP-Datei fehlgeschlagen (ZIP cleanup failed)', cleanupError);
    }
  }
}
