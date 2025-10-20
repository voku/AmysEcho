import * as FileSystem from 'expo-file-system/legacy';
import { logger } from '../utils/logger';
import { arrayBufferToBase64 } from '../utils/base64';
import {
  BUNDLED_MLP_MODEL_BASE64,
  BUNDLED_MLP_MODEL_BYTES,
  BUNDLED_MLP_MODEL_SHA256,
  BUNDLED_MLP_MODEL_VERSION,
} from '../constants/bundledMlpModel';

const getApiUrl = () => process.env['EXPO_PUBLIC_API_URL'] || 'http://localhost:5000';
const getApiToken = () => process.env['EXPO_PUBLIC_API_TOKEN'] || 'demo-token';

const MLP_KEY = 'dgsMlpModel';
const MLP_META_KEY = 'dgsMlpModelMeta';
const MLP_BACKUP_KEY = 'dgsMlpModelBackup';
const MLP_BACKUP_META_KEY = 'dgsMlpModelBackupMeta';
const LOCAL_MODEL_FILE_BASE = 'amy_model';

type MlpModelListener = () => void;
const mlpModelListeners = new Set<MlpModelListener>();

export function onMlpModelUpdated(listener: MlpModelListener): () => void {
  mlpModelListeners.add(listener);
  return () => mlpModelListeners.delete(listener);
}

function emitMlpModelUpdated() {
  mlpModelListeners.forEach((l) => {
    try {
      l();
    } catch {
      // ignore listener errors
    }
  });
}

