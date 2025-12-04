export type MlpModelMeta = {
  version?: string | null;
  source: 'profile' | 'global';
  profileId?: string | null;
};

export type MlpModelResponse = {
  b64: string;
  meta: MlpModelMeta;
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

  const source = sourceHeader === 'profile' || sourceHeader === 'global' ? sourceHeader : fallbackSource;
  const normalizedProfile = profileHeader?.trim() || (source === 'profile' ? profileId ?? null : null);

  return {
    source,
    version: version ?? null,
    profileId: normalizedProfile,
  };
}

async function fetchModel(
  endpoint: string,
  token: string | undefined,
  profileId?: string,
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

  let response: Response;
  try {
    response = await fetch(url.toString(), { headers });
  } catch (error) {
    console.warn('[MLP] Netzwerkfehler beim Laden des Modells', {
      url: url.toString(),
      profileId,
      error,
    });
    return null;
  }

  if (!response.ok) {
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
    const personalized = await fetchModel(endpoint, token, trimmedProfile);
    if (personalized) {
      console.info('[MLP] Personalisiertes Modell geladen', {
        profileId: personalized.meta.profileId ?? trimmedProfile,
        version: personalized.meta.version ?? 'unbekannt',
      });
      emitMlpModelUpdated(personalized.meta);
      return personalized;
    }
    console.warn('[MLP] Personalisierte Gewichte nicht verfügbar, wechsle auf globales Modell', {
      profileId: trimmedProfile,
    });
  }

  const globalModel = await fetchModel(endpoint, token);
  if (globalModel) {
    console.info('[MLP] Globales Modell geladen', {
      version: globalModel.meta.version ?? 'unbekannt',
    });
    emitMlpModelUpdated(globalModel.meta);
    return globalModel;
  }

  return null;
}

/**
 * Convenience function for integration tests and simple usage.
 * Fetches MLP model using environment variables for configuration.
 */
export async function fetchMlpModel(profileId?: string): Promise<string | null> {
  const endpoint = process.env.EXPO_PUBLIC_API_URL
    ? `${process.env.EXPO_PUBLIC_API_URL}/latest-mlp-model`
    : '';
  const token = process.env.EXPO_PUBLIC_API_TOKEN;

  if (!endpoint) {
    console.warn('[MLP] No API URL configured');
    return null;
  }

  const result = await fetchMlpModelWithFallback({ endpoint, token, profileId });
  return result?.b64 ?? null;
}

/**
 * Get cached MLP model (stub for integration tests).
 * In production, this would return cached model data.
 */
export async function getCachedMlpModel(profileId?: string): Promise<string | null> {
  // For integration tests, just fetch fresh
  return fetchMlpModel(profileId);
}
