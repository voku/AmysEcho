import { zipSync } from 'fflate';
import { flattenHandsWithHandedness, frameHasAnyLandmarks } from './handUtils';
import type {
  TrainingBundlePayload,
  TrainingFrame,
  TrainingJobInfo,
  TrainingJobStatus,
  UploadTrainingBundleResponse,
} from './types';

export function buildFrameTimeline(frames: TrainingFrame[]): { handedness: string[]; landmarks: number[][] }[] {
  return frames
    .filter((frame) => frameHasAnyLandmarks(frame.landmarks))
    .map((frame) => {
      const handedness = Array.isArray(frame.handedness)
        ? frame.handedness.filter((entry) => typeof entry === 'string')
        : [];
      return {
        handedness: handedness.map((entry) => String(entry)),
        landmarks: flattenHandsWithHandedness(frame.landmarks, handedness),
      };
    });
}

function extractExtensionFromFile(file: File | null | undefined, fallback: string): string {
  if (!file?.name) return fallback;
  const match = file.name.match(/\.([a-z0-9]{1,8})$/i);
  return match?.[1]?.toLowerCase() || fallback;
}

function buildMetadata(payload: TrainingBundlePayload, clipFilename: string | null, stillFilename: string | null) {
  return {
    profileId: payload.profileId,
    label: payload.label,
    capturedAt: payload.capturedAt ?? new Date().toISOString(),
    source: payload.source ?? 'web://mediapipe',
    ...(clipFilename ? { clipFilename } : {}),
    ...(stillFilename ? { stillFilename } : {}),
  };
}

function parseTrainingJob(raw: unknown): TrainingJobInfo | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const jobId = (raw as { jobId?: unknown; id?: unknown }).jobId ?? (raw as { id?: unknown }).id;
  if (typeof jobId !== 'string' || jobId.trim().length === 0) return undefined;

  const statusRaw = (raw as { status?: unknown }).status;
  const status = normalizeTrainingJobStatus(typeof statusRaw === 'string' ? statusRaw : '');
  const pollUrlRaw = (raw as { pollUrl?: unknown }).pollUrl;

  return {
    jobId: jobId.trim(),
    status: status ?? 'queued',
    ...(typeof pollUrlRaw === 'string' && pollUrlRaw.trim().length > 0 ? { pollUrl: pollUrlRaw.trim() } : {}),
  };
}

export function normalizeTrainingJobStatus(value: string): TrainingJobStatus | undefined {
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case 'queued':
    case 'pending':
      return 'queued';
    case 'running':
      return 'running';
    case 'completed':
    case 'complete':
    case 'done':
    case 'success':
    case 'succeeded':
    case 'ok':
      return 'completed';
    case 'failed':
    case 'failure':
    case 'error':
      return 'failed';
    default:
      return undefined;
  }
}

function isUploadResponse(obj: unknown): obj is UploadTrainingBundleResponse {
  return typeof obj === 'object' && obj !== null && 'id' in obj && typeof (obj as { id: unknown }).id === 'string';
}

export async function createTrainingZip(payload: TrainingBundlePayload): Promise<Uint8Array> {
  if (!payload.frames || payload.frames.length === 0) {
    throw new Error('Es wurden keine Frames für das Trainingspaket gefunden.');
  }
  if (!payload.profileId || !payload.label) {
    throw new Error('Profil und Label sind Pflichtfelder.');
  }

  const clipFilename = payload.clipFile ? `clip.${extractExtensionFromFile(payload.clipFile, 'mp4')}` : null;
  const stillFilename = payload.stillFile ? `still.${extractExtensionFromFile(payload.stillFile, 'jpg')}` : null;
  const metadata = buildMetadata(payload, clipFilename, stillFilename);
  const frames = buildFrameTimeline(payload.frames);

  const metadataContent = JSON.stringify(metadata, null, 2);
  const landmarksContent = JSON.stringify({ frames }, null, 2);
  const encoder = new TextEncoder();
  const metadataBytes = Uint8Array.from(encoder.encode(metadataContent));
  const landmarkBytes = Uint8Array.from(encoder.encode(landmarksContent));

  if (metadataBytes.length === 0 || landmarkBytes.length === 0) {
    throw new Error('Metadaten oder Landmarken konnten nicht serialisiert werden.');
  }

  const entries: Record<string, any> = {
    'metadata.json': [metadataBytes, { level: 0 }],
    'landmarks.json': [landmarkBytes, { level: 0 }],
  };

  const fileToUint8Array = async (file: File) => {
    if (typeof file.arrayBuffer === 'function') {
      return new Uint8Array(await file.arrayBuffer());
    }
    const response = new Response(file);
    return new Uint8Array(await response.arrayBuffer());
  };

  if (payload.clipFile && clipFilename) {
    const clipBuffer = await fileToUint8Array(payload.clipFile);
    entries[clipFilename] = [clipBuffer, { level: 0 }];
  }

  if (payload.stillFile && stillFilename) {
    try {
      const stillBuffer = await fileToUint8Array(payload.stillFile);
      entries[stillFilename] = [stillBuffer, { level: 0 }];
    } catch (error) {
      console.warn('Still-Bild konnte nicht gelesen werden', error);
    }
  }

  return zipSync(entries);
}

export async function uploadTrainingZip(
  zip: Uint8Array,
  options: { endpoint?: string; token?: string } = {},
): Promise<UploadTrainingBundleResponse> {
  const endpoint =
    options.endpoint ?? `${import.meta.env['VITE_API_URL'] ?? 'http://localhost:5000'}/api/v1/dgs/sample-bundles`;

  const zipView = new Uint8Array(zip);
  const body = new Blob([zipView], { type: 'application/zip' });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/zip',
      Accept: 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Upload fehlgeschlagen (HTTP ${response.status}).`);
  }

  let responseJson: unknown;
  try {
    responseJson = await response.json();
  } catch (error) {
    throw new Error('Serverantwort konnte nicht gelesen werden.');
  }

  if (!isUploadResponse(responseJson)) {
    throw new Error('Serverantwort enthält keine gültige Bundle-ID.');
  }

  const trainingJob = parseTrainingJob((responseJson as { trainingJob?: unknown }).trainingJob);
  const statusNormalized = normalizeTrainingJobStatus((responseJson as { status?: string }).status ?? '') ?? 'queued';

  return {
    id: responseJson.id,
    status: statusNormalized,
    ...(trainingJob ? { trainingJob } : {}),
  };
}

export async function uploadTrainingBundle(
  payload: TrainingBundlePayload,
  options: { endpoint?: string; token?: string } = {},
): Promise<UploadTrainingBundleResponse> {
  const zip = await createTrainingZip(payload);
  return uploadTrainingZip(zip, options);
}
