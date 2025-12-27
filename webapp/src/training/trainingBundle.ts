import { zipSync } from 'fflate';
import { flattenHandsWithHandedness, frameHasAnyLandmarks, framesHaveHandLandmarks } from './handUtils';
import { fetchWithRetry, HttpError } from '../utils/http';
import type {
  TrainingBundlePayload,
  TrainingFrame,
  TrainingJobInfo,
  TrainingJobMetrics,
  TrainingJobStatus,
  UploadTrainingBundleResponse,
} from './types';

const DEFAULT_SMOOTHING = {
  method: 'one_euro',
  minCutOff: 1.2,
  beta: 0.01,
  dCutOff: 1.0,
} as const;

type TimelineFrame = {
  handedness: string[];
  landmarks: number[][];
  handLandmarks: number[][][];
  poseLandmarks: number[][];
  faceLandmarks: number[][];
  timestampMs?: number;
};

type LandmarksMetadata = {
  modalities: {
    hands: { present: boolean; frameCount: number; coverage: number };
    pose: { present: boolean; frameCount: number; coverage: number };
    face: { present: boolean; frameCount: number; coverage: number };
  };
  smoothing: {
    method: string;
    minCutOff: number;
    beta: number;
    dCutOff: number;
  };
  handedness?: { labels: string[]; frameCount: number };
};

export function buildFrameTimeline(frames: TrainingFrame[]): TimelineFrame[] {
  return frames
    .filter((frame) => frameHasAnyLandmarks(frame))
    .map((frame) => {
      const handedness = Array.isArray(frame.handedness)
        ? frame.handedness.filter((entry) => typeof entry === 'string')
        : [];
      return {
        handedness: handedness.map((entry) => String(entry)),
        landmarks: flattenHandsWithHandedness(frame.landmarks, handedness),
        handLandmarks: frame.landmarks.map((hand) =>
          Array.isArray(hand)
            ? hand.map((point) => (Array.isArray(point) ? [...point] : [0, 0, 0]))
            : [],
        ),
        poseLandmarks: Array.isArray(frame.poseLandmarks)
          ? frame.poseLandmarks.map((point) => (Array.isArray(point) ? [...point] : [0, 0, 0]))
          : [],
        faceLandmarks: Array.isArray(frame.faceLandmarks)
          ? frame.faceLandmarks.map((point) => (Array.isArray(point) ? [...point] : [0, 0, 0]))
          : [],
        ...(typeof frame.timestampMs === 'number' && Number.isFinite(frame.timestampMs)
          ? { timestampMs: frame.timestampMs }
          : {}),
      };
    });
}

function extractExtensionFromFile(file: File | null | undefined, fallback: string): string {
  if (!file?.name) return fallback;
  const match = file.name.match(/\.([a-z0-9]{1,8})$/i);
  return match?.[1]?.toLowerCase() || fallback;
}

function buildMetadata(
  payload: TrainingBundlePayload,
  clipFilename: string | null,
  stillFilename: string | null,
  landmarksMetadata: LandmarksMetadata,
  frames: TimelineFrame[],
) {
  const clipBytes = payload.recording?.clipBytes ?? payload.clipFile?.size;
  const stillBytes = payload.recording?.stillBytes ?? payload.stillFile?.size;
  const clipMimeType = payload.recording?.clipMimeType ?? payload.clipFile?.type;
  const stillMimeType = payload.recording?.stillMimeType ?? payload.stillFile?.type;
  const recording = {
    ...(typeof payload.recording?.frameCount === 'number' ? { frameCount: payload.recording.frameCount } : {}),
    ...(frames.length > 0 ? { usableFrameCount: frames.length } : {}),
    ...(typeof payload.recording?.clipDurationMs === 'number' ? { clipDurationMs: payload.recording.clipDurationMs } : {}),
    ...(typeof clipBytes === 'number' ? { clipBytes } : {}),
    ...(typeof clipMimeType === 'string' && clipMimeType.trim().length > 0 ? { clipMimeType } : {}),
    ...(typeof stillBytes === 'number' ? { stillBytes } : {}),
    ...(typeof stillMimeType === 'string' && stillMimeType.trim().length > 0 ? { stillMimeType } : {}),
  };

  return {
    profileId: payload.profileId,
    label: payload.label,
    capturedAt: payload.capturedAt ?? new Date().toISOString(),
    source: payload.source ?? 'web://mediapipe',
    ...(clipFilename ? { clipFilename } : {}),
    ...(stillFilename ? { stillFilename } : {}),
    modalities: landmarksMetadata.modalities,
    smoothing: landmarksMetadata.smoothing,
    ...(landmarksMetadata.handedness ? { handedness: landmarksMetadata.handedness } : {}),
    ...(payload.handFocus ? { handFocus: payload.handFocus } : {}),
    ...(payload.variationData ? { variationData: payload.variationData } : {}),
    ...(Object.keys(recording).length > 0 ? { recording } : {}),
  };
}