type StorageLike = {
  setItem(key: string, value: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
};

let memoryStore: Map<string, string> | null = null;
let testStorageOverride: StorageLike | null = null;
let bundledModelPromise: Promise<string | null> | null = null;

/**
 * Test-only hook for overriding the storage implementation.
 */
export function __setDgsModelClientStorageForTests(storage: StorageLike | null): void {
  testStorageOverride = storage;
  if (storage === null) {
    memoryStore = null;
  }
}

async function getStorage(): Promise<StorageLike> {
  if (testStorageOverride) {
    return testStorageOverride;
  }
  try {
    if (typeof (globalThis as any).window === 'undefined') {
      throw new Error('no window');
    }
    const mod = await import('@react-native-async-storage/async-storage');
    return mod.default as StorageLike;
  } catch {
    if (!memoryStore) memoryStore = new Map<string, string>();
    return {
      async setItem(key: string, value: string) {
        memoryStore!.set(key, value);
      },
      async getItem(key: string) {
        return memoryStore!.get(key) ?? null;
      },
    };
  }
}

function loadBundledFallbackModel(): Promise<string | null> {
  if (bundledModelPromise) {
    return bundledModelPromise;
  }

  const promise = (async () => {
    try {
      const data = BUNDLED_MLP_MODEL_BASE64.trim();
      if (!data) {
        logger.warn('Bundled fallback MLP payload missing');
        throw new Error('Bundled fallback MLP payload missing');
      }

      const expectedLength = Math.ceil(BUNDLED_MLP_MODEL_BYTES / 3) * 4;
      if (expectedLength > 0 && Math.abs(data.length - expectedLength) > 64) {
        logger.warn('Bundled fallback MLP payload length mismatch', {
          expectedLength,
          actualLength: data.length,
        });
      }

      logger.info('Loaded bundled fallback MLP payload metadata', {
        bytes: BUNDLED_MLP_MODEL_BYTES,
        sha256: BUNDLED_MLP_MODEL_SHA256,
        version: BUNDLED_MLP_MODEL_VERSION,
      });

      return data;
    } catch (error) {
      logger.error('Failed to load bundled fallback MLP model', {
        error: error instanceof Error ? error.message : String(error),
      });
      if (bundledModelPromise === promise) {
        bundledModelPromise = null;
      }
      return null;
    }
  })();

  bundledModelPromise = promise;
  return promise;
}

type MlpMeta = {
  etag?: string;
  checksum?: string;
  version?: string;
  source?: 'global' | 'profile';
  profileId?: string | null;
};

function parseMetaFromResponse(
  resp: Response,
  {
    profileId,
    fallbackMeta,
  }: {
    profileId?: string;
    fallbackMeta?: MlpMeta | null;
  },
): MlpMeta {
  const meta: MlpMeta = { ...(fallbackMeta ?? {}) };

  const etag = resp.headers.get('ETag');
  if (etag) {
    meta.etag = etag;
  }

  const checksum = resp.headers.get('X-Checksum-SHA256');
  if (checksum) {
    meta.checksum = checksum;
  }

  const version = resp.headers.get('X-Model-Version');
  if (version) {
    meta.version = version;
  }

  const sourceHeader = resp.headers.get('X-Model-Source');
  if (typeof sourceHeader === 'string') {
    const normalized = sourceHeader.trim().toLowerCase();
    if (normalized === 'profile' || normalized === 'global') {
      meta.source = normalized;
    }
  } else if (!meta.source && profileId) {
    meta.source = 'profile';
  }

  const profileHeader = resp.headers.get('X-Model-Profile');
  if (typeof profileHeader === 'string' && profileHeader.trim().length > 0) {
    meta.profileId = profileHeader.trim();
  } else if (meta.source === 'profile' && profileId && !meta.profileId) {
    meta.profileId = profileId;
  }

  return meta;
}

export async function fetchMlpModel(profileId?: string): Promise<string | null> {
  const storage = await getStorage();
  const cacheKey = `${MLP_KEY}:${profileId || 'global'}`;
  const metaKey = `${MLP_META_KEY}:${profileId || 'global'}`;
  const backupKey = `${MLP_BACKUP_KEY}:${profileId || 'global'}`;
  const metaBackupKey = `${MLP_BACKUP_META_KEY}:${profileId || 'global'}`;
  const prevModel = await storage.getItem(cacheKey);
  const prevMetaRaw = await storage.getItem(metaKey);
  let prevMeta: MlpMeta | null = null;
  try {
    prevMeta = prevMetaRaw ? JSON.parse(prevMetaRaw) : null;
  } catch {
    prevMeta = null;
  }

  const url = new URL('/latest-mlp-model', getApiUrl());
  if (profileId) url.searchParams.set('profileId', profileId);
  const headers: Record<string, string> = { Authorization: `Bearer ${getApiToken()}` };
  if (profileId) headers['X-Profile-Id'] = profileId;
  if (prevMeta?.etag) headers['If-None-Match'] = prevMeta.etag;

  let resp: Response;
  try {
    resp = await fetch(url.toString(), { headers });
  } catch (error) {
    logger.error('Failed to reach MLP model API, using local fallback', {
      profileId: profileId ?? 'global',
      error: error instanceof Error ? error.message : String(error),
    });
    const local = await loadLocalMlpModel(profileId);
    if (local) {
      logger.info('Loaded persisted fallback MLP model');
    }
    return local;
  }

  if (resp.status === 304) {
    const meta = parseMetaFromResponse(resp, {
      ...(profileId ? { profileId } : {}),
      fallbackMeta: prevMeta,
    });
    const metaString = JSON.stringify(meta);
    if (prevMetaRaw !== metaString) {
      await storage.setItem(metaKey, metaString);
      emitMlpModelUpdated();
    }
    const cached = await storage.getItem(cacheKey);
    if (cached) {
      logger.info('Using cached MLP model', {
        profileId: profileId ?? 'global',
        version: meta.version ?? null,
        source: meta.source ?? (profileId ? 'profile' : 'global'),
      });
      return cached;
    }
    logger.warn('Received 304 for MLP model but cache was empty, refetching', {
      profileId: profileId ?? 'global',
    });
    await storage.setItem(metaKey, JSON.stringify({}));
    return fetchMlpModel(profileId);
  }

  if (!resp.ok) {
    if (profileId) {
      logger.warn('Personalized MLP unavailable, falling back to global model', {
        profileId,
        status: resp.status,
      });
      return fetchMlpModel();
    }
    logger.warn('Global MLP fetch failed, attempting local fallback', {
      status: resp.status,
    });
    const local = await loadLocalMlpModel();
    if (local) {
      logger.info('Loaded persisted fallback MLP model');
    }
    return local;
  }

  const arrayBuffer = await resp.arrayBuffer();
  const b64 = arrayBufferToBase64(arrayBuffer);
  const meta = parseMetaFromResponse(
    resp,
    {
      ...(profileId ? { profileId } : {}),
    },
  );

  if (prevModel) {
    await storage.setItem(backupKey, prevModel);
  }
  if (prevMetaRaw) {
    await storage.setItem(metaBackupKey, prevMetaRaw);
  }

  await storage.setItem(cacheKey, b64);
  const metaString = JSON.stringify(meta);
  await storage.setItem(metaKey, metaString);
  await persistDocumentDirectoryModel(b64, profileId);
  emitMlpModelUpdated();

  logger.info('Fetched MLP model', {
    profileId: profileId ?? 'global',
    version: meta.version ?? null,
    source: meta.source ?? (profileId ? 'profile' : 'global'),
    status: resp.status,
  });

  return b64;
}

export async function getCachedMlpModel(profileId?: string): Promise<string | null> {
  const storage = await getStorage();
  return storage.getItem(`${MLP_KEY}:${profileId || 'global'}`);
}

export async function getCachedMlpMeta(profileId?: string): Promise<MlpMeta | null> {
  const storage = await getStorage();
  const raw = await storage.getItem(`${MLP_META_KEY}:${profileId || 'global'}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MlpMeta;
  } catch {
    return null;
  }
}

export async function restoreMlpModelBackup(profileId?: string): Promise<boolean> {
  const storage = await getStorage();
  const cacheKey = `${MLP_KEY}:${profileId || 'global'}`;
  const metaKey = `${MLP_META_KEY}:${profileId || 'global'}`;
  const backupKey = `${MLP_BACKUP_KEY}:${profileId || 'global'}`;
  const metaBackupKey = `${MLP_BACKUP_META_KEY}:${profileId || 'global'}`;

  const backup = await storage.getItem(backupKey);
  if (!backup) {
    return false;
  }

  await storage.setItem(cacheKey, backup);
  const metaBackup = await storage.getItem(metaBackupKey);
  if (metaBackup) {
    await storage.setItem(metaKey, metaBackup);
  } else {
    await storage.setItem(metaKey, JSON.stringify({}));
  }

  emitMlpModelUpdated();
  return true;
}

export async function clearMlpModelBackup(profileId?: string): Promise<void> {
  const storage = await getStorage();
  const backupKey = `${MLP_BACKUP_KEY}:${profileId || 'global'}`;
  const metaBackupKey = `${MLP_BACKUP_META_KEY}:${profileId || 'global'}`;

  await storage.setItem(backupKey, '');
  await storage.setItem(metaBackupKey, '');
}

/**
 * Load MLP model from local files as fallback when API is unavailable
 */
export async function loadLocalMlpModel(profileId?: string | null): Promise<string | null> {
  try {
    const documentModel = await loadDocumentDirectoryModel(profileId);
    if (documentModel) {
      logger.info('Loaded local MLP model from document directory', {
        profileId: profileId ?? 'global',
      });
      return documentModel;
    }

    if (profileId) {
      const globalModel = await loadDocumentDirectoryModel();
      if (globalModel) {
        logger.info('Loaded global fallback MLP model from document directory', {
          profileId,
        });
        return globalModel;
      }
    }

    const bundled = await loadBundledFallbackModel();
    if (bundled) {
      logger.info('Loaded bundled fallback MLP model', {
        profileId: profileId ?? 'global',
      });
      await persistDocumentDirectoryModel(bundled, null);
      return bundled;
    }

    logger.warn('No persisted MLP model available locally', {
      profileId: profileId ?? 'global',
    });
    return null;
  } catch (error) {
    logger.error('Failed to load local MLP model', {
      profileId: profileId ?? 'global',
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function sanitizeProfileIdForFile(profileId: string): string {
  return profileId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getLocalModelFile(profileId?: string | null): string {
  if (!profileId) {
    return `${LOCAL_MODEL_FILE_BASE}.npz`;
  }
  return `${LOCAL_MODEL_FILE_BASE}_${sanitizeProfileIdForFile(profileId)}.npz`;
}

async function loadDocumentDirectoryModel(profileId?: string | null): Promise<string | null> {
  const { documentDirectory } = FileSystem;
  if (!documentDirectory) {
    return null;
  }

  const candidates = profileId
    ? [getLocalModelFile(profileId), getLocalModelFile(null)]
    : [getLocalModelFile(null)];

  for (const fileName of candidates) {
    const modelUri = `${documentDirectory}/${fileName}`;
    try {
      const info = await FileSystem.getInfoAsync(modelUri);
      if (!info.exists || info.isDirectory) {
        continue;
      }
      if (typeof info.size === 'number' && info.size === 0) {
        continue;
      }
      const data = await FileSystem.readAsStringAsync(modelUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (data && data.length > 0) {
        return data;
      }
    } catch (error) {
      logger.warn('Unable to read MLP model from document directory', {
        profileId: profileId ?? 'global',
        fileName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return null;
}

async function persistDocumentDirectoryModel(
  data: string,
  profileId?: string | null,
): Promise<void> {
  const { documentDirectory } = FileSystem;
  if (!documentDirectory) {
    return;
  }

  const fileName = getLocalModelFile(profileId ?? null);
  const target = `${documentDirectory}/${fileName}`;
  try {
    await FileSystem.writeAsStringAsync(target, data, {
      encoding: FileSystem.EncodingType.Base64,
    });
    logger.debug('Persisted MLP model to document directory', {
      profileId: profileId ?? 'global',
      fileName,
    });
  } catch (error) {
    logger.warn('Unable to persist MLP model to document directory', {
      profileId: profileId ?? 'global',
      fileName,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
