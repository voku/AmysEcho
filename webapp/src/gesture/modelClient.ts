import { HttpError, SESSION_EXPIRED_MESSAGE } from '../utils/http';
import { getCachedModel, saveCachedModel } from './modelStorage';

export type MlpModelMeta = {
  version?: string | null;
  source: 'profile' | 'global';
  profileId?: string | null;
  etag?: string | null;
  contractStatus?: 'missing' | 'invalid' | 'valid' | null;
  contractReason?: string | null;
  featureMode?: 'absolute' | 'relative_delta' | null;
};

export type MlpModelResponse = {
  b64: string;
  meta: MlpModelMeta;
  notModified?: boolean;
};

// Event-based model update notifications (domain-driven pattern)
type MlpModelListener = (meta: MlpModelMeta) => void;
const mlpModelListeners = new Set<MlpModelListener>();

/**
 * Subscribe to model update events. Returns an unsubscribe function.
 * This follows the domain-driven observer pattern used in the app.
 */
export function onMlpModelUpdated(listener: MlpModelListener): () => void {
  mlpModelListeners.add(listener);
  return () => mlpModelListeners.delete(listener);
}

function emitMlpModelUpdated(meta: MlpModelMeta): void {
  mlpModelListeners.forEach((listener) => {
    try {
      listener(meta);
    } catch {
      // Ignore listener errors to prevent cascading failures
    }
  });
}

function isRelativeDeltaModelEnabled(): boolean {
  return import.meta.env['VITE_ENABLE_RELATIVE_DELTA_MODEL'] === '1';
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK_SIZE = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const slice = bytes.subarray(i, i + CHUNK_SIZE);
    chunks.push(String.fromCharCode.apply(null, slice as unknown as number[]));
  }
  return btoa(chunks.join(''));
}

function parseMeta(resp: Response, fallbackSource: MlpModelMeta['source'], profileId?: string): MlpModelMeta {
  const version = resp.headers.get('X-Model-Version');
  const sourceHeader = resp.headers.get('X-Model-Source');
  const profileHeader = resp.headers.get('X-Model-Profile');
  const etag = resp.headers.get('ETag');
  const contractStatusHeader = resp.headers.get('X-Model-Contract-Status');
  const contractReason = resp.headers.get('X-Model-Contract-Reason');
  const featureModeHeader = resp.headers.get('X-Model-Feature-Mode');

  const source = sourceHeader === 'profile' || sourceHeader === 'global' ? sourceHeader : fallbackSource;
  const normalizedProfile = profileHeader?.trim() || (source === 'profile' ? profileId ?? null : null);
  const contractStatus =
    contractStatusHeader === 'missing' || contractStatusHeader === 'invalid' || contractStatusHeader === 'valid'
      ? contractStatusHeader
      : null;
  const featureMode =
    featureModeHeader === 'absolute' || featureModeHeader === 'relative_delta'
      ? featureModeHeader
      : null;

  return {
    source,
    version: version ?? null,
    profileId: normalizedProfile,
    etag: etag ?? null,
    contractStatus,
    contractReason: contractReason ?? null,
    featureMode,
  };
}

async function fetchModel(
  endpoint: string,
  token: string | undefined,
  profileId?: string,
  ifNoneMatch?: string | null,
): Promise<MlpModelResponse | null> {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch (error) {
    console.warn('[MLP] Ungültige Endpoint-URL', { endpoint, error });
    return null;
  }
  if (profileId) {
    url.searchParams.set('profileId', profileId);
  }

  const headers: Record<string, string> = {
    Accept: 'application/octet-stream',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (profileId) {
    headers['X-Profile-Id'] = profileId;
  }

  if (ifNoneMatch) {
    headers['If-None-Match'] = ifNoneMatch;
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), { headers });
  } catch (error) {
    console.warn('[MLP] Netzwerkfehler beim Laden des Modells', {
      url: url.toString(),
      profileId,
      error,
    });
    // Return null to allow fallback to cache
    return null;
  }

  if (response.status === 304) {
    return { b64: '', meta: {} as any, notModified: true };
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new HttpError(401, SESSION_EXPIRED_MESSAGE);
    }
    if (response.status !== 404 || !profileId) {
      console.warn('[MLP] Modell konnte nicht geladen werden', {
        url: url.toString(),
        status: response.status,
        statusText: response.statusText,
        profileId,
      });
    }
    return null;
  }

  const buffer = await response.arrayBuffer();
  const meta = parseMeta(response, profileId ? 'profile' : 'global', profileId);
  if (meta.contractStatus === 'invalid') {
    console.warn('[MLP] Server meldet ungültigen Modellvertrag, verwerfe Antwort', {
      url: url.toString(),
      profileId,
      source: meta.source,
      reason: meta.contractReason,
    });
    return null;
  }
  if (meta.featureMode === 'relative_delta' && !isRelativeDeltaModelEnabled()) {
    console.warn('[MLP] Relative Delta Feature-Modus wird im Web-Client noch nicht unterstützt, verwerfe Antwort', {
      url: url.toString(),
      profileId,
      source: meta.source,
      featureMode: meta.featureMode,
    });
    return null;
  }
  return {
    b64: arrayBufferToBase64(buffer),
    meta,
  };
}