function parseMetrics(raw: unknown): TrainingJobMetrics | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  return raw as TrainingJobMetrics;
}

function buildLandmarksMetadata(frames: TimelineFrame[], payload: TrainingBundlePayload) {
  const totalFrames = frames.length;
  let handsFrameCount = 0;
  let poseFrameCount = 0;
  let faceFrameCount = 0;
  let handednessFrameCount = 0;
  const handednessLabels = new Set<string>();

  for (const frame of frames) {
    if (frame.landmarks && frame.landmarks.some((hand) => hand.length > 0)) {
      handsFrameCount++;
    }
    if (frame.poseLandmarks && frame.poseLandmarks.length > 0) {
      poseFrameCount++;
    }
    if (frame.faceLandmarks && frame.faceLandmarks.length > 0) {
      faceFrameCount++;
    }
    if (frame.handedness && frame.handedness.length > 0) {
      handednessFrameCount++;
      frame.handedness.forEach((hand) => handednessLabels.add(hand));
    }
  }

  const modalities = {
    hands: {
      present: handsFrameCount > 0,
      frameCount: handsFrameCount,
      coverage: totalFrames > 0 ? handsFrameCount / totalFrames : 0,
    },
    pose: {
      present: poseFrameCount > 0,
      frameCount: poseFrameCount,
      coverage: totalFrames > 0 ? poseFrameCount / totalFrames : 0,
    },
    face: {
      present: faceFrameCount > 0,
      frameCount: faceFrameCount,
      coverage: totalFrames > 0 ? faceFrameCount / totalFrames : 0,
    },
  };

  const smoothing = {
    method: payload.smoothingConfig?.method ?? DEFAULT_SMOOTHING.method,
    minCutOff: payload.smoothingConfig?.minCutOff ?? DEFAULT_SMOOTHING.minCutOff,
    beta: payload.smoothingConfig?.beta ?? DEFAULT_SMOOTHING.beta,
    dCutOff: payload.smoothingConfig?.dCutOff ?? DEFAULT_SMOOTHING.dCutOff,
  };

  return {
    modalities,
    smoothing,
    ...(handednessLabels.size > 0
      ? {
          handedness: {
            labels: Array.from(handednessLabels),
            frameCount: handednessFrameCount,
          },
        }
      : {}),
  };
}

