import type { TrainingJobInfo, TrainingJobStatus } from './types';
import { normalizeTrainingJobStatus } from './trainingBundle';
import { HttpError } from '../utils/http';

const STATUS_ALIASES: Record<string, TrainingJobStatus> = {
  queued: 'queued',
  pending: 'queued',
  running: 'running',
  completed: 'completed',
  complete: 'completed',
  done: 'completed',
  success: 'completed',
  succeeded: 'completed',
  ok: 'completed',
  failed: 'failed',
  failure: 'failed',
  error: 'failed',
};

const TRAINING_JOB_CANDIDATE_PATHS: Array<string[]> = [
  [],
  ['trainingJob'],
  ['job'],
  ['data'],
  ['data', 'job'],
  ['result'],
  ['result', 'job'],
];

function normalizeStatus(value: unknown): TrainingJobStatus | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return STATUS_ALIASES[normalized] ?? normalizeTrainingJobStatus(normalized);
}

function getNestedCandidate(payload: unknown, path: string[]): unknown {
  let current = payload;
  for (const segment of path) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function extractTrainingJob(payload: unknown): TrainingJobInfo | undefined {
  for (const path of TRAINING_JOB_CANDIDATE_PATHS) {
    const candidate = getNestedCandidate(payload, path);
    if (!candidate || typeof candidate !== 'object') {
      continue;
    }

    const jobIdRaw = (candidate as { jobId?: unknown }).jobId ?? (candidate as { id?: unknown }).id;
    if (typeof jobIdRaw !== 'string' || jobIdRaw.trim().length === 0) {
      continue;
    }

    const statusRaw = (candidate as { status?: unknown }).status;
    const pollUrlRaw = (candidate as { pollUrl?: unknown }).pollUrl;
    const normalizedStatus =
      normalizeStatus(statusRaw) ?? normalizeStatus((payload as { status?: unknown })?.status ?? '') ?? 'queued';
    const pollUrl = typeof pollUrlRaw === 'string' && pollUrlRaw.trim().length > 0 ? pollUrlRaw.trim() : undefined;

    return {
      jobId: jobIdRaw.trim(),
      status: normalizedStatus,
      ...(pollUrl ? { pollUrl } : {}),
    } satisfies TrainingJobInfo;
  }

  return undefined;
}

function normalizeApiBase(raw: string | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/$/, '');
}

export async function triggerTrainingJob(
  apiBaseUrl: string,
  token?: string,
  signal?: AbortSignal,
): Promise<TrainingJobInfo | null> {
  const base = normalizeApiBase(apiBaseUrl);
  if (!base) {
    return null;
  }

  const endpoint = `${base}/train-model`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ trigger: 'bundles' }),
    ...(signal ? { signal } : {}),
  });

  if (!response.ok) {
    throw new HttpError(response.status, `Training-Trigger fehlgeschlagen (HTTP ${response.status}).`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error('Antwort vom Training-Trigger konnte nicht gelesen werden.');
  }

  return extractTrainingJob(payload) ?? null;
}
