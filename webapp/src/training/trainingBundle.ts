import { zipSync } from 'fflate';
import { extractNonManualFeatures } from '../gesture/utils/nonManualFeatures';
import {
  flattenHandsWithHandedness,
  frameHasAnyLandmarks,
  framesHaveHandLandmarks,
  handFocusSupportsMirrorAugmentation,
} from './handUtils';
import { type ValidationCapabilities, validateLandmarkSequence } from './trainingValidator';
import { fetchWithRetry, HttpError } from '../utils/http';
import {
  buildDualHandFeatureVector,
  CONTRACT_COORDS_PER_POINT,
  CONTRACT_HAND_LANDMARK_COUNT,
} from './landmarkFeatureContract';
import type {
  TrainingBundlePayload,
  TrainingFrame,
  TrainingJobInfo,
  TrainingJobMetrics,
  TrainingJobStatus,
  TrainingQualityLogEntry,
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
  nonManualFeatures?: ReturnType<typeof extractNonManualFeatures>;
  timestampMs?: number;
};

type LandmarksMetadata = {
  modalities: {
    hands: { present: boolean; frameCount: number; coverage: number };
    pose: { present: boolean; frameCount: number; coverage: number };
    face: { present: boolean; frameCount: number; coverage: number };
    nonManual: { present: boolean; frameCount: number; coverage: number };
  };
  smoothing: {
    method: string;
    minCutOff: number;
    beta: number;
    dCutOff: number;
  };
  handedness?: { labels: string[]; frameCount: number };
};

export type ValidationSummary = {
  frameCount: number;
  issues: string[];
  suggestions: string[];
  qualityScore: number;
  confidence: number;
};

