export const BUNDLE_KEY_PREFIX = 'trainingBundles:';

export type PersistedBundleStatus = 'pending' | 'uploading' | 'failed';

export interface PersistedTrainingBundle {
  key: string;
  profileId: string;
  label: string;
  capturedAt: string;
  source: string;
  queuedAt: string;
  framesCount: number;
  clipBytes?: number;
  stillBytes?: number;
  zipBase64: string;
  status: PersistedBundleStatus;
  lastError?: string;
  attempts: number;
}

function toBase64(data: Uint8Array): string {
  const buffer = (globalThis as { Buffer?: { from: (value: Uint8Array, encoding?: string) => { toString: (enc: string) => string } } })
    .Buffer;
  if (buffer) {
    return buffer.from(data).toString('base64');
  }
  const CHUNK_SIZE = 8192;
  let binary = '';
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.subarray(i, i + CHUNK_SIZE);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

function fromBase64(encoded: string): Uint8Array {
  const buffer = (globalThis as { Buffer?: { from: (value: string, encoding: string) => Uint8Array } }).Buffer;
  if (buffer) {
    return new Uint8Array(buffer.from(encoded, 'base64'));
  }
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch (error) {
    console.warn('LocalStorage nicht verfügbar', error);
    return null;
  }
}

function buildBundleKey(profileId: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${BUNDLE_KEY_PREFIX}${profileId}:${timestamp}:${random}`;
}

function parseBundle(key: string, raw: string | null): PersistedTrainingBundle | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedTrainingBundle> & { zipBase64?: string };
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.profileId !== 'string' || typeof parsed.label !== 'string') return null;
    if (typeof parsed.zipBase64 !== 'string') return null;
    return {
      key,
      profileId: parsed.profileId,
      label: parsed.label,
      capturedAt: typeof parsed.capturedAt === 'string' ? parsed.capturedAt : new Date().toISOString(),
      source: typeof parsed.source === 'string' ? parsed.source : 'web://mediapipe',
      queuedAt: typeof parsed.queuedAt === 'string' ? parsed.queuedAt : new Date().toISOString(),
      framesCount: typeof parsed.framesCount === 'number' ? parsed.framesCount : 0,
      clipBytes: typeof parsed.clipBytes === 'number' ? parsed.clipBytes : undefined,
      stillBytes: typeof parsed.stillBytes === 'number' ? parsed.stillBytes : undefined,
      zipBase64: parsed.zipBase64,
      status: parsed.status === 'failed' || parsed.status === 'uploading' ? parsed.status : 'pending',
      lastError: typeof parsed.lastError === 'string' ? parsed.lastError : undefined,
      attempts: typeof parsed.attempts === 'number' ? parsed.attempts : 0,
    };
  } catch (error) {
    console.warn('Fehler beim Lesen eines gespeicherten Bundles', error);
    return null;
  }
}

function writeBundle(bundle: PersistedTrainingBundle): void {
  const store = storage();
  if (!store) return;
  store.setItem(bundle.key, JSON.stringify(bundle));
}

export function decodeBundleData(bundle: Pick<PersistedTrainingBundle, 'zipBase64'>): Uint8Array {
  return fromBase64(bundle.zipBase64);
}

export async function enqueuePersistedBundle(params: {
  profileId: string;
  label: string;
  capturedAt: string;
  source: string;
  framesCount: number;
  clipBytes?: number;
  stillBytes?: number;
  zip: Uint8Array;
}): Promise<PersistedTrainingBundle | null> {
  const store = storage();
  if (!store) return null;

  const key = buildBundleKey(params.profileId);
  const payload: PersistedTrainingBundle = {
    key,
    profileId: params.profileId,
    label: params.label,
    capturedAt: params.capturedAt,
    source: params.source,
    queuedAt: new Date().toISOString(),
    framesCount: params.framesCount,
    clipBytes: params.clipBytes,
    stillBytes: params.stillBytes,
    zipBase64: toBase64(params.zip),
    status: 'pending',
    attempts: 0,
  };

  writeBundle(payload);
  return payload;
}

export async function listQueuedBundles(profileId?: string): Promise<PersistedTrainingBundle[]> {
  const store = storage();
  if (!store) return [];

  const keys = Object.keys(store).filter((key) => key.startsWith(BUNDLE_KEY_PREFIX));
  const filteredKeys = profileId ? keys.filter((key) => key.startsWith(`${BUNDLE_KEY_PREFIX}${profileId}:`)) : keys;
  const bundles: PersistedTrainingBundle[] = [];

  filteredKeys.forEach((key) => {
    const parsed = parseBundle(key, store.getItem(key));
    if (parsed) {
      bundles.push(parsed);
    } else {
      store.removeItem(key);
    }
  });

  return bundles.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function removeQueuedBundle(key: string): Promise<void> {
  const store = storage();
  if (!store) return;
  store.removeItem(key);
}

export async function markBundleFailed(key: string, error: string): Promise<void> {
  const store = storage();
  if (!store) return;
  const parsed = parseBundle(key, store.getItem(key));
  if (!parsed) return;
  parsed.status = 'failed';
  parsed.lastError = error;
  parsed.attempts += 1;
  writeBundle(parsed);
}

export async function markBundleUploading(key: string): Promise<void> {
  const store = storage();
  if (!store) return;
  const parsed = parseBundle(key, store.getItem(key));
  if (!parsed) return;
  parsed.status = 'uploading';
  parsed.attempts += 1;
  parsed.lastError = undefined;
  writeBundle(parsed);
}
