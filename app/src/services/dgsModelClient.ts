import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system/legacy';
import { logger } from '../utils/logger';

const getApiUrl = () => process.env['EXPO_PUBLIC_API_URL'] || 'http://localhost:5000';
const getApiToken = () => process.env['EXPO_PUBLIC_API_TOKEN'] || 'demo-token';

const KEY = 'dgsCentroids';
const MLP_KEY = 'dgsMlpModel';
const MLP_META_KEY = 'dgsMlpModelMeta';

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
    console.error('Failed to fetch MLP model:', error);
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

/**
 * Load MLP model from local files as fallback when API is unavailable
 */
export async function loadLocalMlpModel(): Promise<string | null> {
  try {
    // Try to load from the app data directory (for development/testing)
    try {
      console.log('Trying react-native-fs for model loading...');
      const fs = require('react-native-fs');

      // Try different possible paths for the model file
      const possiblePaths = [
        fs.MainBundlePath + '/data/amy_model.npz',
        fs.DocumentDirectoryPath + '/amy_model.npz',
        '/data/amy_model.npz', // Absolute path for development
      ];

      console.log('Available paths:', possiblePaths);

      for (const modelPath of possiblePaths) {
        try {
          console.log(`Checking path: ${modelPath}`);
          const exists = await fs.exists(modelPath);
          console.log(`Path ${modelPath} exists:`, exists);

          if (exists) {
            const modelData = await fs.readFile(modelPath, 'base64');
            if (modelData && modelData.length > 0) {
              console.log(`Loaded MLP model from ${modelPath}, size: ${modelData.length} bytes`);
              return modelData;
            } else {
              console.warn(`Model data from ${modelPath} is empty`);
            }
          }
        } catch (pathError) {
          console.warn(`Failed to load from ${modelPath}:`, (pathError as Error).message);
          // Continue to next path
          continue;
        }
      }
    } catch (fsError) {
      console.warn('react-native-fs not available, trying Expo FileSystem', fsError);
    }

    // Try Expo FileSystem as fallback
    try {
      console.log('Trying Expo FileSystem for model loading...');

      // Log available directories for debugging
      console.log('Document directory:', FileSystem.documentDirectory);
      console.log('Bundle directory:', FileSystem.bundleDirectory);

      // First, try to copy the model from assets to document directory if it doesn't exist
      const docModelUri = FileSystem.documentDirectory + 'amy_model.npz';
      let modelInfo = await FileSystem.getInfoAsync(docModelUri);
      console.log('Document directory model exists:', modelInfo.exists, 'size:', modelInfo.exists ? (modelInfo as any).size : 0);

      if (!modelInfo.exists) {
        try {
          // Try to copy from the bundle assets (for production)
          const bundleUri = FileSystem.bundleDirectory + 'data/amy_model.npz';
          console.log('Attempting to copy from bundle assets:', bundleUri);

          await FileSystem.copyAsync({
            from: bundleUri,
            to: docModelUri
          });

          console.log('Successfully copied model from bundle to document directory');
          modelInfo = await FileSystem.getInfoAsync(docModelUri);
          console.log('After copy - model exists:', modelInfo.exists, 'size:', modelInfo.exists ? (modelInfo as any).size : 0);
        } catch (bundleError) {
          console.warn('Failed to copy model from bundle:', bundleError);
          try {
            // Try to copy from the project data directory (for development)
            const sourceUri = '/home/lars/PhpstormProjects/AmysEcho/data/amy_model.npz';
            console.log('Attempting to copy from project data directory:', sourceUri);

            await FileSystem.copyAsync({
              from: sourceUri,
              to: docModelUri
            });

            console.log('Successfully copied model to document directory');
            modelInfo = await FileSystem.getInfoAsync(docModelUri);
            console.log('After copy - model exists:', modelInfo.exists, 'size:', modelInfo.exists ? (modelInfo as any).size : 0);
          } catch (copyError) {
            console.warn('Failed to copy model from project directory:', copyError);
          }
        }
      }

      if (modelInfo.exists && modelInfo.size > 0) {
        console.log(`Loading MLP model from document directory: ${docModelUri}, size: ${modelInfo.size} bytes`);
        const modelData = await FileSystem.readAsStringAsync(docModelUri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        if (modelData && modelData.length > 0) {
          console.log('Successfully loaded MLP model from document directory, data length:', modelData.length);
          return modelData;
        } else {
          console.warn('Model data from document directory is empty or invalid');
        }
      } else {
        console.warn('Model file not found in document directory or has invalid size');
      }
    } catch (expoError) {
      console.warn('Expo FileSystem fallback failed:', expoError);
    }

    // Fallback: Try to load bundled base64 model
    try {
      console.log('Trying to load bundled base64 model...');
      // For now, return a placeholder - we'll implement proper bundling
      console.log('Bundled model loading not yet implemented');
    } catch (bundleError) {
      console.warn('Bundled model loading failed:', bundleError);
    }

    // For development: Try to load from the app data directory
    try {
      const fs = require('react-native-fs');
      const appModelPath = '/data/amy_model.npz';
      if (await fs.exists(appModelPath)) {
        const modelData = await fs.readFile(appModelPath, 'base64');
        if (modelData && modelData.length > 0) {
          console.log('Loaded MLP model from app data directory');
          return modelData;
        }
      }
    } catch (projectError) {
      console.warn('Could not load from app data directory', projectError);
    }

    // Last resort: Return null - gesture detection will rely on MediaPipe only
    console.warn('No local MLP model available, gesture detection will rely on MediaPipe only');
    return null;

  } catch (error) {
    console.error('Failed to load local MLP model', error);
    return null;
  }
}