export function parseTrainingJob(raw: unknown): TrainingJobInfo | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const jobId = (raw as { jobId?: unknown; id?: unknown }).jobId ?? (raw as { id?: unknown }).id;
  if (typeof jobId !== 'string' || jobId.trim().length === 0) return undefined;

  const statusRaw = (raw as { status?: unknown }).status;
  const status = normalizeTrainingJobStatus(typeof statusRaw === 'string' ? statusRaw : '');
  const pollUrlRaw = (raw as { pollUrl?: unknown }).pollUrl;
  const queueDepthRaw = (raw as { queueDepth?: unknown }).queueDepth;
  const retryAfterRaw = (raw as { retryAfterMs?: unknown }).retryAfterMs;
  const progressRaw = (raw as { progress?: unknown }).progress;
  const messageRaw = (raw as { message?: unknown }).message;
  const errorRaw = (raw as { error?: unknown }).error;
  const startedAtRaw = (raw as { startedAt?: unknown }).startedAt;
  const endedAtRaw = (raw as { endedAt?: unknown }).endedAt;
  const metricsRaw = (raw as { metrics?: unknown }).metrics;
  const reportRaw = (raw as { report?: unknown }).report;

  const parsedMetrics = metricsRaw && typeof metricsRaw === 'object' ? parseMetrics(metricsRaw) : undefined;

  return {
    jobId: jobId.trim(),
    status: status ?? 'queued',
    ...(typeof pollUrlRaw === 'string' && pollUrlRaw.trim().length > 0 ? { pollUrl: pollUrlRaw.trim() } : {}),
    ...(typeof queueDepthRaw === 'number' && Number.isFinite(queueDepthRaw) ? { queueDepth: queueDepthRaw } : {}),
    ...(typeof retryAfterRaw === 'number' && Number.isFinite(retryAfterRaw) ? { retryAfterMs: retryAfterRaw } : {}),
    ...(typeof progressRaw === 'number' && Number.isFinite(progressRaw) ? { progress: progressRaw } : {}),
    ...(typeof messageRaw === 'string' && messageRaw.trim().length > 0 ? { message: messageRaw.trim() } : {}),
    ...(typeof errorRaw === 'string' && errorRaw.trim().length > 0 ? { error: errorRaw.trim() } : {}),
    ...(typeof startedAtRaw === 'number' && Number.isFinite(startedAtRaw) ? { startedAt: startedAtRaw } : {}),
    ...(typeof endedAtRaw === 'number' && Number.isFinite(endedAtRaw) ? { endedAt: endedAtRaw } : {}),
    ...(parsedMetrics !== undefined ? { metrics: parsedMetrics } : {}),
    ...(reportRaw && typeof reportRaw === 'object' ? { report: reportRaw as Record<string, unknown> } : {}),
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
  if (!framesHaveHandLandmarks(payload.frames)) {
    throw new Error('Keine Hand-Landmarks erkannt. Bitte nimm die Gebärde erneut mit sichtbaren Händen auf.');
  }

  const clipFilename = payload.clipFile ? `clip.${extractExtensionFromFile(payload.clipFile, 'mp4')}` : null;
  const stillFilename = payload.stillFile ? `still.${extractExtensionFromFile(payload.stillFile, 'jpg')}` : null;
  const frames = buildFrameTimeline(payload.frames);
  const landmarksMetadata = buildLandmarksMetadata(frames, payload);
  const metadata = buildMetadata(payload, clipFilename, stillFilename, landmarksMetadata, frames);

  const metadataContent = JSON.stringify(metadata, null, 2);
  const landmarksContent = JSON.stringify({ frames, metadata: landmarksMetadata }, null, 2);
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

export type TrainingUploadOptions = { endpoint: string; token?: string };

export async function uploadTrainingZip(zip: Uint8Array, options: TrainingUploadOptions): Promise<UploadTrainingBundleResponse> {
  const endpoint = options.endpoint?.trim();
  if (!endpoint) {
    throw new Error('API-Endpunkt fehlt für Trainings-Uploads.');
  }

  const zipView = new Uint8Array(zip);
  const body = new Blob([zipView], { type: 'application/zip' });

  let response: Response;
  try {
    response = await fetchWithRetry(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/zip',
          Accept: 'application/json',
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        },
        body,
      },
      { retries: 2, retryDelayMs: 400, timeoutMs: 20000 },
    );
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === 'AbortError'
        ? 'Upload wurde wegen einer Zeitüberschreitung abgebrochen.'
        : 'Upload konnte wegen eines Netzwerkfehlers nicht abgeschlossen werden.';
    throw new Error(message);
  }

  if (!response.ok) {
    throw new HttpError(response.status, `Upload fehlgeschlagen (HTTP ${response.status}).`);
  }

  let responseJson: unknown;
  try {
    responseJson = await response.json();
  } catch {
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
  options: TrainingUploadOptions,
): Promise<UploadTrainingBundleResponse> {
  const zip = await createTrainingZip(payload);
  return uploadTrainingZip(zip, options);
}
