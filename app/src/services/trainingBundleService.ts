import * as FileSystem from 'expo-file-system';
import { Buffer } from 'buffer';
import { zipSync, strToU8 } from 'fflate';
import { API_URL } from '../constants';
import { loadBackendApiToken, TrainingFrame } from '../storage';
import { flattenHandsWithHandedness } from './handUtils';
import { logger } from '../utils/logger';

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

export interface UploadTrainingBundleResponse {
  id: string;
  status: string;
}

function ensureDirPrefix(uri: string): string {
  if (!uri.endsWith('/')) {
    return `${uri}/`;
  }
  return uri;
}

function buildMetadata(payload: TrainingBundlePayload) {
  return {
    profileId: payload.profileId,
    label: payload.label,
    capturedAt: payload.capturedAt ?? new Date().toISOString(),
    source: payload.source ?? 'app://mediapipe',
  };
}

function buildFrameTimeline(frames: TrainingFrame[]) {
  return frames.map((frame) => ({
    handedness: frame.handedness ?? [],
    landmarks: flattenHandsWithHandedness(frame.landmarks, frame.handedness ?? []),
  }));
}

export async function uploadTrainingBundle(
  payload: TrainingBundlePayload,
  options: UploadTrainingBundleOptions = {},
): Promise<UploadTrainingBundleResponse> {
  if (!payload?.frames?.length) {
    throw new Error('Ungültige Trainingsdaten: Es wurden keine Frames aufgezeichnet.');
  }
  if (!payload.clipUri) {
    throw new Error('Ungültige Trainingsdaten: Es wurde kein Videoclip gespeichert.');
  }

  const token = options.tokenOverride ?? (await loadBackendApiToken());
  if (!token) {
    throw new Error('Kein Zugangstoken für den Server verfügbar.');
  }

  const legacyFs = FileSystem as unknown as {
    cacheDirectory?: string;
    documentDirectory?: string;
    EncodingType?: { UTF8: string; Base64: string };
    FileSystemUploadType?: { BINARY_CONTENT: string };
  };

  const baseDirectory = ensureDirPrefix(
    legacyFs.cacheDirectory ?? legacyFs.documentDirectory ?? 'file:///data/user/0/temporary/',
  );
  const bundleId = `training-bundle-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const zipPath = `${baseDirectory}${bundleId}.zip`;

  // Beispiel für metadata.json:
  // {
  //   "profileId": "123",
  //   "label": "HILFE",
  //   "capturedAt": "2024-05-28T12:03:11Z",
  //   "source": "app://mediapipe"
  // }
  const metadata = buildMetadata(payload);
  const frames = buildFrameTimeline(payload.frames);

  try {
    const metadataContent = JSON.stringify(metadata, null, 2);
    const landmarksContent = JSON.stringify({ frames }, null, 2);
    const clipBase64 = await FileSystem.readAsStringAsync(payload.clipUri, {
      encoding: (legacyFs.EncodingType?.Base64 ?? 'base64') as any,
    });
    const clipBinary = Buffer.from(clipBase64, 'base64');

    const zipped = zipSync({
      'metadata.json': strToU8(metadataContent),
      'landmarks.json': strToU8(landmarksContent),
      'clip.mp4': clipBinary instanceof Uint8Array ? clipBinary : Uint8Array.from(clipBinary),
    });

    await FileSystem.writeAsStringAsync(zipPath, Buffer.from(zipped).toString('base64'), {
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
        },
        uploadType: (legacyFs.FileSystemUploadType?.BINARY_CONTENT ?? 'BINARY_CONTENT') as any,
      },
    );

    if (uploadResult.status < 200 || uploadResult.status >= 300) {
      throw new Error(`Upload fehlgeschlagen (Status ${uploadResult.status}).`);
    }

    let responseJson: unknown;
    if (uploadResult.body) {
      try {
        responseJson = JSON.parse(uploadResult.body);
      } catch (error) {
        logger.warn('Upload-Antwort konnte nicht geparst werden', error);
      }
    }

    if (
      !responseJson ||
      typeof responseJson !== 'object' ||
      !('id' in responseJson) ||
      typeof (responseJson as any).id !== 'string'
    ) {
      throw new Error('Serverantwort enthält keine gültige Bundle-ID.');
    }

    return {
      id: (responseJson as any).id,
      status: typeof (responseJson as any).status === 'string' ? (responseJson as any).status : 'queued',
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Zeitüberschreitung beim Hochladen des Trainingspakets.');
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Hochladen des Trainingspakets fehlgeschlagen: ${message}`);
  } finally {
    try {
      await FileSystem.deleteAsync(zipPath, { idempotent: true } as any);
    } catch (cleanupError) {
      logger.warn('Bereinigung der ZIP-Datei fehlgeschlagen', cleanupError);
    }
  }
}
