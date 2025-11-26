export type MlpModelMeta = {
  version?: string | null;
  source: 'profile' | 'global';
  profileId?: string | null;
};

export type MlpModelResponse = {
  b64: string;
  meta: MlpModelMeta;
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
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
  const url = new URL(endpoint);
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

  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
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
    return globalModel;
  }

  return null;
}