export function buildFrameTimeline(frames: TrainingFrame[]): TimelineFrame[] {
  return frames.map((frame) => {
    const handedness = Array.isArray(frame.handedness)
      ? frame.handedness.filter((entry) => typeof entry === 'string')
      : [];
    const nonManualFeatures = extractNonManualFeatures(frame.poseLandmarks, frame.faceLandmarks);
    const rawLandmarks = Array.isArray(frame.landmarks) ? frame.landmarks : [];
    return {
      handedness: handedness.map((entry) => String(entry)),
      landmarks: flattenHandsWithHandedness(rawLandmarks, handedness),
      handLandmarks: rawLandmarks.map((hand) =>
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
      ...(nonManualFeatures ? { nonManualFeatures } : {}),
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
  validationSummary: ValidationSummary | null,
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
    ...(typeof payload.recording?.previewMirrored === 'boolean'
      ? { previewMirrored: payload.recording.previewMirrored }
      : {}),
  };

  const firstFrameFeaturePreview = frames.length > 0
    ? buildDualHandFeatureVector(frames[0]?.handLandmarks ?? []).slice(0, 12)
    : [];

  return {
    profileId: payload.profileId,
    label: payload.label,
    ...(payload.symbolId ? { symbolId: payload.symbolId } : {}),
    capturedAt: payload.capturedAt ?? new Date().toISOString(),
    source: payload.source ?? 'web://mediapipe',
    ...(clipFilename ? { clipFilename } : {}),
    ...(stillFilename ? { stillFilename } : {}),
    modalities: landmarksMetadata.modalities,
    smoothing: landmarksMetadata.smoothing,
    featureContract: {
      version: 'wrist_relative_max_abs_v1',
      pointsPerHand: CONTRACT_HAND_LANDMARK_COUNT,
      coordinatesPerPoint: CONTRACT_COORDS_PER_POINT,
      vectorLength: CONTRACT_HAND_LANDMARK_COUNT * CONTRACT_COORDS_PER_POINT * 2,
      featurePreview: firstFrameFeaturePreview,
    },
    ...(validationSummary ? { validationSummary } : {}),
    ...(landmarksMetadata.handedness ? { handedness: landmarksMetadata.handedness } : {}),
    ...(payload.handFocus ? { handFocus: payload.handFocus } : {}),
    ...(payload.handFocus
      ? {
          augmentation: {
            mirrorSafe: handFocusSupportsMirrorAugmentation(payload.handFocus),
          },
        }
      : {}),
    ...(payload.variationData ? { variationData: payload.variationData } : {}),
    ...(Object.keys(recording).length > 0 ? { recording } : {}),
  };
}

export function buildValidationSummary(
  frames: TrainingFrame[],
  capabilities: ValidationCapabilities,
): ValidationSummary | null {
  if (!Array.isArray(frames) || frames.length === 0) {
    return null;
  }

  const sequence = frames.map((frame) => {
    const hands = Array.isArray(frame.landmarks) ? frame.landmarks.slice(0, 2) : [];
    return [
      hands[0] ?? [],
      hands[1] ?? [],
      Array.isArray(frame.poseLandmarks) ? frame.poseLandmarks : [],
      Array.isArray(frame.faceLandmarks) ? frame.faceLandmarks : [],
    ];
  });
  const result = validateLandmarkSequence(sequence, capabilities);
  return {
    frameCount: frames.length,
    issues: result.issues,
    suggestions: result.suggestions,
    qualityScore: result.qualityScore,
    confidence: result.confidence,
  };
}

function parseValidationSummary(raw: unknown): UploadTrainingBundleResponse['validationSummary'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const frameCount = (raw as Record<string, unknown>)['frameCount'];
  if (typeof frameCount !== 'number' || !Number.isFinite(frameCount)) {
    return undefined;
  }

  const issuesRaw = (raw as Record<string, unknown>)['issues'];
  const suggestionsRaw = (raw as Record<string, unknown>)['suggestions'];
  const issues = Array.isArray(issuesRaw)
    ? issuesRaw.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const suggestions = Array.isArray(suggestionsRaw)
    ? suggestionsRaw.filter((entry): entry is string => typeof entry === 'string')
    : [];

  const landmarksPath = (raw as Record<string, unknown>)['landmarksPath'];
  const qualityScore = (raw as Record<string, unknown>)['qualityScore'];
  const confidence = (raw as Record<string, unknown>)['confidence'];

  return {
    frameCount,
    ...(typeof landmarksPath === 'string' && landmarksPath.trim().length > 0
      ? { landmarksPath: landmarksPath.trim() }
      : {}),
    ...(issues.length > 0 ? { issues } : {}),
    ...(suggestions.length > 0 ? { suggestions } : {}),
    ...(typeof qualityScore === 'number' && Number.isFinite(qualityScore)
      ? { qualityScore }
      : {}),
    ...(typeof confidence === 'number' && Number.isFinite(confidence)
      ? { confidence }
      : {}),
  };
}

function parseQualityGate(raw: unknown): UploadTrainingBundleResponse['qualityGate'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const outcome = (raw as Record<string, unknown>)['outcome'];
  if (outcome !== 'pass' && outcome !== 'review' && outcome !== 'unknown') {
    return undefined;
  }

  const reasonsRaw = (raw as Record<string, unknown>)['reasons'];
  const reasons = Array.isArray(reasonsRaw)
    ? reasonsRaw.filter((entry): entry is string => typeof entry === 'string')
    : [];
  return { outcome, reasons };
}



function parseTrainingQualityLogEntry(raw: unknown): TrainingQualityLogEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Record<string, unknown>;
  const bundleId = entry['bundleId'];
  const label = entry['label'];
  const profileId = entry['profileId'];
  const reasonsRaw = entry['reasons'];
  const metricsRaw = entry['metrics'];
  const recordedAt = entry['recordedAt'];

  if (typeof bundleId !== 'string' || bundleId.trim().length === 0) return null;
  if (typeof label !== 'string' || label.trim().length === 0) return null;
  if (!(profileId === null || typeof profileId === 'string')) return null;
  if (typeof recordedAt !== 'string' || recordedAt.trim().length === 0) return null;
  if (!Array.isArray(reasonsRaw)) return null;
  if (!metricsRaw || typeof metricsRaw !== 'object') return null;

  const reasons = reasonsRaw.filter((reason): reason is string => typeof reason === 'string');
  const metrics = metricsRaw as Record<string, unknown>;
  if (
    typeof metrics['frameCount'] !== 'number' || !Number.isFinite(metrics['frameCount']) ||
    typeof metrics['handCoverage'] !== 'number' || !Number.isFinite(metrics['handCoverage']) ||
    typeof metrics['poseCoverage'] !== 'number' || !Number.isFinite(metrics['poseCoverage']) ||
    typeof metrics['faceCoverage'] !== 'number' || !Number.isFinite(metrics['faceCoverage'])
  ) {
    return null;
  }

  return {
    bundleId,
    label,
    profileId: profileId ?? null,
    reasons,
    metrics: {
      frameCount: metrics['frameCount'],
      handCoverage: metrics['handCoverage'],
      poseCoverage: metrics['poseCoverage'],
      faceCoverage: metrics['faceCoverage'],
      ...(typeof metrics['handJitter'] === 'number' ? { handJitter: metrics['handJitter'] } : {}),
      ...(typeof metrics['poseJitter'] === 'number' ? { poseJitter: metrics['poseJitter'] } : {}),
      ...(typeof metrics['faceJitter'] === 'number' ? { faceJitter: metrics['faceJitter'] } : {}),
      ...(typeof metrics['handJitterRaw'] === 'number' ? { handJitterRaw: metrics['handJitterRaw'] } : {}),
      ...(typeof metrics['poseJitterRaw'] === 'number' ? { poseJitterRaw: metrics['poseJitterRaw'] } : {}),
      ...(typeof metrics['faceJitterRaw'] === 'number' ? { faceJitterRaw: metrics['faceJitterRaw'] } : {}),
      ...(typeof metrics['overallQualityScore'] === 'number' ? { overallQualityScore: metrics['overallQualityScore'] } : {}),
    },
    recordedAt,
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
  let nonManualFrameCount = 0;
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
    if (frame.nonManualFeatures && Object.values(frame.nonManualFeatures).some((value) => value !== null && value !== undefined)) {
      nonManualFrameCount++;
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
    nonManual: {
      present: nonManualFrameCount > 0,
      frameCount: nonManualFrameCount,
      coverage: totalFrames > 0 ? nonManualFrameCount / totalFrames : 0,
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
  const usableFrames = payload.frames.filter((frame) => frameHasAnyLandmarks(frame));
  const frames = buildFrameTimeline(usableFrames);
  const landmarksMetadata = buildLandmarksMetadata(frames, payload);
  // Derive pose/face availability from the actual recorded frames rather than
  // hardcoding true. Recordings captured without one modality would otherwise
  // receive false quality issues and misleading coverage scores.
  const poseEnabled = usableFrames.some((f) => Array.isArray(f.poseLandmarks) && f.poseLandmarks.length > 0);
  const faceEnabled = usableFrames.some((f) => Array.isArray(f.faceLandmarks) && f.faceLandmarks.length > 0);
  const validationSummary = buildValidationSummary(usableFrames, {
    poseEnabled,
    faceEnabled,
  });
  const metadata = buildMetadata(
    payload,
    clipFilename,
    stillFilename,
    landmarksMetadata,
    validationSummary,
    frames,
  );

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

const MIN_TRAINING_UPLOAD_TIMEOUT_MS = 30000;
const TRAINING_UPLOAD_TIMEOUT_PER_MB_MS = 15000;
const MAX_TRAINING_UPLOAD_TIMEOUT_MS = 300000;
const RATE_LIMIT_RETRY_DEFAULT_DELAY_MS = 1500;
const RATE_LIMIT_RETRY_MIN_DELAY_MS = 500;
const MAX_RATE_LIMIT_RETRIES = 2;
const RATE_LIMIT_RETRY_MAX_DELAY_MS = 15000;


export function resolveTrainingUploadTimeoutMs(zipSizeBytes: number): number {
  if (!Number.isFinite(zipSizeBytes) || zipSizeBytes <= 0) {
    return MIN_TRAINING_UPLOAD_TIMEOUT_MS;
  }

  const bundleSizeInMb = Math.max(1, Math.ceil(zipSizeBytes / (1024 * 1024)));
  const calculatedTimeoutMs = MIN_TRAINING_UPLOAD_TIMEOUT_MS + (bundleSizeInMb * TRAINING_UPLOAD_TIMEOUT_PER_MB_MS);
  return Math.min(MAX_TRAINING_UPLOAD_TIMEOUT_MS, calculatedTimeoutMs);
}

function parseRetryAfterDelayMs(headerValue: string | null): number | null {
  if (!headerValue) {
    return null;
  }

  const asSeconds = Number(headerValue);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.round(asSeconds * 1000);
  }

  const retryTimestamp = Date.parse(headerValue);
  if (!Number.isNaN(retryTimestamp)) {
    return Math.max(0, retryTimestamp - Date.now());
  }

  return null;
}

async function fetchWithRateLimitRetry(
  url: string,
  requestInit: RequestInit,
  retryOptions: { retries: number; retryDelayMs: number; timeoutMs: number },
  maxRateLimitRetries: number,
): Promise<Response> {
  let response = await fetchWithRetry(url, requestInit, retryOptions);

  for (let attempt = 0; attempt < maxRateLimitRetries && response.status === 429; attempt += 1) {
    const retryAfterDelayMs = parseRetryAfterDelayMs(response.headers.get('Retry-After'));
    const nextDelayMs = Math.min(
      Math.max(retryAfterDelayMs ?? RATE_LIMIT_RETRY_DEFAULT_DELAY_MS, RATE_LIMIT_RETRY_MIN_DELAY_MS),
      RATE_LIMIT_RETRY_MAX_DELAY_MS,
    );
    await new Promise((resolve) => setTimeout(resolve, nextDelayMs));
    response = await fetchWithRetry(url, requestInit, retryOptions);
  }

  return response;
}


export async function uploadTrainingZip(zip: Uint8Array, options: TrainingUploadOptions): Promise<UploadTrainingBundleResponse> {
  const endpoint = options.endpoint?.trim();
  if (!endpoint) {
    throw new Error('API-Endpunkt fehlt für Trainings-Uploads.');
  }

  const zipView = new Uint8Array(zip);
  const body = new Blob([zipView], { type: 'application/zip' });
  const timeoutMs = resolveTrainingUploadTimeoutMs(zipView.byteLength);

  let response: Response;
  try {
    response = await fetchWithRateLimitRetry(
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
      { retries: 2, retryDelayMs: 400, timeoutMs },
      MAX_RATE_LIMIT_RETRIES,
    );
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === 'AbortError'
        ? 'Upload wurde wegen einer Zeitüberschreitung abgebrochen.'
        : 'Upload konnte wegen eines Netzwerkfehlers nicht abgeschlossen werden.';
    throw new Error(message);
  }

  if (!response.ok) {
    let serverError: string | undefined;
    try {
      const body = await response.json() as { error?: string };
      if (typeof body?.error === 'string' && body.error.trim().length > 0) {
        serverError = body.error.trim();
      }
    } catch {
      // Response body could not be parsed – fall through to generic message
    }
    if (response.status === 404) {
      throw new HttpError(404, serverError ?? 'Upload-Endpunkt nicht gefunden (HTTP 404). Bitte Webapp und Server gemeinsam aktualisieren.');
    }
    if (response.status === 429) {
      throw new HttpError(429, serverError ?? 'Zu viele Anfragen. Bitte warte einen Moment und versuche den Upload erneut.');
    }
    throw new HttpError(response.status, serverError ?? `Upload fehlgeschlagen (HTTP ${response.status}).`);
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
  const validationSummary = parseValidationSummary((responseJson as { validationSummary?: unknown }).validationSummary);
  const qualityGate = parseQualityGate((responseJson as { qualityGate?: unknown }).qualityGate);
  const statusNormalized = normalizeTrainingJobStatus((responseJson as { status?: string }).status ?? '') ?? 'queued';

  return {
    id: responseJson.id,
    status: statusNormalized,
    ...(trainingJob ? { trainingJob } : {}),
    ...(validationSummary ? { validationSummary } : {}),
    ...(qualityGate ? { qualityGate } : {}),
  };
}

export async function uploadTrainingBundle(
  payload: TrainingBundlePayload,
  options: TrainingUploadOptions,
): Promise<UploadTrainingBundleResponse> {
  const zip = await createTrainingZip(payload);
  return uploadTrainingZip(zip, options);
}


export type FetchTrainingQualityOptions = {
  endpoint: string;
  token?: string;
  profileId?: string;
  limit?: number;
};


export async function fetchTrainingQualityLog(options: FetchTrainingQualityOptions): Promise<TrainingQualityLogEntry[]> {
  const endpoint = options.endpoint?.trim();
  if (!endpoint) {
    throw new Error('API-Endpunkt fehlt für Qualitätsprotokoll.');
  }

  const buildRequestUrl = (includeProfileId: boolean): string => {
    const url = new URL(endpoint);
    if (includeProfileId && options.profileId && options.profileId.trim().length > 0) {
      url.searchParams.set('profileId', options.profileId.trim());
    }
    if (typeof options.limit === 'number' && Number.isFinite(options.limit) && options.limit > 0) {
      url.searchParams.set('limit', String(Math.round(options.limit)));
    }
    return url.toString();
  };

  const requestInit: RequestInit = {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
  };
  const retryOptions = { retries: 1, retryDelayMs: 300, timeoutMs: 10000 } as const;

  let response = await fetchWithRateLimitRetry(
    buildRequestUrl(true),
    requestInit,
    retryOptions,
    MAX_RATE_LIMIT_RETRIES,
  );

  if (
    response.status === 403
    && options.profileId
    && options.profileId.trim().length > 0
  ) {
    // 401 is intentionally excluded here: an unauthenticated/expired session should
    // surface to the caller, while 403 indicates profile scoping can fall back.
    response = await fetchWithRateLimitRetry(
      buildRequestUrl(false),
      requestInit,
      retryOptions,
      MAX_RATE_LIMIT_RETRIES,
    );
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new HttpError(429, 'Zu viele Anfragen. Bitte versuche es später erneut.');
    }
    throw new HttpError(response.status, `Qualitätsprotokoll konnte nicht geladen werden (HTTP ${response.status}).`);
  }

  const payload = await response.json() as { items?: unknown };
  const items = Array.isArray(payload.items) ? payload.items : [];
  return items
    .map((item) => parseTrainingQualityLogEntry(item))
    .filter((item): item is TrainingQualityLogEntry => item !== null);
}
