import { Buffer } from 'buffer';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { logger } from '../utils/logger';

const getApiUrl = () => process.env['EXPO_PUBLIC_API_URL'] || 'http://localhost:5000';
const getApiToken = () => process.env['EXPO_PUBLIC_API_TOKEN'] || 'demo-token';

const KEY = 'dgsCentroids';
const MLP_KEY = 'dgsMlpModel';
const MLP_META_KEY = 'dgsMlpModelMeta';
const MLP_BACKUP_KEY = 'dgsMlpModelBackup';
const MLP_BACKUP_META_KEY = 'dgsMlpModelBackupMeta';

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
async function getStorage(): Promise<StorageLike> {
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

export type Point = [number, number, number];
export type CentroidMap = Record<string, Point[]>;

export async function fetchCentroids(profileId?: string): Promise<{ centroids: CentroidMap; counts: Record<string, number> } | null> {
  try {
    const url = new URL('/api/v1/dgs/model', getApiUrl());
    if (profileId) url.searchParams.set('profileId', profileId);
    const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${getApiToken()}` } });
    if (!resp.ok) return null;
    const data = await resp.json();
    const storage = await getStorage();
    await storage.setItem(`${KEY}:${profileId || 'global'}`, JSON.stringify(data));
    return data;
  } catch (error) {
    logger.error('Failed to fetch MLP model', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function getCachedCentroids(profileId?: string): Promise<{ centroids: CentroidMap; counts: Record<string, number> } | null> {
  const storage = await getStorage();
  const raw = await storage.getItem(`${KEY}:${profileId || 'global'}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

type MlpMeta = { etag?: string; checksum?: string; version?: string };

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

  const url = new URL('/api/v1/dgs/mlp-model', getApiUrl());
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
    const local = await loadLocalMlpModel();
    if (local) {
      logger.info('Loaded local fallback MLP model');
    }
    return local;
  }

  if (resp.status === 304) {
    const cached = await storage.getItem(cacheKey);
    if (cached) {
      logger.info('Using cached MLP model', {
        profileId: profileId ?? 'global',
        version: prevMeta?.version ?? null,
        source: profileId ? 'profile' : 'global',
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
      logger.info('Loaded local fallback MLP model');
    }
    return local;
  }

  const buf = Buffer.from(await resp.arrayBuffer());
  const b64 = buf.toString('base64');
  const meta: MlpMeta = {};
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

  if (prevModel) {
    await storage.setItem(backupKey, prevModel);
  }
  if (prevMetaRaw) {
    await storage.setItem(metaBackupKey, prevMetaRaw);
  }

  await storage.setItem(cacheKey, b64);
  await storage.setItem(metaKey, JSON.stringify(meta));
  emitMlpModelUpdated();

  logger.info('Fetched MLP model', {
    profileId: profileId ?? 'global',
    version: meta.version ?? null,
    source: profileId ? 'profile' : 'global',
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
    await storage.setItem(metaKey, '');
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
export async function loadLocalMlpModel(): Promise<string | null> {
  try {
    const documentModel = await loadDocumentDirectoryModel();
    if (documentModel) {
      return documentModel;
    }

    const bundledModel = await loadBundledFallbackModel();
    if (bundledModel) {
      logger.info('Loaded bundled fallback MLP model');
      return bundledModel;
    }

    logger.warn('No bundled MLP model fallback available');
    return null;
  } catch (error) {
    logger.error('Failed to load local MLP model', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

const LOCAL_MODEL_FILE = 'dgs_model.npz';

async function loadDocumentDirectoryModel(): Promise<string | null> {
  const { documentDirectory } = FileSystem;
  if (!documentDirectory) {
    return null;
  }

  const modelUri = `${documentDirectory}${LOCAL_MODEL_FILE}`;
  try {
    const info = await FileSystem.getInfoAsync(modelUri, { size: true });
    if (!info.exists || info.isDirectory) {
      return null;
    }
    if (info.size === 0) {
      return null;
    }
    const data = await FileSystem.readAsStringAsync(modelUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (data && data.length > 0) {
      logger.info('Loaded local MLP model from document directory');
      return data;
    }
  } catch (error) {
    logger.warn('Unable to read MLP model from document directory', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return null;
}

async function loadBundledFallbackModel(): Promise<string | null> {
  try {
    const asset = Asset.fromModule(require('../../assets/dgs_model.npz'));
    if (!asset.localUri) {
      await asset.downloadAsync();
    }

    const uri = asset.localUri;
    if (!uri) {
      return null;
    }

    const data = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return data && data.length > 0 ? data : null;
  } catch (error) {
    logger.error('Failed to load bundled fallback MLP model', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