export async function fetchMlpModelWithFallback({
  endpoint,
  token,
  profileId,
}: {
  endpoint: string;
  token?: string;
  profileId?: string;
}): Promise<MlpModelResponse | null> {
  const trimmedProfile = profileId?.trim();

  if (trimmedProfile) {
    const cached = await getCachedModel(trimmedProfile);
    const personalized = await fetchModel(endpoint, token, trimmedProfile, cached?.meta?.etag);
    
    if (personalized?.notModified && cached) {
      console.info('[MLP] Profil-Modell unverändert (304), nutze Cache', { profileId: trimmedProfile });
      emitMlpModelUpdated(cached.meta);
      return cached as MlpModelResponse;
    }

    if (personalized && !personalized.notModified) {
      if (personalized.meta.source === 'profile') {
        console.info('[MLP] Personalisiertes Modell geladen', {
          profileId: personalized.meta.profileId ?? trimmedProfile,
          version: personalized.meta.version ?? 'unbekannt',
          source: personalized.meta.source,
        });
        // Cache successful profile model
        void saveCachedModel(trimmedProfile, personalized);
      } else {
        console.warn('[MLP] Profil-Modell angefragt, Server lieferte globales Modell', {
          requestedProfileId: trimmedProfile,
          returnedSource: personalized.meta.source,
          version: personalized.meta.version ?? 'unbekannt',
        });
      }
      emitMlpModelUpdated(personalized.meta);
      return personalized;
    }

    // Attempt to load from cache if offline or 404
    if (cached) {
      console.info('[MLP] Fallback auf gespeichertes Profil-Modell', {
        profileId: trimmedProfile,
        version: cached.meta.version,
      });
      emitMlpModelUpdated(cached.meta);
      return cached as MlpModelResponse;
    }

    console.warn('[MLP] Personalisierte Gewichte nicht verfügbar, wechsle auf globales Modell', {
      profileId: trimmedProfile,
    });
  }

  const cachedGlobal = await getCachedModel('global');
  const globalModel = await fetchModel(endpoint, token, undefined, cachedGlobal?.meta?.etag);

  if (globalModel?.notModified && cachedGlobal) {
    console.info('[MLP] Globales Modell unverändert (304), nutze Cache');
    emitMlpModelUpdated(cachedGlobal.meta);
    return cachedGlobal as MlpModelResponse;
  }

  if (globalModel && !globalModel.notModified) {
    console.info('[MLP] Globales Modell geladen', {
      version: globalModel.meta.version ?? 'unbekannt',
    });
    // Cache successful global model
    void saveCachedModel('global', globalModel);
    emitMlpModelUpdated(globalModel.meta);
    return globalModel;
  }

  // Final fallback: global cache
  if (cachedGlobal) {
    console.info('[MLP] Fallback auf gespeichertes globales Modell', {
      version: cachedGlobal.meta.version,
    });
    emitMlpModelUpdated(cachedGlobal.meta);
    return cachedGlobal as MlpModelResponse;
  }

  return null;
}

/**
 * Convenience function for integration tests and simple usage.
 * Fetches MLP model using environment variables for configuration.
 */
export async function fetchMlpModel(profileId?: string): Promise<string | null> {
  const endpoint = process.env['EXPO_PUBLIC_API_URL']
    ? `${process.env['EXPO_PUBLIC_API_URL']}/api/v1/models/latest`
    : '';
  const token = process.env['EXPO_PUBLIC_API_TOKEN'] || undefined;

  if (!endpoint) {
    console.warn('[MLP] No API URL configured');
    return null;
  }

  const result = await fetchMlpModelWithFallback({ 
    endpoint, 
    ...(token ? { token } : {}),
    ...(profileId ? { profileId } : {})
  });
  return result?.b64 ?? null;
}

/**
 * Get cached MLP model from persistent storage.
 */
export async function getCachedMlpModel(profileId?: string): Promise<string | null> {
  const cached = await getCachedModel(profileId ?? 'global');
  return cached?.b64 ?? null;
}
